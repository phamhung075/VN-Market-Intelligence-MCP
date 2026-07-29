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
BYTE_OVER_FILE="$NOTEBOOKS_DIR/${SUFFIX}-byteover.md"

cleanup() { rm -f "$OVER_CAP_FILE" "$UNDER_CAP_FILE" "$BYTE_OVER_FILE"; }
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

# --- Fixture: byte-over / line-UNDER notebook (TE-T17 byte-blind regression, AC5) ---
# 130 lines total (well under the 200L cap) but each content line is a fixed
# 100-byte string, so the file is well over the 12000B byte cap
# (LINE_CAP*60) while remaining line-under. Pre-fix, this fixture is
# INVISIBLE to the sweep's line-only pre-filter (`[ line_count -le 200 ] &&
# continue` skips it before it is ever handed to the prune hook) — the exact
# defect this row fixes (9/10 live over-byte-cap notebooks were line-under).
LINE100="$(printf 'x%.0s' $(seq 1 100))"
{
  echo "# Sweep-Test Notebook (byte-over line-under)"
  echo ""
  echo "## BYTEOLD-SECTION · 2026-07-01T10:00:00Z"
  echo ""
  for i in $(seq 1 90); do echo "$LINE100"; done
  echo ""
  echo "## BYTENEW-SECTION · 2026-07-23T10:00:00Z"
  echo ""
  for i in $(seq 1 30); do echo "$LINE100"; done
} > "$BYTE_OVER_FILE"

BEFORE_LINES="$(wc -l < "$OVER_CAP_FILE" | tr -d ' ')"
UNDER_BEFORE="$(wc -l < "$UNDER_CAP_FILE" | tr -d ' ')"
BYTEOVER_LINES_BEFORE="$(wc -l < "$BYTE_OVER_FILE" | tr -d ' ')"
BYTEOVER_BYTES_BEFORE="$(wc -c < "$BYTE_OVER_FILE" | tr -d ' ')"

if [ "$BEFORE_LINES" -le 200 ]; then
  echo "FAIL: fixture setup broken — over-cap file is only $BEFORE_LINES lines"
  exit 1
fi

if [ "$BYTEOVER_LINES_BEFORE" -gt 200 ] || [ "$BYTEOVER_BYTES_BEFORE" -le 12000 ]; then
  echo "FAIL: byte-over/line-under fixture setup broken — lines=$BYTEOVER_LINES_BEFORE bytes=$BYTEOVER_BYTES_BEFORE (need lines<=200 AND bytes>12000)"
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

if echo "$OUT1" | grep -q "checked=3"; then
  ok "pattern-scoped-to-fixtures-only (checked=3, no live notebooks swept)"
else
  bad "pattern-scoped-to-fixtures-only"
fi

UNDER_AFTER="$(wc -l < "$UNDER_CAP_FILE" | tr -d ' ')"
if [ "$UNDER_AFTER" = "$UNDER_BEFORE" ]; then
  ok "under-cap-fixture-untouched"
else
  bad "under-cap-fixture-untouched (before=$UNDER_BEFORE after=$UNDER_AFTER)"
fi

# --- AC5: byte-over/line-under fixture must be SELECTED (dual-axis pre-filter) ---
if echo "$OUT1" | grep -q "OVER-CAP path=docs/agent-memory/notebooks/${SUFFIX}-byteover.md"; then
  ok "detects-byte-over-line-under-fixture (AC5 — line-only pre-filter would have skipped this)"
else
  bad "detects-byte-over-line-under-fixture (AC5)"
fi

# --- AC5: byte-over/line-under fixture must be PRUNED (dual-axis success predicate) ---
BYTEOVER_LINES_AFTER="$(wc -l < "$BYTE_OVER_FILE" | tr -d ' ')"
BYTEOVER_BYTES_AFTER="$(wc -c < "$BYTE_OVER_FILE" | tr -d ' ')"
if [ "$BYTEOVER_BYTES_AFTER" -le 12000 ] && [ "$BYTEOVER_LINES_AFTER" -lt "$BYTEOVER_LINES_BEFORE" ]; then
  ok "byte-over-fixture-pruned-below-byte-cap (before=${BYTEOVER_BYTES_BEFORE}B/${BYTEOVER_LINES_BEFORE}L after=${BYTEOVER_BYTES_AFTER}B/${BYTEOVER_LINES_AFTER}L)"
else
  bad "byte-over-fixture-pruned-below-byte-cap (before=${BYTEOVER_BYTES_BEFORE}B/${BYTEOVER_LINES_BEFORE}L after=${BYTEOVER_BYTES_AFTER}B/${BYTEOVER_LINES_AFTER}L)"
fi

if echo "$OUT1" | grep -q "PRUNED path=docs/agent-memory/notebooks/${SUFFIX}-byteover.md"; then
  ok "byte-over-fixture-reported-PRUNED-not-NO-CHANGE (AC3 — byte-only reduction must not misreport)"
else
  bad "byte-over-fixture-reported-PRUNED-not-NO-CHANGE (AC3)"
fi

if grep -q "BYTENEW-SECTION" "$BYTE_OVER_FILE" && ! grep -q "BYTEOLD-SECTION" "$BYTE_OVER_FILE"; then
  ok "byte-over-fixture-drop-oldest-not-newest"
else
  bad "byte-over-fixture-drop-oldest-not-newest"
fi

# --- Run 2: idempotency — fixtures are now under cap, second sweep is a clean no-op ---
OUT2="$(NOTEBOOK_SWEEP_PATTERN="$PATTERN" bash "$SCRIPT" 2>&1)"
RC2=$?
echo "$OUT2"

if [ "$RC2" -eq 0 ]; then
  ok "idempotent-rerun-exit-0"
else
  bad "idempotent-rerun-exit-0 (rc=$RC2)"
fi

if echo "$OUT2" | grep -q "SUMMARY checked=3 over_cap=0 pruned=0"; then
  ok "idempotent-rerun-clean-summary"
else
  bad "idempotent-rerun-clean-summary"
fi

echo "========================================"
echo "Test Results: PASS=$PASS_COUNT FAIL=$FAIL_COUNT"
echo "========================================"

[ "$FAIL_COUNT" -gt 0 ] && exit 1
exit 0
