#!/usr/bin/env bash
# scripts/agents-flow/memory-prune-sweep.test.sh — Regression test for memory-prune-sweep.sh
#
# Sandboxes the sweep against a temp fixture tree (AGENT_MEMORY_ROOT / MPS_SIGNALS_DIR
# env overrides) so it never touches the live docs/agent-memory or docs/signals trees.
# Covers all 4 sweeps + idempotency (second run is a clean no-op) + the *.md-only /
# *.log-untouched guard for sessions/.

set -u

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && { echo "FAIL: cannot determine PROJECT_ROOT"; exit 1; }

SCRIPT="$PROJECT_ROOT/scripts/agents-flow/memory-prune-sweep.sh"
SANDBOX="$(mktemp -d 2>/dev/null)"
[ -z "$SANDBOX" ] && { echo "FAIL: mktemp -d failed"; exit 1; }

cleanup() { rm -rf "$SANDBOX"; }
trap cleanup EXIT

MEM_ROOT="$SANDBOX/agent-memory"
SIGNALS_DIR="$SANDBOX/signals"
mkdir -p "$MEM_ROOT/sessions/archive" "$MEM_ROOT/health" "$MEM_ROOT/session-logs" "$MEM_ROOT/archive" "$SIGNALS_DIR"

PASS_COUNT=0
FAIL_COUNT=0
ok()  { echo "PASS: $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
bad() { echo "FAIL: $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }

old_ts() { # $1 = days ago -> touch -t compatible timestamp
  date -v-"$1"d +%Y%m%d%H%M 2>/dev/null || date -d "$1 days ago" +%Y%m%d%H%M
}

# --- Fixtures ---
# sessions/: 1 old .md (>14d, should archive), 1 recent .md (<=14d, should stay),
# 1 old .log (should NEVER move — only *.md is swept), 1 old .json (should stay)
echo "old session" > "$MEM_ROOT/sessions/2026-05-01-old.md"
touch -t "$(old_ts 20)" "$MEM_ROOT/sessions/2026-05-01-old.md"

echo "recent session" > "$MEM_ROOT/sessions/2026-07-20-recent.md"
touch -t "$(old_ts 1)" "$MEM_ROOT/sessions/2026-07-20-recent.md"

echo "old log" > "$MEM_ROOT/sessions/preflight-lsof-old.log"
touch -t "$(old_ts 20)" "$MEM_ROOT/sessions/preflight-lsof-old.log"

echo "old json" > "$MEM_ROOT/sessions/old-artifact.json"
touch -t "$(old_ts 20)" "$MEM_ROOT/sessions/old-artifact.json"

# health/: 1 old recheck (>30d, should delete), 1 recent recheck (<=30d, should stay)
echo "old recheck" > "$MEM_ROOT/health/team-tool-recheck-old.md"
touch -t "$(old_ts 40)" "$MEM_ROOT/health/team-tool-recheck-old.md"

echo "recent recheck" > "$MEM_ROOT/health/team-tool-recheck-recent.md"
touch -t "$(old_ts 2)" "$MEM_ROOT/health/team-tool-recheck-recent.md"

# session-logs/: 2 files, any age — always folded
echo "log1" > "$MEM_ROOT/session-logs/agent-a-2026-05-01.md"
echo "log2" > "$MEM_ROOT/session-logs/agent-b-2026-05-02.md"

# root: 1 scheduled-task-execution file — always moved
echo "sched" > "$MEM_ROOT/scheduled-task-execution-2026-05-01-00-00.md"

# --- Run 1: live sweep ---
OUT1="$(AGENT_MEMORY_ROOT="$MEM_ROOT" MPS_SIGNALS_DIR="$SIGNALS_DIR" bash "$SCRIPT" 2>&1)"
echo "$OUT1"

# Assertions — Sweep 1 (sessions)
if [ -f "$MEM_ROOT/sessions/archive/2026-05-01-old.md" ] && [ ! -f "$MEM_ROOT/sessions/2026-05-01-old.md" ]; then
  ok "sweep1-old-md-archived"
else
  bad "sweep1-old-md-archived"
fi

if [ -f "$MEM_ROOT/sessions/2026-07-20-recent.md" ]; then
  ok "sweep1-recent-md-kept-in-place"
else
  bad "sweep1-recent-md-kept-in-place"
fi

if [ -f "$MEM_ROOT/sessions/preflight-lsof-old.log" ] && [ ! -f "$MEM_ROOT/sessions/archive/preflight-lsof-old.log" ]; then
  ok "sweep1-log-file-untouched"
else
  bad "sweep1-log-file-untouched"
fi

if [ -f "$MEM_ROOT/sessions/old-artifact.json" ]; then
  ok "sweep1-json-file-untouched"
else
  bad "sweep1-json-file-untouched"
fi

# Assertions — Sweep 2 (health + PO payload)
if [ ! -f "$MEM_ROOT/health/team-tool-recheck-old.md" ]; then
  ok "sweep2-old-recheck-deleted"
else
  bad "sweep2-old-recheck-deleted"
fi

if [ -f "$MEM_ROOT/health/team-tool-recheck-recent.md" ]; then
  ok "sweep2-recent-recheck-kept"
else
  bad "sweep2-recent-recheck-kept"
fi

SIGNAL_COUNT_1="$(find "$SIGNALS_DIR" -maxdepth 1 -name "janitor-health-recheck-writer-retired-*.json" 2>/dev/null | wc -l | tr -d ' ')"
if [ "$SIGNAL_COUNT_1" = "1" ]; then
  ok "sweep2-po-payload-written-once"
else
  bad "sweep2-po-payload-written-once (count=$SIGNAL_COUNT_1)"
fi

# Assertions — Sweep 3 (session-logs fold)
if [ -f "$MEM_ROOT/sessions/archive/agent-a-2026-05-01.md" ] && [ -f "$MEM_ROOT/sessions/archive/agent-b-2026-05-02.md" ] && [ ! -d "$MEM_ROOT/session-logs" ]; then
  ok "sweep3-session-logs-folded-and-dir-removed"
else
  bad "sweep3-session-logs-folded-and-dir-removed"
fi

# Assertions — Sweep 4 (scheduled-task-execution)
if [ -f "$MEM_ROOT/archive/scheduled-task-execution-2026-05-01-00-00.md" ] && [ ! -f "$MEM_ROOT/scheduled-task-execution-2026-05-01-00-00.md" ]; then
  ok "sweep4-scheduled-task-execution-moved"
else
  bad "sweep4-scheduled-task-execution-moved"
fi

# --- Run 2: idempotency — nothing left to move/delete, no new signal, no crash ---
OUT2="$(AGENT_MEMORY_ROOT="$MEM_ROOT" MPS_SIGNALS_DIR="$SIGNALS_DIR" bash "$SCRIPT" 2>&1)"
RC2=$?
echo "$OUT2"

if [ "$RC2" -eq 0 ]; then
  ok "idempotent-rerun-exit-0"
else
  bad "idempotent-rerun-exit-0 (rc=$RC2)"
fi

SIGNAL_COUNT_2="$(find "$SIGNALS_DIR" -maxdepth 1 -name "janitor-health-recheck-writer-retired-*.json" 2>/dev/null | wc -l | tr -d ' ')"
if [ "$SIGNAL_COUNT_2" = "1" ]; then
  ok "idempotent-rerun-no-duplicate-signal"
else
  bad "idempotent-rerun-no-duplicate-signal (count=$SIGNAL_COUNT_2)"
fi

if echo "$OUT2" | grep -q "sessions_archived=0 health_deleted=0 session_logs_folded=0 scheduled_archived=0 signal_written=0"; then
  ok "idempotent-rerun-clean-summary"
else
  bad "idempotent-rerun-clean-summary"
fi

echo "========================================"
echo "Test Results: PASS=$PASS_COUNT FAIL=$FAIL_COUNT"
echo "========================================"

[ "$FAIL_COUNT" -gt 0 ] && exit 1
exit 0
