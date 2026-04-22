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

  PDF_URL=""
  
  # Try 1: HOSE portal (https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode=CODE)
  echo "$(date -u) $CODE $YEAR-$QTR: trying HOSE portal..." >> "$LOG"
  HOSE_URL="https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode=$CODE"
  HOSE_HTML=$(curl -s --connect-timeout 10 --max-time 30 \
    -H "User-Agent: VN-Market-Intelligence/1.0" \
    "$HOSE_URL" 2>/dev/null || echo "")
  
  if [ ! -z "$HOSE_HTML" ]; then
    # Extract PDF URLs from HOSE HTML (look for .pdf links in href attributes)
    # Pattern: href="/Modules/CMS/Web/Article/...pdf" or similar
    PDF_URL=$(echo "$HOSE_HTML" | grep -oP 'href="[^"]*\.pdf"' | head -1 | sed 's/href="\|"//g')
    if [ ! -z "$PDF_URL" ]; then
      # Resolve relative URLs to absolute
      if [[ "$PDF_URL" != http* ]]; then
        PDF_URL="https://www.hsx.vn${PDF_URL}"
      fi
      echo "$(date -u) $CODE $YEAR-$QTR: found PDF on HOSE: $PDF_URL" >> "$LOG"
    fi
  fi
  
  # Try 2: HNX portal (https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode=CODE)
  if [ -z "$PDF_URL" ]; then
    echo "$(date -u) $CODE $YEAR-$QTR: trying HNX portal..." >> "$LOG"
    HNX_URL="https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode=$CODE"
    HNX_HTML=$(curl -s --connect-timeout 10 --max-time 30 \
      -H "User-Agent: VN-Market-Intelligence/1.0" \
      "$HNX_URL" 2>/dev/null || echo "")
    
    if [ ! -z "$HNX_HTML" ]; then
      PDF_URL=$(echo "$HNX_HTML" | grep -oP 'href="[^"]*\.pdf"' | head -1 | sed 's/href="\|"//g')
      if [ ! -z "$PDF_URL" ]; then
        if [[ "$PDF_URL" != http* ]]; then
          PDF_URL="https://hnx.vn${PDF_URL}"
        fi
        echo "$(date -u) $CODE $YEAR-$QTR: found PDF on HNX: $PDF_URL" >> "$LOG"
      fi
    fi
  fi
  
  # Try 3: UPCOM portal (https://upcom.hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode=CODE)
  if [ -z "$PDF_URL" ]; then
    echo "$(date -u) $CODE $YEAR-$QTR: trying UPCOM portal..." >> "$LOG"
    UPCOM_URL="https://upcom.hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode=$CODE"
    UPCOM_HTML=$(curl -s --connect-timeout 10 --max-time 30 \
      -H "User-Agent: VN-Market-Intelligence/1.0" \
      "$UPCOM_URL" 2>/dev/null || echo "")
    
    if [ ! -z "$UPCOM_HTML" ]; then
      PDF_URL=$(echo "$UPCOM_HTML" | grep -oP 'href="[^"]*\.pdf"' | head -1 | sed 's/href="\|"//g')
      if [ ! -z "$PDF_URL" ]; then
        if [[ "$PDF_URL" != http* ]]; then
          PDF_URL="https://upcom.hnx.vn${PDF_URL}"
        fi
        echo "$(date -u) $CODE $YEAR-$QTR: found PDF on UPCOM: $PDF_URL" >> "$LOG"
      fi
    fi
  fi
  
  # If no PDF found, skip this item
  if [ -z "$PDF_URL" ]; then
    echo "$(date -u) $CODE $YEAR-$QTR: no PDF URL found in any portal" >> "$LOG"
    continue
  fi
  
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
