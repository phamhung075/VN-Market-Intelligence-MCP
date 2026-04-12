#!/bin/bash
# VN News RSS Proxy — forever loop for systemd
# Runs every 5 minutes (same cadence as MCP's newsPollerJob).
# Vietnamese news sites publish frequently during market hours.

set -u

while true; do
  /root/fetch-vn-news.sh
  sleep 300   # 5 minutes
done
