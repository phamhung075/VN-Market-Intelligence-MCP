#!/usr/bin/env bash
# fb-data-integrity-gate.sh — numeric plausibility gate for fb-market-poster
#
# Usage:
#   bash scripts/fb-data-integrity-gate.sh [--frame=daily|weekly|monthly] \
#     <post-body-file> [YYYY-MM-DD] [snapshot-json-file] [macro-provenance-file]
#
# Args:
#   --frame=X                  OPTIONAL, may appear anywhere in argv. One of
#                              daily (DEFAULT — current/original behavior, unchanged) |
#                              weekly | monthly. GENERIC MANDATE: the period is an
#                              EXPLICIT input, never inferred from today's date alone —
#                              see "FRAME MODES" below.
#   $1  post-body-file         path to the post text (required)
#   $2  YYYY-MM-DD             post date (optional — used for context only)
#   $3  snapshot-json-file     pre-fetched live snapshot JSON (optional; if absent the gate
#                              fetches live — see "FRAME MODES" below for the per-frame
#                              source). Same `{"quotes": {TICKER: {close, changePct}}}` shape
#                              regardless of frame — in weekly/monthly mode the caller may
#                              supply a pre-computed PERIOD-close quotes JSON through this
#                              SAME arg (e.g. for deterministic/historical replay testing).
#   $4  macro-provenance-file  per-figure "fetched-this-cycle" provenance JSON for Check-I
#                              (optional; absent = graceful skip, see Check-I below). Written
#                              by docs/agents/fb-market-poster/flow/main.md STEP 1b — see that
#                              file for the marker contract.
#
# Exit codes:
#   0  = PASS — all checks clean
#   1  = BLOCK — one or more violations; [BLOCK] lines printed to stdout
#   2  = usage/file error
#
# FRAME MODES (FIX-FB-GATE-WEEKLY-FRAME-MODE, 2026-07-25):
#   Lesson L5 (2026-06-21): a WEEKLY post stating "+1,84% w/w" was FALSE-BLOCKED
#   because the gate compared it against the latest DAILY snapshot (−0,32% that
#   session) — a daily-vs-weekly frame mismatch, not a real fabrication. Before
#   this fix shipped, weekly posts required a MANUAL router override (see the
#   now-removed "WEEKLY MODE OVERRIDE" steps this superseded in
#   docs/agents/fb-market-poster/flow/weekly-recap.md and weekly-prediction.md).
#   --frame=daily   (DEFAULT) — unchanged: compares the post's index moves
#                    against the LATEST DAILY snapshot (see LIVE DATA SOURCE below).
#   --frame=weekly / --frame=monthly — compares the post's index moves against a
#                    PERIOD-CLOSE series (this week/month's close vs the prior
#                    period's close), NOT the latest daily snapshot. The period
#                    close series is derived from the SAME REST surface the daily
#                    path already uses (GET ${MCP_BASE}/mcp/api/prices/history —
#                    the REST mirror of the get_price_history MCP tool; see
#                    build_period_snapshot() below), grouping the returned daily
#                    OHLCV rows by ISO week / calendar month — there is no
#                    separate "weekly" table server-side, so deriving it from the
#                    daily series is the correct, non-fabricated mechanism (no new
#                    fetch path invented). If $3 is supplied, it is used AS-IS
#                    (same shape) instead of the live derivation — same posture as
#                    daily mode's snapshot-file override.
#                    Check-A (daily ±7% price-limit) is SKIPPED outside --frame=daily
#                    — the exchange price limit is a per-SESSION rule; a week's
#                    cumulative move legitimately exceeds it.
#                    Check-C (selloff language) is period-scoped regardless of
#                    frame — see Check-C below.
#
# LIVE DATA SOURCE (for router / poster callers):
#   --frame=daily (default): GET http://localhost:3000/mcp/api/prices/batch?tickers=VNINDEX,VIC,VHM,...
#     Response: { "quotes": { "VIC": { "ticker":"VIC", "close":..., "changePct":..., ... }, ... } }
#   --frame=weekly|monthly: GET http://localhost:3000/mcp/api/prices/history?code=<TICKER>&days=<N>
#     per index ticker (VNINDEX/VN30/HNXINDEX/UPCOMINDEX) — see FRAME MODES above.
#   If the API is unavailable (timeout) AND no snapshot-json-file was supplied, the gate
#   logs a warning and exits 0 (skip-on-unavailable, not block-on-unavailable).
#   The poster may supply a pre-fetched snapshot as $3 to eliminate the network dependency.
#
# CHECKS PERFORMED:
#   A  per-ticker HOSE move > ±7%  (daily price limit violation = fabrication signal).
#      FRAME-GATED (FIX-FB-GATE-WEEKLY-FRAME-MODE): only runs when --frame=daily
#      (the default) — a per-session exchange price limit does not apply to a
#      week's/month's cumulative move.
#   B  per-ticker % in post vs live snapshot beyond 1.0 pp absolute delta
#   C  "bán tháo"/"giảm sàn"/selloff narrative while live breadth = 0 floor + net-positive.
#      PERIOD-SCOPED (FIX-FB-GATE-WEEKLY-FRAME-MODE, lesson L5): only cross-checks
#      selloff language found in the post's CURRENT-period recap section (before
#      the mandated "Phân tích" section label — docs/agents/fb-market-poster/flow/
#      main.md STEP 5 section order) against live breadth. A correct sentence
#      describing a PRIOR period's real crash, or a conditional/forward scenario,
#      lives in Phân tích/Dự đoán/Kịch bản — never asserted as THIS period's live
#      state — so it is out of Check-C's cross-check scope. No "Phân tích" label
#      found → falls back to scanning the whole post (never MORE restrictive than
#      before this fix). Also strips lines carrying an explicit relative
#      past-period marker ("tuần trước", "tháng trước", "kỳ trước", "phiên trước",
#      "trước đó", "trước sốc") from the affirmative match set — belt-and-suspenders,
#      generic phrasing only, no hardcoded dates.
#   D  VN-Index level or % in post vs live snapshot beyond tolerance
#   E  sector/company-name validator — SSOT-driven (docs/data/system-map.json watchlist)
#      Blocks when a watchlist ticker is labelled with a contradicting sector keyword,
#      or when a known company-name alias mismatch is detected (e.g. VNM→"Nestlé").
#   F  VN-ticker price in USD — blocks "$NNN" or "USD NNN" adjacent to a VN equity ticker
#      (VN stocks trade in VND/nghìn đồng; USD next to ticker price = unit error / fabrication).
#      False-positive guard: does NOT fire on commodity $/oz $/thùng, FX USD/VND, macro tỷ USD.
#   G  Structural template validator (FIX-FB-GATE-TEMPLATE-STRUCTURE-VALIDATOR):
#      G1 canonical header line 1 present
#      G2 verbatim disclaimer text present and enclosed in --- fences
#      G3 valid hashtag block as last element (mandatory 5 tags, no diacritics)
#      G4 no raw markdown in post body (**bold**, ##headers, | table |)
#      G5 word ceiling ≤ 1300 words (flow cap; trim Tóm tắt nhanh first if over)
#   H  Index point-change vs percent math consistency (FIX-FB-GATE-POINT-PCT-MATH):
#      For any VN market index the post states with BOTH a point delta ("giảm/tăng
#      X điểm") AND a % delta ("(±Y%)") for the same mention — VN-Index, VN30,
#      HNX-Index, UPCOM — asserts |stated_point_change − pct × prev_close| is within
#      POINT_PCT_MATH_TOLERANCE. prev_close is derived from the live snapshot
#      (close / (1 + changePct/100)) — never hardcoded. BLOCKs when the point delta
#      and the % delta are internally inconsistent (unit-confusion / fabrication
#      signal — e.g. lesson L2 06-19: post said "giảm 0,32 điểm (−0,32%)" when
#      −0,32% at that day's level is actually ≈ −5,9 điểm, not −0,32 điểm).
#      NOTE: minted as "Check-F" (2026-06-20, before the currency-unit guard and
#      structural validator above claimed letters F and G) — implemented as
#      Check-H, the next unclaimed letter in the A..G sequence.
#   I  Macro/FX stale-as-current + unverified comparison-level guard
#      (FIX-FB-GATE-STALE-MACRO-GUARD, 2026-07-25):
#      I1 stale-as-current    — a macro/FX figure (USD/VND, gold, Brent, Fed rate,
#                                bond yield — generic, any macro/FX class) appears
#                                in the post with NO live-fetch provenance this cycle.
#      I2 unverified-comparison — a figure is present but does not match this
#                                cycle's live-fetched value (e.g. "vẫn ở mức X",
#                                "từ mức Y", "vượt ngưỡng Z" prior/reference-level
#                                phrasing) — asserting a prior level with no verification.
#      Provenance source: $4 macro-provenance-file, written by
#      docs/agents/fb-market-poster/flow/main.md STEP 1b (per-figure
#      fetched_this_cycle marker). Absent file = graceful skip (same posture as
#      Check-B/D when live data is unavailable) — NOT a block.
#      NOTE: ticket named this "Check-G" but A-H were already claimed by execution
#      time (see Check-H note above) — implemented as Check-I, the next
#      unclaimed letter in the A..H sequence.
#   J  Breadth %-vs-cited-counts internal consistency guard
#      (FIX-FB-GATE-BREADTH-PCT-INTERNAL, 2026-07-25):
#      Any stated advancer/decliner breadth % must match the counts cited
#      elsewhere in the SAME post within BREADTH_PCT_TOLERANCE — lesson L4:
#      2026-06-19 post said "độ rộng khoảng 40%" while citing counts that
#      work out to ~25% (81 of ~350) — unit/arithmetic confusion signal.
#      GENERIC: parses (1) a headline "độ rộng ~Y%"/"breadth Y%" claim near
#      the keyword, (2) a direct "%...mã tăng/giảm" labelled claim, against
#      (a) an explicit "N (mã tăng/giảm/trần/sàn) của/trên/trong (tổng)
#      ~M" fraction citation — label-agnostic, covers advancer/decliner/
#      floor/ceiling counts generically — and (b) "N mã tăng ... M mã giảm
#      [... K mã đứng giá]" co-occurring counts (implied_pct = part/total).
#      BLOCKs when |stated_pct − implied_pct| > BREADTH_PCT_TOLERANCE.
#      Graceful skip (no block) when the post cites no breadth % claim, or
#      cites a % with no counts to cross-check against — same skip-on-
#      absent posture as Check-B/D/H/I.
#      NOTE: ticket named this "Check-H" but A-I were already claimed by
#      execution time (see Check-H/Check-I notes above) — implemented as
#      Check-J, the next unclaimed letter in the A..I sequence (verified via
#      `grep -oE 'Check-[A-Z]' scripts/fb-data-integrity-gate.sh | sort -u`
#      before minting).
#
# SSOT for all check thresholds lives exclusively here.
# SSOT for ticker→sector/company mapping: docs/data/system-map.json .project.watchlist
# Memory refs: feedback_fb_poster_fabricates_when_data_thin, feedback_fb_poster_gate_false_green,
#              feedback_no_hardcode_stats
#
# Pointer: referenced by docs/agents/fb-market-poster/flow/main.md STEP 4b
#          and docs/policies/dev-standards.md § Script Persistence

set -euo pipefail

# ── Frame flag (FIX-FB-GATE-WEEKLY-FRAME-MODE) ─────────────────────────────────
# --frame=daily|weekly|monthly may appear anywhere in argv; stripped out before
# positional-arg parsing so $1..$4 below keep their original meaning regardless
# of where the flag was passed. Default = daily = current/original behavior,
# unchanged (GENERIC MANDATE: period is an explicit input, never inferred from
# today's date alone). See "FRAME MODES" in the header comment above.
FRAME="daily"
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --frame=*)
      FRAME="${arg#--frame=}"
      ;;
    *)
      ARGS+=("$arg")
      ;;
  esac
done
if [[ ${#ARGS[@]} -gt 0 ]]; then
  set -- "${ARGS[@]}"
else
  set --
fi

case "$FRAME" in
  daily|weekly|monthly) ;;
  *)
    echo "ERROR: --frame must be one of daily|weekly|monthly (got: $FRAME)" >&2
    exit 2
    ;;
esac

# ── Args ──────────────────────────────────────────────────────────────────────
FILE="${1:-}"
POST_DATE="${2:-}"
SNAPSHOT_FILE="${3:-}"
MACRO_PROVENANCE_FILE="${4:-}"

if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "ERROR: post-body-file argument required and must exist" >&2
  exit 2
fi

# ── Config ────────────────────────────────────────────────────────────────────
MCP_BASE="${MCP_BASE:-http://localhost:3000}"
PRICE_BATCH_URL="${MCP_BASE}/mcp/api/prices/batch"
HOSE_LIMIT=7.0           # daily price limit %; Block if |pct| > this
LIVE_DELTA_LIMIT=1.0     # max acceptable |post_pct - live_pct| in pp
VNINDEX_LEVEL_LIMIT=5.0  # max acceptable |post_level - live_level| in points
VNINDEX_PCT_LIMIT=0.5    # max acceptable |post_pct - live_pct| for VN-Index in pp
POINT_PCT_MATH_TOLERANCE=1.0  # Check-H: max |stated_point_change - implied_point_change| in index points
BREADTH_PCT_TOLERANCE=6.0     # Check-J: max |stated_breadth_pct - implied_pct_from_cited_counts| in pp
CURL_TIMEOUT=8           # seconds
PRICE_HISTORY_URL="${MCP_BASE}/mcp/api/prices/history"  # FIX-FB-GATE-WEEKLY-FRAME-MODE
FRAME_HISTORY_DAYS_WEEKLY="${FRAME_HISTORY_DAYS_WEEKLY:-21}"    # >= 2 ISO weeks of lookback
FRAME_HISTORY_DAYS_MONTHLY="${FRAME_HISTORY_DAYS_MONTHLY:-70}"  # >= 2 calendar months of lookback

VIOLATIONS=0

# ── Helpers ───────────────────────────────────────────────────────────────────
log_block() {
  echo "[BLOCK] $*"
  VIOLATIONS=$((VIOLATIONS + 1))
}

abs_val() {
  # abs_val <number>  —  always positive, handles negatives
  python3 -c "print(abs($1))"
}

python_gt() {
  # python_gt <a> <b>  — returns 0 (true) if a > b, 1 (false)
  python3 -c "import sys; sys.exit(0 if float('$1') > float('$2') else 1)"
}

# ── Step 1: Extract tickers mentioned in the post ────────────────────────────
# Matches patterns like (VIC), (VHM), (VRE), (HPG), (FPT) etc.
# Also handles bare ticker codes preceded or followed by %)
# grep -vE exits 1 when 0 lines pass the filter (all tickers are in the exclusion list).
# Under set -o pipefail, this aborts the script silently. Use (set +o pipefail; ...) guard.
POST_TICKERS=$(set +o pipefail; grep -oE '\b([A-Z]{2,4})\b' "$FILE" 2>/dev/null \
  | grep -vE '^(VN|MCP|AI|BOT|UTC|USD|VND|DXY|IV|EY|RSI|MACD|BB|TA|SSI|CK|EOD|OK|NA|GDP|CPI|IIP|NP|ROE|ROA|EPS|Q1|Q2|Q3|Q4|FY|YTD|HOSE|HNX|UPCOM|ETF|IPO|PE|PB|OI|SL|TP|EV|EBITDA|FCF|DCF|IRR|NPV|NAV|ESG|CSR|AGM|EGM|SGD|EUR|JPY|CNY|GBP|CAD|AUD|NZD|CHF|HKD|TWD|KRW|THB|PHP|INR|MYR|IDR)$' \
  | sort -u \
  | tr '\n' ',' | sed 's/,$//')

# Always include the standard VN market index tickers — Check-D (VN-Index) and
# Check-H (point-vs-pct math, any index) both need live close/changePct for these.
INDEX_TICKERS="VNINDEX,VN30,HNXINDEX,UPCOMINDEX"
if [[ -n "$POST_TICKERS" ]]; then
  FETCH_TICKERS="${INDEX_TICKERS},$POST_TICKERS"
else
  FETCH_TICKERS="$INDEX_TICKERS"
fi

# ── build_period_snapshot: weekly/monthly period-close derivation ─────────────
# (FIX-FB-GATE-WEEKLY-FRAME-MODE) Mirrors the EXACT data-access idiom already
# used for the daily snapshot above (curl against the mcp-server REST API —
# never a different fetch path): GET ${PRICE_HISTORY_URL}?code=<TICKER>&days=<N>
# is the REST mirror of the get_price_history MCP tool
# (apps/mcp-server/src/interface/mcp/routes/priceHistoryHandler.ts). There is no
# separate "weekly" table server-side, so the period close/%-change is derived
# HERE from the returned daily OHLCV rows (grouped by ISO week or calendar
# month) — this is the correct, non-fabricated way to get a period-close series
# without inventing a new fetch path. Per-ticker fetch/parse failure is a
# graceful per-ticker skip (same posture as a missing ticker in the daily quotes
# JSON — downstream Check-A/B/D/H already no-op on a "null" quote).
build_period_snapshot() {
  local days="$1"
  local group_mode="$2"   # "week" or "month"
  local combined="{}"
  local tk hist frag
  local tickers
  IFS=',' read -ra tickers <<< "$INDEX_TICKERS"
  for tk in "${tickers[@]}"; do
    hist=$(curl -sf --max-time "$CURL_TIMEOUT" "${PRICE_HISTORY_URL}?code=${tk}&days=${days}" 2>/dev/null || true)
    [[ -z "$hist" ]] && continue
    frag=$(python3 - "$tk" "$group_mode" "$hist" <<'PYEOF'
import sys, json
from datetime import date as _date

ticker, mode, hist_json = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    data = json.loads(hist_json)
except Exception:
    print("{}"); sys.exit(0)
rows = data.get("history", [])
if not rows:
    print("{}"); sys.exit(0)

def period_key(date_str):
    y, m, d = (int(x) for x in date_str.split("-"))
    dt = _date(y, m, d)
    if mode == "week":
        iso = dt.isocalendar()
        return (iso[0], iso[1])
    return (y, m)

groups = {}
for r in rows:
    groups.setdefault(period_key(r["date"]), []).append(r)

ordered_keys = sorted(groups.keys())
if len(ordered_keys) < 2:
    print("{}"); sys.exit(0)  # not enough distinct periods to derive a %-change

# Latest DISTINCT period present = the "current" period being reported;
# the one immediately before it = the comparison base. Each period's close =
# the close of its LAST (latest-dated) row — mirrors how the daily-quotes
# endpoint's "close" is always the latest available session close.
prev_close = sorted(groups[ordered_keys[-2]], key=lambda r: r["date"])[-1]["close"]
curr_close = sorted(groups[ordered_keys[-1]], key=lambda r: r["date"])[-1]["close"]
if not prev_close:
    print("{}"); sys.exit(0)

pct = (curr_close - prev_close) / prev_close * 100.0
print(json.dumps({ticker: {"ticker": ticker, "close": curr_close, "changePct": pct}}))
PYEOF
)
    [[ -z "$frag" ]] && frag="{}"
    combined=$(python3 -c '
import json, sys
a = json.loads(sys.argv[1])
b = json.loads(sys.argv[2])
a.update(b)
print(json.dumps(a))
' "$combined" "$frag")
  done
  echo "{\"quotes\": ${combined}}"
}

# ── Step 2: Fetch live snapshot (frame-aware) ─────────────────────────────────
SNAPSHOT_JSON=""

if [[ -n "$SNAPSHOT_FILE" && -f "$SNAPSHOT_FILE" && -s "$SNAPSHOT_FILE" ]]; then
  SNAPSHOT_JSON=$(cat "$SNAPSHOT_FILE")
  echo "[INFO] fb-data-integrity-gate: using pre-fetched snapshot from $SNAPSHOT_FILE (frame=${FRAME})"
elif [[ "$FRAME" == "daily" ]]; then
  SNAPSHOT_JSON=$(curl -sf --max-time "$CURL_TIMEOUT" \
    "${PRICE_BATCH_URL}?tickers=${FETCH_TICKERS}" 2>/dev/null || true)
  if [[ -z "$SNAPSHOT_JSON" ]]; then
    echo "[WARN] fb-data-integrity-gate: live API unavailable (${PRICE_BATCH_URL}) — skipping live checks (A+B+D); only static checks (C) apply"
    SNAPSHOT_JSON=""
  else
    echo "[INFO] fb-data-integrity-gate: live snapshot fetched from ${PRICE_BATCH_URL} (frame=daily)"
  fi
else
  # weekly/monthly — derive a period-close series from daily OHLCV instead of
  # the latest daily snapshot (see build_period_snapshot / FRAME MODES above).
  if [[ "$FRAME" == "weekly" ]]; then
    FRAME_DAYS="$FRAME_HISTORY_DAYS_WEEKLY"
    FRAME_GROUP="week"
  else
    FRAME_DAYS="$FRAME_HISTORY_DAYS_MONTHLY"
    FRAME_GROUP="month"
  fi
  SNAPSHOT_JSON=$(build_period_snapshot "$FRAME_DAYS" "$FRAME_GROUP")
  HAS_QUOTES=$(python3 -c "
import json, sys
try:
    d = json.loads(sys.argv[1])
    print('1' if d.get('quotes') else '0')
except Exception:
    print('0')
" "$SNAPSHOT_JSON")
  if [[ "$HAS_QUOTES" != "1" ]]; then
    echo "[WARN] fb-data-integrity-gate: no ${FRAME} period data derivable from ${PRICE_HISTORY_URL} — skipping live checks (B+D+H); only static checks (C) apply"
    SNAPSHOT_JSON=""
  else
    echo "[INFO] fb-data-integrity-gate: ${FRAME} period-close snapshot derived from ${PRICE_HISTORY_URL} (period-close series, not the latest daily snapshot)"
  fi
fi

# Helper: get changePct for a ticker from snapshot JSON
get_live_pct() {
  local ticker="$1"
  if [[ -z "$SNAPSHOT_JSON" ]]; then echo "null"; return; fi
  python3 - "$ticker" "$SNAPSHOT_JSON" <<'PYEOF'
import sys, json
ticker = sys.argv[1]
try:
    data = json.loads(sys.argv[2])
    quotes = data.get("quotes", {})
    q = quotes.get(ticker)
    if q is None:
        print("null")
    else:
        print(q.get("changePct", "null"))
except Exception:
    print("null")
PYEOF
}

# Helper: get close price for a ticker from snapshot JSON
get_live_close() {
  local ticker="$1"
  if [[ -z "$SNAPSHOT_JSON" ]]; then echo "null"; return; fi
  python3 - "$ticker" "$SNAPSHOT_JSON" <<'PYEOF'
import sys, json
ticker = sys.argv[1]
try:
    data = json.loads(sys.argv[2])
    quotes = data.get("quotes", {})
    q = quotes.get(ticker)
    if q is None:
        print("null")
    else:
        print(q.get("close", "null"))
except Exception:
    print("null")
PYEOF
}

# ── Step 3: Parse post for per-ticker moves ───────────────────────────────────
# Extract patterns like:
#   VIC) giảm 1,03%  →  VIC -1.03
#   VHM) tăng 2,5%   →  VHM +2.5
#   (VRE) −9,4%      →  VRE -9.4
#   VRE giảm 9,4%    →  VRE -9.4
# Normalise VN decimal comma to dot; strip non-numeric noise

parse_ticker_pcts() {
  python3 - "$FILE" <<'PYEOF'
import re, sys

text = open(sys.argv[1], encoding="utf-8").read()
results = []  # (ticker, pct_float)

# Pattern A: (TICKER) direction N,NN%  or TICKER direction N,NN%
#   direction words: giảm → negative, tăng → positive
pattern_dir = re.compile(
    r'\(([A-Z]{2,5})\)\s*(?:[^\n]{0,60}?)'   # (TICKER) ... optional context
    r'(tăng|giảm|tăng mạnh|giảm mạnh|điều chỉnh)\s+'
    r'(\d{1,3}(?:[,\.]\d{1,2})?)\s*%',
    re.UNICODE
)
for m in pattern_dir.finditer(text):
    ticker = m.group(1)
    direction = m.group(2)
    raw_pct = m.group(3).replace(",", ".")
    try:
        pct = float(raw_pct)
        if "giảm" in direction:
            pct = -pct
        results.append((ticker, pct))
    except ValueError:
        pass

# Pattern B: TICKER (no parens) direction N,NN%  — e.g. "VIC giảm 1,03%"
pattern_bare = re.compile(
    r'(?<!\()\b([A-Z]{2,5})\b\s*(?:[^\n]{0,40}?)'
    r'(tăng|giảm|tăng mạnh|giảm mạnh|điều chỉnh)\s+'
    r'(\d{1,3}(?:[,\.]\d{1,2})?)\s*%',
    re.UNICODE
)
for m in pattern_bare.finditer(text):
    ticker = m.group(1)
    direction = m.group(2)
    raw_pct = m.group(3).replace(",", ".")
    try:
        pct = float(raw_pct)
        if "giảm" in direction:
            pct = -pct
        results.append((ticker, pct))
    except ValueError:
        pass

# Pattern C: unicode minus/minus sign before number: "−9,4%" near ticker
pattern_minus = re.compile(
    r'\(([A-Z]{2,5})\)\s*[^%\n]{0,60}?[−\-](\d{1,3}(?:[,\.]\d{1,2})?)\s*%',
    re.UNICODE
)
for m in pattern_minus.finditer(text):
    ticker = m.group(1)
    raw_pct = m.group(2).replace(",", ".")
    try:
        pct = -float(raw_pct)
        results.append((ticker, pct))
    except ValueError:
        pass

# Deduplicate: keep first occurrence per ticker
seen = {}
for ticker, pct in results:
    if ticker not in seen:
        seen[ticker] = pct

# Filter out obvious non-tickers
skip = {"VN","MCP","AI","BOT","UTC","USD","VND","DXY","IV","EY","RSI","MACD",
        "BB","TA","SSI","CK","EOD","OK","NA","GDP","CPI","IIP","NP","ROE","ROA",
        "EPS","Q1","Q2","Q3","Q4","FY","YTD","HOSE","HNX","UPCOM","ETF","IPO",
        "PE","PB","OI","SL","TP","EV","VNG","THU","HAI","MOT","HAY","CAO","DE",
        "DA","LAI","LOAN","VNDB","CHEF"}

for ticker, pct in seen.items():
    if ticker not in skip:
        print(f"{ticker}\t{pct}")
PYEOF
}

# ── Step 4: Parse VN-Index from post ─────────────────────────────────────────
parse_vnindex_from_post() {
  python3 - "$FILE" <<'PYEOF'
import re, sys

text = open(sys.argv[1], encoding="utf-8").read()

# Pattern: VN-Index đóng cửa ở 1.806,20 điểm ... (−0,10%)
# Or: VN-Index ... 1806.20 ... −0,10%

level = None
pct = None

# Match level: digits with period-as-thousands-sep and comma-as-decimal
level_pat = re.compile(
    r'VN[- ]?Index\b[^\n]{0,80}?(\d{1,4}[.,]\d{2,3}(?:[.,]\d{2})?)\s*điểm',
    re.UNICODE | re.IGNORECASE
)
m = level_pat.search(text)
if m:
    raw = m.group(1).replace(".", "").replace(",", ".")
    try:
        level = float(raw)
    except ValueError:
        pass

# Match pct: ±x,xx% or −x,xx%
pct_pat = re.compile(
    r'VN[- ]?Index\b[^\n]{0,200}?([+\-−±])\s*(\d{1,2}(?:[,.]\d{1,2})?)\s*%',
    re.UNICODE | re.IGNORECASE
)
m2 = pct_pat.search(text)
if m2:
    sign = -1 if m2.group(1) in ('-', '−') else 1
    raw = m2.group(2).replace(",", ".")
    try:
        pct = sign * float(raw)
    except ValueError:
        pass

# Also try parenthesised pct: (−0,10%)
paren_pct_pat = re.compile(
    r'\(([+\-−±])\s*(\d{1,2}(?:[,.]\d{1,2})?)\s*%\)',
    re.UNICODE
)
if pct is None:
    m3 = paren_pct_pat.search(text)
    if m3:
        sign = -1 if m3.group(1) in ('-', '−') else 1
        raw = m3.group(2).replace(",", ".")
        try:
            pct = sign * float(raw)
        except ValueError:
            pass

print(f"{level if level is not None else 'null'}\t{pct if pct is not None else 'null'}")
PYEOF
}

# ── Check A+B: per-ticker moves ───────────────────────────────────────────────
TICKER_PCTS=$(parse_ticker_pcts)

while IFS=$'\t' read -r ticker post_pct; do
  [[ -z "$ticker" ]] && continue

  # ── Check A: HOSE daily price limit ─────────────────────────────────────
  # FRAME-GATED (FIX-FB-GATE-WEEKLY-FRAME-MODE): only meaningful for --frame=daily
  # (the default) — a per-session exchange price limit does not apply to a
  # week's/month's cumulative move.
  if [[ "$FRAME" == "daily" ]]; then
    abs_pct=$(abs_val "$post_pct")
    if python_gt "$abs_pct" "$HOSE_LIMIT" 2>/dev/null; then
      log_block "Check-A HOSE-price-limit: $ticker post=$post_pct% exceeds ±${HOSE_LIMIT}% daily limit — FABRICATION SIGNAL"
    fi
  fi

  # ── Check B: live snapshot delta ─────────────────────────────────────────
  if [[ -n "$SNAPSHOT_JSON" ]]; then
    live_pct=$(get_live_pct "$ticker")
    if [[ "$live_pct" != "null" && -n "$live_pct" ]]; then
      delta=$(python3 -c "print(abs(float('$post_pct') - float('$live_pct')))")
      if python_gt "$delta" "$LIVE_DELTA_LIMIT" 2>/dev/null; then
        log_block "Check-B live-delta: $ticker post=${post_pct}% live=${live_pct}% delta=${delta}pp > ${LIVE_DELTA_LIMIT}pp tolerance"
      fi
    fi
  fi
done <<< "$TICKER_PCTS"

# ── Check C: selloff narrative vs live breadth ────────────────────────────────
# Look for AFFIRMATIVE selloff claims in post.
# Must NOT fire on negations: "không phải bán tháo", "không phải sell-off",
# "không có mã giảm sàn", "không bán tháo", "chưa hoảng loạn", "chưa phải bán tháo".
# Strategy: count lines with selloff language, then subtract negation lines.
#
# PERIOD-SCOPING (FIX-FB-GATE-WEEKLY-FRAME-MODE, lesson L5): the live cross-check
# below asserts the CURRENT reporting period's breadth — it must only consider
# selloff language that is actually ABOUT that period. The mandated post template
# order (docs/agents/fb-market-poster/flow/main.md STEP 5: Tóm tắt nhanh →
# Phân tích → Dự đoán/Tổng kết) puts CURRENT-period factual recap in "Tóm tắt
# nhanh" — everything at/after the "Phân tích" section label is analysis,
# history, or forward-looking scenario, never an assertion about THIS period's
# live state (e.g. lesson L5: "Tuần 8–12/6 ... bán tháo mạnh" correctly describes
# a PRIOR week's real crash, appearing in Phân tích). No "Phân tích" label found
# (older/malformed posts) → falls back to the whole file, never MORE restrictive
# than pre-fix behavior.
PHAN_TICH_LINE=$(grep -n '^Phân tích:\?[[:space:]]*$' "$FILE" 2>/dev/null | head -1 | cut -d: -f1 || true)
if [[ -n "$PHAN_TICH_LINE" && "$PHAN_TICH_LINE" -gt 1 ]]; then
  RECAP_SCOPE_TEXT=$(head -n $((PHAN_TICH_LINE - 1)) "$FILE")
else
  RECAP_SCOPE_TEXT=$(cat "$FILE")
fi

SELLOFF_LINES=$(grep -iE 'bán tháo|sell.?off|hoảng loạn|tháo chạy' <<< "$RECAP_SCOPE_TEXT" 2>/dev/null || true)
# Remove negation lines (không phải bán tháo / không phải / chứ không phải / mà không)
# and lines carrying an explicit RELATIVE past-period marker — generic phrasing,
# no hardcoded dates, defense-in-depth alongside the section-scope above (covers
# a past-period reference that happens to still land inside Tóm tắt nhanh).
# FIX-FB-GATE-CHECKC-NEGATION-LEXICON (2026-07-25, lesson L4): "chưa" (not yet / not)
# was ABSENT from this set — an explicitly-negated panic statement ("lực bán chưa
# hoảng loạn", "chưa phải bán tháo") survived the strip and was miscounted
# AFFIRMATIVE, false-blocking a correct orderly-pullback post twice on 2026-06-25.
# `chưa( phải| từng)?` is a GENERIC alternation (matches bare "chưa" and the common
# "chưa phải"/"chưa từng" variants alike) — not a one-off literal for the two
# observed phrases. Does NOT touch the separate Check-I honest-gap "chưa"-matching
# block (~line 1428) — that is a different, correct check.
SELLOFF_AFFIRM_LINES=$(echo "$SELLOFF_LINES" | grep -vE 'không phải|không có|không bán|chứ không|mà không|chưa( phải| từng)?|tuần trước|tháng trước|kỳ trước|phiên trước|trước đó|trước sốc' 2>/dev/null || true)
SELLOFF_LANG=$(echo "$SELLOFF_AFFIRM_LINES" | grep -c '.' 2>/dev/null || echo "0")
SELLOFF_LANG="${SELLOFF_LANG//[^0-9]/}"  # strip any whitespace/newlines
SELLOFF_LANG="${SELLOFF_LANG:-0}"

if [[ "$SELLOFF_LANG" -gt 0 && -n "$SNAPSHOT_JSON" ]]; then
  # Check live floor count (giảm sàn) and net breadth
  # The batch endpoint doesn't directly expose breadth, but we can check:
  # If VNINDEX changePct is mildly negative (> -2%) AND no floor stocks show in post tickers,
  # flag the contradiction.
  vnindex_live_pct=$(get_live_pct "VNINDEX")
  if [[ "$vnindex_live_pct" != "null" && -n "$vnindex_live_pct" ]]; then
    # VNINDEX mildly negative (> -2%) with selloff language is contradictory
    # A real selloff would push VN-Index < -2%
    vnindex_abs=$(abs_val "$vnindex_live_pct")
    if python_gt "2.0" "$vnindex_abs" 2>/dev/null; then
      # Check if post itself claims 0 floor stocks (evidence of contradiction within post)
      # NOTE: grep -c returns exit 1 when 0 lines match, so || echo "0" would fire and produce
      # "0\n0" (grep stdout "0" + echo "0"). Fix: capture via subshell that always exits 0.
      # FIX-FB-GATE-CHECKC-NEGATION-LEXICON (2026-07-25): `\d` is a real bash `grep -ciE`
      # here — on macOS BSD grep -E, `\d` is matched LITERALLY (never a digit class), so
      # `chỉ \d mã sàn` never fired. `[0-9]` is GNU/BSD-portable.
      floor_zero=$(grep -ciE '0 mã (giảm sàn|sàn)|không có mã (nào |giảm )?sàn|chỉ [0-9] mã sàn|sàn, (0|không)' <<< "$RECAP_SCOPE_TEXT" 2>/dev/null || true)
      floor_zero=$(echo "$floor_zero" | grep -m1 '^[0-9]' || echo "0")
      if [[ "$floor_zero" -gt 0 ]]; then
        log_block "Check-C breadth-contradiction: post contains selloff/bán-tháo language but claims 0 floor stocks AND live VN-Index=${vnindex_live_pct}% (mild). Contradiction."
      else
        # Post doesn't explicitly say 0 floor, but VN-Index mild + selloff language is suspicious
        log_block "Check-C breadth-narrative: post uses selloff/bán-tháo language but live VN-Index=${vnindex_live_pct}% (< ±2%). Verify breadth data before publishing."
      fi
    fi
  else
    # No live data available — check for internal post contradiction only
    # Same grep -c / || echo "0" guard (see first floor_zero note above)
    floor_zero=$(grep -ciE '0 mã (giảm sàn|sàn)|không có mã (nào |giảm )?sàn|không có mã giảm sàn' <<< "$RECAP_SCOPE_TEXT" 2>/dev/null || true)
    floor_zero=$(echo "$floor_zero" | grep -m1 '^[0-9]' || echo "0")
    if [[ "$floor_zero" -gt 0 ]]; then
      log_block "Check-C breadth-contradiction: post contains selloff/bán-tháo language but also states 0 floor stocks. Internal contradiction."
    fi
  fi
fi

# ── Check D: VN-Index level and % ─────────────────────────────────────────────
VNINDEX_POST=$(parse_vnindex_from_post)
POST_VNI_LEVEL=$(echo "$VNINDEX_POST" | cut -f1)
POST_VNI_PCT=$(echo "$VNINDEX_POST" | cut -f2)

if [[ -n "$SNAPSHOT_JSON" ]]; then
  LIVE_VNI_PCT=$(get_live_pct "VNINDEX")
  LIVE_VNI_CLOSE=$(get_live_close "VNINDEX")

  # Check D1: VN-Index level
  if [[ "$POST_VNI_LEVEL" != "null" && "$LIVE_VNI_CLOSE" != "null" && -n "$LIVE_VNI_CLOSE" ]]; then
    level_delta=$(python3 -c "print(abs(float('$POST_VNI_LEVEL') - float('$LIVE_VNI_CLOSE')))")
    if python_gt "$level_delta" "$VNINDEX_LEVEL_LIMIT" 2>/dev/null; then
      log_block "Check-D1 VN-Index-level: post=${POST_VNI_LEVEL} live=${LIVE_VNI_CLOSE} delta=${level_delta}pts > ${VNINDEX_LEVEL_LIMIT}pts tolerance"
    fi
  fi

  # Check D2: VN-Index %
  if [[ "$POST_VNI_PCT" != "null" && "$LIVE_VNI_PCT" != "null" && -n "$LIVE_VNI_PCT" ]]; then
    pct_delta=$(python3 -c "print(abs(float('$POST_VNI_PCT') - float('$LIVE_VNI_PCT')))")
    if python_gt "$pct_delta" "$VNINDEX_PCT_LIMIT" 2>/dev/null; then
      log_block "Check-D2 VN-Index-pct: post=${POST_VNI_PCT}% live=${LIVE_VNI_PCT}% delta=${pct_delta}pp > ${VNINDEX_PCT_LIMIT}pp tolerance"
    fi
  fi
fi

# ── Check E: sector / company-name validator ──────────────────────────────────
# SSOT: docs/data/system-map.json .project.watchlist  — NEVER hardcode ticker→sector here.
# For every watchlist ticker mentioned in the post:
#   1. Look up its canonical sector and company name from system-map.json.
#   2. Check if any contradicting sector keyword appears adjacent to the ticker.
#   3. Check for known company-name alias mismatches (e.g. VNM→"Nestlé").
#
# Sector-keyword↔sector-family mapping is derived from the sector values themselves
# (parsed from system-map.json), not hardcoded.
#
# The script is run from the repo root; SSOT path is relative to that.

SYSTEM_MAP_PATH="${SYSTEM_MAP_PATH:-docs/data/system-map.json}"

check_e_violations=$(python3 - "$FILE" "$SYSTEM_MAP_PATH" <<'PYEOF'
import sys, json, re

post_file   = sys.argv[1]
smap_path   = sys.argv[2]

# ── Load SSOT ────────────────────────────────────────────────────────────────
try:
    with open(smap_path, encoding="utf-8") as f:
        smap = json.load(f)
except Exception as e:
    print(f"[WARN] Check-E: cannot read {smap_path}: {e}", flush=True)
    sys.exit(0)  # skip gracefully if SSOT unavailable

watchlist = smap.get("project", {}).get("watchlist", [])

# Build {ticker: {sector, company}} for active tickers only
ticker_info = {}
for entry in watchlist:
    if not entry.get("active", True):
        continue
    ticker = entry.get("ticker", "").upper().strip()
    sector = entry.get("sector", "").strip()
    company = entry.get("company", "").strip()
    if ticker and sector:
        ticker_info[ticker] = {"sector": sector, "company": company}

# ── Build sector-family→keyword sets from SSOT sector values ─────────────────
# Each sector string like "Real estate / Conglomerate" may contain multiple slash-delimited
# tokens. We also add curated Vietnamese sector keywords for each English token so the
# post (written in Vietnamese) can be checked.
#
# Approach: for every unique sector term, build a set of Vietnamese keywords that would
# CONTRADICT it if they appear next to a ticker that has a different family.
# We group sectors into canonical families and assign VN keywords to each family.
#
# Family assignment is regex-based (English labels from SSOT), so adding a new sector
# to system-map.json automatically participates — no hardcoded ticker→keyword mapping.

FAMILY_VI_KEYWORDS = {
    "banking":     ["ngân hàng", "bank", "nhtm", "tín dụng"],
    "steel":       ["thép", "gang thép", "sắt thép"],
    "tech":        ["công nghệ", "it", "phần mềm", "outsourcing", "gia công phần mềm"],
    "real_estate": ["bất động sản", "bds", "địa ốc"],
    "aviation":    ["hàng không", "aviation", "low-cost carrier"],
    "securities":  ["chứng khoán", "securities", "môi giới"],
    "oil_gas":     ["dầu khí", "xăng dầu", "lọc dầu", "refinery", "petroleum"],
    "food_bev":    ["thực phẩm", "đồ uống", "bia", "food", "beverage", "dairy", "sữa"],
    "chemicals":   ["hóa chất", "phân bón", "chemicals", "phosphate"],
    "agriculture": ["nông nghiệp", "chăn nuôi", "thủy sản", "livestock", "fertilizer"],
    "utilities":   ["điện", "utilities", "electrical", "năng lượng"],
    "automotive":  ["ô tô", "xe hơi", "automotive", "honda", "toyota"],
    "retail":      ["bán lẻ", "retail", "electronics"],
    "machinery":   ["máy móc", "công nghiệp", "industrial", "machinery"],
}

# Map each SSOT sector value to a canonical family key
def sector_to_family(sector_str):
    s = sector_str.lower()
    if "banking" in s or "bank" in s:
        return "banking"
    if "steel" in s:
        return "steel"
    if "tech" in s or "it outsourcing" in s or "software" in s:
        return "tech"
    if "real estate" in s:
        return "real_estate"
    if "aviation" in s:
        return "aviation"
    if "securities" in s:
        return "securities"
    if "oil" in s or "gas" in s or "refinery" in s or "petroleum" in s:
        return "oil_gas"
    if "food" in s or "beverage" in s or "beer" in s or "dairy" in s:
        return "food_bev"
    if "chemicals" in s or "phosphate" in s:
        return "chemicals"
    if "agriculture" in s or "livestock" in s or "fertilizer" in s:
        return "agriculture"
    if "utilities" in s or "electrical" in s:
        return "utilities"
    if "automotive" in s:
        return "automotive"
    if "retail" in s or "electronics" in s:
        return "retail"
    if "machinery" in s or "industrial" in s:
        return "machinery"
    return None

# Build per-ticker: canonical family + WRONG-family keywords (all OTHER families)
ticker_families = {}
for ticker, info in ticker_info.items():
    fam = sector_to_family(info["sector"])
    if fam is None:
        continue
    ticker_families[ticker] = fam

# ── Load post ────────────────────────────────────────────────────────────────
with open(post_file, encoding="utf-8") as f:
    post_text = f.read()
post_lower = post_text.lower()

# ── E1: sector-keyword contradiction check ───────────────────────────────────
# Catch the pattern: TICKER labelled with the wrong sector in the post.
# Legitimate uses produce text like "HPG (thép) tăng 0,5%" — ticker + sector in parens.
# False labelling looks like "HPG (ngân hàng)" or "FPT (ngân hàng)".
#
# Matching strategy (tight, not proximity):
#   Pattern 1 — parenthesised label: "TICKER (wrong_sector_kw...)"
#                                  or "(wrong_sector_kw) TICKER"
#                                  Window: 40 chars inside the parens, max 1 non-paren hop.
#   Pattern 2 — inline label:  "TICKER (company / sector)" where sector kw is wrong
#
# The context window is TIGHT (≤40 chars inside the parenthesised label group)
# to avoid false positives from a paragraph that mentions many sectors.
# A wider catch would require NLP that is not feasible in a shell gate.

violations = []
seen_e = set()

for ticker, fam in ticker_families.items():
    correct_kw_set = {w.lower() for w in FAMILY_VI_KEYWORDS.get(fam, [])}
    wrong_families = {k: v for k, v in FAMILY_VI_KEYWORDS.items() if k != fam}

    # Build a set of all keywords that appear in the ticker's OWN sector string.
    # This guards against VRE = "Real estate / Retail REIT" triggering the 'retail' family
    # check (Retail IS in VRE's canonical sector).
    own_sector_lower = ticker_info[ticker]["sector"].lower()
    own_sector_keywords = {w.lower() for fam_kws in FAMILY_VI_KEYWORDS.values()
                           for w in fam_kws if w.lower() in own_sector_lower}

    # Pattern 1a: "TICKER (... wrong_kw ...)" — sector kw inside parentheses right after ticker
    # e.g. "HPG (ngân hàng)" or "HPG (thép)" — only flag the wrong ones
    pat_after = re.compile(
        r'(?<![A-Z])' + re.escape(ticker) + r'(?![A-Z])'  # the ticker
        r'\s*\(([^)\n]{1,60})\)',                           # then (label up to 60 chars)
        re.IGNORECASE
    )
    for m in pat_after.finditer(post_text):
        label = m.group(1).lower()
        for wrong_fam, kw_list in wrong_families.items():
            for kw in kw_list:
                kw_l = kw.lower()
                if kw_l in label and kw_l not in correct_kw_set and kw_l not in own_sector_keywords:
                    key = f"{ticker}:{wrong_fam}"
                    if key not in seen_e:
                        seen_e.add(key)
                        violations.append(
                            f"[BLOCK] Check-E sector-mismatch: {ticker} "
                            f"(canonical={ticker_info[ticker]['sector']}) "
                            f"labelled as '{kw}' (wrong family={wrong_fam}) in post"
                        )
                    break

    # Pattern 1b: "(... wrong_kw ...) TICKER" — sector kw inside parens before ticker
    # e.g. "(ngân hàng) HPG"
    pat_before = re.compile(
        r'\(([^)\n]{1,60})\)'                              # (label) ...
        r'\s*(?<![A-Z])' + re.escape(ticker) + r'(?![A-Z])',
        re.IGNORECASE
    )
    for m in pat_before.finditer(post_text):
        label = m.group(1).lower()
        for wrong_fam, kw_list in wrong_families.items():
            for kw in kw_list:
                kw_l = kw.lower()
                if kw_l in label and kw_l not in correct_kw_set and kw_l not in own_sector_keywords:
                    key = f"{ticker}:{wrong_fam}"
                    if key not in seen_e:
                        seen_e.add(key)
                        violations.append(
                            f"[BLOCK] Check-E sector-mismatch: {ticker} "
                            f"(canonical={ticker_info[ticker]['sector']}) "
                            f"labelled as '{kw}' (wrong family={wrong_fam}) in post"
                        )
                    break

for v in violations:
    print(v)

# ── E2: company-name alias mismatch check ───────────────────────────────────
# Known false aliases that must NEVER appear in the same sentence as the ticker.
# This list IS curated because alias mismatches are named, not derivable from SSOT alone.
# SSOT: the canonical company name comes from system-map.json; the false aliases are the
# known fabrications documented in memory (feedback_fb_poster_fabricates_when_data_thin).
KNOWN_FALSE_ALIASES = {
    # ticker: [list of wrong company names / aliases]
    "VNM": ["nestlé", "nestle", "unilever"],
    "MSN": ["nestle", "nestlé", "unilever"],   # Masan sometimes confused
    "FPT": ["samsung", "lg electronics"],
    "VCB": ["agribank", "vietinbank"],
    "HPG": ["hòa phát steel", "formosa"],       # HPG IS Hoa Phat; "formosa" = competitor
    "SAB": ["heineken", "tiger beer"],           # SAB is Sabeco, not the Dutch/foreign brands
}

# Supplement with the canonical company name from SSOT — check it is NOT labelled
# as a different company from the same watchlist (name confusion).
ssot_companies = {t: i["company"] for t, i in ticker_info.items()}

for ticker, false_aliases in KNOWN_FALSE_ALIASES.items():
    # Only check tickers that appear in the post
    pat = re.compile(r'(?<![A-Z])' + re.escape(ticker) + r'(?![A-Z])', re.IGNORECASE)
    if not pat.search(post_text):
        continue

    post_lc = post_text.lower()
    for alias in false_aliases:
        if alias.lower() in post_lc:
            canonical = ssot_companies.get(ticker, ticker)
            print(f"[BLOCK] Check-E company-alias: {ticker} (canonical={canonical}) "
                  f"— post contains wrong alias '{alias}'. Likely fabrication.")
            break

PYEOF
)

# Print any Check-E violations and count them
if [[ -n "$check_e_violations" ]]; then
  echo "$check_e_violations"
  # Count [BLOCK] lines
  e_count=$(echo "$check_e_violations" | grep -c '^\[BLOCK\]' || true)
  e_count=$(echo "$e_count" | grep -m1 '^[0-9]' || echo "0")
  VIOLATIONS=$((VIOLATIONS + e_count))
fi

# ── Check F: VN-ticker price in USD (currency-unit guard) ─────────────────────
# Rationale: VN-market equities trade in VND / nghìn đồng. A "$" or "USD" followed
# by a number appearing on the SAME LINE as a VN-ticker is a unit error / fabrication
# signal. In Vietnamese financial prose, ticker and price appear in the same clause
# ("HPG hiện ở mức $23,50", "TCB giá USD 32,05"), so line-level co-occurrence is the
# correct detection surface.
#
# FALSE-POSITIVE GUARD — must NOT fire on legitimate USD references:
#   • Commodity prices:   "dầu Brent $87/thùng", "vàng $4.238/oz"
#     → guarded by: commodity-unit words ("thùng", "oz", "ounce", "barrel", "tấn")
#       anywhere on the line — commodity $/unit can never co-occur with a VN-ticker
#       price on the same sentence since they are different asset classes.
#   • FX rates:           "tỷ giá USD/VND ở 26.122", "USD/EUR"
#     → guarded by: "/" immediately follows USD/$ (FX-pair separator pattern).
#   • Macro-aggregate refs: "xuất khẩu đạt 3 tỷ USD", "FDI 2 billion USD"
#     → guarded by: aggregate quantifier ("tỷ", "triệu", "billion", "million")
#       between a number and the USD/$ token.
#   • Lines mixing commodity price AND a ticker (e.g. comparing GAS stock to oil price):
#     → guarded by: commodity-unit check fires first, skips the entire line.
#
# FIRE pattern (all must be true):
#   1. A VN-ticker (2-4 uppercase letters, not in NON_TICKERS exclusion set) appears
#      anywhere on the line.
#   2. "$" or "USD" is followed by a number in stock-price range (5–9999) on the
#      SAME LINE.
#   3. The line does NOT contain a commodity-unit word.
#   4. The "$" or "USD" is NOT in a FX-pair context ("USD/VND", "$/VND", "$/EUR", etc.).
#   5. The line does NOT contain a macro-aggregate pattern ("X tỷ USD", "X billion USD").
#
# Implementation: Python3 for precise line-level exclusion logic.

check_f_violations=$(python3 - "$FILE" <<'PYEOF'
import re, sys

post_file = sys.argv[1]
try:
    with open(post_file, encoding="utf-8") as f:
        lines = f.readlines()
except Exception as e:
    print(f"[WARN] Check-F: cannot read post file: {e}", flush=True)
    sys.exit(0)

# Commodity-unit exclusion: lines with these words use $ as $/unit for commodities
COMMODITY_UNITS = re.compile(
    r'\bthùng\b|\boz\b|/oz\b|ounce|barrel|\btấn\b',
    re.IGNORECASE
)

# FX-pair exclusion: USD/VND, $/VND, USD/EUR, etc. — match $ or USD followed by /
FX_PAIR = re.compile(r'(?:USD|\$)/[A-Z]{3}', re.IGNORECASE)

# Macro-aggregate exclusion: number + aggregate unit + USD/$
MACRO_AGGREGATE = re.compile(
    r'\d[\d.,]*\s*(?:tỷ|triệu|billion|million)\s*(?:USD|\$)',
    re.IGNORECASE | re.UNICODE
)

# Non-ticker exclusion set: known 2-4-char uppercase abbreviations that are not tickers
NON_TICKERS = {
    "VN", "USD", "VND", "DXY", "FX", "TV", "AI", "MCP", "BOT", "OK", "NA",
    "GDP", "CPI", "IIP", "NP", "ROE", "ROA", "EPS", "FY", "YTD", "HOSE",
    "HNX", "UPCOM", "ETF", "IPO", "PE", "PB", "OI", "SL", "TP", "EV",
    "IMF", "WB", "ADB", "FED", "ECB", "BOJ", "RBI", "FDI", "FII", "OTC",
    "NFP", "PMI", "PCE", "PPI", "EY", "IV", "OMO", "SBV", "MOF", "GSO",
    "SSC", "VIC",  # note: VIC IS a real ticker — removed from exclusion below
}
# VIC is a real ticker; keep it tickerable. Remove it if mistakenly in set.
NON_TICKERS.discard("VIC")

TICKER_PAT = re.compile(r'\b([A-Z]{2,4})\b')

# USD-price pattern: "$" or "USD" (as standalone token, not mid-word) followed by a number
# Stock-price range guard: 5–9999 (nghìn đồng mapped; fabricated USD prices land here)
USD_PRICE_PAT = re.compile(
    r'(?<![A-Z])(?P<usd>\$|USD)(?![/A-Z])\s*(?P<num>\d{1,5}(?:[.,]\d{1,3})?)',
    re.IGNORECASE
)

violations = []

for lineno, line in enumerate(lines, 1):
    # Skip structural/metadata lines
    stripped = line.strip()
    if lineno == 1:
        continue  # file title header allowed
    if not stripped or stripped.startswith('---') or stripped.startswith('⚠️') or \
       stripped.startswith('#chung') or stripped.startswith('_Được tạo'):
        continue

    # Commodity-unit lines → skip ($/oz, $/thùng are legitimate)
    if COMMODITY_UNITS.search(line):
        continue

    # FX-pair lines → skip (USD/VND, $/EUR are legitimate)
    if FX_PAIR.search(line):
        continue

    # Macro-aggregate lines → skip (3 tỷ USD = trade figure, not stock price)
    if MACRO_AGGREGATE.search(line):
        continue

    # Find all USD-price patterns on this line
    usd_matches = []
    for m in USD_PRICE_PAT.finditer(line):
        num_val_str = m.group("num").replace(",", "").replace(".", "")
        try:
            num_val = int(num_val_str)
        except ValueError:
            continue
        # Only flag stock-price-range values (5–9999)
        if 5 <= num_val <= 9999:
            usd_matches.append(m)

    if not usd_matches:
        continue

    # Find all VN-tickers on the line (full line scan — ticker often precedes price in VN prose)
    line_tickers = []
    for tm in TICKER_PAT.finditer(line):
        ticker = tm.group(1)
        if ticker not in NON_TICKERS:
            line_tickers.append(ticker)

    if not line_tickers:
        continue

    # Co-occurrence: USD-price AND VN-ticker on the same line → flag
    for m in usd_matches:
        ticker = line_tickers[0]  # report the first ticker found
        violations.append(
            f"[BLOCK] Check-F currency-unit: '{ticker}' and USD-price '{m.group().strip()}' "
            f"co-occur on line {lineno} — VN equities trade in VND/nghìn đồng; "
            f"USD next to ticker price = unit error / fabrication signal\n"
            f"  line {lineno}: {line.rstrip()}"
        )
        break  # one violation per line is enough

for v in violations:
    print(v)
PYEOF
)

if [[ -n "$check_f_violations" ]]; then
  echo "$check_f_violations"
  f_count=$(echo "$check_f_violations" | grep -c '^\[BLOCK\]' || true)
  f_count=$(echo "$f_count" | grep -m1 '^[0-9]' || echo "0")
  VIOLATIONS=$((VIOLATIONS + f_count))
fi

# ── Check G: structural template validator ────────────────────────────────────
# Validates the canonical structure required by docs/agents/fb-market-poster/flow/main.md:
#   G1  canonical header present (line 1: "# Thị trường chứng khoán Việt Nam")
#   G2  verbatim disclaimer block present (⚠️ Nội dung... inside --- separators)
#   G3  valid hashtag block present (last non-empty line starts with #chungkhoan)
#   G4  no raw markdown in post body (**bold**, ##headers, | table |)
#        — exception: line 1 (the file title header # ...) is allowed
#   G5  word ceiling ≤ 1300 words (flow cap; posts breaching this need trimming)
#        — word count excludes: line 1 (file header), --- separator lines,
#          the disclaimer line itself, and the hashtag line
#
# Exit discipline: each violation increments $VIOLATIONS; the Result block owns the exit.

check_g_violations=$(python3 - "$FILE" <<'PYEOF'
import re, sys

post_file = sys.argv[1]
try:
    with open(post_file, encoding="utf-8") as f:
        raw = f.read()
        lines = raw.splitlines()
except Exception as e:
    print(f"[WARN] Check-G: cannot read post file: {e}", flush=True)
    sys.exit(0)

violations = []

# ── G1: canonical header ───────────────────────────────────────────────────────
# Line 1 must start with "# Thị trường chứng khoán Việt Nam"
HEADER_PAT = re.compile(r'^#\s+Th[iị]\s+tr[ươ]ờng\s+ch[uứ]ng\s+kho[aá]n\s+Vi[eệ]t\s+Nam', re.IGNORECASE | re.UNICODE)
if not lines or not HEADER_PAT.match(lines[0]):
    violations.append(
        "[BLOCK] Check-G1 missing-header: line 1 must be "
        "'# Thị trường chứng khoán Việt Nam — YYYY-MM-DD' "
        f"(got: {lines[0][:80] if lines else '(empty file)'})"
    )

# ── G2: verbatim disclaimer block ─────────────────────────────────────────────
# Must contain the exact disclaimer text (substring match — allows minor surrounding whitespace).
DISCLAIMER_CORE = "Nội dung được tạo tự động bởi bot AI, chưa được kiểm chứng"
if DISCLAIMER_CORE not in raw:
    violations.append(
        "[BLOCK] Check-G2 missing-disclaimer: verbatim disclaimer text not found. "
        f"Expected substring: '{DISCLAIMER_CORE}'"
    )
else:
    # Also verify it is enclosed in --- separators
    # The pattern: a line with "---" before and after the disclaimer line
    DISCLAIMER_BLOCK_PAT = re.compile(
        r'^---\s*\n[^\n]*' + re.escape(DISCLAIMER_CORE) + r'[^\n]*\n---',
        re.MULTILINE
    )
    if not DISCLAIMER_BLOCK_PAT.search(raw):
        violations.append(
            "[BLOCK] Check-G2 disclaimer-not-fenced: disclaimer text found but not "
            "enclosed in '---' separator lines above and below"
        )

# ── G3: valid hashtag block ────────────────────────────────────────────────────
# Last non-empty line must be the hashtag block starting with #chungkhoan
last_nonempty = ""
for ln in reversed(lines):
    if ln.strip():
        last_nonempty = ln.strip()
        break

MANDATORY_TAGS = ["#chungkhoan", "#chungkhoanvietnam", "#vnindex", "#dautu", "#thitruongchungkhoan"]
if not last_nonempty.startswith("#chungkhoan"):
    violations.append(
        f"[BLOCK] Check-G3 missing-hashtag-block: last non-empty line must be the hashtag block "
        f"starting with '#chungkhoan'. Got: '{last_nonempty[:80]}'"
    )
else:
    # Check mandatory tags
    missing_tags = [t for t in MANDATORY_TAGS if t not in last_nonempty]
    if missing_tags:
        violations.append(
            f"[BLOCK] Check-G3 hashtag-missing-mandatory: hashtag block is missing mandatory tags: "
            + ", ".join(missing_tags)
        )
    # Check no Vietnamese diacritics inside any hashtag token
    DIACRITIC_PAT = re.compile(
        r'[àáâãăắặằẳẵậấầẩẫèéêềếểễệìíòóôõơớờởỡợùúưứừửữựýđÀÁÂÃĂẮẶẰẲẴẬẤẦẨẪÈÉÊỀẾỂỄỆÌÍÒÓÔÕƠỚỜỞỠỢÙÚƯỨỪỬỮỰÝĐ]'
    )
    for token in last_nonempty.split():
        if token.startswith('#') and DIACRITIC_PAT.search(token):
            violations.append(
                f"[BLOCK] Check-G3 hashtag-diacritic: hashtag token '{token}' contains "
                "Vietnamese diacritics — FB hashtags must be plain ASCII"
            )
            break

# ── G4: no raw markdown in post body ──────────────────────────────────────────
# Line 1 (file title header "# Thị trường ...") is allowed as the one # line.
# ALL other lines must not contain:
#   - ## or deeper heading markers
#   - **bold** or __bold__ markdown
#   - Markdown table rows (| cell | cell |)
# Note: a single # at start of line is ONLY allowed on line 1 (the file title).
# The hashtag block on the last line uses # as tag prefix, not markdown — that line
# is excluded by checking: if line starts with #chungkhoan it's the hashtag block.
MD_HEADING = re.compile(r'^#{2,}\s+')          # ## or deeper headings
MD_BOLD    = re.compile(r'\*\*[^*\n]+\*\*|__[^_\n]+__')  # **bold** or __bold__
MD_TABLE   = re.compile(r'^\s*\|[^|]+\|')       # | table | row |

for i, ln in enumerate(lines, 1):
    stripped = ln.strip()
    if i == 1:
        continue  # allow the file title header line
    if not stripped or stripped.startswith('---') or stripped.startswith('⚠️') or \
       stripped.startswith('_Được tạo') or stripped.startswith('#chungkhoan'):
        continue  # skip structural/metadata lines

    if MD_HEADING.match(stripped):
        violations.append(
            f"[BLOCK] Check-G4 markdown-heading: line {i} contains raw markdown heading "
            f"(## or deeper) — FB posts are plain text: '{stripped[:80]}'"
        )
    if MD_BOLD.search(ln):
        violations.append(
            f"[BLOCK] Check-G4 markdown-bold: line {i} contains **bold** or __bold__ "
            f"markdown — FB posts are plain text: '{stripped[:80]}'"
        )
    if MD_TABLE.match(ln):
        violations.append(
            f"[BLOCK] Check-G4 markdown-table: line {i} contains a markdown table row "
            f"— FB posts are plain text: '{stripped[:80]}'"
        )

# ── G5: word ceiling ≤ 1300 words ─────────────────────────────────────────────
# Count words in body lines only. Exclude:
#   - Line 1 (file title header)
#   - Lines that are exactly "---"
#   - The disclaimer line (contains "Nội dung được tạo tự động")
#   - The hashtag block line (starts with #chungkhoan)
#   - The "_Được tạo bởi bot AI" attribution line
WORD_CEILING = 1300

body_words = 0
for i, ln in enumerate(lines, 1):
    stripped = ln.strip()
    if i == 1:
        continue
    if stripped == "---":
        continue
    if DISCLAIMER_CORE in stripped:
        continue
    if stripped.startswith("#chungkhoan"):
        continue
    if stripped.startswith("_Được tạo"):
        continue
    body_words += len(stripped.split())

if body_words > WORD_CEILING:
    violations.append(
        f"[BLOCK] Check-G5 word-ceiling: post body is {body_words} words "
        f"(ceiling={WORD_CEILING}). Trim the Tóm tắt nhanh section first; "
        "never trim Phân tích or Dự đoán."
    )

for v in violations:
    print(v)
PYEOF
)

if [[ -n "$check_g_violations" ]]; then
  echo "$check_g_violations"
  g_count=$(echo "$check_g_violations" | grep -c '^\[BLOCK\]' || true)
  g_count=$(echo "$g_count" | grep -m1 '^[0-9]' || echo "0")
  VIOLATIONS=$((VIOLATIONS + g_count))
fi

# ── Check H: index point-change vs percent math consistency (FIX-FB-GATE-POINT-PCT-MATH) ──
# A post can state a point delta ("giảm/tăng X điểm") and a % delta ("(±Y%)") for the
# SAME index mention that are internally inconsistent — e.g. lesson L2 (2026-06-19):
# post said "giảm 0,32 điểm (−0,32%)" when at that day's level a −0,32% move is
# actually ≈ −5,9 điểm, not −0,32 điểm (unit-confusion / fabrication signal).
#
# Math: implied_point_change = pct/100 × prev_close. prev_close is derived from the
# LIVE snapshot only (never hardcoded, never guessed):
#   prev_close = live_close / (1 + live_pct/100)
# BLOCK when |stated_point_change - implied_point_change| > POINT_PCT_MATH_TOLERANCE.
#
# GENERIC: applies to any VN market index the post pairs with both a point delta and a
# % for the same mention — VN-Index, VN30, HNX-Index, UPCOM (INDEX_ALIASES below) — not
# hardcoded to one ticker. Skips gracefully (no block) when no live snapshot is available,
# same skip-on-unavailable posture as Check-B/D.

check_h_violations=$(python3 - "$FILE" "$SNAPSHOT_JSON" "$POINT_PCT_MATH_TOLERANCE" <<'PYEOF'
import re, sys, json

post_file = sys.argv[1]
snapshot_json_str = sys.argv[2]
tolerance = float(sys.argv[3])

try:
    with open(post_file, encoding="utf-8") as f:
        text = f.read()
except Exception as e:
    print(f"[WARN] Check-H: cannot read post file: {e}", flush=True)
    sys.exit(0)

quotes = {}
if snapshot_json_str:
    try:
        quotes = json.loads(snapshot_json_str).get("quotes", {})
    except Exception:
        quotes = {}

if not quotes:
    sys.exit(0)  # no live data — nothing to validate against, skip gracefully

# Display-name pattern → live ticker code. New indices participate by adding one
# entry here — the check logic below never names a specific ticker.
INDEX_ALIASES = [
    (re.compile(r'VN[- ]?Index\b', re.IGNORECASE), "VNINDEX"),
    (re.compile(r'VN\s?30\b', re.IGNORECASE), "VN30"),
    (re.compile(r'HNX[- ]?Index\b', re.IGNORECASE), "HNXINDEX"),
    (re.compile(r'UPCOM(?:[- ]?Index)?\b', re.IGNORECASE), "UPCOMINDEX"),
]

# <index name> ... (tăng|giảm) N,NN điểm ... (±M,MM%) — same clause, same index mention.
PAIR_PAT = re.compile(
    r'(?P<idx>VN[- ]?Index|VN\s?30|HNX[- ]?Index|UPCOM(?:[- ]?Index)?)'
    r'[^\n]{0,120}?'
    r'(?P<dir>tăng|giảm)\s+(?P<pt>\d{1,4}(?:[.,]\d{1,2})?)\s*điểm'
    r'[^\n]{0,40}?'
    r'\((?P<sign>[+\-−±])\s*(?P<pct>\d{1,3}(?:[.,]\d{1,2})?)\s*%\)',
    re.IGNORECASE | re.UNICODE,
)

violations = []
seen = set()

for m in PAIR_PAT.finditer(text):
    idx_raw = m.group("idx")
    ticker = None
    for pat, tk in INDEX_ALIASES:
        if pat.search(idx_raw):
            ticker = tk
            break
    if ticker is None or ticker in seen:
        continue

    point_raw = m.group("pt").replace(",", ".")
    try:
        point_change = float(point_raw)
    except ValueError:
        continue
    if "giảm" in m.group("dir"):
        point_change = -point_change

    sign = -1 if m.group("sign") in ("-", "−") else 1
    pct_raw = m.group("pct").replace(",", ".")
    try:
        pct_change = sign * float(pct_raw)
    except ValueError:
        continue

    q = quotes.get(ticker)
    if not q:
        continue
    live_close = q.get("close")
    live_pct = q.get("changePct")
    if live_close is None or live_pct is None:
        continue
    try:
        live_close = float(live_close)
        live_pct = float(live_pct)
    except (TypeError, ValueError):
        continue
    denom = 1 + live_pct / 100
    if live_close <= 0 or denom == 0:
        continue

    prev_close = live_close / denom
    implied_point_change = pct_change / 100 * prev_close
    delta = abs(point_change - implied_point_change)

    seen.add(ticker)

    if delta > tolerance:
        direction_word = "giảm" if point_change < 0 else "tăng"
        violations.append(
            f"[BLOCK] Check-H point-pct-math: {idx_raw.strip()} stated "
            f"'{direction_word} {abs(point_change):.2f} điểm ({pct_change:+.2f}%)' — "
            f"implied point change from % at prev_close≈{prev_close:.2f} is "
            f"{implied_point_change:+.2f} điểm, delta={delta:.2f} > {tolerance}pt "
            "tolerance. Point delta and percent delta are internally inconsistent."
        )

for v in violations:
    print(v)
PYEOF
)

if [[ -n "$check_h_violations" ]]; then
  echo "$check_h_violations"
  h_count=$(echo "$check_h_violations" | grep -c '^\[BLOCK\]' || true)
  h_count=$(echo "$h_count" | grep -m1 '^[0-9]' || echo "0")
  VIOLATIONS=$((VIOLATIONS + h_count))
fi

# ── Check I: macro/FX stale-as-current + unverified comparison-level guard ────
# (FIX-FB-GATE-STALE-MACRO-GUARD) Lesson L3: 06-19 USD/VND figure carried stale
# as if it were current; 06-21 an unverified prior/reference level ("25.500")
# was asserted with no verification. GENERIC across every macro/FX class:
# USD/VND, gold, Brent, Fed rate, bond yield — not hardcoded to one class.
#
# Provenance contract (flow-side: docs/agents/fb-market-poster/flow/main.md STEP 1b):
#   The poster writes a per-figure "fetched-this-cycle" provenance file (arg $4)
#   after STEP 1b's live macro fetch, one entry per macro class:
#     { "usdVnd":    { "fetched_this_cycle": bool, "value": number|null,
#                       "source": "get_macro_snapshot", "fetched_at": ISO8601 },
#       "gold": {...}, "brent": {...}, "fedRate": {...}, "bondYield": {...} }
#
# Posture (mirrors Check-B/D "no live data available" vs "figure unprovenanced"):
#   - $4 absent/empty/unparseable → no live-fetch attempt was recorded this cycle
#     at all → the gate cannot distinguish live-vs-carried → GRACEFUL SKIP,
#     same posture as Check-B/D when SNAPSHOT_JSON is unavailable. NOT a block.
#   - $4 present → any macro/FX figure detected in the post for a class with no
#     matching fetched_this_cycle=true entry (within class tolerance) → BLOCK:
#       I1 stale-as-current      — no provenance entry at all for that class.
#       I2 unverified-comparison — figure present but does NOT match this
#         cycle's live value (classic "vẫn ở mức X" / "từ mức Y" / "vượt ngưỡng Z"
#         prior/reference-level phrasing — the exact L3 failure mode).
#   Honest-gap phrasing ("chưa lấy được", "chưa trả được", ...) never fires —
#   no numeric figure is asserted, so there is nothing to verify.

check_i_violations=$(python3 - "$FILE" "$MACRO_PROVENANCE_FILE" <<'PYEOF'
import re, sys, json

post_file = sys.argv[1]
prov_file = sys.argv[2] if len(sys.argv) > 2 else ""

try:
    with open(post_file, encoding="utf-8") as f:
        text = f.read()
except Exception as e:
    print(f"[WARN] Check-I: cannot read post file: {e}", flush=True)
    sys.exit(0)

# Graceful skip: no provenance file supplied → no live-fetch attempt recorded
# this cycle for macro figures. Same posture as Check-B/D skip-on-unavailable.
provenance = None
if prov_file:
    try:
        with open(prov_file, encoding="utf-8") as pf:
            raw = pf.read().strip()
        if raw:
            provenance = json.loads(raw)
    except Exception:
        provenance = None

if not provenance:
    sys.exit(0)

HONEST_GAP_PAT = re.compile(
    r'chưa\s+lấy\s+được|chưa\s+trả\s+được|chưa\s+có\s+số\s+liệu|'
    r'chưa\s+xác\s+minh|chưa\s+có\s+dữ\s+liệu|công\s+cụ\s+chưa|xin\s+phép\s+không\s+nêu',
    re.IGNORECASE | re.UNICODE
)
COMPARISON_PAT = re.compile(
    r'vẫn\s+ở\s+mức|vẫn\s+duy\s+trì\s+ở\s+mức|vẫn\s+giữ\s+ở\s+mức|'
    r'từ\s+mức|so\s+với\s+mức|vượt\s+ngưỡng|quanh\s+ngưỡng',
    re.IGNORECASE | re.UNICODE
)

def norm_thousands(raw):
    # "26.122" / "26,122" -> 26122.0  (VND-rate shape: no decimal in practice)
    digits = re.sub(r'[.,]', '', raw)
    try:
        return float(digits)
    except ValueError:
        return None

def norm_decimal_thousands(raw):
    # "4.507,60" -> 4507.60 ; "4.520" -> 4520.0  (VN format: dot=thousands, comma=decimal)
    s = raw.replace('.', '').replace(',', '.')
    try:
        return float(s)
    except ValueError:
        return None

def norm_decimal(raw):
    # "95,29" / "3,63" -> 95.29 / 3.63  (comma-decimal, no thousands grouping)
    try:
        return float(raw.replace(',', '.'))
    except ValueError:
        return None

MACRO_CLASSES = [
    {
        "key": "usdVnd", "label": "USD/VND",
        "keyword": re.compile(r'usd\s*/\s*vnd|tỷ\s*giá', re.IGNORECASE | re.UNICODE),
        "value": re.compile(r'(\d{2}[.,]\d{3})\b'),
        "norm": norm_thousands, "tolerance": 60.0,
    },
    {
        "key": "gold", "label": "vàng (gold)",
        "keyword": re.compile(r'\bvàng\b', re.IGNORECASE | re.UNICODE),
        "value": re.compile(r'(\d{1,2}[.,]\d{3}(?:[.,]\d{1,2})?)\s*(?:usd|\$)'),
        "norm": norm_decimal_thousands, "tolerance": 20.0,
    },
    {
        "key": "brent", "label": "dầu Brent/WTI",
        "keyword": re.compile(r'dầu\s*brent|\bbrent\b|dầu\s*wti|dầu\s*thô|giá\s*dầu', re.IGNORECASE | re.UNICODE),
        "value": re.compile(r'(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:usd|\$)?\s*/\s*(?:thùng|barrel)'),
        "norm": norm_decimal, "tolerance": 2.0,
    },
    {
        "key": "fedRate", "label": "lãi suất Fed",
        "keyword": re.compile(r'lãi\s*suất\s*fed|fed\s*funds', re.IGNORECASE | re.UNICODE),
        "value": re.compile(r'(\d{1,2}(?:[.,]\d{1,2})?)\s*%'),
        "norm": norm_decimal, "tolerance": 0.10,
    },
    {
        "key": "bondYield", "label": "lợi suất trái phiếu",
        "keyword": re.compile(r'lợi\s*suất\s*trái\s*phiếu|trái\s*phiếu\s*chính\s*phủ|bond\s*yield', re.IGNORECASE | re.UNICODE),
        "value": re.compile(r'(\d{1,2}(?:[.,]\d{1,2})?)\s*%'),
        "norm": norm_decimal, "tolerance": 0.10,
    },
]

violations = []
seen = set()

# NOTE: iterate value-occurrences first (not "first match in keyword window") so
# multi-figure sentences are ALL evaluated — e.g. "tỷ giá ... 26.127, vượt ngưỡng
# 25.500" carries a live current figure AND a separate unverified comparison
# figure in the SAME sentence; only scanning the first match would silently miss
# the second (the exact L3 06-21 failure mode).
for cls in MACRO_CLASSES:
    kw_spans = [m.span() for m in cls["keyword"].finditer(text)]
    if not kw_spans:
        continue

    for val_m in cls["value"].finditer(text):
        v_start, v_end = val_m.span()
        # Proximity gate: the figure must sit within 150 chars of a class keyword.
        near_keyword = any(
            (kw_s - 150) <= v_start and v_end <= (kw_e + 150)
            for kw_s, kw_e in kw_spans
        )
        if not near_keyword:
            continue

        local_start = max(0, v_start - 60)
        local_end = min(len(text), v_end + 20)
        window = text[local_start:local_end]

        if HONEST_GAP_PAT.search(window):
            continue  # honest gap — nothing asserted, nothing to verify

        figure = cls["norm"](val_m.group(1))
        if figure is None:
            continue

        dedup_key = (cls["key"], round(figure, 2))
        if dedup_key in seen:
            continue

        entry = provenance.get(cls["key"]) or {}
        is_comparison = bool(COMPARISON_PAT.search(window))

        if not entry.get("fetched_this_cycle") or entry.get("value") is None:
            seen.add(dedup_key)
            if is_comparison:
                violations.append(
                    f"[BLOCK] Check-I2 unverified-comparison-level: {cls['label']} figure "
                    f"'{val_m.group(1)}' asserts a prior/reference level with NO live-fetch "
                    f"provenance this cycle — window: '{window.strip()[:100]}'"
                )
            else:
                violations.append(
                    f"[BLOCK] Check-I1 stale-as-current: {cls['label']} figure "
                    f"'{val_m.group(1)}' present with NO live-fetch provenance this cycle "
                    f"(no fetched_this_cycle=true entry) — window: '{window.strip()[:100]}'"
                )
            continue

        live_value = entry["value"]
        try:
            live_value = float(live_value)
        except (TypeError, ValueError):
            continue

        delta = abs(figure - live_value)
        if delta > cls["tolerance"]:
            seen.add(dedup_key)
            violations.append(
                f"[BLOCK] Check-I2 unverified-comparison-level: {cls['label']} figure "
                f"'{val_m.group(1)}' (={figure}) does not match this cycle's live-fetched "
                f"value ({live_value}, delta={delta:.2f} > {cls['tolerance']} tolerance) — "
                f"likely a stale/prior-level comparison, not the live figure — "
                f"window: '{window.strip()[:100]}'"
            )
        else:
            seen.add(dedup_key)  # verified — do not re-flag the same figure again

for v in violations:
    print(v)
PYEOF
)

if [[ -n "$check_i_violations" ]]; then
  echo "$check_i_violations"
  i_count=$(echo "$check_i_violations" | grep -c '^\[BLOCK\]' || true)
  i_count=$(echo "$i_count" | grep -m1 '^[0-9]' || echo "0")
  VIOLATIONS=$((VIOLATIONS + i_count))
fi

# ── Check J: breadth %-vs-cited-counts internal consistency (FIX-FB-GATE-BREADTH-PCT-INTERNAL) ──
# Lesson L4 (2026-06-19): a post can state a headline breadth % ("độ rộng khoảng 40%")
# that is internally inconsistent with the advancer/decliner counts cited elsewhere in
# the SAME post ("81 mã tăng" / "81 của ~350" implying ~23%, not 40%).
#
# GENERIC across any breadth phrasing (advancers/decliners/floor-sàn/ceiling-trần counts
# vs %) — not a one-phrase hardcode:
#   Stated-% extraction (either form counts as a claim to verify):
#     (1) headline: first "N%" within 30 chars AFTER the "độ rộng"/"breadth" keyword,
#         in the SAME sentence — tight window so an unrelated % later in the sentence
#         (thanh khoản %, a ticker's own % move, etc.) is never mistaken for the
#         breadth headline.
#     (2) labelled: "N% mã tăng/giảm" or "mã tăng/giảm: N%" (direction known).
#   Cited-counts extraction (label-agnostic, so it covers advancer/decliner/floor/
#   ceiling counts without one regex per label):
#     (a) explicit fraction — "N (mã tăng|giảm|trần|sàn)? của/trên/trong (tổng)?
#         (khoảng|~)? M" — e.g. "81 của ~350" — implied_pct = N/M×100.
#     (b) co-occurring "N mã tăng ... M mã giảm [... K mã đứng giá]" in the same
#         sentence — implied_pct = part/(tăng+giảm[+đứng giá])×100, both the
#         advancer-view and decliner-view (and flat-view) are candidates.
#   BLOCK when the stated % is farther than BREADTH_PCT_TOLERANCE from every implied
#   candidate whose direction matches the stated claim (undirected "độ rộng ~Y%"
#   headline claims are checked against ALL candidates).
#
# Graceful skip (no block, same posture as Check-B/D/H/I skip-on-absent):
#   - no breadth % claim in the post at all
#   - a % claim is present but the post cites no counts to cross-check it against

check_j_violations=$(python3 - "$FILE" "$BREADTH_PCT_TOLERANCE" <<'PYEOF'
import re, sys

post_file = sys.argv[1]
tolerance = float(sys.argv[2])

try:
    with open(post_file, encoding="utf-8") as f:
        text = f.read()
except Exception as e:
    print(f"[WARN] Check-J: cannot read post file: {e}", flush=True)
    sys.exit(0)

sentences = re.split(r'(?<=[.!?…])\s+|\n+', text)

# ── stated %: (1) headline "độ rộng ... N%" (tight 30-char window, same sentence) ──
stated = []  # (pct, direction_or_None, desc)
KW_PAT = re.compile(r'độ\s*rộng|breadth', re.IGNORECASE | re.UNICODE)
PCT_NUM_PAT = re.compile(r'(\d{1,3}(?:[.,]\d{1,2})?)\s*%')
for sent in sentences:
    m = KW_PAT.search(sent)
    if not m:
        continue
    tail = sent[m.end(): m.end() + 30]
    pm = PCT_NUM_PAT.search(tail)
    if not pm:
        continue
    try:
        pct = float(pm.group(1).replace(",", "."))
    except ValueError:
        continue
    between = tail[:pm.start()].lower()
    i_tang = between.find("tăng")
    i_giam = between.find("giảm")
    if i_tang != -1 and (i_giam == -1 or i_tang < i_giam):
        direction = "tăng"
    elif i_giam != -1:
        direction = "giảm"
    else:
        direction = None
    stated.append((pct, direction, f"'độ rộng...{pm.group(0)}'"))

# ── stated %: (2) labelled "N% mã tăng/giảm" (either word order, tight adjacency) ──
LABEL_AFTER_PAT = re.compile(r'(\d{1,3}(?:[.,]\d{1,2})?)\s*%\s*(?:mã\s*)?(tăng|giảm)\b', re.UNICODE)
for m in LABEL_AFTER_PAT.finditer(text):
    try:
        pct = float(m.group(1).replace(",", "."))
    except ValueError:
        continue
    stated.append((pct, m.group(2), f"'{m.group(0)}'"))

LABEL_BEFORE_PAT = re.compile(r'mã\s*(tăng|giảm)\s*(?::|là|ở mức)?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*%', re.UNICODE)
for m in LABEL_BEFORE_PAT.finditer(text):
    try:
        pct = float(m.group(2).replace(",", "."))
    except ValueError:
        continue
    stated.append((pct, m.group(1), f"'{m.group(0)}'"))

if not stated:
    sys.exit(0)  # no breadth % claim anywhere — nothing to cross-check, graceful skip

# ── cited counts (a): explicit "N (label)? của/trên/trong (tổng)? (khoảng|~)? M" fraction ──
FRACTION_PAT = re.compile(
    r'(\d{1,4})\s*(?:mã)?\s*(?:tăng|giảm|trần|sàn)?\s*'
    r'(?:của|trên|trong)\s+(?:tổng\s+)?(?:khoảng\s+)?~?\s*(\d{1,4})',
    re.UNICODE
)
fraction_candidates = []  # ("fraction", implied_pct, desc)
for m in FRACTION_PAT.finditer(text):
    n, total = int(m.group(1)), int(m.group(2))
    if total <= 0 or n > total:
        continue
    fraction_candidates.append(("fraction", n / total * 100.0, f"{n} của ~{total}"))

# ── cited counts (b): co-occurring "N mã tăng ... M mã giảm [... K mã đứng giá]" ──
ADV_PAT = re.compile(r'(\d{1,4})\s*mã\s*tăng\b', re.UNICODE)
DEC_PAT = re.compile(r'(\d{1,4})\s*mã\s*giảm\b', re.UNICODE)
FLAT_PAT = re.compile(r'(\d{1,4})\s*mã\s*đứng\s*giá\b', re.UNICODE)
labeled_candidates = []  # (direction, implied_pct, desc)
for sent in sentences:
    adv_m, dec_m = ADV_PAT.search(sent), DEC_PAT.search(sent)
    if not (adv_m and dec_m):
        continue
    adv, dec = int(adv_m.group(1)), int(dec_m.group(1))
    flat_m = FLAT_PAT.search(sent)
    flat = int(flat_m.group(1)) if flat_m else 0
    total = adv + dec + flat
    if total <= 0:
        continue
    labeled_candidates.append(("tăng", adv / total * 100.0, f"{adv} mã tăng / {total} tổng"))
    labeled_candidates.append(("giảm", dec / total * 100.0, f"{dec} mã giảm / {total} tổng"))
    if flat_m:
        labeled_candidates.append(("đứng giá", flat / total * 100.0, f"{flat} mã đứng giá / {total} tổng"))
    break  # first co-occurring sentence = the primary breadth statement

all_candidates = fraction_candidates + labeled_candidates
if not all_candidates:
    sys.exit(0)  # % claim present but no counts cited anywhere — nothing to verify against

violations = []
seen = set()
for pct, direction, desc in stated:
    key = (round(pct, 1), direction)
    if key in seen:
        continue
    seen.add(key)

    pool = all_candidates if direction is None else \
        [c for c in all_candidates if c[0] in (direction, "fraction")] or all_candidates

    best = min(pool, key=lambda c: abs(pct - c[1]))
    delta = abs(pct - best[1])
    if delta > tolerance:
        violations.append(
            f"[BLOCK] Check-J breadth-pct-internal: stated {desc} = {pct}% does not "
            f"match cited counts ({best[2]} = {best[1]:.2f}%), delta={delta:.2f}pp > "
            f"{tolerance}pp tolerance — internal inconsistency (headline breadth % vs "
            "cited counts)"
        )

for v in violations:
    print(v)
PYEOF
)

if [[ -n "$check_j_violations" ]]; then
  echo "$check_j_violations"
  j_count=$(echo "$check_j_violations" | grep -c '^\[BLOCK\]' || true)
  j_count=$(echo "$j_count" | grep -m1 '^[0-9]' || echo "0")
  VIOLATIONS=$((VIOLATIONS + j_count))
fi

# ── Result ────────────────────────────────────────────────────────────────────
if [[ $VIOLATIONS -eq 0 ]]; then
  echo "[PASS] fb-data-integrity-gate: 0 violations"
  exit 0
else
  echo "[BLOCK] fb-data-integrity-gate: $VIOLATIONS violation(s) — fix ALL before STEP 5 write"
  exit 1
fi
