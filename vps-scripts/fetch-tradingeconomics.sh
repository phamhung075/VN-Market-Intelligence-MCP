#!/bin/bash
# TradingEconomics Macro Indicators Proxy — auto-deployed
# Fetches 12 VN macro indicators from TradingEconomics RSS/data and
# pushes to MCP server via POST /api/push-tradingeconomics.
# Runs hourly from vn-tradingeconomics-fetch.service.

API_URL="${TE_PUSH_URL:-__MCP_BASE__/api/push-tradingeconomics}"
API_KEY="${API_KEY:-__API_KEY__}"
TE_API_KEY="${TRADING_ECONOMICS_API_KEY:-}"
LOG="/var/log/vn-tradingeconomics-fetch.log"
COUNTRY="VN"

# Guard: exit gracefully when TE_API_KEY was never substituted by deploy script.
# Prevents 401 flood and misleading "consecutive failures" in health monitor.
if [ -z "$TE_API_KEY" ] || [ "$TE_API_KEY" = "__TE_API_KEY__" ]; then
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) SKIP: TE_API_KEY not configured — set TRADING_ECONOMICS_API_KEY in .env and redeploy" >> "$LOG"
  exit 0
fi

# Log rotation (10 MB cap)
# Source shared constants (LOG_ROTATE_BYTES) from vps-lib.sh
# shellcheck source=/root/vps-lib.sh
[ -f /root/vps-lib.sh ] && LOG_ROTATE_BYTES=$(grep '^LOG_ROTATE_BYTES=' /root/vps-lib.sh | cut -d= -f2) || LOG_ROTATE_BYTES=10485760
LOG_SIZE=$(stat -c%s "$LOG" 2>/dev/null || echo 0)
if [ "$LOG_SIZE" -gt $LOG_ROTATE_BYTES ]; then mv "$LOG" "$LOG.old"; fi

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) === TE START ===" >> "$LOG"

# Indicators to fetch from TradingEconomics.
# Format: local_name:TE_indicator_name  (used in API path segment)
# Correct TE API endpoint: /historical/country/{Country}/indicator/{IndicatorName}
# Old format (vietnam/consumer-price-index-cpi) returns 404 — slug paths removed.
INDICATORS=(
  "cpi:CPI"
  "gdp_growth:GDP Annual Growth Rate"
  "interest_rate:Interest Rate"
  "unemployment_rate:Unemployment Rate"
  "inflation_rate:Inflation Rate CPI"
  "trade_balance:Balance of Trade"
  "current_account:Current Account"
  "government_debt:Government Debt to GDP"
  "budget_deficit:Government Budget"
  "manufacturing_pmi:Manufacturing PMI"
  "consumer_confidence:Consumer Confidence"
  "retail_sales:Retail Sales YoY"
)

FETCHED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
RESULTS=()

for ITEM in "${INDICATORS[@]}"; do
  NAME="${ITEM%%:*}"
  SLUG="${ITEM##*:}"

  # URL-encode the indicator name (spaces → %20) for the API path
  ENCODED_NAME=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$SLUG" 2>/dev/null)
  if [ -z "$ENCODED_NAME" ]; then
    echo "$(date -u) SKIP ${NAME}: failed to url-encode indicator name" >> "$LOG"
    continue
  fi

  RESP=$(curl -s --connect-timeout 10 --max-time 15 \
    -H "Accept: application/json" \
    "https://api.tradingeconomics.com/historical/country/Vietnam/indicator/${ENCODED_NAME}?c=${TE_API_KEY}&format=json" 2>/dev/null)

  if [ -z "$RESP" ]; then
    echo "$(date -u) SKIP ${NAME}: empty response" >> "$LOG"
    continue
  fi

  VALUE=$(echo "$RESP" | python3 -c "
import sys, json
try:
    data = json.loads(sys.stdin.read())
    if isinstance(data, list) and len(data) > 0:
        v = data[0].get('Value') or data[0].get('Last')
        print(float(v)) if v is not None else print('')
    else:
        print('')
except:
    print('')
" 2>/dev/null | head -1)

  if [ -z "$VALUE" ]; then
    echo "$(date -u) SKIP ${NAME}: no value parsed" >> "$LOG"
    continue
  fi

  RESULTS+=("{\"name\":\"${NAME}\",\"value\":${VALUE},\"unit\":\"%\",\"fetched_at\":\"${FETCHED_AT}\"}")
  echo "$(date -u) OK ${NAME}=${VALUE}" >> "$LOG"
done

# Build JSON array
if [ "${#RESULTS[@]}" -eq 0 ]; then
  echo "$(date -u) ABORT: no indicators fetched" >> "$LOG"
  exit 1
fi

IFS=","
ARRAY="[${RESULTS[*]}]"
unset IFS

JSON=$(printf '{"country":"%s","indicators":%s}' "$COUNTRY" "$ARRAY")

PUSH_RESP=$(curl -s --connect-timeout 10 --max-time 15 \
  -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -H "User-Agent: VN-Market-VPS-Proxy/1.0" \
  -d "$JSON")

echo "$(date -u) PUSH: tradingeconomics → $PUSH_RESP" >> "$LOG"
