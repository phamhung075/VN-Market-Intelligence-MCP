#!/usr/bin/env bash
# test-notebook-auto-prune.sh — Regression test for notebook-auto-prune.sh
#
# Tests both append-style (oldest-first) and prepend-style (newest-first) notebooks
# to verify that the OLDEST timestamp (not physical position) is dropped.

set -eu

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && { echo "FAIL: cannot determine PROJECT_ROOT"; exit 1; }

# Use test files in the notebook directory (to pass the path guard)
NOTEBOOKS_DIR="$PROJECT_ROOT/docs/agent-memory/notebooks"
SIGNALS_DIR="$PROJECT_ROOT/docs/signals"
TEST_SUFFIX="-$(date +%s)-$$"
TEST_APPEND="$NOTEBOOKS_DIR/test-append${TEST_SUFFIX}.md"
TEST_PREPEND="$NOTEBOOKS_DIR/test-prepend${TEST_SUFFIX}.md"
TEST_COMPACT="$NOTEBOOKS_DIR/test-compact${TEST_SUFFIX}.md"
TEST_DASHED_NOSEC="$NOTEBOOKS_DIR/test-dashed-nosec${TEST_SUFFIX}.md"
TEST_DUP="$NOTEBOOKS_DIR/test-dup${TEST_SUFFIX}.md"

# Clean up on exit (test fixtures + any signal files this run may emit)
cleanup() {
  rm -f "$TEST_APPEND" "$TEST_PREPEND" "$TEST_COMPACT" "$TEST_DASHED_NOSEC" "$TEST_DUP"
  rm -f "$SIGNALS_DIR"/notebook-duplicate-heading-docs-agent-memory-notebooks-test-dup*.json 2>/dev/null || true
}
trap cleanup EXIT

PASS_COUNT=0
FAIL_COUNT=0

# Helper: run the prune hook and check result
test_prune() {
  local test_name="$1"
  local input_file="$2"
  local expected_remaining_marker="$3"  # A section marker that should remain
  local expected_dropped_marker="$4"    # A section marker that should be dropped

  local line_count_before=$(wc -l < "$input_file" | tr -d ' ')

  # Verify the file is indeed over 200 lines (the threshold)
  if [ "$line_count_before" -le 200 ]; then
    echo "⚠ SKIP: $test_name — input file is only $line_count_before lines (need >200)"
    return 0
  fi

  # Simulate PostToolUse hook call using absolute path
  # The hook converts relative paths to absolute, so use the filename
  local hook_input=$(cat <<EOF
{
  "tool_input": {
    "file_path": "$input_file"
  }
}
EOF
)

  # Run the hook
  echo "$hook_input" | bash "$PROJECT_ROOT/scripts/agents-flow/notebook-auto-prune.sh"

  local line_count_after=$(wc -l < "$input_file" | tr -d ' ')

  # Verify result
  if grep -q "$expected_remaining_marker" "$input_file"; then
    if ! grep -q "$expected_dropped_marker" "$input_file"; then
      echo "✓ PASS: $test_name"
      echo "  - Lines: $line_count_before → $line_count_after"
      echo "  - Kept: $expected_remaining_marker"
      echo "  - Dropped: $expected_dropped_marker"
      ((PASS_COUNT++))
      return 0
    else
      echo "✗ FAIL: $test_name — expected marker was NOT dropped"
      echo "  - Lines: $line_count_before → $line_count_after (expected to drop old section)"
      echo "  - Expected to drop: $expected_dropped_marker"
      echo "  - But it's still present"
      ((FAIL_COUNT++))
      return 1
    fi
  else
    echo "✗ FAIL: $test_name — expected marker was dropped or missing"
    echo "  - Lines: $line_count_before → $line_count_after"
    echo "  - Expected to keep: $expected_remaining_marker"
    echo "  - But it's missing"
    ((FAIL_COUNT++))
    return 1
  fi
}

# --- Test 1: Append-style notebook (oldest-first) ---
{
  echo "# Append-Style Notebook (oldest-first ordering)"
  echo ""
  echo "Preamble text explaining the notebook."
  echo ""
  echo "## OLDEST-SECTION-001 · 2026-07-01T10:00:00Z"
  echo ""
  seq 1 30 | while read i; do echo "Section 001 content line $i"; done
  echo ""
  echo "## MIDDLE-SECTION-002 · 2026-07-02T10:00:00Z"
  echo ""
  seq 1 30 | while read i; do echo "Section 002 content line $i"; done
  echo ""
  echo "## NEWEST-SECTION-003 · 2026-07-03T10:00:00Z"
  echo ""
  seq 1 140 | while read i; do echo "Section 003 content line $i"; done
} > "$TEST_APPEND"

echo "Test 1: Append-style notebook (oldest-first)"
echo "  Expected: Drop OLDEST-SECTION-001 (oldest timestamp), keep NEWEST-SECTION-003"
wc -l < "$TEST_APPEND"
test_prune "test1-append-style" "$TEST_APPEND" "NEWEST-SECTION-003" "OLDEST-SECTION-001"

# --- Test 2: Prepend-style notebook (newest-first) ---
{
  echo "# Prepend-Style Notebook (newest-first ordering)"
  echo ""
  echo "Preamble text explaining the notebook — entries added at the top."
  echo ""
  echo "## NEWEST-SECTION-003 · 2026-07-03T10:00:00Z"
  echo ""
  seq 1 140 | while read i; do echo "Section 003 content line $i"; done
  echo ""
  echo "## MIDDLE-SECTION-002 · 2026-07-02T10:00:00Z"
  echo ""
  seq 1 30 | while read i; do echo "Section 002 content line $i"; done
  echo ""
  echo "## OLDEST-SECTION-001 · 2026-07-01T10:00:00Z"
  echo ""
  seq 1 30 | while read i; do echo "Section 001 content line $i"; done
} > "$TEST_PREPEND"

echo ""
echo "Test 2: Prepend-style notebook (newest-first) — CRITICAL TEST"
echo "  Expected: Drop OLDEST-SECTION-001 (oldest timestamp, physically at end)"
echo "            Keep NEWEST-SECTION-003 (newest timestamp, physically at top)"
echo "  This is the bug case: old code would incorrectly drop physically-first section"
wc -l < "$TEST_PREPEND"
test_prune "test2-prepend-style" "$TEST_PREPEND" "NEWEST-SECTION-003" "OLDEST-SECTION-001"

# --- Test 3: Compact heading format (mirrors docs/agent-memory/notebooks/main.md real
# convention: "## cycle-YYYYMMDDTHHMMZ — ..." — no dashes, no colons, no seconds) ---
# This is the FIX-NOTEBOOK-AUTOPRUNE-REGEX-HEADING-MISMATCH regression case: the OLD regex
# never matched this shape at all, so every section fell to the MAX-sentinel fallback and the
# tie-break picked by heading text / physical position instead of true chronology.
{
  echo "# Compact Cycle-Format Notebook (prepend-style, mirrors main.md)"
  echo ""
  echo "Preamble text — entries added at the top."
  echo ""
  echo "## cycle-20260712T0607Z — NEWEST-CYCLE section"
  echo ""
  seq 1 140 | while read i; do echo "Newest cycle content line $i"; done
  echo ""
  echo "## cycle-20260711T0307Z — MIDDLE-CYCLE section"
  echo ""
  seq 1 30 | while read i; do echo "Middle cycle content line $i"; done
  echo ""
  echo "## cycle-20260710T0407Z — OLDEST-CYCLE section"
  echo ""
  seq 1 30 | while read i; do echo "Oldest cycle content line $i"; done
} > "$TEST_COMPACT"

echo ""
echo "Test 3: Compact cycle-YYYYMMDDTHHMMZ format (main.md real convention) — REGRESSION CASE"
echo "  Expected: Drop OLDEST-CYCLE (2026-07-10), keep NEWEST-CYCLE (2026-07-12)"
wc -l < "$TEST_COMPACT"
test_prune "test3-compact-cycle-format" "$TEST_COMPACT" "NEWEST-CYCLE" "OLDEST-CYCLE"

# --- Test 4: Dashed-no-seconds heading format (mirrors docs/agent-memory/notebooks/po.md
# real convention: "## Tick YYYY-MM-DDTHH:MMZ — ..." — dashed date, colon time, NO seconds) ---
{
  echo "# Tick-Format Notebook (prepend-style, mirrors po.md)"
  echo ""
  echo "Preamble text — entries added at the top."
  echo ""
  echo "## Tick 2026-07-12T07:15Z — NEWEST-TICK section"
  echo ""
  seq 1 140 | while read i; do echo "Newest tick content line $i"; done
  echo ""
  echo "## Tick 2026-07-11T06:45Z — MIDDLE-TICK section"
  echo ""
  seq 1 30 | while read i; do echo "Middle tick content line $i"; done
  echo ""
  echo "## Tick 2026-07-10T06:21Z — OLDEST-TICK section"
  echo ""
  seq 1 30 | while read i; do echo "Oldest tick content line $i"; done
} > "$TEST_DASHED_NOSEC"

echo ""
echo "Test 4: Dashed-no-seconds 'Tick YYYY-MM-DDTHH:MMZ' format (po.md real convention) — REGRESSION CASE"
echo "  Expected: Drop OLDEST-TICK (2026-07-10), keep NEWEST-TICK (2026-07-12)"
wc -l < "$TEST_DASHED_NOSEC"
test_prune "test4-dashed-noseconds-tick-format" "$TEST_DASHED_NOSEC" "NEWEST-TICK" "OLDEST-TICK"

# --- Test 5: Duplicate-heading tripwire (FIX-NOTEBOOK-AUTOPRUNE-REGEX-HEADING-MISMATCH item 3) ---
# Reproduces the exact live corruption signature found in docs/agent-memory/notebooks/main.md
# (commit 3e83f4846^): an identical "## " heading appearing twice back-to-back with nothing but
# a blank line between, surviving inside a file WELL UNDER the 200L cap. Asserts the hook (a)
# never crashes/further-corrupts the file, (b) does NOT auto-fix (detection-only — content must
# be byte-identical before/after), and (c) emits a notebook_duplicate_heading_detected signal.
{
  echo "# Small Notebook With A Duplicate Heading (under 200L — mirrors real incident)"
  echo ""
  echo "## cycle-20260712T0407Z — some section"
  echo ""
  echo "## cycle-20260712T0407Z — some section"
  echo ""
  echo "- bullet content under the (second) heading"
  echo ""
  echo "## cycle-20260710T0307Z — older section"
  echo ""
  echo "- older bullet content"
} > "$TEST_DUP"

echo ""
echo "Test 5: Duplicate-heading tripwire — detection-only, non-destructive"
BEFORE_HASH="$(shasum -a 256 "$TEST_DUP" | cut -d' ' -f1)"
BEFORE_SIGNAL_COUNT="$(ls "$SIGNALS_DIR"/notebook-duplicate-heading-*.json 2>/dev/null | wc -l | tr -d ' ')"

hook_input=$(cat <<EOF
{
  "tool_input": {
    "file_path": "$TEST_DUP"
  }
}
EOF
)
echo "$hook_input" | bash "$PROJECT_ROOT/scripts/agents-flow/notebook-auto-prune.sh"

AFTER_HASH="$(shasum -a 256 "$TEST_DUP" | cut -d' ' -f1)"
AFTER_SIGNAL_COUNT="$(ls "$SIGNALS_DIR"/notebook-duplicate-heading-*.json 2>/dev/null | wc -l | tr -d ' ')"

if [ "$BEFORE_HASH" = "$AFTER_HASH" ] && [ "$AFTER_SIGNAL_COUNT" -gt "$BEFORE_SIGNAL_COUNT" ]; then
  echo "✓ PASS: test5-duplicate-heading-tripwire"
  echo "  - File content unchanged (detection-only, no auto-fix) ✓"
  echo "  - notebook_duplicate_heading_detected signal emitted ✓ ($BEFORE_SIGNAL_COUNT → $AFTER_SIGNAL_COUNT)"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "✗ FAIL: test5-duplicate-heading-tripwire"
  [ "$BEFORE_HASH" != "$AFTER_HASH" ] && echo "  - File content CHANGED (expected detection-only, no mutation)"
  [ "$AFTER_SIGNAL_COUNT" -le "$BEFORE_SIGNAL_COUNT" ] && echo "  - No duplicate-heading signal was emitted (before=$BEFORE_SIGNAL_COUNT after=$AFTER_SIGNAL_COUNT)"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# --- Summary ---
echo ""
echo "========================================"
echo "Test Results:"
echo "  PASS: $PASS_COUNT"
echo "  FAIL: $FAIL_COUNT"
echo "========================================"

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi

exit 0
