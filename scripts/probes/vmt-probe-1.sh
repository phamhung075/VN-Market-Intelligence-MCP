#!/usr/bin/env bash
# PROBE-1: Vietnam Customs (Tong cuc Hai quan) — trade stats + enterprise-type breakdown
# Recon date: 2026-06-14
# Status: PARTIAL — homepage accessible, data rendered via SPA JS (bridge API requires session context)
# Note: The Customs site is a JavaServer Faces SPA on Apache Tomcat 8.0.32.
#       Content is loaded via bridge?url=<main_new>/api/GetListPage which requires
#       a server-side session context variable (main_new) set by JSP.
#       The tongcuc.customs.gov.vn backend is NOT DNS-resolvable externally.
# Verdict for PROBE-1: customs.gov.vn HTML content is JS-rendered; no static data endpoint found.
#   Enterprise-type breakdown NOT found as machine-readable HTML/JSON table via VPS curl.
#   Fallback: use GSO FDI-attributed export data (nso.gov.vn FDI sheet from monthly Excel).

set -euo pipefail
CACERT=/etc/ssl/certs/ca-certificates.crt
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
ACCEPT="text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
LANG="vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7"

echo "=== Fetching Vietnam Customs homepage ==="
curl -s --cacert "$CACERT" -L \
  -w '\nHTTP:%{http_code}\nFINAL:%{url_effective}' \
  -H "User-Agent: $UA" \
  -H "Accept: $ACCEPT" \
  -H "Accept-Language: $LANG" \
  -o /tmp/customs_home.html \
  "https://www.customs.gov.vn/"

echo ""
echo "HTTP status above. Page uses SPA (Kendo/jQuery) loaded via bridge?url=<main_new>/api/GetListPage"
echo "main_new is server-resolved JSP variable → cannot be fetched via static curl"
echo ""
echo "=== Bridge API test (expected: 400 - requires session) ==="
curl -s --cacert "$CACERT" \
  -H "User-Agent: $UA" \
  -H "Accept: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  "https://www.customs.gov.vn/bridge?url=/api/GetListPage"
