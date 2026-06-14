#!/usr/bin/env bash
# PROBE-2: SBV Balance-of-Payments — Liferay JSON API
# Recon date: 2026-06-14
# Status: PASS — live JSON API confirmed, all 10 BOP line items accessible
# API: GET https://www.sbv.gov.vn/o/article/v1.0/articles?scopeKey=20117&contentStructureId=10063168&pageSize=100&filter=<OData filter>
# E&O sign convention: IMF BPM6 (positive = unexplained outflow residual in Q4 2025 = -12.375 M USD)

set -euo pipefail
CACERT=/etc/ssl/certs/ca-certificates.crt
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# Fetch latest BOP quarter via Liferay article API
# filter: status=0 AND Date48362898 (quarter date field) > '' (non-empty)
FILTER="status eq 0 and Date48362898 gt ''"
ENCODED_FILTER=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$FILTER'))")

echo "=== Fetching SBV BOP JSON API ==="
curl -s --cacert "$CACERT" -L \
  -w '\nHTTP:%{http_code}' \
  -H "User-Agent: $UA" \
  -H "Accept: application/json" \
  -H "Referer: https://www.sbv.gov.vn/vi/can-can-thanh-toan-quoc-te" \
  "https://www.sbv.gov.vn/o/article/v1.0/articles?scopeKey=20117&contentStructureId=10063168&pageSize=100&filter=${ENCODED_FILTER}"

echo ""
echo ""
echo "=== Alternative: date-filtered fetch (e.g., 2025-10-01 to 2026-03-31) ==="
FROM="2025-10-01"
TO="2026-03-31"
FILTER2="status eq 0 and Date48362898 gt '' and Date48362898 ge '$FROM' and Date48362898 le '$TO'"
ENC2=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1]))" "$FILTER2")
curl -s --cacert "$CACERT" -L \
  -w '\nHTTP:%{http_code}' \
  -H "User-Agent: $UA" \
  -H "Accept: application/json" \
  "https://www.sbv.gov.vn/o/article/v1.0/articles?scopeKey=20117&contentStructureId=10063168&pageSize=10&filter=${ENC2}"
