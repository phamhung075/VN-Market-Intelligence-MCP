#!/bin/bash
# TradingEconomics Macro Indicators Proxy — forever loop for systemd
# Runs every 60 minutes. TE macro data updates ~hourly; 90min stale threshold
# in vpsProxyWatchdogJob.ts gives one missed cycle before alert fires.

set -u

LOG="/var/log/vn-tradingeconomics-fetch.log"
CYCLE=0

_hb() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [TE    ] INFO  heartbeat cycle=${CYCLE} status=${1}" >> "$LOG"
}

while true; do
  CYCLE=$(( CYCLE + 1 ))
  _hb "running"
  /root/fetch-tradingeconomics.sh
  EXIT=$?
  if [ $EXIT -ne 0 ]; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [TE    ] ERROR fetch-tradingeconomics.sh exited code=$EXIT" >> "$LOG"
  fi
  sleep 3600   # 60 minutes
done
