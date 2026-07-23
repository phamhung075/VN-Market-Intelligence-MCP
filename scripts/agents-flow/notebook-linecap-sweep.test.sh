#!/usr/bin/env bash
# scripts/agents-flow/notebook-linecap-sweep.test.sh — Regression test for
# notebook-linecap-sweep.sh (TE-T17)
#
# Fixture files MUST live inside the real docs/agent-memory/notebooks/ dir because
# the delegated notebook-auto-prune.sh hook guards on the real project-root-relative
# path (docs/agent-memory/notebooks/*.md) — see that script's own path guard. To
# avoid ever touching a real agent notebook during this test, NOTEBOOK_SWEEP_PATTERN
# is scoped to a run-unique glob that matches ONLY this run's fixture files.

set -u

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && { echo "FAIL: cannot determine PROJECT_ROOT"; exit 1; }

SCRIPT="$PROJECT_ROOT/scripts/agents-flow/notebook-linecap-sweep.sh"
NOTEBOOKS_DIR="$PROJECT_ROOT/docs/agent-memory/notebooks"
SUFFIX="test-linecap-$(date +%s)-$$"
PATTERN="${SUFFIX}-*.md"

OVER_CAP_FILE="$NOTEBOOKS_DIR/${SUFFIX}-overcap.md"
UNDER_CAP_FILE="$NOTEBOOKS_DIR/${SUFFIX}-undercap.md"

cleanup() { rm -f "$OVER_CAP_FILE" "$UNDER_CAP_FILE"; }
trap cleanup EXIT

PASS_COUNT=0
FAIL_COUNT=0
ok()  { echo "PASS: $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
bad() { echo "FAIL: $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }

# --- Fixture: over-cap notebook (prepend-style, mirrors real notebook conventions) ---
{
  echo "# Sweep-Test Notebook (over cap)"
  echo ""
  echo "## NEWEST-SECTION · 2026-07-23T10:00:00Z"
  echo ""
  seq 1 140 | while read -r i; do echo "Newest content line $i"; done
  echo ""
  echo "## OLDEST-SECTION · 2026-07-01T10:00:00Z"
  echo ""
  seq 1 80 | while read -r i; do echo "Oldest content line $i"; done
} > "$OVER_CAP_FILE"

# --- Fixture: under-cap notebook — sweep must leave it untouched ---
{
  echo "# Sweep-Test Notebook (under cap)"
  echo ""
  echo "## ONLY-SECTION · 2026-07-23T10:00:00Z"
  echo "small content"
} > "$UNDER_CAP_FILE"

BEFORE_LINES="$(wc -l < "$OVER_CAP_FILE" | tr -d ' ')"
UNDER_BEFORE="$(wc -l < "$UNDER_CAP_FILE" | tr -d ' ')"

if [ "$BEFORE_LINES" -le 200 ]; then
  echo "FAIL: fixture setup broken — over-cap file is only $BEFORE_LINES lines"
  exit 1
fi

# --- Run 1: sweep should detect + prune the over-cap fixture, ignore under-cap ---
OUT1="$(NOTEBOOK_SWEEP_PATTERN="$PATTERN" bash "$SCRIPT" 2>&1)"
echo "$OUT1"

if echo "$OUT1" | grep -q "OVER-CAP path=docs/agent-memory/notebooks/${SUFFIX}-overcap.md"; then
  ok "detects-over-cap-fixture"
else
  bad "detects-over-cap-fixture"
fi

AFTER_LINES="$(wc -l < "$OVER_CAP_FILE" | tr -d ' ')"
if [ "$AFTER_LINES" -le 200 ]; then
  ok "over-cap-fixture-pruned-to-cap (before=$BEFORE_LINES after=$AFTER_LINES)"
else
  bad "over-cap-fixture-pruned-to-cap (before=$BEFORE_LINES after=$AFTER_LINES)"
fi

if grep -q "NEWEST-SECTION" "$OVER_CAP_FILE" && ! grep -q "OLDEST-SECTION" "$OVER_CAP_FILE"; then
  ok "drop-oldest-not-newest"
else
  bad "drop-oldest-not-newest"
fi

if echo "$OUT1" | grep -q "checked=2"; then
  ok "pattern-scoped-to-fixtures-only (checked=2, no live notebooks swept)"
else
  bad "pattern-scoped-to-fixtures-only"
fi

UNDER_AFTER="$(wc -l < "$UNDER_CAP_FILE" | tr -d ' ')"
if [ "$UNDER_AFTER" = "$UNDER_BEFORE" ]; then
  ok "under-cap-fixture-untouched"
else
  bad "under-cap-fixture-untouched (before=$UNDER_BEFORE after=$UNDER_AFTER)"
fi

# --- Run 2: idempotency — fixture is now under cap, second sweep is a clean no-op ---
OUT2="$(NOTEBOOK_SWEEP_PATTERN="$PATTERN" bash "$SCRIPT" 2>&1)"
RC2=$?
echo "$OUT2"

if [ "$RC2" -eq 0 ]; then
  ok "idempotent-rerun-exit-0"
else
  bad "idempotent-rerun-exit-0 (rc=$RC2)"
fi

if echo "$OUT2" | grep -q "SUMMARY checked=2 over_cap=0 pruned=0"; then
  ok "idempotent-rerun-clean-summary"
else
  bad "idempotent-rerun-clean-summary"
fi

echo "========================================"
echo "Test Results: PASS=$PASS_COUNT FAIL=$FAIL_COUNT"
echo "========================================"

[ "$FAIL_COUNT" -gt 0 ] && exit 1
exit 0
