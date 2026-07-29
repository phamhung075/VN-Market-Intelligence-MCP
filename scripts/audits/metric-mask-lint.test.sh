#!/usr/bin/env bash
# scripts/audits/metric-mask-lint.test.sh
# Smoke test for scripts/audits/metric-mask-lint.sh (FACTORY-GUARD-CI-METRICMASK-IMPL).
#
# Every synthetic fixture lives under a disposable, UNTRACKED subdir
# (apps/mcp-server/src/__metric_mask_lint_fixtures__/), scoped via
# METRIC_MASK_LINT_INCLUDE_OVERRIDE so each case only ever scans its own
# fixture file — never the live repo tree. Fixture dir is removed on exit
# (trap).
#
# Covers the DoD cases from
# docs/architecture-briefs/2026-07-24-factory-guard-ci-metric-mask-lint.md:
#   1. --check exits 0 on the current live repo (post-fix: script + the 3
#      cascadeEngine.ts + 1 marketSentimentCalculator.ts fixes + the 2
#      metric-mask-allow: annotations all landed)
#   2. a synthetic new `?? 50`-style mask fails --check
#   3. `?? 0` / `?? null` pass --check
#   4. an annotated (metric-mask-allow:) line passes --check
# Plus bonus coverage for the `||`, Python `or`, and destructuring/param
# default shapes the script also detects.
#
# Usage: bash scripts/audits/metric-mask-lint.test.sh

set -u
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && { echo "FAIL: cannot determine PROJECT_ROOT"; exit 1; }
cd "$PROJECT_ROOT" || { echo "FAIL: cannot cd to PROJECT_ROOT"; exit 1; }

SCRIPT="$PROJECT_ROOT/scripts/audits/metric-mask-lint.sh"
FIXTURE_DIR="$PROJECT_ROOT/apps/mcp-server/src/__metric_mask_lint_fixtures__"

# shellcheck disable=SC2329 # invoked indirectly via `trap ... EXIT` below
cleanup() { rm -rf "$FIXTURE_DIR"; }
trap cleanup EXIT

mkdir -p "$FIXTURE_DIR"

PASS_COUNT=0
FAIL_COUNT=0
ok()  { echo "PASS: $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
bad() { echo "FAIL: $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }

# ---------------------------------------------------------------------------
# DoD-1: --check exits 0 on the current live repo (post-fix state).
# No override — exercises the real script against the real repo tree.
# ---------------------------------------------------------------------------
bash "$SCRIPT" --check > /tmp/metric-mask-lint-test-dod1.txt 2>&1
RC1=$?
if [ "$RC1" -eq 0 ]; then
  ok "DoD-1-live-repo-check-passes-post-fix-zero-offenders (rc=0)"
else
  bad "DoD-1-live-repo-check-passes-post-fix-zero-offenders (rc=${RC1}, expected 0)"
  cat /tmp/metric-mask-lint-test-dod1.txt
fi

# ---------------------------------------------------------------------------
# DoD-2: synthetic new `?? 50`-style mask fails --check.
# ---------------------------------------------------------------------------
F2="$FIXTURE_DIR/tc2_new_mask.ts"
cat > "$F2" <<'EOF'
export function fabricate(seed: { confidenceScore?: number }): number {
  return seed.confidenceScore ?? 50;
}
EOF
REL2="apps/mcp-server/src/__metric_mask_lint_fixtures__/tc2_new_mask.ts"
METRIC_MASK_LINT_INCLUDE_OVERRIDE="$REL2" bash "$SCRIPT" --check > /tmp/metric-mask-lint-test-dod2.txt 2>&1
RC2=$?
if [ "$RC2" -eq 1 ] && grep -q "tc2_new_mask.ts" /tmp/metric-mask-lint-test-dod2.txt; then
  ok "DoD-2-synthetic-new-nonzero-mask-fails-check (rc=${RC2})"
else
  bad "DoD-2-synthetic-new-nonzero-mask-fails-check (rc=${RC2})"
  cat /tmp/metric-mask-lint-test-dod2.txt
fi

# ---------------------------------------------------------------------------
# DoD-3a: `?? 0` passes (honest-zero idiom, not a mask).
# ---------------------------------------------------------------------------
F3A="$FIXTURE_DIR/tc3a_honest_zero.ts"
cat > "$F3A" <<'EOF'
export function honestZero(seed: { confidenceScore?: number }): number {
  return seed.confidenceScore ?? 0;
}
EOF
REL3A="apps/mcp-server/src/__metric_mask_lint_fixtures__/tc3a_honest_zero.ts"
METRIC_MASK_LINT_INCLUDE_OVERRIDE="$REL3A" bash "$SCRIPT" --check > /tmp/metric-mask-lint-test-dod3a.txt 2>&1
RC3A=$?
if [ "$RC3A" -eq 0 ]; then
  ok "DoD-3a-honest-zero-literal-passes-check (rc=${RC3A})"
else
  bad "DoD-3a-honest-zero-literal-passes-check (rc=${RC3A})"
  cat /tmp/metric-mask-lint-test-dod3a.txt
fi

# ---------------------------------------------------------------------------
# DoD-3b: `?? null` passes (never a numeric literal, always allowed).
# ---------------------------------------------------------------------------
F3B="$FIXTURE_DIR/tc3b_honest_null.ts"
cat > "$F3B" <<'EOF'
export function honestNull(seed: { confidenceScore?: number | null }): number | null {
  return seed.confidenceScore ?? null;
}
EOF
REL3B="apps/mcp-server/src/__metric_mask_lint_fixtures__/tc3b_honest_null.ts"
METRIC_MASK_LINT_INCLUDE_OVERRIDE="$REL3B" bash "$SCRIPT" --check > /tmp/metric-mask-lint-test-dod3b.txt 2>&1
RC3B=$?
if [ "$RC3B" -eq 0 ]; then
  ok "DoD-3b-honest-null-fallback-passes-check (rc=${RC3B})"
else
  bad "DoD-3b-honest-null-fallback-passes-check (rc=${RC3B})"
  cat /tmp/metric-mask-lint-test-dod3b.txt
fi

# ---------------------------------------------------------------------------
# DoD-4: an annotated (metric-mask-allow:) line passes --check — mirrors the
# real watchlist.ts:198 / brokerCredibilityTools.ts:51 annotations.
# ---------------------------------------------------------------------------
F4="$FIXTURE_DIR/tc4_annotated.ts"
cat > "$F4" <<'EOF'
export function configDefault(thresholds?: { impactScore?: number }): number {
  // metric-mask-allow: genuine user-configurable alert threshold default, not a fabricated metric.
  return thresholds?.impactScore ?? 7;
}
EOF
REL4="apps/mcp-server/src/__metric_mask_lint_fixtures__/tc4_annotated.ts"
METRIC_MASK_LINT_INCLUDE_OVERRIDE="$REL4" bash "$SCRIPT" --check > /tmp/metric-mask-lint-test-dod4.txt 2>&1
RC4=$?
if [ "$RC4" -eq 0 ]; then
  ok "DoD-4-annotated-metric-mask-allow-line-passes-check (rc=${RC4})"
else
  bad "DoD-4-annotated-metric-mask-allow-line-passes-check (rc=${RC4})"
  cat /tmp/metric-mask-lint-test-dod4.txt
fi

# ---------------------------------------------------------------------------
# Bonus: same fixture WITHOUT the annotation fails (negative control proving
# DoD-4's PASS is caused by the annotation, not by the shape being unmatched).
# ---------------------------------------------------------------------------
F4B="$FIXTURE_DIR/tc4b_unannotated.ts"
cat > "$F4B" <<'EOF'
export function configDefaultUnannotated(thresholds?: { impactScore?: number }): number {
  return thresholds?.impactScore ?? 7;
}
EOF
REL4B="apps/mcp-server/src/__metric_mask_lint_fixtures__/tc4b_unannotated.ts"
METRIC_MASK_LINT_INCLUDE_OVERRIDE="$REL4B" bash "$SCRIPT" --check > /tmp/metric-mask-lint-test-dod4b.txt 2>&1
RC4B=$?
if [ "$RC4B" -eq 1 ]; then
  ok "DoD-4-positive-control-same-shape-without-annotation-fails-check (rc=${RC4B})"
else
  bad "DoD-4-positive-control-same-shape-without-annotation-fails-check (rc=${RC4B})"
  cat /tmp/metric-mask-lint-test-dod4b.txt
fi

# ---------------------------------------------------------------------------
# Bonus: `||` fallback shape (JS/TS) — non-zero literal fails.
# ---------------------------------------------------------------------------
F5="$FIXTURE_DIR/tc5_logical_or.ts"
cat > "$F5" <<'EOF'
export function fabricateOr(magnitude: number | undefined): number {
  return magnitude || 42;
}
EOF
REL5="apps/mcp-server/src/__metric_mask_lint_fixtures__/tc5_logical_or.ts"
METRIC_MASK_LINT_INCLUDE_OVERRIDE="$REL5" bash "$SCRIPT" --check > /tmp/metric-mask-lint-test-dod5.txt 2>&1
RC5=$?
if [ "$RC5" -eq 1 ]; then
  ok "bonus-logical-or-nonzero-literal-fails-check (rc=${RC5})"
else
  bad "bonus-logical-or-nonzero-literal-fails-check (rc=${RC5})"
  cat /tmp/metric-mask-lint-test-dod5.txt
fi

# ---------------------------------------------------------------------------
# Bonus: Python `or` fallback shape — non-zero literal fails.
# ---------------------------------------------------------------------------
F6="$FIXTURE_DIR/tc6_python_or.py"
cat > "$F6" <<'EOF'
def fabricate_probability(probability):
    return probability or 0.75
EOF
REL6="apps/mcp-server/src/__metric_mask_lint_fixtures__/tc6_python_or.py"
METRIC_MASK_LINT_INCLUDE_OVERRIDE="$REL6" bash "$SCRIPT" --check > /tmp/metric-mask-lint-test-dod6.txt 2>&1
RC6=$?
if [ "$RC6" -eq 1 ]; then
  ok "bonus-python-or-nonzero-literal-fails-check (rc=${RC6})"
else
  bad "bonus-python-or-nonzero-literal-fails-check (rc=${RC6})"
  cat /tmp/metric-mask-lint-test-dod6.txt
fi

# ---------------------------------------------------------------------------
# Bonus: destructuring/param default shape — non-zero literal fails.
# ---------------------------------------------------------------------------
F7="$FIXTURE_DIR/tc7_destructure_default.ts"
cat > "$F7" <<'EOF'
export function withDefault({ impactScore = 8 }: { impactScore?: number }): number {
  return impactScore;
}
EOF
REL7="apps/mcp-server/src/__metric_mask_lint_fixtures__/tc7_destructure_default.ts"
METRIC_MASK_LINT_INCLUDE_OVERRIDE="$REL7" bash "$SCRIPT" --check > /tmp/metric-mask-lint-test-dod7.txt 2>&1
RC7=$?
if [ "$RC7" -eq 1 ]; then
  ok "bonus-destructuring-default-nonzero-literal-fails-check (rc=${RC7})"
else
  bad "bonus-destructuring-default-nonzero-literal-fails-check (rc=${RC7})"
  cat /tmp/metric-mask-lint-test-dod7.txt
fi

# ---------------------------------------------------------------------------
# Bonus: a keyword mentioned only in a comment is never a mask.
# ---------------------------------------------------------------------------
F8="$FIXTURE_DIR/tc8_comment_only.ts"
cat > "$F8" <<'EOF'
// A 5% return maps to score = 50 in the old (deprecated) normalisation scheme.
export function noop(): number {
  return 1;
}
EOF
REL8="apps/mcp-server/src/__metric_mask_lint_fixtures__/tc8_comment_only.ts"
METRIC_MASK_LINT_INCLUDE_OVERRIDE="$REL8" bash "$SCRIPT" --check > /tmp/metric-mask-lint-test-dod8.txt 2>&1
RC8=$?
if [ "$RC8" -eq 0 ]; then
  ok "bonus-comment-only-keyword-mention-passes-check (rc=${RC8})"
else
  bad "bonus-comment-only-keyword-mention-passes-check (rc=${RC8})"
  cat /tmp/metric-mask-lint-test-dod8.txt
fi

echo "========================================"
echo "Test Results: PASS=${PASS_COUNT} FAIL=${FAIL_COUNT}"
echo "========================================"

[ "$FAIL_COUNT" -gt 0 ] && exit 1
exit 0
