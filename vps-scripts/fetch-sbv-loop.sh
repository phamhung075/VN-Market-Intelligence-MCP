#!/bin/bash
# SBV/VCB FX Rate Proxy — forever loop for systemd
# Runs every 30 minutes. VCB updates rates ~3 times daily.

set -u

while true; do
  /root/fetch-sbv.sh
  sleep 1800   # 30 minutes
done
