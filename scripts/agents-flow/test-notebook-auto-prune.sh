#!/usr/bin/env bash
# test-notebook-auto-prune.sh — Regression test for notebook-auto-prune.sh
#
# Tests both append-style (oldest-first) and prepend-style (newest-first) notebooks
# to verify that the OLDEST timestamp (not physical position) is dropped.
#
# Test 5 UPDATED + Tests 6-8 ADDED for FIX-NOTEBOOK-DUPHEADING-DETECTOR-NO-DEDUP-NO-ACTUATOR
# (2026-07-30): PO adjudication OVERTURNS the prior detection-only contract for EXACTLY ONE
# duplicate-heading shape (adjacent identical "## " heading, nothing but blank lines between —
# provably lossless to collapse). Test 5 now asserts AUTO-REPAIR for that shape (was:
# detection-only/byte-identical — that old assertion is the behavior being overturned here).
# Test 6/7 assert every OTHER shape (real content between the pair; non-adjacent duplicates)
# stays byte-identical/unfixed, unchanged from before. Test 8 asserts the new (file, heading)
# dedup ledger: at most one signal while the corrupted condition persists, and a NEW signal
# once it clears and later recurs (see scripts/agents-flow/notebook-auto-prune.sh
# emit_dup_signal_deduped()/_dup_clear_markers_for_file()).

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
TEST_DUP_CONTENT="$NOTEBOOKS_DIR/test-dup-content${TEST_SUFFIX}.md"
TEST_DUP_NONADJ="$NOTEBOOKS_DIR/test-dup-nonadj${TEST_SUFFIX}.md"
TEST_DUP_DEDUP="$NOTEBOOKS_DIR/test-dup-dedup${TEST_SUFFIX}.md"
DEDUP_STATE_DIR="$PROJECT_ROOT/docs/data/notebook-dup-heading-signal-state"

# Clean up on exit (test fixtures + any signal/marker files this run may emit)
cleanup() {
  rm -f "$TEST_APPEND" "$TEST_PREPEND" "$TEST_COMPACT" "$TEST_DASHED_NOSEC" "$TEST_DUP" \
        "$TEST_DUP_CONTENT" "$TEST_DUP_NONADJ" "$TEST_DUP_DEDUP"
  rm -f "$SIGNALS_DIR"/notebook-duplicate-heading-docs-agent-memory-notebooks-test-dup*.json 2>/dev/null || true
  rm -f "$DEDUP_STATE_DIR"/docs-agent-memory-notebooks-test-dup*.marker 2>/dev/null || true
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

# --- Test 5: Duplicate-heading AUTO-REPAIR (FIX-NOTEBOOK-DUPHEADING-DETECTOR-NO-DEDUP-NO-
# ACTUATOR, 2026-07-30 — supersedes the FIX-NOTEBOOK-AUTOPRUNE-REGEX-HEADING-MISMATCH item 3
# detection-only contract for THIS EXACT SHAPE ONLY) ---
# Reproduces the exact live corruption signature found in docs/agent-memory/notebooks/main.md
# (commit 3e83f4846^) and later docs/agent-memory/notebooks/unified-agent.md: an identical
# "## " heading appearing twice back-to-back with nothing but a blank line between, surviving
# inside a file WELL UNDER the 200L cap. PO adjudication: this ONE signature is provably
# lossless to collapse (zero content between the pair by construction) — deleting the FIRST
# occurrence loses nothing. Asserts the hook (a) never crashes/further-corrupts the file,
# (b) DOES now auto-fix — collapses the pair to ONE heading, content that followed the
# surviving (second) heading is retained verbatim, (c) still emits exactly one
# notebook_duplicate_heading_detected signal recording the detected-and-repaired occurrence.
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
echo "Test 5: Duplicate-heading AUTO-REPAIR (adjacent, nothing between) — PO-adjudicated exception"
BEFORE_HASH="$(shasum -a 256 "$TEST_DUP" | cut -d' ' -f1)"
BEFORE_SIGNAL_COUNT="$(ls "$SIGNALS_DIR"/notebook-duplicate-heading-*.json 2>/dev/null | wc -l | tr -d ' ')"
BEFORE_DUP_COUNT="$(grep -c '^## cycle-20260712T0407Z' "$TEST_DUP" 2>/dev/null || echo 0)"

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
AFTER_DUP_COUNT="$(grep -c '^## cycle-20260712T0407Z' "$TEST_DUP" 2>/dev/null || echo 0)"
AFTER_BULLET_PRESENT="$(grep -c '^- bullet content under the (second) heading' "$TEST_DUP" 2>/dev/null || echo 0)"
AFTER_OLDER_PRESENT="$(grep -c '^## cycle-20260710T0307Z' "$TEST_DUP" 2>/dev/null || echo 0)"

if [ "$BEFORE_DUP_COUNT" = "2" ] && [ "$AFTER_DUP_COUNT" = "1" ] && [ "$BEFORE_HASH" != "$AFTER_HASH" ] && \
   [ "$AFTER_SIGNAL_COUNT" -gt "$BEFORE_SIGNAL_COUNT" ] && [ "$AFTER_BULLET_PRESENT" = "1" ] && [ "$AFTER_OLDER_PRESENT" = "1" ]; then
  echo "✓ PASS: test5-duplicate-heading-auto-repair"
  echo "  - Duplicate collapsed to ONE heading (2 → 1) ✓"
  echo "  - Content changed (auto-fix applied — no longer detection-only for this shape) ✓"
  echo "  - Bullet content + older section retained verbatim (lossless) ✓"
  echo "  - notebook_duplicate_heading_detected signal emitted ✓ ($BEFORE_SIGNAL_COUNT → $AFTER_SIGNAL_COUNT)"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "✗ FAIL: test5-duplicate-heading-auto-repair"
  echo "  - before_dup_count=$BEFORE_DUP_COUNT after_dup_count=$AFTER_DUP_COUNT hash_changed=$([ "$BEFORE_HASH" != "$AFTER_HASH" ] && echo yes || echo no) sig_before=$BEFORE_SIGNAL_COUNT sig_after=$AFTER_SIGNAL_COUNT bullet_present=$AFTER_BULLET_PRESENT older_present=$AFTER_OLDER_PRESENT"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# --- Test 6: duplicate heading with REAL content between the pair — must NOT auto-fix ---
# AC-3: only the exact adjacent/nothing-between shape (Test 5) is auto-repaired. Any OTHER
# duplicate-heading shape — e.g. real (non-blank) content sitting between the two identical
# headings — is NOT matched by detect_dup_heading()'s predicate and must remain untouched
# (byte-for-byte identical before/after), exactly as before this task.
{
  echo "# Notebook — Duplicate Heading With Real Content Between (must NOT auto-fix)"
  echo ""
  echo "## cycle-20260712T0500Z — repeated heading"
  echo ""
  echo "- this bullet is REAL content sitting between the two identical headings"
  echo ""
  echo "## cycle-20260712T0500Z — repeated heading"
  echo ""
  echo "- content under the second occurrence"
} > "$TEST_DUP_CONTENT"

echo ""
echo "Test 6: Duplicate heading with content between — must stay detection-only/unfixed"
T6_BEFORE_HASH="$(shasum -a 256 "$TEST_DUP_CONTENT" | cut -d' ' -f1)"

hook_input=$(cat <<EOF
{
  "tool_input": {
    "file_path": "$TEST_DUP_CONTENT"
  }
}
EOF
)
echo "$hook_input" | bash "$PROJECT_ROOT/scripts/agents-flow/notebook-auto-prune.sh"

T6_AFTER_HASH="$(shasum -a 256 "$TEST_DUP_CONTENT" | cut -d' ' -f1)"
T6_HEADING_COUNT_AFTER="$(grep -c '^## cycle-20260712T0500Z' "$TEST_DUP_CONTENT" 2>/dev/null || echo 0)"

if [ "$T6_BEFORE_HASH" = "$T6_AFTER_HASH" ] && [ "$T6_HEADING_COUNT_AFTER" = "2" ]; then
  echo "✓ PASS: test6-duplicate-heading-content-between-not-autofixed"
  echo "  - File content byte-identical before/after ✓ (not this task's auto-fixed shape)"
  echo "  - Both duplicate headings still present (2) ✓"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "✗ FAIL: test6-duplicate-heading-content-between-not-autofixed"
  echo "  - hash_match=$([ "$T6_BEFORE_HASH" = "$T6_AFTER_HASH" ] && echo yes || echo no) heading_count_after=$T6_HEADING_COUNT_AFTER (expected byte-identical, 2 headings)"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# --- Test 7: non-adjacent duplicate headings (separated by a different heading) — must NOT
# auto-fix ---
# AC-3: two identical "## " headings separated by an intervening DIFFERENT heading (not
# adjacent) are not matched by detect_dup_heading()'s predicate either (prev/blank_only get
# reset by the intervening heading) — must remain untouched.
{
  echo "# Notebook — Non-Adjacent Duplicate Headings (must NOT auto-fix)"
  echo ""
  echo "## cycle-20260712T0600Z — repeated heading"
  echo ""
  echo "- content under the first occurrence"
  echo ""
  echo "## cycle-20260711T0500Z — a different, unrelated section"
  echo ""
  echo "- unrelated content"
  echo ""
  echo "## cycle-20260712T0600Z — repeated heading"
  echo ""
  echo "- content under the second occurrence"
} > "$TEST_DUP_NONADJ"

echo ""
echo "Test 7: Non-adjacent duplicate headings — must stay detection-only/unfixed"
T7_BEFORE_HASH="$(shasum -a 256 "$TEST_DUP_NONADJ" | cut -d' ' -f1)"

hook_input=$(cat <<EOF
{
  "tool_input": {
    "file_path": "$TEST_DUP_NONADJ"
  }
}
EOF
)
echo "$hook_input" | bash "$PROJECT_ROOT/scripts/agents-flow/notebook-auto-prune.sh"

T7_AFTER_HASH="$(shasum -a 256 "$TEST_DUP_NONADJ" | cut -d' ' -f1)"
T7_HEADING_COUNT_AFTER="$(grep -c '^## cycle-20260712T0600Z' "$TEST_DUP_NONADJ" 2>/dev/null || echo 0)"

if [ "$T7_BEFORE_HASH" = "$T7_AFTER_HASH" ] && [ "$T7_HEADING_COUNT_AFTER" = "2" ]; then
  echo "✓ PASS: test7-nonadjacent-duplicate-heading-not-autofixed"
  echo "  - File content byte-identical before/after ✓ (not this task's auto-fixed shape)"
  echo "  - Both non-adjacent duplicate headings still present (2) ✓"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "✗ FAIL: test7-nonadjacent-duplicate-heading-not-autofixed"
  echo "  - hash_match=$([ "$T7_BEFORE_HASH" = "$T7_AFTER_HASH" ] && echo yes || echo no) heading_count_after=$T7_HEADING_COUNT_AFTER (expected byte-identical, 2 headings)"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# --- Test 8: emitter dedup (AC-2), unit-level — at most 1 signal while corrupted, re-arms
# after clear+recur ---
# Tests emit_dup_signal_deduped()/_dup_clear_markers_for_file() directly (sourced from
# notebook-auto-prune.sh, functions-only — no top-level STDIN-reading/exit code executes),
# isolated from the full hook pipeline's auto-repair side effects, so the ledger's exact
# contract can be asserted deterministically:
#   call 1 (fresh corrupted condition)                → MUST emit (+1)
#   call 2 (SAME still-uncleared occurrence — mirrors
#           the hook calling this at both pre-cap-scan
#           and post-prune-scan stages of one run)      → MUST NOT emit again (+0)
#   [condition clears — marker cleared]
#   call 3 (condition recurs later)                     → MUST emit again (+1, re-armed,
#                                                          not permanently suppressed)
echo ""
echo "Test 8: Emitter dedup (unit-level) — at most 1 signal per (file,heading) while corrupted, re-arms after clear+recur"

FUNCS_FILE="$(mktemp)"
awk '/^detect_dup_heading\(\) \{/{flag=1} /^# --- Same-day tie-break/{flag=0} flag' \
  "$PROJECT_ROOT/scripts/agents-flow/notebook-auto-prune.sh" > "$FUNCS_FILE"
# shellcheck disable=SC1090
source "$FUNCS_FILE"

T8_REL_PATH="docs/agent-memory/notebooks/test-dup-dedup-unit${TEST_SUFFIX}.md"
T8_HEADING="## cycle-20260712T0900Z — dedup-test section"
T8_SAFE_FILE="$(echo "$T8_REL_PATH" | tr '/.' '-')"
T8_SIG_GLOB="$SIGNALS_DIR/notebook-duplicate-heading-${T8_SAFE_FILE}-"'*.json'
T8_MARKER_GLOB="$DEDUP_STATE_DIR/${T8_SAFE_FILE}__"'*.marker'
# shellcheck disable=SC2086  # intentional: glob pattern stored in var, must expand unquoted
rm -f $T8_SIG_GLOB $T8_MARKER_GLOB 2>/dev/null || true

# REL_PATH is the global these sourced functions read (set by the real hook script at
# runtime; here we set it directly, matching the unit-test contract).
REL_PATH="$T8_REL_PATH"
T8_MARKER_PATH="$(_dup_marker_path "$T8_HEADING")"

# Existence of the MARKER (not the signal-file COUNT) is the granularity-independent proof
# that emit_dup_signal_deduped()'s gate let a call "through" to emit_dup_signal(): the
# underlying emit_dup_signal() timestamps signal FILENAMES at second precision, so two calls
# landing in the same wall-clock second (call 1 and call 3 here, microseconds apart) can
# legitimately produce/overwrite the SAME filename — a signal-file-count assertion across
# call 1 → call 3 would be flaky by construction. The marker's create/clear/recreate cycle
# has no such ambiguity: it exists iff the gate has fired-and-not-yet-cleared.
T8_MARKER_ABSENT_BEFORE=1
[ -f "$T8_MARKER_PATH" ] && T8_MARKER_ABSENT_BEFORE=0

# shellcheck disable=SC2086  # intentional: glob pattern stored in var, must expand unquoted
T8_SIG_BEFORE="$(ls $T8_SIG_GLOB 2>/dev/null | wc -l | tr -d ' ')"

# Call 1: fresh corrupted condition — must emit + create the marker.
emit_dup_signal_deduped "$T8_HEADING" "pre-cap-scan"
# shellcheck disable=SC2086  # intentional: glob pattern stored in var, must expand unquoted
T8_SIG_AFTER_1="$(ls $T8_SIG_GLOB 2>/dev/null | wc -l | tr -d ' ')"
T8_MARKER_EXISTS_AFTER_1=0
[ -f "$T8_MARKER_PATH" ] && T8_MARKER_EXISTS_AFTER_1=1

# Call 2: SAME still-uncleared occurrence (mirrors the real hook calling this at both
# pre-cap-scan and post-prune-scan stages of one run) — marker already present, gate must
# short-circuit BEFORE emit_dup_signal() ever runs, so the signal count must not move at all.
emit_dup_signal_deduped "$T8_HEADING" "post-prune-scan"
# shellcheck disable=SC2086  # intentional: glob pattern stored in var, must expand unquoted
T8_SIG_AFTER_2="$(ls $T8_SIG_GLOB 2>/dev/null | wc -l | tr -d ' ')"
T8_MARKER_EXISTS_AFTER_2=0
[ -f "$T8_MARKER_PATH" ] && T8_MARKER_EXISTS_AFTER_2=1

# Condition clears — marker must be removed.
_dup_clear_markers_for_file
T8_MARKER_ABSENT_AFTER_CLEAR=1
[ -f "$T8_MARKER_PATH" ] && T8_MARKER_ABSENT_AFTER_CLEAR=0

# Condition recurs later — gate must let this call THROUGH again (marker recreated). This is
# the re-arm proof; deliberately NOT asserted via signal-file count (see note above).
emit_dup_signal_deduped "$T8_HEADING" "pre-cap-scan"
T8_MARKER_EXISTS_AFTER_3=0
[ -f "$T8_MARKER_PATH" ] && T8_MARKER_EXISTS_AFTER_3=1

T8_D1=$((T8_SIG_AFTER_1 - T8_SIG_BEFORE))
T8_D2=$((T8_SIG_AFTER_2 - T8_SIG_AFTER_1))

if [ "$T8_MARKER_ABSENT_BEFORE" -eq 1 ] && [ "$T8_D1" -eq 1 ] && [ "$T8_MARKER_EXISTS_AFTER_1" -eq 1 ] && \
   [ "$T8_D2" -eq 0 ] && [ "$T8_MARKER_EXISTS_AFTER_2" -eq 1 ] && \
   [ "$T8_MARKER_ABSENT_AFTER_CLEAR" -eq 1 ] && [ "$T8_MARKER_EXISTS_AFTER_3" -eq 1 ]; then
  echo "✓ PASS: test8-emitter-dedup-and-rearm"
  echo "  - Call 1 (fresh corruption): +$T8_D1 signal, marker created ✓"
  echo "  - Call 2 (same still-uncleared occurrence, mirrors 2-stage-per-run firing): +$T8_D2 signal, gate short-circuited (deduped) ✓"
  echo "  - Clear: marker removed ✓ — Call 3 (condition recurred): gate re-armed, marker recreated ✓ (NOT permanently suppressed)"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "✗ FAIL: test8-emitter-dedup-and-rearm"
  echo "  - marker_absent_before=$T8_MARKER_ABSENT_BEFORE call1_sig_delta=$T8_D1 marker_after_1=$T8_MARKER_EXISTS_AFTER_1 call2_sig_delta=$T8_D2 marker_after_2=$T8_MARKER_EXISTS_AFTER_2 marker_absent_after_clear=$T8_MARKER_ABSENT_AFTER_CLEAR marker_after_3=$T8_MARKER_EXISTS_AFTER_3"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# shellcheck disable=SC2086  # intentional: glob pattern stored in var, must expand unquoted
rm -f $T8_SIG_GLOB $T8_MARKER_GLOB "$FUNCS_FILE" 2>/dev/null || true

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
