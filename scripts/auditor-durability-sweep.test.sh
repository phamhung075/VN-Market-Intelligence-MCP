#!/usr/bin/env bash
# scripts/auditor-durability-sweep.test.sh
#
# Regression test for FIX-AUDITOR-DURABILITY-STEP0B-DETECTION (redispatch 2),
# scripts/auditor-durability-sweep.sh. Mirrors scripts/emit-audit-signal.
# test.sh's own conventions EXACTLY:
#   - `source` the script under test (its bottom guard `[[ "${BASH_SOURCE[0]}"
#     == "${0}" ]]` prevents auto-execution when sourced).
#   - Also `source` emit-audit-signal.sh directly ourselves (same object the
#     script under test would source lazily) so `mcp_call()` can be redefined
#     to a recording stub BEFORE any test case runs — ZERO real network calls
#     in this suite. Setting `_DURABILITY_SWEEP_EMIT_SOURCED=1` beforehand
#     stops the script under test's own source-once guard from re-sourcing
#     emit-audit-signal.sh (which would re-source mcp-call.sh and silently
#     clobber this stub) on every `run_durability_sweep` call.
#   - Every fixture (marker files, heartbeat JSON, notebook.md, orch-state,
#     dedup ledger) lives under an isolated tmp root — NEVER the live
#     docs/agent-memory or docs/data files.
#
# Run:
#   bash scripts/auditor-durability-sweep.test.sh
#
# Exit 0 = all pass. Exit 1 = >=1 failure.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SWEEP_SH="$SCRIPT_DIR/auditor-durability-sweep.sh"
EMIT_SH="$SCRIPT_DIR/emit-audit-signal.sh"

for f in "$SWEEP_SH" "$EMIT_SH"; do
  if [ ! -f "$f" ]; then
    echo "ERROR: required script not found: $f" >&2
    exit 1
  fi
done

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

# ── Isolated tmp fixture root — NEVER the live repo files ───────────────────
TMPDIR_TEST=$(mktemp -d /private/tmp/auditor-durability-sweep-test-XXXXXX)
cleanup() { rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT

SCRATCH_ORCH="$TMPDIR_TEST/orch-state.json"
SCRATCH_LEDGER="$TMPDIR_TEST/auditor-dedup-ledger.json"
CALL_LOG="$TMPDIR_TEST/mcp-calls.log"
PROJECT_ROOT="$TMPDIR_TEST/project"
MARKERS_DIR="$PROJECT_ROOT/docs/agent-memory"
NOTEBOOK_FILE="$PROJECT_ROOT/docs/agent-memory/notebooks/system-auditor.md"
T1_HB="$PROJECT_ROOT/docs/data/auditor-tier1-last-healthy.json"
T2_HB="$PROJECT_ROOT/docs/data/auditor-tier2-last-healthy.json"
T3_HB="$PROJECT_ROOT/docs/data/auditor-tier3-last-healthy.json"

mkdir -p "$MARKERS_DIR" "$PROJECT_ROOT/docs/data" "$(dirname "$NOTEBOOK_FILE")"

export EMIT_SIGNAL_LEDGER_FILE="$SCRATCH_LEDGER"
export EMIT_SIGNAL_ORCH_STATE_FILE="$SCRATCH_ORCH"
export ORCH_APPLY_LIVE_FILE_OVERRIDE="$SCRATCH_ORCH"

# ── Source emit-audit-signal.sh OURSELVES first (defines mcp_call() from
# mcp-call.sh transitively), THEN stub mcp_call(), THEN mark the source-once
# guard so the script under test never re-sources and clobbers this stub. ──
# shellcheck source=./emit-audit-signal.sh
source "$EMIT_SH"
_DURABILITY_SWEEP_EMIT_SOURCED=1

POST_SIGNAL_ID_COUNTER=0
LAST_POSTED_SIGNAL_ID=""
MCP_CALL_FAIL_TOOL=""
mcp_call() {
  local tool="${1:-}" args="${2:-}"
  echo "CALL: $tool $args" >> "$CALL_LOG"
  if [ "$tool" = "$MCP_CALL_FAIL_TOOL" ]; then
    echo "simulated transport failure" >&2
    return 1
  fi
  if [ "$tool" = "post_agent_signal" ]; then
    POST_SIGNAL_ID_COUNTER=$((POST_SIGNAL_ID_COUNTER + 1))
    LAST_POSTED_SIGNAL_ID="$POST_SIGNAL_ID_COUNTER"
    printf '{"success":true,"signal_id":%s}' "$POST_SIGNAL_ID_COUNTER"
    return 0
  fi
  if [ "$tool" = "get_agent_signals" ]; then
    printf '[%s] SIGNAL_FEEDBACK — from: system-auditor' "${LAST_POSTED_SIGNAL_ID:-1}"
    return 0
  fi
  echo '{}'
  return 0
}

call_count_for() {
  grep -c "^CALL: $1 " "$CALL_LOG" 2>/dev/null || echo 0
}

# ── Source the script under test (guard prevents auto-exec) ─────────────────
# shellcheck source=./auditor-durability-sweep.sh
source "$SWEEP_SH"

iso_of() { jq -nr --argjson e "$1" '$e | todateiso8601'; }
# Notebook `## c<NNN> · <ts>` headings are always MINUTE precision (no
# seconds) per main.md's own convention — real fixture must match, or the
# well-formed-shape case pattern in _t1_latest_notebook_ts correctly (and
# intentionally) treats it as unparseable.
iso_min_of() { jq -nr --argjson e "$1" '$e | strftime("%Y-%m-%dT%H:%MZ")'; }

reset_case() {
  : > "$CALL_LOG"
  MCP_CALL_FAIL_TOOL=""
  rm -rf "$PROJECT_ROOT"
  mkdir -p "$MARKERS_DIR" "$PROJECT_ROOT/docs/data" "$(dirname "$NOTEBOOK_FILE")"
  # orch-apply.sh's validator requires the FULL canonical schema (task_board,
  # head, etc.) — a minimal synthetic object fails validation (rc=1). Same
  # fixture convention as emit-audit-signal.test.sh's own reset_case: copy the
  # real live file as a scratch STARTING POINT, never write to it.
  cp "$REPO_ROOT/docs/data/orch/orch-state.json" "$SCRATCH_ORCH"
  rm -f "$SCRATCH_LEDGER"
  : > "$NOTEBOOK_FILE"
}

row_count() {
  jq '.signal_queue.rows | length' "$SCRATCH_ORCH" 2>/dev/null
}

FIXED_NOW=1700100000   # arbitrary fixed epoch — deterministic gap math

# ── T1: well-formed stale marker (mtime > 20min) gets swept ─────────────────
reset_case
touch -t 202001010000 "$MARKERS_DIR/.auditor-cycle-markers-2026-08-06T21:09:00Z.tmp" 2>/dev/null
# the shape emit-audit-signal.sh's own key regex allows is HH:MM (no seconds)
# — rename this fixture to a well-formed key so T1 exercises the CLEAN-key
# branch distinctly from T2's malformed-seconds case below.
mv "$MARKERS_DIR/.auditor-cycle-markers-2026-08-06T21:09:00Z.tmp" "$MARKERS_DIR/.auditor-cycle-markers-2026-08-06T21:09Z.tmp"
touch -t 202001010000 "$MARKERS_DIR/.auditor-cycle-markers-2026-08-06T21:09Z.tmp"
BEFORE1=$(row_count)
OUT1=$(run_durability_sweep --project-root "$PROJECT_ROOT" --emit-script "$EMIT_SH" --cycle-tag "test-t1")
check "T1 clean-key marker file removed" "$([ ! -f "$MARKERS_DIR/.auditor-cycle-markers-2026-08-06T21:09Z.tmp" ] && echo true || echo false)"
check "T1 clean-key emit-signal OK line present" "$(printf '%s' "$OUT1" | grep -q '^\[emit-signal\] OK dedup_key=auditor-cycle-loss:2026-08-06T21:09Z' && echo true || echo false)"
check "T1 clean-key durability-sweep summary swept=1 malformed=0 found=1" "$(printf '%s' "$OUT1" | grep -q '^\[durability-sweep\] swept=1 malformed=0 found=1' && echo true || echo false)"
check "T1 clean-key ledger has dedup entry" "$(jq -e '."auditor-cycle-loss:2026-08-06T21:09Z".ts' "$SCRATCH_LEDGER" >/dev/null 2>&1 && echo true || echo false)"
check "T1 clean-key row landed in signal_queue" "$([ "$(row_count)" -eq "$((BEFORE1 + 1))" ] && echo true || echo false)"

# ── T2: malformed-shape keys (seconds-bearing, colon-bearing, empty) all
# swept via the malformed-key sentinel ───────────────────────────────────────
reset_case
touch -t 202001010000 "$MARKERS_DIR/.auditor-cycle-markers-2026-08-13T03:20:16Z.tmp"
touch -t 202001010000 "$MARKERS_DIR/.auditor-cycle-markers-auditor-t1:2026-08-11T16:30Z.tmp"
touch -t 202001010000 "$MARKERS_DIR/.auditor-cycle-markers-.tmp"
BEFORE2=$(row_count)
OUT2=$(run_durability_sweep --project-root "$PROJECT_ROOT" --emit-script "$EMIT_SH" --cycle-tag "test-t2")
check "T2 malformed all 3 files removed" "$([ ! -f "$MARKERS_DIR/.auditor-cycle-markers-2026-08-13T03:20:16Z.tmp" ] && [ ! -f "$MARKERS_DIR/.auditor-cycle-markers-auditor-t1:2026-08-11T16:30Z.tmp" ] && [ ! -f "$MARKERS_DIR/.auditor-cycle-markers-.tmp" ] && echo true || echo false)"
check "T2 malformed summary swept=3 malformed=3 found=3" "$(printf '%s' "$OUT2" | grep -q '^\[durability-sweep\] swept=3 malformed=3 found=3' && echo true || echo false)"
check "T2 malformed dedup key collapses to one ledger entry" "$(jq -e '."auditor-cycle-loss:malformed-key".ts' "$SCRATCH_LEDGER" >/dev/null 2>&1 && echo true || echo false)"
# All 3 malformed files collapse to the IDENTICAL (dedup_key, cycle_tag) pair
# — emit-audit-signal.sh's own same-cycle idempotency guard (FIX-AUDITOR-B12-
# DOUBLE-INVOKE-EMIT-MARKER-LOSS) correctly short-circuits calls 2 and 3 to
# "SKIP-duplicate-invocation" (zero new agent_signals/signal_queue rows for
# those two) rather than double/triple-counting one real finding — this is
# the reused primitive's OWN intended behavior, not a defect in this sweep.
check "T2 malformed 1st OK, 2nd+3rd SKIP-duplicate-invocation (B12 same-cycle guard)" "$(printf '%s' "$OUT2" | grep -c '^\[emit-signal\] OK dedup_key=auditor-cycle-loss:malformed-key' | grep -q '^1$' && printf '%s' "$OUT2" | grep -c '^\[emit-signal\] SKIP-duplicate-invocation dedup_key=auditor-cycle-loss:malformed-key' | grep -q '^2$' && echo true || echo false)"
check "T2 malformed exactly 1 net signal_queue row (B12 collapse), all 3 files still reclaimed" "$([ "$(row_count)" -eq "$((BEFORE2 + 1))" ] && echo true || echo false)"

# ── T3: fresh marker (mtime < 20min) is NEVER swept ─────────────────────────
reset_case
touch "$MARKERS_DIR/.auditor-cycle-markers-2099-01-01T00:00Z.tmp"
BEFORE3=$(row_count)
OUT3=$(run_durability_sweep --project-root "$PROJECT_ROOT" --emit-script "$EMIT_SH" --cycle-tag "test-t3")
check "T3 fresh marker file NOT removed" "$([ -f "$MARKERS_DIR/.auditor-cycle-markers-2099-01-01T00:00Z.tmp" ] && echo true || echo false)"
check "T3 fresh summary swept=0 found=0" "$(printf '%s' "$OUT3" | grep -q '^\[durability-sweep\] swept=0 malformed=0 found=0' && echo true || echo false)"
check "T3 fresh zero NEW signal_queue rows" "$([ "$(row_count)" -eq "$BEFORE3" ] && echo true || echo false)"

# ── T4: E-1 ABORT (transport failure) leaves the orphaned file in place ────
reset_case
touch -t 202001010000 "$MARKERS_DIR/.auditor-cycle-markers-2026-08-07T00:00Z.tmp"
MCP_CALL_FAIL_TOOL="post_agent_signal"
OUT4=$(run_durability_sweep --project-root "$PROJECT_ROOT" --emit-script "$EMIT_SH" --cycle-tag "test-t4")
MCP_CALL_FAIL_TOOL=""
check "T4 ABORT file NOT removed (retry next cycle)" "$([ -f "$MARKERS_DIR/.auditor-cycle-markers-2026-08-07T00:00Z.tmp" ] && echo true || echo false)"
check "T4 ABORT marker present" "$(printf '%s' "$OUT4" | grep -q '^\[emit-signal\] ABORT e1-failed' && echo true || echo false)"
check "T4 ABORT summary still printed (swept counts the attempt, not the reclaim)" "$(printf '%s' "$OUT4" | grep -q '^\[durability-sweep\] swept=1 malformed=0 found=1' && echo true || echo false)"

# ── T5: Tier-2 schedule-gap — stale heartbeat (>8h) flags + emits D-CYCLE-2,
# fresh heartbeat does not ─────────────────────────────────────────────────
reset_case
echo "{\"last_healthy_at\": \"$(iso_of $((FIXED_NOW - 30000)))\"}" > "$T2_HB"   # ~8h20m gap
OUT5=$(run_durability_sweep --project-root "$PROJECT_ROOT" --emit-script "$EMIT_SH" --now-epoch "$FIXED_NOW" --cycle-tag "test-t5")
check "T5 tier2 stale flags schedule_gap_t2=1" "$(printf '%s' "$OUT5" | grep -q 'schedule_gap_t2=1' && echo true || echo false)"
check "T5 tier2 stale emits D-CYCLE-2" "$(printf '%s' "$OUT5" | grep -q '^\[emit-signal\] OK dedup_key=auditor-cycle-missing:tier2:' && echo true || echo false)"

reset_case
echo "{\"last_healthy_at\": \"$(iso_of $((FIXED_NOW - 3600)))\"}" > "$T2_HB"    # 1h gap — well within 8h bar
OUT5b=$(run_durability_sweep --project-root "$PROJECT_ROOT" --emit-script "$EMIT_SH" --now-epoch "$FIXED_NOW" --cycle-tag "test-t5b")
check "T5b tier2 fresh does NOT flag" "$(printf '%s' "$OUT5b" | grep -q 'schedule_gap_t2=0' && echo true || echo false)"
check "T5b tier2 fresh no D-CYCLE-2 emitted" "$(! printf '%s' "$OUT5b" | grep -q 'D-CYCLE-2\|emit-signal' && echo true || echo false)"

# ── T6: Tier-3 schedule-gap — stale heartbeat (>48h) flags + emits ─────────
reset_case
echo "{\"last_healthy_at\": \"$(iso_of $((FIXED_NOW - 200000)))\"}" > "$T3_HB"  # ~55.6h gap
OUT6=$(run_durability_sweep --project-root "$PROJECT_ROOT" --emit-script "$EMIT_SH" --now-epoch "$FIXED_NOW" --cycle-tag "test-t6")
check "T6 tier3 stale flags schedule_gap_t3=1" "$(printf '%s' "$OUT6" | grep -q 'schedule_gap_t3=1' && echo true || echo false)"
check "T6 tier3 stale emits D-CYCLE-2" "$(printf '%s' "$OUT6" | grep -q '^\[emit-signal\] OK dedup_key=auditor-cycle-missing:tier3:' && echo true || echo false)"

# ── T7: missing heartbeat file (no baseline yet) never alarms ──────────────
reset_case
OUT7=$(run_durability_sweep --project-root "$PROJECT_ROOT" --emit-script "$EMIT_SH" --now-epoch "$FIXED_NOW" --cycle-tag "test-t7")
check "T7 no baseline file — no tier flags at all" "$(printf '%s' "$OUT7" | grep -q 'schedule_gap_t1=0 schedule_gap_t2=0 schedule_gap_t3=0' && echo true || echo false)"

# ── T8: Tier-1 conservative check — stale heartbeat AND stale/absent notebook
# beyond 3h flags; a fresh notebook heading suppresses it even with a stale
# heartbeat file (OR semantics, MORE-RECENT-of-two wins) ───────────────────
reset_case
echo "{\"last_healthy_at\": \"$(iso_of $((FIXED_NOW - 20000)))\"}" > "$T1_HB"   # ~5h33m gap
OUT8=$(run_durability_sweep --project-root "$PROJECT_ROOT" --emit-script "$EMIT_SH" --now-epoch "$FIXED_NOW" --cycle-tag "test-t8")
check "T8 tier1 stale hb + no notebook flags schedule_gap_t1=1" "$(printf '%s' "$OUT8" | grep -q 'schedule_gap_t1=1' && echo true || echo false)"
check "T8 tier1 stale emits D-CYCLE-2 tier1" "$(printf '%s' "$OUT8" | grep -q '^\[emit-signal\] OK dedup_key=auditor-cycle-missing:tier1:' && echo true || echo false)"

reset_case
echo "{\"last_healthy_at\": \"$(iso_of $((FIXED_NOW - 20000)))\"}" > "$T1_HB"   # stale heartbeat
cat > "$NOTEBOOK_FILE" <<EOF
## c1 · $(iso_min_of $((FIXED_NOW - 600)))

### Audit Run Tier-1
- Tier: 1 | ALL_GREEN
EOF
OUT8b=$(run_durability_sweep --project-root "$PROJECT_ROOT" --emit-script "$EMIT_SH" --now-epoch "$FIXED_NOW" --cycle-tag "test-t8b")
check "T8b tier1 fresh notebook heading suppresses (MORE-RECENT-wins)" "$(printf '%s' "$OUT8b" | grep -q 'schedule_gap_t1=0' && echo true || echo false)"

# ── T9: mandatory [durability-sweep] summary line always present, even on
# the common zero-hits cycle ─────────────────────────────────────────────
reset_case
OUT9=$(run_durability_sweep --project-root "$PROJECT_ROOT" --emit-script "$EMIT_SH" --now-epoch "$FIXED_NOW" --cycle-tag "test-t9")
check "T9 zero-hits still prints mandatory summary line" "$(printf '%s' "$OUT9" | grep -q '^\[durability-sweep\] swept=0 malformed=0 found=0 schedule_gap_t1=0 schedule_gap_t2=0 schedule_gap_t3=0$' && echo true || echo false)"
if run_durability_sweep --project-root "$PROJECT_ROOT" --emit-script "$EMIT_SH" --now-epoch "$FIXED_NOW" >/dev/null 2>&1; then
  check "T9 zero-hits exit code 0" "true"
else
  check "T9 zero-hits exit code 0" "false"
fi

# ── T10: required-arg guard ──────────────────────────────────────────────
OUT10=$(run_durability_sweep --emit-script "$EMIT_SH" 2>&1)
check "T10 missing --project-root aborts loud" "$(printf '%s' "$OUT10" | grep -q '^\[durability-sweep\] ABORT missing-required-arg --project-root' && echo true || echo false)"

echo
echo "== $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
