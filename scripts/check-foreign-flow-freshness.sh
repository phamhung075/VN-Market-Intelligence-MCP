#!/usr/bin/env bash
# scripts/check-foreign-flow-freshness.sh
#
# FFLOW-STALE-0723-B-RECHECK-HARNESS — persistent, calendar-aware freshness
# gate for market foreign-flow ("khoi ngoai") data. This IS PART A's "assume
# complete fixed" gate: PART A (Vinahost VPS restore for vn-foreign-flow.
# service) is NOT DONE_VERIFIED until this script exits 0 against a LIVE
# probe for the current completed VN trading session — never on ops
# self-report alone.
#
# WHY this exists: get_market_foreign_flow.latest_date froze at 2026-07-21
# when the Vinahost VPS hosting vn-foreign-flow.service was suspended for
# non-payment (incident FFLOW-STALE-0723). A naive "== yesterday" check is
# weekend/holiday-blind (precedent: ALPHA-S1-STARTUP-CANDLE-GUARD — 2026-
# 07-11 was a Saturday, no candle to recover; a naive check would have
# false-positived). This harness reuses the SAME canonical VN trading-
# calendar module the OHLCV pipeline uses
# (apps/mcp-server/src/domain/services/vnTradingCalendar.ts) via a `bun -e`
# shell-out — NO hardcoded holiday list lives in this file (AC-B6).
#
# ── Contract ────────────────────────────────────────────────────────────
#   PROBE   : get_market_foreign_flow(days:1) via the gateway, through
#             scripts/agents-flow/mcp-call.sh (server=vn-market). Tool
#             error / empty / unparseable -> ERROR, never false-green.
#   LCTS    : Last Completed Trading Session = most recent VN trading day
#             whose HOSE session is closed AND whose post-close
#             foreign-flow population window (grace cutoff, default 16:30
#             ICT) has elapsed. On a trading day before the cutoff, "today"
#             is not yet expected -> LCTS = previous trading day. On a
#             weekend/holiday, LCTS = the last preceding trading day (a
#             latest_date equal to it is FRESH — do not flag a legitimately
#             -closed session).
#   VERDICT : latest_date >= LCTS -> PASS,  exit 0.
#             latest_date <  LCTS -> STALE, exit 2.
#             any ambiguity (tool error / unparseable / calendar failure)
#               -> ERROR, exit 3. NEVER exit 0 on ambiguity.
#   STDOUT  : exactly one machine-parseable line per run, e.g.:
#     FOREIGN_FLOW_FRESHNESS verdict=PASS latest_date=2026-07-23 lcts=2026-07-23 now_ict=2026-07-23T23:14
#
# ── Usage ───────────────────────────────────────────────────────────────
#   scripts/check-foreign-flow-freshness.sh              # live check (cron/CI gate)
#   scripts/check-foreign-flow-freshness.sh --self-test   # proves both branches (see below)
#   scripts/check-foreign-flow-freshness.sh --help
#
# ── Self-test / override mode (test-only, gated — AC-B7) ──────────────────
#   Both vars below must be set TOGETHER to arm an override — a lone stray
#   env var can never silently bypass the live probe in production:
#     FFLOW_FRESH_SELF_TEST=1                        — required to arm ANY override
#     FFLOW_FRESH_OVERRIDE_LATEST_DATE=YYYY-MM-DD     — fakes the probe result
#     FFLOW_FRESH_OVERRIDE_NOW=YYYY-MM-DDTHH:MM:SSZ   — fakes "now" (UTC), optional
#   Built-in harness (no manual env-juggling needed) — proves STALE->exit 2,
#   FRESH->exit 0, and the weekend nuance (AC-B3), against the REAL calendar
#   module (not a mock):
#     scripts/check-foreign-flow-freshness.sh --self-test
#   NOTE: `--self-test`'s own exit code (0 = all 3 branches behaved as
#   expected / 1 = harness defect detected) is a DIFFERENT semantic space
#   from the plain-run verdict codes (0/2/3) above — it answers "does the
#   gate itself work", not "is the data fresh".
#
# ── Config ──────────────────────────────────────────────────────────────
#   FFLOW_FRESH_GRACE_CUTOFF_ICT — post-close grace cutoff "HH:MM" ICT,
#     default "16:30".
#
# ── Persistence + wiring (AC-B8) ───────────────────────────────────────
#   Registered per docs/policies/dev-standards.md § Script Persistence
#   (CANONICAL entry). Owning foreign-flow monitoring doc pointers:
#   docs/agents/ops/flow/vps.md, docs/agents/system-auditor/flow/main.md
#   § Per-Source Fetch Freshness. Exit code is designed to gate a cron/CI
#   freshness check (0 = safe to proceed / declare fixed, non-zero = block).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MCP_SERVER_DIR="$PROJECT_ROOT/apps/mcp-server"
MCP_CALL_SH="$PROJECT_ROOT/scripts/agents-flow/mcp-call.sh"
SELF="$SCRIPT_DIR/$(basename "${BASH_SOURCE[0]}")"

GRACE_CUTOFF_ICT="${FFLOW_FRESH_GRACE_CUTOFF_ICT:-16:30}"

EXIT_PASS=0
EXIT_STALE=2
EXIT_ERROR=3

_override_armed() {
  [ "${FFLOW_FRESH_SELF_TEST:-0}" = "1" ]
}

# ── now -> epoch (UTC) ─────────────────────────────────────────────────────
_iso_to_epoch() {
  local iso="$1" out
  if out=$(date -u -d "$iso" +%s 2>/dev/null); then
    printf '%s' "$out"; return 0
  fi
  if out=$(date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$iso" +%s 2>/dev/null); then
    printf '%s' "$out"; return 0
  fi
  return 1
}

_now_epoch_utc() {
  if _override_armed && [ -n "${FFLOW_FRESH_OVERRIDE_NOW:-}" ]; then
    _iso_to_epoch "$FFLOW_FRESH_OVERRIDE_NOW"
    return $?
  fi
  date -u +%s
}

# prints "YYYY-MM-DD HH:MM" — the ICT (UTC+7) wall-clock for the given UTC epoch
_epoch_to_ict() {
  local epoch="$1" ict_epoch out
  ict_epoch=$((epoch + 25200))
  if out=$(date -u -d "@$ict_epoch" +'%Y-%m-%d %H:%M' 2>/dev/null); then
    printf '%s' "$out"; return 0
  fi
  if out=$(date -u -r "$ict_epoch" +'%Y-%m-%d %H:%M' 2>/dev/null); then
    printf '%s' "$out"; return 0
  fi
  return 1
}

# ── AC-B1: PROBE — get_market_foreign_flow.latest_date via the gateway ─────
_probe_latest_date() {
  if _override_armed && [ -n "${FFLOW_FRESH_OVERRIDE_LATEST_DATE:-}" ]; then
    printf '%s' "$FFLOW_FRESH_OVERRIDE_LATEST_DATE"
    return 0
  fi
  if [ ! -f "$MCP_CALL_SH" ]; then
    echo "PROBE_ERROR: mcp-call.sh not found at $MCP_CALL_SH" >&2
    return 1
  fi
  # shellcheck disable=SC1090
  source "$MCP_CALL_SH"
  local raw
  if ! raw=$(mcp_call "get_market_foreign_flow" '{"days":1}' 2>&1); then
    echo "PROBE_ERROR: gateway call failed: $(printf '%s' "$raw" | tr '\n' ' ' | cut -c1-300)" >&2
    return 1
  fi
  # NOTE (live-verified 2026-07-23): the tool's "text" field embeds RAW
  # newlines (not \n-escaped), so the overall payload is NOT strict JSON —
  # `jq .` fails with "control characters ... must be escaped". Extract
  # latest_date with a tolerant regex instead of a strict JSON parse.
  local ld
  ld=$(printf '%s' "$raw" | grep -o '"latest_date"[[:space:]]*:[[:space:]]*"[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}"' \
        | head -n1 | grep -o '[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}')
  if [ -z "$ld" ]; then
    echo "PROBE_ERROR: latest_date not found/parseable in tool response: $(printf '%s' "$raw" | tr '\n' ' ' | cut -c1-300)" >&2
    return 1
  fi
  printf '%s' "$ld"
}

# ── AC-B2/B3/B6: LCTS via the canonical vnTradingCalendar.ts module ────────
# Delegates ALL weekend/holiday/backward-walk logic to the SAME module the
# OHLCV pipeline uses. No holiday date is ever hardcoded in this file.
_compute_lcts() {
  local ict_date="$1" ict_time="$2"
  if [ ! -d "$MCP_SERVER_DIR" ]; then
    echo "CALENDAR_ERROR: apps/mcp-server not found at $MCP_SERVER_DIR" >&2
    return 1
  fi
  if ! command -v bun >/dev/null 2>&1; then
    echo "CALENDAR_ERROR: bun runtime not found on PATH — required to reuse vnTradingCalendar.ts (deliberately no bash-side holiday fallback)" >&2
    return 1
  fi
  # NOTE: the heredoc is captured into a plain variable FIRST, then passed to
  # `bun -e` as a quoted expansion — do NOT inline `"$(cat <<'EOF' ... EOF)"`
  # directly as the `-e` argument. A single-quoted heredoc nested inside a
  # command substitution that is itself inside an OUTER pair of double quotes
  # is not fully quote-inert in bash: an odd apostrophe count in the body
  # (e.g. a JS comment containing "isn't") breaks the outer double-quote scan
  # with "unexpected EOF while looking for matching `'" (live-verified
  # 2026-07-23). Decoupling into a variable sidesteps the nested-quote parse.
  local js_src
  js_src=$(cat <<'BUNEOF'
const { mostRecentTradingDayOnOrBefore, shiftDateDays, isVnTradingDay } =
  await import('./src/domain/services/vnTradingCalendar.ts');
const ictDate = process.argv[1];
const ictTime = process.argv[2];
const grace = process.argv[3];
if (!/^\d{4}-\d{2}-\d{2}$/.test(ictDate) || !/^\d{2}:\d{2}$/.test(ictTime) || !/^\d{2}:\d{2}$/.test(grace)) {
  console.error('CALENDAR_ERROR: bad argv shape ictDate=' + ictDate + ' ictTime=' + ictTime + ' grace=' + grace);
  process.exit(1);
}
// AC-B2: before the grace cutoff on a trading day, "today" is not yet
// expected -> walk back from yesterday. AC-B3: on a weekend or holiday this
// is a no-op (today is not a trading day anyway) -- mostRecentTradingDayOnOrBefore
// walks back to the last preceding trading day regardless.
const candidate = (ictTime >= grace) ? ictDate : shiftDateDays(ictDate, -1);
const lcts = mostRecentTradingDayOnOrBefore(candidate);
const chk = isVnTradingDay(lcts);
if (!chk.is_trading_day) {
  console.error('CALENDAR_ERROR: LCTS resolution exhausted 14-day backward-walk bound from ' + candidate);
  process.exit(1);
}
console.log(lcts);
BUNEOF
)
  local out
  if ! out=$(cd "$MCP_SERVER_DIR" && bun -e "$js_src" -- "$ict_date" "$ict_time" "$GRACE_CUTOFF_ICT" 2>&1); then
    echo "CALENDAR_ERROR: $out" >&2
    return 1
  fi
  printf '%s' "$out" | tail -n1
}

# ── AC-B4/B5: core check — emits the one stdout line, returns the exit code ─
run_check() {
  local latest_date epoch ict_dt ict_date ict_time lcts now_ict_label="-"

  if ! latest_date=$(_probe_latest_date); then
    echo "FOREIGN_FLOW_FRESHNESS verdict=ERROR latest_date=- lcts=- now_ict=- reason=probe_failed"
    return "$EXIT_ERROR"
  fi
  if ! printf '%s' "$latest_date" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'; then
    echo "FOREIGN_FLOW_FRESHNESS verdict=ERROR latest_date=- lcts=- now_ict=- reason=latest_date_shape_invalid"
    return "$EXIT_ERROR"
  fi

  if ! epoch=$(_now_epoch_utc); then
    echo "FOREIGN_FLOW_FRESHNESS verdict=ERROR latest_date=${latest_date} lcts=- now_ict=- reason=now_parse_failed"
    return "$EXIT_ERROR"
  fi
  if ! ict_dt=$(_epoch_to_ict "$epoch"); then
    echo "FOREIGN_FLOW_FRESHNESS verdict=ERROR latest_date=${latest_date} lcts=- now_ict=- reason=ict_convert_failed"
    return "$EXIT_ERROR"
  fi
  ict_date="${ict_dt%% *}"
  ict_time="${ict_dt##* }"
  now_ict_label="${ict_date}T${ict_time}"

  if ! lcts=$(_compute_lcts "$ict_date" "$ict_time"); then
    echo "FOREIGN_FLOW_FRESHNESS verdict=ERROR latest_date=${latest_date} lcts=- now_ict=${now_ict_label} reason=calendar_failed"
    return "$EXIT_ERROR"
  fi

  if [[ "$latest_date" > "$lcts" || "$latest_date" == "$lcts" ]]; then
    echo "FOREIGN_FLOW_FRESHNESS verdict=PASS latest_date=${latest_date} lcts=${lcts} now_ict=${now_ict_label}"
    return "$EXIT_PASS"
  fi
  echo "FOREIGN_FLOW_FRESHNESS verdict=STALE latest_date=${latest_date} lcts=${lcts} now_ict=${now_ict_label}"
  return "$EXIT_STALE"
}

# ── AC-B7: self-test — proves BOTH branches (+ weekend nuance) via re-exec ──
_self_test() {
  local failures=0 now_iso probe_out lcts_now
  now_iso=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  echo "=== FFLOW-FRESH SELF-TEST (now=$now_iso UTC) ==="

  echo "--- resolving baseline LCTS via the real calendar module ---"
  probe_out=$(FFLOW_FRESH_SELF_TEST=1 FFLOW_FRESH_OVERRIDE_LATEST_DATE="1970-01-01" \
              FFLOW_FRESH_OVERRIDE_NOW="$now_iso" "$SELF" 2>/dev/null)
  lcts_now=$(printf '%s' "$probe_out" | grep -o 'lcts=[0-9-]*' | cut -d= -f2)
  if [ -z "$lcts_now" ]; then
    echo "SELF_TEST FAIL: could not resolve a baseline LCTS via the calendar module"
    return 1
  fi
  echo "baseline LCTS = $lcts_now"

  echo "--- branch 1/3: STALE fixture (latest_date=2026-07-21, the historical stuck value) ---"
  FFLOW_FRESH_SELF_TEST=1 FFLOW_FRESH_OVERRIDE_LATEST_DATE="2026-07-21" \
    FFLOW_FRESH_OVERRIDE_NOW="$now_iso" "$SELF"
  local rc1=$?
  if [ "$rc1" -eq "$EXIT_STALE" ]; then
    echo "SELF_TEST PASS: stale fixture -> exit $EXIT_STALE (STALE) as expected"
  else
    echo "SELF_TEST FAIL: stale fixture -> exit $rc1, expected $EXIT_STALE"
    failures=$((failures + 1))
  fi

  echo "--- branch 2/3: FRESH fixture (latest_date=current LCTS=$lcts_now) ---"
  FFLOW_FRESH_SELF_TEST=1 FFLOW_FRESH_OVERRIDE_LATEST_DATE="$lcts_now" \
    FFLOW_FRESH_OVERRIDE_NOW="$now_iso" "$SELF"
  local rc2=$?
  if [ "$rc2" -eq "$EXIT_PASS" ]; then
    echo "SELF_TEST PASS: fresh fixture -> exit $EXIT_PASS (PASS) as expected"
  else
    echo "SELF_TEST FAIL: fresh fixture -> exit $rc2, expected $EXIT_PASS"
    failures=$((failures + 1))
  fi

  echo "--- branch 3/3: weekend nuance (AC-B3) — now=Sat 2026-07-25 12:00 ICT ---"
  local sat_now="2026-07-25T05:00:00Z" sat_out sat_lcts
  sat_out=$(FFLOW_FRESH_SELF_TEST=1 FFLOW_FRESH_OVERRIDE_LATEST_DATE="1970-01-01" \
            FFLOW_FRESH_OVERRIDE_NOW="$sat_now" "$SELF" 2>/dev/null)
  sat_lcts=$(printf '%s' "$sat_out" | grep -o 'lcts=[0-9-]*' | cut -d= -f2)
  FFLOW_FRESH_SELF_TEST=1 FFLOW_FRESH_OVERRIDE_LATEST_DATE="$sat_lcts" \
    FFLOW_FRESH_OVERRIDE_NOW="$sat_now" "$SELF"
  local rc3=$?
  if [ "$rc3" -eq "$EXIT_PASS" ] && [ "$sat_lcts" = "2026-07-24" ]; then
    echo "SELF_TEST PASS: Saturday now resolves LCTS to preceding Friday 2026-07-24; latest==LCTS -> PASS (not flagged stale)"
  else
    echo "SELF_TEST FAIL: weekend nuance broke — lcts=$sat_lcts rc=$rc3 (expected lcts=2026-07-24 rc=$EXIT_PASS)"
    failures=$((failures + 1))
  fi

  echo "=== SELF-TEST SUMMARY: $((3 - failures))/3 branches OK ==="
  [ "$failures" -eq 0 ]
}

main() {
  local mode="${1:-}"
  case "$mode" in
    --self-test|self-test)
      _self_test
      exit $?
      ;;
    ""|--run|run)
      run_check
      exit $?
      ;;
    --help|-h)
      grep '^#' "${BASH_SOURCE[0]}" | sed 's/^#$//; s/^# //'
      exit 0
      ;;
    *)
      echo "usage: $(basename "${BASH_SOURCE[0]}") [--self-test|--help]" >&2
      exit "$EXIT_ERROR"
      ;;
  esac
}

main "$@"
