#!/bin/bash
# VN Market price proxy — forever loop driver
# Runs under systemd (vn-price-fetch.service). DO NOT call from cron.
#
# Sleeps 60s between iterations during VN market hours (02:00-08:59 UTC,
# Mon-Fri). Off-hours and weekends sleep 5 min between no-ops so the unit
# stays up but consumes effectively nothing.

set -u

while true; do
  now_dow=$(date -u +%u)   # 1..7 (Mon..Sun)
  now_hour=$(date -u +%H)
  now_hour=${now_hour#0}   # strip leading zero so arithmetic works

  if [ "$now_dow" -le 5 ] && [ "$now_hour" -ge 2 ] && [ "$now_hour" -le 8 ]; then
    /root/fetch-prices.sh
    sleep 60
  else
    sleep 300
  fi
done
