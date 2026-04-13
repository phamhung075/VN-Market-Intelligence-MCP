#!/bin/bash
# VN News RSS Proxy — forever loop for systemd
# Runs every 15 minutes with human-like delays between sources.
# 15min cycle: news sites update every 10-30min, more frequent = higher block risk.

set -u

LOG="/var/log/vn-news-fetch.log"
CYCLE=0

_hb() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [NEWS  ] INFO  heartbeat cycle=${CYCLE} status=${1}" >> "$LOG"
}

while true; do
  CYCLE=$(( CYCLE + 1 ))
  _hb "running"
  /root/fetch-vn-news.sh
  EXIT=$?
  if [ $EXIT -ne 0 ]; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [NEWS  ] ERROR fetch-vn-news.sh exited code=$EXIT" >> "$LOG"
  fi
  sleep 900   # 15 minutes
done
