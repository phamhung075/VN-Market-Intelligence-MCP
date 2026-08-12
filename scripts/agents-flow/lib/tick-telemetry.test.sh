#!/usr/bin/env bash
# scripts/agents-flow/lib/tick-telemetry.test.sh
#
# Regression suite for WU-0 (TICK-PREFLIGHT-USAGE-INSTRUMENTATION) —
# scripts/agents-flow/lib/tick-telemetry.sh. Must be GREEN before WU-1/WU-2/
# WU-3 wire this lib into cowork-tick-preflight.sh / dev-team-tick-
# preflight.sh / auditor-tier1-probe.sh (PO's WU-0-gates-the-rest ordering,
# AC-10).
#
# Isolated tmp-fixture root (never the real project data) — follows the same
# pattern as cowork-tick-preflight.test.sh's TMPDIR_TEST. NFR-4: reuses that
# existing isolation mechanism, does not invent a second one. Every test
# below sets TICK_TELEMETRY_LOG_PATH explicitly via a per-command inline
# prefix assignment (`VAR=val fn`, confirmed to correctly scope to a single
# shell-function call and restore afterward — bash extends POSIX temporary-
# assignment semantics to functions, not just external commands) — this is
# the ONE seam every caller can rely on, including auditor-tier1-probe.sh,
# which (per R2) has no PREFLIGHT_ROOT-equivalent test override for
# REPO_ROOT.
#
# Run:
#   bash scripts/agents-flow/lib/tick-telemetry.test.sh
# Exit 0 = all pass. Exit 1 = >=1 failure.
# Owning task: TICK-WU-0-TELEMETRY-LIB
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LIB_SH="$SCRIPT_DIR/tick-telemetry.sh"

if [ ! -f "$LIB_SH" ]; then
  echo "ERROR: lib not found at $LIB_SH" >&2
  exit 1
fi

TMPDIR_TEST=$(mktemp -d /private/tmp/tick-telemetry-test-XXXXXX)
cleanup() { rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT

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

# ── Source the lib under test ─────────────────────────────────────────────
# shellcheck source=./tick-telemetry.sh
source "$LIB_SH"

# ── T1: log_tick_usage — one line per call, correct fields, cowork/dev-team
#     shape (verdict JSON has a "tick" key) ─────────────────────────────────
LOG1="$TMPDIR_TEST/t1.jsonl"
TICK_TELEMETRY_LOG_PATH="$LOG1" log_tick_usage "cowork-tick-preflight.sh" \
  '{"verdict":"SILENT","tick":"2026-08-12T13:45Z","drift_min":0,"slots":[],"one_shots":[],"new_signals":0,"detail":""}' \
  "123" "0"
LINE_COUNT_T1=$(wc -l < "$LOG1" 2>/dev/null | tr -d ' ')
check "T1 exactly one line written per call" "$([ "$LINE_COUNT_T1" -eq 1 ] && echo true || echo false)"
check "T1 verdict extracted" "$([ "$(jq -r '.verdict' "$LOG1")" = "SILENT" ] && echo true || echo false)"
check "T1 tick extracted (cowork/dev-team shape)" "$([ "$(jq -r '.tick' "$LOG1")" = "2026-08-12T13:45Z" ] && echo true || echo false)"
check "T1 script field verbatim" "$([ "$(jq -r '.script' "$LOG1")" = "cowork-tick-preflight.sh" ] && echo true || echo false)"
check "T1 elapsed_ms numeric" "$([ "$(jq -r '.elapsed_ms' "$LOG1")" -eq 123 ] && echo true || echo false)"
check "T1 exit_code numeric" "$([ "$(jq -r '.exit_code' "$LOG1")" -eq 0 ] && echo true || echo false)"
check "T1 ts is real wallclock ISO8601 (never hand-typed)" \
  "$([[ "$(jq -r '.ts' "$LOG1")" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] && echo true || echo false)"
check "T1 field set is exactly 7 keys (FR-5 'no more, no less')" "$([ "$(jq -r 'keys | length' "$LOG1")" -eq 7 ] && echo true || echo false)"
check "T1 no CLAUDE_CODE_SESSION_ID-shaped key anywhere in the line (scope_out f)" \
  "$([ "$(jq -r 'has("session_id") or has("session") or has("claude_code_session_id")' "$LOG1")" = "false" ] && echo true || echo false)"

# O_APPEND: a second call must ADD a line, never overwrite the first.
TICK_TELEMETRY_LOG_PATH="$LOG1" log_tick_usage "cowork-tick-preflight.sh" '{"verdict":"WORK","tick":"2026-08-12T14:00Z"}' "45" "1"
LINE_COUNT_T1B=$(wc -l < "$LOG1" 2>/dev/null | tr -d ' ')
check "T1b second call appends (2 lines total — O_APPEND, not overwrite)" "$([ "$LINE_COUNT_T1B" -eq 2 ] && echo true || echo false)"
check "T1b first line unchanged after second append" "$([ "$(sed -n '1p' "$LOG1" | jq -r '.verdict')" = "SILENT" ] && echo true || echo false)"

# ── T2: auditor tier-1 shape (run_probe() output — NO "tick" key at all) ───
LOG2="$TMPDIR_TEST/t2.jsonl"
TICK_TELEMETRY_LOG_PATH="$LOG2" log_tick_usage "auditor-tier1-probe.sh" \
  '{"verdict":"ALL_GREEN","detail":"all 6 checks passed","last_healthy_at":"2026-08-12T13:45:00Z"}' "88" "0"
check "T2 auditor tier-1 shape verdict extracted" "$([ "$(jq -r '.verdict' "$LOG2")" = "ALL_GREEN" ] && echo true || echo false)"
check "T2 auditor tier-1 shape: missing tick key -> JSON null (never re-derived, never crashes)" \
  "$([ "$(jq -r '.tick == null' "$LOG2")" = "true" ] && echo true || echo false)"

# ── T3: auditor tier-2/3 wrapper shape (different field set again, no "tick",
#     different verdict vocabulary SKIP-SPAWN|SPAWN) ────────────────────────
LOG3="$TMPDIR_TEST/t3.jsonl"
TICK_TELEMETRY_LOG_PATH="$LOG3" log_tick_usage "auditor-tier1-probe.sh" \
  '{"tier":2,"checks_verdict":"ALL_GREEN","verdict":"SKIP-SPAWN","detail":"fresh","last_healthy_at":"2026-08-12T13:00:00Z","fresh_threshold_minutes":30,"heartbeat_age_minutes":5}' \
  "60" "0"
check "T3 auditor tier-2/3 shape verdict extracted (SKIP-SPAWN vocabulary)" "$([ "$(jq -r '.verdict' "$LOG3")" = "SKIP-SPAWN" ] && echo true || echo false)"
check "T3 auditor tier-2/3 shape tick is JSON null" "$([ "$(jq -r '.tick == null' "$LOG3")" = "true" ] && echo true || echo false)"

# ── T4: verdict_bytes is a TRUE byte count (wc -c), multi-byte-UTF-8-safe —
#     NOT bash ${#var} character count, which would silently undercount ────
LOG4="$TMPDIR_TEST/t4.jsonl"
MULTIBYTE_JSON='{"verdict":"WORK","tick":"2026-08-12T14:00Z","detail":"Việt Nam thị trường"}'
EXPECTED_BYTES=$(printf '%s' "$MULTIBYTE_JSON" | wc -c | tr -d ' ')
TICK_TELEMETRY_LOG_PATH="$LOG4" log_tick_usage "cowork-tick-preflight.sh" "$MULTIBYTE_JSON" "10" "0"
check "T4 verdict_bytes == real wc -c byte count (multi-byte UTF-8 safe)" \
  "$([ "$(jq -r '.verdict_bytes' "$LOG4")" -eq "$EXPECTED_BYTES" ] && echo true || echo false)"
CHAR_COUNT_T4=${#MULTIBYTE_JSON}
check "T4 sanity: byte count differs from bash char count on multi-byte text (proves wc -c, not \${#var}, is load-bearing)" \
  "$([ "$EXPECTED_BYTES" -ne "$CHAR_COUNT_T4" ] && echo true || echo false)"

# ── T5: elapsed_ms — EPOCHREALTIME-unset path (this session's live reality:
#     macOS system bash 3.2.57, confirmed unset) ────────────────────────────
unset EPOCHREALTIME 2>/dev/null || true
_t5_fn() { printf '%s' '{"verdict":"SILENT","tick":"2026-08-12T14:15Z"}'; }
LOG5="$TMPDIR_TEST/t5.jsonl"
OUT_T5=$(TICK_TELEMETRY_LOG_PATH="$LOG5" tt_capture_and_log "cowork-tick-preflight.sh" _t5_fn)
check "T5 EPOCHREALTIME-unset path: elapsed_ms present and numeric (second-precision degrade)" \
  "$([[ "$(jq -r '.elapsed_ms' "$LOG5")" =~ ^[0-9]+$ ]] && echo true || echo false)"
check "T5 EPOCHREALTIME-unset path: verdict still reaches caller correctly" \
  "$([ "$(printf '%s' "$OUT_T5" | jq -r '.verdict')" = "SILENT" ] && echo true || echo false)"

# ── T6: elapsed_ms — EPOCHREALTIME-available path (forced via env, exercises
#     the sub-second branch that is dead code on this dev machine's bash 3.2
#     but live on the GNU/bash5+ cron host) ─────────────────────────────────
LOG6="$TMPDIR_TEST/t6.jsonl"
EPOCHREALTIME="1700000000.123456"
OUT_T6=$(TICK_TELEMETRY_LOG_PATH="$LOG6" tt_capture_and_log "cowork-tick-preflight.sh" _t5_fn)
unset EPOCHREALTIME
check "T6 EPOCHREALTIME-available path: elapsed_ms present and numeric" \
  "$([[ "$(jq -r '.elapsed_ms' "$LOG6")" =~ ^[0-9]+$ ]] && echo true || echo false)"
check "T6 EPOCHREALTIME-available path: verdict still reaches caller correctly" \
  "$([ "$(printf '%s' "$OUT_T6" | jq -r '.verdict')" = "SILENT" ] && echo true || echo false)"

# ── T6b: tt_epoch_ms unit test — leading-zero EPOCHREALTIME microseconds
#     must NEVER be misread as octal. "089" is not a valid octal literal —
#     the architect blueprint's un-prefixed pseudocode crashes bash
#     arithmetic outright on this exact input (this file's tt_epoch_ms fixes
#     it via the `10#` base prefix; see its header comment + this task's
#     decision journal entry for the documented deviation). ────────────────
EPOCHREALTIME="1700000000.089123"
T6B_RESULT=$(tt_epoch_ms 2>&1)
T6B_RC=$?
unset EPOCHREALTIME
check "T6b leading-zero-octal guard: EPOCHREALTIME fractional '089...' does not crash" "$([ "$T6B_RC" -eq 0 ] && echo true || echo false)"
check "T6b leading-zero-octal guard: '089' parsed as decimal 89ms (not octal-invalid, not silently wrong)" \
  "$([ "$T6B_RESULT" -eq 1700000000089 ] && echo true || echo false)"

# Second regression case: a leading-zero value that IS valid (but wrong)
# octal — "052" as octal is 42, not 52. A regression back to the un-prefixed
# form would pass T6b's crash check (052 is valid octal) but silently
# corrupt the VALUE — this is the actual defect class, not just the crash.
EPOCHREALTIME="1700000000.052999"
T6C_RESULT=$(tt_epoch_ms 2>&1)
unset EPOCHREALTIME
check "T6c leading-zero-octal guard: '052' parsed as decimal 52ms, not octal 42ms" \
  "$([ "$T6C_RESULT" -eq 1700000000052 ] && echo true || echo false)"

# ── T7: rotation fires at cap, preserves NEWEST N lines, atomic tmp+mv
#     (no stray .tmp.* artifact left behind) ────────────────────────────────
LOG7="$TMPDIR_TEST/t7.jsonl"
i=1
while [ "$i" -le 15 ]; do
  TICK_TELEMETRY_LOG_PATH="$LOG7" TICK_TELEMETRY_MAX_LINES=10 \
    log_tick_usage "cowork-tick-preflight.sh" "{\"verdict\":\"SILENT\",\"tick\":\"seq-$i\"}" "1" "0"
  i=$((i + 1))
done
LINE_COUNT_T7=$(wc -l < "$LOG7" 2>/dev/null | tr -d ' ')
check "T7 rotation caps the file at TICK_TELEMETRY_MAX_LINES (10), not the 15 appended" "$([ "$LINE_COUNT_T7" -eq 10 ] && echo true || echo false)"
check "T7 rotation preserves the NEWEST line (seq-15, the most recent append)" "$([ "$(tail -1 "$LOG7" | jq -r '.tick')" = "seq-15" ] && echo true || echo false)"
check "T7 rotation preserves exactly the newest N (first surviving line is seq-6)" "$([ "$(sed -n '1p' "$LOG7" | jq -r '.tick')" = "seq-6" ] && echo true || echo false)"
check "T7 atomic tmp+mv leaves no stray .tmp.* rotation artifact behind" \
  "$([ -z "$(find "$TMPDIR_TEST" -maxdepth 1 -name 't7.jsonl.tmp.*' 2>/dev/null)" ] && echo true || echo false)"

# Non-numeric TICK_TELEMETRY_MAX_LINES must never crash rotation (defensive
# guard) — degrades to "no rotation this call", not a crash.
LOG7B="$TMPDIR_TEST/t7b.jsonl"
TICK_TELEMETRY_LOG_PATH="$LOG7B" TICK_TELEMETRY_MAX_LINES="not-a-number" \
  log_tick_usage "cowork-tick-preflight.sh" '{"verdict":"SILENT"}' "1" "0"
RC_T7B=$?
check "T7b non-numeric TICK_TELEMETRY_MAX_LINES never crashes log_tick_usage (returns 0)" "$([ "$RC_T7B" -eq 0 ] && echo true || echo false)"
check "T7b non-numeric TICK_TELEMETRY_MAX_LINES: the line still got written (rotation skip != write skip)" "$([ -f "$LOG7B" ] && echo true || echo false)"

# ── T8: AC-4 negative control — logger failure never changes
#     tt_capture_and_log's returned $rc (the WRAPPED function's real rc) ────
log_tick_usage() { return 1; }   # fault-injected: logger itself "fails"
_t8_fn_rc7() { printf '%s' '{"verdict":"ERROR"}'; return 7; }
OUT_T8=$(tt_capture_and_log "cowork-tick-preflight.sh" _t8_fn_rc7)
RC_T8=$?
check "T8 AC-4: logger returning failure does not change wrapper's returned rc (still 7)" "$([ "$RC_T8" -eq 7 ] && echo true || echo false)"
check "T8 AC-4: verdict still reaches caller's stdout despite logger fault" \
  "$([ "$(printf '%s' "$OUT_T8" | jq -r '.verdict')" = "ERROR" ] && echo true || echo false)"
unset -f log_tick_usage
# shellcheck source=./tick-telemetry.sh
source "$LIB_SH"   # restore the REAL log_tick_usage after the fault injection

# ── T9: AC-5 negative control — unwritable log destination (missing parent
#     dir that cannot be created) -> silent no-op, real $rc still preserved.
#     Uses a FILE occupying a path component mkdir -p cannot turn into a
#     directory — portable across root/non-root test runners, unlike a
#     chmod-based block (which a root-run suite would silently defeat) ─────
BLOCKER_FILE="$TMPDIR_TEST/blocker-not-a-dir"
touch "$BLOCKER_FILE"
UNWRITABLE_LOG="$BLOCKER_FILE/sub/telemetry.jsonl"
_t9_fn_rc3() { printf '%s' '{"verdict":"WORK","tick":"2026-08-12T14:30Z"}'; return 3; }
OUT_T9=$(TICK_TELEMETRY_LOG_PATH="$UNWRITABLE_LOG" tt_capture_and_log "cowork-tick-preflight.sh" _t9_fn_rc3)
RC_T9=$?
check "T9 AC-5: unwritable log destination -> tt_capture_and_log still returns wrapped fn's real rc (3)" "$([ "$RC_T9" -eq 3 ] && echo true || echo false)"
check "T9 AC-5: verdict JSON still reaches caller's stdout unaffected" "$([ "$(printf '%s' "$OUT_T9" | jq -r '.verdict')" = "WORK" ] && echo true || echo false)"
LOG_TICK_RC_T9=$(TICK_TELEMETRY_LOG_PATH="$UNWRITABLE_LOG" log_tick_usage "cowork-tick-preflight.sh" '{"verdict":"WORK"}' "1" "0"; echo $?)
check "T9 AC-5: log_tick_usage itself returns 0 (silent degrade, never propagated) even when destination unwritable" "$([ "$LOG_TICK_RC_T9" -eq 0 ] && echo true || echo false)"

# ── T10: AC-6/R1 negative control — fault-injected logger that WRITES TO
#     REAL STDOUT must not leak past tt_capture_and_log's own redirect guard;
#     verdict stays FIRST and ONLY thing on stdout ──────────────────────────
log_tick_usage() { echo "INJECTED-LEAK-TO-STDOUT"; return 0; }
_t10_fn_verdict() { printf '%s' '{"verdict":"SILENT","tick":"2026-08-12T14:45Z"}'; }
OUT_T10=$(tt_capture_and_log "cowork-tick-preflight.sh" _t10_fn_verdict)
unset -f log_tick_usage
# shellcheck source=./tick-telemetry.sh
source "$LIB_SH"   # restore the REAL log_tick_usage after the fault injection
check "T10 AC-6/R1: fault-injected logger stdout-write does NOT leak into caller's captured stdout" \
  "$([[ "$OUT_T10" != *"INJECTED-LEAK-TO-STDOUT"* ]] && echo true || echo false)"
check "T10 AC-6/R1: verdict line is the ONLY line on stdout (line count <= 1)" \
  "$([ "$(printf '%s' "$OUT_T10" | wc -l | tr -d ' ')" -le 1 ] && echo true || echo false)"
check "T10 AC-6/R1: verdict line is the FIRST (and only) thing — still parses as the real verdict" \
  "$([ "$(printf '%s' "$OUT_T10" | jq -r '.verdict')" = "SILENT" ] && echo true || echo false)"

# ── T11: AC-2 — reprint is byte-identical to the wrapped fn's real output ──
_t11_fn_exact() { printf '%s' '{"verdict":"WORK","tick":"2026-08-12T15:00Z","slots":[{"slot_id":"news-scout-market"}]}'; }
LOG11="$TMPDIR_TEST/t11.jsonl"
OUT_T11=$(TICK_TELEMETRY_LOG_PATH="$LOG11" tt_capture_and_log "cowork-tick-preflight.sh" _t11_fn_exact)
EXPECTED_T11='{"verdict":"WORK","tick":"2026-08-12T15:00Z","slots":[{"slot_id":"news-scout-market"}]}'
check "T11 AC-2: tt_capture_and_log reprints fn's output byte-identical" "$([ "$OUT_T11" = "$EXPECTED_T11" ] && echo true || echo false)"

# ── T12: exit_code — real post-return $? propagates through both success and
#     non-zero paths; the log line's own exit_code field matches ───────────
_t12_fn_ok() { printf '%s' '{"verdict":"SILENT"}'; return 0; }
_t12_fn_err() { printf '%s' '{"verdict":"ERROR"}'; return 1; }
LOG12="$TMPDIR_TEST/t12.jsonl"
TICK_TELEMETRY_LOG_PATH="$LOG12" tt_capture_and_log "cowork-tick-preflight.sh" _t12_fn_ok >/dev/null; RC12A=$?
TICK_TELEMETRY_LOG_PATH="$LOG12" tt_capture_and_log "cowork-tick-preflight.sh" _t12_fn_err >/dev/null; RC12B=$?
check "T12 exit_code: caller rc=0 propagates" "$([ "$RC12A" -eq 0 ] && echo true || echo false)"
check "T12 exit_code: caller rc=1 propagates (not swallowed by a successful log write)" "$([ "$RC12B" -eq 1 ] && echo true || echo false)"
check "T12 log line 1 exit_code field == 0" "$([ "$(sed -n '1p' "$LOG12" | jq -r '.exit_code')" -eq 0 ] && echo true || echo false)"
check "T12 log line 2 exit_code field == 1" "$([ "$(sed -n '2p' "$LOG12" | jq -r '.exit_code')" -eq 1 ] && echo true || echo false)"

# ── T13: malformed captured JSON never crashes log_tick_usage — degrades to
#     UNKNOWN verdict, tick null, still returns 0 (AC-4 contract) ──────────
LOG13="$TMPDIR_TEST/t13.jsonl"
TICK_TELEMETRY_LOG_PATH="$LOG13" log_tick_usage "dev-team-tick-preflight.sh" 'not valid json at all' "5" "0"
RC13=$?
check "T13 malformed captured JSON: log_tick_usage still returns 0" "$([ "$RC13" -eq 0 ] && echo true || echo false)"
check "T13 malformed captured JSON: verdict defaults to UNKNOWN (R6 defensive degrade), never crashes" \
  "$([ -f "$LOG13" ] && [ "$(jq -r '.verdict' "$LOG13")" = "UNKNOWN" ] && echo true || echo false)"

# ── T14: log_tick_usage itself never prints to real stdout on the happy path
#     (the underlying property AC-6/NFR-3's guard depends on) ──────────────
LOG14="$TMPDIR_TEST/t14.jsonl"
DIRECT_STDOUT_T14=$(TICK_TELEMETRY_LOG_PATH="$LOG14" log_tick_usage "cowork-tick-preflight.sh" '{"verdict":"SILENT"}' "1" "0")
check "T14 log_tick_usage prints NOTHING to stdout on the happy path" "$([ -z "$DIRECT_STDOUT_T14" ] && echo true || echo false)"

# ── T15: Q6 root-resolution precedence ──────────────────────────────────────
EXPLICIT_PATH="$TMPDIR_TEST/t15-explicit.jsonl"
FAKE_ROOT="$TMPDIR_TEST/t15-fake-root"
mkdir -p "$FAKE_ROOT"
RESOLVED_T15=$(TICK_TELEMETRY_LOG_PATH="$EXPLICIT_PATH" PREFLIGHT_ROOT="$FAKE_ROOT" REPO_ROOT="$FAKE_ROOT" _tt_log_path "cowork-tick-preflight.sh")
check "T15 TICK_TELEMETRY_LOG_PATH takes precedence over PREFLIGHT_ROOT/REPO_ROOT" "$([ "$RESOLVED_T15" = "$EXPLICIT_PATH" ] && echo true || echo false)"

RESOLVED_T15B=$(PREFLIGHT_ROOT="$FAKE_ROOT" REPO_ROOT="$TMPDIR_TEST/t15-should-not-win" _tt_log_path "cowork-tick-preflight.sh")
check "T15b PREFLIGHT_ROOT takes precedence over REPO_ROOT when no explicit override" \
  "$([ "$RESOLVED_T15B" = "$FAKE_ROOT/docs/data/telemetry/cowork-tick-preflight.jsonl" ] && echo true || echo false)"

RESOLVED_T15C=$(REPO_ROOT="$FAKE_ROOT" _tt_log_path "auditor-tier1-probe.sh")
check "T15c R2: REPO_ROOT used when PREFLIGHT_ROOT absent (auditor's own root var, no PREFLIGHT_ROOT equivalent)" \
  "$([ "$RESOLVED_T15C" = "$FAKE_ROOT/docs/data/telemetry/auditor-tier1-probe.jsonl" ] && echo true || echo false)"

# ── T16: R2 — auditor logging tests need ONLY TICK_TELEMETRY_LOG_PATH (no
#     PREFLIGHT_ROOT/REPO_ROOT equivalent seam required) — proves the ONE
#     seam auditor's future WU-3 tests will need actually works end to end ──
LOG16="$TMPDIR_TEST/t16-auditor-explicit.jsonl"
TICK_TELEMETRY_LOG_PATH="$LOG16" log_tick_usage "auditor-tier1-probe.sh" '{"verdict":"FAILURE","detail":"disk"}' "20" "1"
check "T16 R2: auditor logging via ONLY TICK_TELEMETRY_LOG_PATH (no PREFLIGHT_ROOT/REPO_ROOT set) writes correctly" \
  "$([ "$(jq -r '.verdict' "$LOG16")" = "FAILURE" ] && echo true || echo false)"

# ── T17: _tt_log_path filename strips trailing ".sh" ────────────────────────
STRIP_PATH=$(PREFLIGHT_ROOT="$FAKE_ROOT" _tt_log_path "dev-team-tick-preflight.sh")
check "T17 filename strips trailing .sh (dev-team-tick-preflight.jsonl, not .sh.jsonl)" \
  "$([ "$STRIP_PATH" = "$FAKE_ROOT/docs/data/telemetry/dev-team-tick-preflight.jsonl" ] && echo true || echo false)"

# ── T18: self-creates missing parent dir on first run (fresh clone/VPS —
#     BA spec Edge Cases ruling: architect chose self-create over refuse) ──
FRESH_ROOT="$TMPDIR_TEST/t18-fresh-clone-sim"
FRESH_LOG="$FRESH_ROOT/docs/data/telemetry/cowork-tick-preflight.jsonl"
[ ! -d "$(dirname "$FRESH_LOG")" ] || { echo "FAIL: T18 fixture setup — dir should not pre-exist"; FAIL=$((FAIL + 1)); }
TICK_TELEMETRY_LOG_PATH="$FRESH_LOG" log_tick_usage "cowork-tick-preflight.sh" '{"verdict":"SILENT"}' "1" "0"
check "T18 self-creates missing parent dir tree on first run" "$([ -f "$FRESH_LOG" ] && echo true || echo false)"

# ── T19: default TICK_TELEMETRY_MAX_LINES (5000) never rotates a small file ──
LOG19="$TMPDIR_TEST/t19.jsonl"
i=1
while [ "$i" -le 20 ]; do
  TICK_TELEMETRY_LOG_PATH="$LOG19" log_tick_usage "cowork-tick-preflight.sh" "{\"verdict\":\"SILENT\",\"tick\":\"seq-$i\"}" "1" "0"
  i=$((i + 1))
done
LINE_COUNT_T19=$(wc -l < "$LOG19" 2>/dev/null | tr -d ' ')
check "T19 default cap (5000) does not rotate a 20-line file (all 20 survive)" "$([ "$LINE_COUNT_T19" -eq 20 ] && echo true || echo false)"

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
