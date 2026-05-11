#!/bin/bash
# run-sbv-debug.sh — Manual SBV/FX rate fetch debug trigger for VPS
#
# Usage:
#   ./run-sbv-debug.sh [--verbose] [--dry-run]
#
# Args:
#   --verbose   Print VCB XML response details, parsed rate, push response body
#   --dry-run   Print what would happen without actually fetching or pushing
#
# Logs to: /tmp/sbv-debug-<timestamp>.log

set -euo pipefail

# ── Config (same vars used by fetch-sbv.sh) ───────────────────────────────────
API_URL="${MCP_BASE_URL:-__MCP_BASE__}/api/push-sbv-rates"
API_KEY="${VPS_PUSH_API_KEY:-__API_KEY__}"
VCB_URL="https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx?b=68"

# ── Log setup ─────────────────────────────────────────────────────────────────
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
LOG="/tmp/sbv-debug-${TIMESTAMP}.log"
touch "$LOG"

log() {
  local msg="$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"
  echo "$msg" | tee -a "$LOG"
}

# ── Argument parsing ──────────────────────────────────────────────────────────
VERBOSE=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --verbose)
      VERBOSE=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      log "WARN: unknown arg $1 — skipping"
      shift
      ;;
  esac
done

log "=== SBV DEBUG START ==="
log "verbose=${VERBOSE} dry_run=${DRY_RUN}"
log "Log file: ${LOG}"

if $DRY_RUN; then
  log "DRY RUN: would fetch VCB XML from ${VCB_URL}"
  log "DRY RUN: would parse <Exrate CurrencyCode=\"USD\" ... Transfer=\"...\"/>"
  log "DRY RUN: would push to ${API_URL} with {usdVndOfficial, fetchedAt}"
  log "=== SBV DEBUG DONE (dry run) ==="
  exit 0
fi

# ── Step 1: Fetch VCB FX XML ──────────────────────────────────────────────────
log "Fetching VCB FX XML from ${VCB_URL} ..."
T0=$(date -u +%s%3N)

HTTP_CODE_FILE=$(mktemp)
XML=$(curl -s -w "%{http_code}" --connect-timeout 10 --max-time 15 \
  -H "User-Agent: Mozilla/5.0 (compatible; VN-Market-VPS/1.0)" \
  -o /dev/null \
  "$VCB_URL" 2>/dev/null | tail -1 || echo "000")

# Fetch body separately for parsing
XML_BODY=$(curl -s --connect-timeout 10 --max-time 15 \
  -H "User-Agent: Mozilla/5.0 (compatible; VN-Market-VPS/1.0)" \
  "$VCB_URL" 2>/dev/null)

DUR=$(( $(date -u +%s%3N) - T0 ))
rm -f "$HTTP_CODE_FILE"

if [ -z "$XML_BODY" ]; then
  log "FAIL: empty VCB response (dur=${DUR}ms)"
  exit 1
fi

XML_SIZE=${#XML_BODY}
log "VCB XML: ${XML_SIZE}B received (dur=${DUR}ms)"

if $VERBOSE; then
  log "Raw XML (first 500 chars):"
  echo "${XML_BODY:0:500}" | tee -a "$LOG"
fi

# ── Step 2: Parse USD/VND rate ────────────────────────────────────────────────
log "Parsing USD Transfer rate ..."

USD_RATE=$(echo "$XML_BODY" | python3 -c "
import sys, xml.etree.ElementTree as ET
try:
    tree = ET.fromstring(sys.stdin.read())
    for ex in tree.iter('Exrate'):
        if ex.get('CurrencyCode', '').upper() == 'USD':
            rate = ex.get('Transfer', '') or ex.get('Buy', '')
            rate = rate.replace(',', '')
            print(float(rate))
            sys.exit(0)
    print(0)
except Exception as e:
    print(0)
" 2>/dev/null | head -1)

if [ -z "$USD_RATE" ] || [ "$USD_RATE" = "0" ]; then
  log "FAIL: could not extract USD/VND rate from XML"
  exit 1
fi

log "Parsed USD/VND rate: ${USD_RATE}"

# ── Step 3: Push to MCP ───────────────────────────────────────────────────────
FETCHED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
JSON=$(jq -n --arg rate "$USD_RATE" --arg ts "$FETCHED_AT" \
  '{usdVndOfficial: ($rate | tonumber), fetchedAt: $ts}')

if $VERBOSE; then
  log "Pushing payload: ${JSON}"
fi

RESP=$(curl -s --connect-timeout 10 --max-time 15 \
  -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -H "User-Agent: VN-Market-VPS-Debug/1.0" \
  -d "$JSON")

log "Push response: ${RESP}"

log "=== SBV DEBUG DONE ==="
log "Full log at: ${LOG}"
