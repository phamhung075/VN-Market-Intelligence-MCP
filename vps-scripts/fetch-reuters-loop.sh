#!/bin/bash
# Reuters RSS Proxy — forever loop for systemd
# Runs every 60 minutes. Reuters RSS updates ~hourly; 90min stale threshold
# in vpsProxyWatchdogJob.ts gives one missed cycle before alert fires.

set -u

LOG="/var/log/vn-reuters.log"
CYCLE=0

_hb() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [REUTER] INFO  heartbeat cycle=${CYCLE} status=${1}" >> "$LOG"
}

while true; do
  CYCLE=$(( CYCLE + 1 ))
  _hb "running"
  /root/fetch-reuters.sh
  EXIT=$?
  if [ $EXIT -ne 0 ]; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [REUTER] ERROR fetch-reuters.sh exited code=$EXIT" >> "$LOG"
  fi
  sleep 3600   # 60 minutes
done
