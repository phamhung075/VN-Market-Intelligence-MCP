#!/bin/bash
# VN Market OHLCV History Backfill — Task 1351 / OHLCV-BACKFILL-P0
# Hardened: OHLCV-DEPTH-SUBTASK-A (2026-06-30)
#
# Changes from pre-hardening version:
#   API-SRC: TCBS apipubaws.tcbs.com.vn returns HTTP 404 "Service not found" from VPS
#            as of 2026-06-30 (x-backside-transport: FAIL FAIL — backend migrated/gone).
#            Replaced with VNDirect api-finfo.vndirect.com.vn/v4/stock_prices which is
#            accessible from VPS and returns per-ticker historical daily OHLCV.
#   R-1:    normalizeThousandVnd — multiply OHLC ×1000 when close < 100.
#            VNDirect RAW evidence (2026-06-30): VCB close=62.2 (thousand-VND = 62,200 VND actual).
#            HPG close=23.3 (thousand-VND = 23,300 VND actual). Scale is thousand-VND for all stocks.
#            Threshold close < 100 confirmed correct: all stocks trade < 100,000 VND/share on VNDirect.
#   R-3:    flat seed filter — `select(.volume > 0 or (.open != .close))` drops bars where
#            volume=0 AND open=close (TCBS/VNDirect non-trading reference bars).
#   VNINDEX: VNDirect stock_prices endpoint has no index data (totalElements=0 for VNINDEX query).
#            TASK-VNINDEX-RS-A (2026-06-30): FR-A1 adds dedicated Step 1.5 block that fetches
#            from vnmarket_prices endpoint (size=750&sort=date — fromDate/toDate ignored by API).
#            FR-A2 removes the old skip guard. 750 bars covers 2023-06-27..present (>253 bars).
#            Push payload carries type=index for semantic correctness. No ×1000 normalisation.
#   R-2:    Universe extension — try /api/ohlcv-codes first (SUBTASK-B adds this endpoint);
#            fall back to /api/watchlist if endpoint returns 404 or empty codes.
#   BARS:   Track bars_pushed_total across all tickers; pass to /api/ohlcv-backfill-done POST body.
#            SUBTASK-B reads this to verify actual depth increase. Poll script still calls done
#            (empty body) after this script exits — server handles double-call idempotently.
#
# Usage (full run, all codes):
#   MCP_BASE=https://example.com \
#   API_KEY=your-secret \
#   bash fetch-ohlcv-backfill.sh
#
# Usage (single-ticker test mode — acceptance gate):
#   MCP_BASE=https://example.com \
#   API_KEY=your-secret \
#   DAYS=730 bash fetch-ohlcv-backfill.sh VCB
#
# On VPS (MCP_BASE inherited from poll script environment):
#   DAYS=730 bash /root/fetch-ohlcv-backfill.sh VCB
#
# ── ENV VAR REFERENCE ────────────────────────────────────────────────────────
#
#  Required:
#    MCP_BASE        Base URL of MCP server e.g. https://zenmidi.com
#                    (or set OHLCV_API_URL/WATCHLIST_URL/CODES_URL/DONE_URL individually)
#    API_KEY         X-API-Key bearer token (VPS_PUSH_API_KEY)
#
#  Optional:
#    OHLCV_API_URL   Full URL for push endpoint (default: ${MCP_BASE}/api/push-ohlcv-history)
#    WATCHLIST_URL   Full URL for watchlist (default: ${MCP_BASE}/api/watchlist)
#    CODES_URL       Full URL for all observed codes (default: ${MCP_BASE}/api/ohlcv-codes)
#    DONE_URL        Full URL for backfill-done signal (default: ${MCP_BASE}/api/ohlcv-backfill-done)
#    DAYS            Calendar days to backfill (default: 730 = ~2yr)
#    SLEEP_BETWEEN   Seconds between ticker fetches (default: 1)
#
# ── VNDirect stock_prices API ────────────────────────────────────────────────
#   GET https://api-finfo.vndirect.com.vn/v4/stock_prices
#     ?q=code:VCB&fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD&sort=date&size=750
#   Returns JSON: { data: [{ date, open, high, low, close, nmVolume, ... }], totalElements, ... }
#   Prices in THOUSAND-VND — normalization ×1000 applied when close < 100.
#   Accessible from VPS (Vietnam); geo-blocked from France Docker.
#
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

MCP_BASE="${MCP_BASE:-__MCP_BASE__}"
API_KEY="${API_KEY:-__API_KEY__}"
OHLCV_API_URL="${OHLCV_API_URL:-${MCP_BASE}/api/push-ohlcv-history}"
WATCHLIST_URL="${WATCHLIST_URL:-${MCP_BASE}/api/watchlist}"
CODES_URL="${CODES_URL:-${MCP_BASE}/api/ohlcv-codes}"
DONE_URL="${DONE_URL:-${MCP_BASE}/api/ohlcv-backfill-done}"
DAYS="${DAYS:-730}"
SLEEP_BETWEEN="${SLEEP_BETWEEN:-1}"
SINGLE_TICKER="${1:-}"  # Optional positional arg: single-ticker test mode

VNDIRECT_BASE="https://api-finfo.vndirect.com.vn/v4/stock_prices"
VNDIRECT_VNMARKET_BASE="https://api-finfo.vndirect.com.vn/v4/vnmarket_prices"
VNDIRECT_UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

# Timestamp helper
ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# Date range (YYYY-MM-DD for VNDirect)
TO_DATE=$(date -u +%Y-%m-%d)
FROM_TS=$(( $(date -u +%s) - DAYS * 86400 ))
FROM_DATE=$(date -u -d "@${FROM_TS}" +%Y-%m-%d 2>/dev/null || date -u -r "${FROM_TS}" +%Y-%m-%d)

echo "$(ts) === OHLCV BACKFILL START (days=${DAYS}, range=${FROM_DATE}..${TO_DATE}) ==="

# ── Step 1: Resolve code list ────────────────────────────────────────────────

if [ -n "$SINGLE_TICKER" ]; then
  echo "$(ts) Single-ticker test mode: ${SINGLE_TICKER}"
  CODES="$SINGLE_TICKER"
else
  # R-2: Try /api/ohlcv-codes (full daily_ohlcv universe) first;
  #      fall back to /api/watchlist if endpoint not available.
  CODES_RESP=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 15 --max-time 20 \
    "$CODES_URL" -H "X-API-Key: $API_KEY" -H "User-Agent: VN-Market-VPS-Proxy/1.0" 2>/dev/null || echo "000")

  if [ "$CODES_RESP" = "200" ]; then
    CODES_BODY=$(curl -s --connect-timeout 15 --max-time 20 \
      "$CODES_URL" -H "X-API-Key: $API_KEY" -H "User-Agent: VN-Market-VPS-Proxy/1.0")
    CODES=$(echo "$CODES_BODY" | jq -r '.codes[]' 2>/dev/null || echo "")
  fi

  if [ -z "${CODES:-}" ]; then
    echo "$(ts) /api/ohlcv-codes not available (HTTP ${CODES_RESP}), falling back to /api/watchlist"
    WATCHLIST_RESP=$(curl -s --connect-timeout 15 --max-time 20 \
      "$WATCHLIST_URL" -H "X-API-Key: $API_KEY" -H "User-Agent: VN-Market-VPS-Proxy/1.0")
    if [ -z "$WATCHLIST_RESP" ]; then
      echo "$(ts) FAIL: cannot reach MCP server ($WATCHLIST_URL)" >&2
      exit 1
    fi
    CODES=$(echo "$WATCHLIST_RESP" | jq -r '.codes[]' 2>/dev/null || echo "")
    if [ -z "$CODES" ]; then
      echo "$(ts) FAIL: empty codes from watchlist" >&2
      exit 1
    fi
  fi
fi

COUNT=$(echo "$CODES" | wc -l | tr -d ' ')
echo "$(ts) Code list: ${COUNT} ticker(s) to backfill"

# ── Step 1.5: VNINDEX dedicated fetch ───────────────────────────────────────
# FR-A1 (TASK-VNINDEX-RS-A): stock_prices has no index data; use vnmarket_prices.
# NOTE: fromDate/toDate params are IGNORED by vnmarket_prices endpoint (probe
# confirmed 2026-06-30 from VPS). Use size=750&sort=date to get latest 750 bars.
# 750 bars covers ~3yr (probe: 2023-06-27..2026-06-30), well above h252=253 bars.
# VNINDEX values (~1200-1900) do NOT need ×1000 normalization (close > 100).
#
TOTAL_OK=0
TOTAL_SKIP=0
TOTAL_ERR=0
BARS_PUSHED_TOTAL=0

echo "$(ts) === Fetching VNINDEX from vnmarket_prices (dedicated index endpoint) ==="

VNINDEX_RESP=$(curl -s --connect-timeout 10 --max-time 30 \
  "${VNDIRECT_VNMARKET_BASE}?q=code:VNINDEX&size=750&sort=date" \
  -H "User-Agent: ${VNDIRECT_UA}" \
  -H "Accept: application/json" 2>/dev/null || echo "")

VNINDEX_LEN=$(echo "$VNINDEX_RESP" | jq '.data | length' 2>/dev/null || echo "0")

if [ "${VNINDEX_LEN:-0}" -gt 0 ]; then
  # Extract bars — no ×1000 normalisation: VNINDEX ~1200-1900, well above the
  # close<100 thousand-VND threshold. Use accumulatedVol // nmVolume // 0 for
  # field-name resilience across API versions (RISK-3).
  VNINDEX_BARS=$(echo "$VNINDEX_RESP" | jq -c '[
    .data[]? |
    select(.date != null and .close != null and (.close | tonumber? // null) != null) |
    {
      date:   .date,
      open:   ((.open  // .close) | tonumber),
      high:   ((.high  // .close) | tonumber),
      low:    ((.low   // .close) | tonumber),
      close:  (.close             | tonumber),
      volume: ((.accumulatedVol // .nmVolume // 0) | tonumber)
    } |
    select(.close > 0 and .open > 0 and .high > 0 and .low > 0)
  ]' 2>/dev/null || echo "[]")

  VNINDEX_BAR_COUNT=$(echo "$VNINDEX_BARS" | jq 'length' 2>/dev/null || echo 0)

  if [ "${VNINDEX_BAR_COUNT:-0}" -gt 0 ]; then
    VNINDEX_PAYLOAD=$(jq -n --arg code "VNINDEX" --argjson bars "$VNINDEX_BARS" \
      '{"code": $code, "bars": $bars, "type": "index"}')
    VNINDEX_PUSH=$(curl -s --connect-timeout 10 --max-time 20 \
      -X POST "$OHLCV_API_URL" \
      -H "Content-Type: application/json" \
      -H "X-API-Key: $API_KEY" \
      -d "$VNINDEX_PAYLOAD" 2>/dev/null || echo "")
    VNINDEX_OK=$(echo "$VNINDEX_PUSH" | jq -r '.ok // false' 2>/dev/null || echo "false")
    VNINDEX_INS=$(echo "$VNINDEX_PUSH" | jq -r '.inserted // 0' 2>/dev/null || echo "0")
    echo "$(ts) OK [VNINDEX]: ${VNINDEX_BAR_COUNT} bars fetched from vnmarket_prices, ${VNINDEX_INS} inserted"
    TOTAL_OK=$(( TOTAL_OK + 1 ))
    if echo "$VNINDEX_INS" | grep -qE '^[0-9]+$'; then
      BARS_PUSHED_TOTAL=$(( BARS_PUSHED_TOTAL + VNINDEX_INS ))
    fi
  else
    echo "$(ts) SKIP [VNINDEX]: 0 usable bars after jq filter from vnmarket_prices response (len=${VNINDEX_LEN})"
    TOTAL_SKIP=$(( TOTAL_SKIP + 1 ))
  fi
else
  echo "$(ts) WARN [VNINDEX]: vnmarket_prices returned 0 records — endpoint unavailable or empty"
  TOTAL_SKIP=$(( TOTAL_SKIP + 1 ))
fi

# ── Step 2: Fetch + push each ticker ────────────────────────────────────────

while IFS= read -r TICKER; do
  [ -z "$TICKER" ] && continue

  # FR-A2 (TASK-VNINDEX-RS-A): VNINDEX skip guard removed. VNINDEX is now fetched
  # by the dedicated vnmarket_prices block above (Step 1.5). If VNINDEX ever
  # appears in the codes list, the stock_prices endpoint would return 0 rows
  # and be skipped naturally at the DATA_LEN=0 guard below.

  # Fetch from VNDirect
  # q=code:TICKER filter confirmed working from VPS (per-ticker historical data)
  VNDIRECT_RESP=$(curl -s --connect-timeout 10 --max-time 30 \
    "${VNDIRECT_BASE}?q=code:${TICKER}&fromDate=${FROM_DATE}&toDate=${TO_DATE}&sort=date&size=750" \
    -H "User-Agent: ${VNDIRECT_UA}" \
    -H "Accept: application/json" \
    -H "Accept-Language: vi-VN,vi;q=0.9" 2>/dev/null || echo "")

  if [ -z "$VNDIRECT_RESP" ]; then
    echo "$(ts) WARN [${TICKER}]: VNDirect returned empty response — skipping"
    TOTAL_SKIP=$(( TOTAL_SKIP + 1 ))
    sleep "$SLEEP_BETWEEN"
    continue
  fi

  # Verify it's valid JSON with data array
  DATA_LEN=$(echo "$VNDIRECT_RESP" | jq '.data | length' 2>/dev/null || echo "0")
  if [ "$DATA_LEN" = "0" ]; then
    echo "$(ts) SKIP [${TICKER}]: VNDirect returned 0 bars (suspended ticker or no data)"
    TOTAL_SKIP=$(( TOTAL_SKIP + 1 ))
    sleep "$SLEEP_BETWEEN"
    continue
  fi

  # Extract and normalize bars:
  #   R-1: normalizeThousandVnd — multiply OHLC ×1000 when close < 100
  #        VNDirect confirmed thousand-VND scale: VCB=62.2→62200, HPG=23.3→23300
  #   R-3: flat seed filter — keep only bars with volume>0 OR open≠close
  BARS=$(echo "$VNDIRECT_RESP" | jq -c '[
    .data[]? |
    select(
      .open  != null and (.open  | tonumber? // null) != null and
      .close != null and (.close | tonumber? // null) != null and
      .date  != null
    ) |
    {
      date:   .date,
      open:   (.open          | tonumber),
      high:   (.high          | tonumber),
      low:    (.low           | tonumber),
      close:  (.close         | tonumber),
      volume: ((.nmVolume // 0) | tonumber)
    } |
    # R-1: normalizeThousandVnd (VNDirect thousand-VND → full VND)
    if (.close > 0 and .close < 100) then
      . + {
        open:  (.open  * 1000),
        high:  (.high  * 1000),
        low:   (.low   * 1000),
        close: (.close * 1000)
      }
    else . end |
    # R-3: drop flat zero-volume seed bars
    select(.volume > 0 or (.open != .close))
  ]' 2>/dev/null || echo "[]")

  BAR_COUNT=$(echo "$BARS" | jq 'length' 2>/dev/null || echo 0)

  if [ "$BAR_COUNT" -eq 0 ]; then
    echo "$(ts) SKIP [${TICKER}]: 0 bars after normalization + seed filter"
    TOTAL_SKIP=$(( TOTAL_SKIP + 1 ))
    sleep "$SLEEP_BETWEEN"
    continue
  fi

  # Build push payload
  PAYLOAD=$(jq -n --arg code "$TICKER" --argjson bars "$BARS" \
    '{"code": $code, "bars": $bars}')

  # Push to France server
  PUSH_RESP=$(curl -s --connect-timeout 10 --max-time 20 \
    -X POST "$OHLCV_API_URL" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: $API_KEY" \
    -d "$PAYLOAD" 2>/dev/null || echo "")

  INSERTED=$(echo "$PUSH_RESP" | jq -r '.inserted // "?"' 2>/dev/null || echo "?")
  OK=$(echo "$PUSH_RESP" | jq -r '.ok // false' 2>/dev/null || echo "false")

  if [ "$OK" = "true" ]; then
    echo "$(ts) OK [${TICKER}]: ${BAR_COUNT} bars fetched, ${INSERTED} inserted"
    TOTAL_OK=$(( TOTAL_OK + 1 ))
    # Accumulate bars_pushed_total for done-signal contract
    if echo "$INSERTED" | grep -qE '^[0-9]+$'; then
      BARS_PUSHED_TOTAL=$(( BARS_PUSHED_TOTAL + INSERTED ))
    fi
  else
    echo "$(ts) ERR [${TICKER}]: push failed — response: ${PUSH_RESP}"
    TOTAL_ERR=$(( TOTAL_ERR + 1 ))
  fi

  sleep "$SLEEP_BETWEEN"
done <<< "$CODES"

# ── Summary ──────────────────────────────────────────────────────────────────

echo "$(ts) === OHLCV BACKFILL DONE: ok=${TOTAL_OK} skip=${TOTAL_SKIP} err=${TOTAL_ERR} bars_pushed_total=${BARS_PUSHED_TOTAL} ==="

# Signal completion with bars_pushed_total (SUBTASK-B verifies depth server-side)
# Note: ohlcv-backfill-poll.sh also POSTs done (empty body) after this script exits —
#       server handles the double-call idempotently (marks done=1 again, no-op).
if [ -n "${DONE_URL}" ] && [ "${DONE_URL}" != "__MCP_BASE__/api/ohlcv-backfill-done" ]; then
  DONE_RESP=$(curl -s --connect-timeout 10 --max-time 20 \
    -X POST "${DONE_URL}" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: ${API_KEY}" \
    -d "{\"bars_pushed_total\": ${BARS_PUSHED_TOTAL}}" 2>/dev/null || echo "")
  DONE_OK=$(echo "$DONE_RESP" | jq -r '.ok // false' 2>/dev/null || echo "false")
  if [ "$DONE_OK" = "true" ]; then
    echo "$(ts) Done signal sent to ${DONE_URL}: bars_pushed_total=${BARS_PUSHED_TOTAL}"
  else
    echo "$(ts) WARN: done signal failed — response: ${DONE_RESP}" >&2
  fi
fi
