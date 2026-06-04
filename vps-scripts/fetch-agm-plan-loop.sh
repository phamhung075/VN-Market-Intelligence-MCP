#!/bin/bash
# VN Market AGM business plan fetcher — forever loop driver for systemd
#
# Runs under vn-agm-plan.service (Type=simple, Restart=always).
# DO NOT call from cron directly.
#
# Cadence: AGM plans are published once/year and updated rarely.
# Sweep the full watchlist daily at ~01:00 UTC (after BCTC sweep).
# Off-hours: sleep 5 min so the unit stays alive without CPU waste.
#
# Resilience: consecutive failures trigger exponential backoff + alert.
#   After 5 failures: 1800s (30m) backoff
#   After 10 failures: 3600s (1h) backoff + Telegram alert
#   On success: counter resets

set -u

FAILURE_COUNT=0
ALERT_SENT=0
MCP_BASE="${AGM_MCP_BASE:-https://zenmidi.com}"
VPS_API_KEY="${API_KEY:-}"

log_backoff() {
  local failures=$1
  local delay=$2
  echo "[$(date -u +'%Y-%m-%d %H:%M:%S')] fetch-agm-plan-loop: $failures consecutive failures → ${delay}s delay"
}

send_alert() {
  local msg=$1
  if [ -n "$VPS_API_KEY" ] && [ -n "$MCP_BASE" ]; then
    (curl -s -X POST "$MCP_BASE/alert" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $VPS_API_KEY" \
      -d "{\"channel\":\"work\",\"message\":\"$msg\"}" &) || true
  fi
}

get_backoff_delay() {
  local failures=$1
  if [ "$failures" -ge 10 ]; then
    echo 3600
  elif [ "$failures" -ge 5 ]; then
    echo 1800
  else
    echo 300
  fi
}

# Target: once daily near 01:00 UTC (low-traffic window, after BCTC sweep)
TARGET_HOUR=1   # 01:xx UTC

LAST_RUN_DAY=""

while true; do
  now_hour=$(date -u +%H)
  now_hour=${now_hour#0}   # strip leading zero for arithmetic
  now_day=$(date -u +%Y-%m-%d)

  # Run once per day when the hour matches target AND we haven't run today
  if [ "$now_hour" -eq "$TARGET_HOUR" ] && [ "$now_day" != "$LAST_RUN_DAY" ]; then
    if /root/fetch-agm-plan.sh; then
      LAST_RUN_DAY="$now_day"
      if [ "$FAILURE_COUNT" -gt 0 ]; then
        echo "[$(date -u +'%Y-%m-%d %H:%M:%S')] fetch-agm-plan-loop: recovered after $FAILURE_COUNT failures"
        FAILURE_COUNT=0
        ALERT_SENT=0
      fi
      # After successful run, sleep until next day's window
      sleep 3600
    else
      FAILURE_COUNT=$((FAILURE_COUNT + 1))
      BACKOFF=$(get_backoff_delay "$FAILURE_COUNT")
      log_backoff "$FAILURE_COUNT" "$BACKOFF"

      if [ "$FAILURE_COUNT" -eq 10 ] && [ "$ALERT_SENT" -eq 0 ]; then
        ALERT_SENT=1
        send_alert "VN AGM plan fetch: 10 consecutive failures at $(date -u +'%Y-%m-%d %H:%M:%S'). Check: ssh root@\$VINAHOST_IP journalctl -u vn-agm-plan.service -n 50"
      fi

      sleep "$BACKOFF"
    fi
  else
    # Off-window: poll every 5 min
    sleep 300
  fi
done
