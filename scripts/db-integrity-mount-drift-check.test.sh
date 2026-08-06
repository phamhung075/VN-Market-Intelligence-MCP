#!/usr/bin/env bash
# scripts/db-integrity-mount-drift-check.test.sh
#
# Regression test for scripts/db-integrity-mount-drift-check.sh (AC-7,
# FIX-DB-INTEGRITY-SIDECAR-NAMED-VOLUME-DRIFT) — exercises the PASS/FAIL/SKIP verdict
# paths via a stubbed `docker` (function-override after sourcing, same pattern as
# db-integrity-probe.test.sh's sqlite3 stub / auditor-tier1-probe.test.sh's docker/curl/
# df stubs), so NO real docker/container call is made. T5 additionally replays against
# the REAL live docker stack when available (graceful SKIP-as-PASS-condition, not a
# false failure, when this host has no mcp-server container running).
#
# Run:
#   bash scripts/db-integrity-mount-drift-check.test.sh
# Exit 0 = all pass (SKIPs allowed). Exit 1 = >=1 failure.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CHECK_SH="$SCRIPT_DIR/db-integrity-mount-drift-check.sh"

if [ ! -f "$CHECK_SH" ]; then
  echo "ERROR: db-integrity-mount-drift-check.sh not found at $CHECK_SH" >&2
  exit 1
fi

PASS=0
FAIL=0
SKIP=0

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

TMPDIR_TEST=$(mktemp -d /private/tmp/db-integrity-mount-drift-test-XXXXXX)
cleanup() { rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT

# ── Two real, distinct fixture directories (so realpath comparisons are meaningful) ──
MATCH_DIR="$TMPDIR_TEST/live"
DRIFT_DIR="$TMPDIR_TEST/drifted-mount-src"
mkdir -p "$MATCH_DIR" "$DRIFT_DIR"
FIXTURE_DB="$MATCH_DIR/market.db"
: > "$FIXTURE_DB"

# ── Source the script under test (guard prevents auto-exec: $0 != BASH_SOURCE) ──
# shellcheck source=./db-integrity-mount-drift-check.sh
source "$CHECK_SH"

# ── Stub docker — controls `docker ps` (container discovery) and `docker inspect`
# (mount resolution). STUB_MODE:
#   match     — container found, mount source == MATCH_DIR (observer's dir)
#   mismatch  — container found, mount source == DRIFT_DIR (a DIFFERENT dir)
#   no_mount  — container found, docker inspect returns empty (no /app/data mount)
#   no_ctr    — docker ps returns no matching container (stack not running)
#   unreachable — docker itself errors (daemon down)
docker() {
  case "${STUB_MODE:-match}" in
    unreachable) return 127 ;;
  esac
  local sub="$1"
  case "$sub" in
    ps)
      case "${STUB_MODE:-match}" in
        no_ctr) printf '' ;;
        *) printf 'vn-market-intelligence-mcp-mcp-server-1\n' ;;
      esac
      return 0
      ;;
    inspect)
      case "${STUB_MODE:-match}" in
        match) printf '%s' "$MATCH_DIR" ;;
        mismatch) printf '%s' "$DRIFT_DIR" ;;
        no_mount) printf '' ;;
      esac
      return 0
      ;;
  esac
}

# ── T1: PASS — mount source matches the observer's configured dir ────────────
OUT1=$(STUB_MODE="match" MARKET_DB_HOST_PATH="$FIXTURE_DB" run_mount_drift_check 2>&1)
RC1=$?
check "T1 PASS exit=0" "$([ "$RC1" -eq 0 ] && echo true || echo false)"
check "T1 PASS message" "$(printf '%s' "$OUT1" | grep -q 'PASS:' && echo true || echo false)"

# ── T2 (the actual regression this guard exists to catch): FAIL — mount source
# diverges from the observer's configured dir ─────────────────────────────────
OUT2=$(STUB_MODE="mismatch" MARKET_DB_HOST_PATH="$FIXTURE_DB" run_mount_drift_check 2>&1)
RC2=$?
check "T2 MOUNT-DRIFT exit=1 (fail loud, the exact regression class this guard targets)" "$([ "$RC2" -eq 1 ] && echo true || echo false)"
check "T2 MOUNT-DRIFT stderr names both diverging paths" "$(printf '%s' "$OUT2" | grep -q 'MOUNT DRIFT DETECTED' && echo true || echo false)"

# ── T3: FAIL — container running but NO /app/data mount at all ───────────────
OUT3=$(STUB_MODE="no_mount" MARKET_DB_HOST_PATH="$FIXTURE_DB" run_mount_drift_check 2>&1)
RC3=$?
check "T3 no-mount exit=1" "$([ "$RC3" -eq 1 ] && echo true || echo false)"
check "T3 no-mount stderr message" "$(printf '%s' "$OUT3" | grep -q 'NO /app/data mount' && echo true || echo false)"

# ── T4: SKIP — no matching container running (stack not up on this host) ─────
OUT4=$(STUB_MODE="no_ctr" MARKET_DB_HOST_PATH="$FIXTURE_DB" run_mount_drift_check 2>&1)
RC4=$?
check "T4 no-container SKIP exit=0 (cannot assert, not a defect)" "$([ "$RC4" -eq 0 ] && echo true || echo false)"
check "T4 no-container SKIP message" "$(printf '%s' "$OUT4" | grep -q 'SKIP:' && echo true || echo false)"

# ── T4b: SKIP — docker itself unreachable (daemon down) ──────────────────────
OUT4B=$(STUB_MODE="unreachable" MARKET_DB_HOST_PATH="$FIXTURE_DB" run_mount_drift_check 2>&1)
RC4B=$?
check "T4b docker-unreachable SKIP exit=0" "$([ "$RC4B" -eq 0 ] && echo true || echo false)"

# ── T4c: SKIP — observer path itself does not exist on this host (unresolvable) ──
OUT4C=$(STUB_MODE="match" MARKET_DB_HOST_PATH="$TMPDIR_TEST/does-not-exist-dir/market.db" run_mount_drift_check 2>&1)
RC4C=$?
check "T4c unresolvable-observer-path SKIP exit=0" "$([ "$RC4C" -eq 0 ] && echo true || echo false)"

unset -f docker

# ── T5: LIVE REPLAY — against the REAL docker stack when available. Graceful
# non-failing SKIP when this host has no mcp-server container running (mirrors
# db-empty-table-classify.test.sh's T11 / db-integrity-counts.test.sh's T5 pattern). ──
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q 'mcp-server'; then
  OUT5=$(run_mount_drift_check 2>&1); RC5=$?
  check "T5 LIVE replay exits 0 or 1 (a real verdict was reached, not a crash)" "$([ "$RC5" -eq 0 ] || [ "$RC5" -eq 1 ] && echo true || echo false)"
  check "T5 LIVE replay produced a PASS or FAIL line" "$(printf '%s' "$OUT5" | grep -Eq 'PASS:|FAIL:' && echo true || echo false)"
else
  echo "SKIP: T5 LIVE replay — no mcp-server container running on this host"
  SKIP=$((SKIP + 1))
fi

# ── Summary ──────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed, $SKIP skipped"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
