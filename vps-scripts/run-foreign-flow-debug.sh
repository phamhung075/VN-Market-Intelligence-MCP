#!/bin/bash
# run-foreign-flow-debug.sh — Manual foreign flow fetch debug trigger for VPS
#
# Usage:
#   ./run-foreign-flow-debug.sh [--ticker FPT] [--verbose] [--dry-run]
#
# Args:
#   --ticker CODE   Limit fetch reporting to a specific stock ticker (repeatable)
#   --verbose       Print HTTP details, payload size, jq transform, DB state before/after
#   --dry-run       Print what would happen without actually fetching or pushing
#
# Logs to: /tmp/foreign-flow-debug-<timestamp>.log

set -euo pipefail

# ── Config (same vars used by fetch-foreign-flow.sh) ─────────────────────────
FOREIGN_FLOW_API_URL="${FOREIGN_FLOW_API_URL:-__MCP_BASE__/api/push-foreign-flow}"
WATCHLIST_URL="${WATCHLIST_URL:-__MCP_BASE__/api/watchlist}"
API_KEY="${API_KEY:-__API_KEY__}"

# Configurable foreign flow field names
# API field audit 2026-05-30: bgapidatafeed.vps.com.vn returns fBVol/fSVolume/fRoom
# (NOT fBuyVol/fSellVol — those names do NOT exist in the API.)
FBUY_FIELD="${FOREIGN_FLOW_FBUY_FIELD:-fBVol}"
FSELL_FIELD="${FOREIGN_FLOW_FSELL_FIELD:-fSVolume}"
FROOM_FIELD="${FOREIGN_FLOW_ROOM_FIELD:-fRoom}"

# ── Log setup ─────────────────────────────────────────────────────────────────
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
LOG="/tmp/foreign-flow-debug-${TIMESTAMP}.log"
touch "$LOG"

log() {
  local msg="$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"
  echo "$msg" | tee -a "$LOG"
}

# ── Argument parsing ──────────────────────────────────────────────────────────
TICKERS=()
VERBOSE=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ticker)
      shift
      TICKERS+=("$1")
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      log "WARN: unknown arg $1 — skipping"
      shift
      ;;
  esac
done

log "=== FOREIGN FLOW DEBUG START ==="
log "verbose=${VERBOSE} dry_run=${DRY_RUN} tickers=(${TICKERS[*]:-all})"
log "Log file: ${LOG}"
log "Field names: ${FBUY_FIELD} / ${FSELL_FIELD} / ${FROOM_FIELD}"

# ── Step 1: Get watchlist from MCP server ────────────────────────────────────
log "Fetching watchlist from ${WATCHLIST_URL} ..."

CONFIG=$(curl -s --connect-timeout 10 --max-time 15 \
  "$WATCHLIST_URL" \
  -H "X-API-Key: $API_KEY" \
  -H "User-Agent: VN-Market-VPS-Debug/1.0")

if [ -z "$CONFIG" ]; then
  log "FAIL: cannot reach MCP server at ${WATCHLIST_URL}"
  exit 1
fi

CODES=$(echo "$CONFIG" | jq -r '.codes | join(",")' 2>/dev/null || echo "")
if [ -z "$CODES" ] || [ "$CODES" = "null" ]; then
  log "FAIL: empty codes from watchlist"
  exit 1
fi

COUNT=$(echo "$CONFIG" | jq '.codes | length' 2>/dev/null || echo 0)
log "Watchlist: ${COUNT} codes"

if $DRY_RUN; then
  log "DRY RUN: would fetch https://bgapidatafeed.vps.com.vn/getliststockdata/${CODES}"
  log "DRY RUN: would extract fields ${FBUY_FIELD}/${FSELL_FIELD}/${FROOM_FIELD} via jq"
  log "DRY RUN: would filter rows where at least one flow field > 0"
  if [ "${#TICKERS[@]}" -gt 0 ]; then
    log "DRY RUN: ticker filter active: ${TICKERS[*]}"
  fi
  log "DRY RUN: would push to ${FOREIGN_FLOW_API_URL}"
  log "=== FOREIGN FLOW DEBUG DONE (dry run) ==="
  exit 0
fi

# ── Step 2: Fetch VN stock data ───────────────────────────────────────────────
log "Fetching VN stocks from bgapidatafeed.vps.com.vn ..."
T0=$(date -u +%s%3N)

VN_DATA=$(curl -s --connect-timeout 10 --max-time 60 \
  "https://bgapidatafeed.vps.com.vn/getliststockdata/$CODES" \
  -H "User-Agent: Mozilla/5.0" 2>&1)

DUR=$(( $(date -u +%s%3N) - T0 ))
VN_DATA_SIZE=${#VN_DATA}

log "VPS API response: ${VN_DATA_SIZE}B, dur=${DUR}ms"

if [ -z "$VN_DATA" ] || [ "$VN_DATA" = "[]" ]; then
  log "WARN: VPS API returned empty data"
  exit 0
fi

RAW_COUNT=$(echo "$VN_DATA" | jq 'length' 2>/dev/null || echo 0)
log "Raw items: ${RAW_COUNT}"

# ── Step 3: Extract foreign flow fields ──────────────────────────────────────
log "Extracting flow fields (${FBUY_FIELD}/${FSELL_FIELD}/${FROOM_FIELD}) ..."

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

FF_COUNT=$(echo "$FF_JSON" | jq 'length' 2>/dev/null || echo 0)
FF_JSON_SIZE=${#FF_JSON}
log "Extracted: ${FF_COUNT} items with non-zero flow (${FF_JSON_SIZE}B)"

if $VERBOSE; then
  if [ "${#TICKERS[@]}" -gt 0 ]; then
    log "Ticker filter results:"
    for T in "${TICKERS[@]}"; do
      ROW=$(echo "$FF_JSON" | jq -c --arg t "$T" '.[] | select(.code == $t)' 2>/dev/null || echo "NOT_FOUND")
      log "  ${T}: ${ROW}"
    done
  else
    log "Top 5 items (by foreignBuyVol):"
    echo "$FF_JSON" | jq -c '[.[] | .] | sort_by(-.foreignBuyVol) | .[0:5][]' 2>/dev/null | while read -r line; do
      log "  $line"
    done
  fi
fi

if [ "$FF_COUNT" -eq 0 ]; then
  log "No items with non-zero flow — market may be closed or field names misconfigured"
  log "  Expected field names: ${FBUY_FIELD} / ${FSELL_FIELD} / ${FROOM_FIELD}"
  log "  Override via FOREIGN_FLOW_FBUY_FIELD / FOREIGN_FLOW_FSELL_FIELD / FOREIGN_FLOW_ROOM_FIELD env vars"
  log "=== FOREIGN FLOW DEBUG DONE (no items) ==="
  exit 0
fi

# ── Step 4: Push to MCP ───────────────────────────────────────────────────────
log "Pushing ${FF_COUNT} items to ${FOREIGN_FLOW_API_URL} ..."

HTTP_CODE=$(curl -s -o /tmp/ff_push_resp.tmp -w "%{http_code}" \
  -X POST "$FOREIGN_FLOW_API_URL" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -H "User-Agent: VN-Market-VPS-Debug/1.0" \
  --max-time 15 \
  -d "$FF_JSON" 2>/dev/null || echo "000")

PUSH_RESP=$(cat /tmp/ff_push_resp.tmp 2>/dev/null || echo "")
rm -f /tmp/ff_push_resp.tmp

log "Push: HTTP ${HTTP_CODE}, response: ${PUSH_RESP}"

if [ "$HTTP_CODE" != "200" ]; then
  log "FAIL: push returned HTTP ${HTTP_CODE}"
  exit 1
fi

log "=== FOREIGN FLOW DEBUG DONE: pushed ${FF_COUNT} items ==="
log "Full log at: ${LOG}"
