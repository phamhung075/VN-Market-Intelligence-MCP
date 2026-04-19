#!/bin/bash
# VN Market Foreign Flow Proxy — auto-deployed (Task 1142)
#
# Standalone script that fetches all watchlist stocks from VPS batch API and
# extracts foreign investor flow data (buy volume, sell volume, remaining room),
# then pushes to MCP server /api/push-foreign-flow.
#
# Designed to run alongside (or independently of) fetch-prices.sh.
# Script is idempotent — safe to call multiple times per minute.
#
# ── ENV VAR REFERENCE ────────────────────────────────────────────────────────
#
#  Required (injected by deploy-vps-proxy.sh):
#    FOREIGN_FLOW_API_URL   Full URL for push endpoint
#                           e.g. https://zenmidi.com/api/push-foreign-flow
#    WATCHLIST_URL          Full URL to retrieve watchlist codes
#                           e.g. https://zenmidi.com/api/watchlist
#    API_KEY                X-API-Key bearer token (VPS_PUSH_API_KEY)
#
#  Configurable field names (override if VPS API renames fields):
#    FOREIGN_FLOW_FBUY_FIELD   field name for foreign buy volume   (default: fBuyVol)
#    FOREIGN_FLOW_FSELL_FIELD  field name for foreign sell volume  (default: fSellVol)
#    FOREIGN_FLOW_ROOM_FIELD   field name for remaining buy room   (default: fRoom)
#
#  Log:
#    /var/log/vn-foreign-flow.log  — rotated at 10 MB
#
# ─────────────────────────────────────────────────────────────────────────────

FOREIGN_FLOW_API_URL="${FOREIGN_FLOW_API_URL:-__MCP_BASE__/api/push-foreign-flow}"
WATCHLIST_URL="${WATCHLIST_URL:-__MCP_BASE__/api/watchlist}"
API_KEY="${API_KEY:-__API_KEY__}"
LOG="/var/log/vn-foreign-flow.log"

# Configurable foreign flow field names
FBUY_FIELD="${FOREIGN_FLOW_FBUY_FIELD:-fBuyVol}"
FSELL_FIELD="${FOREIGN_FLOW_FSELL_FIELD:-fSellVol}"
FROOM_FIELD="${FOREIGN_FLOW_ROOM_FIELD:-fRoom}"

# Log rotation — keep under 10 MB
LOG_SIZE=$(stat -c%s "$LOG" 2>/dev/null || echo 0)
if [ "$LOG_SIZE" -gt 10485760 ]; then mv "$LOG" "$LOG.old"; fi

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) === FOREIGN_FLOW START ===" >> "$LOG"

# Step 1: Get watchlist codes from MCP server
CONFIG=$(curl -s --connect-timeout 10 --max-time 15 \
  "$WATCHLIST_URL" \
  -H "X-API-Key: $API_KEY" \
  -H "User-Agent: VN-Market-VPS-Proxy/1.0")

if [ -z "$CONFIG" ]; then
  echo "$(date -u) FAIL: cannot reach MCP server ($WATCHLIST_URL)" >> "$LOG"
  exit 1
fi

CODES=$(echo "$CONFIG" | jq -r '.codes | join(",")' 2>/dev/null)
if [ -z "$CODES" ] || [ "$CODES" = "null" ]; then
  echo "$(date -u) FAIL: empty codes from watchlist" >> "$LOG"
  exit 1
fi

COUNT=$(echo "$CONFIG" | jq '.codes | length' 2>/dev/null || echo 0)
echo "$(date -u) Watchlist: $COUNT codes. Fields: $FBUY_FIELD/$FSELL_FIELD/$FROOM_FIELD" >> "$LOG"

# Step 2: Fetch VN stock data from VPS batch API
VN_DATA=$(curl -s --connect-timeout 10 --max-time 20 \
  "https://bgapidatafeed.vps.com.vn/getliststockdata/$CODES" \
  -H "User-Agent: Mozilla/5.0")

if [ -z "$VN_DATA" ] || [ "$VN_DATA" = "[]" ]; then
  echo "$(date -u) WARN: VPS API returned empty data" >> "$LOG"
  exit 0
fi

RAW_COUNT=$(echo "$VN_DATA" | jq 'length' 2>/dev/null || echo 0)
echo "$(date -u) VPS API: $RAW_COUNT raw items received" >> "$LOG"

# Step 3: Extract foreign flow fields and filter out all-zero rows
# jq hardening: use (// 0) instead of tonumber to handle both string and numeric API responses
FF_JSON=$(echo "$VN_DATA" | jq \
  --arg fbuy  "$FBUY_FIELD" \
  --arg fsell "$FSELL_FIELD" \
  --arg froom "$FROOM_FIELD" \
  '[.[] | select(.sym != null) | {
    code:           .sym,
    foreignBuyVol:  ((.[$fbuy]  // 0) | if type == "string" then tonumber else . end),
    foreignSellVol: ((.[$fsell] // 0) | if type == "string" then tonumber else . end),
    foreignRoom:    ((.[$froom] // 0) | if type == "string" then tonumber else . end)
  } | select(.foreignBuyVol > 0 or .foreignSellVol > 0 or .foreignRoom > 0)]' 2>/dev/null)

# Guard: jq error produces empty/null FF_JSON — exit before sending truncated body
if [ -z "$FF_JSON" ]; then
  echo "$(date -u) WARN: jq transform failed or produced empty output — skipping push" >> "$LOG"
  exit 0
fi

FF_COUNT=$(echo "$FF_JSON" | jq 'length' 2>/dev/null || echo 0)

if [ "$FF_COUNT" -eq 0 ]; then
  echo "$(date -u) SKIP: no items with non-zero foreign flow (fields may be absent or market closed)" >> "$LOG"
  exit 0
fi

# Step 4: Push to MCP server
RESP=$(curl -s --connect-timeout 10 --max-time 15 \
  -X POST "$FOREIGN_FLOW_API_URL" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d "$FF_JSON")

echo "$(date -u) PUSH: $FF_COUNT items => $RESP" >> "$LOG"
