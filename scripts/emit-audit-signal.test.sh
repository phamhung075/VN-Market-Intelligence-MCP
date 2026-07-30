#!/usr/bin/env bash
# scripts/emit-audit-signal.test.sh
#
# Regression test for UC-ASL-P2-DEV-1 (scripts/emit-audit-signal.sh).
# Mirrors scripts/agents-flow/cowork-guaranteed-slot-firer.test.sh /
# scripts/agents-flow/context-bloat-backstop.test.sh conventions:
#   - `source` the script under test (its bottom guard `[[ "${BASH_SOURCE[0]}"
#     == "${0}" ]]` prevents auto-execution when sourced).
#   - Redefine `mcp_call()` (from mcp-call.sh, sourced transitively) to a
#     recording stub — ZERO real network calls in this suite.
#   - Redefine `_orch_apply_invoke()` for CAS-retry coverage (T9/T10) — all
#     other tests exercise the REAL scripts/orch-apply.sh (validator +
#     conservation-check + CAS-guard + atomic rename) against an isolated
#     SCRATCH COPY of orch-state.json — never the live file.
#
# Run:
#   bash scripts/emit-audit-signal.test.sh
#
# Exit 0 = all pass. Exit 1 = >=1 failure.
# Owning task: UC-ASL-P2-DEV-1 (sprint ULTRACODE-AUDIT-FIXALL)
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
EMIT_SH="$SCRIPT_DIR/emit-audit-signal.sh"

if [ ! -f "$EMIT_SH" ]; then
  echo "ERROR: emit-audit-signal.sh not found at $EMIT_SH" >&2
  exit 1
fi

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

# ── Isolated tmp fixture root — NEVER the live docs/data files ───────────────
TMPDIR_TEST=$(mktemp -d /private/tmp/emit-audit-signal-test-XXXXXX)
cleanup() { rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT

SCRATCH_ORCH="$TMPDIR_TEST/orch-state.json"
SCRATCH_LEDGER="$TMPDIR_TEST/auditor-dedup-ledger.json"
CALL_LOG="$TMPDIR_TEST/mcp-calls.log"

export EMIT_SIGNAL_LEDGER_FILE="$SCRATCH_LEDGER"
export EMIT_SIGNAL_ORCH_STATE_FILE="$SCRATCH_ORCH"
export ORCH_APPLY_LIVE_FILE_OVERRIDE="$SCRATCH_ORCH"

# ── Source the script under test (guard prevents auto-exec) ─────────────────
# shellcheck source=./emit-audit-signal.sh
source "$EMIT_SH"

# ── Recording stub for mcp_call — overrides the real transport from
# mcp-call.sh. ZERO real network calls anywhere in this suite. ─────────────
# FIX-AUDITOR-OUTPUT-CONTRACT-SIGNALSPOSTED-COUNTS-CALLS-NOT-CONFIRMED-ROWS:
# _run_e1() now parses the post_agent_signal JSON body (success/signal_id) AND
# performs a mandatory get_agent_signals read-back — the stub below returns
# REALISTIC response shapes for both (not the pre-fix bare `'{}'`), with
# override hooks for the new negative-path tests (T16-T18).
MCP_CALL_FAIL_TOOL=""   # tool name to force-fail (e.g. "post_agent_signal"); empty = never fail
POST_SIGNAL_ID_COUNTER=0
POST_SIGNAL_FORCE_TEXT=""          # if set, returned verbatim for post_agent_signal (overrides success/id below)
POST_SIGNAL_FORCE_SUCCESS="true"   # the `.success` field on the realistic post_agent_signal stub response
POST_SIGNAL_FORCE_ID=""            # if set, forces `.signal_id` instead of the auto-incrementing counter
READBACK_FORCE_MISS=""             # "true" = get_agent_signals stub response does NOT contain the posted id
LAST_POSTED_SIGNAL_ID=""
mcp_call() {
  local tool="${1:-}" args="${2:-}"
  echo "CALL: $tool $args" >> "$CALL_LOG"
  if [ "$tool" = "$MCP_CALL_FAIL_TOOL" ]; then
    echo "simulated transport failure" >&2
    return 1
  fi
  if [ "$tool" = "post_agent_signal" ]; then
    if [ -n "$POST_SIGNAL_FORCE_TEXT" ]; then
      printf '%s' "$POST_SIGNAL_FORCE_TEXT"
      return 0
    fi
    local sid
    if [ -n "$POST_SIGNAL_FORCE_ID" ]; then
      sid="$POST_SIGNAL_FORCE_ID"
    else
      POST_SIGNAL_ID_COUNTER=$((POST_SIGNAL_ID_COUNTER + 1))
      sid="$POST_SIGNAL_ID_COUNTER"
    fi
    LAST_POSTED_SIGNAL_ID="$sid"
    printf '{"success":%s,"signal_id":%s}' "$POST_SIGNAL_FORCE_SUCCESS" "$sid"
    return 0
  fi
  if [ "$tool" = "get_agent_signals" ]; then
    if [ "$READBACK_FORCE_MISS" = "true" ]; then
      printf 'Không có tín hiệu mới.'
      return 0
    fi
    printf '[%s] SIGNAL_FEEDBACK — từ: system-auditor' "${LAST_POSTED_SIGNAL_ID:-1}"
    return 0
  fi
  echo '{}'
  return 0
}

call_count_for() {
  local n
  n=$(grep -c "^CALL: $1 " "$CALL_LOG" 2>/dev/null)
  echo "${n:-0}"
}

e1_signal_type_is() {
  local expected="$1"
  local actual
  # Extract the signal_type value from the last post_agent_signal call in the log
  actual=$(grep '"signal_type"' "$CALL_LOG" 2>/dev/null | tail -1 | grep -o ': "[^"]*"' | cut -d'"' -f2)
  [ "$actual" = "$expected" ]
}

reset_case() {
  : > "$CALL_LOG"
  MCP_CALL_FAIL_TOOL=""
  POST_SIGNAL_FORCE_TEXT=""
  POST_SIGNAL_FORCE_SUCCESS="true"
  POST_SIGNAL_FORCE_ID=""
  READBACK_FORCE_MISS=""
  cp "$REPO_ROOT/docs/data/orch/orch-state.json" "$SCRATCH_ORCH"
  rm -f "$SCRATCH_LEDGER"
  # restore default (real) _orch_apply_invoke in case a prior case stubbed it
  _orch_apply_invoke() { bash "$ORCH_APPLY_SH"; }
}

row_present() {
  jq --arg id "$1" '[.signal_queue.rows[] | select(.id==$id)] | length' "$SCRATCH_ORCH" 2>/dev/null
}

# ── T1: fresh dedup_key — full E-1+E-2+E-3, sends Telegram, writes ledger ───
reset_case
OUT=$(run_emit_signal --check-id B-04 --category-type data_stale --severity WARN \
  --summary "HOSE-VNINDEX stale" \
  --detail-json '{"dedup_key":"data_stale:HOSE-VNINDEX:B-04","source_id":"HOSE-VNINDEX"}')
RC=$?
ROW_ID=$(printf '%s' "$OUT" | grep -o 'id=[^ ]*$' | cut -d= -f2)
check "T1 fresh-key exit=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"
check "T1 fresh-key marker OK" "$(printf '%s' "$OUT" | grep -q '^\[emit-signal\] OK dedup_key=' && echo true || echo false)"
check "T1 fresh-key E-1 signal_type is valid enum (not raw category_type)" "$(e1_signal_type_is signal_feedback && echo true || echo false)"
check "T1 fresh-key post_agent_signal called once" "$([ "$(call_count_for post_agent_signal)" -eq 1 ] && echo true || echo false)"
check "T1 fresh-key send_telegram called once" "$([ "$(call_count_for send_telegram)" -eq 1 ] && echo true || echo false)"
check "T1 fresh-key ledger written" "$([ -f "$SCRATCH_LEDGER" ] && echo true || echo false)"
check "T1 fresh-key ledger has dedup_key" "$(jq -e '."data_stale:HOSE-VNINDEX:B-04".ts' "$SCRATCH_LEDGER" >/dev/null 2>&1 && echo true || echo false)"
check "T1 fresh-key row present in signal_queue" "$([ "$(row_present "$ROW_ID")" -eq 1 ] && echo true || echo false)"

# ── T2: same key within 7 days — SKIP-dedup, no second send_telegram, but
# row STILL appended (AC-3: every call, dedup-skipped or not) ───────────────
OUT2=$(run_emit_signal --check-id B-04 --category-type data_stale --severity WARN \
  --summary "HOSE-VNINDEX stale again" \
  --detail-json '{"dedup_key":"data_stale:HOSE-VNINDEX:B-04","source_id":"HOSE-VNINDEX"}')
RC2=$?
ROW_ID2=$(printf '%s' "$OUT2" | grep -o 'id=[^ ]*$' | cut -d= -f2)
check "T2 same-key-in-window exit=0" "$([ "$RC2" -eq 0 ] && echo true || echo false)"
check "T2 same-key-in-window marker SKIP-dedup" "$(printf '%s' "$OUT2" | grep -q '^\[emit-signal\] SKIP-dedup dedup_key=' && echo true || echo false)"
check "T2 same-key-in-window send_telegram NOT called again" "$([ "$(call_count_for send_telegram)" -eq 1 ] && echo true || echo false)"
check "T2 same-key-in-window post_agent_signal called again (E-1 never dedup-gated)" "$([ "$(call_count_for post_agent_signal)" -eq 2 ] && echo true || echo false)"
check "T2 same-key-in-window row STILL appended" "$([ "$(row_present "$ROW_ID2")" -eq 1 ] && echo true || echo false)"

# ── T3: ledger entry artificially aged past 7 days — sends Telegram again ───
OLD_TS=$(date -u -v-8d +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d '8 days ago' +"%Y-%m-%dT%H:%M:%SZ")
jq --arg k "data_stale:HOSE-VNINDEX:B-04" --arg ts "$OLD_TS" '.[$k].ts = $ts' "$SCRATCH_LEDGER" > "$SCRATCH_LEDGER.tmp" && mv "$SCRATCH_LEDGER.tmp" "$SCRATCH_LEDGER"
OUT3=$(run_emit_signal --check-id B-04 --category-type data_stale --severity WARN \
  --summary "HOSE-VNINDEX stale third" \
  --detail-json '{"dedup_key":"data_stale:HOSE-VNINDEX:B-04","source_id":"HOSE-VNINDEX"}')
RC3=$?
ROW_ID3=$(printf '%s' "$OUT3" | grep -o 'id=[^ ]*$' | cut -d= -f2)
check "T3 aged-past-7d exit=0" "$([ "$RC3" -eq 0 ] && echo true || echo false)"
check "T3 aged-past-7d marker OK (sends again)" "$(printf '%s' "$OUT3" | grep -q '^\[emit-signal\] OK dedup_key=' && echo true || echo false)"
check "T3 aged-past-7d send_telegram called a 2nd time" "$([ "$(call_count_for send_telegram)" -eq 2 ] && echo true || echo false)"
check "T3 aged-past-7d row appended" "$([ "$(row_present "$ROW_ID3")" -eq 1 ] && echo true || echo false)"

# ── T4: WARN -> CRITICAL escalation inside the dedup window bypasses mute ───
reset_case
run_emit_signal --check-id C-08 --category-type db_integrity_breach --severity WARN \
  --summary "orphan alerts" \
  --detail-json '{"dedup_key":"db_integrity_breach:alerts:C-08"}' >/dev/null
OUT4=$(run_emit_signal --check-id C-08 --category-type db_integrity_breach --severity CRITICAL \
  --summary "orphan alerts worsened" \
  --detail-json '{"dedup_key":"db_integrity_breach:alerts:C-08"}')
RC4=$?
check "T4 escalation-bypass exit=0" "$([ "$RC4" -eq 0 ] && echo true || echo false)"
check "T4 escalation-bypass marker OK-escalation-bypass" "$(printf '%s' "$OUT4" | grep -q '^\[emit-signal\] OK-escalation-bypass dedup_key=.*prev_sev=2 new_sev=3' && echo true || echo false)"
check "T4 escalation-bypass send_telegram called (2nd real send, bypass)" "$([ "$(call_count_for send_telegram)" -eq 2 ] && echo true || echo false)"

# ── T5: --e3-only skips E-1 and E-2 entirely; dedup_key optional ────────────
reset_case
OUT5=$(run_emit_signal --check-id IMP-1 --category-type improvement_proposal --severity INFO \
  --summary "improvement proposal" --detail-json '{}' --e3-only)
RC5=$?
ROW_ID5=$(printf '%s' "$OUT5" | grep -o 'id=[^ ]*' | head -1 | cut -d= -f2)
check "T5 e3-only exit=0" "$([ "$RC5" -eq 0 ] && echo true || echo false)"
check "T5 e3-only marker" "$(printf '%s' "$OUT5" | grep -q '^\[emit-signal\] OK e3-only ' && echo true || echo false)"
check "T5 e3-only post_agent_signal NEVER called" "$([ "$(call_count_for post_agent_signal)" -eq 0 ] && echo true || echo false)"
check "T5 e3-only send_telegram NEVER called" "$([ "$(call_count_for send_telegram)" -eq 0 ] && echo true || echo false)"
check "T5 e3-only row still appended" "$([ "$(row_present "$ROW_ID5")" -eq 1 ] && echo true || echo false)"

# ── T6: E-1 transport failure aborts loud, never reaches E-2/E-3 ───────────
reset_case
MCP_CALL_FAIL_TOOL="post_agent_signal"
BEFORE_COUNT=$(jq '.signal_queue.rows | length' "$SCRATCH_ORCH")
OUT6=$(run_emit_signal --check-id B-05 --category-type data_stale --severity CRITICAL \
  --summary "source down" --detail-json '{"dedup_key":"data_stale:X:B-05"}')
RC6=$?
AFTER_COUNT=$(jq '.signal_queue.rows | length' "$SCRATCH_ORCH")
check "T6 e1-failure non-zero exit" "$([ "$RC6" -ne 0 ] && echo true || echo false)"
check "T6 e1-failure marker ABORT e1-failed" "$(printf '%s' "$OUT6" | grep -q '^\[emit-signal\] ABORT e1-failed' && echo true || echo false)"
check "T6 e1-failure never reached E-3 (row count unchanged)" "$([ "$BEFORE_COUNT" -eq "$AFTER_COUNT" ] && echo true || echo false)"
check "T6 e1-failure send_telegram never called" "$([ "$(call_count_for send_telegram)" -eq 0 ] && echo true || echo false)"

# ── T7: E-3 read-back failure — orch-apply claims success but the row never
# lands (simulated orphan-key bug) — non-dedup-gated BUG telegram + abort ──
reset_case
_orch_apply_invoke() { cat >/dev/null; return 0; }  # discard candidate, never persist it
OUT7=$(run_emit_signal --check-id C-07 --category-type db_integrity_breach --severity HIGH \
  --summary "readback probe" --detail-json '{"dedup_key":"db_integrity_breach:t:C-07"}')
RC7=$?
check "T7 readback-failure non-zero exit" "$([ "$RC7" -ne 0 ] && echo true || echo false)"
check "T7 readback-failure marker ABORT e3-readback-failed" "$(printf '%s' "$OUT7" | grep -q '^\[emit-signal\] ABORT e3-readback-failed' && echo true || echo false)"
check "T7 readback-failure triggers non-dedup BUG telegram" "$(grep -q '^CALL: send_telegram' "$CALL_LOG" && echo true || echo false)"

# ── T8: E-3 write failure (rc=1, validation/conservation failure) — NO retry,
# immediate abort ────────────────────────────────────────────────────────────
# NOTE: attempt counters below use a FILE (not a bash variable) — OUT*=$(...)
# forks a command-substitution subshell around the entire run_emit_signal
# call, so a bash variable mutated deep inside that subshell (via
# _orch_apply_invoke) would never propagate back to this parent scope. A
# file survives across the subshell boundary via real disk I/O.
reset_case
WRITE_FAIL_CALLS_FILE="$TMPDIR_TEST/write-fail-calls.count"
: > "$WRITE_FAIL_CALLS_FILE"
_orch_apply_invoke() { cat >/dev/null; echo x >> "$WRITE_FAIL_CALLS_FILE"; return 1; }
OUT8=$(run_emit_signal --check-id C-04 --category-type db_integrity_breach --severity WARN \
  --summary "write-fail probe" --detail-json '{"dedup_key":"db_integrity_breach:t:C-04"}')
RC8=$?
WRITE_FAIL_CALLS=$(wc -l < "$WRITE_FAIL_CALLS_FILE" | tr -d ' ')
check "T8 write-failure non-zero exit" "$([ "$RC8" -ne 0 ] && echo true || echo false)"
check "T8 write-failure marker ABORT e3-write-failed rc=1" "$(printf '%s' "$OUT8" | grep -q '^\[emit-signal\] ABORT e3-write-failed rc=1' && echo true || echo false)"
check "T8 write-failure NO retry (invoked exactly once)" "$([ "$WRITE_FAIL_CALLS" -eq 1 ] && echo true || echo false)"

# ── T9: CAS-retry — orch-apply.sh returns 2,2,0 across 3 calls — succeeds on
# the 3rd attempt with a plain success marker ────────────────────────────────
reset_case
CAS_ATTEMPT_FILE="$TMPDIR_TEST/cas-attempt.count"
: > "$CAS_ATTEMPT_FILE"
_orch_apply_invoke() {
  local candidate attempt_n
  candidate=$(cat)
  echo x >> "$CAS_ATTEMPT_FILE"
  attempt_n=$(wc -l < "$CAS_ATTEMPT_FILE" | tr -d ' ')
  if [ "$attempt_n" -lt 3 ]; then
    return 2
  fi
  printf '%s' "$candidate" > "$SCRATCH_ORCH"
  return 0
}
OUT9=$(run_emit_signal --check-id A-20 --category-type signal_feedback --severity WARN \
  --summary "cas retry probe" --detail-json '{"dedup_key":"microservice_degraded:pdf-extractor:A-20"}')
RC9=$?
CAS_ATTEMPT=$(wc -l < "$CAS_ATTEMPT_FILE" | tr -d ' ')
check "T9 cas-retry succeeds on 3rd attempt exit=0" "$([ "$RC9" -eq 0 ] && echo true || echo false)"
check "T9 cas-retry attempted exactly 3 times" "$([ "$CAS_ATTEMPT" -eq 3 ] && echo true || echo false)"
check "T9 cas-retry no ABORT marker on eventual success" "$(! printf '%s' "$OUT9" | grep -q 'ABORT' && echo true || echo false)"

# ── T10: CAS-exhausted — orch-apply.sh returns 2,2,2 across 3 calls —
# distinct e3-cas-exhausted marker, non-dedup BUG telegram ─────────────────
reset_case
CAS_ATTEMPT2_FILE="$TMPDIR_TEST/cas-attempt2.count"
: > "$CAS_ATTEMPT2_FILE"
_orch_apply_invoke() { cat >/dev/null; echo x >> "$CAS_ATTEMPT2_FILE"; return 2; }
OUT10=$(run_emit_signal --check-id A-21 --category-type signal_feedback --severity WARN \
  --summary "cas exhausted probe" --detail-json '{"dedup_key":"microservice_degraded:x:A-21"}')
RC10=$?
CAS_ATTEMPT2=$(wc -l < "$CAS_ATTEMPT2_FILE" | tr -d ' ')
check "T10 cas-exhausted non-zero exit" "$([ "$RC10" -ne 0 ] && echo true || echo false)"
check "T10 cas-exhausted marker distinct from write-failed" "$(printf '%s' "$OUT10" | grep -q '^\[emit-signal\] ABORT e3-cas-exhausted rc=2' && echo true || echo false)"
check "T10 cas-exhausted attempted exactly 3 times" "$([ "$CAS_ATTEMPT2" -eq 3 ] && echo true || echo false)"
check "T10 cas-exhausted triggers non-dedup BUG telegram" "$(grep -q '^CALL: send_telegram' "$CALL_LOG" && echo true || echo false)"

# ── T11: malformed --detail-json — usage error, exit 2, no calls at all ─────
reset_case
OUT11=$(run_emit_signal --check-id X --category-type foo --severity WARN --summary "s" --detail-json 'not json')
RC11=$?
check "T11 malformed-detail-json exit=2" "$([ "$RC11" -eq 2 ] && echo true || echo false)"
check "T11 malformed-detail-json marker" "$(printf '%s' "$OUT11" | grep -q '^\[emit-signal\] ABORT malformed-detail-json' && echo true || echo false)"
check "T11 malformed-detail-json no mcp calls" "$([ ! -s "$CALL_LOG" ] && echo true || echo false)"

# ── T12: --no-telegram — E-1 fires, E-2 skipped, row still written ─────────
reset_case
OUT12=$(run_emit_signal --check-id B-06 --category-type data_stale --severity WARN \
  --summary "no telegram probe" --detail-json '{"dedup_key":"data_stale:y:B-06"}' --no-telegram)
RC12=$?
check "T12 no-telegram exit=0" "$([ "$RC12" -eq 0 ] && echo true || echo false)"
check "T12 no-telegram marker" "$(printf '%s' "$OUT12" | grep -q '^\[emit-signal\] OK no-telegram ' && echo true || echo false)"
check "T12 no-telegram E-1 still fires" "$([ "$(call_count_for post_agent_signal)" -eq 1 ] && echo true || echo false)"
check "T12 no-telegram E-2 skipped" "$([ "$(call_count_for send_telegram)" -eq 0 ] && echo true || echo false)"

# ── T13/T14/T15: FIX-AUDITOR-CALLER-PROSE-OVERRIDES-DOCUMENTED-DETECTOR-
# THRESHOLD §3 — every row _build_row_json() constructs carries
# provenance:"detector", unconditional on args. Checked across 3 distinct
# call shapes (plain dedup path / --e3-only / CAS-retry) since those are the
# shapes most likely to diverge if a future edit re-parameterizes the
# single row-construction choke point. ──────────────────────────────────────
row_provenance() {
  jq -r --arg id "$1" '[.signal_queue.rows[] | select(.id==$id)][0].provenance // "MISSING"' "$SCRATCH_ORCH"
}

# T13: plain dedup path (mirrors T1's call shape)
reset_case
OUT13=$(run_emit_signal --check-id B-04 --category-type data_stale --severity WARN \
  --summary "provenance check" \
  --detail-json '{"dedup_key":"data_stale:PROVTEST:B-04"}')
RC13=$?
ROW_ID13=$(printf '%s' "$OUT13" | grep -o 'id=[^ ]*$' | cut -d= -f2)
check "T13 exit=0" "$([ "$RC13" -eq 0 ] && echo true || echo false)"
check "T13 row always carries provenance=detector (plain path)" "$([ "$(row_provenance "$ROW_ID13")" = "detector" ] && echo true || echo false)"

# T14: --e3-only path (mirrors T5's call shape)
reset_case
OUT14=$(run_emit_signal --check-id IMP-1 --category-type improvement_proposal --severity INFO \
  --summary "provenance e3-only check" --detail-json '{}' --e3-only)
ROW_ID14=$(printf '%s' "$OUT14" | grep -o 'id=[^ ]*' | head -1 | cut -d= -f2)
check "T14 e3-only path row also carries provenance=detector" "$([ "$(row_provenance "$ROW_ID14")" = "detector" ] && echo true || echo false)"

# T15: CAS-retry path (mirrors T9's call shape — succeeds on 3rd attempt)
reset_case
CAS_ATTEMPT3_FILE="$TMPDIR_TEST/cas-attempt3.count"
: > "$CAS_ATTEMPT3_FILE"
_orch_apply_invoke() {
  local candidate attempt_n
  candidate=$(cat)
  echo x >> "$CAS_ATTEMPT3_FILE"
  attempt_n=$(wc -l < "$CAS_ATTEMPT3_FILE" | tr -d ' ')
  if [ "$attempt_n" -lt 3 ]; then
    return 2
  fi
  printf '%s' "$candidate" > "$SCRATCH_ORCH"
  return 0
}
OUT15=$(run_emit_signal --check-id A-20 --category-type signal_feedback --severity WARN \
  --summary "provenance cas retry probe" --detail-json '{"dedup_key":"microservice_degraded:pdf-extractor:A-20-prov"}')
ROW_ID15=$(printf '%s' "$OUT15" | grep -o 'id=[^ ]*$' | cut -d= -f2)
check "T15 CAS-retry path row also carries provenance=detector" "$([ "$(row_provenance "$ROW_ID15")" = "detector" ] && echo true || echo false)"

# ── T16-T18: FIX-AUDITOR-OUTPUT-CONTRACT-SIGNALSPOSTED-COUNTS-CALLS-NOT-
# CONFIRMED-ROWS (AC-1/AC-2/AC-3) — mcp_call returning rc=0 is NOT sufficient
# evidence a row landed in agent_signals; _run_e1() must ABORT (never count
# toward signals_posted, never reach E-3) on any of: (a) tool reports
# success:false (dedup no-op), (b) tool reports success:true with a
# signal_id<=0 sentinel, (c) tool's response is an Error:-prefixed text body,
# (d) the mandatory read-back cannot find the claimed id. ───────────────────

# T16: tool reports success:false (e.g. dedup-suppressed, post-fix tool-side
# contract) — must ABORT e1-not-written, never reach E-3.
reset_case
POST_SIGNAL_FORCE_SUCCESS="false"
BEFORE_COUNT16=$(jq '.signal_queue.rows | length' "$SCRATCH_ORCH")
OUT16=$(run_emit_signal --check-id B-07 --category-type data_stale --severity WARN \
  --summary "e1 not-written probe (success:false)" --detail-json '{"dedup_key":"data_stale:T16:B-07"}')
RC16=$?
AFTER_COUNT16=$(jq '.signal_queue.rows | length' "$SCRATCH_ORCH")
check "T16 success:false non-zero exit" "$([ "$RC16" -ne 0 ] && echo true || echo false)"
check "T16 success:false marker ABORT e1-not-written" "$(printf '%s' "$OUT16" | grep -q '^\[emit-signal\] ABORT e1-not-written' && echo true || echo false)"
check "T16 success:false never reached E-3 (signal_queue row count unchanged)" "$([ "$BEFORE_COUNT16" -eq "$AFTER_COUNT16" ] && echo true || echo false)"

# T17: tool reports success:true but signal_id is the -1 sentinel (the exact
# pre-fix tool-side defect this task also closes on the TypeScript side) —
# _run_e1() must not trust `success:true` alone.
reset_case
POST_SIGNAL_FORCE_ID="-1"
OUT17=$(run_emit_signal --check-id B-08 --category-type data_stale --severity WARN \
  --summary "e1 not-written probe (signal_id=-1)" --detail-json '{"dedup_key":"data_stale:T17:B-08"}')
RC17=$?
check "T17 signal_id=-1 non-zero exit" "$([ "$RC17" -ne 0 ] && echo true || echo false)"
check "T17 signal_id=-1 marker ABORT e1-not-written" "$(printf '%s' "$OUT17" | grep -q '^\[emit-signal\] ABORT e1-not-written' && echo true || echo false)"

# T18: tool response is a non-JSON, Error:-prefixed text body. In production
# the REAL mcp-call.sh now rejects this at the transport layer (AC-4, see
# scripts/agents-flow/mcp-call.test.sh T3) and _run_e1 would see rc!=0
# (e1-failed). This test's stub bypasses mcp-call.sh entirely (it overrides
# mcp_call() directly), so it instead exercises _run_e1's OWN belt-and-
# suspenders JSON-body check: unparseable/non-JSON text can never satisfy
# `success===true`, so this still ABORTs (e1-not-written) rather than being
# miscounted as a success — defense in depth, not reliant on only one layer.
reset_case
POST_SIGNAL_FORCE_TEXT="Error: database disk image is malformed (simulated corrupt btree)"
OUT18=$(run_emit_signal --check-id B-09 --category-type data_stale --severity CRITICAL \
  --summary "e1 error-text probe" --detail-json '{"dedup_key":"data_stale:T18:B-09"}')
RC18=$?
check "T18 error-text non-zero exit" "$([ "$RC18" -ne 0 ] && echo true || echo false)"
check "T18 error-text marker ABORT e1-not-written (belt-and-suspenders JSON-body check)" "$(printf '%s' "$OUT18" | grep -q '^\[emit-signal\] ABORT e1-not-written' && echo true || echo false)"

# T19: mandatory read-back cannot find the claimed id — write claimed but
# never confirmed present in agent_signals. ABORT + non-dedup-gated BUG
# telegram (mirrors the E-3 readback-failure treatment, T7 above).
reset_case
OUT19_BEFORE_TELEGRAM_COUNT=$(call_count_for send_telegram)
READBACK_FORCE_MISS="true"
OUT19=$(run_emit_signal --check-id B-10 --category-type data_stale --severity HIGH \
  --summary "e1 readback-miss probe" --detail-json '{"dedup_key":"data_stale:T19:B-10"}')
RC19=$?
check "T19 readback-miss non-zero exit" "$([ "$RC19" -ne 0 ] && echo true || echo false)"
check "T19 readback-miss marker ABORT e1-readback-failed" "$(printf '%s' "$OUT19" | grep -q '^\[emit-signal\] ABORT e1-readback-failed' && echo true || echo false)"
check "T19 readback-miss triggers non-dedup BUG telegram" "$([ "$(call_count_for send_telegram)" -gt "$OUT19_BEFORE_TELEGRAM_COUNT" ] && echo true || echo false)"
check "T19 readback-miss get_agent_signals WAS called (mandatory read-back ran)" "$([ "$(call_count_for get_agent_signals)" -ge 1 ] && echo true || echo false)"

# T20: happy path — realistic post_agent_signal + confirming read-back, both
# succeed. Locks in that the new mandatory read-back does not break the
# normal, everything-works flow (T1's call shape, replayed against the now-
# realistic stub instead of the pre-fix bare `'{}'`).
reset_case
OUT20=$(run_emit_signal --check-id B-11 --category-type data_stale --severity WARN \
  --summary "e1 happy-path read-back probe" --detail-json '{"dedup_key":"data_stale:T20:B-11"}')
RC20=$?
check "T20 happy-path exit=0" "$([ "$RC20" -eq 0 ] && echo true || echo false)"
check "T20 happy-path marker OK" "$(printf '%s' "$OUT20" | grep -q '^\[emit-signal\] OK dedup_key=' && echo true || echo false)"
check "T20 happy-path get_agent_signals WAS called (mandatory read-back ran)" "$([ "$(call_count_for get_agent_signals)" -ge 1 ] && echo true || echo false)"

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
