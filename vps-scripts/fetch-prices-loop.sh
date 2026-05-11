#!/bin/bash
# VN Market price proxy — forever loop driver with exponential backoff
# Runs under systemd (vn-price-fetch.service). DO NOT call from cron.
#
# Sleeps 60s between iterations during VN market hours (02:00-08:59 UTC,
# Mon-Fri). Off-hours and weekends sleep 5 min between no-ops so the unit
# stays up but consumes effectively nothing.
#
# Resilience: On consecutive curl failures:
#   - After 5 failures: 300s (5m) backoff
#   - After 10 failures: 600s (10m) backoff + Telegram alert
#   - On success: counter resets

set -u

FAILURE_COUNT=0
ALERT_SENT=0
MCP_BASE="${__MCP_BASE:-https://zenmidi.com}"
VPS_API_KEY="${__API_KEY:-}"

log_backoff() {
  local failures=$1
  local delay=$2
  echo "[$(date -u +'%Y-%m-%d %H:%M:%S')] fetch-prices-loop: $failures consecutive failures → ${delay}s delay"
}

send_alert() {
  local msg=$1
  # Send Telegram alert via MCP server (non-blocking curl)
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
    echo 600
  elif [ "$failures" -ge 5 ]; then
    echo 300
  else
    echo 60
  fi
}

while true; do
  now_dow=$(date -u +%u)   # 1..7 (Mon..Sun)
  now_hour=$(date -u +%H)
  now_hour=${now_hour#0}   # strip leading zero so arithmetic works

  if [ "$now_dow" -le 5 ] && [ "$now_hour" -ge 2 ] && [ "$now_hour" -le 8 ]; then
    # Market hours: try to fetch prices
    if /root/fetch-prices.sh > /dev/null 2>&1; then
      # Success: reset counter
      if [ "$FAILURE_COUNT" -gt 0 ]; then
        echo "[$(date -u +'%Y-%m-%d %H:%M:%S')] fetch-prices-loop: recovered after $FAILURE_COUNT failures"
        FAILURE_COUNT=0
        ALERT_SENT=0
      fi
      sleep 60
    else
      # Failure: increment counter + apply backoff
      FAILURE_COUNT=$((FAILURE_COUNT + 1))
      BACKOFF=$(get_backoff_delay "$FAILURE_COUNT")
      log_backoff "$FAILURE_COUNT" "$BACKOFF"

      # Alert on 10th failure (non-blocking)
      if [ "$FAILURE_COUNT" -eq 10 ] && [ "$ALERT_SENT" -eq 0 ]; then
        ALERT_SENT=1
        send_alert "VN price fetch: 10 consecutive failures at $(date -u +'%Y-%m-%d %H:%M:%S'). Manual SSH required: ssh root@\$VINAHOST_IP systemctl status vn-price-fetch"
      fi

      sleep "$BACKOFF"
    fi
  else
    # Off-hours: just sleep, don't fetch
    sleep 300
  fi
done
