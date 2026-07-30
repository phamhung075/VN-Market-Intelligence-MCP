#!/usr/bin/env bash
# scripts/audits/shared-package-import-check.test.sh
# Smoke test for scripts/audits/shared-package-import-check.sh (FACTORY-GUARD-CI-SHAREDPKG-IMPL).
#
# Covers the 4 DoD cases from the board row / architecture brief:
#   1. A baseline-listed, zero-importer package passes --check (BASELINE line).
#   2. A synthetic new zero-importer package NOT in baseline fails --check.
#   3. A synthetic package with a real importer passes --check even though it
#      is ALSO still baseline-listed (real importer always wins).
#   4. The Alert/Signal/McpConfig advisory collision lines are emitted on the
#      live repo without affecting the (green) exit code.
#
# Fixtures 1-3 live under a disposable, UNTRACKED subdir directly beneath
# packages/ (packages/__sharedpkg_import_check_fixtures__/<pkg>/package.json)
# so they match the same one-level-under-packages/ shape the real gate scans
# — scoped per-case via SHAREDPKG_CHECK_PACKAGES_GLOB_OVERRIDE /
# SHAREDPKG_CHECK_SEARCH_INCLUDE_OVERRIDE so each case only ever touches its
# own fixture file(s), never the live repo tree. Each case also points
# SHAREDPKG_CHECK_BASELINE_OVERRIDE at a disposable mktemp file — the real
# docs/data/shared-package-import-baseline.json is only READ by case 4 (the
# live-repo run), never written by this test. Fixture dir + tmp baselines are
# removed on exit (trap).
#
# Usage: bash scripts/audits/shared-package-import-check.test.sh

set -u
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && { echo "FAIL: cannot determine PROJECT_ROOT"; exit 1; }
cd "$PROJECT_ROOT" || { echo "FAIL: cannot cd to PROJECT_ROOT"; exit 1; }

SCRIPT="$PROJECT_ROOT/scripts/audits/shared-package-import-check.sh"
FIXTURE_DIR="$PROJECT_ROOT/packages/__sharedpkg_import_check_fixtures__"
TMP_BASELINE="$(mktemp 2>/dev/null || echo "/tmp/shared-package-import-check-test-baseline-$$.json")"

cleanup() { rm -rf "$FIXTURE_DIR"; rm -f "$TMP_BASELINE"; }
trap cleanup EXIT

rm -rf "$FIXTURE_DIR"
mkdir -p "$FIXTURE_DIR"

PASS_COUNT=0
FAIL_COUNT=0
ok()  { echo "PASS: $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
bad() { echo "FAIL: $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }

REL_FIXTURE_DIR="packages/__sharedpkg_import_check_fixtures__"

# ---------------------------------------------------------------------------
# Case 1: baseline-listed, zero-importer package -> PASS (BASELINE line).
# ---------------------------------------------------------------------------
mkdir -p "$FIXTURE_DIR/fixture-baseline-pkg"
cat > "$FIXTURE_DIR/fixture-baseline-pkg/package.json" <<'EOF'
{ "name": "@vn-market/fixture-baseline-pkg", "version": "1.0.0" }
EOF
REL1="$REL_FIXTURE_DIR/fixture-baseline-pkg/package.json"
jq -n --arg k "fixture-baseline-pkg" '{entries: {($k): {npm_name: "@vn-market/fixture-baseline-pkg", tracked_by: "test-fixture"}}}' > "$TMP_BASELINE"

SHAREDPKG_CHECK_BASELINE_OVERRIDE="$TMP_BASELINE" \
SHAREDPKG_CHECK_PACKAGES_GLOB_OVERRIDE="$REL1" \
SHAREDPKG_CHECK_SEARCH_INCLUDE_OVERRIDE="$REL1" \
  bash "$SCRIPT" --check > /tmp/sharedpkg-test-case1.txt 2>&1
RC1=$?
if [ "$RC1" -eq 0 ] && grep -q "BASELINE: @vn-market/fixture-baseline-pkg" /tmp/sharedpkg-test-case1.txt; then
  ok "case1-baseline-listed-zero-importer-package-passes (rc=${RC1})"
else
  bad "case1-baseline-listed-zero-importer-package-passes (rc=${RC1})"
  cat /tmp/sharedpkg-test-case1.txt
fi

# ---------------------------------------------------------------------------
# Case 2: synthetic new zero-importer package, NOT in baseline -> FAIL.
# ---------------------------------------------------------------------------
mkdir -p "$FIXTURE_DIR/fixture-zero-pkg"
cat > "$FIXTURE_DIR/fixture-zero-pkg/package.json" <<'EOF'
{ "name": "@vn-market/fixture-zero-pkg", "version": "1.0.0" }
EOF
REL2="$REL_FIXTURE_DIR/fixture-zero-pkg/package.json"
: > "$TMP_BASELINE"
jq -n '{entries: {}}' > "$TMP_BASELINE"

SHAREDPKG_CHECK_BASELINE_OVERRIDE="$TMP_BASELINE" \
SHAREDPKG_CHECK_PACKAGES_GLOB_OVERRIDE="$REL2" \
SHAREDPKG_CHECK_SEARCH_INCLUDE_OVERRIDE="$REL2" \
  bash "$SCRIPT" --check > /tmp/sharedpkg-test-case2.txt 2>&1
RC2=$?
if [ "$RC2" -eq 1 ] && grep -q "FAIL: @vn-market/fixture-zero-pkg" /tmp/sharedpkg-test-case2.txt; then
  ok "case2-synthetic-new-zero-importer-package-not-in-baseline-fails (rc=${RC2})"
else
  bad "case2-synthetic-new-zero-importer-package-not-in-baseline-fails (rc=${RC2})"
  cat /tmp/sharedpkg-test-case2.txt
fi

# ---------------------------------------------------------------------------
# Case 3: package WITH a real importer passes, even though it is ALSO still
# baseline-listed (real importer always wins over baseline membership).
# ---------------------------------------------------------------------------
mkdir -p "$FIXTURE_DIR/fixture-imported-pkg"
cat > "$FIXTURE_DIR/fixture-imported-pkg/package.json" <<'EOF'
{ "name": "@vn-market/fixture-imported-pkg", "version": "1.0.0" }
EOF
cat > "$FIXTURE_DIR/fixture-imported-pkg-consumer.ts" <<'EOF'
import { Foo } from '@vn-market/fixture-imported-pkg';
export const reexported = Foo;
EOF
REL3_PKG="$REL_FIXTURE_DIR/fixture-imported-pkg/package.json"
REL3_CONSUMER="$REL_FIXTURE_DIR/fixture-imported-pkg-consumer.ts"
jq -n --arg k "fixture-imported-pkg" '{entries: {($k): {npm_name: "@vn-market/fixture-imported-pkg", tracked_by: "test-fixture"}}}' > "$TMP_BASELINE"

SHAREDPKG_CHECK_BASELINE_OVERRIDE="$TMP_BASELINE" \
SHAREDPKG_CHECK_PACKAGES_GLOB_OVERRIDE="$REL3_PKG" \
SHAREDPKG_CHECK_SEARCH_INCLUDE_OVERRIDE="$REL3_PKG $REL3_CONSUMER" \
  bash "$SCRIPT" --check > /tmp/sharedpkg-test-case3.txt 2>&1
RC3=$?
if [ "$RC3" -eq 0 ] && grep -q "PASS: @vn-market/fixture-imported-pkg — real importer" /tmp/sharedpkg-test-case3.txt; then
  ok "case3-real-importer-passes-regardless-of-baseline-membership (rc=${RC3})"
else
  bad "case3-real-importer-passes-regardless-of-baseline-membership (rc=${RC3})"
  cat /tmp/sharedpkg-test-case3.txt
fi

# ---------------------------------------------------------------------------
# Case 4: Alert/Signal/McpConfig advisory lines emitted on the LIVE repo,
# without affecting the (green) exit code. No overrides — exercises the real
# script against the real repo + the real, just-seeded baseline (3 current
# orphans all baseline-covered). Fixture dir MUST be removed first: git's
# pathspec matching for 'packages/*/package.json' (the script's own default,
# no override here) crosses directory boundaries the same way '**' does in
# this repo's git version, so a still-present nested fixture package.json
# would otherwise leak into this "no overrides" live-repo run.
# ---------------------------------------------------------------------------
rm -rf "$FIXTURE_DIR"
bash "$SCRIPT" --check > /tmp/sharedpkg-test-case4.txt 2>&1
RC4=$?
if [ "$RC4" -eq 0 ] \
  && grep -q "ADVISORY: Alert exported" /tmp/sharedpkg-test-case4.txt \
  && grep -q "ADVISORY: Signal exported" /tmp/sharedpkg-test-case4.txt \
  && grep -q "ADVISORY: McpConfig exported" /tmp/sharedpkg-test-case4.txt; then
  ok "case4-advisory-collision-lines-emitted-without-failing-check (rc=${RC4})"
else
  bad "case4-advisory-collision-lines-emitted-without-failing-check (rc=${RC4})"
  cat /tmp/sharedpkg-test-case4.txt
fi

echo "========================================"
echo "Test Results: PASS=${PASS_COUNT} FAIL=${FAIL_COUNT}"
echo "========================================"

[ "$FAIL_COUNT" -gt 0 ] && exit 1
exit 0
