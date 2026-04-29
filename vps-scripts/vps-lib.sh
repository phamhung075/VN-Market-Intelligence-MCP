#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# VPS Shared Logging Library — source this in all vps-scripts
# Usage: source /root/vps-lib.sh SERVICE_NAME LOG_FILE
#
# Provides: log_info, log_warn, log_error, log_step, log_push, log_done
# Format:   2026-04-13T20:00:00Z [PRICE ] INFO  Step 2: VN stocks 60 items (1234ms)
# ═══════════════════════════════════════════════════════════════════════════

# ── Shared constant — 10 MB log rotation cap ─────────────────────────────
# All vps-scripts source this file to access LOG_ROTATE_BYTES rather than
# inlining the magic number. Change the value here to affect all scripts.
LOG_ROTATE_BYTES=10485760

VPS_SERVICE="${1:-unknown}"
VPS_LOG="${2:-/var/log/vps-unknown.log}"
VPS_START_TS=$(date -u +%s)

# ── Log rotation (10 MB cap) ──────────────────────────────────────────────
_rotate_log() {
  local size
  size=$(stat -c%s "$VPS_LOG" 2>/dev/null || echo 0)
  if [ "$size" -gt "$LOG_ROTATE_BYTES" ]; then
    mv "$VPS_LOG" "${VPS_LOG}.old"
  fi
}
_rotate_log

# ── Tag (6 chars padded) ──────────────────────────────────────────────────
_tag() {
  printf "%-6s" "$VPS_SERVICE" | tr '[:lower:]' '[:upper:]'
}

# ── Core log function ─────────────────────────────────────────────────────
_log() {
  local level="$1"; shift
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [$(_tag)] ${level}  $*" >> "$VPS_LOG"
}

log_info()  { _log "INFO "; echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [$(_tag)] INFO  $*" >> "$VPS_LOG"; }
log_warn()  { _log "WARN "; }
log_error() { _log "ERROR"; }

# log_step STEP_NUM DESCRIPTION [duration_ms]
log_step() {
  local step="$1" desc="$2" dur="${3:-}"
  if [ -n "$dur" ]; then
    _log "INFO " "Step ${step}: ${desc} (${dur}ms)"
  else
    _log "INFO " "Step ${step}: ${desc}"
  fi
}

# log_push ENDPOINT ITEMS RESPONSE [duration_ms]
log_push() {
  local endpoint="$1" items="$2" resp="$3" dur="${4:-}"
  local resp_short
  resp_short=$(echo "$resp" | head -c 120)
  if [ -n "$dur" ]; then
    _log "INFO " "PUSH ${items} items → ${endpoint} | ${resp_short} (${dur}ms)"
  else
    _log "INFO " "PUSH ${items} items → ${endpoint} | ${resp_short}"
  fi
}

# log_done [extra_info]
log_done() {
  local elapsed=$(( $(date -u +%s) - VPS_START_TS ))
  _log "INFO " "=== DONE in ${elapsed}s ${1:-} ==="
}

# log_start
log_start() {
  _log "INFO " "=== START ==="
}

# ms_since SECONDS_TIMESTAMP → elapsed ms
ms_since() {
  echo $(( ( $(date -u +%s%3N) - $1 ) ))
}

# epoch_ms → current unix ms
epoch_ms() {
  date -u +%s%3N
}
