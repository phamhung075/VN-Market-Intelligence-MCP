#!/bin/bash
# VN News RSS Proxy — auto-deployed
# Sources: CafeF, VnExpress, VnEconomy, VietStock, TuoiTre, NhanDan,
#          NguoiLaoDong, VietnamBiz, VnBusiness, BaoDauTu
# Pushes all items to MCP server via POST /api/push-news.

API_URL="__MCP_BASE__/api/push-news"
API_KEY="__API_KEY__"
LOG="/var/log/vn-news-fetch.log"
CURSOR_FILE="${VN_NEWS_CURSOR_FILE:-/var/lib/vn-news/cursor}"

# ── Log rotation (10 MB cap) ──────────────────────────────────────────────
# Source shared constants (LOG_ROTATE_BYTES) from vps-lib.sh
# shellcheck source=/root/vps-lib.sh
[ -f /root/vps-lib.sh ] && LOG_ROTATE_BYTES=$(grep '^LOG_ROTATE_BYTES=' /root/vps-lib.sh | cut -d= -f2) || LOG_ROTATE_BYTES=10485760
LOG_SIZE=$(stat -c%s "$LOG" 2>/dev/null || echo 0)
if [ "$LOG_SIZE" -gt $LOG_ROTATE_BYTES ]; then mv "$LOG" "$LOG.old"; fi

TS() { date -u +%Y-%m-%dT%H:%M:%SZ; }
START_S=$(date -u +%s)
echo "$(TS) [NEWS  ] INFO  === START ===" >> "$LOG"

# ── Since-cursor helpers ──────────────────────────────────────────────────
# parse_epoch_s DATE_STR — convert RFC-2822 or ISO-8601 pubDate to epoch seconds.
# Returns 0 on any parse failure (treat as epoch-0, i.e. older than everything).
parse_epoch_s() {
  python3 -c "
import sys
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone
s = sys.argv[1].strip()
try:
    dt = parsedate_to_datetime(s)
    print(int(dt.timestamp()))
    sys.exit(0)
except Exception:
    pass
try:
    # ISO-8601 fallback (e.g. '2026-05-25T08:00:00Z' or with offset)
    s2 = s.replace('Z','+00:00')
    dt = datetime.fromisoformat(s2)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    print(int(dt.timestamp()))
except Exception:
    print(0)
" "$1" 2>/dev/null || echo 0
}

# ── Load / initialise cursor ──────────────────────────────────────────────
# Cursor format (single line): integer epoch seconds of last max-publishedAt pushed.
# First-run (no file): cursor = 0 → all current articles qualify → seeds the cursor.
CURSOR_EPOCH=0
CURSOR_DIR=$(dirname "$CURSOR_FILE")
mkdir -p "$CURSOR_DIR" 2>/dev/null || true
if [ -f "$CURSOR_FILE" ]; then
  RAW_CURSOR=$(cat "$CURSOR_FILE" 2>/dev/null | tr -d '[:space:]')
  # Validate: must be a non-negative integer
  if [[ "$RAW_CURSOR" =~ ^[0-9]+$ ]]; then
    CURSOR_EPOCH="$RAW_CURSOR"
  else
    echo "$(TS) [NEWS  ] WARN  cursor file corrupt (value='$RAW_CURSOR') — resetting to 0" >> "$LOG"
    CURSOR_EPOCH=0
  fi
  echo "$(TS) [NEWS  ] INFO  cursor loaded epoch=$CURSOR_EPOCH ($(date -u -d @"$CURSOR_EPOCH" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -r "$CURSOR_EPOCH" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo 'unknown-date'))" >> "$LOG"
else
  echo "$(TS) [NEWS  ] INFO  cursor first-run (no cursor file) — will push current window and seed" >> "$LOG"
fi

# ── Human-like delay between requests (2-6s random) ─────────────────────
# Mimics a person reading/clicking between news sites — avoids rate-limiting
human_delay() {
  local MIN="${1:-2}" MAX="${2:-6}"
  local WAIT=$(( MIN + RANDOM % (MAX - MIN + 1) ))
  sleep "$WAIT"
}

# ── User-Agent pool (rotate to bypass robot guards) ───────────────────────
UA_POOL=(
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0"
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
)
UA_INDEX=0
next_ua() {
  echo "${UA_POOL[$UA_INDEX]}"
  UA_INDEX=$(( (UA_INDEX + 1) % ${#UA_POOL[@]} ))
}

# ── Block detection ───────────────────────────────────────────────────────
is_blocked() {
  local body="$1" http_code="$2"
  [ "$http_code" = "403" ] && return 0
  [ "$http_code" = "429" ] && return 0
  [ "$http_code" = "000" ] && return 0
  echo "$body" | grep -qi "captcha\|robot\|cloudflare\|access denied\|just a moment\|unusual traffic\|verify you are human" && return 0
  return 1
}

# ── fetch_rss SOURCE URL [max_items] ─────────────────────────────────────
# Tries up to 3 UAs before giving up. Logs HTTP code + block reason.
fetch_rss() {
  local SOURCE="$1" URL="$2" MAX="${3:-20}"
  local BODY HTTP_CODE DUR T0 UA ATTEMPT

  for ATTEMPT in 1 2 3; do
    UA=$(next_ua)
    T0=$(date -u +%s%3N)
    BODY=$(curl -s -w "\n__HTTP__%{http_code}" \
      --connect-timeout 10 --max-time 20 --compressed \
      -H "User-Agent: $UA" \
      -H "Accept: application/rss+xml,application/xml,text/xml,*/*" \
      -H "Accept-Language: vi-VN,vi;q=0.9,en-US;q=0.8" \
      -H "Referer: https://www.google.com/" \
      -L "$URL" 2>/dev/null)
    HTTP_CODE=$(echo "$BODY" | grep "__HTTP__" | sed 's/__HTTP__//')
    BODY=$(echo "$BODY" | grep -v "__HTTP__")
    DUR=$(( $(date -u +%s%3N) - T0 ))

    if is_blocked "$BODY" "$HTTP_CODE"; then
      echo "$(TS) [NEWS  ] WARN  source=$SOURCE attempt=$ATTEMPT http=$HTTP_CODE BLOCKED — retrying with next UA" >> "$LOG"
      sleep 2
      continue
    fi

    echo "$(TS) [NEWS  ] INFO  source=$SOURCE http=$HTTP_CODE dur=${DUR}ms attempt=$ATTEMPT url=$URL" >> "$LOG"

    if [ -z "$BODY" ]; then
      echo "$(TS) [NEWS  ] WARN  source=$SOURCE EMPTY_RESPONSE" >> "$LOG"
      echo "[]"; return
    fi

    # Parse XML → JSON
    local RESULT
    RESULT=$(echo "$BODY" | python3 -u -c "
import sys, xml.etree.ElementTree as ET, json, html as h
source = '$SOURCE'
max_items = $MAX
try:
    tree = ET.fromstring(sys.stdin.read())
except Exception as e:
    print('[]'); sys.exit(0)
items = []
for item in tree.iter('item'):
    title = item.findtext('title', '').strip()
    link  = item.findtext('link',  '').strip()
    pub   = item.findtext('pubDate', '').strip()
    desc  = (item.findtext('description', '')
          or item.findtext('{http://purl.org/rss/1.0/modules/content/}encoded', '') or '')
    desc  = h.unescape(desc).strip()
    if title or link:
        items.append({'title': title, 'url': link, 'publishedAt': pub,
                      'content': desc[:500], 'source': source})
print(json.dumps(items[:max_items]))
" 2>/dev/null || echo "[]")
    echo "$RESULT"; return
  done

  # All 3 attempts blocked
  echo "$(TS) [NEWS  ] ERROR source=$SOURCE PERMANENTLY_BLOCKED after 3 attempts url=$URL" >> "$LOG"
  echo "[]"
}

# ── Fetch all sources ─────────────────────────────────────────────────────
echo "$(TS) [NEWS  ] INFO  Step 1: fetching all RSS sources" >> "$LOG"

# Tier 1 — Finance/Stock specific (2-4s between same-site, 3-6s between different sites)
CAFEF_JSON=$(fetch_rss     "cafef"       "https://cafef.vn/thi-truong-chung-khoan.rss")
human_delay 2 4
CAFEF_BIZ=$(fetch_rss      "cafef"       "https://cafef.vn/doanh-nghiep.rss")
human_delay 3 6
VNEXPRESS_JSON=$(fetch_rss "vnexpress"   "https://vnexpress.net/rss/kinh-doanh.rss")
human_delay 3 6
VNECON1_JSON=$(fetch_rss   "vneconomy"   "https://vneconomy.vn/chung-khoan.rss")
human_delay 2 4
VNECON2_JSON=$(fetch_rss "vneconomy" "https://vneconomy.vn/tai-chinh.rss")
human_delay 3 6
VSTOCK1_JSON=$(fetch_rss   "vietstock"   "https://vietstock.vn/830/chung-khoan/co-phieu.rss")
human_delay 2 4
VSTOCK2_JSON=$(fetch_rss   "vietstock"   "https://vietstock.vn/739/chung-khoan/giao-dich-noi-bo.rss" 10)
human_delay 2 4
VSTOCK3_JSON=$(fetch_rss   "vietstock"   "https://vietstock.vn/761/kinh-te/vi-mo.rss" 10)
human_delay 3 6
VBIZ_JSON=$(fetch_rss      "vietnambiz"  "https://vietnambiz.vn/chung-khoan.rss")
human_delay 3 6
VNBIZ_JSON=$(fetch_rss     "vnbusiness"  "https://vnbusiness.vn/rss/chung-khoan.rss")
human_delay 3 6
# baodautu.vn: RSS empty server-side + articles loaded via AJAX — skip until API found
BDAUTU_JSON="[]"

# Tier 2 — General news (policy + sentiment signals)
human_delay 4 7
TUOITRE_JSON=$(fetch_rss   "tuoitre"     "https://tuoitre.vn/rss/kinh-doanh.rss")
human_delay 3 6
NHANDAN1_JSON=$(fetch_rss  "nhandan"     "https://nhandan.vn/rss/kinhte-1185.rss")
human_delay 2 4
NHANDAN2_JSON=$(fetch_rss  "nhandan"     "https://nhandan.vn/rss/chungkhoan-1191.rss" 10)
human_delay 3 6
NLD_JSON=$(fetch_rss       "nld"         "https://nld.com.vn/rss/kinh-te/tai-chinh-chung-khoan.rss")

# ── Log per-source counts ─────────────────────────────────────────────────
for VAR_SRC in \
  "CAFEF_JSON:cafef-market" "CAFEF_BIZ:cafef-biz" \
  "VNEXPRESS_JSON:vnexpress" \
  "VNECON1_JSON:vneconomy-stocks" "VNECON2_JSON:vneconomy-finance" \
  "VSTOCK1_JSON:vietstock-stocks" "VSTOCK2_JSON:vietstock-insider" "VSTOCK3_JSON:vietstock-macro" \
  "VBIZ_JSON:vietnambiz" "VNBIZ_JSON:vnbusiness" \
  "TUOITRE_JSON:tuoitre" \
  "NHANDAN1_JSON:nhandan-economy" "NHANDAN2_JSON:nhandan-stocks" \
  "NLD_JSON:nld"; do
  VAR="${VAR_SRC%%:*}"; SRC="${VAR_SRC##*:}"
  CNT=$(eval echo \"\$$VAR\" | jq 'length' 2>/dev/null || echo 0)
  echo "$(TS) [NEWS  ] INFO    $SRC: $CNT items" >> "$LOG"
done

# ── Merge + deduplicate by URL ────────────────────────────────────────────
ALL_JSON=$(echo \
  "$CAFEF_JSON" "$CAFEF_BIZ" \
  "$VNEXPRESS_JSON" \
  "$VNECON1_JSON" "$VNECON2_JSON" \
  "$VSTOCK1_JSON" "$VSTOCK2_JSON" "$VSTOCK3_JSON" \
  "$VBIZ_JSON" "$VNBIZ_JSON" "$BDAUTU_JSON" \
  "$TUOITRE_JSON" \
  "$NHANDAN1_JSON" "$NHANDAN2_JSON" \
  "$NLD_JSON" \
  | jq -s 'add | [.[] | select(. != null and .url != "")] | unique_by(.url)' 2>/dev/null)

TOTAL_BEFORE_CURSOR=$(echo "$ALL_JSON" | jq 'length' 2>/dev/null || echo 0)
echo "$(TS) [NEWS  ] INFO  Step 2: merged total=$TOTAL_BEFORE_CURSOR unique items" >> "$LOG"

# ── Apply since-cursor filter ─────────────────────────────────────────────
# Keep only articles whose publishedAt epoch > CURSOR_EPOCH.
# Items with unparseable dates (epoch=0) are treated as older than cursor unless
# cursor is also 0 (first-run) — in that case epoch-0 articles pass through once
# to seed the cursor, and will be filtered on subsequent runs.
echo "$(TS) [NEWS  ] INFO  Step 3: applying cursor filter (cursor_epoch=$CURSOR_EPOCH)" >> "$LOG"
ALL_JSON=$(echo "$ALL_JSON" | python3 -u -c "
import sys, json
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone

def to_epoch(s):
    s = (s or '').strip()
    if not s:
        return 0
    try:
        return int(parsedate_to_datetime(s).timestamp())
    except Exception:
        pass
    try:
        s2 = s.replace('Z', '+00:00')
        dt = datetime.fromisoformat(s2)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    except Exception:
        return 0

cursor = int('$CURSOR_EPOCH')
try:
    items = json.load(sys.stdin)
except Exception:
    items = []

filtered = [item for item in items if to_epoch(item.get('publishedAt','')) > cursor]
print(json.dumps(filtered))
" 2>/dev/null || echo "$ALL_JSON")

TOTAL=$(echo "$ALL_JSON" | jq 'length' 2>/dev/null || echo 0)
FILTERED_OUT=$(( TOTAL_BEFORE_CURSOR - TOTAL ))
echo "$(TS) [NEWS  ] INFO  Step 3: cursor filtered out=$FILTERED_OUT already-seen, new_to_push=$TOTAL" >> "$LOG"

if [ "$TOTAL" = "0" ]; then
  if [ "$TOTAL_BEFORE_CURSOR" -gt 0 ]; then
    echo "$(TS) [NEWS  ] INFO  no new items after cursor filter (all $TOTAL_BEFORE_CURSOR already seen) — sending heartbeat sentinel" >> "$LOG"
  else
    echo "$(TS) [NEWS  ] ERROR all RSS sources returned 0 items — sending heartbeat sentinel" >> "$LOG"
  fi
  # Send a heartbeat sentinel so vps_push_log registers a row (satisfies suppression gate).
  # The MCP server rejects an empty array with 400, so we wrap in a single sentinel item
  # that pollNews will treat as a no-op (unknown source key, no URL → de-duped / skipped).
  SENTINEL='[{"title":"__heartbeat__","url":"","publishedAt":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","content":"","source":"heartbeat"}]'
  HB_RESP=$(curl -s -w "\n__HTTP__%{http_code}" \
    --connect-timeout 10 --max-time 20 \
    -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: $API_KEY" \
    -H "User-Agent: VN-Market-VPS-Proxy/1.0" \
    -d "$SENTINEL")
  HB_HTTP=$(echo "$HB_RESP" | grep "__HTTP__" | sed 's/__HTTP__//')
  echo "$(TS) [NEWS  ] INFO  heartbeat sentinel sent http=$HB_HTTP" >> "$LOG"
  ELAPSED=$(( $(date -u +%s) - START_S ))
  echo "$(TS) [NEWS  ] INFO  === DONE in ${ELAPSED}s (heartbeat only) ===" >> "$LOG"
  exit 0
fi

# ── Push to MCP (write to temp file — avoid "Argument list too long") ────
TMP_JSON=$(mktemp)
echo "$ALL_JSON" > "$TMP_JSON"

T0=$(date -u +%s%3N)
RESP=$(curl -s -w "\n__HTTP__%{http_code}" \
  --connect-timeout 10 --max-time 20 \
  -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -H "User-Agent: VN-Market-VPS-Proxy/1.0" \
  --data "@$TMP_JSON")
HTTP_CODE=$(echo "$RESP" | grep "__HTTP__" | sed 's/__HTTP__//')
RESP_BODY=$(echo "$RESP" | grep -v "__HTTP__")
DUR=$(( $(date -u +%s%3N) - T0 ))
rm -f "$TMP_JSON"

echo "$(TS) [NEWS  ] INFO  PUSH $TOTAL items → /api/push-news http=$HTTP_CODE dur=${DUR}ms resp=$(echo $RESP_BODY | head -c 120)" >> "$LOG"

if [ "$HTTP_CODE" != "200" ]; then
  echo "$(TS) [NEWS  ] ERROR MCP push failed http=$HTTP_CODE resp=$(echo $RESP_BODY | head -c 200)" >> "$LOG"
else
  # ── Advance cursor after successful push ─────────────────────────────────
  # Compute max publishedAt epoch from the batch we just pushed (already filtered
  # and stored in TMP_JSON before the rm).  We re-read from ALL_JSON in memory
  # (TMP_JSON was already rm'd above, so we use ALL_JSON which still holds the same data).
  NEW_CURSOR=$(echo "$ALL_JSON" | python3 -u -c "
import sys, json
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone

def to_epoch(s):
    s = (s or '').strip()
    if not s:
        return 0
    try:
        return int(parsedate_to_datetime(s).timestamp())
    except Exception:
        pass
    try:
        s2 = s.replace('Z', '+00:00')
        dt = datetime.fromisoformat(s2)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    except Exception:
        return 0

try:
    items = json.load(sys.stdin)
except Exception:
    items = []
epochs = [to_epoch(item.get('publishedAt','')) for item in items]
print(max(epochs) if epochs else 0)
" 2>/dev/null || echo 0)

  # Only advance if new cursor is strictly greater than the old one
  # (guards against a batch of epoch-0 items resetting progress).
  if [[ "$NEW_CURSOR" =~ ^[0-9]+$ ]] && [ "$NEW_CURSOR" -gt "$CURSOR_EPOCH" ]; then
    mkdir -p "$CURSOR_DIR" 2>/dev/null || true
    echo "$NEW_CURSOR" > "$CURSOR_FILE"
    echo "$(TS) [NEWS  ] INFO  cursor advanced from $CURSOR_EPOCH to $NEW_CURSOR ($(date -u -d @"$NEW_CURSOR" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -r "$NEW_CURSOR" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo 'unknown-date'))" >> "$LOG"
  elif [ "$CURSOR_EPOCH" = "0" ] && [ "$TOTAL" -gt 0 ]; then
    # First-run: even if all publishedAt are epoch-0 (unparseable), record current
    # time so next cycle will treat all current articles as already-seen.
    FALLBACK_CURSOR=$(date -u +%s)
    mkdir -p "$CURSOR_DIR" 2>/dev/null || true
    echo "$FALLBACK_CURSOR" > "$CURSOR_FILE"
    echo "$(TS) [NEWS  ] INFO  cursor seeded (first-run, all dates unparseable) epoch=$FALLBACK_CURSOR" >> "$LOG"
  else
    echo "$(TS) [NEWS  ] INFO  cursor unchanged epoch=$CURSOR_EPOCH (new_max=$NEW_CURSOR not greater)" >> "$LOG"
  fi
fi

ELAPSED=$(( $(date -u +%s) - START_S ))
echo "$(TS) [NEWS  ] INFO  === DONE in ${ELAPSED}s ===" >> "$LOG"
