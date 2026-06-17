#!/usr/bin/env bash
# fb-data-integrity-gate.sh — numeric plausibility gate for fb-market-poster
#
# Usage:
#   bash scripts/fb-data-integrity-gate.sh <post-body-file> [YYYY-MM-DD] [snapshot-json-file]
#
# Args:
#   $1  post-body-file     path to the post text (required)
#   $2  YYYY-MM-DD         post date (optional — used for context only)
#   $3  snapshot-json-file pre-fetched live snapshot JSON (optional; if absent the gate
#                          fetches from http://localhost:3000/mcp/api/prices/batch)
#
# Exit codes:
#   0  = PASS — all checks clean
#   1  = BLOCK — one or more violations; [BLOCK] lines printed to stdout
#   2  = usage/file error
#
# LIVE DATA SOURCE (for router / poster callers):
#   The gate fetches live data from the mcp-server REST API:
#     GET http://localhost:3000/mcp/api/prices/batch?tickers=VNINDEX,VIC,VHM,...
#   Response: { "quotes": { "VIC": { "ticker":"VIC", "close":..., "changePct":..., ... }, ... } }
#   If the API is unavailable (timeout) AND no snapshot-json-file was supplied, the gate
#   logs a warning and exits 0 (skip-on-unavailable, not block-on-unavailable).
#   The poster may supply a pre-fetched snapshot as $3 to eliminate the network dependency.
#
# CHECKS PERFORMED:
#   A  per-ticker HOSE move > ±7%  (daily price limit violation = fabrication signal)
#   B  per-ticker % in post vs live snapshot beyond 1.0 pp absolute delta
#   C  "bán tháo"/"giảm sàn"/selloff narrative while live breadth = 0 floor + net-positive
#   D  VN-Index level or % in post vs live snapshot beyond tolerance
#
# SSOT for all check thresholds lives exclusively here.
# Memory refs: feedback_fb_poster_fabricates_when_data_thin, feedback_fb_poster_gate_false_green
#
# Pointer: referenced by docs/agents/fb-market-poster/flow/main.md STEP 4b
#          and docs/policies/dev-standards.md § Script Persistence

set -euo pipefail

# ── Args ──────────────────────────────────────────────────────────────────────
FILE="${1:-}"
POST_DATE="${2:-}"
SNAPSHOT_FILE="${3:-}"

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
CURL_TIMEOUT=8           # seconds

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
POST_TICKERS=$(grep -oE '\b([A-Z]{2,4})\b' "$FILE" 2>/dev/null \
  | grep -vE '^(VN|MCP|AI|BOT|UTC|USD|VND|DXY|IV|EY|RSI|MACD|BB|TA|SSI|CK|EOD|OK|NA|GDP|CPI|IIP|NP|ROE|ROA|EPS|Q1|Q2|Q3|Q4|FY|YTD|HOSE|HNX|UPCOM|ETF|IPO|PE|PB|OI|SL|TP|EV|EBITDA|FCF|DCF|IRR|NPV|NAV|ESG|CSR|AGM|EGM|SGD|EUR|JPY|CNY|GBP|CAD|AUD|NZD|CHF|HKD|TWD|KRW|THB|PHP|INR|MYR|IDR)$' \
  | sort -u \
  | tr '\n' ',' | sed 's/,$//')

# Always include VNINDEX for the index check
if [[ -n "$POST_TICKERS" ]]; then
  FETCH_TICKERS="VNINDEX,$POST_TICKERS"
else
  FETCH_TICKERS="VNINDEX"
fi

# ── Step 2: Fetch live snapshot ───────────────────────────────────────────────
SNAPSHOT_JSON=""

if [[ -n "$SNAPSHOT_FILE" && -f "$SNAPSHOT_FILE" && -s "$SNAPSHOT_FILE" ]]; then
  SNAPSHOT_JSON=$(cat "$SNAPSHOT_FILE")
  echo "[INFO] fb-data-integrity-gate: using pre-fetched snapshot from $SNAPSHOT_FILE"
else
  SNAPSHOT_JSON=$(curl -sf --max-time "$CURL_TIMEOUT" \
    "${PRICE_BATCH_URL}?tickers=${FETCH_TICKERS}" 2>/dev/null || true)
  if [[ -z "$SNAPSHOT_JSON" ]]; then
    echo "[WARN] fb-data-integrity-gate: live API unavailable (${PRICE_BATCH_URL}) — skipping live checks (A+B+D); only static checks (C) apply"
    SNAPSHOT_JSON=""
  else
    echo "[INFO] fb-data-integrity-gate: live snapshot fetched from ${PRICE_BATCH_URL}"
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
  abs_pct=$(abs_val "$post_pct")
  if python_gt "$abs_pct" "$HOSE_LIMIT" 2>/dev/null; then
    log_block "Check-A HOSE-price-limit: $ticker post=$post_pct% exceeds ±${HOSE_LIMIT}% daily limit — FABRICATION SIGNAL"
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
# "không có mã giảm sàn", "không bán tháo".
# Strategy: count lines with selloff language, then subtract negation lines.
SELLOFF_LINES=$(grep -iE 'bán tháo|sell.?off|hoảng loạn|tháo chạy' "$FILE" 2>/dev/null || true)
# Remove negation lines (không phải bán tháo / không phải / chứ không phải / mà không)
SELLOFF_AFFIRM_LINES=$(echo "$SELLOFF_LINES" | grep -vE 'không phải|không có|không bán|chứ không|mà không' 2>/dev/null || true)
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
      floor_zero=$(grep -ciE '0 mã (giảm sàn|sàn)|không có mã (nào |giảm )?sàn|chỉ \d mã sàn|sàn, (0|không)' "$FILE" 2>/dev/null || echo "0")
      if [[ "$floor_zero" -gt 0 ]]; then
        log_block "Check-C breadth-contradiction: post contains selloff/bán-tháo language but claims 0 floor stocks AND live VN-Index=${vnindex_live_pct}% (mild). Contradiction."
      else
        # Post doesn't explicitly say 0 floor, but VN-Index mild + selloff language is suspicious
        log_block "Check-C breadth-narrative: post uses selloff/bán-tháo language but live VN-Index=${vnindex_live_pct}% (< ±2%). Verify breadth data before publishing."
      fi
    fi
  else
    # No live data available — check for internal post contradiction only
    floor_zero=$(grep -ciE '0 mã (giảm sàn|sàn)|không có mã (nào |giảm )?sàn|không có mã giảm sàn' "$FILE" 2>/dev/null || echo "0")
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

# ── Result ────────────────────────────────────────────────────────────────────
if [[ $VIOLATIONS -eq 0 ]]; then
  echo "[PASS] fb-data-integrity-gate: 0 violations"
  exit 0
else
  echo "[BLOCK] fb-data-integrity-gate: $VIOLATIONS violation(s) — fix ALL before STEP 5 write"
  exit 1
fi
