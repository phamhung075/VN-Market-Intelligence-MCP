#!/bin/bash
# TradingEconomics Macro Indicators Proxy — auto-deployed
# Fetches 12 VN macro indicators from TradingEconomics RSS/data and
# pushes to MCP server via POST /api/push-tradingeconomics.
# Runs hourly from vn-tradingeconomics-fetch.service.

API_URL="__MCP_BASE__/api/push-tradingeconomics"
API_KEY="__API_KEY__"
TE_API_KEY="__TE_API_KEY__"
LOG="/var/log/vn-tradingeconomics-fetch.log"
COUNTRY="VN"

# Log rotation (10 MB cap)
LOG_SIZE=$(stat -c%s "$LOG" 2>/dev/null || echo 0)
if [ "$LOG_SIZE" -gt 10485760 ]; then mv "$LOG" "$LOG.old"; fi

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) === TE START ===" >> "$LOG"

# Indicators to fetch from TradingEconomics (name → TE API indicator slug)
# Format: local_name:te_indicator
INDICATORS=(
  "cpi:vietnam/consumer-price-index-cpi"
  "gdp_growth:vietnam/gdp-growth-annual"
  "interest_rate:vietnam/interest-rate"
  "unemployment_rate:vietnam/unemployment-rate"
  "inflation_rate:vietnam/inflation-cpi"
  "trade_balance:vietnam/balance-of-trade"
  "current_account:vietnam/current-account"
  "government_debt:vietnam/government-debt-to-gdp"
  "budget_deficit:vietnam/government-budget"
  "manufacturing_pmi:vietnam/manufacturing-pmi"
  "consumer_confidence:vietnam/consumer-confidence"
  "retail_sales:vietnam/retail-sales-annual"
)

FETCHED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
RESULTS=()

for ITEM in "${INDICATORS[@]}"; do
  NAME="${ITEM%%:*}"
  SLUG="${ITEM##*:}"

  RESP=$(curl -s --connect-timeout 10 --max-time 15 \
    -H "Accept: application/json" \
    "https://api.tradingeconomics.com/${SLUG}?c=${TE_API_KEY}&format=json" 2>/dev/null)

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
