#!/usr/bin/env bash
# PROBE-4: SBV Interbank rates + OMO auction results
# Recon date: 2026-06-14
# Status: PARTIAL
#   - OMO: PASS — live HTML table on www.sbv.gov.vn (most recent auction result)
#   - Interbank 1w tenor: BLOCKED — dttktt.sbv.gov.vn (202.58.245.101) unreachable (100% packet loss)
# Note: interbank_1w requires SBV old Webcenter portal (dttktt.sbv.gov.vn) which is down from VPS.

set -euo pipefail
CACERT=/etc/ssl/certs/ca-certificates.crt
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
HEADERS=(-H "User-Agent: $UA" -H "Accept-Language: vi-VN,vi;q=0.9")

echo "=== PROBE-4A: SBV OMO auction results page ==="
curl -s --cacert "$CACERT" -L \
  -w '\nHTTP:%{http_code}\nFINAL:%{url_effective}' \
  "${HEADERS[@]}" \
  -o /tmp/sbv_omo.html \
  "https://www.sbv.gov.vn/vi/web/sbv_portal/nghi%E1%BB%87p-v%E1%BB%A5-th%E1%BB%8B-tr%C6%B0%E1%BB%9Dng-m%E1%BB%9F"

echo ""
echo "OMO page size:"
wc -c /tmp/sbv_omo.html

echo ""
echo "=== PROBE-4B: Interbank rate page (OLD PORTAL — may be unreachable) ==="
echo "Note: dttktt.sbv.gov.vn:443 (202.58.245.101) has 100% packet loss from VPS."
echo "Confirming reachability..."
ping -c 1 -W 3 dttktt.sbv.gov.vn 2>&1 | tail -3

echo ""
echo "=== PROBE-4C: SBV FX rates page (reference rates confirmed working) ==="
curl -s --cacert "$CACERT" -L \
  -w '\nHTTP:%{http_code}' \
  "${HEADERS[@]}" \
  -o /tmp/sbv_fx.html \
  "https://www.sbv.gov.vn/tỷ-giá"

echo ""
echo "FX page size:"
wc -c /tmp/sbv_fx.html
