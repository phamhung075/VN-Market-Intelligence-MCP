#!/bin/bash
# VN Market Price Proxy — auto-deployed
# Fetches: VN stocks (batch) + VN indices (CafeF) + global indices (Yahoo Finance)
# All pushed to MCP server in 1 call
#
# Step 2b: Foreign flow (fBuyVol / fSellVol / fRoom) extracted from VPS data
# and pushed to /api/push-foreign-flow. Field names are configurable via:
#
#   FOREIGN_FLOW_FBUY_FIELD  — field name for foreign buy volume   (default: fBuyVol)
#   FOREIGN_FLOW_FSELL_FIELD — field name for foreign sell volume  (default: fSellVol)
#   FOREIGN_FLOW_ROOM_FIELD  — field name for remaining buy room   (default: fRoom)
#
# Set these env vars in the systemd unit's EnvironmentFile to override defaults.

API_URL="${PRICES_API_URL:-__MCP_BASE__/api/push-prices}"
FOREIGN_FLOW_URL="${PRICES_FF_URL:-__MCP_BASE__/api/push-foreign-flow}"
WATCHLIST_URL="${PRICES_WATCHLIST_URL:-__MCP_BASE__/api/watchlist}"
API_KEY="${API_KEY:-__API_KEY__}"
LOG="/var/log/vn-price-fetch.log"

# Configurable foreign flow field names (can be overridden via environment)
FBUY_FIELD="${FOREIGN_FLOW_FBUY_FIELD:-fBuyVol}"
FSELL_FIELD="${FOREIGN_FLOW_FSELL_FIELD:-fSellVol}"
FROOM_FIELD="${FOREIGN_FLOW_ROOM_FIELD:-fRoom}"

# Source shared constants (LOG_ROTATE_BYTES) from vps-lib.sh
# shellcheck source=/root/vps-lib.sh
[ -f /root/vps-lib.sh ] && LOG_ROTATE_BYTES=$(grep '^LOG_ROTATE_BYTES=' /root/vps-lib.sh | cut -d= -f2) || LOG_ROTATE_BYTES=10485760
LOG_SIZE=$(stat -c%s "$LOG" 2>/dev/null || echo 0)
if [ "$LOG_SIZE" -gt $LOG_ROTATE_BYTES ]; then mv "$LOG" "$LOG.old"; fi

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) === START ===" >> "$LOG"

# Step 1: Get config from MCP server
CONFIG=$(curl -s --connect-timeout 10 --max-time 15 \
  "$WATCHLIST_URL" -H "X-API-Key: $API_KEY" -H "User-Agent: VN-Market-VPS-Proxy/1.0")

if [ -z "$CONFIG" ]; then
  echo "$(date -u) FAIL: cannot reach MCP server" >> "$LOG"
  exit 1
fi

CODES=$(echo "$CONFIG" | jq -r '.codes | join(",")')
if [ -z "$CODES" ] || [ "$CODES" = "null" ]; then
  echo "$(date -u) FAIL: empty codes" >> "$LOG"
  exit 1
fi

COUNT=$(echo "$CONFIG" | jq '.codes | length')
echo "$(date -u) Config: $COUNT VN stocks" >> "$LOG"

# Step 2: Fetch VN stocks (1 batch API call)
VN_DATA=$(curl -s --connect-timeout 10 --max-time 20 \
  "https://bgapidatafeed.vps.com.vn/getliststockdata/$CODES" \
  -H "User-Agent: Mozilla/5.0")

VN_JSON="[]"
if [ -n "$VN_DATA" ] && [ "$VN_DATA" != "[]" ]; then
  VN_JSON=$(echo "$VN_DATA" | jq '[.[] | select(.lastPrice != null and .lastPrice > 0) | {
    code: .sym,
    price: .lastPrice,
    volume: .lot,
    change_pct: .changePc,
    ref_price: (if .r != null and .r != "" then (.r | tostring) else null end),
    high: .highPrice,
    low: .lowPrice,
    type: "stock"
  }]')
  VN_COUNT=$(echo "$VN_JSON" | jq 'length')
  echo "$(date -u) VN stocks: $VN_COUNT fetched" >> "$LOG"
else
  echo "$(date -u) WARN: VN stocks empty response" >> "$LOG"
fi

# Step 2b: Extract foreign flow from VPS data and push to /api/push-foreign-flow
# Idempotent — skipped if VN_DATA was empty or had no valid foreign flow fields.
if [ -n "$VN_DATA" ] && [ "$VN_DATA" != "[]" ]; then
  FF_JSON=$(echo "$VN_DATA" | jq --arg fbuy "$FBUY_FIELD" --arg fsell "$FSELL_FIELD" --arg froom "$FROOM_FIELD" \
    '[.[] | select(.sym != null) | {
      code: .sym,
      foreignBuyVol:  (if .[$fbuy]  != null then (.[$fbuy]  | tonumber) else 0 end),
      foreignSellVol: (if .[$fsell] != null then (.[$fsell] | tonumber) else 0 end),
      foreignRoom:    (if .[$froom] != null then (.[$froom] | tonumber) else 0 end)
    } | select(.foreignBuyVol > 0 or .foreignSellVol > 0 or .foreignRoom > 0)]' 2>/dev/null)
  FF_COUNT=$(echo "$FF_JSON" | jq 'length' 2>/dev/null || echo 0)
  if [ "$FF_COUNT" -gt 0 ]; then
    FF_RESP=$(curl -s --connect-timeout 10 --max-time 15 \
      -X POST "$FOREIGN_FLOW_URL" \
      -H "Content-Type: application/json" \
      -H "X-API-Key: $API_KEY" \
      -d "$FF_JSON")
    echo "$(date -u) FOREIGN_FLOW: $FF_COUNT items => $FF_RESP" >> "$LOG"
  else
    echo "$(date -u) FOREIGN_FLOW: no items with non-zero flow (fields: $FBUY_FIELD/$FSELL_FIELD/$FROOM_FIELD)" >> "$LOG"
  fi
fi

# Step 3: Fetch VN indices (CafeF — VNINDEX + HNXINDEX)
IDX_DATA=$(curl -s --connect-timeout 10 --max-time 10 \
  "https://banggia.cafef.vn/stockhandler.ashx?index=true" \
  -H "User-Agent: Mozilla/5.0")

IDX_JSON="[]"
if [ -n "$IDX_DATA" ] && [ "$IDX_DATA" != "[]" ]; then
  IDX_JSON=$(echo "$IDX_DATA" | jq '[.[] | select(.name == "VNINDEX" or .name == "HNXINDEX" or .name == "VN30" or .name == "UPINDEX") | {
    code: .name,
    price: (.index | gsub(","; "") | tonumber),
    volume: (.volume | gsub(","; "") | tonumber),
    change_pct: .percent,
    type: "index"
  }]' 2>/dev/null)
  IDX_COUNT=$(echo "$IDX_JSON" | jq 'length')
  echo "$(date -u) VN indices: $IDX_COUNT fetched" >> "$LOG"
else
  echo "$(date -u) WARN: VN indices empty" >> "$LOG"
fi

# Step 4: Fetch global indices (Yahoo Finance v8 chart — 1 call per index)
GLOBAL_JSON="["
GL_FIRST=1
GL_COUNT=0
GLOBAL_INDICES=$(echo "$CONFIG" | jq -r '.globalIndices | to_entries[] | "\(.key)=\(.value)"' 2>/dev/null)
if [ -n "$GLOBAL_INDICES" ]; then
  for ENTRY in $GLOBAL_INDICES; do
    NAME=$(echo "$ENTRY" | cut -d= -f1)
    SYMBOL=$(echo "$ENTRY" | cut -d= -f2)
    ENCODED=$(echo "$SYMBOL" | sed 's/\^/%5E/g')
    YF=$(curl -s --connect-timeout 5 --max-time 8 \
      "https://query1.finance.yahoo.com/v8/finance/chart/${ENCODED}?interval=1d&range=1d" \
      -H "User-Agent: Mozilla/5.0")
    PRICE=$(echo "$YF" | jq -r '.chart.result[0].meta.regularMarketPrice // empty' 2>/dev/null)
    if [ -n "$PRICE" ] && [ "$PRICE" != "null" ]; then
      PREV=$(echo "$YF" | jq -r '.chart.result[0].meta.chartPreviousClose // 0' 2>/dev/null)
      CHG_PCT="0"
      if [ "$PREV" != "0" ] && [ "$PREV" != "null" ]; then
        CHG_PCT=$(echo "scale=2; ($PRICE - $PREV) / $PREV * 100" | bc 2>/dev/null || echo "0")
      fi
      if [ $GL_FIRST -eq 0 ]; then GLOBAL_JSON="$GLOBAL_JSON,"; fi
      GLOBAL_JSON="${GLOBAL_JSON}{\"code\":\"$SYMBOL\",\"price\":$PRICE,\"volume\":0,\"change_pct\":\"$CHG_PCT\",\"type\":\"global_index\"}"
      GL_FIRST=0
      GL_COUNT=$((GL_COUNT + 1))
    fi
  done
fi
GLOBAL_JSON="$GLOBAL_JSON]"
echo "$(date -u) Global indices: $GL_COUNT fetched" >> "$LOG"

# Step 5: Merge all and push
ALL_JSON=$(echo "$VN_JSON $IDX_JSON $GLOBAL_JSON" | jq -s 'add | [.[] | select(. != null)]')
TOTAL=$(echo "$ALL_JSON" | jq 'length')

if [ "$TOTAL" = "0" ]; then
  echo "$(date -u) SKIP: nothing to push" >> "$LOG"
  exit 0
fi

RESP=$(curl -s --connect-timeout 10 --max-time 15 \
  -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d "$ALL_JSON")
echo "$(date -u) PUSH: $TOTAL items → $RESP" >> "$LOG"
