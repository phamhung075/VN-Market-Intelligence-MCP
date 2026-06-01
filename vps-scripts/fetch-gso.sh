#!/bin/bash
# GSO Macro Indicators Proxy — auto-deployed
# Fetches VN macro indicators from General Statistics Office (gso.gov.vn)
# and pushes to MCP server via POST /api/push-gso.
# Runs hourly from vn-gso-fetch.service.
# NOTE: browser automation removed (VPS too lite for Chromium).

API_URL="${GSO_API_URL:-__MCP_BASE__/api/push-gso}"
API_KEY="${API_KEY:-__API_KEY__}"
LOG="/var/log/vn-gso-fetch.log"
COUNTRY="VN"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Log rotation (10 MB cap)
# Source shared constants (LOG_ROTATE_BYTES) from vps-lib.sh
# shellcheck source=/root/vps-lib.sh
[ -f /root/vps-lib.sh ] && LOG_ROTATE_BYTES=$(grep '^LOG_ROTATE_BYTES=' /root/vps-lib.sh | cut -d= -f2) || LOG_ROTATE_BYTES=10485760
LOG_SIZE=$(stat -c%s "$LOG" 2>/dev/null || echo 0)
if [ "$LOG_SIZE" -gt $LOG_ROTATE_BYTES ]; then mv "$LOG" "$LOG.old"; fi

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) === GSO START ===" >> "$LOG"

# Browser automation removed — VPS too lite to run headless browser.
# GSO data fetch currently disabled; pushes empty payload to keep fetched_at fresh.
FETCHED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
GSO_JSON=""
echo "$(date -u) INFO: GSO browser fetch disabled (browser automation removed); pushing empty payload" >> "$LOG"

# Parse indicators from GSO_JSON (output: name=value pairs, one per line)
RESULTS=()

if [ -n "$GSO_JSON" ]; then
  while IFS="=" read -r NAME VALUE; do
    [ -z "$NAME" ] || [ -z "$VALUE" ] && continue
    RESULTS+=("{\"name\":\"${NAME}\",\"value\":${VALUE},\"unit\":\"\",\"fetched_at\":\"${FETCHED_AT}\"}")
    echo "$(date -u) OK ${NAME}=${VALUE}" >> "$LOG"
  done < <(echo "$GSO_JSON" | python3 -c "
import sys, json
try:
    data = json.loads(sys.stdin.read())
    for item in data:
        name = item.get('name', '')
        value = item.get('value')
        if name and value is not None:
            print(f'{name}={float(value)}')
except Exception as e:
    sys.stderr.write(str(e) + '\n')
" 2>>"$LOG")
fi

if [ "${#RESULTS[@]}" -eq 0 ]; then
  echo "$(date -u) WARN: no indicators parsed from GSO; pushing empty payload to update fetched_at" >> "$LOG"
  JSON=$(printf '{"country":"%s","indicators":[]}' "$COUNTRY")
else
  IFS=","
  ARRAY="[${RESULTS[*]}]"
  unset IFS
  JSON=$(printf '{"country":"%s","indicators":%s}' "$COUNTRY" "$ARRAY")
fi

PUSH_RESP=$(curl -s --connect-timeout 10 --max-time 15 \
  -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -H "User-Agent: VN-Market-VPS-Proxy/1.0" \
  -d "$JSON")

echo "$(date -u) PUSH: gso → $PUSH_RESP" >> "$LOG"

# Exit non-zero if push failed
if echo "$PUSH_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get('ok') else 1)" 2>/dev/null; then
  echo "$(date -u) === GSO DONE ===" >> "$LOG"
  exit 0
else
  echo "$(date -u) ERROR: push failed — $PUSH_RESP" >> "$LOG"
  exit 1
fi
