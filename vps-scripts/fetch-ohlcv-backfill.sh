#!/bin/bash
# VN Market OHLCV History Backfill — Task 1351 / OHLCV-BACKFILL-P0
#
# Script invoked by ohlcv-backfill-poll.sh when ohlcv_backfill_queue has pending
# rows (done=0). Fetches ~2yr (730 days default) of daily OHLCV from TCBS chart
# API for every ticker in the France server watchlist, then pushes each ticker's
# bars to POST /api/push-ohlcv-history.
#
# Usage:
#   OHLCV_API_URL=https://example.com/api/push-ohlcv-history \
#   WATCHLIST_URL=https://example.com/api/watchlist \
#   API_KEY=your-secret \
#   bash vps-scripts/fetch-ohlcv-backfill.sh
#
# On VPS (localhost:3001 for France server proxy):
#   OHLCV_API_URL=http://localhost:3001/api/push-ohlcv-history \
#   WATCHLIST_URL=http://localhost:3001/api/watchlist \
#   API_KEY="$VPS_PUSH_API_KEY" \
#   bash /root/vps-scripts/fetch-ohlcv-backfill.sh
#
# ── ENV VAR REFERENCE ────────────────────────────────────────────────────────
#
#  Required:
#    OHLCV_API_URL   Full URL for push endpoint
#                    e.g. https://example.com/api/push-ohlcv-history
#    WATCHLIST_URL   Full URL to retrieve watchlist codes
#                    e.g. https://example.com/api/watchlist
#    API_KEY         X-API-Key bearer token (VPS_PUSH_API_KEY)
#
#  Optional:
#    DAYS            Number of trading days to backfill (default: 730 = ~2yr)
#    SLEEP_BETWEEN   Seconds to sleep between tickers (default: 1)
#
# ── TCBS chart API ───────────────────────────────────────────────────────────
#   GET https://apipubaws.tcbs.com.vn/stock-insight/v2/stock/bars-long-term
#     ?ticker=VNM&type=stock&resolution=D&from=<unix>&to=<unix>
#   Returns JSON: { data: [{ tradingDate, open, high, low, close, volume }, ...] }
#   Prices are in full VND — do NOT multiply by 1000.
#
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

OHLCV_API_URL="${OHLCV_API_URL:-__MCP_BASE__/api/push-ohlcv-history}"
WATCHLIST_URL="${WATCHLIST_URL:-__MCP_BASE__/api/watchlist}"
API_KEY="${API_KEY:-__API_KEY__}"
DAYS="${DAYS:-730}"
SLEEP_BETWEEN="${SLEEP_BETWEEN:-1}"

TCBS_BASE="https://apipubaws.tcbs.com.vn/stock-insight/v2/stock/bars-long-term"

# Timestamp helpers
ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }

echo "$(ts) === OHLCV BACKFILL START (days=${DAYS}) ==="

# ── Step 1: Fetch watchlist ──────────────────────────────────────────────────

WATCHLIST_RESP=$(curl -s --connect-timeout 15 --max-time 20 \
  "$WATCHLIST_URL" \
  -H "X-API-Key: $API_KEY" \
  -H "User-Agent: VN-Market-VPS-Proxy/1.0")

if [ -z "$WATCHLIST_RESP" ]; then
  echo "$(ts) FAIL: cannot reach MCP server ($WATCHLIST_URL)" >&2
  exit 1
fi

CODES=$(echo "$WATCHLIST_RESP" | jq -r '.codes[]' 2>/dev/null)
if [ -z "$CODES" ]; then
  echo "$(ts) FAIL: empty codes from watchlist" >&2
  exit 1
fi

COUNT=$(echo "$CODES" | wc -l | tr -d ' ')
echo "$(ts) Watchlist: $COUNT tickers to backfill"

# ── Step 2: Compute time range ───────────────────────────────────────────────

TO_TS=$(date -u +%s)
FROM_TS=$(( TO_TS - DAYS * 86400 ))

echo "$(ts) Time range: from $(date -u -d "@${FROM_TS}" +%Y-%m-%d 2>/dev/null || date -u -r "${FROM_TS}" +%Y-%m-%d) to $(date -u -d "@${TO_TS}" +%Y-%m-%d 2>/dev/null || date -u -r "${TO_TS}" +%Y-%m-%d)"

# ── Step 3: Fetch + push each ticker ────────────────────────────────────────

TOTAL_OK=0
TOTAL_SKIP=0
TOTAL_ERR=0

while IFS= read -r TICKER; do
  [ -z "$TICKER" ] && continue

  # Fetch OHLCV from TCBS
  TCBS_RESP=$(curl -s --connect-timeout 10 --max-time 20 \
    "${TCBS_BASE}?ticker=${TICKER}&type=stock&resolution=D&from=${FROM_TS}&to=${TO_TS}" \
    -H "User-Agent: Mozilla/5.0 (compatible; VN-Market-Backfill/1.0)" \
    -H "Referer: https://tcinvest.tcbs.com.vn/" 2>/dev/null || echo "")

  if [ -z "$TCBS_RESP" ]; then
    echo "$(ts) WARN [$TICKER]: TCBS returned empty response — skipping"
    TOTAL_SKIP=$(( TOTAL_SKIP + 1 ))
    sleep "$SLEEP_BETWEEN"
    continue
  fi

  # Check for error response
  HAS_ERROR=$(echo "$TCBS_RESP" | jq -r '.code // empty' 2>/dev/null || echo "")
  if [ -n "$HAS_ERROR" ] && [ "$HAS_ERROR" != "null" ] && [ "$HAS_ERROR" != "200" ]; then
    echo "$(ts) WARN [$TICKER]: TCBS error code=$HAS_ERROR — skipping"
    TOTAL_SKIP=$(( TOTAL_SKIP + 1 ))
    sleep "$SLEEP_BETWEEN"
    continue
  fi

  # Extract bars — tradingDate is YYYY-MM-DD string, prices in full VND
  BARS=$(echo "$TCBS_RESP" | jq -c '[
    .data[]? |
    select(.open != null and .close != null) |
    {
      date:   (.tradingDate | split("T")[0]),
      open:   (.open   | tonumber),
      high:   (.high   | tonumber),
      low:    (.low    | tonumber),
      close:  (.close  | tonumber),
      volume: (.volume | tonumber)
    }
  ]' 2>/dev/null || echo "[]")

  BAR_COUNT=$(echo "$BARS" | jq 'length' 2>/dev/null || echo 0)

  if [ "$BAR_COUNT" -eq 0 ]; then
    echo "$(ts) SKIP [$TICKER]: 0 bars from TCBS (market closed or index ticker)"
    TOTAL_SKIP=$(( TOTAL_SKIP + 1 ))
    sleep "$SLEEP_BETWEEN"
    continue
  fi

  # Build push payload
  PAYLOAD=$(jq -n --arg code "$TICKER" --argjson bars "$BARS" '{"code": $code, "bars": $bars}')

  # Push to France server
  PUSH_RESP=$(curl -s --connect-timeout 10 --max-time 20 \
    -X POST "$OHLCV_API_URL" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: $API_KEY" \
    -d "$PAYLOAD" 2>/dev/null || echo "")

  INSERTED=$(echo "$PUSH_RESP" | jq -r '.inserted // "?"' 2>/dev/null || echo "?")
  OK=$(echo "$PUSH_RESP" | jq -r '.ok // false' 2>/dev/null || echo "false")

  if [ "$OK" = "true" ]; then
    echo "$(ts) OK [$TICKER]: $BAR_COUNT bars fetched, $INSERTED inserted"
    TOTAL_OK=$(( TOTAL_OK + 1 ))
  else
    echo "$(ts) ERR [$TICKER]: push failed — response: $PUSH_RESP"
    TOTAL_ERR=$(( TOTAL_ERR + 1 ))
  fi

  sleep "$SLEEP_BETWEEN"
done <<< "$CODES"

# ── Summary ──────────────────────────────────────────────────────────────────

echo "$(ts) === OHLCV BACKFILL DONE: ok=$TOTAL_OK skip=$TOTAL_SKIP err=$TOTAL_ERR ==="
