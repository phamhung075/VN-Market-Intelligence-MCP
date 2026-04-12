#!/bin/bash
# VN News RSS Proxy — auto-deployed
# Fetches CafeF, VnExpress, VnEconomy RSS feeds from Singapore (no geo-block)
# and pushes all items to MCP server via POST /api/push-news.
# Same auth pattern as fetch-prices.sh.

API_URL="__MCP_BASE__/api/push-news"
API_KEY="__API_KEY__"
LOG="/var/log/vn-news-fetch.log"

# RSS feed URLs (same as MCP fetchers use)
CAFEF_URL="https://cafef.vn/thi-truong-chung-khoan.rss"
VNEXPRESS_URL="https://vnexpress.net/rss/kinh-doanh.rss"
VNECONOMY_STOCKS_URL="https://vneconomy.vn/chung-khoan.rss"
VNECONOMY_FINANCE_URL="https://vneconomy.vn/tai-chinh.rss"

# Log rotation
LOG_SIZE=$(stat -c%s "$LOG" 2>/dev/null || echo 0)
if [ "$LOG_SIZE" -gt 10485760 ]; then mv "$LOG" "$LOG.old"; fi

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) === NEWS START ===" >> "$LOG"

# Helper: fetch RSS feed and convert to JSON array of RssItem objects
fetch_rss() {
  local URL="$1"
  local SOURCE="$2"
  local XML

  XML=$(curl -s --connect-timeout 10 --max-time 20 \
    -H "User-Agent: Mozilla/5.0 (compatible; VN-Market-VPS/1.0)" \
    -H "Accept: application/rss+xml,application/xml,text/xml" \
    -L "$URL" 2>/dev/null)

  if [ -z "$XML" ]; then
    echo "$(date -u) WARN: empty response from $SOURCE ($URL)" >> "$LOG"
    echo "[]"
    return
  fi

  # Parse RSS XML with xmllint + jq
  # Extract <item> elements: title, link, pubDate, description
  # Use python3 for robust XML→JSON (available on Ubuntu)
  echo "$XML" | python3 -c "
import sys, xml.etree.ElementTree as ET, json, html

source = '$SOURCE'
try:
    tree = ET.fromstring(sys.stdin.read())
except:
    print('[]')
    sys.exit(0)

items = []
for item in tree.iter('item'):
    title = item.findtext('title', '').strip()
    link = item.findtext('link', '').strip()
    pub = item.findtext('pubDate', '').strip()
    desc = item.findtext('description', '')
    if not desc:
        desc = item.findtext('{http://purl.org/rss/1.0/modules/content/}encoded', '')
    desc = html.unescape(desc or '').strip()
    if title or link:
        items.append({'title': title, 'url': link, 'publishedAt': pub, 'content': desc[:500], 'source': source})

print(json.dumps(items[:20]))
" 2>/dev/null || echo "[]"
}

# Step 1: Fetch all VN RSS feeds
CAFEF_JSON=$(fetch_rss "$CAFEF_URL" "cafef")
CAFEF_COUNT=$(echo "$CAFEF_JSON" | jq 'length' 2>/dev/null || echo 0)
echo "$(date -u) CafeF: $CAFEF_COUNT items" >> "$LOG"

VNEXPRESS_JSON=$(fetch_rss "$VNEXPRESS_URL" "vnexpress")
VNE_COUNT=$(echo "$VNEXPRESS_JSON" | jq 'length' 2>/dev/null || echo 0)
echo "$(date -u) VnExpress: $VNE_COUNT items" >> "$LOG"

VNECON1_JSON=$(fetch_rss "$VNECONOMY_STOCKS_URL" "vneconomy")
VNECON2_JSON=$(fetch_rss "$VNECONOMY_FINANCE_URL" "vneconomy")
# Merge VnEconomy feeds and deduplicate by URL
VNECONOMY_JSON=$(echo "$VNECON1_JSON $VNECON2_JSON" | jq -s 'add | unique_by(.url)' 2>/dev/null || echo "[]")
VNEC_COUNT=$(echo "$VNECONOMY_JSON" | jq 'length' 2>/dev/null || echo 0)
echo "$(date -u) VnEconomy: $VNEC_COUNT items (2 feeds merged)" >> "$LOG"

# Step 2: Merge all into one array
ALL_JSON=$(echo "$CAFEF_JSON $VNEXPRESS_JSON $VNECONOMY_JSON" | jq -s 'add | [.[] | select(. != null)]' 2>/dev/null)
TOTAL=$(echo "$ALL_JSON" | jq 'length' 2>/dev/null || echo 0)

if [ "$TOTAL" = "0" ]; then
  echo "$(date -u) SKIP: no news items to push" >> "$LOG"
  exit 0
fi

# Step 3: Push to MCP
RESP=$(curl -s --connect-timeout 10 --max-time 15 \
  -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -H "User-Agent: VN-Market-VPS-Proxy/1.0" \
  -d "$ALL_JSON")

echo "$(date -u) PUSH: $TOTAL news items → $RESP" >> "$LOG"
