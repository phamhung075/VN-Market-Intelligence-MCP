#!/usr/bin/env bash
# scripts/agents-flow/cowork-load-probe.test.sh
#
# Regression tests for scripts/agents-flow/cowork-load-probe.sh
# (FIX-COWORK-FANOUT-LOAD1MIN-COMMA-LOCALE-PARSE, cowork-fire 30d983ac):
#   - comma-locale "2,19" -> "2.19" (numeric), NEVER "219" (the exact incident)
#   - dot-locale + comma-locale, macOS ("load averages:" space-separated) AND
#     Linux ("load average:" comma-separated) uptime shapes
#   - integer / zero / multi-digit loads stay exact
#   - unparseable input fails loud: non-zero exit, NOTHING on stdout
#   - real-host smoke test: bare invocation (no fixture arg) probes `uptime`
#
# Fixtures are exact uptime output lines (one per case), including the LIVE
# comma-locale host shape "load averages: 4,22 4,75 5,27".
#
# Run: bash scripts/agents-flow/cowork-load-probe.test.sh
# Exit 0 = all pass. Exit 1 = >=1 failure.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROBE_SH="$SCRIPT_DIR/cowork-load-probe.sh"

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

probe() {  # probe <fixture> -> prints stdout; captures RC in PROBE_RC
  local fixture="$1"
  PROBE_OUT="$("$PROBE_SH" "$fixture" 2>/dev/null)"
  PROBE_RC=$?
}

# ── the exact incident case: comma-locale "2,19" must parse to 2.19, never 219 ──
probe "load averages: 2,19 2,05 1,98"
check "cowork-fire 30d983ac: '2,19' -> '2.19' (exit 0)" "$([ "$PROBE_RC" -eq 0 ] && echo true || echo false)"
check "cowork-fire 30d983ac: output == '2.19'" "$([ "$PROBE_OUT" = "2.19" ] && echo true || echo false)"
check "cowork-fire 30d983ac: output != '219'" "$([ "$PROBE_OUT" != "219" ] && echo true || echo false)"
check "cowork-fire 30d983ac: output does not contain '219'" \
  "$(printf '%s' "$PROBE_OUT" | grep -Fq '219' && echo false || echo true)"

# ── live comma-locale host shape (macOS 'load averages:', space-separated) ─────
probe " 2:59  up 48 days,  6:01, 9 users, load averages: 4,22 4,75 5,27"
check "live host: '4,22' -> '4.22' (exit 0)" "$([ "$PROBE_RC" -eq 0 ] && echo true || echo false)"
check "live host: output == '4.22'" "$([ "$PROBE_OUT" = "4.22" ] && echo true || echo false)"

# ── Linux comma-locale (comma-separated list: '2,19,' -> trailing list comma) ──
probe " 10:30:00 up 3 days,  2:19,  3 users,  load average: 2,19, 2,05, 1,98"
check "linux comma: output == '2.19'" "$([ "$PROBE_OUT" = "2.19" ] && echo true || echo false)"
check "linux comma: no trailing dot ('2.19.' rejected)" "$([ "$PROBE_OUT" = "2.19." ] && echo false || echo true)"

# ── Linux dot-locale ───────────────────────────────────────────────────────────
probe " 10:30:00 up 3 days,  2:19,  3 users,  load average: 2.19, 2.05, 1.98"
check "linux en: output == '2.19'" "$([ "$PROBE_OUT" = "2.19" ] && echo true || echo false)"

# ── macOS dot-locale ───────────────────────────────────────────────────────────
probe "10:30  up 3 days,  2:19,  3 users,  load averages: 2.19 2.05 1.98"
check "macos en: output == '2.19'" "$([ "$PROBE_OUT" = "2.19" ] && echo true || echo false)"

# ── integer / zero / multi-digit loads stay exact ──────────────────────────────
probe "load average: 2, 2, 1"
check "integer load: output == '2'" "$([ "$PROBE_OUT" = "2" ] && echo true || echo false)"
probe "load average: 0.00, 0.01, 0.05"
check "zero load: output == '0.00'" "$([ "$PROBE_OUT" = "0.00" ] && echo true || echo false)"
probe "load averages: 12.50 12.25 12.00"
check "multi-digit: output == '12.50'" "$([ "$PROBE_OUT" = "12.50" ] && echo true || echo false)"

# ── fail-loud: unparseable input -> non-zero exit, NOTHING on stdout ───────────
probe "10:30:00 up 3 days"                       # no load-average section at all
check "no load-average section: non-zero exit" "$([ "$PROBE_RC" -ne 0 ] && echo true || echo false)"
check "no load-average section: nothing on stdout" "$([ -z "$PROBE_OUT" ] && echo true || echo false)"
probe "load average: foo bar"                    # non-numeric token
check "garbage token: non-zero exit" "$([ "$PROBE_RC" -ne 0 ] && echo true || echo false)"
check "garbage token: nothing on stdout" "$([ -z "$PROBE_OUT" ] && echo true || echo false)"

# ── real-host smoke test: bare invocation probes the actual `uptime` ───────────
REAL_OUT="$("$PROBE_SH" 2>/dev/null)"
REAL_RC=$?
check "real host: exit 0" "$([ "$REAL_RC" -eq 0 ] && echo true || echo false)"
check "real host: output is a valid decimal number" \
  "$(printf '%s' "$REAL_OUT" | grep -Eq '^[0-9]+(\.[0-9]+)?$' && echo true || echo false)"
check "real host: output != '219'" "$([ "$REAL_OUT" != "219" ] && echo true || echo false)"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
