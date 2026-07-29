#!/usr/bin/env bash
# scripts/audit-output-contract.test.sh
#
# Regression test for scripts/audit-output-contract.sh
# (FIX-AUDITOR-DASHBOARD-APPEND-NO-ACTUATOR-CONTRACT-COUNT-NARRATED).
#
# Core proof this suite carries (AC-4 of the owning task): a narrated count
# that diverges from the actual marker/artifact evidence cannot silently
# pass — both the over-report direction (occurrences 1/2: narrated N, wrote
# 0) and the under-report direction (occurrence 3: narrated 0, wrote 1) are
# exercised, plus the previously-vacuous main.md:669 cross-check and its new
# dashboard_rows/headline siblings.
#
# Run:
#   bash scripts/audit-output-contract.test.sh
# Exit 0 = all pass. Exit 1 = >=1 failure.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTRACT_SH="$SCRIPT_DIR/audit-output-contract.sh"

if [ ! -f "$CONTRACT_SH" ]; then
  echo "ERROR: audit-output-contract.sh not found at $CONTRACT_SH" >&2
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

TMPDIR_TEST=$(mktemp -d /private/tmp/audit-output-contract-test-XXXXXX)
cleanup() { rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT

CALL_LOG="$TMPDIR_TEST/mcp-calls.log"

# shellcheck source=./audit-output-contract.sh
source "$CONTRACT_SH"

mcp_call() {
  local tool="${1:-}" args="${2:-}"
  echo "CALL: $tool $args" >> "$CALL_LOG"
  echo '{}'
  return 0
}

call_count_for() {
  local n
  n=$(grep -c "^CALL: $1 " "$CALL_LOG" 2>/dev/null)
  echo "${n:-0}"
}

reset_log() { : > "$CALL_LOG"; }

markers_file() {
  local f="$TMPDIR_TEST/markers-$RANDOM.txt"
  cat > "$f"
  echo "$f"
}

# ── T1: genuine ALL_GREEN — missing markers file — all counts 0, exit 0 ────
reset_log
OUT1=$(run_audit_output_contract --markers-file "$TMPDIR_TEST/does-not-exist.txt")
RC1=$?
check "T1 all-green missing-file exit=0" "$([ "$RC1" -eq 0 ] && echo true || echo false)"
check "T1 all-green contract line all zero" "$(printf '%s' "$OUT1" | grep -q '^\[OUTPUT-CONTRACT\] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=0$' && echo true || echo false)"
check "T1 all-green no BUG telegram" "$([ "$(call_count_for send_telegram)" -eq 0 ] && echo true || echo false)"

# ── T2: normal cycle — one fresh emit (telegram sent), one dashboard row ───
reset_log
MF2=$(markers_file <<'EOF'
[emit-signal] OK dedup_key=data_stale:x:B-05 id=sys-20260729T100000-aaaa
[emit-dashboard] OK id=sys-20260729T100000-aaaa check_id=B-05
EOF
)
OUT2=$(run_audit_output_contract --markers-file "$MF2")
RC2=$?
check "T2 normal-cycle exit=0" "$([ "$RC2" -eq 0 ] && echo true || echo false)"
check "T2 normal-cycle counts" "$(printf '%s' "$OUT2" | grep -q '^\[OUTPUT-CONTRACT\] signals_posted=1 | telegram_sent=1 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=0$' && echo true || echo false)"
check "T2 normal-cycle no violation" "$(! printf '%s' "$OUT2" | grep -q 'VIOLATION' && echo true || echo false)"

# ── T3: over-report class (occurrences 1/2) — agent CANNOT compose
# dashboard_rows=1 without a real [emit-dashboard] OK marker in the file;
# the parser only counts what is literally there. ──────────────────────────
reset_log
MF3=$(markers_file <<'EOF'
[emit-signal] OK dedup_key=data_stale:x:B-06 id=sys-20260729T100100-bbbb
EOF
)
# No [emit-dashboard] line at all — simulates the exact occurrence-1/2 bug
# (DASHBOARD.md append was never scripted, so no marker could ever exist).
OUT3=$(run_audit_output_contract --markers-file "$MF3")
RC3=$?
check "T3 over-report-class exit=1 (violation flagged, cannot pass)" "$([ "$RC3" -ne 0 ] && echo true || echo false)"
check "T3 over-report-class dashboard_rows=0 (no marker = no count, however the agent might narrate)" "$(printf '%s' "$OUT3" | grep -q 'dashboard_rows=0' && echo true || echo false)"
check "T3 over-report-class V3 violation fired" "$(printf '%s' "$OUT3" | grep -q '^\[OUTPUT-CONTRACT\] VIOLATION: signals emitted but no dashboard rows written$' && echo true || echo false)"
check "T3 over-report-class BUG telegram fired" "$([ "$(call_count_for send_telegram)" -ge 1 ] && echo true || echo false)"

# ── T4: under-report class (occurrence 3) — a SKIP-dedup marker (which
# STILL carries id=, i.e. E-3 wrote the row) must NOT collapse to 0. ───────
reset_log
MF4=$(markers_file <<'EOF'
[emit-signal] SKIP-dedup dedup_key=microservice_degraded:api-gateway:A-12 last_sent=2026-07-28T21:40:03Z id=sys-20260729T083834-4dd9
[emit-dashboard] OK id=sys-20260729T083834-4dd9 check_id=A-12
EOF
)
OUT4=$(run_audit_output_contract --markers-file "$MF4")
RC4=$?
check "T4 under-report-class exit=0 (no violation — this IS the correct, non-collapsed reading)" "$([ "$RC4" -eq 0 ] && echo true || echo false)"
check "T4 under-report-class signals_posted=1 (NOT 0)" "$(printf '%s' "$OUT4" | grep -q 'signals_posted=1' && echo true || echo false)"
check "T4 under-report-class signal_queue_rows_written=1 (NOT 0 — SKIP-dedup still carries id=)" "$(printf '%s' "$OUT4" | grep -q 'signal_queue_rows_written=1' && echo true || echo false)"
check "T4 under-report-class telegram_sent=0 (dedup correctly gated E-2 only)" "$(printf '%s' "$OUT4" | grep -q 'telegram_sent=0' && echo true || echo false)"
check "T4 under-report-class dedup_skipped=1" "$(printf '%s' "$OUT4" | grep -q 'dedup_skipped=1' && echo true || echo false)"

# ── T5: ABORT markers count toward nothing ──────────────────────────────
reset_log
MF5=$(markers_file <<'EOF'
[emit-signal] ABORT e3-write-failed rc=1
[emit-dashboard] ABORT write-failed mv-failed
EOF
)
OUT5=$(run_audit_output_contract --markers-file "$MF5")
RC5=$?
check "T5 abort-only exit=0 (nothing posted, nothing to violate)" "$([ "$RC5" -eq 0 ] && echo true || echo false)"
check "T5 abort-only all zero" "$(printf '%s' "$OUT5" | grep -q 'signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=0' && echo true || echo false)"

# ── T6: OK-escalation-bypass counts telegram_sent, e3-only/no-telegram do not ──
reset_log
MF6=$(markers_file <<'EOF'
[emit-signal] OK-escalation-bypass dedup_key=db_integrity_breach:t:C-08 prev_sev=2 new_sev=3 id=sys-20260729T100200-cccc
[emit-signal] OK e3-only id=sys-20260729T100300-dddd check_id=IMP-1
[emit-signal] OK no-telegram id=sys-20260729T100400-eeee check_id=B-06
[emit-dashboard] OK id=sys-20260729T100200-cccc check_id=C-08
[emit-dashboard] OK id=sys-20260729T100300-dddd check_id=IMP-1
[emit-dashboard] OK id=sys-20260729T100400-eeee check_id=B-06
EOF
)
OUT6=$(run_audit_output_contract --markers-file "$MF6")
check "T6 mixed-outcomes signals_posted=3" "$(printf '%s' "$OUT6" | grep -q 'signals_posted=3' && echo true || echo false)"
check "T6 mixed-outcomes signal_queue_rows_written=3" "$(printf '%s' "$OUT6" | grep -q 'signal_queue_rows_written=3' && echo true || echo false)"
check "T6 mixed-outcomes telegram_sent=1 (only escalation-bypass)" "$(printf '%s' "$OUT6" | grep -q 'telegram_sent=1' && echo true || echo false)"
check "T6 mixed-outcomes dashboard_rows=3" "$(printf '%s' "$OUT6" | grep -q 'dashboard_rows=3' && echo true || echo false)"

# ── T7: bare [post-agent-signal] OK contributes to signals_posted only,
# NEVER to signal_queue_rows_written (structural reason the two counters
# must be allowed to differ). ───────────────────────────────────────────────
reset_log
MF7=$(markers_file <<'EOF'
[post-agent-signal] OK telegram=no
EOF
)
OUT7=$(run_audit_output_contract --markers-file "$MF7")
RC7=$?
check "T7 bare-post-agent-signal exit=1 (V2: posted but no signal_queue row)" "$([ "$RC7" -ne 0 ] && echo true || echo false)"
check "T7 bare-post-agent-signal signals_posted=1" "$(printf '%s' "$OUT7" | grep -q 'signals_posted=1' && echo true || echo false)"
check "T7 bare-post-agent-signal signal_queue_rows_written=0" "$(printf '%s' "$OUT7" | grep -q 'signal_queue_rows_written=0' && echo true || echo false)"
check "T7 bare-post-agent-signal V2 violation fired" "$(printf '%s' "$OUT7" | grep -q '^\[OUTPUT-CONTRACT\] VIOLATION: signals emitted but no signal_queue rows written$' && echo true || echo false)"

# ── T8: RETURN-headline consistency — anomalies=0 while signals_posted>0 ──
reset_log
MF8=$(markers_file <<'EOF'
[emit-signal] OK dedup_key=microservice_degraded:api-gateway:A-12 id=sys-20260729T100500-ffff
[emit-dashboard] OK id=sys-20260729T100500-ffff check_id=A-12
EOF
)
OUT8=$(run_audit_output_contract --markers-file "$MF8" --anomalies-count 0 --next-token clean)
RC8=$?
check "T8 headline-mismatch exit=1" "$([ "$RC8" -ne 0 ] && echo true || echo false)"
check "T8 headline-mismatch V4 fired" "$(printf '%s' "$OUT8" | grep -q '^\[OUTPUT-CONTRACT\] VIOLATION: RETURN headline anomalies=0 but signals_posted>0$' && echo true || echo false)"
check "T8 headline-mismatch V5 fired" "$(printf '%s' "$OUT8" | grep -q '^\[OUTPUT-CONTRACT\] VIOLATION: RETURN NEXT=clean but signals_posted>0$' && echo true || echo false)"

# ── T9: independent signal_queue cross-check (V1) — scratch orch-state
# has 2 rows for this cycle-start-ts, markers file only accounts for 1 ─────
reset_log
SCRATCH_ORCH="$TMPDIR_TEST/orch-state.json"
jq -n '{signal_queue:{rows:[
  {id:"sys-a", ts:"2026-07-29T10:00:00Z", from:"system-auditor"},
  {id:"sys-b", ts:"2026-07-29T10:05:00Z", from:"system-auditor"}
]}}' > "$SCRATCH_ORCH"
MF9=$(markers_file <<'EOF'
[emit-signal] OK dedup_key=x:y:Z id=sys-a
[emit-dashboard] OK id=sys-a check_id=Z
EOF
)
OUT9=$(run_audit_output_contract --markers-file "$MF9" --cycle-start-ts "2026-07-29T09:55:00Z" --orch-state-file "$SCRATCH_ORCH")
RC9=$?
check "T9 independent-crosscheck exit=1 (mismatch detected)" "$([ "$RC9" -ne 0 ] && echo true || echo false)"
check "T9 independent-crosscheck V1 fired narrated=1 independent=2" "$(printf '%s' "$OUT9" | grep -q '^\[OUTPUT-CONTRACT\] VIOLATION: signal_queue_rows_written mismatch narrated=1 independent=2$' && echo true || echo false)"
check "T9 independent-crosscheck final count uses the HIGHER (ground-truth) value, never under-reports" "$(printf '%s' "$OUT9" | grep -q 'signal_queue_rows_written=2' && echo true || echo false)"

# ── T10: independent cross-check AGREES — no violation, no false alarm ────
reset_log
MF10=$(markers_file <<'EOF'
[emit-signal] OK dedup_key=x:y:Z id=sys-a
[emit-signal] OK dedup_key=x:y:W id=sys-b
[emit-dashboard] OK id=sys-a check_id=Z
[emit-dashboard] OK id=sys-b check_id=W
EOF
)
OUT10=$(run_audit_output_contract --markers-file "$MF10" --cycle-start-ts "2026-07-29T09:55:00Z" --orch-state-file "$SCRATCH_ORCH")
RC10=$?
check "T10 independent-crosscheck-agrees exit=0" "$([ "$RC10" -eq 0 ] && echo true || echo false)"
check "T10 independent-crosscheck-agrees no V1 violation" "$(! printf '%s' "$OUT10" | grep -q 'VIOLATION' && echo true || echo false)"

# ── T11: bad usage — no --markers-file — exit 2 ────────────────────────────
OUT11=$(run_audit_output_contract)
RC11=$?
check "T11 bad-usage exit=2" "$([ "$RC11" -eq 2 ] && echo true || echo false)"
check "T11 bad-usage marker ABORT" "$(printf '%s' "$OUT11" | grep -q '^\[audit-output-contract\] ABORT missing-required-arg' && echo true || echo false)"

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
