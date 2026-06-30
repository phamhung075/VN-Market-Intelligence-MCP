#!/usr/bin/env bash
# cowork-fb-daily-firer.sh — OS-level headless firer for fb-market-poster guaranteed slots
#
# PURPOSE: Fires the fb-daily (09:15 UTC Mon-Fri) and fb-weekend (13:13 UTC Sat-Sun)
#   cowork guaranteed slots headlessly via `claude -p`, without requiring a live
#   Claude Code CLI session. Closes root cause documented in project memory:
#   project_cowork_guaranteed_slot_needs_live_cli_session.
#
# ROOT CAUSE: The cowork-team master dispatcher (*/15 CronCreate) is SESSION-SCOPED.
#   When the CLI session ends, the dispatcher evaporates. RemoteTrigger backstop was
#   retired (STANDING: no cloud RemoteTrigger — all local). Layer B evaporation =
#   fb-daily misses at 09:15Z.
#
# FIX MECHANISM: launchd LaunchAgent (com.vn-market.fb-daily-firer) runs this script
#   every 15 min (matching the cowork cadence). The script gates on UTC weekday +
#   time window, then invokes `claude --dangerously-skip-permissions -p` to spawn a
#   headless fb-market-poster session — exactly what the cowork dispatcher does via
#   Agent(fb-market-poster, prompt="run .../main.md  slot=fb-daily").
#
# DEDUP SAFETY: The fb-market-poster flow claims `published:fb-daily:<VN-DATE>`
#   (task_kind=cowork-slot, TTL=100800s/28h) BEFORE calling send_telegram (per
#   spawn-fanout.md § Published Marker Gate, FR-P2-7). Even if this script fires
#   at 09:00 AND 09:15, only the first invocation that wins that marker will publish.
#   No additional wrapper-level dedup is needed.
#
# TIME WINDOWS (UTC, matched against cowork-schedule.json cron fields):
#   fb-daily  : Mon-Fri 09:00–09:29 UTC  (cron "15 9 * * 1-5" + ±15 min window)
#   fb-weekend: Sat-Sun 13:00–13:29 UTC  (cron "13 13 * * 6,0" + ±13 min window)
#
# USAGE:
#   bash scripts/cowork-fb-daily-firer.sh [--dry-run]
#   CLAUDE_BIN=/path/to/claude bash scripts/cowork-fb-daily-firer.sh
#
# FLAGS:
#   --dry-run   Print what would be done; never invoke claude, never write post.
#
# INVARIANTS:
#   - NEVER posts without a live gateway session (flow handles tool calls)
#   - NEVER bypasses fb-market-poster flow's own published-marker dedup gate
#   - NEVER runs outside the UTC time window (weekday + hour gate)
#
# OWNING FLOW:  docs/agents/cowork-team/flow/main.md (Step 5 spawn-fanout.md)
# FLOW PATH:    docs/agents/fb-market-poster/flow/main.md  slot=<slot_id>
# SCHEDULE SSOT: docs/data/cowork-schedule.json (.slots[] | select(.slot_id=="fb-daily"))
# PLIST:        launchd/com.vn-market.fb-daily-firer.plist
# INSTALL:      launchctl load ~/Library/LaunchAgents/com.vn-market.fb-daily-firer.plist

set -euo pipefail

# ── 0. Resolve repo root (script may be called from any cwd) ─────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── 1. Parse flags ────────────────────────────────────────────────────────────
DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    *) echo "[fb-daily-firer] WARN: unknown arg '$arg' — ignored" >&2 ;;
  esac
done

# ── 2. Log + binary config ────────────────────────────────────────────────────
LOG_FILE="$REPO_ROOT/docs/agent-memory/sessions/fb-daily-firer.log"
LOG_ERR_FILE="$REPO_ROOT/docs/agent-memory/sessions/fb-daily-firer-error.log"
CLAUDE_BIN="${CLAUDE_BIN:-/Users/admin/.local/bin/claude}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG_FILE"; }

# ── 3. Source .env (Telegram tokens; ANTHROPIC_API_KEY may also live there) ──
if [ -f "$REPO_ROOT/.env" ]; then
  # shellcheck disable=SC1091
  set +u
  # Export only — never exec untrusted shell from .env
  while IFS='=' read -r key value; do
    case "$key" in
      '#'*|'') continue ;;
    esac
    export "$key=$value" 2>/dev/null || true
  done < <(grep -v '^#' "$REPO_ROOT/.env" | grep '=')
  set -u
fi

# ── 4. UTC time + day-of-week gate ───────────────────────────────────────────
# Use `date -u` to get UTC values (macOS compatible — no --utc needed).
UTC_DOW=$(date -u +%u)   # 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat 7=Sun
UTC_HOUR=$(date -u +%-H) # 0-23, no leading zero
UTC_MIN=$(date -u +%-M)  # 0-59, no leading zero

SLOT_ID=""
FLOW_PATH="docs/agents/fb-market-poster/flow/main.md"

# Mon-Fri (DOW 1-5): fire in 09:00-09:29Z window for fb-daily (cron "15 9 * * 1-5")
if [ "$UTC_DOW" -ge 1 ] && [ "$UTC_DOW" -le 5 ]; then
  if [ "$UTC_HOUR" -eq 9 ] && [ "$UTC_MIN" -ge 0 ] && [ "$UTC_MIN" -le 29 ]; then
    SLOT_ID="fb-daily"
  fi
fi

# Sat-Sun (DOW 6,7): fire in 13:00-13:29Z window for fb-weekend (cron "13 13 * * 6,0")
if [ "$UTC_DOW" -ge 6 ]; then
  if [ "$UTC_HOUR" -eq 13 ] && [ "$UTC_MIN" -ge 0 ] && [ "$UTC_MIN" -le 29 ]; then
    SLOT_ID="fb-weekend"
  fi
fi

if [ -z "$SLOT_ID" ]; then
  # Outside all fire windows — silent no-op (most 15-min ticks are this)
  exit 0
fi

# ── 5. Log fire intent ────────────────────────────────────────────────────────
log "--- fb-daily-firer: slot=$SLOT_ID DOW=$UTC_DOW ${UTC_HOUR}:$(printf '%02d' "$UTC_MIN")Z ---"

# ── 6. Dry-run exit ───────────────────────────────────────────────────────────
if $DRY_RUN; then
  log "DRY-RUN: would invoke: $CLAUDE_BIN --dangerously-skip-permissions -p 'run $FLOW_PATH  slot=$SLOT_ID'"
  exit 0
fi

# ── 7. Verify claude binary ───────────────────────────────────────────────────
if [ ! -x "$CLAUDE_BIN" ]; then
  log "ERROR: claude binary not found or not executable at '$CLAUDE_BIN'" | tee -a "$LOG_ERR_FILE" >&2
  exit 1
fi

# ── 8. Invoke fb-market-poster flow headlessly ────────────────────────────────
# Reproduces what the cowork dispatcher does in spawn-fanout.md Step 5:
#   Agent(fb-market-poster, prompt="run <flow_path>  slot=<slot_id>", run_in_background=true)
# Here we run synchronously (launchd manages the process lifecycle).
# The flow's own published-marker gate (published:<slot_id>:<VN-DATE>) prevents double-publish.
log "invoking: $CLAUDE_BIN --dangerously-skip-permissions -p 'run $FLOW_PATH  slot=$SLOT_ID'"

cd "$REPO_ROOT"

"$CLAUDE_BIN" \
  --dangerously-skip-permissions \
  --no-update-notification \
  -p "run $FLOW_PATH  slot=$SLOT_ID" \
  >> "$LOG_FILE" 2>> "$LOG_ERR_FILE"

EXIT_CODE=$?
log "fb-market-poster flow exited (slot=$SLOT_ID exit_code=$EXIT_CODE)"
exit $EXIT_CODE
