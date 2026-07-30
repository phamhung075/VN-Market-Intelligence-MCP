#!/usr/bin/env bash
# docs/agents/system-auditor/probe.test.sh
#
# Regression test for FIX-AUDITOR-A12-PROBE-TIMEOUT-EXITCODE-DEBOUNCE (A2) —
# exercises _classify_curl_exit() in isolation via `source` (the standalone-
# execution guard in probe.sh prevents the real docker/curl probe body from
# running when sourced, same pattern as scripts/emit-audit-signal.test.sh /
# scripts/agents-flow/auditor-tier1-probe.test.sh). NO real docker/network
# calls are made by this test.
#
# Run:
#   bash docs/agents/system-auditor/probe.test.sh
#
# Exit 0 = all pass. Exit 1 = >=1 failure.
# Owning task: FIX-AUDITOR-A12-PROBE-TIMEOUT-EXITCODE-DEBOUNCE
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROBE_SH="$SCRIPT_DIR/probe.sh"

if [ ! -f "$PROBE_SH" ]; then
  echo "ERROR: probe script not found at $PROBE_SH" >&2
  exit 1
fi

PASS=0
FAIL=0

check() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $label (expected='$expected' actual='$actual')"
    FAIL=$((FAIL + 1))
  fi
}

# Source the script under test — the guard (`[[ "${BASH_SOURCE[0]}" == "${0}" ]]`)
# means the real docker/curl probe body does NOT execute here, only the
# function definitions above it (SCRIPT_DIR/REPO_ROOT resolution +
# _classify_curl_exit) run.
# shellcheck source=./probe.sh
source "$PROBE_SH"

# ── T1-T5: the 4 named curl exit codes from architecture brief §3 + the
# catch-all fallback for an unrecognized code ──────────────────────────────
check "T1 exit=28 -> CLIENT_TIMEOUT" "CLIENT_TIMEOUT" "$(_classify_curl_exit 28)"
check "T2 exit=7 -> CONN_REFUSED"    "CONN_REFUSED"   "$(_classify_curl_exit 7)"
check "T3 exit=6 -> DNS_FAIL"        "DNS_FAIL"       "$(_classify_curl_exit 6)"
check "T4 exit=52 -> EMPTY_REPLY"    "EMPTY_REPLY"    "$(_classify_curl_exit 52)"
check "T5 exit=99 (unrecognized) -> CURL_ERR_99" "CURL_ERR_99" "$(_classify_curl_exit 99)"

# ── T6: never collapses two DISTINCT codes to the SAME opaque token — the
# exact regression this task exists to close (previously every one of these
# printed the identical literal string "CURL_ERR") ─────────────────────────
r28=$(_classify_curl_exit 28)
r7=$(_classify_curl_exit 7)
r6=$(_classify_curl_exit 6)
r52=$(_classify_curl_exit 52)
if [ "$r28" != "$r7" ] && [ "$r7" != "$r6" ] && [ "$r6" != "$r52" ] && [ "$r28" != "$r6" ] && [ "$r28" != "$r52" ] && [ "$r7" != "$r52" ]; then
  echo "PASS: T6 all 4 named codes classify to mutually distinct reasons"
  PASS=$((PASS + 1))
else
  echo "FAIL: T6 two named codes collapsed to the same reason ($r28/$r7/$r6/$r52)"
  FAIL=$((FAIL + 1))
fi

# ── T7: sourcing probe.sh must NOT execute the real probe body (no stray
# "=== AUDITOR PROBE" banner, no docker/curl calls against localhost) — this
# is what the standalone-execution guard exists to prove ──────────────────
SOURCE_OUTPUT=$(bash -c "source '$PROBE_SH'; echo SOURCE_OK" 2>&1)
case "$SOURCE_OUTPUT" in
  *"AUDITOR PROBE"*)
    echo "FAIL: T7 sourcing probe.sh ran the real probe body (guard did not prevent it)"
    FAIL=$((FAIL + 1))
    ;;
  *"SOURCE_OK"*)
    echo "PASS: T7 sourcing probe.sh only defines functions, does not run the probe body"
    PASS=$((PASS + 1))
    ;;
  *)
    echo "FAIL: T7 unexpected output sourcing probe.sh: $SOURCE_OUTPUT"
    FAIL=$((FAIL + 1))
    ;;
esac

echo ""
echo "probe.test.sh: ${PASS} pass / ${FAIL} fail"
[ "$FAIL" -eq 0 ]
