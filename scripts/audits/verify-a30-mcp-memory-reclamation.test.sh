#!/usr/bin/env bash
# scripts/audits/verify-a30-mcp-memory-reclamation.test.sh
#
# Regression test for scripts/audits/verify-a30-mcp-memory-reclamation.sh
# (FIX-AUDITOR-A30-DISCRIMINATOR-CRASH-CLIFF-SCORED-AS-RECLAMATION-DIP).
#
# ISOLATION: sources the script under test (guard prevents auto-exec: this
# file's own $0 != the sourced script's BASH_SOURCE — same idiom as
# db-integrity-mount-drift-check.sh / auditor-tier1-probe.sh), then stubs
# `docker` as a shell function so NO real docker/container call is made.
#
# Counter seam: every `docker inspect -f ...` / `docker exec ...` / `docker
# stats ...` call in the script under test is captured via `$(...)` command
# substitution, which always forks a subshell — an in-memory counter mutated
# inside the stub would be silently discarded on return (every call would
# see the SAME starting state, never advancing "before" to "after"). `_next`
# below is a FILE-based counter under $TMPDIR_TEST (same helper/shape as
# `_next_mem_stub` in scripts/agents-flow/auditor-tier1-probe.test.sh) so
# state survives across forks; `run_case` resets it before each case.
#
# NAMING SEAM (do not "clean up" the STUB_ prefix below): the script under
# test declares `local` vars named e.g. OOM_BEFORE/STARTED_AFTER/EXITCODE_AFTER
# /FINISHED_BEFORE/MEMLIMIT_BYTES inside run_a30_reclamation_check(). Bash
# `local` is DYNAMICALLY scoped — those locals are visible (and SHADOW any
# same-named global) to every function CALLED from inside run_a30_reclamation_
# check(), including this test's `docker()` stub. A stub config var reusing
# one of those exact names would silently read the (currently-empty) function
# local instead of this test's intended value — caught empirically while
# authoring this test (T6/T10 both silently no-op'd until every stub knob was
# renamed with a STUB_ prefix that collides with nothing the script declares).
#
# T1 is the MANDATORY decisive regression check named on the board row's own
# verification_gate: replays the exact 2026-08-07T05:56Z 12-sample death
# series + the RestartCount 0->1 delta and asserts verdict==ESCALATE — this
# exact series returns FOLD against the PRE-fix script logic (verified by hand
# against the pre-fix verdict chain while authoring this test) and MUST return
# ESCALATE now. T2/T3/T6b/T8/T9 are negative controls (benign sawtooth,
# single-spike-then-reclaim, stale FinishedAt, VmHWM-pinned-but-not-advancing,
# VmHWM-advancing-but-not-pinned) proving the fix did not itself become a new
# false-positive generator; T4/T5/T6/T7/T10 are positive controls exercising
# each of fix (a)-(e) independently, not just in combination via T1.
#
# Run: bash scripts/audits/verify-a30-mcp-memory-reclamation.test.sh
# Exit 0 = all pass. Exit 1 = >=1 failure.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$SCRIPT_DIR/verify-a30-mcp-memory-reclamation.sh"
[ -f "$SCRIPT" ] || { echo "ERROR: verify-a30-mcp-memory-reclamation.sh not found at $SCRIPT"; exit 1; }

PASS=0
FAIL=0
ok()  { echo "PASS: $1"; PASS=$((PASS + 1)); }
bad() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); [ -n "${2:-}" ] && echo "$2"; }

TMPDIR_TEST="$(mktemp -d "${TMPDIR:-/tmp}/verify-a30-test.XXXXXX")"
cleanup() { rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT

# ── Source the script under test (guard prevents auto-exec) ──
# shellcheck source=./verify-a30-mcp-memory-reclamation.sh
source "$SCRIPT"

# ── File-based before/after call counter (see header) ──
_next() {
  local key="$1" list="$2" cfile idx arr n
  cfile="$TMPDIR_TEST/.call-${key}"
  idx=0
  [ -f "$cfile" ] && idx=$(cat "$cfile" 2>/dev/null)
  [[ "$idx" =~ ^[0-9]+$ ]] || idx=0
  IFS=',' read -ra arr <<< "$list"
  n=${#arr[@]}
  [ "$idx" -ge "$n" ] && idx=$((n - 1))
  printf '%s' "${arr[$idx]}"
  echo $((idx + 1)) > "$cfile"
}
_before_after() {
  # 1st call returns $2 (before), every call after returns $3 (after) — clamp
  # via _next's own "repeat last entry" behavior by listing "after" 5x (more
  # than this script ever calls any single inspect -f format: max 2x/run).
  local key="$1" before="$2" after="$3"
  _next "$key" "${before},${after},${after},${after},${after}"
}

# ── Scenario knobs (reset in run_case) ──
DEATH_SERIES="99.01,98.93,3.05,9.62,8.30,9.07,6.90,5.83,7.81,7.81,7.75,7.91"
BENIGN_SAWTOOTH="88.00,90.10,93.50,97.80,92.00,89.00,86.00,88.20,90.00,93.00,91.00,89.00"
SPIKE_THEN_RECLAIM="99.00,98.00,90.00,84.00,78.00,72.00,66.00,60.00,54.00,48.00,42.00,36.00"
STEADY_MID="50.00,51.00,49.50,50.50,50.00,49.80,50.20,50.10,49.90,50.00,50.10,49.95"
SUSTAINED_HIGH_ONE_JITTER="99.00,98.40,99.10,99.30,98.90,99.00,98.70,99.20,98.80,99.10,98.95,99.05"

docker() {
  local sub="$1"; shift
  case "$sub" in
    inspect)
      if [ "${1:-}" = "-f" ]; then
        local fmt="$2"
        case "$fmt" in
          '{{.State.OOMKilled}}')  _before_after oom      "${STUB_OOM_BEFORE:-false}" "${STUB_OOM_AFTER:-false}" ;;
          '{{.RestartCount}}')     _before_after restart  "${STUB_RESTART_BEFORE:-0}" "${STUB_RESTART_AFTER:-0}" ;;
          '{{.State.StartedAt}}')  _before_after started  "${STUB_STARTED_BEFORE:-2026-08-06T23:21:41Z}" "${STUB_STARTED_AFTER:-2026-08-06T23:21:41Z}" ;;
          '{{.State.ExitCode}}')   _before_after exitcode "${STUB_EXITCODE_BEFORE:-0}" "${STUB_EXITCODE_AFTER:-0}" ;;
          '{{.State.FinishedAt}}') _before_after finished "${STUB_FINISHED_BEFORE:-0001-01-01T00:00:00Z}" "${STUB_FINISHED_AFTER:-0001-01-01T00:00:00Z}" ;;
          '{{.HostConfig.Memory}}') printf '%s' "${STUB_MEMLIMIT_BYTES:-3221225472}" ;;
        esac
        return 0
      elif [ "${1:-}" = "notfound" ]; then
        return 1
      else
        return 0
      fi
      ;;
    exec)
      case "$*" in
        *VmHWM*) _before_after vmhwm "${STUB_VMHWM_BEFORE:-3170004}" "${STUB_VMHWM_AFTER:-3170004}" ;;
        *VmRSS*) printf '%s' "${STUB_VMRSS_VAL:-3100000}" ;;
      esac
      return 0
      ;;
    stats)
      printf '%s\t%s%%\n' "$CONTAINER" "$(_next stats "$SERIES")"
      return 0
      ;;
  esac
}

run_case() {
  # Reset every stub knob to a fully benign default before each case, so
  # each test only asserts the ONE signal it intends to exercise.
  rm -f "$TMPDIR_TEST"/.call-*
  CONTAINER="test-mcp-server"
  PROBES=12
  INTERVAL=0
  SERIES="$BENIGN_SAWTOOTH"
  STUB_OOM_BEFORE="false"; STUB_OOM_AFTER="false"
  STUB_RESTART_BEFORE="0"; STUB_RESTART_AFTER="0"
  STUB_STARTED_BEFORE="2026-08-06T23:21:41Z"; STUB_STARTED_AFTER="2026-08-06T23:21:41Z"
  STUB_EXITCODE_BEFORE="0"; STUB_EXITCODE_AFTER="0"
  STUB_FINISHED_BEFORE="0001-01-01T00:00:00Z"; STUB_FINISHED_AFTER="0001-01-01T00:00:00Z"
  STUB_MEMLIMIT_BYTES="3221225472"   # 3GiB
  STUB_VMHWM_BEFORE="3170004"; STUB_VMHWM_AFTER="3170004"
  STUB_VMRSS_VAL="3100000"
}

verdict_of() { printf '%s' "$1" | grep -o '"verdict": "[A-Z]*"' | head -1; }

# ---------------------------------------------------------------------------
# T1 (MANDATORY, board verification_gate): exact 2026-08-07T05:56Z 12-sample
# death series + RestartCount 0->1 delta -> verdict==ESCALATE.
# ---------------------------------------------------------------------------
run_case
SERIES="$DEATH_SERIES"
STUB_RESTART_BEFORE="0"; STUB_RESTART_AFTER="1"
STUB_STARTED_BEFORE="2026-08-06T23:21:41Z"; STUB_STARTED_AFTER="2026-08-07T05:57:26.416Z"
OUT1="$(run_a30_reclamation_check)"; RC1=$?
V1="$(verdict_of "$OUT1")"
if [ "$RC1" -eq 0 ] && [ "$V1" = '"verdict": "ESCALATE"' ] && printf '%s' "$OUT1" | grep -q 'RestartCount 0->1'; then
  ok "T1-decisive-death-series-restart-delta-escalates (rc=$RC1, $V1)"
else
  bad "T1-decisive-death-series-restart-delta-escalates (rc=$RC1, $V1)" "$OUT1"
fi

# ---------------------------------------------------------------------------
# T2 (negative control): benign GC sawtooth (85-93% band, one 97.8% peak that
# promptly reclaims, no restart/OOM/death signature) -> FOLD.
# ---------------------------------------------------------------------------
run_case
OUT2="$(run_a30_reclamation_check)"; RC2=$?
V2="$(verdict_of "$OUT2")"
if [ "$RC2" -eq 0 ] && [ "$V2" = '"verdict": "FOLD"' ]; then
  ok "T2-benign-sawtooth-folds ($V2)"
else
  bad "T2-benign-sawtooth-folds ($V2)" "$OUT2"
fi

# ---------------------------------------------------------------------------
# T3 (negative control, proves fix (b)'s max->median replacement did not
# regress into a new single-spike false positive): one sample touches 99%,
# then a smooth healthy reclaim down to 36% with no discontinuity -> FOLD.
# ---------------------------------------------------------------------------
run_case
SERIES="$SPIKE_THEN_RECLAIM"
OUT3="$(run_a30_reclamation_check)"; RC3=$?
V3="$(verdict_of "$OUT3")"
if [ "$RC3" -eq 0 ] && [ "$V3" = '"verdict": "FOLD"' ]; then
  ok "T3-single-spike-then-reclaim-folds ($V3)"
else
  bad "T3-single-spike-then-reclaim-folds ($V3)" "$OUT3"
fi

# ---------------------------------------------------------------------------
# T4 (positive control, fix (b) core bug): sustained ~99% window with several
# <=1pp jitter dips (never a real reclaim) -> ESCALATE (this is the exact
# "Sustained 99pct with one 0.6pp jitter = FOLD" shape po_amendment_20260807T0610Z
# names as the bug; pre-fix, DIPS>0 here would have unconditionally forced FOLD).
# ---------------------------------------------------------------------------
run_case
SERIES="$SUSTAINED_HIGH_ONE_JITTER"
OUT4="$(run_a30_reclamation_check)"; RC4=$?
V4="$(verdict_of "$OUT4")"
if [ "$RC4" -eq 0 ] && [ "$V4" = '"verdict": "ESCALATE"' ] && printf '%s' "$OUT4" | grep -q 'sustained high'; then
  ok "T4-sustained-high-with-jitter-dips-escalates ($V4)"
else
  bad "T4-sustained-high-with-jitter-dips-escalates ($V4)" "$OUT4"
fi

# ---------------------------------------------------------------------------
# T5 (positive control, fix (c) in isolation): a >40pp single-step drop with
# NO restart/OOM/death signature (defense-in-depth — state re-read is not
# the only path to catching a crash cliff) -> ESCALATE, reason cites
# "discontinuity", and the drop must NOT be counted in reclamation_dips.
# ---------------------------------------------------------------------------
run_case
SERIES="99.00,98.50,20.00,21.00,20.50,21.50,20.80,21.20,20.90,21.10,20.95,21.05"
OUT5="$(run_a30_reclamation_check)"; RC5=$?
V5="$(verdict_of "$OUT5")"
if [ "$RC5" -eq 0 ] && [ "$V5" = '"verdict": "ESCALATE"' ] \
   && printf '%s' "$OUT5" | grep -q 'discontinuity' \
   && printf '%s' "$OUT5" | grep -q '"discontinuities": 1' \
   && printf '%s' "$OUT5" | grep -q '98.50->20.00'; then
  ok "T5-discontinuity-without-restart-delta-escalates ($V5)"
else
  bad "T5-discontinuity-without-restart-delta-escalates ($V5)" "$OUT5"
fi

# ---------------------------------------------------------------------------
# T6 (positive control, fix (d) in isolation): ExitCode=0 + FinishedAt delta,
# NO RestartCount/StartedAt delta (RestartCount unchanged — restart: "no"
# edge case) -> ESCALATE citing the death-signature reason, not the
# state-changed reason.
# ---------------------------------------------------------------------------
run_case
SERIES="$STEADY_MID"
STUB_FINISHED_BEFORE="0001-01-01T00:00:00Z"; STUB_FINISHED_AFTER="2026-08-07T05:57:26.041Z"
STUB_EXITCODE_BEFORE="0"; STUB_EXITCODE_AFTER="0"
OUT6="$(run_a30_reclamation_check)"; RC6=$?
V6="$(verdict_of "$OUT6")"
if [ "$RC6" -eq 0 ] && [ "$V6" = '"verdict": "ESCALATE"' ] && printf '%s' "$OUT6" | grep -q 'ExitCode=0 with FinishedAt delta'; then
  ok "T6-exitcode0-finishedat-delta-death-signature-escalates ($V6)"
else
  bad "T6-exitcode0-finishedat-delta-death-signature-escalates ($V6)" "$OUT6"
fi

# ---------------------------------------------------------------------------
# T6b (negative control): FinishedAt UNCHANGED (stale pre-existing exit event,
# not from this window) + ExitCode=0 -> must NOT escalate on the death
# signature (state_changed/discontinuity/etc. also all absent) -> FOLD.
# ---------------------------------------------------------------------------
run_case
SERIES="$STEADY_MID"
STUB_EXITCODE_BEFORE="0"; STUB_EXITCODE_AFTER="0"
OUT6B="$(run_a30_reclamation_check)"; RC6B=$?
V6B="$(verdict_of "$OUT6B")"
if [ "$RC6B" -eq 0 ] && [ "$V6B" = '"verdict": "FOLD"' ]; then
  ok "T6b-stale-finishedat-no-delta-does-not-escalate ($V6B)"
else
  bad "T6b-stale-finishedat-no-delta-does-not-escalate ($V6B)" "$OUT6B"
fi

# ---------------------------------------------------------------------------
# T7 (positive control, fix (e) in isolation): VmHWM advances during the
# window AND is pinned at/near the cgroup limit, no other signal present
# -> ESCALATE citing VmHWM.
# ---------------------------------------------------------------------------
run_case
SERIES="$STEADY_MID"
STUB_MEMLIMIT_BYTES="3221225472"           # 3GiB cap -> 3145728 kB
STUB_VMHWM_BEFORE="3000000"; STUB_VMHWM_AFTER="3100000"   # advances, and >=90% of 3145728
OUT7="$(run_a30_reclamation_check)"; RC7=$?
V7="$(verdict_of "$OUT7")"
if [ "$RC7" -eq 0 ] && [ "$V7" = '"verdict": "ESCALATE"' ] && printf '%s' "$OUT7" | grep -q 'VmHWM advancing'; then
  ok "T7-vmhwm-advancing-and-pinned-at-cap-escalates ($V7)"
else
  bad "T7-vmhwm-advancing-and-pinned-at-cap-escalates ($V7)" "$OUT7"
fi

# ---------------------------------------------------------------------------
# T8 (negative control): VmHWM pinned at the cap but NOT advancing this
# window (before==after — an old peak, not a new one) -> must not escalate
# on VmHWM alone -> FOLD.
# ---------------------------------------------------------------------------
run_case
SERIES="$STEADY_MID"
STUB_MEMLIMIT_BYTES="3221225472"
STUB_VMHWM_BEFORE="3100000"; STUB_VMHWM_AFTER="3100000"   # pinned at cap, but NOT advancing
OUT8="$(run_a30_reclamation_check)"; RC8=$?
V8="$(verdict_of "$OUT8")"
if [ "$RC8" -eq 0 ] && [ "$V8" = '"verdict": "FOLD"' ]; then
  ok "T8-vmhwm-pinned-not-advancing-does-not-escalate ($V8)"
else
  bad "T8-vmhwm-pinned-not-advancing-does-not-escalate ($V8)" "$OUT8"
fi

# ---------------------------------------------------------------------------
# T9 (negative control): VmHWM advancing but far below the cap -> must not
# escalate on VmHWM alone -> FOLD.
# ---------------------------------------------------------------------------
run_case
SERIES="$STEADY_MID"
STUB_MEMLIMIT_BYTES="3221225472"
STUB_VMHWM_BEFORE="1000000"; STUB_VMHWM_AFTER="1200000"   # advancing, but well under 90% of cap
OUT9="$(run_a30_reclamation_check)"; RC9=$?
V9="$(verdict_of "$OUT9")"
if [ "$RC9" -eq 0 ] && [ "$V9" = '"verdict": "FOLD"' ]; then
  ok "T9-vmhwm-advancing-but-not-pinned-does-not-escalate ($V9)"
else
  bad "T9-vmhwm-advancing-but-not-pinned-does-not-escalate ($V9)" "$OUT9"
fi

# ---------------------------------------------------------------------------
# T10 (positive control, fix (a) in isolation, OOMKilled only AFTER loop):
# STUB_OOM_BEFORE=false, STUB_OOM_AFTER=true (an OOM kill that happens
# mid-window, proving the AFTER re-read matters even independent of the
# state_changed RestartCount/StartedAt branch — e.g. a manual/no-restart-
# policy kill) -> ESCALATE citing OOMKilled=true.
# ---------------------------------------------------------------------------
run_case
SERIES="$STEADY_MID"
STUB_OOM_BEFORE="false"; STUB_OOM_AFTER="true"
OUT10="$(run_a30_reclamation_check)"; RC10=$?
V10="$(verdict_of "$OUT10")"
if [ "$RC10" -eq 0 ] && [ "$V10" = '"verdict": "ESCALATE"' ] && printf '%s' "$OUT10" | grep -q '"reason": "OOMKilled=true"'; then
  ok "T10-oomkilled-after-loop-only-still-escalates ($V10)"
else
  bad "T10-oomkilled-after-loop-only-still-escalates ($V10)" "$OUT10"
fi

# ---------------------------------------------------------------------------
# T11 (static regression, fix (e) tautology removed): the old narrative claim
# that VmHWM being far above VmRSS proves reclamation already occurred (a
# verdict/narrative comparing VmHWM directly against VmRSS) must no longer be
# present in the script text.
# ---------------------------------------------------------------------------
if grep -q "proves reclamation already occurred" "$SCRIPT" || grep -qE 'VmHWM >> VmRSS' "$SCRIPT"; then
  bad "T11-vmhwm-vs-vmrss-tautology-removed-from-script-text"
else
  ok "T11-vmhwm-vs-vmrss-tautology-removed-from-script-text"
fi

# ---------------------------------------------------------------------------
# T12 (bonus, unchanged error path): container not found -> error JSON, rc=2.
# ---------------------------------------------------------------------------
run_case
CONTAINER="notfound"
OUT12="$(run_a30_reclamation_check)"; RC12=$?
if [ "$RC12" -eq 2 ] && printf '%s' "$OUT12" | grep -q '"error"'; then
  ok "T12-container-not-found-error-rc2 (rc=$RC12)"
else
  bad "T12-container-not-found-error-rc2 (rc=$RC12)" "$OUT12"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
