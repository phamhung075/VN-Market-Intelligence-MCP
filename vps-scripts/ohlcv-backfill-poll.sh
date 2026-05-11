#!/bin/bash
# ohlcv-backfill-poll.sh — Task 1361 / Sprint 123
#
# Polls GET /api/ohlcv-backfill-queue every 60 s.
# When pending=true, runs fetch-ohlcv-backfill.sh then
# POSTs to /api/ohlcv-backfill-done to acknowledge completion.
#
# Designed to be run as a one-shot script on the VPS after deployment:
#   nohup /root/ohlcv-backfill-poll.sh &
#
# Or call from the systemd unit EnvironmentFile if a persistent watcher
# is preferred. Exits automatically after signalling done.
#
# Environment variables (substitute by deploy-vinahost.sh):
#   MCP_BASE  — base URL of MCP server, e.g. http://<france-ip>:3000
#   API_KEY   — value of VPS_PUSH_API_KEY

MCP_BASE="${MCP_BASE:-__MCP_BASE__}"
API_KEY="${API_KEY:-__API_KEY__}"
LOG="/var/log/ohlcv-backfill-poll.log"
QUEUE_URL="${MCP_BASE}/api/ohlcv-backfill-queue"
DONE_URL="${MCP_BASE}/api/ohlcv-backfill-done"
BACKFILL_SCRIPT="/root/fetch-ohlcv-backfill.sh"
POLL_INTERVAL=60   # seconds between polls

# ── Log rotation (10 MB cap) ──────────────────────────────────────────────────
# Source shared constants (LOG_ROTATE_BYTES) from vps-lib.sh
# shellcheck source=/root/vps-lib.sh
[ -f /root/vps-lib.sh ] && LOG_ROTATE_BYTES=$(grep '^LOG_ROTATE_BYTES=' /root/vps-lib.sh | cut -d= -f2) || LOG_ROTATE_BYTES=10485760
LOG_SIZE=$(stat -c%s "$LOG" 2>/dev/null || echo 0)
if [ "$LOG_SIZE" -gt $LOG_ROTATE_BYTES ]; then mv "$LOG" "$LOG.old"; fi

_log() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [OHLCV-POLL] $*" | tee -a "$LOG"
}

_log "=== START === polling ${QUEUE_URL} every ${POLL_INTERVAL}s"

while true; do
  # ── Poll the queue endpoint ──────────────────────────────────────────────────
  RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "x-api-key: ${API_KEY}" \
    "${QUEUE_URL}" 2>>"$LOG")
  BODY=$(curl -s \
    -H "x-api-key: ${API_KEY}" \
    "${QUEUE_URL}" 2>>"$LOG")

  HTTP_CODE=$(echo "$RESPONSE")

  if [ "$HTTP_CODE" != "200" ]; then
    _log "WARN  GET ${QUEUE_URL} returned HTTP ${HTTP_CODE} — retrying in ${POLL_INTERVAL}s"
    sleep "$POLL_INTERVAL"
    continue
  fi

  PENDING=$(echo "$BODY" | grep -o '"pending":true' || true)

  if [ -n "$PENDING" ]; then
    _log "INFO  pending=true — running ${BACKFILL_SCRIPT}"

    if [ -x "$BACKFILL_SCRIPT" ]; then
      "$BACKFILL_SCRIPT" >> "$LOG" 2>&1
      EXIT_CODE=$?
    else
      _log "WARN  ${BACKFILL_SCRIPT} not found or not executable — skipping run"
      EXIT_CODE=1
    fi

    _log "INFO  backfill script exited with code ${EXIT_CODE}"

    # Signal done regardless of exit code so the server unblocks
    DONE_RESP=$(curl -s -w "\nHTTP:%{http_code}" \
      -X POST \
      -H "x-api-key: ${API_KEY}" \
      "${DONE_URL}" 2>>"$LOG")
    DONE_HTTP=$(echo "$DONE_RESP" | grep -o 'HTTP:[0-9]*' | cut -d: -f2)
    _log "INFO  POST ${DONE_URL} → HTTP ${DONE_HTTP}"

    _log "=== DONE === backfill acknowledged, exiting poll loop"
    exit 0
  else
    _log "INFO  pending=false — sleeping ${POLL_INTERVAL}s"
  fi

  sleep "$POLL_INTERVAL"
done
