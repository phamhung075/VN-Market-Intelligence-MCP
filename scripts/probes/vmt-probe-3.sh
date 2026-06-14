#!/usr/bin/env bash
# PROBE-3: GSO/NSO monthly socio-economic release (IIP, retail, FDI, CPI)
# Recon date: 2026-06-14
# Status: PASS via nso.gov.vn (new GSO domain) with GlobalSign intermediate CA
# IMPORTANT: www.gso.gov.vn has TLS cert SAN mismatch (cert=nso.gov.vn, served as www.gso.gov.vn)
#   Use nso.gov.vn domain with combined CA bundle (see below)
# Source: https://www.nso.gov.vn/ (WordPress CMS, not Liferay)
# Data: Excel downloads per indicator + monthly press release pages

set -euo pipefail

# --- CERT SETUP ---
# Download GlobalSign RSA OV SSL CA 2018 intermediate
CACERT=/etc/ssl/certs/ca-certificates.crt
GS_INT=/tmp/gs_int_final.pem
COMBINED_CA=/tmp/gs_combined_v2.pem

if [ ! -f "$GS_INT" ]; then
  curl -s --connect-timeout 10 \
    "http://secure.globalsign.com/cacert/gsrsaovsslca2018.crt" \
    -o /tmp/gs_int_raw.crt
  openssl x509 -inform DER -in /tmp/gs_int_raw.crt -out "$GS_INT"
fi

cat "$CACERT" "$GS_INT" > "$COMBINED_CA"

UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
HEADERS=(-H "User-Agent: $UA" -H "Accept-Language: vi-VN,vi;q=0.9")

echo "=== Fetch NSO monthly overview page ==="
curl -s --cacert "$COMBINED_CA" -L \
  -w '\nHTTP:%{http_code}\nFINAL:%{url_effective}' \
  "${HEADERS[@]}" \
  "https://www.nso.gov.vn/bao-cao-tinh-hinh-kinh-te-xa-hoi-hang-thang/"

echo ""
echo ""
echo "=== Fetch most recent monthly press release (May 2026) ==="
curl -s --cacert "$COMBINED_CA" -L \
  -w '\nHTTP:%{http_code}\nFINAL:%{url_effective}' \
  "${HEADERS[@]}" \
  "https://www.nso.gov.vn/bai-top/2026/06/bao-cao-tinh-hinh-kinh-te-xa-hoi-thang-nam-va-5-thang-dau-nam-2025-2/" \
  -o /tmp/nso_monthly_may.html

echo ""
echo ""
echo "=== Download IIP Excel for May 2026 ==="
curl -s --cacert "$COMBINED_CA" -L \
  -w '\nHTTP:%{http_code}\nSIZE:%{size_download}' \
  "${HEADERS[@]}" \
  "https://www.nso.gov.vn/wp-content/uploads/2026/06/IIP-Vie.xlsx" \
  -o /tmp/iip_may2026.xlsx

echo ""
echo ""
echo "=== Download full monthly Excel (all 19 sheets including CPI, FDI, retail) ==="
curl -s --cacert "$COMBINED_CA" -L \
  -w '\nHTTP:%{http_code}\nSIZE:%{size_download}' \
  "${HEADERS[@]}" \
  "https://www.nso.gov.vn/wp-content/uploads/2026/06/02.-Bieu-T5.2026-final.xlsx" \
  -o /tmp/gso_monthly_may2026.xlsx
