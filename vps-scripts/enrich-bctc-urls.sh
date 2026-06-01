#!/bin/bash
# Task 1289 — BCTC Queue URL Enricher
# Runs on VPS (Vietnam IP, has access to HOSE/HNX/UPCOM portals).
# Periodically checks main server's queue for items with source_url=NULL.
# For each item, tries to discover direct PDF URLs from HOSE/HNX/UPCOM.
# Posts discovered URLs back to main server via /api/enrich-queue-item.

API_ENRICH_URL="${BCTC_ENRICH_URL:-__MCP_BASE__/api/enrich-queue-item}"
QUEUE_URL="${BCTC_QUEUE_URL:-__MCP_BASE__/api/bctc-fetch-queue?skip_enrichment=true}"
API_KEY="${API_KEY:-__API_KEY__}"
LOG="/var/log/vn-bctc-enrich.log"

# Log rotation
# Source shared constants (LOG_ROTATE_BYTES) from vps-lib.sh
# shellcheck source=/root/vps-lib.sh
[ -f /root/vps-lib.sh ] && LOG_ROTATE_BYTES=$(grep '^LOG_ROTATE_BYTES=' /root/vps-lib.sh | cut -d= -f2) || LOG_ROTATE_BYTES=10485760
LOG_SIZE=$(stat -c%s "$LOG" 2>/dev/null || echo 0)
if [ "$LOG_SIZE" -gt $LOG_ROTATE_BYTES ]; then mv "$LOG" "$LOG.old"; fi

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) === BCTC URL ENRICHMENT START ===" >> "$LOG"

# Step 1: Pull queue with skip_enrichment=true (don't enrich on main server)
QUEUE=$(curl -s --connect-timeout 10 --max-time 15 \
  "$QUEUE_URL" \
  -H "X-API-Key: $API_KEY" \
  -H "User-Agent: VN-Market-VPS-Proxy/1.0")

if [ -z "$QUEUE" ]; then
  echo "$(date -u) FAIL: cannot reach MCP server" >> "$LOG"
  exit 1
fi

TOTAL=$(echo "$QUEUE" | jq '.total // 0' 2>/dev/null)
# Guard: if jq parse fails or returns empty/non-numeric, treat as 0
if ! echo "$TOTAL" | grep -qE '^[0-9]+$'; then
  echo "$(date -u) WARN: malformed JSON from MCP (TOTAL='$TOTAL') — skipping" >> "$LOG"
  exit 0
fi
echo "$(date -u) Queue: $TOTAL items pending (skip_enrichment=true)" >> "$LOG"

if [ "$TOTAL" = "0" ]; then
  echo "$(date -u) Nothing to enrich — exit" >> "$LOG"
  exit 0
fi

# Step 2: For each queue item, try to discover PDF URLs
ENRICHED=0
echo "$QUEUE" | jq -c '.queue[]? // empty' 2>/dev/null | while read -r ITEM; do
  CODE=$(echo "$ITEM" | jq -r '.action_code' 2>/dev/null)
  YEAR=$(echo "$ITEM" | jq -r '.period_year' 2>/dev/null)
  QTR=$(echo "$ITEM"  | jq -r '.period_quarter' 2>/dev/null)
  
  # buildQueueSourceHints (server-side) puts source_url FIRST when it is known,
  # followed by fallback portal URLs. When source_url is null, hints[0] is the
  # SSC fallback portal (congbothongtin.ssc.gov.vn/faces/NewsSearch).
  # Skip items whose first hint is NOT a fallback portal — a direct URL was
  # already discovered on the main server, no re-discovery needed.
  # Process items whose first hint IS a fallback portal — source_url still null.
  SOURCE_HINTS=$(echo "$ITEM" | jq -r '.source_hints[0]?' 2>/dev/null)
  if [ -n "$SOURCE_HINTS" ] && ! echo "$SOURCE_HINTS" | grep -qF "congbothongtin.ssc.gov.vn/faces/NewsSearch"; then
    echo "$(date -u) $CODE $YEAR-$QTR: URL already discovered ($SOURCE_HINTS) — skip" >> "$LOG"
    continue
  fi

  # BCTC discovery is now handled locally by mcp-server (task 1822d-a).
  # This script only posts back URLs that were already enriched server-side.
  # If we reach here, source_hints[0] is the SSC fallback portal and no direct
  # URL is available from the VPS side — skip silently.
  echo "$(date -u) $CODE $YEAR-$QTR: no VPS-side discovery (handled by mcp-server) — skip" >> "$LOG"
  PDF_URL=''
  SOURCE=''
  CONFIDENCE='0'
  
  # If no PDF found, skip this item
  if [ -z "$PDF_URL" ]; then
    ERROR=$(echo "$DISCOVERY_JSON" | jq -r '.error // "Unknown error"' 2>/dev/null)
    echo "$(date -u) $CODE $YEAR-$QTR: discovery failed — $ERROR" >> "$LOG"
    continue
  fi

  echo "$(date -u) $CODE $YEAR-$QTR: discovered from $SOURCE (confidence: $CONFIDENCE)" >> "$LOG"
  
  # Step 3: POST discovered URL back to main server
  PAYLOAD=$(cat <<EOF
{
  "action_code": "$CODE",
  "period_year": $YEAR,
  "period_quarter": "$QTR",
  "source_url": "$PDF_URL"
}
EOF
)
  
  RESP=$(curl -s --connect-timeout 10 --max-time 15 \
    -X POST "$API_ENRICH_URL" \
    -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    -H "User-Agent: VN-Market-VPS-Proxy/1.0" \
    -d "$PAYLOAD")
  
  echo "$(date -u) $CODE $YEAR-$QTR: enrich POST → $RESP" >> "$LOG"
  
done

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) === BCTC URL ENRICHMENT DONE ===" >> "$LOG"
