#!/bin/bash
# VN Market Price Proxy — auto-deployed by deploy-vps-proxy.sh
# Fetches watchlist from MCP, gets prices from VPS Securities, pushes back.

API_URL="__MCP_BASE__/api/push-prices"
WATCHLIST_URL="__MCP_BASE__/api/watchlist"
API_KEY="__API_KEY__"
LOG="/var/log/vn-price-fetch.log"

# Rotate log if > 10MB
LOG_SIZE=$(stat -c%s "$LOG" 2>/dev/null || echo 0)
if [ "$LOG_SIZE" -gt 10485760 ]; then mv "$LOG" "$LOG.old"; fi

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) === START ===" >> "$LOG"

# Step 1: Get watchlist codes from MCP server
WATCHLIST=$(curl -s --connect-timeout 10 --max-time 15 \
  "$WATCHLIST_URL" \
  -H "X-API-Key: $API_KEY" \
  -H "User-Agent: VN-Market-VPS-Proxy/1.0")

if [ -z "$WATCHLIST" ]; then
  echo "$(date -u) FAIL: cannot reach MCP server" >> "$LOG"
  exit 1
fi

CODES=$(echo "$WATCHLIST" | jq -r '.codes[]' 2>/dev/null)
if [ -z "$CODES" ]; then
  echo "$(date -u) FAIL: empty watchlist: $WATCHLIST" >> "$LOG"
  exit 1
fi

echo "$(date -u) Watchlist: $(echo $CODES | tr '\n' ' ')" >> "$LOG"

# Step 2: Fetch prices from VPS Securities API
JSON="["
FIRST=1
for CODE in $CODES; do
  DATA=$(curl -s --connect-timeout 10 --max-time 15 \
    "https://bgapidatafeed.vps.com.vn/getliststockdata/$CODE" \
    -H "User-Agent: Mozilla/5.0")

  if [ -n "$DATA" ] && [ "$DATA" != "[]" ] && [ "$DATA" != "null" ]; then
    PRICE=$(echo "$DATA" | jq -r '.[0].lastPrice // empty')
    if [ -n "$PRICE" ]; then
      VOL=$(echo "$DATA" | jq -r '.[0].lot // 0')
      CHG=$(echo "$DATA" | jq -r '.[0].changePc // "0"')
      HIGH=$(echo "$DATA" | jq -r '.[0].highPrice // "0"')
      LOW=$(echo "$DATA" | jq -r '.[0].lowPrice // "0"')
      if [ $FIRST -eq 0 ]; then JSON="$JSON,"; fi
      JSON="${JSON}{\"code\":\"$CODE\",\"price\":$PRICE,\"volume\":$VOL,\"change_pct\":\"$CHG\",\"high\":\"$HIGH\",\"low\":\"$LOW\"}"
      FIRST=0
      echo "$(date -u) OK: $CODE=$PRICE vol=$VOL chg=$CHG%" >> "$LOG"
    else
      echo "$(date -u) SKIP: $CODE no price" >> "$LOG"
    fi
  else
    echo "$(date -u) FAIL: $CODE empty response" >> "$LOG"
  fi
done
JSON="$JSON]"

# Step 3: Push to MCP server
if [ "$JSON" != "[]" ]; then
  RESP=$(curl -s --connect-timeout 10 --max-time 15 \
    -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: $API_KEY" \
    -d "$JSON")
  echo "$(date -u) PUSH: $RESP" >> "$LOG"
else
  echo "$(date -u) SKIP: no prices to push" >> "$LOG"
fi

echo "$(date -u) === END ===" >> "$LOG"
