#!/usr/bin/env bash
# scripts/agents-flow/coverage-stamp.test.sh
#
# Regression test for FIX-COVERAGE-SWEEP-BLANKET-STAMP-DEAD-TRIGGER.
# Exercises coverage-stamp.sh via a stubbed mcp_call (function-override after
# sourcing — same pattern as dev-team-tick-preflight.test.sh), so NO real
# side-effecting MCP calls are made. NEVER touches the live
# docs/data/coverage-state.json — every scenario writes to an isolated tmp
# fixture copy.
#
# WHY THIS TEST IS BICONDITIONAL, NOT ONE-DIRECTIONAL (per the task row):
# a test that only checks "the right tickers got stamped" PASSES TODAY even
# under the old blanket-stamp behaviour whenever N == total ticker count
# (57), and proves nothing about whether the 48h staleness trigger can ever
# fire. T3/T4 below (list-stale) are the ones that actually distinguish this
# fix from the pre-fix behaviour: they seed a >48h-stale ticker and a never-
# covered (null) ticker and assert BOTH are surfaced as stale and force-
# included — something the old blanket-stamp code path could never satisfy
# because under it no ticker could ever age past 48h in the first place.
#
# OPEN QUESTION THE TASK LEFT TO THE IMPLEMENTER (resolved here — see
# coverage-stamp.sh header for the fuller rationale): does the script own
# just the write, or the read-side STALE_TICKERS computation too? Decided:
# BOTH. Reason surfaced concretely by this very test file — "run a cycle"
# per AC 2 has no automatable meaning if STALE_TICKERS stays LLM-prose-only
# inside the two flow docs; there is no code to invoke. Giving the script a
# --list-stale mode is what makes AC 2 a runnable regression test at all,
# not just a manual spec to re-verify by hand every time.
#
# Run:
#   bash scripts/agents-flow/coverage-stamp.test.sh
#
# Exit 0 = all pass. Exit 1 = >=1 failure.
# Owning task: FIX-COVERAGE-SWEEP-BLANKET-STAMP-DEAD-TRIGGER
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STAMP_SH="$SCRIPT_DIR/coverage-stamp.sh"

if [ ! -f "$STAMP_SH" ]; then
  echo "ERROR: coverage-stamp.sh not found at $STAMP_SH" >&2
  exit 1
fi

FAKE_SESSION="test-session-fixture-not-real"
export CLAUDE_CODE_SESSION_ID="$FAKE_SESSION"
# Retry backoff is a real ~2/4/6/8/10s exponential wait in production (fine —
# a coverage-state write mutex collision is rare and short-lived). Zero it
# here so T7's exhausted-retries scenario (5 attempts) doesn't cost ~30s
# per test run.
export COVERAGE_STAMP_MUTEX_BACKOFF_S=0

PASS=0
FAIL=0

check() {
  local label="$1" cond="$2"
  if [ "$cond" = "true" ]; then
    echo "PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $label"
    FAIL=$((FAIL + 1))
  fi
}

# ── Source the script under test (guard prevents auto-exec: $0 != BASH_SOURCE) ──
# shellcheck source=./coverage-stamp.sh
source "$STAMP_SH"

TMPDIR_TEST=$(mktemp -d /private/tmp/coverage-stamp-test-XXXXXX)
cleanup() { rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT
CALL_LOG_FILE="$TMPDIR_TEST/call-log.txt"

# ── Stub mcp_call — logs every call, branches on task_id substring ──────────
STUB_MUTEX="${STUB_MUTEX:-won}"   # won | self_held | lost_peer | error
mcp_call() {
  local tool="$1" args="${2:-}"
  echo "$tool" >> "$CALL_LOG_FILE"
  case "$tool" in
    task_claim)
      if [[ "$args" == *"coverage-state:main"* ]]; then
        case "$STUB_MUTEX" in
          won) echo '{"claimed":true}'; return 0 ;;
          self_held) echo '{"claimed":false,"current_holder":{"owner_client_session":"'"$FAKE_SESSION"'"}}'; return 0 ;;
          lost_peer) echo '{"claimed":false,"current_holder":{"owner_client_session":"peer-session-xyz"}}'; return 0 ;;
          error) echo "simulated coverage-state mutex transport error" >&2; return 1 ;;
        esac
      else
        echo "unstubbed task_claim in test: $args" >&2; return 1
      fi
      ;;
    task_heartbeat) echo '{"ok":true,"expires_at":9999999999}'; return 0 ;;
    task_release) echo '{"ok":true,"released":1}'; return 0 ;;
    *) echo "unstubbed tool in test: $tool" >&2; return 1 ;;
  esac
}

# ── Fixture builders ─────────────────────────────────────────────────────────
# 5-ticker fixture, no sweep_config (mirrors the LIVE deleted-key state),
# all 5 carry a byte-identical recent stamp (mirrors the LIVE saturated bug).
make_fixture_no_sweep_config() {
  local file="$1"
  cat > "$file" <<'JSON'
{
  "_schema": "v1",
  "_ssot": true,
  "_updated_by": "market-watcher",
  "_updated_at": "2026-07-25T08:10:06Z",
  "_eod_completed": "2026-07-11T16:06:30Z",
  "tickers": {
    "VNM": {"last_covered_news_scout": "2026-07-25T16:14:39Z", "last_covered_market_watcher": "2026-07-25T08:10:06Z"},
    "FPT": {"last_covered_news_scout": "2026-07-25T16:14:39Z", "last_covered_market_watcher": "2026-07-25T08:10:06Z"},
    "VCB": {"last_covered_news_scout": "2026-07-25T16:14:39Z", "last_covered_market_watcher": "2026-07-25T08:10:06Z"},
    "HPG": {"last_covered_news_scout": "2026-07-25T16:14:39Z", "last_covered_market_watcher": "2026-07-25T08:10:06Z"},
    "SSI": {"last_covered_news_scout": "2026-07-25T16:14:39Z", "last_covered_market_watcher": "2026-07-25T08:10:06Z"}
  }
}
JSON
}

# Same 5 tickers, but WITH a pre-existing sweep_config (custom, non-default
# values — proves the repair is idempotent, never clobbers an existing block)
# and one genuinely stale ticker (HPG, 50h old) + one never-covered (SSI, null).
make_fixture_with_stale() {
  local file="$1"
  cat > "$file" <<'JSON'
{
  "_schema": "v1",
  "_ssot": true,
  "_updated_by": "news-scout",
  "_updated_at": "2026-07-25T16:14:39Z",
  "_eod_completed": "2026-07-11T16:06:30Z",
  "sweep_config": {"max_staleness_hours": 48, "sweep_batch_size": 3},
  "tickers": {
    "VNM": {"last_covered_news_scout": "2026-07-25T16:14:39Z", "last_covered_market_watcher": "2026-07-25T08:10:06Z"},
    "FPT": {"last_covered_news_scout": "2026-07-25T16:00:00Z", "last_covered_market_watcher": "2026-07-25T08:10:06Z"},
    "VCB": {"last_covered_news_scout": "2026-07-25T15:00:00Z", "last_covered_market_watcher": "2026-07-25T08:10:06Z"},
    "HPG": {"last_covered_news_scout": "2026-07-23T14:00:00Z", "last_covered_market_watcher": "2026-07-25T08:10:06Z"},
    "SSI": {"last_covered_market_watcher": "2026-07-25T08:10:06Z"}
  }
}
JSON
}

# NOW pinned so age-vs-48h math is deterministic regardless of wall-clock.
export COVERAGE_STAMP_NOW="2026-07-25T16:20:00Z"

# ── T1/T2 — POSITIVE (biconditional half 1): only named tickers stamped ─────
FIX1="$TMPDIR_TEST/t1.json"
make_fixture_no_sweep_config "$FIX1"
STUB_MUTEX="won" main --agent news-scout --tickers "VNM,FPT" --file "$FIX1" >/dev/null 2>"$TMPDIR_TEST/t1.err"
GROUPS=$(jq '[.tickers|to_entries[]|.value.last_covered_news_scout]|group_by(.)|length' "$FIX1")
check "T1 positive: 2-of-5 stamp produces >1 distinct-stamp group (was always 1 under old blanket-stamp bug)" "$([ "$GROUPS" -gt 1 ] && echo true || echo false)"
STAMPED_NOW=$(jq -r '.tickers.VNM.last_covered_news_scout' "$FIX1")
UNSTAMPED=$(jq -r '.tickers.VCB.last_covered_news_scout' "$FIX1")
check "T1 positive: VNM (named) carries the new stamp" "$([ "$STAMPED_NOW" = "$COVERAGE_STAMP_NOW" ] && echo true || echo false)"
check "T1 positive: VCB (NOT named) keeps its OLD stamp, untouched" "$([ "$UNSTAMPED" = "2026-07-25T16:14:39Z" ] && echo true || echo false)"

FIX2="$TMPDIR_TEST/t2.json"
make_fixture_no_sweep_config "$FIX2"
STUB_MUTEX="won" main --agent market-watcher --tickers "SSI" --file "$FIX2" >/dev/null 2>"$TMPDIR_TEST/t2.err"
GROUPS2=$(jq '[.tickers|to_entries[]|.value.last_covered_market_watcher]|group_by(.)|length' "$FIX2")
check "T2 positive (market-watcher): 1-of-5 stamp produces >1 distinct-stamp group" "$([ "$GROUPS2" -gt 1 ] && echo true || echo false)"

# ── T3/T4 — NEGATIVE (biconditional half 2, the one that proves the trigger
# is actually alive): seed stale + never-covered tickers, list-stale surfaces
# them and force-includes via batch slicing. THIS is the test that a
# "right tickers got stamped" check alone can never provide. ─────────────────
FIX3="$TMPDIR_TEST/t3.json"
make_fixture_with_stale "$FIX3"
STALE_JSON=$(main --agent news-scout --list-stale --watchlist "VNM,FPT,VCB,HPG,SSI" --file "$FIX3")
check "T3 negative: >48h-stale ticker HPG appears in STALE_TICKERS" "$(echo "$STALE_JSON" | jq -e 'index("HPG") != null' >/dev/null 2>&1 && echo true || echo false)"
check "T3 negative: never-covered (null) ticker SSI appears in STALE_TICKERS" "$(echo "$STALE_JSON" | jq -e 'index("SSI") != null' >/dev/null 2>&1 && echo true || echo false)"
check "T3 negative: fresh ticker VNM (stamped 6 min ago) does NOT appear" "$(echo "$STALE_JSON" | jq -e 'index("VNM") == null' >/dev/null 2>&1 && echo true || echo false)"
check "T3 negative: sweep_batch_size=3 respected (<=3 entries returned)" "$(echo "$STALE_JSON" | jq -e 'length <= 3' >/dev/null 2>&1 && echo true || echo false)"
check "T3 negative: null (never-covered) sorts before the 50h-stale timestamped one" "$(echo "$STALE_JSON" | jq -e '.[0] == "SSI"' >/dev/null 2>&1 && echo true || echo false)"

# T4 — list-stale is fail-silent when the file itself is missing (matches the
# ORIGINAL read contract's documented fallback: treat all as null/never-covered).
STALE_MISSING=$(main --agent news-scout --list-stale --watchlist "AAA,BBB" --file "$TMPDIR_TEST/does-not-exist.json")
check "T4 negative: missing coverage-state file -> fail-silent, both tickers treated as never-covered/stale" "$(echo "$STALE_MISSING" | jq -e 'length == 2' >/dev/null 2>&1 && echo true || echo false)"

# ── T5/T6 — PRESERVATION (regression test for the sweep_config deletion
# class + the lost-update row's AC 1/3: peer agent's field must survive). ────
FIX5="$TMPDIR_TEST/t5.json"
make_fixture_no_sweep_config "$FIX5"
BEFORE_KEYS=$(jq -c '. as $d | ($d|keys) + ["sweep_config"] | unique | sort' "$FIX5")
PEER_BEFORE=$(jq -r '.tickers.VNM.last_covered_market_watcher' "$FIX5")
STUB_MUTEX="won" main --agent news-scout --tickers "VNM,FPT" --file "$FIX5" >/dev/null 2>&1
AFTER_KEYS=$(jq -c '. | keys | sort' "$FIX5")
check "T5 preservation: sweep_config repaired (was absent -> now present) after a write" "$(jq -e 'has("sweep_config")' "$FIX5" >/dev/null 2>&1 && echo true || echo false)"
check "T5 preservation: repaired sweep_config carries the documented defaults (48h/3)" "$(jq -e '.sweep_config == {max_staleness_hours:48, sweep_batch_size:3}' "$FIX5" >/dev/null 2>&1 && echo true || echo false)"
check "T5 preservation: every pre-existing top-level key still present" "$([ "$BEFORE_KEYS" = "$AFTER_KEYS" ] && echo true || echo false)"
PEER_AFTER=$(jq -r '.tickers.VNM.last_covered_market_watcher' "$FIX5")
check "T5 preservation: peer agent's (market-watcher) last_covered field on a news-scout-touched ticker is BYTE-IDENTICAL, unchanged" "$([ "$PEER_BEFORE" = "$PEER_AFTER" ] && echo true || echo false)"

FIX6="$TMPDIR_TEST/t6.json"
make_fixture_with_stale "$FIX6"
BEFORE_SWEEP_CFG=$(jq -c '.sweep_config' "$FIX6")
STUB_MUTEX="won" main --agent market-watcher --tickers "VCB" --file "$FIX6" >/dev/null 2>&1
AFTER_SWEEP_CFG=$(jq -c '.sweep_config' "$FIX6")
check "T6 preservation: an ALREADY-PRESENT sweep_config is never clobbered by the repair (idempotent, byte-identical)" "$([ "$BEFORE_SWEEP_CFG" = "$AFTER_SWEEP_CFG" ] && echo true || echo false)"

# ── T7/T8/T9 — mutex behaviour ───────────────────────────────────────────────
FIX7="$TMPDIR_TEST/t7.json"
make_fixture_no_sweep_config "$FIX7"
BEFORE_HASH=$(md5 -q "$FIX7" 2>/dev/null || md5sum "$FIX7" | awk '{print $1}')
: > "$CALL_LOG_FILE"
STUB_MUTEX="lost_peer" main --agent news-scout --tickers "VNM" --file "$FIX7" >/dev/null 2>"$TMPDIR_TEST/t7.err"
RC7=$?
AFTER_HASH=$(md5 -q "$FIX7" 2>/dev/null || md5sum "$FIX7" | awk '{print $1}')
check "T7 mutex lost-to-peer: script exits non-zero (fail-closed)" "$([ $RC7 -ne 0 ] && echo true || echo false)"
check "T7 mutex lost-to-peer: file is NEVER touched (fail-closed, no partial/unprotected write)" "$([ "$BEFORE_HASH" = "$AFTER_HASH" ] && echo true || echo false)"

FIX8="$TMPDIR_TEST/t8.json"
make_fixture_no_sweep_config "$FIX8"
: > "$CALL_LOG_FILE"
STUB_MUTEX="self_held" main --agent news-scout --tickers "VNM" --file "$FIX8" >/dev/null 2>"$TMPDIR_TEST/t8.err"
RC8=$?
HEARTBEAT_CALLED=$(grep -c "^task_heartbeat$" "$CALL_LOG_FILE" || true)
check "T8 mutex self-held (re-entrant): heartbeat is called" "$([ "${HEARTBEAT_CALLED:-0}" -ge 1 ] && echo true || echo false)"
check "T8 mutex self-held (re-entrant): write proceeds (exit 0)" "$([ $RC8 -eq 0 ] && echo true || echo false)"
STAMPED8=$(jq -r '.tickers.VNM.last_covered_news_scout' "$FIX8")
check "T8 mutex self-held: VNM actually got the new stamp" "$([ "$STAMPED8" = "$COVERAGE_STAMP_NOW" ] && echo true || echo false)"

FIX9="$TMPDIR_TEST/t9.json"
make_fixture_no_sweep_config "$FIX9"
BEFORE_TICKERS=$(jq -c '.tickers' "$FIX9")
STUB_MUTEX="won" main --agent news-scout --tickers "" --file "$FIX9" >/dev/null 2>"$TMPDIR_TEST/t9.err"
AFTER_TICKERS=$(jq -c '.tickers' "$FIX9")
check "T9 empty --tickers (config-repair-only mode): .tickers block completely untouched" "$([ "$BEFORE_TICKERS" = "$AFTER_TICKERS" ] && echo true || echo false)"
check "T9 empty --tickers: sweep_config still gets repaired" "$(jq -e 'has("sweep_config")' "$FIX9" >/dev/null 2>&1 && echo true || echo false)"

# ── T10 — ticker named in --tickers but absent from the file's .tickers map
# (the flagged 57-vs-34-vs-58 ticker-count mismatch) does not error, gets
# created with just the one field. ───────────────────────────────────────────
FIX10="$TMPDIR_TEST/t10.json"
make_fixture_no_sweep_config "$FIX10"
STUB_MUTEX="won" main --agent news-scout --tickers "ZZZNEW" --file "$FIX10" >/dev/null 2>"$TMPDIR_TEST/t10.err"
RC10=$?
check "T10 unknown ticker: does not error" "$([ $RC10 -eq 0 ] && echo true || echo false)"
check "T10 unknown ticker: created with exactly the stamped field" "$(jq -e --arg n "$COVERAGE_STAMP_NOW" '.tickers.ZZZNEW == {last_covered_news_scout: $n}' "$FIX10" >/dev/null 2>&1 && echo true || echo false)"

# ── T11 — invalid --agent rejected before any mutex call ────────────────────
: > "$CALL_LOG_FILE"
FIX11="$TMPDIR_TEST/t11.json"
make_fixture_no_sweep_config "$FIX11"
main --agent bogus-agent --tickers "VNM" --file "$FIX11" >/dev/null 2>"$TMPDIR_TEST/t11.err"
RC11=$?
CALLS11=$(wc -l < "$CALL_LOG_FILE" | tr -d ' ')
check "T11 invalid --agent: rejected (non-zero exit)" "$([ $RC11 -ne 0 ] && echo true || echo false)"
check "T11 invalid --agent: no MCP calls attempted" "$([ "$CALLS11" -eq 0 ] && echo true || echo false)"

# ── T12 — missing file on --tickers (write) path fails loud, BEFORE the mutex
# is even attempted (no point serializing a write that cannot land). ────────
: > "$CALL_LOG_FILE"
main --agent news-scout --tickers "VNM" --file "$TMPDIR_TEST/does-not-exist-2.json" >/dev/null 2>"$TMPDIR_TEST/t12.err"
RC12=$?
CALLS12=$(wc -l < "$CALL_LOG_FILE" | tr -d ' ')
check "T12 missing file (write path): fails loud (non-zero exit)" "$([ $RC12 -ne 0 ] && echo true || echo false)"
check "T12 missing file (write path): no MCP calls attempted (fail before mutex)" "$([ "$CALLS12" -eq 0 ] && echo true || echo false)"

# ── T13 — mutex TTL/task_id/kind wiring sanity (via a transport-level probe:
# the stub only recognizes "coverage-state:main" — an unstubbed id/kind would
# hit the "unstubbed task_claim" branch and return rc=1, which T1 already
# proved does NOT happen). Documented here as an explicit assertion, not just
# an implicit side effect of T1 passing.
: > "$CALL_LOG_FILE"
FIX13="$TMPDIR_TEST/t13.json"
make_fixture_no_sweep_config "$FIX13"
STUB_MUTEX="won" main --agent news-scout --tickers "VNM" --file "$FIX13" >/dev/null 2>&1
CLAIM_THEN_RELEASE=$(paste -sd, "$CALL_LOG_FILE")
check "T13 mutex wiring: task_claim then task_release both fired in order" "$([ "$CLAIM_THEN_RELEASE" = "task_claim,task_release" ] && echo true || echo false)"

echo ""
echo "== coverage-stamp.test.sh: $PASS passed, $FAIL failed =="
[ $FAIL -eq 0 ]
