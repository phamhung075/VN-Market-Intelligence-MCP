#!/bin/bash
# BCTC PDF Proxy — forever loop for systemd
# Runs every 6 hours. No market-hours window — BCTC filings are published
# any time; a 6-hour polling cadence balances freshness vs. server load.

set -u

while true; do
  /root/fetch-bctc.sh
  sleep 21600   # 6 hours
done
