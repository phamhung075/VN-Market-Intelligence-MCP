#!/usr/bin/env bash
# scripts/agents-flow/memory-prune-sweep.sh — UC-MDH-P3 (memory-docs-hygiene-P3, RESCOPE)
#
# File-ops-only prune sweep for docs/agent-memory/ debris, wired into code-janitor's
# sweep cadence. This script NEVER touches docs/data/orch/orch-state.json — the
# signal_queue row for the PO decision payload below is appended by a FLOW step
# (via .claude/skills/signal-dashboard/SKILL.md), NOT by this script. Keeping that
# boundary here is deliberate: shell scripts writing orch-state.json directly bypass
# the CAS-guarded orch-apply.sh contract (SSOT-W1).
#
# Four idempotent sweeps (safe to re-run any time — a second run finds nothing left
# to move/delete and no-ops cleanly):
#   1. docs/agent-memory/sessions/*.md older than SESSION_MAX_AGE_DAYS (default 14)
#      -> docs/agent-memory/sessions/archive/
#      Only *.md files are touched — sessions/ root also holds *.log (preflight-lsof,
#      cowork-guaranteed-slot-firer, fleet-push, ...) and one *.json file; those
#      writers are left untouched (excluded by the -name "*.md" filter, not by dir).
#   2. docs/agent-memory/health/team-tool-recheck-*.md older than HEALTH_MAX_AGE_DAYS
#      (default 30) -> deleted. Writer is a dead cloud RemoteTrigger
#      (trig_019Q8D5xttjZn6iytx2Ld9dW), silent since 2026-06-23 per the 2026-06-22
#      standing no-RemoteTrigger directive (feedback_no_remote_trigger_all_local).
#      Also writes ONE idempotent payload file to docs/signals/ (skipped on re-run
#      once any prior payload exists) routing the replace-with-local-cron-or-retire
#      decision to PO — this script writes the file only; it does NOT append to
#      .signal_queue.rows[] itself.
#   3. docs/agent-memory/session-logs/*.md folded into sessions/archive/, then the
#      now-empty session-logs/ dir is removed (dead debris family, duplicates the
#      sessions/ concept — memory-docs-hygiene-I12).
#   4. docs/agent-memory/scheduled-task-execution-*.md (loose files at the
#      agent-memory root) moved into docs/agent-memory/archive/.
#
# Owning flow: docs/agents/code-janitor/flow/main.md § Memory Prune Sweep
# Policy SSOT: docs/policies/dev-standards.md § Script Persistence
# Detail ref:  docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md#memory-docs-hygiene-P3
#
# Usage: scripts/agents-flow/memory-prune-sweep.sh
#
# Env overrides (all optional; used by the paired test script to sandbox a fixture
# tree without touching the live repo — AGENT_MEMORY_ROOT reuses the same env var
# name the mcp-server 1300b-test sandbox already established for this directory
# family, see apps/mcp-server/src/interface/mcp/tools/system/agentMemoryUpdateTools.ts):
#   AGENT_MEMORY_ROOT        default: $REPO_ROOT/docs/agent-memory
#   MPS_SIGNALS_DIR          default: $REPO_ROOT/docs/signals
#   MPS_SESSION_MAX_AGE_DAYS default: 14
#   MPS_HEALTH_MAX_AGE_DAYS  default: 30
#
# Exit: always 0 (best-effort housekeeping — never fail-loud; matches
# scripts/audits/clean-obsolete-files.sh convention). stdout is grep-able, one
# [memory-prune-sweep] marker line per event, ending with a SUMMARY line.
#
# Shell: bash 3.2+ (macOS system /bin/bash) — no mapfile, no associative arrays,
# no namerefs. find -print0 / while read -r -d '' matches the repo's established
# NUL-safe file-loop convention (scripts/audits/clean-obsolete-files.sh).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

AGENT_MEMORY_DIR="${AGENT_MEMORY_ROOT:-$REPO_ROOT/docs/agent-memory}"
SESSIONS_DIR="$AGENT_MEMORY_DIR/sessions"
SESSIONS_ARCHIVE_DIR="$SESSIONS_DIR/archive"
HEALTH_DIR="$AGENT_MEMORY_DIR/health"
SESSION_LOGS_DIR="$AGENT_MEMORY_DIR/session-logs"
MEMORY_ARCHIVE_DIR="$AGENT_MEMORY_DIR/archive"
SIGNALS_DIR="${MPS_SIGNALS_DIR:-$REPO_ROOT/docs/signals}"

SESSION_MAX_AGE_DAYS="${MPS_SESSION_MAX_AGE_DAYS:-14}"
HEALTH_MAX_AGE_DAYS="${MPS_HEALTH_MAX_AGE_DAYS:-30}"

moved_sessions=0
deleted_health=0
folded_logs=0
moved_scheduled=0
signal_written=0

echo "[memory-prune-sweep] START session_max_age_days=$SESSION_MAX_AGE_DAYS health_max_age_days=$HEALTH_MAX_AGE_DAYS root=$AGENT_MEMORY_DIR"

# --- Sweep 1: archive sessions/*.md older than N days (archive/ excluded via -maxdepth 1) ---
if [ -d "$SESSIONS_DIR" ]; then
  mkdir -p "$SESSIONS_ARCHIVE_DIR" 2>/dev/null || true
  while IFS= read -r -d '' f; do
    base="$(basename "$f")"
    dest="$SESSIONS_ARCHIVE_DIR/$base"
    if [ -e "$dest" ]; then
      echo "[memory-prune-sweep] SKIP-EXISTS path=docs/agent-memory/sessions/$base reason=already-in-archive"
      continue
    fi
    if mv "$f" "$dest" 2>/dev/null; then
      moved_sessions=$((moved_sessions + 1))
      echo "[memory-prune-sweep] ARCHIVED path=docs/agent-memory/sessions/$base -> docs/agent-memory/sessions/archive/$base"
    fi
  done < <(find "$SESSIONS_DIR" -maxdepth 1 -type f -name "*.md" -mtime "+${SESSION_MAX_AGE_DAYS}" -print0 2>/dev/null)
fi

# --- Sweep 2: delete stale team-tool-recheck files (writer dead since 06-23) ---
if [ -d "$HEALTH_DIR" ]; then
  while IFS= read -r -d '' f; do
    base="$(basename "$f")"
    if rm -f "$f" 2>/dev/null; then
      deleted_health=$((deleted_health + 1))
      echo "[memory-prune-sweep] DELETED path=docs/agent-memory/health/$base reason=team-tool-recheck-stale-${HEALTH_MAX_AGE_DAYS}d"
    fi
  done < <(find "$HEALTH_DIR" -maxdepth 1 -type f -name "team-tool-recheck-*.md" -mtime "+${HEALTH_MAX_AGE_DAYS}" -print0 2>/dev/null)
fi

# Idempotent PO decision payload — write ONCE ever (any prior dated file counts as
# already-written; never re-emit). File-write only — NOT a signal_queue append.
existing_signal="$(find "$SIGNALS_DIR" -maxdepth 1 -type f -name "janitor-health-recheck-writer-retired-*.json" 2>/dev/null | head -1)"
if [ -z "$existing_signal" ]; then
  mkdir -p "$SIGNALS_DIR" 2>/dev/null || true
  today="$(date -u +%Y-%m-%d)"
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  payload_file="$SIGNALS_DIR/janitor-health-recheck-writer-retired-${today}.json"
  cat > "$payload_file" <<EOF 2>/dev/null
{
  "from": "code-janitor",
  "to": "po",
  "type": "system-issue",
  "createdAt": "$ts",
  "payload": {
    "finding": "docs/agent-memory/health/team-tool-recheck-*.md writer has been silent since 2026-06-23; memory-prune-sweep.sh now deletes files in this family older than ${HEALTH_MAX_AGE_DAYS}d as routine hygiene",
    "known_cause": "writer = cloud RemoteTrigger trig_019Q8D5xttjZn6iytx2Ld9dW, killed by the 2026-06-22 standing no-RemoteTrigger directive (feedback_no_remote_trigger_all_local.md)",
    "decision_needed": "replace the recheck job with a local cron per that directive's migration rule, OR retire the team-tool-recheck permanently and let this sweep's ${HEALTH_MAX_AGE_DAYS}d rule drain the directory to empty",
    "detail_ref": "docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md#memory-docs-hygiene-P3",
    "idempotency_note": "written once — re-runs of memory-prune-sweep.sh skip this write once any janitor-health-recheck-writer-retired-*.json exists in docs/signals/"
  }
}
EOF
  if [ -s "$payload_file" ]; then
    signal_written=1
    echo "[memory-prune-sweep] SIGNAL-WRITTEN path=docs/signals/janitor-health-recheck-writer-retired-${today}.json"
  fi
else
  echo "[memory-prune-sweep] SIGNAL-SKIP reason=already-exists path=$existing_signal"
fi

# --- Sweep 3: fold session-logs/*.md into sessions/archive/, then remove the dir ---
if [ -d "$SESSION_LOGS_DIR" ]; then
  mkdir -p "$SESSIONS_ARCHIVE_DIR" 2>/dev/null || true
  while IFS= read -r -d '' f; do
    base="$(basename "$f")"
    dest="$SESSIONS_ARCHIVE_DIR/$base"
    if [ -e "$dest" ]; then
      echo "[memory-prune-sweep] SKIP-EXISTS path=docs/agent-memory/session-logs/$base reason=already-in-archive"
      continue
    fi
    if mv "$f" "$dest" 2>/dev/null; then
      folded_logs=$((folded_logs + 1))
      echo "[memory-prune-sweep] FOLDED path=docs/agent-memory/session-logs/$base -> docs/agent-memory/sessions/archive/$base"
    fi
  done < <(find "$SESSION_LOGS_DIR" -maxdepth 1 -type f -name "*.md" -print0 2>/dev/null)
  if rmdir "$SESSION_LOGS_DIR" 2>/dev/null; then
    echo "[memory-prune-sweep] RMDIR path=docs/agent-memory/session-logs/"
  fi
fi

# --- Sweep 4: move root-level scheduled-task-execution-*.md into archive/ ---
if [ -d "$AGENT_MEMORY_DIR" ]; then
  mkdir -p "$MEMORY_ARCHIVE_DIR" 2>/dev/null || true
  while IFS= read -r -d '' f; do
    base="$(basename "$f")"
    dest="$MEMORY_ARCHIVE_DIR/$base"
    if [ -e "$dest" ]; then
      echo "[memory-prune-sweep] SKIP-EXISTS path=docs/agent-memory/$base reason=already-in-archive"
      continue
    fi
    if mv "$f" "$dest" 2>/dev/null; then
      moved_scheduled=$((moved_scheduled + 1))
      echo "[memory-prune-sweep] ARCHIVED path=docs/agent-memory/$base -> docs/agent-memory/archive/$base"
    fi
  done < <(find "$AGENT_MEMORY_DIR" -maxdepth 1 -type f -name "scheduled-task-execution-*.md" -print0 2>/dev/null)
fi

echo "[memory-prune-sweep] SUMMARY sessions_archived=$moved_sessions health_deleted=$deleted_health session_logs_folded=$folded_logs scheduled_archived=$moved_scheduled signal_written=$signal_written"

exit 0
