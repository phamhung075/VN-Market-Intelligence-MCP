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
TEST_SUFFIX="-$(date +%s)-$$"
TEST_APPEND="$NOTEBOOKS_DIR/test-append${TEST_SUFFIX}.md"
TEST_PREPEND="$NOTEBOOKS_DIR/test-prepend${TEST_SUFFIX}.md"

# Clean up on exit
trap "rm -f '$TEST_APPEND' '$TEST_PREPEND'" EXIT

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
