#!/bin/bash
# Task 1289 — BCTC Queue URL Enricher
# Runs on VPS (Vietnam IP, has access to HOSE/HNX/UPCOM portals).
# Periodically checks main server's queue for items with source_url=NULL.
# For each item, tries to discover direct PDF URLs from HOSE/HNX/UPCOM.
# Posts discovered URLs back to main server via /api/enrich-queue-item.

API_ENRICH_URL="__MCP_BASE__/api/enrich-queue-item"
QUEUE_URL="__MCP_BASE__/api/bctc-fetch-queue?skip_enrichment=true"
API_KEY="__API_KEY__"
LOG="/var/log/vn-bctc-enrich.log"

# Log rotation
LOG_SIZE=$(stat -c%s "$LOG" 2>/dev/null || echo 0)
if [ "$LOG_SIZE" -gt 10485760 ]; then mv "$LOG" "$LOG.old"; fi

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

TOTAL=$(echo "$QUEUE" | jq '.total' 2>/dev/null)
echo "$(date -u) Queue: $TOTAL items pending (skip_enrichment=true)" >> "$LOG"

if [ "$TOTAL" = "0" ] || [ "$TOTAL" = "null" ]; then
  echo "$(date -u) Nothing to enrich — exit" >> "$LOG"
  exit 0
fi

# Step 2: For each queue item, try to discover PDF URLs
ENRICHED=0
echo "$QUEUE" | jq -c '.queue[]' 2>/dev/null | while read -r ITEM; do
  CODE=$(echo "$ITEM" | jq -r '.action_code' 2>/dev/null)
  YEAR=$(echo "$ITEM" | jq -r '.period_year' 2>/dev/null)
  QTR=$(echo "$ITEM"  | jq -r '.period_quarter' 2>/dev/null)
  
  # Skip if already has source_url (don't parse queue hints)
  SOURCE_HINTS=$(echo "$ITEM" | jq -r '.source_hints[]?' 2>/dev/null | head -1)
  if [ -z "$SOURCE_HINTS" ]; then
    echo "$(date -u) $CODE $YEAR-$QTR: no hints available — skip" >> "$LOG"
    continue
  fi

  # Step 2a: Try browser-based discovery (handles JavaScript-rendered portals)
  echo "$(date -u) $CODE $YEAR-$QTR: discovering with browser automation..." >> "$LOG"
  DISCOVERY_JSON=$(python3 /root/discover-bctc-urls-browser.py "$CODE" "$YEAR" "$QTR" 2>/dev/null || echo '{"results":[],"error":"discovery failed"}')

  PDF_URL=$(echo "$DISCOVERY_JSON" | jq -r '.results[0].url // empty' 2>/dev/null)
  SOURCE=$(echo "$DISCOVERY_JSON" | jq -r '.results[0].source // empty' 2>/dev/null)
  CONFIDENCE=$(echo "$DISCOVERY_JSON" | jq -r '.results[0].confidence // 0' 2>/dev/null)
  
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
