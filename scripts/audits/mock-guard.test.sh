#!/usr/bin/env bash
# scripts/audits/mock-guard.test.sh — Regression test for mock-guard.sh
# (FIX-MOCKGUARD-SCOPE-EXCLUDE-TESTGO, 2026-07-29)
#
# AC1: Go *_test.go filename convention excluded (not just a tests/ directory).
# AC2: --full mode never scans gitignored/vendored trees (e.g. apps/*/~/.bun/**)
#      — proven against the REAL apps/mcp-server/~/.bun/install/cache dir
#      (already gitignored, `.gitignore` line 5 `~/`), fixture cleaned up after.
# AC3: exits 0 on a clean fixture AND a deliberately fabricated URL/identifier
#      planted in a NON-test production file still HARD-FAILs (detector not blinded).
# AC4: the exclusion is one language-aware convention (filename suffix), not a
#      growing list of one-off path literals — verified by grep on the script's
#      own EXCLUDE_PATHS definition (exactly one `_test\.go` alternative, no
#      per-directory `apps/macro-indicators/...` literal added).
#
# Fixtures for AC1/AC3-negative-control live in a disposable mktemp dir (never
# touches the real repo). The AC2 fixture is planted inside the REAL gitignored
# `~/` cache dir (the only way to prove --full's actual directory-walk behaviour
# against that real, already-huge vendored tree) and removed in the cleanup trap.

set -u

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "${PROJECT_ROOT}" ] && { echo "FAIL: cannot determine PROJECT_ROOT"; exit 1; }
cd "${PROJECT_ROOT}" || { echo "FAIL: cannot cd to PROJECT_ROOT"; exit 1; }

SCRIPT="${PROJECT_ROOT}/scripts/audits/mock-guard.sh"

TMPDIR_FIXTURES="$(mktemp -d 2>/dev/null || echo "/tmp/mockguard-test-$$")"
AC2_FIXTURE="${PROJECT_ROOT}/apps/mcp-server/~/.bun/install/cache/mockguard-test-ac2-fixture-$$.ts"

cleanup() { rm -rf "${TMPDIR_FIXTURES}"; rm -f "${AC2_FIXTURE}"; }
trap cleanup EXIT

PASS_COUNT=0
FAIL_COUNT=0
ok()  { echo "PASS: $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
bad() { echo "FAIL: $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }

# ---------------------------------------------------------------------------
# AC1: Go *_test.go stub-URL fixture — reproduces the real regression exactly
# (stubBOPURLBuilder-style, real HARD_COMMENT_QUALIFIER trigger: "//stub" inside
# the "https://stub..." literal) — must NOT HARD-FAIL when filename ends _test.go.
# ---------------------------------------------------------------------------
GO_TEST_FIXTURE="${TMPDIR_FIXTURES}/usecases_ac1_test.go"
cat > "${GO_TEST_FIXTURE}" <<'EOF'
package fixture

type stubURLBuilder struct{}

func (b *stubURLBuilder) BuildURL(start, end string) string {
	return fmt.Sprintf("https://stub.sbv.vn/bop?from=%s&to=%s", start, end)
}
EOF

OUT1="$(bash "${SCRIPT}" --files "${GO_TEST_FIXTURE}" 2>&1)"
RC1=$?
echo "${OUT1}"
if [ "${RC1}" -ne 1 ]; then
  ok "AC1-go-test-file-not-hard-failed (rc=${RC1}, expected != 1)"
else
  bad "AC1-go-test-file-not-hard-failed (rc=${RC1}, expected != 1) — _test.go exclusion not applied"
fi

# ---------------------------------------------------------------------------
# AC3 negative control: SAME content, NON-test filename — detector must still
# HARD-FAIL. Proves the exclusion is filename-suffix-scoped, not content-blind.
# ---------------------------------------------------------------------------
GO_PROD_FIXTURE="${TMPDIR_FIXTURES}/usecases_ac3_prod.go"
cp "${GO_TEST_FIXTURE}" "${GO_PROD_FIXTURE}"

OUT2="$(bash "${SCRIPT}" --files "${GO_PROD_FIXTURE}" 2>&1)"
RC2=$?
echo "${OUT2}"
if [ "${RC2}" -eq 1 ]; then
  ok "AC3-non-test-fabricated-url-still-hard-fails (rc=${RC2})"
else
  bad "AC3-non-test-fabricated-url-still-hard-fails (rc=${RC2}, expected 1 — detector blinded)"
fi

# ---------------------------------------------------------------------------
# AC3 negative control #2: explicit mockData identifier in a NON-test .ts file
# — a second, independent HARD trigger (not reliant on the "//stub" URL quirk).
# ---------------------------------------------------------------------------
TS_PROD_FIXTURE="${TMPDIR_FIXTURES}/fetcher_ac3_prod.ts"
cat > "${TS_PROD_FIXTURE}" <<'EOF'
export function fetchQuote(ticker: string) {
  const mockData = { ticker, price: 100 };
  return mockData;
}
EOF

OUT3="$(bash "${SCRIPT}" --files "${TS_PROD_FIXTURE}" 2>&1)"
RC3=$?
echo "${OUT3}"
if [ "${RC3}" -eq 1 ]; then
  ok "AC3-non-test-mockData-identifier-still-hard-fails (rc=${RC3})"
else
  bad "AC3-non-test-mockData-identifier-still-hard-fails (rc=${RC3}, expected 1)"
fi

# ---------------------------------------------------------------------------
# AC3: clean fixture (zero matching patterns) — exit 0 baseline contract.
# ---------------------------------------------------------------------------
CLEAN_FIXTURE="${TMPDIR_FIXTURES}/clean_ac3.ts"
cat > "${CLEAN_FIXTURE}" <<'EOF'
export function fetchQuote(ticker: string) {
  return getRealPriceFromDatabase(ticker);
}
EOF

OUT4="$(bash "${SCRIPT}" --files "${CLEAN_FIXTURE}" 2>&1)"
RC4=$?
echo "${OUT4}"
if [ "${RC4}" -eq 0 ]; then
  ok "AC3-clean-fixture-exits-0 (rc=${RC4})"
else
  bad "AC3-clean-fixture-exits-0 (rc=${RC4}, expected 0)"
fi

# ---------------------------------------------------------------------------
# AC2: plant a HARD-triggering fixture inside the REAL gitignored `~/` cache
# tree, run --full, assert it is invisible (excluded by construction, not by a
# path literal that could drift). Skips gracefully if the real cache dir is
# absent (e.g. a fresh clone that never ran `bun install`).
# ---------------------------------------------------------------------------
AC2_DIR="$(dirname "${AC2_FIXTURE}")"
if [ -d "${AC2_DIR}" ]; then
  cat > "${AC2_FIXTURE}" <<'EOF'
export const MOCK_DATA_AC2_FIXTURE_SENTINEL = { price: 999 };
EOF
  OUT5="$(bash "${SCRIPT}" --full 2>&1)"
  if echo "${OUT5}" | grep -q "MOCK_DATA_AC2_FIXTURE_SENTINEL"; then
    bad "AC2-vendored-cache-excluded-by-construction — fixture surfaced in --full output"
  else
    ok "AC2-vendored-cache-excluded-by-construction (apps/mcp-server/~/.bun fixture invisible to --full)"
  fi
else
  echo "SKIP: AC2 real-cache-dir fixture — ${AC2_DIR} absent (no bun install cache present); AC2 mechanism (git ls-files honors .gitignore) still exercised by construction on every --full run, just not directly assertable here."
  ok "AC2-vendored-cache-excluded-by-construction (skipped — cache dir absent, non-fatal)"
fi

# ---------------------------------------------------------------------------
# AC4: exclusion is ONE language-aware filename-suffix convention, not a
# growing list of one-off path literals (e.g. no apps/macro-indicators/...
# hardcoded path was added to EXCLUDE_PATHS).
# ---------------------------------------------------------------------------
EXCLUDE_LINE="$(grep -c '^EXCLUDE_PATHS=' "${SCRIPT}")"
TESTGO_COUNT="$(grep -o '_test\\\.go' "${SCRIPT}" | wc -l | tr -d ' ')"
MACRO_LITERAL="$(grep -c 'macro-indicators' "${SCRIPT}")"
if [ "${EXCLUDE_LINE}" = "1" ] && [ "${TESTGO_COUNT}" -ge 1 ] && [ "${MACRO_LITERAL}" = "0" ]; then
  ok "AC4-exclusion-is-single-convention-not-path-literal-list"
else
  bad "AC4-exclusion-is-single-convention-not-path-literal-list (EXCLUDE_PATHS lines=${EXCLUDE_LINE} _test.go-refs=${TESTGO_COUNT} macro-indicators-literal-refs=${MACRO_LITERAL})"
fi

# ---------------------------------------------------------------------------
# Regression: real --full run against the live repo no longer HARD-FAILs on
# the exact reported symptom (both stubBOPURLBuilder _test.go lines).
# ---------------------------------------------------------------------------
OUT6="$(bash "${SCRIPT}" --full 2>&1)"
RC6=$?
if [ "${RC6}" -ne 1 ]; then
  ok "live-repo-full-scan-no-longer-hard-fails (rc=${RC6}, was 1 pre-fix)"
else
  bad "live-repo-full-scan-no-longer-hard-fails (rc=${RC6})"
  echo "${OUT6}"
fi

echo "========================================"
echo "Test Results: PASS=${PASS_COUNT} FAIL=${FAIL_COUNT}"
echo "========================================"

[ "${FAIL_COUNT}" -gt 0 ] && exit 1
exit 0
