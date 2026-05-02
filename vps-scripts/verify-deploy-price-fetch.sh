#!/bin/bash
# Deploy Verification for vn-price-fetch service
# Runs after `systemctl restart vn-price-fetch` in deploy-vinahost.sh
#
# Purpose: Prevent undetected service failures (e.g., 25-day outage)
# by verifying that fresh price data reaches the database within 30 seconds.
#
# Exit codes:
#   0 = health check passed, prices are fresh
#   1 = health check failed, service not recovering
#
# Usage (in deploy-vinahost.sh):
#   systemctl restart vn-price-fetch
#   bash /root/verify-deploy-price-fetch.sh || exit 1

set -u

# ── Market-hours guard ───────────────────────────────────────────────────────
# HOSE/HNX/UPCOM trade Mon–Fri 09:00–15:15 VT (UTC+7).
# Outside those hours fresh price data will never arrive; skip the freshness
# loop and only verify that the systemd service is active.
VN_HOUR=$(TZ=Asia/Ho_Chi_Minh date +%H)
VN_DOW=$(TZ=Asia/Ho_Chi_Minh date +%u)   # 1=Mon … 7=Sun
VN_MIN=$(TZ=Asia/Ho_Chi_Minh date +%M)
VN_TIME_NUM=$((10#$VN_HOUR * 60 + 10#$VN_MIN))  # minutes since midnight
MARKET_OPEN=540    # 09:00 = 540 min
MARKET_CLOSE=915   # 15:15 = 915 min
if [ "$VN_DOW" -ge 6 ] || [ "$VN_TIME_NUM" -lt "$MARKET_OPEN" ] || [ "$VN_TIME_NUM" -gt "$MARKET_CLOSE" ]; then
  echo "Market closed (VT $(TZ=Asia/Ho_Chi_Minh date '+%H:%M') DOW=$VN_DOW) — skipping freshness check."
  systemctl is-active --quiet vn-price-fetch && echo "✓ vn-price-fetch is active" && exit 0
  echo "✗ vn-price-fetch is NOT active"; exit 1
fi
# ── End market-hours guard ───────────────────────────────────────────────────

HEALTH_INTERVAL=5      # Check every 5 seconds
HEALTH_MAX_ATTEMPTS=6  # 6 attempts × 5s = 30 seconds total
STALE_THRESHOLD=120    # Must have data <2 minutes old

echo "Verifying price fetch health..."

for attempt in $(seq 1 "$HEALTH_MAX_ATTEMPTS"); do
  # Query SQLite: get latest price update timestamp
  LATEST_TS=$(sqlite3 /data/vn-market.db \
    "SELECT COALESCE(MAX(datetime(updated_at)), '') FROM market_prices LIMIT 1" 2>/dev/null || echo "")

  if [ -z "$LATEST_TS" ]; then
    echo "  [$attempt/$HEALTH_MAX_ATTEMPTS] No price data yet..."
    sleep "$HEALTH_INTERVAL"
    continue
  fi

  # Convert timestamp to Unix seconds for comparison
  LATEST_EPOCH=$(date -d "$LATEST_TS" +%s 2>/dev/null || echo "0")
  NOW_EPOCH=$(date +%s)
  STALE_SECONDS=$((NOW_EPOCH - LATEST_EPOCH))

  echo "  [$attempt/$HEALTH_MAX_ATTEMPTS] Latest price: $LATEST_TS ($STALE_SECONDS seconds ago)"

  if [ "$STALE_SECONDS" -le "$STALE_THRESHOLD" ]; then
    echo "✓ Price fetch healthy — data fresh (<2 min stale)"
    exit 0
  fi

  sleep "$HEALTH_INTERVAL"
done

echo "✗ DEPLOY FAILED: Price fetch not recovering within 30 seconds."
echo ""
echo "Manual diagnostics required:"
echo "  ssh root@\$VINAHOST_IP"
echo "  systemctl status vn-price-fetch"
echo "  journalctl -u vn-price-fetch -n 50"
echo "  systemctl restart vn-price-fetch"
echo ""

exit 1
