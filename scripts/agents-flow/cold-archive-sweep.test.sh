#!/usr/bin/env bash
# scripts/agents-flow/cold-archive-sweep.test.sh — Regression test for
# cold-archive-sweep.sh (TE-T33)
#
# Legs 1-2 (handoffs, sessions) are fully sandboxed via directory env overrides
# (HANDOFFS_DIR / SESSIONS_DIR / ORCH_STATE all point at a mktemp -d fixture tree,
# never the live repo dirs).
#
# Leg 3 (po-decisions.md rotation) delegates to notebook-auto-prune.sh, whose path
# guard is git-project-root-relative (see that script) — a pure mktemp -d fixture
# outside the repo can never satisfy it. Mirrors notebook-linecap-sweep.test.sh's
# convention: the fixture lives INSIDE the real repo tree at a run-unique throwaway
# path (docs/agent-memory/decisions/<suffix>-po-decisions-test.md), cleaned up via
# trap, and is NEVER the real po-decisions.md.
set -u

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && { echo "FAIL: cannot determine PROJECT_ROOT"; exit 1; }

SCRIPT="$PROJECT_ROOT/scripts/agents-flow/cold-archive-sweep.sh"
SANDBOX="$(mktemp -d 2>/dev/null)"
[ -z "$SANDBOX" ] && { echo "FAIL: mktemp -d failed"; exit 1; }

SUFFIX="test-cas-$(date +%s)-$$"
PO_FIXTURE="$PROJECT_ROOT/docs/agent-memory/decisions/${SUFFIX}-po-decisions-test.md"

cleanup() { rm -rf "$SANDBOX"; rm -f "$PO_FIXTURE"; }
trap cleanup EXIT

PASS_COUNT=0
FAIL_COUNT=0
ok()  { echo "PASS: $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
bad() { echo "FAIL: $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }

old_ts() { # $1 = days ago -> touch -t compatible timestamp
  date -v-"$1"d +%Y%m%d%H%M 2>/dev/null || date -d "$1 days ago" +%Y%m%d%H%M
}

HANDOFFS_DIR="$SANDBOX/handoffs"
SESSIONS_DIR="$SANDBOX/sessions"
ORCH_STATE="$SANDBOX/orch-state.json"
mkdir -p "$HANDOFFS_DIR" "$SESSIONS_DIR"

run_sweep() {
  HANDOFFS_DIR="$HANDOFFS_DIR" ORCH_STATE="$ORCH_STATE" SESSIONS_DIR="$SESSIONS_DIR" \
    PO_DECISIONS_FILE="$1" ARCHIVE_MONTH="2026-07" COLD_ARCHIVE_FORCE=1 \
    bash "$SCRIPT" 2>&1
}

# =============================================================================
# Fixture: orch-state.json — one open backlog row references FRESH-REFERENCED.md
# =============================================================================
cat > "$ORCH_STATE" <<'EOF'
{
  "task_board": {
    "backlog": [
      {"id": "X-1", "handoff": "docs/handoffs/OLD-REFERENCED.md"}
    ],
    "ready": [],
    "in_progress": [],
    "review": [],
    "qa": []
  }
}
EOF

# =============================================================================
# Fixture: handoffs — one old+unreferenced (must archive), one old+referenced
# (must stay), one fresh (must stay — mtime gate)
# =============================================================================
echo "old unreferenced" > "$HANDOFFS_DIR/OLD-UNREFERENCED.md"
echo "old referenced"   > "$HANDOFFS_DIR/OLD-REFERENCED.md"
echo "fresh"             > "$HANDOFFS_DIR/FRESH.md"
touch -t "$(old_ts 40)" "$HANDOFFS_DIR/OLD-UNREFERENCED.md" "$HANDOFFS_DIR/OLD-REFERENCED.md"

# =============================================================================
# Fixture: sessions — one old .log (must archive), one old .md (must stay —
# owned by memory-prune-sweep.sh, not this leg), one fresh .log (must stay)
# =============================================================================
echo "old log" > "$SESSIONS_DIR/old-worker.log"
echo "old md"  > "$SESSIONS_DIR/old-notebook.md"
echo "fresh log" > "$SESSIONS_DIR/fresh-worker.log"
touch -t "$(old_ts 40)" "$SESSIONS_DIR/old-worker.log" "$SESSIONS_DIR/old-notebook.md"

# =============================================================================
# Fixture: po-decisions test file — over-cap (drop-oldest must fire)
# =============================================================================
{
  echo "# Sweep-Test po-decisions (over cap)"
  echo ""
  echo "## NEWEST-SECTION · 2026-07-23T10:00:00Z"
  echo ""
  seq 1 140 | while read -r i; do echo "Newest content line $i"; done
  echo ""
  echo "## OLDEST-SECTION · 2026-07-01T10:00:00Z"
  echo ""
  seq 1 80 | while read -r i; do echo "Oldest content line $i"; done
} > "$PO_FIXTURE"
PO_BEFORE_LINES="$(wc -l < "$PO_FIXTURE" | tr -d ' ')"
if [ "$PO_BEFORE_LINES" -le 200 ]; then
  echo "FAIL: fixture setup broken — over-cap po-decisions fixture is only $PO_BEFORE_LINES lines"
  exit 1
fi

# =============================================================================
# Run 1: guard skips on a non-1st day without COLD_ARCHIVE_FORCE
# =============================================================================
OUT_GUARD="$(HANDOFFS_DIR="$HANDOFFS_DIR" ORCH_STATE="$ORCH_STATE" SESSIONS_DIR="$SESSIONS_DIR" \
  PO_DECISIONS_FILE="$PO_FIXTURE" ARCHIVE_MONTH="2026-07" bash "$SCRIPT" 2>&1)"
echo "$OUT_GUARD"
if echo "$OUT_GUARD" | grep -q "SKIP reason=not-first-of-month" || [ "$(date -u +%d)" = "01" ]; then
  ok "day-of-month-guard-respected"
else
  bad "day-of-month-guard-respected"
fi
if [ -f "$HANDOFFS_DIR/OLD-UNREFERENCED.md" ]; then
  ok "guard-skip-leaves-fixtures-untouched"
else
  bad "guard-skip-leaves-fixtures-untouched"
fi

# =============================================================================
# Run 2: forced sweep — full behavior
# =============================================================================
OUT1="$(run_sweep "$PO_FIXTURE")"
echo "$OUT1"

if [ ! -e "$HANDOFFS_DIR/OLD-UNREFERENCED.md" ] && [ -f "$HANDOFFS_DIR/archive/2026-07/OLD-UNREFERENCED.md" ]; then
  ok "handoff-old-unreferenced-archived"
else
  bad "handoff-old-unreferenced-archived"
fi

if [ -f "$HANDOFFS_DIR/OLD-REFERENCED.md" ]; then
  ok "handoff-old-referenced-stays"
else
  bad "handoff-old-referenced-stays"
fi

if [ -f "$HANDOFFS_DIR/FRESH.md" ]; then
  ok "handoff-fresh-stays"
else
  bad "handoff-fresh-stays"
fi

if [ ! -e "$SESSIONS_DIR/old-worker.log" ] && [ -f "$SESSIONS_DIR/archive/2026-07/old-worker.log" ]; then
  ok "session-old-log-archived"
else
  bad "session-old-log-archived"
fi

if [ -f "$SESSIONS_DIR/old-notebook.md" ]; then
  ok "session-old-md-owned-by-memory-prune-sweep-not-touched"
else
  bad "session-old-md-owned-by-memory-prune-sweep-not-touched"
fi

if [ -f "$SESSIONS_DIR/fresh-worker.log" ]; then
  ok "session-fresh-log-stays"
else
  bad "session-fresh-log-stays"
fi

PO_AFTER_LINES="$(wc -l < "$PO_FIXTURE" | tr -d ' ')"
if [ "$PO_AFTER_LINES" -le 200 ]; then
  ok "po-decisions-pruned-to-cap (before=$PO_BEFORE_LINES after=$PO_AFTER_LINES)"
else
  bad "po-decisions-pruned-to-cap (before=$PO_BEFORE_LINES after=$PO_AFTER_LINES)"
fi

if grep -q "NEWEST-SECTION" "$PO_FIXTURE" && ! grep -q "OLDEST-SECTION" "$PO_FIXTURE"; then
  ok "po-decisions-drop-oldest-not-newest"
else
  bad "po-decisions-drop-oldest-not-newest"
fi

if echo "$OUT1" | grep -q "SUMMARY handoffs_archived=1 handoffs_skipped_referenced=1 sessions_archived=1 po_decisions_pruned=1"; then
  ok "summary-line-correct"
else
  bad "summary-line-correct"
fi

# =============================================================================
# Run 3: idempotency — second forced run in the same month is a clean no-op
# =============================================================================
OUT2="$(run_sweep "$PO_FIXTURE")"
RC2=$?
echo "$OUT2"

if [ "$RC2" -eq 0 ]; then
  ok "idempotent-rerun-exit-0"
else
  bad "idempotent-rerun-exit-0 (rc=$RC2)"
fi

if echo "$OUT2" | grep -q "SUMMARY handoffs_archived=0 handoffs_skipped_referenced=1 sessions_archived=0 po_decisions_pruned=0"; then
  ok "idempotent-rerun-clean-summary"
else
  bad "idempotent-rerun-clean-summary"
fi

# Real live po-decisions.md must NEVER be touched by this test
LIVE_PO="$PROJECT_ROOT/docs/agent-memory/decisions/po-decisions.md"
if [ -f "$LIVE_PO" ]; then
  if ! git -C "$PROJECT_ROOT" diff --quiet -- "$LIVE_PO" 2>/dev/null; then
    bad "live-po-decisions-untouched (git diff shows changes — TEST BUG)"
  else
    ok "live-po-decisions-untouched"
  fi
else
  ok "live-po-decisions-untouched (file absent, trivially true)"
fi

echo "========================================"
echo "Test Results: PASS=$PASS_COUNT FAIL=$FAIL_COUNT"
echo "========================================"

[ "$FAIL_COUNT" -gt 0 ] && exit 1
exit 0
