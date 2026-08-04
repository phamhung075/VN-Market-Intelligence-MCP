#!/usr/bin/env bash
# scripts/agents-flow/orch-sentinel-lite-probe.test.sh
#
# Regression test for CADRAT-6 — exercises the SKIP-SPAWN / SPAWN verdict
# paths of orch-sentinel-lite-probe.sh via a stubbed `run_probe` (function-
# override after sourcing — a MINIMAL surface, since this script's ONLY
# dependency on auditor-tier1-probe.sh is that one function call, called
# with "suppress_heartbeat"), so NO real docker/curl/df/launchctl call is
# made and Tier-1's own heartbeat file is never touched.
#
# Run:
#   bash scripts/agents-flow/orch-sentinel-lite-probe.test.sh
#
# Exit 0 = all pass. Exit 1 = >=1 failure.
# Owning task: CADRAT-6-ORCH-SENTINEL-LITE-PREGATE
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROBE_SH="$SCRIPT_DIR/orch-sentinel-lite-probe.sh"

if [ ! -f "$PROBE_SH" ]; then
  echo "ERROR: probe script not found at $PROBE_SH" >&2
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

# ── Isolated tmp fixture (scorecard path only — this script touches no other
# local files) ────────────────────────────────────────────────────────────
TMPDIR_TEST=$(mktemp -d /private/tmp/orch-sentinel-lite-probe-test-XXXXXX)
cleanup() { rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT

export SCORECARD_PATH="$TMPDIR_TEST/orch-sentinel-scorecard.md"

# ── Source the script under test (guard prevents auto-exec: $0 != BASH_SOURCE) ──
# This ALSO sources the real auditor-tier1-probe.sh (this script's own
# dependency) — pulling in its real run_probe() — which the stub below then
# overrides. No env-var pointing needed: AUDITOR_TIER1_PROBE_SH defaults to
# the real sibling file, which is fine to source (defines functions only,
# never auto-execs — same BASH_SOURCE!=$0 guard).
# shellcheck source=./orch-sentinel-lite-probe.sh
source "$PROBE_SH"

# ── Stub run_probe — overrides the real auditor-tier1-probe.sh function this
# script calls with "suppress_heartbeat". Dispatch controlled by
# $STUB_INFRA ("green"|"failure", default "green"). Asserts it was ALWAYS
# called with "suppress_heartbeat" (T-suppress below) — Tier-1's own
# heartbeat file must never be touched by this probe. ────────────────────
SUPPRESS_ARG_LOG="$TMPDIR_TEST/suppress-arg-log.txt"
run_probe() {
  printf '%s\n' "${1:-<none>}" >> "$SUPPRESS_ARG_LOG"
  case "${STUB_INFRA:-green}" in
    green) jq -nc '{verdict:"ALL_GREEN", detail:"all 6 checks passed", last_healthy_at:"2026-08-04T10:00:00Z"}'; return 0 ;;
    failure) jq -nc '{verdict:"FAILURE", detail:"docker_ps: mcp-server(Exited)", last_healthy_at:"2026-08-03T10:00:00Z"}'; return 1 ;;
  esac
}

_write_scorecard() {
  # $1 = run_ts (ISO), or "" to omit the field entirely (malformed OH-STATE)
  local run_ts="$1"
  if [ -z "$run_ts" ]; then
    printf '# scorecard\n\n<!-- OH-STATE: {"run_mode":"LITE"} -->\n' > "$SCORECARD_PATH"
  else
    printf '# scorecard\n\n<!-- OH-STATE: {"run_mode":"LITE","run_ts":"%s"} -->\n' "$run_ts" > "$SCORECARD_PATH"
  fi
}

run_case() {
  STUB_INFRA="green"
  rm -f "$SCORECARD_PATH"
  : > "$SUPPRESS_ARG_LOG"
}

# ── T1: SKIP-SPAWN — ALL_GREEN + fresh run_ts (10 min ago) ───────────────────
run_case
FRESH_TS=$(date -u -v-10M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%SZ)
_write_scorecard "$FRESH_TS"
OUT=$(run_orch_sentinel_lite_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T1 SKIP-SPAWN verdict (ALL_GREEN + fresh run_ts)" "$([ "$VERDICT" = "SKIP-SPAWN" ] && echo true || echo false)"
check "T1 exit=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"
check "T1 verdict JSON is the ONLY stdout line" "$([ "$(printf '%s' "$OUT" | wc -l | tr -d ' ')" = "0" ] && echo true || echo false)"
check "T1 run_probe called with suppress_heartbeat (Tier-1's own heartbeat never touched)" "$([ "$(cat "$SUPPRESS_ARG_LOG")" = "suppress_heartbeat" ] && echo true || echo false)"

# ── T2: SPAWN — infra FAILURE (checks_verdict != ALL_GREEN) ──────────────────
run_case
STUB_INFRA="failure"
FRESH_TS=$(date -u -v-10M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%SZ)
_write_scorecard "$FRESH_TS"
OUT=$(run_orch_sentinel_lite_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
CV=$(printf '%s' "$OUT" | jq -r '.checks_verdict')
check "T2 SPAWN verdict (infra FAILURE)" "$([ "$VERDICT" = "SPAWN" ] && echo true || echo false)"
check "T2 exit=1" "$([ "$RC" -eq 1 ] && echo true || echo false)"
check "T2 checks_verdict=FAILURE surfaced" "$([ "$CV" = "FAILURE" ] && echo true || echo false)"

# ── T3: SPAWN — scorecard file missing entirely ───────────────────────────────
run_case
OUT=$(run_orch_sentinel_lite_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T3 SPAWN verdict (scorecard missing)" "$([ "$VERDICT" = "SPAWN" ] && echo true || echo false)"
check "T3 exit=1" "$([ "$RC" -eq 1 ] && echo true || echo false)"

# ── T4: SPAWN — OH-STATE block present but run_ts field absent (malformed) ───
run_case
_write_scorecard ""
OUT=$(run_orch_sentinel_lite_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T4 SPAWN verdict (OH-STATE run_ts absent)" "$([ "$VERDICT" = "SPAWN" ] && echo true || echo false)"
check "T4 exit=1" "$([ "$RC" -eq 1 ] && echo true || echo false)"

# ── T4b: SPAWN — scorecard has no OH-STATE comment block at all ──────────────
run_case
printf '# scorecard\n\nno comment block here\n' > "$SCORECARD_PATH"
OUT=$(run_orch_sentinel_lite_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T4b SPAWN verdict (no OH-STATE block at all)" "$([ "$VERDICT" = "SPAWN" ] && echo true || echo false)"

# ── T5: SPAWN — run_ts unparseable ────────────────────────────────────────────
run_case
_write_scorecard "not-a-real-timestamp"
OUT=$(run_orch_sentinel_lite_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T5 SPAWN verdict (run_ts unparseable)" "$([ "$VERDICT" = "SPAWN" ] && echo true || echo false)"
check "T5 exit=1" "$([ "$RC" -eq 1 ] && echo true || echo false)"

# ── T6: SPAWN — run_ts parses but is STALE (> 2880min = 48h threshold) ───────
run_case
STALE_TS=$(date -u -v-3d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '3 days ago' +%Y-%m-%dT%H:%M:%SZ)
_write_scorecard "$STALE_TS"
OUT=$(run_orch_sentinel_lite_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
AGE=$(printf '%s' "$OUT" | jq -r '.run_age_minutes')
check "T6 SPAWN verdict (run_ts stale, 3 days > 2880min threshold)" "$([ "$VERDICT" = "SPAWN" ] && echo true || echo false)"
check "T6 run_age_minutes > 2880" "$([ "$AGE" -gt 2880 ] && echo true || echo false)"

# ── T7: SKIP-SPAWN — run_ts exactly at the boundary is still fresh (<=) ──────
run_case
BOUNDARY_TS=$(date -u -v-2879M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '2879 minutes ago' +%Y-%m-%dT%H:%M:%SZ)
_write_scorecard "$BOUNDARY_TS"
OUT=$(run_orch_sentinel_lite_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T7 SKIP-SPAWN verdict (2879min < 2880min threshold, still fresh)" "$([ "$VERDICT" = "SKIP-SPAWN" ] && echo true || echo false)"

# ── T8: a recent FULL-mode run also counts as fresh (run_mode is irrelevant —
# FULL's own Mode Dispatch runs OH-1 first, confirming plumbing exactly like
# LITE would) ─────────────────────────────────────────────────────────────
run_case
FRESH_TS=$(date -u -v-10M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%SZ)
printf '# scorecard\n\n<!-- OH-STATE: {"run_mode":"FULL","run_ts":"%s"} -->\n' "$FRESH_TS" > "$SCORECARD_PATH"
OUT=$(run_orch_sentinel_lite_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T8 SKIP-SPAWN verdict (recent FULL-mode run_ts counts as fresh)" "$([ "$VERDICT" = "SKIP-SPAWN" ] && echo true || echo false)"

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
