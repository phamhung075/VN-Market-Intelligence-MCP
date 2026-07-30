#!/usr/bin/env bash
# scripts/audits/no-hardcode-allowlist-scan.test.sh
# Smoke test for scripts/audits/no-hardcode-allowlist-scan.sh (FACTORY-GUARD-CI-NOHARDCODE-IMPL).
#
# Every synthetic fixture lives under a disposable, UNTRACKED subdir
# (apps/mcp-server/src/__no_hardcode_scan_fixtures__/), scoped via
# NO_HARDCODE_SCAN_INCLUDE_OVERRIDE so each case only ever scans its own
# fixture file — never the live repo tree. Fixture dir is removed on exit
# (trap).
#
# Covers the DoD cases from
# docs/architecture-briefs/2026-07-24-factory-guard-ci-no-hardcode-allowlist-scan.md:
#   1. --check exits 0 on the current live repo (post-fix: the CTG/IMP
#      reason-string fixes + the JANITOR-034/035 annotations all landed)
#   2. a synthetic temporal-combo (`.includes('YYYY') && year === YYYY`) fixture fails --check
#   3. a synthetic ticker-branch (`code === "XYZ"`) fixture fails --check
#   4. a synthetic HOSE/HNX/UPCOM/BLOOMBERG exchange-enum comparison passes --check
#   5. an annotated (hardcode-scan-allow:) line passes --check
# Plus bonus coverage: positive control (same shape without annotation
# fails), Go-dialect temporal combo (`==` instead of `===`), property-access
# identifier shape (`report.action_code === "XXX"`), and a comment-only
# keyword mention passing.
#
# Usage: bash scripts/audits/no-hardcode-allowlist-scan.test.sh

set -u
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && { echo "FAIL: cannot determine PROJECT_ROOT"; exit 1; }
cd "$PROJECT_ROOT" || { echo "FAIL: cannot cd to PROJECT_ROOT"; exit 1; }

SCRIPT="$PROJECT_ROOT/scripts/audits/no-hardcode-allowlist-scan.sh"
FIXTURE_DIR="$PROJECT_ROOT/apps/mcp-server/src/__no_hardcode_scan_fixtures__"

# shellcheck disable=SC2329 # invoked indirectly via `trap ... EXIT` below
cleanup() { rm -rf "$FIXTURE_DIR"; }
trap cleanup EXIT

mkdir -p "$FIXTURE_DIR"

PASS_COUNT=0
FAIL_COUNT=0
ok()  { echo "PASS: $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
bad() { echo "FAIL: $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }

# ---------------------------------------------------------------------------
# DoD-1: --check exits 0 on the current live repo (post-fix/post-annotation
# state). No override — exercises the real script against the real repo tree.
# ---------------------------------------------------------------------------
bash "$SCRIPT" --check > /tmp/no-hardcode-scan-test-dod1.txt 2>&1
RC1=$?
if [ "$RC1" -eq 0 ]; then
  ok "DoD-1-live-repo-check-passes-post-fix-post-annotation (rc=0)"
else
  bad "DoD-1-live-repo-check-passes-post-fix-post-annotation (rc=${RC1}, expected 0)"
  cat /tmp/no-hardcode-scan-test-dod1.txt
fi

# ---------------------------------------------------------------------------
# DoD-2: synthetic temporal-combo (`.includes('YYYY') && year === YYYY`) fails.
# ---------------------------------------------------------------------------
F2="$FIXTURE_DIR/tc2_temporal_combo.ts"
cat > "$F2" <<'EOF'
export function discount(signalText: string, year: number): number {
  if (signalText.includes('2023') && year === 2024) {
    return 0.8;
  }
  return 1.0;
}
EOF
REL2="apps/mcp-server/src/__no_hardcode_scan_fixtures__/tc2_temporal_combo.ts"
NO_HARDCODE_SCAN_INCLUDE_OVERRIDE="$REL2" bash "$SCRIPT" --check > /tmp/no-hardcode-scan-test-dod2.txt 2>&1
RC2=$?
if [ "$RC2" -eq 1 ] && grep -q "TEMPORAL-COMBO" /tmp/no-hardcode-scan-test-dod2.txt; then
  ok "DoD-2-synthetic-temporal-combo-fails-check (rc=${RC2})"
else
  bad "DoD-2-synthetic-temporal-combo-fails-check (rc=${RC2})"
  cat /tmp/no-hardcode-scan-test-dod2.txt
fi

# ---------------------------------------------------------------------------
# DoD-3: synthetic ticker-branch (`code === "XYZ"`) fails.
# ---------------------------------------------------------------------------
F3="$FIXTURE_DIR/tc3_ticker_branch.ts"
cat > "$F3" <<'EOF'
export function reasonFor(code: string): string {
  return code === "XYZ"
    ? "special-cased reasoning for exactly one ticker"
    : "generic reasoning";
}
EOF
REL3="apps/mcp-server/src/__no_hardcode_scan_fixtures__/tc3_ticker_branch.ts"
NO_HARDCODE_SCAN_INCLUDE_OVERRIDE="$REL3" bash "$SCRIPT" --check > /tmp/no-hardcode-scan-test-dod3.txt 2>&1
RC3=$?
if [ "$RC3" -eq 1 ] && grep -q "TICKER-BRANCH" /tmp/no-hardcode-scan-test-dod3.txt; then
  ok "DoD-3-synthetic-ticker-branch-fails-check (rc=${RC3})"
else
  bad "DoD-3-synthetic-ticker-branch-fails-check (rc=${RC3})"
  cat /tmp/no-hardcode-scan-test-dod3.txt
fi

# ---------------------------------------------------------------------------
# DoD-4: a synthetic HOSE/HNX/UPCOM/BLOOMBERG exchange-enum comparison passes
# (denylist — stable domain-enum mapping, not volatile reference data).
# ---------------------------------------------------------------------------
F4="$FIXTURE_DIR/tc4_exchange_enum.ts"
cat > "$F4" <<'EOF'
export function mapFloor(code: string): string {
  if (code === "HOSE") return "HOSE";
  if (code === "HNX") return "HNX";
  if (code === "UPCOM") return "UPCOM";
  if (code === "BLOOMBERG") return "BLOOMBERG";
  return "UNKNOWN";
}
EOF
REL4="apps/mcp-server/src/__no_hardcode_scan_fixtures__/tc4_exchange_enum.ts"
NO_HARDCODE_SCAN_INCLUDE_OVERRIDE="$REL4" bash "$SCRIPT" --check > /tmp/no-hardcode-scan-test-dod4.txt 2>&1
RC4=$?
if [ "$RC4" -eq 0 ]; then
  ok "DoD-4-exchange-enum-denylist-passes-check (rc=${RC4})"
else
  bad "DoD-4-exchange-enum-denylist-passes-check (rc=${RC4})"
  cat /tmp/no-hardcode-scan-test-dod4.txt
fi

# ---------------------------------------------------------------------------
# DoD-5: an annotated (hardcode-scan-allow:) line passes --check — mirrors
# the real newsChainFallback.ts (JANITOR-035) / cascadeExecutor.ts +
# priceSourceRouter.ts (JANITOR-034) annotations.
# ---------------------------------------------------------------------------
F5="$FIXTURE_DIR/tc5_annotated.ts"
cat > "$F5" <<'EOF'
export function reasonForAnnotated(code: string): string {
  // hardcode-scan-allow: JANITOR-999 — pending generalization decision, tracked in docs/data/code-janitor-known-findings.json
  return code === "XYZ"
    ? "special-cased reasoning for exactly one ticker"
    : "generic reasoning";
}
EOF
REL5="apps/mcp-server/src/__no_hardcode_scan_fixtures__/tc5_annotated.ts"
NO_HARDCODE_SCAN_INCLUDE_OVERRIDE="$REL5" bash "$SCRIPT" --check > /tmp/no-hardcode-scan-test-dod5.txt 2>&1
RC5=$?
if [ "$RC5" -eq 0 ]; then
  ok "DoD-5-annotated-hardcode-scan-allow-line-passes-check (rc=${RC5})"
else
  bad "DoD-5-annotated-hardcode-scan-allow-line-passes-check (rc=${RC5})"
  cat /tmp/no-hardcode-scan-test-dod5.txt
fi

# ---------------------------------------------------------------------------
# Bonus: same fixture WITHOUT the annotation fails (negative control proving
# DoD-5's PASS is caused by the annotation, not by the shape being unmatched).
# ---------------------------------------------------------------------------
F5B="$FIXTURE_DIR/tc5b_unannotated.ts"
cat > "$F5B" <<'EOF'
export function reasonForUnannotated(code: string): string {
  return code === "XYZ"
    ? "special-cased reasoning for exactly one ticker"
    : "generic reasoning";
}
EOF
REL5B="apps/mcp-server/src/__no_hardcode_scan_fixtures__/tc5b_unannotated.ts"
NO_HARDCODE_SCAN_INCLUDE_OVERRIDE="$REL5B" bash "$SCRIPT" --check > /tmp/no-hardcode-scan-test-dod5b.txt 2>&1
RC5B=$?
if [ "$RC5B" -eq 1 ]; then
  ok "bonus-positive-control-same-shape-without-annotation-fails-check (rc=${RC5B})"
else
  bad "bonus-positive-control-same-shape-without-annotation-fails-check (rc=${RC5B})"
  cat /tmp/no-hardcode-scan-test-dod5b.txt
fi

# ---------------------------------------------------------------------------
# Bonus: Go-dialect temporal combo (`==` instead of `===`) fails.
# ---------------------------------------------------------------------------
F6="$FIXTURE_DIR/tc6_temporal_combo_go.go"
cat > "$F6" <<'EOF'
package fixtures

func discount(signalText string, year int) float64 {
	if strings.Contains(signalText, "2023") && year == 2024 {
		return 0.8
	}
	return 1.0
}
EOF
REL6="apps/mcp-server/src/__no_hardcode_scan_fixtures__/tc6_temporal_combo_go.go"
NO_HARDCODE_SCAN_INCLUDE_OVERRIDE="$REL6" bash "$SCRIPT" --check > /tmp/no-hardcode-scan-test-dod6.txt 2>&1
RC6=$?
if [ "$RC6" -eq 1 ] && grep -q "TEMPORAL-COMBO" /tmp/no-hardcode-scan-test-dod6.txt; then
  ok "bonus-go-dialect-temporal-combo-fails-check (rc=${RC6})"
else
  bad "bonus-go-dialect-temporal-combo-fails-check (rc=${RC6})"
  cat /tmp/no-hardcode-scan-test-dod6.txt
fi

# ---------------------------------------------------------------------------
# Bonus: property-access identifier shape (`report.action_code === "XXX"`)
# — mirrors the real backfillBctcScalarsTool.ts:199 pre-fix shape — fails.
# ---------------------------------------------------------------------------
F7="$FIXTURE_DIR/tc7_property_access.ts"
cat > "$F7" <<'EOF'
export function reasonForReport(report: { action_code: string }): string {
  return report.action_code === "XYZ"
    ? "special-cased reasoning for exactly one ticker"
    : "generic reasoning";
}
EOF
REL7="apps/mcp-server/src/__no_hardcode_scan_fixtures__/tc7_property_access.ts"
NO_HARDCODE_SCAN_INCLUDE_OVERRIDE="$REL7" bash "$SCRIPT" --check > /tmp/no-hardcode-scan-test-dod7.txt 2>&1
RC7=$?
if [ "$RC7" -eq 1 ] && grep -q "TICKER-BRANCH" /tmp/no-hardcode-scan-test-dod7.txt; then
  ok "bonus-property-access-identifier-shape-fails-check (rc=${RC7})"
else
  bad "bonus-property-access-identifier-shape-fails-check (rc=${RC7})"
  cat /tmp/no-hardcode-scan-test-dod7.txt
fi

# ---------------------------------------------------------------------------
# Bonus: a keyword mentioned only in a comment is never a ticker-branch match.
# ---------------------------------------------------------------------------
F8="$FIXTURE_DIR/tc8_comment_only.ts"
cat > "$F8" <<'EOF'
// Historically code === "XYZ" special-cased the reasoning text; no longer true.
export function noop(): number {
  return 1;
}
EOF
REL8="apps/mcp-server/src/__no_hardcode_scan_fixtures__/tc8_comment_only.ts"
NO_HARDCODE_SCAN_INCLUDE_OVERRIDE="$REL8" bash "$SCRIPT" --check > /tmp/no-hardcode-scan-test-dod8.txt 2>&1
RC8=$?
if [ "$RC8" -eq 0 ]; then
  ok "bonus-comment-only-keyword-mention-passes-check (rc=${RC8})"
else
  bad "bonus-comment-only-keyword-mention-passes-check (rc=${RC8})"
  cat /tmp/no-hardcode-scan-test-dod8.txt
fi

echo "========================================"
echo "Test Results: PASS=${PASS_COUNT} FAIL=${FAIL_COUNT}"
echo "========================================"

[ "$FAIL_COUNT" -gt 0 ] && exit 1
exit 0
