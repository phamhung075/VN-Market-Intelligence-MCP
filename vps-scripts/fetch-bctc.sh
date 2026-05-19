#!/bin/bash
set -euo pipefail

API_URL="https://zenmidi.com/vn-market/api/push-bctc-pdf"
QUEUE_URL="https://zenmidi.com/vn-market/api/bctc-fetch-queue?skip_enrichment=true"
API_KEY="38955a0a253435cdaa44f5a705ad925d1ec756585a66fe5494dcd867b6d34197"
LOG="/var/log/vn-bctc-fetch.log"
MAX_PDF_BYTES=52428800

# Source shared constants (LOG_ROTATE_BYTES) from vps-lib.sh
# shellcheck source=/root/vps-lib.sh
[ -f /root/vps-lib.sh ] && LOG_ROTATE_BYTES=$(grep '^LOG_ROTATE_BYTES=' /root/vps-lib.sh | cut -d= -f2) || LOG_ROTATE_BYTES=10485760
LOG_SIZE=$(stat -c%s "$LOG" 2>/dev/null || echo 0)
if [ "$LOG_SIZE" -gt $LOG_ROTATE_BYTES ]; then mv "$LOG" "$LOG.old"; fi

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) === BCTC FETCH START ===" >> "$LOG"

# Step 1: Pull queue
QUEUE=$(curl -s --connect-timeout 30 --max-time 120 \
  "$QUEUE_URL" \
  -H "X-API-Key: $API_KEY" \
  -H "User-Agent: VN-Market-VPS-Proxy/1.0")

if [ -z "$QUEUE" ]; then
  echo "$(date -u) FAIL: cannot reach MCP server" >> "$LOG"
  exit 1
fi

TOTAL=$(echo "$QUEUE" | jq -r '.total // "null"')
echo "$(date -u) Queue: $TOTAL items pending" >> "$LOG"

if [ "$TOTAL" = "0" ] || [ "$TOTAL" = "null" ] || [ -z "$TOTAL" ]; then
  echo "$(date -u) Nothing to fetch -- exit" >> "$LOG"
  exit 0
fi

# Step 2: Process each queue item
# Fix B (Sprint-1953a): guard against invalid/empty JSON before piping to jq
if ! echo "$QUEUE" | jq -e '.queue' > /dev/null 2>&1; then
  echo "$(date -u) FAIL: queue response is not valid JSON -- skipping cycle" >> "$LOG"
  exit 1
fi

echo "$QUEUE" | jq -c '.queue[]' | while IFS= read -r ITEM; do
  CODE=$(echo "$ITEM" | jq -r '.action_code')
  YEAR=$(echo "$ITEM" | jq -r '.period_year')
  QTR=$(echo "$ITEM"  | jq -r '.period_quarter')

  echo "$(date -u) $CODE $QTR/$YEAR: running discovery..." >> "$LOG"

  # Use discover-bctc-urls-browser.py for smart PDF discovery
  DISCOVERY=$(python3 /root/discover-bctc-urls-browser.py "$CODE" "$YEAR" "$QTR" 2>>"$LOG" \
    || echo '{"results":[],"error":"discovery script error"}')

  # Extract local_path (PDF already on disk from discovery) and proxy URL
  LOCAL_PATH=$(echo "$DISCOVERY" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    results = d.get('results', [])
    print(results[0].get('local_path', '') if results else '')
except Exception:
    print('')
" 2>/dev/null || echo "")

  PDF_URL=$(echo "$DISCOVERY" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    results = d.get('results', [])
    print(results[0]['url'] if results else '')
except Exception:
    print('')
" 2>/dev/null || echo "")

  if [ -z "$PDF_URL" ]; then
    DISC_ERR=$(echo "$DISCOVERY" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('error') or '')
except Exception:
    print('')
" 2>/dev/null || echo "")
    echo "$(date -u) $CODE $QTR/$YEAR: SKIP -- no PDF found (${DISC_ERR:-no error details})" >> "$LOG"
    continue
  fi

  echo "$(date -u) $CODE $QTR/$YEAR: discovered PDF at $PDF_URL" >> "$LOG"

  # Use local_path if available (already downloaded by discovery script)
  # This avoids re-downloading via proxy which requires auth
  TMP_PDF=$(mktemp /tmp/bctc_XXXXXX.pdf)

  if [ -n "$LOCAL_PATH" ] && [ -f "$LOCAL_PATH" ]; then
    echo "$(date -u) $CODE $QTR/$YEAR: using local file $LOCAL_PATH" >> "$LOG"
    cp "$LOCAL_PATH" "$TMP_PDF"
  else
    echo "$(date -u) $CODE $QTR/$YEAR: downloading from $PDF_URL" >> "$LOG"
    HTTP_CODE=$(curl -s -L -o "$TMP_PDF" -w "%{http_code}" \
      --connect-timeout 30 --max-time 120 \
      -H "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36" \
      -H "Referer: https://hnx.vn/" \
      "$PDF_URL" 2>/dev/null || echo "000")

    if [ "$HTTP_CODE" != "200" ]; then
      echo "$(date -u) $CODE $QTR/$YEAR: SKIP -- download failed HTTP=$HTTP_CODE" >> "$LOG"
      rm -f "$TMP_PDF"
      continue
    fi
  fi

  PDF_SIZE=$(stat -c%s "$TMP_PDF" 2>/dev/null || echo 0)

  if [ "$PDF_SIZE" -lt 1000 ]; then
    echo "$(date -u) $CODE $QTR/$YEAR: SKIP -- PDF too small (${PDF_SIZE}B)" >> "$LOG"
    rm -f "$TMP_PDF"
    continue
  fi

  if [ "$PDF_SIZE" -gt "$MAX_PDF_BYTES" ]; then
    echo "$(date -u) $CODE $QTR/$YEAR: SKIP -- PDF too large (${PDF_SIZE}B > 50MB)" >> "$LOG"
    rm -f "$TMP_PDF"
    continue
  fi

  if ! file "$TMP_PDF" 2>/dev/null | grep -q "PDF"; then
    echo "$(date -u) $CODE $QTR/$YEAR: SKIP -- not a valid PDF (size=${PDF_SIZE}B)" >> "$LOG"
    rm -f "$TMP_PDF"
    continue
  fi

  echo "$(date -u) $CODE $QTR/$YEAR: pushing PDF (${PDF_SIZE}B)..." >> "$LOG"

  PUSH_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "X-API-Key: $API_KEY" \
    -F "action_code=$CODE" \
    -F "period_year=$YEAR" \
    -F "period_quarter=$QTR" \
    -F "source_url=$PDF_URL" \
    -F "pdf=@$TMP_PDF" \
    "$API_URL" 2>&1)

  PUSH_CODE=$(echo "$PUSH_RESPONSE" | tail -1)
  PUSH_BODY=$(echo "$PUSH_RESPONSE" | head -1)

  if [ "$PUSH_CODE" = "200" ]; then
    echo "$(date -u) $CODE $QTR/$YEAR: SUCCESS (HTTP 200) -- $PUSH_BODY" >> "$LOG"
  else
    echo "$(date -u) $CODE $QTR/$YEAR: PUSH FAILED (HTTP $PUSH_CODE) -- $PUSH_BODY" >> "$LOG"
  fi

  rm -f "$TMP_PDF"
done

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) === BCTC FETCH COMPLETE ===" >> "$LOG"
