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

# Isolated scratch violations sidecar — NEVER the live
# docs/data/auditor-output-contract-violations.json.
export AUDIT_OUTPUT_CONTRACT_VIOLATIONS_FILE="$TMPDIR_TEST/auditor-output-contract-violations.json"

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

# ── T5b: FIX-AUDITOR-B12-DOUBLE-INVOKE-EMIT-MARKER-LOSS — a SKIP-duplicate-
# invocation marker (emit-audit-signal.sh's own same-cycle idempotency
# PRE-check no-op) counts toward NOTHING, same treatment as ABORT. ─────────
reset_log
MF5B=$(markers_file <<'EOF'
[emit-signal] OK dedup_key=data_stale:sbv_fx:B-12 id=sys-20260808T000000-aaaa
[emit-signal] SKIP-duplicate-invocation dedup_key=data_stale:sbv_fx:B-12 cycle_tag=cron:auditor-t2:2026-08-08T00:00Z id=sys-20260808T000000-aaaa
[emit-dashboard] OK id=sys-20260808T000000-aaaa check_id=B-12
EOF
)
OUT5B=$(run_audit_output_contract --markers-file "$MF5B")
RC5B=$?
check "T5b skip-duplicate-invocation exit=0 (no violation)" "$([ "$RC5B" -eq 0 ] && echo true || echo false)"
check "T5b skip-duplicate-invocation: signals_posted=1 (the SKIP-duplicate line adds nothing)" "$(printf '%s' "$OUT5B" | grep -q 'signals_posted=1' && echo true || echo false)"
check "T5b skip-duplicate-invocation: signal_queue_rows_written=1 (NOT double-counted)" "$(printf '%s' "$OUT5B" | grep -q 'signal_queue_rows_written=1' && echo true || echo false)"
check "T5b skip-duplicate-invocation: telegram_sent=1 (NOT double-counted)" "$(printf '%s' "$OUT5B" | grep -q 'telegram_sent=1' && echo true || echo false)"

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
# has 3 rows for this cycle-start-ts (2 unambiguous + 1 same-tick-minute,
# FIX-AUDIT-OUTPUT-CONTRACT-SIGNALQUEUE-ROWS-WRITTEN-SELFREPORT-MISMATCH
# Bug A regression coverage), markers file only accounts for 1. Cutoff is
# now minute-precision — the REAL FIRE_TICK shape (main.md Step 0d), not
# the already-second-precision fixture the original T9 used (which never
# exercised the defect). ────────────────────────────────────────────────
reset_log
SCRATCH_ORCH="$TMPDIR_TEST/orch-state.json"
jq -n '{signal_queue:{rows:[
  {id:"sys-a", ts:"2026-07-29T10:00:00Z", from:"system-auditor"},
  {id:"sys-b", ts:"2026-07-29T10:05:00Z", from:"system-auditor"},
  {id:"sys-c", ts:"2026-07-29T09:55:45Z", from:"system-auditor"}
]}}' > "$SCRATCH_ORCH"
MF9=$(markers_file <<'EOF'
[emit-signal] OK dedup_key=x:y:Z id=sys-a
[emit-dashboard] OK id=sys-a check_id=Z
EOF
)
OUT9=$(run_audit_output_contract --markers-file "$MF9" --cycle-start-ts "2026-07-29T09:55Z" --orch-state-file "$SCRATCH_ORCH")
RC9=$?
check "T9 independent-crosscheck exit=1 (mismatch detected)" "$([ "$RC9" -ne 0 ] && echo true || echo false)"
check "T9 independent-crosscheck V1 fired narrated=1 independent=3" "$(printf '%s' "$OUT9" | grep -q '^\[OUTPUT-CONTRACT\] VIOLATION: signal_queue_rows_written mismatch narrated=1 independent=3$' && echo true || echo false)"
check "T9 independent-crosscheck final count uses the HIGHER (ground-truth) value, never under-reports" "$(printf '%s' "$OUT9" | grep -q 'signal_queue_rows_written=3' && echo true || echo false)"

# ── T10: independent cross-check AGREES — no violation, no false alarm.
# sys-c (same clock-minute as the minute-precision cutoff) is INCLUDED
# here — before the Bug A fix this row was silently dropped from the
# independent re-read, which would have produced a FALSE VIOLATION
# (narrated=3, independent=2) on a cycle that genuinely wrote 3 rows. ─────
reset_log
MF10=$(markers_file <<'EOF'
[emit-signal] OK dedup_key=x:y:Z id=sys-a
[emit-signal] OK dedup_key=x:y:W id=sys-b
[emit-signal] OK dedup_key=x:y:V id=sys-c
[emit-dashboard] OK id=sys-a check_id=Z
[emit-dashboard] OK id=sys-b check_id=W
[emit-dashboard] OK id=sys-c check_id=V
EOF
)
OUT10=$(run_audit_output_contract --markers-file "$MF10" --cycle-start-ts "2026-07-29T09:55Z" --orch-state-file "$SCRATCH_ORCH")
RC10=$?
check "T10 independent-crosscheck-agrees exit=0" "$([ "$RC10" -eq 0 ] && echo true || echo false)"
check "T10 independent-crosscheck-agrees no V1 violation" "$(! printf '%s' "$OUT10" | grep -q 'VIOLATION' && echo true || echo false)"
check "T10 independent-crosscheck-agrees signal_queue_rows_written=3 (same-tick-minute row NOT silently dropped)" "$(printf '%s' "$OUT10" | grep -q 'signal_queue_rows_written=3' && echo true || echo false)"

# ── T11: bad usage — no --markers-file — exit 2 ────────────────────────────
OUT11=$(run_audit_output_contract)
RC11=$?
check "T11 bad-usage exit=2" "$([ "$RC11" -eq 2 ] && echo true || echo false)"
check "T11 bad-usage marker ABORT" "$(printf '%s' "$OUT11" | grep -q '^\[audit-output-contract\] ABORT missing-required-arg' && echo true || echo false)"

# ── T12: Bug A — same-tick-minute row, bare FIRE_TICK shape (minute-
# precision cutoff, no --cycle-tag). Before the fix, the raw jq string
# ">=" compare silently drops any row whose .ts falls in the SAME clock-
# minute as the tick (":" 0x3A sorts below "Z" 0x5A right after HH:MM),
# producing a FALSE narrated=1/independent=0 violation on the routine
# case of a row written within the tick's own minute (occurrences
# 4412/4415). After the fix (to_epoch, epoch-int compare), no violation —
# signal_queue_rows_written matches the marker exactly. ────────────────────
reset_log
SCRATCH_ORCH12="$TMPDIR_TEST/orch-state-t12.json"
jq -n '{signal_queue:{rows:[
  {id:"sys-t12", ts:"2026-08-05T06:00:03Z", from:"system-auditor"}
]}}' > "$SCRATCH_ORCH12"
MF12=$(markers_file <<'EOF'
[emit-signal] OK dedup_key=x:y:T12 id=sys-t12
[emit-dashboard] OK id=sys-t12 check_id=T12
EOF
)
OUT12=$(run_audit_output_contract --markers-file "$MF12" --cycle-start-ts "2026-08-05T06:00Z" --orch-state-file "$SCRATCH_ORCH12")
RC12=$?
check "T12 same-tick-minute exit=0 (no violation — row correctly counted)" "$([ "$RC12" -eq 0 ] && echo true || echo false)"
check "T12 same-tick-minute no V1 violation" "$(! printf '%s' "$OUT12" | grep -q 'VIOLATION' && echo true || echo false)"
check "T12 same-tick-minute signal_queue_rows_written=1 (matches marker exactly)" "$(printf '%s' "$OUT12" | grep -q 'signal_queue_rows_written=1' && echo true || echo false)"

# ── T13: Bug B — --cycle-tag exact scoping. Scratch orch-state has one
# row tagged with THIS cycle's tag and one UNRELATED row sharing
# from="system-auditor" with a DIFFERENT tag (simulates a peer tier/
# session writing under the same shared default identity — occurrence
# 4420). The peer row must NOT be picked up when --cycle-tag is supplied. ──
reset_log
SCRATCH_ORCH13="$TMPDIR_TEST/orch-state-t13.json"
jq -n '{signal_queue:{rows:[
  {id:"sys-t13-mine", ts:"2026-08-05T06:02:03Z", from:"system-auditor", audit_cycle_tag:"cron:auditor-t2:2026-08-05T06:00Z"},
  {id:"sys-t13-peer", ts:"2026-08-05T06:02:40Z", from:"system-auditor", audit_cycle_tag:"cron:auditor-t1:2026-08-05T06:02Z"}
]}}' > "$SCRATCH_ORCH13"
MF13=$(markers_file <<'EOF'
[emit-signal] OK dedup_key=x:y:T13 id=sys-t13-mine
[emit-dashboard] OK id=sys-t13-mine check_id=T13
EOF
)
OUT13=$(run_audit_output_contract --markers-file "$MF13" --cycle-start-ts "2026-08-05T06:00Z" --cycle-tag "cron:auditor-t2:2026-08-05T06:00Z" --orch-state-file "$SCRATCH_ORCH13")
RC13=$?
check "T13 cycle-tag-scoped exit=0 (no violation — peer row excluded)" "$([ "$RC13" -eq 0 ] && echo true || echo false)"
check "T13 cycle-tag-scoped no V1 violation" "$(! printf '%s' "$OUT13" | grep -q 'VIOLATION' && echo true || echo false)"
check "T13 cycle-tag-scoped signal_queue_rows_written=1 (peer row not counted)" "$(printf '%s' "$OUT13" | grep -q 'signal_queue_rows_written=1' && echo true || echo false)"

# ── T14-T17: FIX-AUDITOR-B12-DOUBLE-INVOKE-EMIT-MARKER-LOSS (acceptance 4) —
# every VIOLATION line is ALSO durably recorded to
# AUDIT_OUTPUT_CONTRACT_VIOLATIONS_FILE, synchronously, INDEPENDENT of
# whether the calling agent ever pastes it anywhere. This is the real
# "impossible to omit" enforcement — a script-owned write, not a narrated
# instruction. ────────────────────────────────────────────────────────────

# T14: clean cycle (T2's shape, no violation) — violations file untouched.
reset_log
rm -f "$AUDIT_OUTPUT_CONTRACT_VIOLATIONS_FILE"
MF14=$(markers_file <<'EOF'
[emit-signal] OK dedup_key=data_stale:x:B-05 id=sys-20260729T100000-aaaa
[emit-dashboard] OK id=sys-20260729T100000-aaaa check_id=B-05
EOF
)
run_audit_output_contract --markers-file "$MF14" >/dev/null
check "T14 clean-cycle: no violations file written (nothing to record)" "$([ ! -f "$AUDIT_OUTPUT_CONTRACT_VIOLATIONS_FILE" ] && echo true || echo false)"

# T15: V2 violation (T7's shape — bare post-agent-signal, no signal_queue
# row) — durable record MUST exist and MUST carry the violation detail,
# even though this test never "pastes" anything into any notebook.
reset_log
rm -f "$AUDIT_OUTPUT_CONTRACT_VIOLATIONS_FILE"
MF15=$(markers_file <<'EOF'
[post-agent-signal] OK telegram=no
EOF
)
OUT15=$(run_audit_output_contract --markers-file "$MF15" --cycle-tag "cron:auditor-t3:2026-08-08T02:00Z")
RC15=$?
check "T15 V2-violation exit=1" "$([ "$RC15" -ne 0 ] && echo true || echo false)"
check "T15 V2-violation durable file created" "$([ -f "$AUDIT_OUTPUT_CONTRACT_VIOLATIONS_FILE" ] && echo true || echo false)"
check "T15 V2-violation durable file is valid JSON array" "$(jq -e 'type=="array"' "$AUDIT_OUTPUT_CONTRACT_VIOLATIONS_FILE" >/dev/null 2>&1 && echo true || echo false)"
check "T15 V2-violation durable record carries the V2 detail text" "$(jq -e '[.[] | select(.detail | startswith("V2"))] | length >= 1' "$AUDIT_OUTPUT_CONTRACT_VIOLATIONS_FILE" >/dev/null 2>&1 && echo true || echo false)"
check "T15 V2-violation durable record carries cycle_tag verbatim" "$(jq -e '[.[] | select(.detail | startswith("V2"))][0].cycle_tag == "cron:auditor-t3:2026-08-08T02:00Z"' "$AUDIT_OUTPUT_CONTRACT_VIOLATIONS_FILE" >/dev/null 2>&1 && echo true || echo false)"
check "T15 V2-violation side-by-side: printed VIOLATION line and durable record agree" "$(printf '%s' "$OUT15" | grep -q 'VIOLATION: signals emitted but no signal_queue rows written' && jq -e '[.[] | select(.detail | contains("signals emitted but no signal_queue rows written"))] | length >= 1' "$AUDIT_OUTPUT_CONTRACT_VIOLATIONS_FILE" >/dev/null 2>&1 && echo true || echo false)"

# T16: multiple violations in ONE run (T8's shape — V4+V5 both fire) — BOTH
# get durably recorded, not just the first.
reset_log
rm -f "$AUDIT_OUTPUT_CONTRACT_VIOLATIONS_FILE"
MF16=$(markers_file <<'EOF'
[emit-signal] OK dedup_key=microservice_degraded:api-gateway:A-12 id=sys-20260729T100500-ffff
[emit-dashboard] OK id=sys-20260729T100500-ffff check_id=A-12
EOF
)
run_audit_output_contract --markers-file "$MF16" --anomalies-count 0 --next-token clean >/dev/null
check "T16 multi-violation: BOTH V4 and V5 durably recorded" "$([ "$(jq '[.[] | select(.detail | startswith("V4") or startswith("V5"))] | length' "$AUDIT_OUTPUT_CONTRACT_VIOLATIONS_FILE")" -eq 2 ] && echo true || echo false)"

# T17: durable record survives/accumulates ACROSS separate script
# invocations (the exact shape a notebook that already committed cannot
# offer — this file is append-only across runs, not per-run scratch).
# Fixture triggers exactly ONE violation (V4 alone — signal_queue_rows_
# written and dashboard_rows both satisfied, only the RETURN headline
# anomalies-count is inconsistent) so the per-run delta is unambiguous.
reset_log
rm -f "$AUDIT_OUTPUT_CONTRACT_VIOLATIONS_FILE"
MF17A=$(markers_file <<'EOF'
[emit-signal] OK dedup_key=x:y:T17A id=sys-t17a
[emit-dashboard] OK id=sys-t17a check_id=T17A
EOF
)
run_audit_output_contract --markers-file "$MF17A" --anomalies-count 0 >/dev/null
check "T17 first run: exactly 1 violation recorded" "$([ "$(jq 'length' "$AUDIT_OUTPUT_CONTRACT_VIOLATIONS_FILE")" -eq 1 ] && echo true || echo false)"
MF17B=$(markers_file <<'EOF'
[emit-signal] OK dedup_key=x:y:T17B id=sys-t17b
[emit-dashboard] OK id=sys-t17b check_id=T17B
EOF
)
run_audit_output_contract --markers-file "$MF17B" --anomalies-count 0 >/dev/null
check "T17 durable record accumulates across runs (2 entries from 2 separate invocations)" "$([ "$(jq 'length' "$AUDIT_OUTPUT_CONTRACT_VIOLATIONS_FILE")" -eq 2 ] && echo true || echo false)"

# ── T18-T21: ARM A (V6) — FIX-AUDITOR-VERDICT-TRANSCRIPTION-PROSE-OVERRIDES-
# MACHINE-VERDICT — this cycle's own captured machine-verdict JSON vs its own
# declared (prose) verdict, per check id. ───────────────────────────────────
json_file() {
  local f="$TMPDIR_TEST/json-$RANDOM.json"
  cat > "$f"
  echo "$f"
}
EMPTY_MF=$(markers_file <<'EOF'
EOF
)

# T18: OCC-1 replay — raw JSON verdict=ESCALATE / reclamation_dips=0 /
# samples 94.68-95.08 (verbatim shape of scripts/audits/verify-a30-mcp-
# memory-reclamation.sh's own stdout — no `check`/`check_id` key, the "A-30"
# check id is derived from the leading token inside `.probe`), declared
# "A-30=FOLD" — the confirmed 2026-08-06T17:44Z occurrence (commit
# ab22b3ca5): non-zero exit, names the check, prints ESCALATE-vs-FOLD,
# contract line carries verdict=ESCALATE.
reset_log
rm -f "$AUDIT_OUTPUT_CONTRACT_VIOLATIONS_FILE"
RVF18=$(json_file <<'EOF'
{"probe":"A-30 mcp-server memory reclamation discriminator","container":"mcp-server","samples":[{"pct":94.68},{"pct":95.08},{"pct":94.90}],"analysis":{"min_pct":94.68,"max_pct":95.08,"reclamation_dips":0},"verdict":"ESCALATE","reason":"all samples >93% sustained high — loss of reclamation"}
EOF
)
OUT18=$(run_audit_output_contract --markers-file "$EMPTY_MF" --raw-verdicts-file "$RVF18" --declared-verdicts "A-30=FOLD")
RC18=$?
check "T18 OCC-1 replay exit!=0" "$([ "$RC18" -ne 0 ] && echo true || echo false)"
check "T18 OCC-1 replay names the check A-30" "$(printf '%s' "$OUT18" | grep -q 'check=A-30' && echo true || echo false)"
check "T18 OCC-1 replay prints raw=ESCALATE" "$(printf '%s' "$OUT18" | grep -q 'raw=ESCALATE' && echo true || echo false)"
check "T18 OCC-1 replay prints declared=FOLD" "$(printf '%s' "$OUT18" | grep -q 'declared=FOLD' && echo true || echo false)"
check "T18 OCC-1 replay contract line carries verdict=ESCALATE" "$(printf '%s' "$OUT18" | grep -q '^\[OUTPUT-CONTRACT\] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=0 | verdict=ESCALATE$' && echo true || echo false)"
check "T18 OCC-1 replay V6 durably recorded" "$(jq -e '[.[] | select(.detail | startswith("V6 verdict mismatch check=A-30"))] | length >= 1' "$AUDIT_OUTPUT_CONTRACT_VIOLATIONS_FILE" >/dev/null 2>&1 && echo true || echo false)"
check "T18 OCC-1 replay BUG telegram fired" "$([ "$(call_count_for send_telegram)" -ge 1 ] && echo true || echo false)"

# T19: matching declared/machine verdicts across all checks -> exit 0,
# no VIOLATION, contract line carries verdict=CLEAN.
reset_log
RVF19=$(json_file <<'EOF'
{"check":"A-30","verdict":"FOLD"}
EOF
)
OUT19=$(run_audit_output_contract --markers-file "$EMPTY_MF" --raw-verdicts-file "$RVF19" --declared-verdicts "A-30=FOLD")
RC19=$?
check "T19 matching-verdicts exit=0" "$([ "$RC19" -eq 0 ] && echo true || echo false)"
check "T19 matching-verdicts no VIOLATION" "$(! printf '%s' "$OUT19" | grep -q 'VIOLATION' && echo true || echo false)"
check "T19 matching-verdicts contract line carries verdict=CLEAN" "$(printf '%s' "$OUT19" | grep -q 'verdict=CLEAN$' && echo true || echo false)"

# T20: machine verdict with NO declared counterpart -> violation (silent
# omission is the same bug as a mismatch), forces verdict=ESCALATE.
reset_log
RVF20=$(json_file <<'EOF'
{"check":"B-05","verdict":"WARN"}
EOF
)
OUT20=$(run_audit_output_contract --markers-file "$EMPTY_MF" --raw-verdicts-file "$RVF20")
RC20=$?
check "T20 machine-no-declared exit!=0" "$([ "$RC20" -ne 0 ] && echo true || echo false)"
check "T20 machine-no-declared violation names check=B-05" "$(printf '%s' "$OUT20" | grep -q 'check=B-05' && echo true || echo false)"
check "T20 machine-no-declared silent-omission wording" "$(printf '%s' "$OUT20" | grep -q 'silent omission' && echo true || echo false)"
check "T20 machine-no-declared forces verdict=ESCALATE" "$(printf '%s' "$OUT20" | grep -q 'verdict=ESCALATE$' && echo true || echo false)"

# T21: declared verdict with NO machine counterpart -> logged, exit 0 (NOT a
# violation — PASS-only checks legitimately never emit a structured raw
# verdict this cycle).
reset_log
RVF21=$(json_file <<'EOF'
{"check":"A-30","verdict":"FOLD"}
EOF
)
OUT21=$(run_audit_output_contract --markers-file "$EMPTY_MF" --raw-verdicts-file "$RVF21" --declared-verdicts "A-30=FOLD,C-08=PASS")
RC21=$?
check "T21 declared-no-machine exit=0" "$([ "$RC21" -eq 0 ] && echo true || echo false)"
check "T21 declared-no-machine logged, not a VIOLATION" "$(printf '%s' "$OUT21" | grep -q 'INFO declared-no-machine-counterpart check=C-08' && echo true || echo false)"
check "T21 declared-no-machine no C-08 VIOLATION line" "$(! printf '%s' "$OUT21" | grep -q 'VIOLATION.*C-08' && echo true || echo false)"

# ── T22-T25: ARM B (V7) — cross-plane pre-gate-trigger vs declared-verdict
# divergence. OCC-2 (2026-08-08T12:37Z, rag-service-1 98.53%, BELOW-FLOOR
# ack-disqualified) + PO corroboration 2026-08-08T14:47Z (c53, the sharper
# same-shape case: agent wrote everything correctly and the divergence still
# existed because the faulty plane was upstream). ───────────────────────────

# T22: trigger verdict=FAILURE/mem_creep + returned declared verdict
# ALL_GREEN for A-30 -> non-zero exit naming mem_creep, verdict=DIVERGENCE
# (never ESCALATE — this is a cross-plane review flag, not an automatic
# agent-blame verdict, per po_corroboration_20260808T1447Z).
reset_log
TVF22=$(json_file <<'EOF'
{"written_at":"2026-08-08T12:37:04Z","fire_tick":"2026-08-08T12:30Z","verdict":"FAILURE","detail":"mem_creep: mem >= 85% threshold (A-30 WARN boundary, mem-creep gate): vn-market-intelligence-mcp-rag-service-1(98.53%, 15.1MiB-free, BELOW-FLOOR(floor=40MiB)) ; ","checks":{"docker_ps":"PASS","health_3000":"PASS","health_3001":"PASS","disk":"PASS","mem_creep":"FAIL","launchd_agents":"PASS"}}
EOF
)
OUT22=$(run_audit_output_contract --markers-file "$EMPTY_MF" --trigger-verdict-file "$TVF22" --declared-verdicts "A-30=ALL_GREEN")
RC22=$?
check "T22 OCC-2 replay (declared ALL_GREEN) exit!=0" "$([ "$RC22" -ne 0 ] && echo true || echo false)"
check "T22 OCC-2 replay names mem_creep" "$(printf '%s' "$OUT22" | grep -q 'trigger_check=mem_creep' && echo true || echo false)"
check "T22 OCC-2 replay names dimension=A-30" "$(printf '%s' "$OUT22" | grep -q 'dimension=A-30' && echo true || echo false)"
check "T22 OCC-2 replay never forces ESCALATE (DIVERGENCE, not agent-blame)" "$(printf '%s' "$OUT22" | grep -q 'verdict=DIVERGENCE$' && echo true || echo false)"

# T23: SAME trigger fixture, declared "A-30=WARN:dedup-SKIP vs c48" (the
# correct return per this row's own root_cause — peer cycle c48 already
# signalled the identical condition 1.5h earlier) -> exit 0, no violation.
reset_log
OUT23=$(run_audit_output_contract --markers-file "$EMPTY_MF" --trigger-verdict-file "$TVF22" --declared-verdicts "A-30=WARN:dedup-SKIP vs c48")
RC23=$?
check "T23 OCC-2 replay legitimate dedup-SKIP exit=0" "$([ "$RC23" -eq 0 ] && echo true || echo false)"
check "T23 OCC-2 replay legitimate dedup-SKIP no VIOLATION" "$(! printf '%s' "$OUT23" | grep -q 'VIOLATION' && echo true || echo false)"

# T24: SAME trigger fixture, declared token IS in the bad list (FOLD) but
# carries an honestly-surfaced acknowledged-degraded qualifier -> exit 0
# (reconciled against the ack ledger's own semantics, not re-parsed here —
# see script header comment for why this is sound with zero new ledger code).
reset_log
OUT24=$(run_audit_output_contract --markers-file "$EMPTY_MF" --trigger-verdict-file "$TVF22" --declared-verdicts "A-30=FOLD:acknowledged-degraded, tracked FU-RAG-DEPLOY-MEMORY")
RC24=$?
check "T24 OCC-2 replay legitimate acked-degraded exit=0" "$([ "$RC24" -eq 0 ] && echo true || echo false)"
check "T24 OCC-2 replay legitimate acked-degraded no VIOLATION" "$(! printf '%s' "$OUT24" | grep -q 'VIOLATION' && echo true || echo false)"

# T25: pre-gate trigger itself was ALL_GREEN this tick (no FAILURE anywhere)
# -> Arm B is a structural no-op regardless of what gets declared.
reset_log
TVF25=$(json_file <<'EOF'
{"written_at":"2026-08-08T13:00:00Z","fire_tick":"2026-08-08T13:00Z","verdict":"ALL_GREEN","detail":"all 6 checks passed","checks":{"docker_ps":"PASS","health_3000":"PASS","health_3001":"PASS","disk":"PASS","mem_creep":"PASS","launchd_agents":"PASS"}}
EOF
)
OUT25=$(run_audit_output_contract --markers-file "$EMPTY_MF" --trigger-verdict-file "$TVF25" --declared-verdicts "A-30=ALL_GREEN")
RC25=$?
check "T25 trigger-all-green no-op exit=0" "$([ "$RC25" -eq 0 ] && echo true || echo false)"
check "T25 trigger-all-green no-op no VIOLATION" "$(! printf '%s' "$OUT25" | grep -q 'VIOLATION' && echo true || echo false)"

# T26: BOTH arms engaged in the SAME call, everything matching/legitimate —
# exit 0, verdict=CLEAN, and V1-V5's own counters are completely unaffected
# by V6/V7 being engaged (no behavioral change to the pre-existing checks).
reset_log
MF26=$(markers_file <<'EOF'
[emit-signal] OK dedup_key=data_stale:x:B-05 id=sys-20260729T100000-aaaa
[emit-dashboard] OK id=sys-20260729T100000-aaaa check_id=B-05
EOF
)
RVF26=$(json_file <<'EOF'
{"check":"A-30","verdict":"FOLD"}
EOF
)
TVF26=$(json_file <<'EOF'
{"written_at":"2026-08-08T13:00:00Z","fire_tick":"2026-08-08T13:00Z","verdict":"ALL_GREEN","detail":"all 6 checks passed","checks":{"docker_ps":"PASS","health_3000":"PASS","health_3001":"PASS","disk":"PASS","mem_creep":"PASS","launchd_agents":"PASS"}}
EOF
)
OUT26=$(run_audit_output_contract --markers-file "$MF26" --raw-verdicts-file "$RVF26" --declared-verdicts "A-30=FOLD" --trigger-verdict-file "$TVF26")
RC26=$?
check "T26 both-arms-engaged-clean exit=0" "$([ "$RC26" -eq 0 ] && echo true || echo false)"
check "T26 both-arms-engaged-clean no VIOLATION" "$(! printf '%s' "$OUT26" | grep -q 'VIOLATION' && echo true || echo false)"
check "T26 both-arms-engaged-clean V1-V5 counters unaffected (signals_posted=1, dashboard_rows=1)" "$(printf '%s' "$OUT26" | grep -q 'signals_posted=1 | telegram_sent=1 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=0 | verdict=CLEAN$' && echo true || echo false)"

# T27: backward compatibility — neither --raw-verdicts-file nor
# --declared-verdicts nor --trigger-verdict-file supplied -> STDOUT contract
# line is BYTE-IDENTICAL to before this fix (no ` | verdict=` suffix at all).
# This is what makes V6/V7 purely additive for every pre-existing caller.
reset_log
OUT27=$(run_audit_output_contract --markers-file "$EMPTY_MF")
check "T27 backward-compat: no verdict= suffix when arms not engaged" "$(printf '%s' "$OUT27" | grep -q '^\[OUTPUT-CONTRACT\] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=0$' && echo true || echo false)"

# ── V8 — FIX-AUDITOR-DURABILITY-STEP0B-DETECTION (redispatch 2):
# --require-durability-sweep, purely additive/opt-in ──────────────────────────

# T28: flag OMITTED (default) — a markers file with zero [durability-sweep]
# lines produces NO violation and IDENTICAL output to before this fix.
reset_log
OUT28=$(run_audit_output_contract --markers-file "$EMPTY_MF")
check "T28 flag-omitted: no durability-sweep line, no VIOLATION" "$(! printf '%s' "$OUT28" | grep -q 'VIOLATION' && echo true || echo false)"

# T29: flag SET, marker file HAS the mandatory [durability-sweep] summary
# line (the common zero-hits case a real cycle produces) -> exit 0, no V8.
reset_log
MF29=$(markers_file <<'EOF'
[durability-sweep] swept=0 malformed=0 found=0 schedule_gap_t1=0 schedule_gap_t2=0 schedule_gap_t3=0
EOF
)
OUT29=$(run_audit_output_contract --markers-file "$MF29" --require-durability-sweep)
RC29=$?
check "T29 flag-set+marker-present exit=0" "$([ "$RC29" -eq 0 ] && echo true || echo false)"
check "T29 flag-set+marker-present no V8 VIOLATION" "$(! printf '%s' "$OUT29" | grep -q 'VIOLATION' && echo true || echo false)"

# T30: flag SET, marker file MISSING the [durability-sweep] line entirely —
# this is the exact narrates-vs-executes gap V8 exists to catch: the whole
# scripts/auditor-durability-sweep.sh call was skipped this cycle.
reset_log
OUT30=$(run_audit_output_contract --markers-file "$EMPTY_MF" --require-durability-sweep)
RC30=$?
check "T30 flag-set+marker-absent exit!=0" "$([ "$RC30" -ne 0 ] && echo true || echo false)"
check "T30 flag-set+marker-absent V8 VIOLATION line" "$(printf '%s' "$OUT30" | grep -q 'VIOLATION: durability-sweep marker missing this cycle' && echo true || echo false)"
check "T30 flag-set+marker-absent BUG telegram fired" "$(grep -q '^CALL: send_telegram' "$CALL_LOG" && echo true || echo false)"
check "T30 flag-set+marker-absent V1-V5 counters unaffected (all zero)" "$(printf '%s' "$OUT30" | grep -q 'signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=0$' && echo true || echo false)"

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
