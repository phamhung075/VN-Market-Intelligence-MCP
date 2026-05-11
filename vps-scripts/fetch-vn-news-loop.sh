#!/bin/bash
# VN News RSS Proxy — forever loop for systemd
# Runs every 15 minutes with human-like delays between sources.
# 15min cycle: news sites update every 10-30min, more frequent = higher block risk.
#
# timeout 600: kills hung fetch-vn-news.sh runs (network/curl can hang
# indefinitely without this guard, causing systemd to see a non-zero exit and
# trigger the Restart= policy — visible as the 41m uptime restart loop).

set -u

LOG="/var/log/vn-news-fetch.log"
CYCLE=0

_hb() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [NEWS  ] INFO  heartbeat cycle=${CYCLE} status=${1}" >> "$LOG"
}

while true; do
  CYCLE=$(( CYCLE + 1 ))
  _hb "running"
  timeout 600 /root/fetch-vn-news.sh || echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [NEWS  ] WARN  fetch-vn-news timed out or failed (exit=$?)" >> "$LOG"
  sleep 900   # 15 minutes
done
