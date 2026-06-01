#!/bin/bash
# SBV / VCB FX Rate Proxy — auto-deployed
# Fetches USD/VND exchange rate from Vietcombank XML API in Singapore
# and pushes to MCP server via POST /api/push-sbv-rates.
# Same auth pattern as fetch-prices.sh.

API_URL="${SBV_API_URL:-__MCP_BASE__/api/push-sbv-rates}"
API_KEY="${API_KEY:-__API_KEY__}"
LOG="/var/log/vn-sbv-fetch.log"

VCB_URL="https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx?b=68"

# Log rotation
# Source shared constants (LOG_ROTATE_BYTES) from vps-lib.sh
# shellcheck source=/root/vps-lib.sh
[ -f /root/vps-lib.sh ] && LOG_ROTATE_BYTES=$(grep '^LOG_ROTATE_BYTES=' /root/vps-lib.sh | cut -d= -f2) || LOG_ROTATE_BYTES=10485760
LOG_SIZE=$(stat -c%s "$LOG" 2>/dev/null || echo 0)
if [ "$LOG_SIZE" -gt $LOG_ROTATE_BYTES ]; then mv "$LOG" "$LOG.old"; fi

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) === SBV START ===" >> "$LOG"

# Step 1: Fetch VCB FX XML
XML=$(curl -s --connect-timeout 10 --max-time 15 \
  -H "User-Agent: Mozilla/5.0 (compatible; VN-Market-VPS/1.0)" \
  "$VCB_URL")

if [ -z "$XML" ]; then
  echo "$(date -u) FAIL: empty VCB response" >> "$LOG"
  exit 1
fi

# Step 2: Extract USD Transfer rate from XML
# Format: <Exrate CurrencyCode="USD" ... Transfer="26,135.00" .../>
USD_RATE=$(echo "$XML" | python3 -c "
import sys, xml.etree.ElementTree as ET

try:
    tree = ET.fromstring(sys.stdin.read())
    for ex in tree.iter('Exrate'):
        if ex.get('CurrencyCode', '').upper() == 'USD':
            rate = ex.get('Transfer', '') or ex.get('Buy', '')
            rate = rate.replace(',', '')
            print(float(rate))
            sys.exit(0)
    print(0)
except:
    print(0)
" 2>/dev/null | head -1)

if [ -z "$USD_RATE" ] || [ "$USD_RATE" = "0" ]; then
  echo "$(date -u) FAIL: could not extract USD/VND rate" >> "$LOG"
  exit 1
fi

echo "$(date -u) VCB USD/VND: $USD_RATE" >> "$LOG"

# Step 3: Push to MCP
FETCHED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
JSON=$(jq -n --arg rate "$USD_RATE" --arg ts "$FETCHED_AT" \
  '{usdVndOfficial: ($rate | tonumber), fetchedAt: $ts}')

RESP=$(curl -s --connect-timeout 10 --max-time 15 \
  -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -H "User-Agent: VN-Market-VPS-Proxy/1.0" \
  -d "$JSON")

echo "$(date -u) PUSH: SBV rates → $RESP" >> "$LOG"
