#!/bin/bash
# run-price-debug.sh — Manual price fetch debug trigger for VPS
#
# Usage:
#   ./run-price-debug.sh [--ticker FPT] [--verbose] [--dry-run]
#
# Args:
#   --ticker CODE   Limit fetch reporting to a specific stock ticker (repeatable)
#   --verbose       Print each HTTP request, response status, payload size
#   --dry-run       Print what would happen without actually fetching or pushing
#
# Logs to: /tmp/price-debug-<timestamp>.log

set -euo pipefail

# ── Config (same vars used by fetch-prices.sh) ────────────────────────────────
API_URL="${MCP_BASE_URL:-__MCP_BASE__}/api/push-prices"
WATCHLIST_URL="${MCP_BASE_URL:-__MCP_BASE__}/api/watchlist"
API_KEY="${VPS_PUSH_API_KEY:-__API_KEY__}"

# Configurable foreign flow field names
FBUY_FIELD="${FOREIGN_FLOW_FBUY_FIELD:-fBuyVol}"
FSELL_FIELD="${FOREIGN_FLOW_FSELL_FIELD:-fSellVol}"
FROOM_FIELD="${FOREIGN_FLOW_ROOM_FIELD:-fRoom}"

# ── Log setup ─────────────────────────────────────────────────────────────────
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
LOG="/tmp/price-debug-${TIMESTAMP}.log"
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

log "=== PRICE DEBUG START ==="
log "verbose=${VERBOSE} dry_run=${DRY_RUN} tickers=(${TICKERS[*]:-all})"
log "Log file: ${LOG}"

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

if $VERBOSE; then
  log "Codes: ${CODES}"
fi

if $DRY_RUN; then
  log "DRY RUN: would fetch https://bgapidatafeed.vps.com.vn/getliststockdata/${CODES}"
  log "DRY RUN: would fetch CafeF indices (VNINDEX, HNXINDEX, VN30, UPINDEX)"
  log "DRY RUN: would push to ${API_URL}"
  if [ "${#TICKERS[@]}" -gt 0 ]; then
    log "Ticker filter: ${TICKERS[*]} (would filter output after fetch)"
  fi
  log "=== PRICE DEBUG DONE (dry run) ==="
  exit 0
fi

# ── Step 2: Fetch VN stock data ───────────────────────────────────────────────
log "Fetching VN stocks from bgapidatafeed.vps.com.vn ..."
T0=$(date -u +%s%3N)

VN_DATA=$(curl -s --connect-timeout 10 --max-time 20 \
  "https://bgapidatafeed.vps.com.vn/getliststockdata/$CODES" \
  -H "User-Agent: Mozilla/5.0")

DUR=$(( $(date -u +%s%3N) - T0 ))
VN_SIZE=${#VN_DATA}

if [ -z "$VN_DATA" ] || [ "$VN_DATA" = "[]" ]; then
  log "WARN: VN stocks API returned empty response (dur=${DUR}ms)"
else
  VN_COUNT=$(echo "$VN_DATA" | jq 'length' 2>/dev/null || echo 0)
  log "VN stocks: ${VN_COUNT} items fetched (${VN_SIZE}B, dur=${DUR}ms)"
fi

if $VERBOSE; then
  log "Response size: ${VN_SIZE} bytes"
  if [ "${#TICKERS[@]}" -gt 0 ]; then
    for T in "${TICKERS[@]}"; do
      ROW=$(echo "$VN_DATA" | jq -c --arg t "$T" '.[] | select(.sym == $t)' 2>/dev/null || echo "NOT_FOUND")
      log "  ${T}: ${ROW}"
    done
  fi
fi

# ── Step 3: Fetch VN indices ──────────────────────────────────────────────────
log "Fetching VN indices from CafeF ..."
IDX_DATA=$(curl -s --connect-timeout 10 --max-time 10 \
  "https://banggia.cafef.vn/stockhandler.ashx?index=true" \
  -H "User-Agent: Mozilla/5.0")

if [ -n "$IDX_DATA" ] && [ "$IDX_DATA" != "[]" ]; then
  IDX_COUNT=$(echo "$IDX_DATA" | jq '[.[] | select(.name == "VNINDEX" or .name == "HNXINDEX" or .name == "VN30" or .name == "UPINDEX")] | length' 2>/dev/null || echo 0)
  log "VN indices: ${IDX_COUNT} items"
  if $VERBOSE; then
    echo "$IDX_DATA" | jq -c '[.[] | select(.name == "VNINDEX" or .name == "HNXINDEX" or .name == "VN30" or .name == "UPINDEX")]' 2>/dev/null | while read -r line; do log "  $line"; done
  fi
else
  log "WARN: VN indices empty response"
fi

log "=== PRICE DEBUG DONE ==="
log "Full log at: ${LOG}"
