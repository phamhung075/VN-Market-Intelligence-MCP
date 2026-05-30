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
#    FOREIGN_FLOW_FBUY_FIELD   field name for foreign buy volume   (default: fBVol)
#    FOREIGN_FLOW_FSELL_FIELD  field name for foreign sell volume  (default: fSVolume)
#    FOREIGN_FLOW_ROOM_FIELD   field name for remaining buy room   (default: fRoom)
#
#  Log:
#    /var/log/vn-foreign-flow.log  — rotated at 10 MB
#
# ─────────────────────────────────────────────────────────────────────────────

set -e

FOREIGN_FLOW_API_URL="${FOREIGN_FLOW_API_URL:-__MCP_BASE__/api/push-foreign-flow}"
WATCHLIST_URL="${WATCHLIST_URL:-__MCP_BASE__/api/watchlist}"
API_KEY="${API_KEY:-__API_KEY__}"
LOG="/var/log/vn-foreign-flow.log"

# Diagnostic flags (control verbosity of diagnostic output)
DEBUG_MODE="${DEBUG_MODE:-0}"
PAYLOAD_SIZE_THRESHOLD="${PAYLOAD_SIZE_THRESHOLD:-50000}"  # bytes — warn if larger

# Configurable foreign flow field names
# API field audit 2026-05-30: bgapidatafeed.vps.com.vn returns fBVol/fSVolume/fRoom
# (NOT fBuyVol/fSellVol — those names do NOT exist in the API; the script was using
# wrong defaults, producing foreignBuyVol=0/foreignSellVol=0 fleet-wide, causing
# get_foreign_flow to return "never collected" for all tickers. Fix: correct defaults.)
FBUY_FIELD="${FOREIGN_FLOW_FBUY_FIELD:-fBVol}"
FSELL_FIELD="${FOREIGN_FLOW_FSELL_FIELD:-fSVolume}"
FROOM_FIELD="${FOREIGN_FLOW_ROOM_FIELD:-fRoom}"

# Helper: diagnostic log function
log_diagnostic() {
  local level="$1"
  local msg="$2"
  local timestamp=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
  echo "[$timestamp] [$level] $msg" >> "$LOG"
  if [ "$DEBUG_MODE" = "1" ]; then
    echo "[$timestamp] [$level] $msg" >&2
  fi
}

# Log rotation — keep under 10 MB
# Source shared constants (LOG_ROTATE_BYTES) from vps-lib.sh
# shellcheck source=/root/vps-lib.sh
LOG_ROTATE_BYTES=10485760  # default 10 MB
if [ -f /root/vps-lib.sh ]; then
  _lib_val=$(grep '^LOG_ROTATE_BYTES=' /root/vps-lib.sh | cut -d= -f2)
  [ -n "$_lib_val" ] && LOG_ROTATE_BYTES="$_lib_val"
fi
LOG_SIZE=$(stat -c%s "$LOG" 2>/dev/null || echo 0)
if [ "$LOG_SIZE" -gt "$LOG_ROTATE_BYTES" ]; then
  mv "$LOG" "$LOG.old"
  log_diagnostic "INFO" "Log rotated (was $LOG_SIZE bytes)"
fi

log_diagnostic "INFO" "=== FOREIGN_FLOW FETCH START ==="

# Step 1: Get watchlist codes from MCP server
CONFIG_START=$(date +%s%N)
CONFIG=$(curl -s --connect-timeout 10 --max-time 15 \
  "$WATCHLIST_URL" \
  -H "X-API-Key: $API_KEY" \
  -H "User-Agent: VN-Market-VPS-Proxy/1.0" 2>&1)
CONFIG_END=$(date +%s%N)
CONFIG_TIME_MS=$(( (CONFIG_END - CONFIG_START) / 1000000 ))

if [ -z "$CONFIG" ]; then
  log_diagnostic "ERROR" "WATCHLIST_FETCH failed: cannot reach MCP server ($WATCHLIST_URL)"
  exit 1
fi

log_diagnostic "DEBUG" "WATCHLIST_FETCH took ${CONFIG_TIME_MS}ms, response size: ${#CONFIG} bytes"

CODES=$(echo "$CONFIG" | jq -r '.codes | join(",")' 2>/dev/null)
if [ -z "$CODES" ] || [ "$CODES" = "null" ]; then
  log_diagnostic "ERROR" "WATCHLIST_PARSE failed: empty codes from watchlist"
  exit 1
fi

COUNT=$(echo "$CONFIG" | jq '.codes | length' 2>/dev/null || echo 0)
log_diagnostic "INFO" "Watchlist loaded: $COUNT codes. Fields: $FBUY_FIELD/$FSELL_FIELD/$FROOM_FIELD"

# Step 2: Fetch VN stock data from VPS batch API
# HARDENED: increased timeout from 20s to 60s to allow large payloads to complete (Task 1566_c)
VN_FETCH_START=$(date +%s%N)
VN_DATA=$(curl -s --connect-timeout 10 --max-time 60 \
  "https://bgapidatafeed.vps.com.vn/getliststockdata/$CODES" \
  -H "User-Agent: Mozilla/5.0" 2>&1)
VN_FETCH_END=$(date +%s%N)
VN_FETCH_TIME_MS=$(( (VN_FETCH_END - VN_FETCH_START) / 1000000 ))
VN_DATA_SIZE=${#VN_DATA}

log_diagnostic "DEBUG" "VPS_API_FETCH took ${VN_FETCH_TIME_MS}ms, response size: ${VN_DATA_SIZE} bytes"

# Detect truncation: payload should end with ]
if [ ${VN_DATA_SIZE} -gt 0 ] && [[ ! "$VN_DATA" =~ \]\s*$ ]]; then
  log_diagnostic "WARN" "VPS_API_TRUNCATION_DETECTED: response size ${VN_DATA_SIZE} bytes but no closing bracket"
fi

if [ -z "$VN_DATA" ] || [ "$VN_DATA" = "[]" ]; then
  log_diagnostic "WARN" "VPS_API_EMPTY: API returned empty data"
  exit 0
fi

# Warn if payload is suspiciously large (potential memory issue on MCP side)
if [ ${VN_DATA_SIZE} -gt ${PAYLOAD_SIZE_THRESHOLD} ]; then
  log_diagnostic "WARN" "VPS_API_LARGE_PAYLOAD: ${VN_DATA_SIZE} bytes (threshold: ${PAYLOAD_SIZE_THRESHOLD})"
fi

RAW_COUNT=$(echo "$VN_DATA" | jq 'length' 2>/dev/null || echo 0)
log_diagnostic "INFO" "VPS_API_FETCH_SUCCESS: $RAW_COUNT raw items, ${VN_DATA_SIZE} bytes"

# Step 3: Extract foreign flow fields and filter out all-zero rows
# jq hardening: use (// 0) instead of tonumber to handle both string and numeric API responses
JQ_START=$(date +%s%N)
FF_JSON=$(echo "$VN_DATA" | jq \
  --arg fbuy  "$FBUY_FIELD" \
  --arg fsell "$FSELL_FIELD" \
  --arg froom "$FROOM_FIELD" \
  '[.[] | select(.sym != null) | {
    code:           .sym,
    foreignBuyVol:  ((.[$fbuy]  // 0) | if type == "string" then tonumber else . end),
    foreignSellVol: ((.[$fsell] // 0) | if type == "string" then tonumber else . end),
    foreignRoom:    ((.[$froom] // 0) | if type == "string" then tonumber else . end)
  } | select(.foreignBuyVol > 0 or .foreignSellVol > 0 or .foreignRoom > 0)]' 2>&1)
JQ_END=$(date +%s%N)
JQ_TIME_MS=$(( (JQ_END - JQ_START) / 1000000 ))

# Guard: jq error produces empty/null FF_JSON — exit before sending truncated body
if [ -z "$FF_JSON" ] || [ "$FF_JSON" = "null" ]; then
  log_diagnostic "ERROR" "JQ_TRANSFORM_FAILED: jq produced empty output (may indicate invalid input JSON)"
  exit 0
fi

log_diagnostic "DEBUG" "JQ_TRANSFORM took ${JQ_TIME_MS}ms"

FF_JSON_SIZE=${#FF_JSON}
FF_COUNT=$(echo "$FF_JSON" | jq 'length' 2>/dev/null || echo 0)

if [ "$FF_COUNT" -eq 0 ]; then
  log_diagnostic "INFO" "JQ_NO_ITEMS: no items with non-zero foreign flow (fields may be absent or market closed)"
  exit 0
fi

log_diagnostic "INFO" "JQ_TRANSFORM_SUCCESS: extracted $FF_COUNT items, payload size: ${FF_JSON_SIZE} bytes"

# Step 4: Push to MCP server
PUSH_START=$(date +%s%N)
PUSH_HTTP_CODE=$(curl -s -o PUSH_RESPONSE.tmp -w "%{http_code}" \
  -X POST "$FOREIGN_FLOW_API_URL" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  --max-time 15 \
  -d "$FF_JSON" 2>&1)
PUSH_END=$(date +%s%N)
PUSH_TIME_MS=$(( (PUSH_END - PUSH_START) / 1000000 ))

# Read response body for diagnostics
PUSH_RESP=$(cat PUSH_RESPONSE.tmp 2>/dev/null || echo "")
rm -f PUSH_RESPONSE.tmp

log_diagnostic "INFO" "PUSH_REQUEST: $FF_COUNT items, payload size ${FF_JSON_SIZE} bytes, took ${PUSH_TIME_MS}ms"
log_diagnostic "INFO" "PUSH_RESPONSE: HTTP $PUSH_HTTP_CODE, body: $PUSH_RESP"

if [ "$PUSH_HTTP_CODE" != "200" ]; then
  log_diagnostic "ERROR" "PUSH_FAILED: HTTP $PUSH_HTTP_CODE (expected 200). Response: $PUSH_RESP"
  exit 1
fi

log_diagnostic "INFO" "=== FOREIGN_FLOW FETCH COMPLETE (success) ==="
