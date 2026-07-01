#!/usr/bin/env bash
# scripts/narrative-truth-gate.sh — CCATO Tier-1 claim-truth re-probe engine
#
# CCATO = Claim Contradicts Authorized Tool Output: an agent asserts absence/unavailability
# of a dimension its own authorized tools would populate, while the tool returns non-null data.
#
# Usage:
#   bash scripts/narrative-truth-gate.sh <post-body-file|-> <agent_id> [cache-json-file]
#
# Args:
#   $1  post-body-file   path to the composed narrative body, or "-" for stdin (required)
#   $2  agent_id         producing agent, for signal attribution (required)
#   $3  cache-json-file  optional pre-fetched working-memory tool cache:
#                        { "<TICKER>": { "<dimension_id>": <any non-null value> }, ... }
#                        A non-null cache hit short-circuits the live re-probe for that
#                        (ticker, dimension) pair (performance optimisation only — the LIVE
#                        gateway re-probe is always the authoritative path when cache is absent
#                        or misses).
#
# Exit codes:
#   0  = PASS — no CCATO contradiction detected (or nothing to check)
#   1  = FAIL — >=1 contradiction detected (report printed as [FAIL] lines above)
#   2  = usage / config error (missing args, missing claim-tool-map.json, unreadable post file)
#
# GENERIC MANDATE: every negation phrase, dimension->tool routing, tool argument shape, and
# tool no-data marker is read from docs/data/claim-tool-map.json at runtime. This script
# contains ZERO hardcoded lexicon entries, tool names, or ticker symbols — see claim-tool-map.json
# ._meta for the full extension contract.
#
# LIVE RE-PROBE: every candidate claim is verified via the MCP gateway using the SAME wire
# protocol as `mcp__gateway__call_tool(server="vn-market", tool=<dimension.tool>, arguments=...)` —
# implemented here as a direct MCP streamable-HTTP JSON-RPC client (initialize -> tools/call
# name="call_tool") against the gateway service, because this script is plain bash/python and has
# no native agent tool-call surface. NEVER calls any vn-market internal implementation directly.
#
# SIGNAL EMIT ON FAIL: appends a narrative_contradiction row to .signal_queue.rows[] via
# scripts/orch-apply.sh (LIVE SignalRowSchema: id/summary/severity/status/from/to/ts/type — the
# live schema keys the row type on `type`, NOT `signal_type`; see docs/data/orch/orch-state.json
# sprint_goal.entries[] "NARRATIVE-TRUTH-CCATO-GATE".po_determination_signal_type).
# Set NTG_SKIP_SIGNAL_EMIT=1 to suppress the write (iterative local testing only).
#
# Spec: docs/architecture-briefs/2026-06-30-narrative-quality-ccato-gate.md S4.1-4.4
# Pointer: docs/policies/dev-standards.md § Script Persistence

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

CLAIM_MAP="${CLAIM_MAP:-$REPO_ROOT/docs/data/claim-tool-map.json}"
ORCH_STATE="${ORCH_STATE:-$REPO_ROOT/docs/data/orch/orch-state.json}"
ORCH_APPLY="${ORCH_APPLY:-$REPO_ROOT/scripts/orch-apply.sh}"
MCP_GATEWAY_URL="${MCP_GATEWAY_URL:-http://127.0.0.1:4040/}"
NTG_HTTP_TIMEOUT="${NTG_HTTP_TIMEOUT:-20}"

# ── Args ──────────────────────────────────────────────────────────────────────
POST_FILE_ARG="${1:-}"
AGENT_ID="${2:-}"
CACHE_FILE="${3:-}"

if [[ -z "$POST_FILE_ARG" || -z "$AGENT_ID" ]]; then
  echo "Usage: $0 <post-body-file|-> <agent_id> [cache-json-file]" >&2
  exit 2
fi

if [[ ! -f "$CLAIM_MAP" ]]; then
  echo "[FATAL] narrative-truth-gate: claim-tool-map.json not found at $CLAIM_MAP" >&2
  exit 2
fi

CLEANUP_STDIN_TMP=""
VERDICT_OUT="$(mktemp "${TMPDIR:-/tmp}/ntg-verdict-XXXXXX.json")"

cleanup() {
  set +e
  [[ -n "$CLEANUP_STDIN_TMP" && -f "$CLEANUP_STDIN_TMP" ]] && rm -f "$CLEANUP_STDIN_TMP"
  [[ -f "$VERDICT_OUT" ]] && rm -f "$VERDICT_OUT"
}
trap cleanup EXIT

if [[ "$POST_FILE_ARG" == "-" ]]; then
  CLEANUP_STDIN_TMP="$(mktemp "${TMPDIR:-/tmp}/ntg-stdin-XXXXXX.txt")"
  cat > "$CLEANUP_STDIN_TMP"
  POST_FILE_RESOLVED="$CLEANUP_STDIN_TMP"
else
  POST_FILE_RESOLVED="$POST_FILE_ARG"
  if [[ ! -f "$POST_FILE_RESOLVED" ]]; then
    echo "[FATAL] narrative-truth-gate: post body file not found: $POST_FILE_RESOLVED" >&2
    exit 2
  fi
fi

# ── Core detection + live re-probe engine (python3) ────────────────────────────
# All lexicon / dimension / tool / arg-shape / null-marker / non-ticker data is read from
# $CLAIM_MAP at runtime (argv[4]) — no such value is a literal in this heredoc.
set +e
python3 - "$POST_FILE_RESOLVED" "$AGENT_ID" "$CACHE_FILE" "$CLAIM_MAP" \
         "$MCP_GATEWAY_URL" "$VERDICT_OUT" "$NTG_HTTP_TIMEOUT" <<'PYEOF'
import sys, os, re, json, datetime
import urllib.request, urllib.error

POST_FILE, AGENT_ID, CACHE_FILE, CLAIM_MAP_PATH, \
    GATEWAY_URL, VERDICT_OUT, HTTP_TIMEOUT = sys.argv[1:8]
HTTP_TIMEOUT = float(HTTP_TIMEOUT)

# ── Load SSOT: claim-tool-map.json (negation lexicon + dimension routing + arg shapes) ──
try:
    with open(CLAIM_MAP_PATH, encoding="utf-8") as f:
        claim_map = json.load(f)
except Exception as e:
    print(f"[FATAL] narrative-truth-gate: cannot load {CLAIM_MAP_PATH}: {e}", file=sys.stderr)
    sys.exit(2)

negation_lexicon = claim_map.get("negation_lexicon", [])
tool_null_markers = claim_map.get("tool_null_markers", [])
non_ticker_tokens = set(t.upper() for t in claim_map.get("non_ticker_tokens", []))
dimensions = claim_map.get("dimensions", [])

if not negation_lexicon or not dimensions:
    print("[FATAL] narrative-truth-gate: claim-tool-map.json missing negation_lexicon or dimensions", file=sys.stderr)
    sys.exit(2)

# ── Load optional working-memory cache (brief S4.3 step 5 — perf short-circuit only) ──
cache = {}
if CACHE_FILE and os.path.isfile(CACHE_FILE):
    try:
        with open(CACHE_FILE, encoding="utf-8") as f:
            cache = json.load(f)
    except Exception as e:
        print(f"[WARN] narrative-truth-gate: cannot load cache file {CACHE_FILE}: {e} — ignoring cache", file=sys.stderr)

# ── Read post body ──────────────────────────────────────────────────────────────
try:
    with open(POST_FILE, encoding="utf-8") as f:
        body = f.read()
except Exception as e:
    print(f"[FATAL] narrative-truth-gate: cannot read post body {POST_FILE}: {e}", file=sys.stderr)
    sys.exit(2)

if not body.strip():
    print("[FATAL] narrative-truth-gate: post body is empty", file=sys.stderr)
    sys.exit(2)

# ── Ticker extraction: VN-ticker regex [A-Z]{2,4}, excluding non_ticker_tokens (S4.3 step 3) ──
TICKER_PAT = re.compile(r'\b([A-Z]{2,4})\b')

def find_tickers(text):
    out = []
    for m in TICKER_PAT.finditer(text):
        t = m.group(1)
        if t in non_ticker_tokens:
            continue
        if t not in out:
            out.append(t)
    return out

whole_post_tickers = find_tickers(body)  # first-seen order, document-wide

paragraphs = [p for p in re.split(r'\n\s*\n', body) if p.strip()]

def sentence_split(paragraph):
    parts = re.split(r'(?<=[.!?])\s+', paragraph.strip())
    return [p for p in parts if p.strip()]

# ── MCP gateway client (raw streamable-HTTP JSON-RPC — this script has no native
#    agent tool-call surface, so it speaks the same wire protocol call_tool() uses) ──
_session_id = [None]
_req_id = [10]

def _post(payload, session_id=None):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(GATEWAY_URL, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json, text/event-stream")
    if session_id:
        req.add_header("Mcp-Session-Id", session_id)
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
        sid = resp.headers.get("Mcp-Session-Id")
        raw = resp.read().decode("utf-8")
    for line in raw.splitlines():
        if line.startswith("data:"):
            return json.loads(line[len("data:"):].strip()), sid
    if raw.strip():
        return json.loads(raw), sid
    return {}, sid

def mcp_session():
    if _session_id[0]:
        return _session_id[0]
    init_payload = {
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05", "capabilities": {},
            "clientInfo": {"name": "narrative-truth-gate", "version": claim_map.get("version", "1")},
        },
    }
    _resp, sid = _post(init_payload)
    _session_id[0] = sid
    try:
        _post({"jsonrpc": "2.0", "method": "notifications/initialized"}, session_id=sid)
    except Exception:
        pass
    return sid

def call_tool(server, tool, arguments):
    """NEVER calls mcp__vn-market__* directly — always via gateway call_tool(server, tool, args)."""
    sid = mcp_session()
    _req_id[0] += 1
    payload = {
        "jsonrpc": "2.0", "id": _req_id[0], "method": "tools/call",
        "params": {"name": "call_tool", "arguments": {"server": server, "tool": tool, "arguments": arguments}},
    }
    resp, _ = _post(payload, session_id=sid)
    result = resp.get("result", {})
    if result.get("isError"):
        content = result.get("content", [{}])
        msg = content[0].get("text", "tool error") if content else "tool error"
        return {"_probe_error": msg}
    content = result.get("content", [{}])
    text = content[0].get("text", "") if content else ""
    try:
        return json.loads(text)
    except Exception:
        return {"text": text}

# ── Argument builder — generic dispatch on claim-tool-map.json's arg_style field.
#    No tool name / ticker literal appears in this function; only the 4 structural
#    shape identifiers documented in claim-tool-map.json _meta.arg_style_values. ──
def build_arguments(dim, ticker):
    style = dim.get("arg_style", "ticker_code")
    if style == "ticker_codes_array":
        return {"codes": [ticker]}
    if style == "no_ticker":
        return {}
    if style == "ticker_actionCode_yoy":
        today = datetime.datetime.now(datetime.timezone.utc)
        q = (today.month - 1) // 3  # index of the latest FULLY-ELAPSED quarter
        if q == 0:
            year1, quarter1 = today.year - 1, "Q4"
        else:
            year1, quarter1 = today.year, f"Q{q}"
        year2 = year1 - 1
        return {
            "actionCode": ticker,
            "period1": {"year": year1, "quarter": quarter1},
            "period2": {"year": year2, "quarter": quarter1},
        }
    # default / "ticker_code"
    return {"code": ticker}

# ── Response classification: non-null/non-empty => NON_NULL (contradiction);
#    matches a tool_null_marker (SSOT) => NULL (honest gap); probe error => ERROR. ──
def flatten_text(resp_obj):
    if isinstance(resp_obj, dict):
        parts = []
        for v in resp_obj.values():
            parts.append(v if isinstance(v, str) else json.dumps(v, ensure_ascii=False))
        return " | ".join(parts)
    return json.dumps(resp_obj, ensure_ascii=False)

def classify(resp_obj):
    if resp_obj is None:
        return "ERROR"
    if isinstance(resp_obj, dict) and "_probe_error" in resp_obj:
        return "ERROR"
    text = flatten_text(resp_obj) or ""
    if not text.strip():
        return "NULL"
    lowered = text.lower()
    for marker in tool_null_markers:
        if marker.lower() in lowered:
            return "NULL"
    return "NON_NULL"

def summarize(resp_obj, max_len=220):
    text = flatten_text(resp_obj) or ""
    text = " ".join(text.split())
    return text[:max_len]

# ── Step 1-3 (brief S4.3): scan sentences for negation-lexicon matches, anchor
#    dimension keyword to the SAME sentence, resolve ticker from the enclosing
#    paragraph (falling back to the first ticker in the whole post). ──
candidates = []
seen_para_dim = set()

for p_idx, paragraph in enumerate(paragraphs):
    for sentence in sentence_split(paragraph):
        sent_lower = sentence.lower()
        matched_negations = [n for n in negation_lexicon if n.lower() in sent_lower]
        if not matched_negations:
            continue
        for dim in dimensions:
            dim_id = dim["id"]
            key = (p_idx, dim_id)
            if key in seen_para_dim:
                continue
            keywords = dim.get("keywords", [])
            if not any(kw.lower() in sent_lower for kw in keywords):
                continue
            seen_para_dim.add(key)

            requires_ticker = dim.get("requires_ticker", True)
            para_tickers = find_tickers(paragraph)
            if requires_ticker:
                ticker = para_tickers[0] if para_tickers else (whole_post_tickers[0] if whole_post_tickers else None)
                ticker_or_dim = ticker if ticker else dim_id
            else:
                # Claim-side identifier is the dimension key (brief S4.3 step 3), but the
                # underlying tool call still needs a concrete probe ticker — resolved as the
                # first ticker mentioned anywhere in the whole post (document order).
                ticker = whole_post_tickers[0] if whole_post_tickers else None
                ticker_or_dim = dim_id

            if ticker is None:
                print(f"[WARN] narrative-truth-gate: dimension={dim_id} matched negation "
                      f"{matched_negations[0]!r} but no ticker found in post body to probe "
                      f"{dim['tool']} — skipping (cannot verify)", file=sys.stderr)
                continue

            candidates.append({
                "dim": dim, "ticker": ticker, "ticker_or_dim": ticker_or_dim,
                "claim_text": sentence.strip(), "matched_negation": matched_negations[0],
            })

if not candidates:
    print("[INFO] narrative-truth-gate: no negation-lexicon matches found — nothing to re-probe")
    with open(VERDICT_OUT, "w", encoding="utf-8") as f:
        json.dump([], f)
    sys.exit(0)

# ── Step 4-6 (brief S4.3): live gateway re-probe + verdict per candidate ──
verdicts = []
fail_count = 0

for c in candidates:
    dim = c["dim"]
    ticker = c["ticker"]

    cache_hit = cache.get(ticker, {}).get(dim["id"]) if cache else None
    if cache_hit is not None:
        resp_obj = cache_hit if isinstance(cache_hit, dict) else {"text": str(cache_hit)}
        source = "cache"
    else:
        args = build_arguments(dim, ticker)
        try:
            resp_obj = call_tool("vn-market", dim["tool"], args)
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            resp_obj = {"_probe_error": str(e)}
        source = "live"

    verdict_class = classify(resp_obj)
    summary = summarize(resp_obj)

    if verdict_class == "NON_NULL":
        result = "FAIL"
        fail_count += 1
    elif verdict_class == "NULL":
        result = "PASS"
    else:
        result = "WARN"

    entry = {
        "dimension": dim["id"], "tool": dim["tool"], "ticker_or_dim": c["ticker_or_dim"],
        "probe_ticker": ticker, "claim_text": c["claim_text"], "matched_negation": c["matched_negation"],
        "source": source, "classification": verdict_class, "result": result,
        "returned_summary": summary,
    }
    verdicts.append(entry)

    if result == "FAIL":
        print(f"[FAIL] dimension={entry['dimension']} tool={entry['tool']} ticker={entry['ticker_or_dim']} "
              f"claim=\"{entry['claim_text']}\" returned=\"{entry['returned_summary']}\"")
    elif result == "PASS":
        print(f"[PASS] dimension={entry['dimension']} tool={entry['tool']} ticker={entry['ticker_or_dim']} "
              f"— honest no-data confirmed: \"{entry['returned_summary']}\"")
    else:
        print(f"[WARN] narrative-truth-gate: dimension={entry['dimension']} tool={entry['tool']} "
              f"ticker={entry['ticker_or_dim']} — probe inconclusive: {entry['returned_summary']}", file=sys.stderr)

with open(VERDICT_OUT, "w", encoding="utf-8") as f:
    json.dump(verdicts, f, ensure_ascii=False, indent=2)

if fail_count > 0:
    print(f"[BLOCK] narrative-truth-gate: {fail_count} CCATO contradiction(s) — see [FAIL] lines above")
    sys.exit(1)

print("[PASS] narrative-truth-gate: 0 contradictions")
sys.exit(0)
PYEOF
PY_RC=$?
set -e

if [[ $PY_RC -eq 2 ]]; then
  exit 2
fi

# ── Signal emit on FAIL (brief S4.3 step 9 + S4.5): append narrative_contradiction
#    row(s) to .signal_queue.rows[] via scripts/orch-apply.sh — LIVE SignalRowSchema
#    field `type` (NOT signal_type). ──
if [[ $PY_RC -eq 1 && "${NTG_SKIP_SIGNAL_EMIT:-0}" != "1" ]]; then
  NEWROWS=$(python3 - "$VERDICT_OUT" "$AGENT_ID" <<'PYEOF'
import json, sys, uuid, datetime

verdict_path, agent_id = sys.argv[1], sys.argv[2]
with open(verdict_path, encoding="utf-8") as f:
    verdicts = json.load(f)

now_iso = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
today = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
now_compact = now_iso.replace(":", "").replace("-", "")

rows = []
for v in verdicts:
    if v["result"] != "FAIL":
        continue
    rid = f"ntg-{now_compact}-{v['dimension']}-{v['ticker_or_dim']}-{uuid.uuid4().hex[:6]}"
    rows.append({
        "id": rid,
        "ts": now_iso,
        "from": agent_id,
        "to": "po",
        "type": "narrative_contradiction",
        "summary": (f"CCATO: {agent_id} claimed absence of {v['dimension']} data for "
                    f"{v['ticker_or_dim']} but {v['tool']} returned non-null data"),
        "severity": "MED",
        "status": "NEW",
        "payload": {
            "agent_id": agent_id,
            "claim": v["claim_text"],
            "tool": v["tool"],
            "ticker": v["ticker_or_dim"],
            "probe_ticker": v["probe_ticker"],
            "returned_value": v["returned_summary"],
            "cycle": today,
            "gate_version": "1",
        },
    })

print(json.dumps(rows))
PYEOF
)

  if [[ -n "$NEWROWS" && "$NEWROWS" != "[]" ]]; then
    NOW_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    if jq --argjson newrows "$NEWROWS" --arg now "$NOW_ISO" --arg who "narrative-truth-gate" \
         '.signal_queue.rows += $newrows | .signal_queue._updated_at = $now | .signal_queue._updated_by = $who' \
         "$ORCH_STATE" | bash "$ORCH_APPLY"; then
      echo "[INFO] narrative-truth-gate: narrative_contradiction signal(s) appended to .signal_queue.rows via orch-apply.sh"
    else
      echo "[WARN] narrative-truth-gate: orch-apply.sh signal emit failed — contradiction still reported above, signal_queue NOT updated" >&2
    fi
  fi
fi

exit $PY_RC
