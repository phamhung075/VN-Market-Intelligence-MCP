#!/usr/bin/env bash
# scripts/audits/size-lint-justification.test.sh
# Smoke test for scripts/audits/size-lint-justification.sh (FACTORY-GUARD-CI-SIZELINT-IMPL).
#
# Every fixture lives under a disposable, UNTRACKED subdir
# (apps/mcp-server/src/__size_lint_fixtures__/), scoped via
# SIZE_LINT_INCLUDE_OVERRIDE so each case only ever scans its own fixture
# file(s) — never the live repo tree. Every case also points
# SIZE_LINT_BASELINE_OVERRIDE at a disposable mktemp file — the real
# docs/data/size-lint-baseline.json is NEVER read or written by this test.
# Fixture dir + all tmp baselines are removed on exit (trap).
#
# Covers the 4 DoD cases from
# docs/architecture-briefs/2026-07-24-factory-guard-ci-size-lint-justification.md:
#   1. --check exits 0 on the current live repo (baseline covers all current offenders)
#   2. a synthetic new >120L file with no header fails --check
#   3. a synthetic baseline file grown past tolerance fails --check
#      (+ positive control: still within tolerance -> PASS)
#   4. a justified/shrunk file is dropped by --update (both flavors)
#
# Usage: bash scripts/audits/size-lint-justification.test.sh

set -u
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && { echo "FAIL: cannot determine PROJECT_ROOT"; exit 1; }
cd "$PROJECT_ROOT" || { echo "FAIL: cannot cd to PROJECT_ROOT"; exit 1; }

SCRIPT="$PROJECT_ROOT/scripts/audits/size-lint-justification.sh"
FIXTURE_DIR="$PROJECT_ROOT/apps/mcp-server/src/__size_lint_fixtures__"
TMP_BASELINE="$(mktemp 2>/dev/null || echo "/tmp/size-lint-test-baseline-$$.json")"

cleanup() { rm -rf "$FIXTURE_DIR"; rm -f "$TMP_BASELINE"; }
trap cleanup EXIT

mkdir -p "$FIXTURE_DIR"

PASS_COUNT=0
FAIL_COUNT=0
ok()  { echo "PASS: $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
bad() { echo "FAIL: $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }

# make_file <path> <line_count> [first_line]
make_file() {
  local path="$1" n="$2" first="${3:-}"
  : > "$path"
  [ -n "$first" ] && echo "$first" >> "$path"
  while [ "$(wc -l < "$path" | tr -d ' ')" -lt "$n" ]; do
    echo "// fixture line" >> "$path"
  done
}

# ---------------------------------------------------------------------------
# DoD-1: --check exits 0 on the current live repo — baseline
# (docs/data/size-lint-baseline.json, real SSOT) covers all current offenders.
# No override — exercises the real script against the real repo.
# ---------------------------------------------------------------------------
bash "$SCRIPT" --check > /tmp/size-lint-test-dod1.txt 2>&1
RC1=$?
if [ "$RC1" -eq 0 ]; then
  ok "DoD-1-live-repo-check-passes-baseline-covers-current-offenders (rc=0)"
else
  bad "DoD-1-live-repo-check-passes-baseline-covers-current-offenders (rc=${RC1}, expected 0)"
  tail -5 /tmp/size-lint-test-dod1.txt
fi

# ---------------------------------------------------------------------------
# DoD-2: synthetic new >120L file, no header, not in baseline -> FAIL.
# ---------------------------------------------------------------------------
F2="$FIXTURE_DIR/tc2_new_offender.ts"
make_file "$F2" 130
: > "$TMP_BASELINE"   # empty/absent baseline (no entries)
REL2="apps/mcp-server/src/__size_lint_fixtures__/tc2_new_offender.ts"
SIZE_LINT_BASELINE_OVERRIDE="$TMP_BASELINE" SIZE_LINT_INCLUDE_OVERRIDE="$REL2" \
  bash "$SCRIPT" --check > /tmp/size-lint-test-dod2.txt 2>&1
RC2=$?
if [ "$RC2" -eq 1 ] && grep -q "new-offender" /tmp/size-lint-test-dod2.txt; then
  ok "DoD-2-synthetic-new-unjustified-file-fails-check (rc=${RC2})"
else
  bad "DoD-2-synthetic-new-unjustified-file-fails-check (rc=${RC2})"
  cat /tmp/size-lint-test-dod2.txt
fi

# ---------------------------------------------------------------------------
# DoD-3: synthetic baseline file grown past tolerance -> FAIL.
# Baseline declares 150L; actual is 200L (upper bound 150+15=165 < 200).
# ---------------------------------------------------------------------------
F3="$FIXTURE_DIR/tc3_grown_past_tolerance.ts"
make_file "$F3" 200
REL3="apps/mcp-server/src/__size_lint_fixtures__/tc3_grown_past_tolerance.ts"
jq -n --arg k "$REL3" '{entries: {($k): 150}}' > "$TMP_BASELINE"
SIZE_LINT_BASELINE_OVERRIDE="$TMP_BASELINE" SIZE_LINT_INCLUDE_OVERRIDE="$REL3" \
  bash "$SCRIPT" --check > /tmp/size-lint-test-dod3.txt 2>&1
RC3=$?
if [ "$RC3" -eq 1 ] && grep -q "baseline-tolerance-exceeded" /tmp/size-lint-test-dod3.txt; then
  ok "DoD-3-baseline-file-grown-past-tolerance-fails-check (rc=${RC3})"
else
  bad "DoD-3-baseline-file-grown-past-tolerance-fails-check (rc=${RC3})"
  cat /tmp/size-lint-test-dod3.txt
fi

# Positive control: same baseline entry, actual still within tolerance -> PASS.
F3B="$FIXTURE_DIR/tc3b_within_tolerance.ts"
make_file "$F3B" 155
REL3B="apps/mcp-server/src/__size_lint_fixtures__/tc3b_within_tolerance.ts"
jq -n --arg k "$REL3B" '{entries: {($k): 150}}' > "$TMP_BASELINE"
SIZE_LINT_BASELINE_OVERRIDE="$TMP_BASELINE" SIZE_LINT_INCLUDE_OVERRIDE="$REL3B" \
  bash "$SCRIPT" --check > /tmp/size-lint-test-dod3b.txt 2>&1
RC3B=$?
if [ "$RC3B" -eq 0 ]; then
  ok "DoD-3-positive-control-baseline-file-within-tolerance-passes-check (rc=${RC3B})"
else
  bad "DoD-3-positive-control-baseline-file-within-tolerance-passes-check (rc=${RC3B})"
  cat /tmp/size-lint-test-dod3b.txt
fi

# ---------------------------------------------------------------------------
# DoD-4a: a file that SHRINKS under threshold is dropped by --update.
# ---------------------------------------------------------------------------
F4A="$FIXTURE_DIR/tc4a_shrinks.ts"
make_file "$F4A" 130
REL4A="apps/mcp-server/src/__size_lint_fixtures__/tc4a_shrinks.ts"
SIZE_LINT_BASELINE_OVERRIDE="$TMP_BASELINE" SIZE_LINT_INCLUDE_OVERRIDE="$REL4A" \
  bash "$SCRIPT" --update > /dev/null 2>&1
PRESENT_BEFORE="$(jq -r --arg k "$REL4A" '.entries[$k] // empty' "$TMP_BASELINE")"
make_file "$F4A" 50   # shrink under threshold
SIZE_LINT_BASELINE_OVERRIDE="$TMP_BASELINE" SIZE_LINT_INCLUDE_OVERRIDE="$REL4A" \
  bash "$SCRIPT" --update > /dev/null 2>&1
PRESENT_AFTER="$(jq -r --arg k "$REL4A" '.entries[$k] // empty' "$TMP_BASELINE")"
if [ -n "$PRESENT_BEFORE" ] && [ -z "$PRESENT_AFTER" ]; then
  ok "DoD-4a-shrunk-file-dropped-by-update (before=${PRESENT_BEFORE}L after=absent)"
else
  bad "DoD-4a-shrunk-file-dropped-by-update (before='${PRESENT_BEFORE}' after='${PRESENT_AFTER}')"
fi

# ---------------------------------------------------------------------------
# DoD-4b: a file that GAINS a current, valid justification header is dropped
# by --update, even though it stays over 120L.
# ---------------------------------------------------------------------------
F4B="$FIXTURE_DIR/tc4b_justified.ts"
make_file "$F4B" 130
REL4B="apps/mcp-server/src/__size_lint_fixtures__/tc4b_justified.ts"
SIZE_LINT_BASELINE_OVERRIDE="$TMP_BASELINE" SIZE_LINT_INCLUDE_OVERRIDE="$REL4B" \
  bash "$SCRIPT" --update > /dev/null 2>&1
PRESENT_BEFORE_B="$(jq -r --arg k "$REL4B" '.entries[$k] // empty' "$TMP_BASELINE")"
make_file "$F4B" 130 "// size-justification: 130L — test fixture, deliberately over cap"
SIZE_LINT_BASELINE_OVERRIDE="$TMP_BASELINE" SIZE_LINT_INCLUDE_OVERRIDE="$REL4B" \
  bash "$SCRIPT" --update > /dev/null 2>&1
PRESENT_AFTER_B="$(jq -r --arg k "$REL4B" '.entries[$k] // empty' "$TMP_BASELINE")"
if [ -n "$PRESENT_BEFORE_B" ] && [ -z "$PRESENT_AFTER_B" ]; then
  ok "DoD-4b-justified-file-dropped-by-update (before=${PRESENT_BEFORE_B}L after=absent)"
else
  bad "DoD-4b-justified-file-dropped-by-update (before='${PRESENT_BEFORE_B}' after='${PRESENT_AFTER_B}')"
fi

echo "========================================"
echo "Test Results: PASS=${PASS_COUNT} FAIL=${FAIL_COUNT}"
echo "========================================"

[ "$FAIL_COUNT" -gt 0 ] && exit 1
exit 0
