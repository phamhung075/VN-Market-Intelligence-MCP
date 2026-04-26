#!/bin/bash
# run-news-debug.sh — Manual news fetch debug trigger for VPS
#
# Usage:
#   ./run-news-debug.sh [--verbose] [--dry-run]
#
# Args:
#   --verbose   Print each HTTP request, response HTTP code, item count per source
#   --dry-run   Print all source URLs without actually fetching or pushing
#
# Logs to: /tmp/news-debug-<timestamp>.log

set -euo pipefail

# ── Config (same vars used by fetch-vn-news.sh) ───────────────────────────────
API_URL="${MCP_BASE_URL:-__MCP_BASE__}/api/push-news"
API_KEY="${VPS_PUSH_API_KEY:-__API_KEY__}"

# ── Log setup ─────────────────────────────────────────────────────────────────
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
LOG="/tmp/news-debug-${TIMESTAMP}.log"
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

log "=== NEWS DEBUG START ==="
log "verbose=${VERBOSE} dry_run=${DRY_RUN}"
log "Log file: ${LOG}"

# ── Source definitions ────────────────────────────────────────────────────────
declare -A SOURCES
SOURCES["cafef-market"]="https://cafef.vn/thi-truong-chung-khoan.rss"
SOURCES["cafef-biz"]="https://cafef.vn/doanh-nghiep.rss"
SOURCES["vnexpress"]="https://vnexpress.net/rss/kinh-doanh.rss"
SOURCES["vneconomy-stocks"]="https://vneconomy.vn/chung-khoan.rss"
SOURCES["vneconomy-finance"]="https://vneconomy.vn/tai-chinh.rss"
SOURCES["vietstock-stocks"]="https://vietstock.vn/830/chung-khoan/co-phieu.rss"
SOURCES["vietstock-insider"]="https://vietstock.vn/739/chung-khoan/giao-dich-noi-bo.rss"
SOURCES["vietstock-macro"]="https://vietstock.vn/761/kinh-te/vi-mo.rss"
SOURCES["vietnambiz"]="https://vietnambiz.vn/chung-khoan.rss"
SOURCES["vnbusiness"]="https://vnbusiness.vn/rss/chung-khoan.rss"
SOURCES["tuoitre"]="https://tuoitre.vn/rss/kinh-doanh.rss"
SOURCES["nhandan-economy"]="https://nhandan.vn/rss/kinhte-1185.rss"
SOURCES["nhandan-stocks"]="https://nhandan.vn/rss/chungkhoan-1191.rss"
SOURCES["nld"]="https://nld.com.vn/rss/kinh-te/tai-chinh-chung-khoan.rss"

SOURCE_COUNT=${#SOURCES[@]}
log "Sources configured: ${SOURCE_COUNT}"

if $DRY_RUN; then
  log "DRY RUN: would fetch these sources:"
  for NAME in "${!SOURCES[@]}"; do
    log "  ${NAME}: ${SOURCES[$NAME]}"
  done
  log "DRY RUN: would push merged+deduplicated items to ${API_URL}"
  log "=== NEWS DEBUG DONE (dry run) ==="
  exit 0
fi

# ── Probe each source ────────────────────────────────────────────────────────
SUCCESS_COUNT=0
FAIL_COUNT=0

for NAME in "${!SOURCES[@]}"; do
  URL="${SOURCES[$NAME]}"
  if $VERBOSE; then
    log "Probing ${NAME}: GET ${URL}"
  fi

  T0=$(date -u +%s%3N)
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    --connect-timeout 10 --max-time 15 \
    -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
    -H "Accept: application/rss+xml,application/xml,text/xml,*/*" \
    -H "Referer: https://www.google.com/" \
    -L "$URL" 2>/dev/null || echo "000")
  DUR=$(( $(date -u +%s%3N) - T0 ))

  if [ "$HTTP_CODE" = "200" ]; then
    log "  OK   ${NAME} http=${HTTP_CODE} dur=${DUR}ms"
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  else
    log "  FAIL ${NAME} http=${HTTP_CODE} dur=${DUR}ms url=${URL}"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
done

log "=== NEWS DEBUG DONE: success=${SUCCESS_COUNT} fail=${FAIL_COUNT} ==="
log "Full log at: ${LOG}"
