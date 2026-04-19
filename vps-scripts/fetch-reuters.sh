#!/bin/bash
# Reuters RSS Proxy — Task 1494
#
# Fetches Reuters Markets RSS feed from VPS (geo-accessible) and pushes
# items to MCP server /api/push-reuters for dedup insert into rag_analyses.
#
# ── ENV VAR REFERENCE ────────────────────────────────────────────────────────
#
#  Required (injected by deploy-vinahost.sh / set in VPS environment):
#    REUTERS_PUSH_URL   Full URL for push endpoint
#                       e.g. https://zenmidi.com/api/push-reuters
#    API_KEY            X-API-Key bearer token (VPS_PUSH_API_KEY)
#
#  Log:
#    /var/log/vn-reuters.log  — rotated at 10 MB
#
# Cron: */15 * * * * /root/vps-scripts/fetch-reuters.sh
# ─────────────────────────────────────────────────────────────────────────────

REUTERS_PUSH_URL="${REUTERS_PUSH_URL:-__MCP_BASE__/api/push-reuters}"
API_KEY="${API_KEY:-__API_KEY__}"
LOG="/var/log/vn-reuters.log"

# Reuters Markets RSS feed (publicly accessible from VPS)
RSS_URL="https://feeds.reuters.com/reuters/businessNews"

# Log rotation — keep under 10 MB
LOG_SIZE=$(stat -c%s "$LOG" 2>/dev/null || echo 0)
if [ "$LOG_SIZE" -gt 10485760 ]; then mv "$LOG" "$LOG.old"; fi

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) === REUTERS START ===" >> "$LOG"

# Fetch RSS feed
RSS_XML=$(curl -s --connect-timeout 15 --max-time 30 \
  "$RSS_URL" \
  -H "User-Agent: Mozilla/5.0 (compatible; VNMarket/1.0)")

if [ -z "$RSS_XML" ]; then
  echo "$(date -u) FAIL: empty response from Reuters RSS ($RSS_URL)" >> "$LOG"
  exit 1
fi

# Parse RSS items into JSON array using Python (available on VPS)
ITEMS_JSON=$(python3 - "$RSS_XML" <<'PYEOF'
import sys, json, xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

rss_xml = sys.argv[1]
try:
    root = ET.fromstring(rss_xml)
except ET.ParseError as e:
    print("[]", flush=True)
    sys.exit(0)

items = []
channel = root.find("channel")
if channel is None:
    channel = root

for item in channel.findall("item"):
    title_el = item.find("title")
    link_el  = item.find("link")
    pubdate_el = item.find("pubDate")

    title = title_el.text.strip() if title_el is not None and title_el.text else ""
    url   = link_el.text.strip()  if link_el  is not None and link_el.text  else ""
    pub_raw = pubdate_el.text.strip() if pubdate_el is not None and pubdate_el.text else ""

    # Normalise pubDate → ISO 8601
    try:
        published_at = parsedate_to_datetime(pub_raw).isoformat()
    except Exception:
        published_at = ""

    if title and url:
        items.append({
            "title":        title,
            "url":          url,
            "source":       "reuters",
            "published_at": published_at,
        })

print(json.dumps(items), flush=True)
PYEOF
)

if [ -z "$ITEMS_JSON" ] || [ "$ITEMS_JSON" = "[]" ]; then
  echo "$(date -u) WARN: no items parsed from RSS — skipping push" >> "$LOG"
  exit 0
fi

ITEM_COUNT=$(echo "$ITEMS_JSON" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
echo "$(date -u) Parsed $ITEM_COUNT RSS items" >> "$LOG"

# Push to MCP server
PAYLOAD=$(python3 -c "import sys,json; items=json.loads(sys.stdin.read()); print(json.dumps({'items':items}))" <<< "$ITEMS_JSON")

RESP=$(curl -s --connect-timeout 10 --max-time 20 \
  -X POST "$REUTERS_PUSH_URL" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d "$PAYLOAD")

echo "$(date -u) PUSH: $ITEM_COUNT items => $RESP" >> "$LOG"
