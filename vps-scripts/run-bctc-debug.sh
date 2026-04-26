#!/bin/bash
# run-bctc-debug.sh — Manual BCTC fetch debug trigger for VPS
#
# Usage:
#   ./run-bctc-debug.sh [--ticker FPT] [--verbose] [--dry-run]
#
# Args:
#   --ticker CODE   Limit fetch to a specific stock ticker (repeatable)
#   --verbose       Print each HTTP request, response status, PDF size, queue state
#   --dry-run       Print what would happen without actually fetching or pushing
#
# Logs to: /tmp/bctc-debug-<timestamp>.log

set -euo pipefail

# ── Config (same vars used by fetch-bctc.sh) ─────────────────────────────────
API_URL="${MCP_BASE_URL:-__MCP_BASE__}/api/push-bctc-pdf"
QUEUE_URL="${MCP_BASE_URL:-__MCP_BASE__}/api/bctc-fetch-queue"
API_KEY="${VPS_PUSH_API_KEY:-__API_KEY__}"
MAX_PDF_BYTES=52428800  # 50 MB

# ── Log setup ────────────────────────────────────────────────────────────────
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
LOG="/tmp/bctc-debug-${TIMESTAMP}.log"
touch "$LOG"

log() {
  local msg="$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"
  echo "$msg" | tee -a "$LOG"
}

# ── Argument parsing ──────────────────────────────────────────────────────────
TICKERS=()
VERBOSE=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ticker)
      shift
      TICKERS+=("$1")
      shift
      ;;
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

log "=== BCTC DEBUG START ==="
log "verbose=${VERBOSE} dry_run=${DRY_RUN} tickers=(${TICKERS[*]:-all})"
log "Log file: ${LOG}"

# ── Step 1: Pull fetch queue ──────────────────────────────────────────────────
log "Fetching queue from ${QUEUE_URL} ..."

QUEUE=$(curl -s --connect-timeout 10 --max-time 15 \
  "$QUEUE_URL?skip_enrichment=true" \
  -H "X-API-Key: $API_KEY" \
  -H "User-Agent: VN-Market-VPS-Debug/1.0")

if [ -z "$QUEUE" ]; then
  log "FAIL: cannot reach MCP server at ${QUEUE_URL}"
  exit 1
fi

if $VERBOSE; then
  log "Raw queue response:"
  echo "$QUEUE" | jq . 2>/dev/null | tee -a "$LOG" || echo "$QUEUE" >> "$LOG"
fi

TOTAL=$(echo "$QUEUE" | jq '.total // 0')
log "Queue: ${TOTAL} items pending"

if [ "$TOTAL" = "0" ] || [ "$TOTAL" = "null" ]; then
  log "Queue is empty — nothing to fetch"
  log "=== BCTC DEBUG DONE (empty queue) ==="
  exit 0
fi

# ── Step 2: Apply ticker filter ───────────────────────────────────────────────
# Build jq filter expression for ticker whitelist
if [ "${#TICKERS[@]}" -gt 0 ]; then
  TICKER_LIST=$(printf '"%s",' "${TICKERS[@]}")
  TICKER_LIST="[${TICKER_LIST%,}]"
  log "Applying ticker filter: ${TICKER_LIST}"
  ITEMS=$(echo "$QUEUE" | jq -c --argjson filter "$TICKER_LIST" '.queue[] | select(.action_code as $c | $filter | index($c) != null)')
else
  ITEMS=$(echo "$QUEUE" | jq -c '.queue[]')
fi

ITEM_COUNT=$(echo "$ITEMS" | grep -c . 2>/dev/null || echo 0)
log "Items after filter: ${ITEM_COUNT}"

if [ "$ITEM_COUNT" = "0" ]; then
  log "No items match filter — done"
  log "=== BCTC DEBUG DONE (no matching items) ==="
  exit 0
fi

# ── Step 3: Process each item ─────────────────────────────────────────────────
SUCCESS_COUNT=0
FAIL_COUNT=0

echo "$ITEMS" | while read -r ITEM; do
  CODE=$(echo "$ITEM"    | jq -r '.action_code')
  YEAR=$(echo "$ITEM"    | jq -r '.period_year')
  QTR=$(echo "$ITEM"     | jq -r '.period_quarter')
  HINTS=$(echo "$ITEM"   | jq -r '.source_hints[]? // empty' 2>/dev/null)

  log "--- Processing ${CODE} ${YEAR}-${QTR} ---"

  if $VERBOSE; then
    log "  Queue row state before fetch:"
    echo "$ITEM" | jq . 2>/dev/null | while read -r line; do log "    $line"; done
  fi

  if $DRY_RUN; then
    log "  DRY RUN: would attempt these URLs:"
    if [ -z "$HINTS" ]; then
      log "    (no source_hints cached — discovery needed)"
    else
      for URL in $HINTS; do
        log "    GET ${URL}"
      done
    fi
    continue
  fi

  # Live fetch
  TMP_PDF=$(mktemp /tmp/bctc_debug_XXXXXX.pdf)
  FETCHED=0
  FETCH_URL=""

  for HINT_URL in $HINTS; do
    if $VERBOSE; then
      log "  Trying: GET ${HINT_URL}"
    fi

    HTTP_CODE=$(curl -s -o "$TMP_PDF" -w "%{http_code}" \
      --connect-timeout 15 --max-time 120 \
      --max-filesize "$MAX_PDF_BYTES" \
      -L \
      -H "User-Agent: VN-Market-Intelligence/1.0" \
      "$HINT_URL")

    FSIZE=$(stat -c%s "$TMP_PDF" 2>/dev/null || echo 0)
    MIME=$(file --mime-type -b "$TMP_PDF" 2>/dev/null || echo "unknown")

    if $VERBOSE; then
      log "    HTTP ${HTTP_CODE} | size=${FSIZE}B | mime=${MIME}"
    fi

    if [ "$HTTP_CODE" = "200" ] && [ "$FSIZE" -gt 1024 ] && echo "$MIME" | grep -q "pdf"; then
      FETCHED=1
      FETCH_URL="$HINT_URL"
      log "  FETCHED ${CODE} ${YEAR}-${QTR}: ${FSIZE}B from ${HINT_URL}"
      break
    else
      log "  SKIP hint HTTP=${HTTP_CODE} size=${FSIZE}B mime=${MIME} url=${HINT_URL}"
    fi
  done

  if [ "$FETCHED" = "0" ]; then
    log "  FAIL ${CODE} ${YEAR}-${QTR}: all hints exhausted"
    rm -f "$TMP_PDF"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    continue
  fi

  # Push to MCP
  log "  Pushing ${CODE} ${YEAR}-${QTR} to ${API_URL} ..."
  RESP=$(curl -s --connect-timeout 10 --max-time 30 \
    -X POST "$API_URL" \
    -H "X-API-Key: $API_KEY" \
    -H "User-Agent: VN-Market-VPS-Debug/1.0" \
    -F "action_code=$CODE" \
    -F "period_year=$YEAR" \
    -F "period_quarter=$QTR" \
    -F "source_url=$FETCH_URL" \
    -F "pdf=@$TMP_PDF;type=application/pdf")

  log "  Push response: ${RESP}"
  rm -f "$TMP_PDF"

  if $VERBOSE; then
    log "  Queue row state after push attempt: (check /api/bctc-fetch-queue for updated status)"
  fi

  SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
done

log "=== BCTC DEBUG DONE: success=${SUCCESS_COUNT} fail=${FAIL_COUNT} ==="
log "Full log at: ${LOG}"
