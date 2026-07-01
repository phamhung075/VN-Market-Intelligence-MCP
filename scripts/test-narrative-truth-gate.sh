#!/usr/bin/env bash
# scripts/test-narrative-truth-gate.sh — DoD harness for the CCATO Tier-1 truth gate
#
# RAW-proves all four Definition-of-Done assertions from
# docs/architecture-briefs/2026-06-30-narrative-quality-ccato-gate.md §9:
#   (a) docs/social/fb-post-2026-06-30.md VNM TA absence-claim -> get_technical_indicators(VNM)
#       non-null -> exit!=0 naming VNM + a technical-indicator token
#   (b) same post's foreign-flow-absence line -> get_foreign_flow per-ticker non-null -> exit!=0
#   (c) genuine honest-NULL response (live ticker with insufficient OHLCV depth) -> exit 0 (PASS,
#       no false-positive)
#   (d) identical input body -> identical verdict set + exit code across repeated runs
#
# Plus a Step 0 pre-flight: every tool name referenced in docs/data/claim-tool-map.json resolves
# on the live MCP gateway's vn-market tool catalog (no phantom tool names).
#
# Usage: bash scripts/test-narrative-truth-gate.sh
# Exit codes: 0 = all assertions PASS ; 1 = >=1 assertion FAILED
#
# NOTE: assertions (a)/(b) exercise the gate's real FAIL path, which — by design — appends a
# narrative_contradiction row to .signal_queue.rows[] via scripts/orch-apply.sh (this IS the
# gate's documented runtime behavior; see verification_gate note in the CCATO-T1 task card).
# The determinism re-run (d) uses NTG_SKIP_SIGNAL_EMIT=1 to avoid a redundant duplicate write.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GATE="$REPO_ROOT/scripts/narrative-truth-gate.sh"
CLAIM_MAP="${CLAIM_MAP:-$REPO_ROOT/docs/data/claim-tool-map.json}"
MCP_GATEWAY_URL="${MCP_GATEWAY_URL:-http://127.0.0.1:4040/}"
FB_POST="$REPO_ROOT/docs/social/fb-post-2026-06-30.md"

PASS_COUNT=0
FAIL_COUNT=0

ok() {
  echo "[TEST-PASS] $1"
  PASS_COUNT=$((PASS_COUNT + 1))
}
bad() {
  echo "[TEST-FAIL] $1"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

echo "=============================================================================="
echo " narrative-truth-gate DoD harness — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "=============================================================================="

# ── Step 0: every tool name in claim-tool-map.json resolves on the live gateway ──
echo ""
echo "--- Step 0: gateway tool-name resolution (no phantom tools) ---"
TOOL_CHECK_OUT="$(mktemp "${TMPDIR:-/tmp}/ntg-toolcheck-XXXXXX.json")"
python3 - "$CLAIM_MAP" "$MCP_GATEWAY_URL" "$TOOL_CHECK_OUT" <<'PYEOF'
import json, sys, urllib.request

claim_map_path, gateway_url, out_path = sys.argv[1], sys.argv[2], sys.argv[3]

with open(claim_map_path, encoding="utf-8") as f:
    claim_map = json.load(f)
expected_tools = sorted({d["tool"] for d in claim_map.get("dimensions", [])})

def post(payload, session_id=None):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(gateway_url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json, text/event-stream")
    if session_id:
        req.add_header("Mcp-Session-Id", session_id)
    with urllib.request.urlopen(req, timeout=20) as resp:
        sid = resp.headers.get("Mcp-Session-Id")
        raw = resp.read().decode("utf-8")
    for line in raw.splitlines():
        if line.startswith("data:"):
            return json.loads(line[len("data:"):].strip()), sid
    return json.loads(raw), sid

_, sid = post({"jsonrpc": "2.0", "id": 1, "method": "initialize",
               "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                          "clientInfo": {"name": "ntg-test-harness", "version": "1"}}})
resp, _ = post({"jsonrpc": "2.0", "id": 2, "method": "tools/call",
                "params": {"name": "list_server_tools", "arguments": {"server": "vn-market"}}},
               session_id=sid)
text = resp["result"]["content"][0]["text"]
tools_obj = json.loads(text)
live_tool_names = {t["name"] for t in tools_obj["tools"]}

result = {"expected": expected_tools, "resolved": [], "phantom": []}
for t in expected_tools:
    if t in live_tool_names:
        result["resolved"].append(t)
    else:
        result["phantom"].append(t)

with open(out_path, "w", encoding="utf-8") as f:
    json.dump(result, f)

for t in expected_tools:
    status = "RESOLVED" if t in live_tool_names else "PHANTOM"
    print(f"  {status}: {t}")

sys.exit(0 if not result["phantom"] else 1)
PYEOF
TOOLCHECK_RC=$?
if [[ $TOOLCHECK_RC -eq 0 ]]; then
  ok "Step 0: all $(jq '.expected | length' "$TOOL_CHECK_OUT") claim-tool-map.json tool names resolve on live gateway (server=vn-market)"
else
  bad "Step 0: phantom tool name(s) detected: $(jq -c '.phantom' "$TOOL_CHECK_OUT")"
fi
rm -f "$TOOL_CHECK_OUT"

# ── (a) + (b): fb-post-2026-06-30.md — VNM TA absence-claim + foreign-flow absence-claim ──
echo ""
echo "--- (a)+(b): docs/social/fb-post-2026-06-30.md — two independent CCATO instances ---"
if [[ ! -f "$FB_POST" ]]; then
  bad "(a)/(b): fixture not found: $FB_POST"
else
  # Create isolated orch-state copy to prevent test pollution of live signal_queue
  NTG_TEST_ORCH_COPY="$(mktemp "${TMPDIR:-/tmp}/ntg-orch-XXXXXX.json")"
  cp "$REPO_ROOT/docs/data/orch/orch-state.json" "$NTG_TEST_ORCH_COPY"

  # Capture baseline narrative_contradiction count from live file
  LIVE_NTC_BASELINE="$(jq '[.signal_queue.rows[]|select(.type=="narrative_contradiction")]|length' "$REPO_ROOT/docs/data/orch/orch-state.json")"

  # Run with isolated copy — both ORCH_STATE and ORCH_APPLY_LIVE_FILE_OVERRIDE point to copy
  RUN1_OUT="$(ORCH_STATE="$NTG_TEST_ORCH_COPY" ORCH_APPLY_LIVE_FILE_OVERRIDE="$NTG_TEST_ORCH_COPY" bash "$GATE" "$FB_POST" "fb-market-poster" 2>&1)"
  RUN1_RC=$?
  echo "$RUN1_OUT" | sed 's/^/  /'

  # Check isolation assertions
  COPY_NTC_AFTER="$(jq '[.signal_queue.rows[]|select(.type=="narrative_contradiction")]|length' "$NTG_TEST_ORCH_COPY")"
  LIVE_NTC_AFTER="$(jq '[.signal_queue.rows[]|select(.type=="narrative_contradiction")]|length' "$REPO_ROOT/docs/data/orch/orch-state.json")"

  if [[ $COPY_NTC_AFTER -gt 0 ]]; then
    ok "isolation: narrative_contradiction emit validated on isolated copy ($COPY_NTC_AFTER rows)"
  else
    bad "isolation: expected >=1 narrative_contradiction rows on isolated copy, got $COPY_NTC_AFTER"
  fi

  if [[ "$LIVE_NTC_AFTER" == "$LIVE_NTC_BASELINE" ]]; then
    ok "isolation: live orch-state.json narrative_contradiction count unchanged ($LIVE_NTC_BASELINE both baseline and after)"
  else
    bad "isolation: live orch-state.json pollution detected — baseline=$LIVE_NTC_BASELINE, after=$LIVE_NTC_AFTER"
  fi

  rm -f "$NTG_TEST_ORCH_COPY"

  if [[ $RUN1_RC -ne 0 ]]; then
    ok "(a)/(b) exit code: gate exited non-zero (rc=$RUN1_RC) — post BLOCKED"
  else
    bad "(a)/(b) exit code: gate exited 0 — expected non-zero (both CCATO instances should FAIL)"
  fi

  if echo "$RUN1_OUT" | grep -q '\[FAIL\] dimension=technical_indicators.*ticker=VNM' \
     && echo "$RUN1_OUT" | grep -qiE 'RSI|MACD|Bollinger|chỉ báo'; then
    ok "(a): technical_indicators/VNM FAIL detected, naming VNM + a technical-indicator token (live RSI/MACD)"
  else
    bad "(a): expected a [FAIL] line for dimension=technical_indicators ticker=VNM citing RSI/MACD — not found"
  fi

  if echo "$RUN1_OUT" | grep -q '\[FAIL\] dimension=foreign_flow'; then
    ok "(b): foreign_flow FAIL detected — get_foreign_flow returned real per-ticker data, contradicting the absence claim"
  else
    bad "(b): expected a [FAIL] line for dimension=foreign_flow — not found"
  fi
fi

# ── (c): negative control — genuine honest-NULL (live ticker with insufficient OHLCV depth) ──
echo ""
echo "--- (c): negative control — honest-NULL (no false positive) ---"
HONEST_NULL_FIXTURE="$(mktemp "${TMPDIR:-/tmp}/ntg-honest-null-XXXXXX.md")"
cat > "$HONEST_NULL_FIXTURE" <<'EOF'
# Thị trường chứng khoán Việt Nam — 2026-07-01

Cổ phiếu ANI hôm nay giao dịch nhẹ trên sàn. Tôi không có dữ liệu kỹ thuật chi tiết phiên này cho ANI, nên chưa thể đưa ra mức hỗ trợ cụ thể.
EOF
# ANI is a real live ticker with exactly 1 day of OHLCV history today (insufficient for RSI/MACD/BB,
# consistent with project_indicator_program_gated_on_ohlcv_depth) — get_technical_indicators(ANI)
# genuinely returns a "Không đủ dữ liệu kỹ thuật" no-data response. This is a LIVE re-probe, not a stub.
RUN_C_OUT="$(NTG_SKIP_SIGNAL_EMIT=1 bash "$GATE" "$HONEST_NULL_FIXTURE" "fb-market-poster" 2>&1)"
RUN_C_RC=$?
echo "$RUN_C_OUT" | sed 's/^/  /'
rm -f "$HONEST_NULL_FIXTURE"

if [[ $RUN_C_RC -eq 0 ]]; then
  ok "(c) exit code: gate exited 0 — honest-NULL correctly PASSes (no false positive)"
else
  bad "(c) exit code: gate exited non-zero (rc=$RUN_C_RC) — false positive on genuine honest-NULL response"
fi
if echo "$RUN_C_OUT" | grep -q '\[PASS\] dimension=technical_indicators.*ticker=ANI'; then
  ok "(c): technical_indicators/ANI classified PASS — honest no-data confirmed from live tool response"
else
  bad "(c): expected a [PASS] line for dimension=technical_indicators ticker=ANI — not found"
fi

# ── (d): determinism — identical input, identical verdict across repeated runs ──
echo ""
echo "--- (d): determinism — identical input body -> identical verdict across runs ---"
if [[ -z "${RUN1_OUT:-}" ]]; then
  bad "(d): skipped — RUN1 (a)/(b) did not execute"
else
  RUN2_OUT="$(NTG_SKIP_SIGNAL_EMIT=1 bash "$GATE" "$FB_POST" "fb-market-poster" 2>&1)"
  RUN2_RC=$?

  VERDICT1="$(echo "$RUN1_OUT" | grep -oE '^\[(FAIL|PASS)\] dimension=[a-z_]+ tool=[a-z_]+ ticker=[A-Za-z_]+' | sort)"
  VERDICT2="$(echo "$RUN2_OUT" | grep -oE '^\[(FAIL|PASS)\] dimension=[a-z_]+ tool=[a-z_]+ ticker=[A-Za-z_]+' | sort)"

  if [[ "$RUN1_RC" -eq "$RUN2_RC" ]]; then
    ok "(d): exit code identical across runs (rc=$RUN1_RC both times)"
  else
    bad "(d): exit code diverged — run1=$RUN1_RC run2=$RUN2_RC"
  fi

  if [[ "$VERDICT1" == "$VERDICT2" ]]; then
    ok "(d): verdict set identical across runs — $(echo "$VERDICT1" | wc -l | tr -d ' ') classified claim(s), same dimension/tool/ticker/result every run"
  else
    bad "(d): verdict set diverged between runs:"
    diff <(echo "$VERDICT1") <(echo "$VERDICT2") | sed 's/^/    /'
  fi
fi

# ── Result ────────────────────────────────────────────────────────────────────
echo ""
echo "=============================================================================="
echo " RESULT: $PASS_COUNT passed / $FAIL_COUNT failed"
echo "=============================================================================="

if [[ $FAIL_COUNT -eq 0 ]]; then
  exit 0
else
  exit 1
fi
