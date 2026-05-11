#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# VPS Status — dev team one-shot health check
# Usage: /root/vps-status.sh
# Shows: service state, last run, last push result, recent errors
# ═══════════════════════════════════════════════════════════════════════════

echo "═══════════════════════════════════════════════════"
echo " VPS STATUS — $(date -u +%Y-%m-%dT%H:%M:%SZ) UTC"
echo "═══════════════════════════════════════════════════"
echo ""

# ── Systemd service state ─────────────────────────────────────────────────
echo "--- SERVICES ---"
for SVC in vn-price-fetch vn-bctc-fetch vn-news-fetch vn-sbv-fetch vn-foreign-flow; do
  STATE=$(systemctl is-active ${SVC}.service 2>/dev/null)
  ENABLED=$(systemctl is-enabled ${SVC}.service 2>/dev/null)
  UPTIME=$(systemctl show ${SVC}.service --property=ActiveEnterTimestamp 2>/dev/null | cut -d= -f2)
  printf "  %-20s  %-10s  enabled=%-4s  since=%s\n" "$SVC" "$STATE" "$ENABLED" "$UPTIME"
done

echo ""
echo "--- LAST LOG LINES PER SERVICE ---"

declare -A LOGS=(
  [price]="/var/log/vn-price-fetch.log"
  [bctc]="/var/log/vn-bctc-fetch.log"
  [news]="/var/log/vn-news-fetch.log"
  [sbv]="/var/log/vn-sbv-fetch.log"
  [fflow]="/var/log/vn-foreign-flow.log"
)

for KEY in price bctc news sbv fflow; do
  LOG="${LOGS[$KEY]}"
  echo ""
  echo "  [${KEY^^}] ${LOG}"
  if [ -f "$LOG" ]; then
    # Last heartbeat
    HB=$(grep "heartbeat" "$LOG" | tail -1)
    # Last PUSH result
    PUSH=$(grep "PUSH" "$LOG" | tail -1)
    # Last ERROR
    ERR=$(grep "ERROR" "$LOG" | tail -1)
    [ -n "$HB"   ] && echo "    heartbeat: $HB"
    [ -n "$PUSH" ] && echo "    last push: $PUSH"
    [ -n "$ERR"  ] && echo "    ERROR:     $ERR"
    [ -z "$HB" ] && [ -z "$PUSH" ] && echo "    (no entries yet)"
  else
    echo "    (log not found — service may not have run yet)"
  fi
done

echo ""
echo "--- RECENT ERRORS (last 20 across all logs) ---"
grep -h "ERROR\|WARN\|FAIL\|block\|403\|429\|robot\|captcha" \
  /var/log/vn-price-fetch.log \
  /var/log/vn-bctc-fetch.log \
  /var/log/vn-news-fetch.log \
  /var/log/vn-sbv-fetch.log \
  /var/log/vn-foreign-flow.log 2>/dev/null \
  | sort | tail -20

echo ""
echo "--- DISK & MEMORY ---"
df -h / | tail -1 | awk '{printf "  disk: %s used of %s (%s free)\n", $3, $2, $4}'
free -m | grep Mem | awk '{printf "  mem:  %sMB used of %sMB\n", $3, $2}'

echo ""
echo "--- LOG SIZES ---"
for LOG in /var/log/vn-*.log; do
  [ -f "$LOG" ] && printf "  %-40s %s\n" "$(basename $LOG)" "$(du -sh $LOG | cut -f1)"
done

echo ""
echo "═══════════════════════════════════════════════════"
echo " Redeploy: ./deploy-vinahost.sh"
echo " Restart:  systemctl restart vn-<service>.service"
echo " Journal:  journalctl -u vn-<service> -n 50"
echo "═══════════════════════════════════════════════════"
