#!/usr/bin/env bash
# test-sha-comparison-unit.sh — Unit tests for SHA comparison logic.
# No Docker daemon required — sources compare_shas() from verify-deploy-sha.sh.
# All 3 cases: match / mismatch / empty label.
# Exit 0: all tests pass. Exit 1: one or more tests failed.
#
# CI-friendly: safe to run in any environment without Docker socket.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source the comparison function — no Docker involved
# shellcheck source=./verify-deploy-sha.sh
source "$SCRIPT_DIR/verify-deploy-sha.sh"

PASS=0
FAIL=0

# ---------------------------------------------------------------------------
# Test 1: Matching SHAs — compare_shas must return 0
# ---------------------------------------------------------------------------
if compare_shas "abc123def456abc123def456abc123def456abc1" \
                "abc123def456abc123def456abc123def456abc1" \
                >/dev/null 2>&1; then
  echo "PASS Test 1: matching SHAs — exit 0"
  ((PASS++))
else
  echo "FAIL Test 1: matching SHAs — expected exit 0, got non-zero"
  ((FAIL++))
fi

# ---------------------------------------------------------------------------
# Test 2: Deliberately stale SHA — compare_shas MUST return NON-ZERO.
# This is the anti-false-green proof: if the guard exits 0 here, it is broken.
# ---------------------------------------------------------------------------
if ! compare_shas "0000000000000000000000000000000000000000" \
                  "abc123def456abc123def456abc123def456abc1" \
                  >/dev/null 2>&1; then
  echo "PASS Test 2: stale SHA (deliberate drift) — exit non-zero (guard correctly rejects)"
  ((PASS++))
else
  echo "FAIL Test 2: stale SHA — expected exit non-zero, guard returned 0 (FALSE-GREEN)"
  ((FAIL++))
fi

# ---------------------------------------------------------------------------
# Test 3: Empty label (image built without GIT_SHA arg) — must return NON-ZERO
# ---------------------------------------------------------------------------
if ! compare_shas "" "abc123def456abc123def456abc123def456abc1" \
                 >/dev/null 2>&1; then
  echo "PASS Test 3: empty label — exit non-zero (guard correctly rejects)"
  ((PASS++))
else
  echo "FAIL Test 3: empty label — expected exit non-zero, guard returned 0 (FALSE-GREEN)"
  ((FAIL++))
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "Results: $PASS pass, $FAIL fail"

if [ "$FAIL" -eq 0 ]; then
  echo "OK: all SHA comparison unit tests passed."
  exit 0
else
  echo "ERROR: $FAIL unit test(s) failed." >&2
  exit 1
fi
