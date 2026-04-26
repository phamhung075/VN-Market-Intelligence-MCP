#!/bin/bash
# BCTC PDF Proxy — auto-deployed
# Pulls fetch queue from MCP, downloads PDFs from SSC/HOSE/HNX/UPCOM,
# pushes each to MCP.  Same auth pattern as fetch-prices.sh.

API_URL="__MCP_BASE__/api/push-bctc-pdf"
QUEUE_URL="__MCP_BASE__/api/bctc-fetch-queue"
API_KEY="__API_KEY__"
LOG="/var/log/vn-bctc-fetch.log"
MAX_PDF_BYTES=52428800   # 50 MB

# Log rotation
LOG_SIZE=$(stat -c%s "$LOG" 2>/dev/null || echo 0)
if [ "$LOG_SIZE" -gt 10485760 ]; then mv "$LOG" "$LOG.old"; fi

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) === BCTC START ===" >> "$LOG"

# Step 1: Pull queue
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
echo "$(date -u) Queue: $TOTAL items pending" >> "$LOG"

if [ "$TOTAL" = "0" ]; then
  echo "$(date -u) Nothing to fetch — exit" >> "$LOG"
  exit 0
fi

# Step 2: Process each queue item
echo "$QUEUE" | jq -c '.queue[]? // empty' 2>/dev/null | while read -r ITEM; do
  CODE=$(echo "$ITEM"    | jq -r '.action_code')
  YEAR=$(echo "$ITEM"    | jq -r '.period_year')
  QTR=$(echo "$ITEM"     | jq -r '.period_quarter')
  HINTS=$(echo "$ITEM"   | jq -r '.source_hints[]' 2>/dev/null)

  TMP_PDF=$(mktemp /tmp/bctc_XXXXXX.pdf)
  FETCHED=0
  FETCH_URL=""

  # Try each hint URL in order
  for HINT_URL in $HINTS; do
    HTTP_CODE=$(curl -s -o "$TMP_PDF" -w "%{http_code}" \
      --connect-timeout 15 --max-time 120 \
      --max-filesize "$MAX_PDF_BYTES" \
      -L \
      -H "User-Agent: VN-Market-Intelligence/1.0" \
      "$HINT_URL")

    if [ "$HTTP_CODE" = "200" ]; then
      FSIZE=$(stat -c%s "$TMP_PDF" 2>/dev/null || echo 0)
      MIME=$(file --mime-type -b "$TMP_PDF" 2>/dev/null || echo "")
      if [ "$FSIZE" -gt 1024 ] && echo "$MIME" | grep -q "pdf"; then
        FETCHED=1
        FETCH_URL="$HINT_URL"
        echo "$(date -u) $CODE $YEAR-$QTR: downloaded ${FSIZE}B from $HINT_URL" >> "$LOG"
        break
      fi
    fi
    echo "$(date -u) $CODE $YEAR-$QTR: hint failed HTTP=$HTTP_CODE url=$HINT_URL" >> "$LOG"
  done

  if [ "$FETCHED" = "0" ]; then
    echo "$(date -u) $CODE $YEAR-$QTR: all hints exhausted — skip" >> "$LOG"
    rm -f "$TMP_PDF"
    continue
  fi

  # Step 3: Push PDF to MCP
  RESP=$(curl -s --connect-timeout 10 --max-time 30 \
    -X POST "$API_URL" \
    -H "X-API-Key: $API_KEY" \
    -H "User-Agent: VN-Market-VPS-Proxy/1.0" \
    -F "action_code=$CODE" \
    -F "period_year=$YEAR" \
    -F "period_quarter=$QTR" \
    -F "source_url=$FETCH_URL" \
    -F "pdf=@$TMP_PDF;type=application/pdf")

  echo "$(date -u) $CODE $YEAR-$QTR: push → $RESP" >> "$LOG"
  rm -f "$TMP_PDF"
done
