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
#
# SSOT for all check thresholds lives exclusively here.
# SSOT for ticker→sector/company mapping: docs/data/system-map.json .project.watchlist
# Memory refs: feedback_fb_poster_fabricates_when_data_thin, feedback_fb_poster_gate_false_green,
#              feedback_no_hardcode_stats
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
# grep -vE exits 1 when 0 lines pass the filter (all tickers are in the exclusion list).
# Under set -o pipefail, this aborts the script silently. Use (set +o pipefail; ...) guard.
POST_TICKERS=$(set +o pipefail; grep -oE '\b([A-Z]{2,4})\b' "$FILE" 2>/dev/null \
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
      # NOTE: grep -c returns exit 1 when 0 lines match, so || echo "0" would fire and produce
      # "0\n0" (grep stdout "0" + echo "0"). Fix: capture via subshell that always exits 0.
      floor_zero=$(grep -ciE '0 mã (giảm sàn|sàn)|không có mã (nào |giảm )?sàn|chỉ \d mã sàn|sàn, (0|không)' "$FILE" 2>/dev/null || true)
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
    floor_zero=$(grep -ciE '0 mã (giảm sàn|sàn)|không có mã (nào |giảm )?sàn|không có mã giảm sàn' "$FILE" 2>/dev/null || true)
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

# ── Result ────────────────────────────────────────────────────────────────────
if [[ $VIOLATIONS -eq 0 ]]; then
  echo "[PASS] fb-data-integrity-gate: 0 violations"
  exit 0
else
  echo "[BLOCK] fb-data-integrity-gate: $VIOLATIONS violation(s) — fix ALL before STEP 5 write"
  exit 1
fi
