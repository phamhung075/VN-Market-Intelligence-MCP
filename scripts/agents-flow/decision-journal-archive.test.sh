#!/usr/bin/env bash
# scripts/agents-flow/decision-journal-archive.test.sh — Regression test for
# decision-journal-archive.sh
#
# Sandboxes the script against a temp fixture tree (ORCH_STATE / ORCH_ARCHIVE_DIR /
# DECISIONS_DIR / ARCHIVE_DECISIONS_DIR env overrides, DJA_GIT_MV=0) so it NEVER
# touches the live docs/agent-memory/decisions or docs/data/orch trees. Covers:
#   - longest-match id derivation on a live prefix-collision shape
#     (CLOSED id is a literal string-prefix of an ACTIVE id)
#   - stdin-mode scoping (only ids piped in are eligible, even if other ids are closed)
#   - --all backfill mode (derives closed set from cold archive + hot stub)
#   - bare sprint-<id>.md AND agent-suffixed sprint-<id>-<agent>.md forms
#   - unknown/no-orch-record files left in place and counted
#   - status-based selection is NOT mtime-based (old active stays, new closed moves)
#   - idempotency: already-archived destination is skipped, never overwritten
#   - config-error exit codes

set -u

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && { echo "FAIL: cannot determine PROJECT_ROOT"; exit 1; }

SCRIPT="$PROJECT_ROOT/scripts/agents-flow/decision-journal-archive.sh"
SANDBOX="$(mktemp -d 2>/dev/null)"
[ -z "$SANDBOX" ] && { echo "FAIL: mktemp -d failed"; exit 1; }

cleanup() { rm -rf "$SANDBOX"; }
trap cleanup EXIT

DECISIONS_DIR="$SANDBOX/decisions"
ARCHIVE_DECISIONS_DIR="$SANDBOX/archive-decisions"
ORCH_STATE="$SANDBOX/orch-state.json"
ORCH_ARCHIVE_DIR="$SANDBOX/orch-archive"
mkdir -p "$DECISIONS_DIR" "$ORCH_ARCHIVE_DIR"

PASS_COUNT=0
FAIL_COUNT=0
ok()  { echo "PASS: $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
bad() { echo "FAIL: $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }

old_ts() { # $1 = days ago -> touch -t compatible timestamp
  date -v-"$1"d +%Y%m%d%H%M 2>/dev/null || date -d "$1 days ago" +%Y%m%d%H%M
}

run_dja() { # $1 = mode ("--all" or ""), $2 = stdin ids (newline-separated string or "")
  local mode="$1" ids="$2"
  if [ "$mode" = "--all" ]; then
    ORCH_STATE="$ORCH_STATE" ORCH_ARCHIVE_DIR="$ORCH_ARCHIVE_DIR" \
      DECISIONS_DIR="$DECISIONS_DIR" ARCHIVE_DECISIONS_DIR="$ARCHIVE_DECISIONS_DIR" \
      DJA_GIT_MV=0 bash "$SCRIPT" --all
  else
    printf '%s\n' "$ids" | \
      ORCH_STATE="$ORCH_STATE" ORCH_ARCHIVE_DIR="$ORCH_ARCHIVE_DIR" \
      DECISIONS_DIR="$DECISIONS_DIR" ARCHIVE_DECISIONS_DIR="$ARCHIVE_DECISIONS_DIR" \
      DJA_GIT_MV=0 bash "$SCRIPT"
  fi
}

# =============================================================================
# Fixture: orch-state.json (hot) — 1 hot-closed stub, 1 active, 1 active whose id
# is a literal string-extension of a closed id (the live OHLCV-UNIT-CONTAM /
# OHLCV-UNIT-CONTAM-WHOLEROW-LT1000 collision shape)
# =============================================================================
cat > "$ORCH_STATE" <<'EOF'
{
  "task_board": {
    "active_sprints": [
      { "id": "ACTIVE-ZETA", "tasks": [] },
      { "id": "PREFIX-COLLIDE-EXTENDED", "tasks": [] }
    ],
    "closed_sprints": [
      { "id": "CLOSED-ALPHA", "title": "alpha", "closed_at": "2026-07-01T00:00:00Z" },
      { "id": "PREFIX-COLLIDE", "title": "collide", "closed_at": "2026-07-01T00:00:00Z" }
    ]
  }
}
EOF

# =============================================================================
# Fixture: cold archive (docs/data/orch/archive/2026-07.json shape) — ids only
# discoverable via .closed_sprints[], .closed_sprint_goals[].sprint_id, and
# .done_tasks[].sprint — none of these appear in the hot file
# =============================================================================
cat > "$ORCH_ARCHIVE_DIR/2026-07.json" <<'EOF'
{
  "closed_sprints": [
    { "id": "CLOSED-BETA", "title": "beta" }
  ],
  "closed_sprint_goals": [
    { "sprint_id": "CLOSED-DELTA", "status": "DONE" }
  ],
  "done_tasks": [
    { "task_id": "T1", "sprint": "CLOSED-GAMMA" }
  ]
}
EOF

# =============================================================================
# Fixture journal files
# =============================================================================
echo "alpha journal"    > "$DECISIONS_DIR/sprint-CLOSED-ALPHA-po.md"
echo "beta journal"     > "$DECISIONS_DIR/sprint-CLOSED-BETA.md"              # bare form
echo "gamma journal"    > "$DECISIONS_DIR/sprint-CLOSED-GAMMA-qa.md"
echo "delta journal"    > "$DECISIONS_DIR/sprint-CLOSED-DELTA-architect.md"
echo "zeta journal"     > "$DECISIONS_DIR/sprint-ACTIVE-ZETA-dev.md"
echo "collide journal"  > "$DECISIONS_DIR/sprint-PREFIX-COLLIDE-po.md"
echo "collide-ext jrnl" > "$DECISIONS_DIR/sprint-PREFIX-COLLIDE-EXTENDED-qa.md"
echo "unknown journal"  > "$DECISIONS_DIR/sprint-NOORCH-UNKNOWN.md"

# Retention-window-is-NOT-mtime-based fixtures: an OLD active journal must stay,
# a freshly-touched closed journal must still move.
echo "old active"  > "$DECISIONS_DIR/sprint-ACTIVE-ZETA-old-agent.md"
touch -t "$(old_ts 400)" "$DECISIONS_DIR/sprint-ACTIVE-ZETA-old-agent.md"
echo "fresh closed" > "$DECISIONS_DIR/sprint-CLOSED-ALPHA-fresh-agent.md"
touch -t "$(old_ts 0)" "$DECISIONS_DIR/sprint-CLOSED-ALPHA-fresh-agent.md"

# =============================================================================
# Run 1: stdin mode — only CLOSED-ALPHA + PREFIX-COLLIDE piped in scope
# (CLOSED-BETA/GAMMA/DELTA are closed but NOT in this run's stdin scope)
# =============================================================================
OUT1="$(run_dja "" "$(printf 'CLOSED-ALPHA\nPREFIX-COLLIDE\n')" 2>&1)"
RC1=$?
echo "$OUT1"

if [ "$RC1" -eq 0 ]; then ok "run1-exit-0"; else bad "run1-exit-0 (rc=$RC1)"; fi

if [ -f "$ARCHIVE_DECISIONS_DIR/sprint-CLOSED-ALPHA-po.md" ] && [ ! -f "$DECISIONS_DIR/sprint-CLOSED-ALPHA-po.md" ]; then
  ok "run1-in-scope-closed-agent-suffixed-archived"
else
  bad "run1-in-scope-closed-agent-suffixed-archived"
fi

if [ -f "$ARCHIVE_DECISIONS_DIR/sprint-PREFIX-COLLIDE-po.md" ] && [ ! -f "$DECISIONS_DIR/sprint-PREFIX-COLLIDE-po.md" ]; then
  ok "run1-longest-match-shorter-closed-id-archived"
else
  bad "run1-longest-match-shorter-closed-id-archived"
fi

if [ -f "$DECISIONS_DIR/sprint-PREFIX-COLLIDE-EXTENDED-qa.md" ]; then
  ok "run1-longest-match-longer-active-id-kept-in-place"
else
  bad "run1-longest-match-longer-active-id-kept-in-place (prefix-collision false-positive move)"
fi

if [ -f "$DECISIONS_DIR/sprint-ACTIVE-ZETA-dev.md" ]; then
  ok "run1-active-sprint-journal-kept"
else
  bad "run1-active-sprint-journal-kept"
fi

if [ -f "$DECISIONS_DIR/sprint-CLOSED-BETA.md" ]; then
  ok "run1-closed-but-out-of-stdin-scope-kept (bare form)"
else
  bad "run1-closed-but-out-of-stdin-scope-kept (bare form)"
fi

if [ -f "$DECISIONS_DIR/sprint-CLOSED-GAMMA-qa.md" ] && [ -f "$DECISIONS_DIR/sprint-CLOSED-DELTA-architect.md" ]; then
  ok "run1-closed-but-out-of-stdin-scope-kept (archive-only ids)"
else
  bad "run1-closed-but-out-of-stdin-scope-kept (archive-only ids)"
fi

if [ -f "$DECISIONS_DIR/sprint-NOORCH-UNKNOWN.md" ]; then
  ok "run1-no-orch-record-left-in-place"
else
  bad "run1-no-orch-record-left-in-place (guessed a move)"
fi

if echo "$OUT1" | grep -q "no_orch_record=1"; then
  ok "run1-summary-reports-no-orch-record-count"
else
  bad "run1-summary-reports-no-orch-record-count"
fi

# Retention-window-is-NOT-mtime-based assertions
if [ -f "$DECISIONS_DIR/sprint-ACTIVE-ZETA-old-agent.md" ]; then
  ok "run1-old-mtime-active-journal-kept (status not age gates selection)"
else
  bad "run1-old-mtime-active-journal-kept (status not age gates selection)"
fi

if [ -f "$ARCHIVE_DECISIONS_DIR/sprint-CLOSED-ALPHA-fresh-agent.md" ]; then
  ok "run1-fresh-mtime-closed-journal-archived (status not age gates selection)"
else
  bad "run1-fresh-mtime-closed-journal-archived (status not age gates selection)"
fi

# =============================================================================
# Run 2: --all backfill mode — picks up the remaining closed ids
# (CLOSED-BETA / CLOSED-GAMMA / CLOSED-DELTA), still respects active guard
# =============================================================================
OUT2="$(run_dja "--all" "" 2>&1)"
RC2=$?
echo "$OUT2"

if [ "$RC2" -eq 0 ]; then ok "run2-exit-0"; else bad "run2-exit-0 (rc=$RC2)"; fi

if [ -f "$ARCHIVE_DECISIONS_DIR/sprint-CLOSED-BETA.md" ] && [ ! -f "$DECISIONS_DIR/sprint-CLOSED-BETA.md" ]; then
  ok "run2-all-mode-archived-hot-closed-stub-bare-form"
else
  bad "run2-all-mode-archived-hot-closed-stub-bare-form"
fi

if [ -f "$ARCHIVE_DECISIONS_DIR/sprint-CLOSED-GAMMA-qa.md" ] && [ -f "$ARCHIVE_DECISIONS_DIR/sprint-CLOSED-DELTA-architect.md" ]; then
  ok "run2-all-mode-archived-cold-archive-only-ids"
else
  bad "run2-all-mode-archived-cold-archive-only-ids"
fi

if [ -f "$DECISIONS_DIR/sprint-ACTIVE-ZETA-dev.md" ] && [ -f "$DECISIONS_DIR/sprint-PREFIX-COLLIDE-EXTENDED-qa.md" ] && [ -f "$DECISIONS_DIR/sprint-ACTIVE-ZETA-old-agent.md" ]; then
  ok "run2-all-mode-still-respects-active-guard"
else
  bad "run2-all-mode-still-respects-active-guard"
fi

if [ -f "$DECISIONS_DIR/sprint-NOORCH-UNKNOWN.md" ]; then
  ok "run2-all-mode-still-leaves-unknown-in-place"
else
  bad "run2-all-mode-still-leaves-unknown-in-place"
fi

# =============================================================================
# Run 3: idempotent re-run of --all — nothing left eligible to move, clean no-op
# =============================================================================
OUT3="$(run_dja "--all" "" 2>&1)"
RC3=$?
echo "$OUT3"

if [ "$RC3" -eq 0 ]; then ok "run3-idempotent-rerun-exit-0"; else bad "run3-idempotent-rerun-exit-0 (rc=$RC3)"; fi

if echo "$OUT3" | grep -q "archived=0"; then
  ok "run3-idempotent-rerun-zero-new-archives"
else
  bad "run3-idempotent-rerun-zero-new-archives"
fi

# =============================================================================
# Run 4: already-archived destination collision — SKIP-EXISTS, source untouched,
# destination not clobbered (idempotency safety net for a forced collision)
# =============================================================================
echo "dup source"      > "$DECISIONS_DIR/sprint-CLOSED-ALPHA-dup-agent.md"
echo "dup dest sentinel" > "$ARCHIVE_DECISIONS_DIR/sprint-CLOSED-ALPHA-dup-agent.md"
OUT4="$(run_dja "" "CLOSED-ALPHA" 2>&1)"
echo "$OUT4"

if grep -q "SKIP-EXISTS" <<<"$OUT4"; then
  ok "run4-collision-skip-exists-logged"
else
  bad "run4-collision-skip-exists-logged"
fi

if [ -f "$DECISIONS_DIR/sprint-CLOSED-ALPHA-dup-agent.md" ]; then
  ok "run4-collision-source-untouched"
else
  bad "run4-collision-source-untouched"
fi

if grep -q "dup dest sentinel" "$ARCHIVE_DECISIONS_DIR/sprint-CLOSED-ALPHA-dup-agent.md" 2>/dev/null; then
  ok "run4-collision-destination-not-clobbered"
else
  bad "run4-collision-destination-not-clobbered"
fi

# =============================================================================
# Run 5: config errors — exit 1, no crash
# =============================================================================
MISSING_STATE="$SANDBOX/does-not-exist.json"
ORCH_STATE="$MISSING_STATE" ORCH_ARCHIVE_DIR="$ORCH_ARCHIVE_DIR" \
  DECISIONS_DIR="$DECISIONS_DIR" ARCHIVE_DECISIONS_DIR="$ARCHIVE_DECISIONS_DIR" \
  DJA_GIT_MV=0 bash "$SCRIPT" --all >/dev/null 2>&1
RC5=$?
if [ "$RC5" -eq 1 ]; then
  ok "run5-missing-orch-state-exits-1"
else
  bad "run5-missing-orch-state-exits-1 (rc=$RC5)"
fi

MISSING_DECISIONS="$SANDBOX/does-not-exist-dir"
ORCH_STATE="$ORCH_STATE" ORCH_ARCHIVE_DIR="$ORCH_ARCHIVE_DIR" \
  DECISIONS_DIR="$MISSING_DECISIONS" ARCHIVE_DECISIONS_DIR="$ARCHIVE_DECISIONS_DIR" \
  DJA_GIT_MV=0 bash "$SCRIPT" --all >/dev/null 2>&1
RC6=$?
if [ "$RC6" -eq 1 ]; then
  ok "run6-missing-decisions-dir-exits-1"
else
  bad "run6-missing-decisions-dir-exits-1 (rc=$RC6)"
fi

# =============================================================================
# Run 7: --dry-run — reports WOULD-ARCHIVE, mutates NOTHING (no mv, no mkdir dest)
# =============================================================================
rm -rf "$ARCHIVE_DECISIONS_DIR"
echo "dry candidate" > "$DECISIONS_DIR/sprint-CLOSED-BETA-dryagent.md"
OUT7="$(ORCH_STATE="$ORCH_STATE" ORCH_ARCHIVE_DIR="$ORCH_ARCHIVE_DIR" \
  DECISIONS_DIR="$DECISIONS_DIR" ARCHIVE_DECISIONS_DIR="$ARCHIVE_DECISIONS_DIR" \
  DJA_GIT_MV=0 bash "$SCRIPT" --all --dry-run 2>&1)"
echo "$OUT7"

if [ -f "$DECISIONS_DIR/sprint-CLOSED-BETA-dryagent.md" ]; then
  ok "run7-dry-run-source-untouched"
else
  bad "run7-dry-run-source-untouched"
fi

if [ ! -e "$ARCHIVE_DECISIONS_DIR" ]; then
  ok "run7-dry-run-no-destination-created"
else
  bad "run7-dry-run-no-destination-created"
fi

if echo "$OUT7" | grep -q "WOULD-ARCHIVE file=sprint-CLOSED-BETA-dryagent.md"; then
  ok "run7-dry-run-reports-would-archive"
else
  bad "run7-dry-run-reports-would-archive"
fi

echo "========================================"
echo "Test Results: PASS=$PASS_COUNT FAIL=$FAIL_COUNT"
echo "========================================"

[ "$FAIL_COUNT" -gt 0 ] && exit 1
exit 0
