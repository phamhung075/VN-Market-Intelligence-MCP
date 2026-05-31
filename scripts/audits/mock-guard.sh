#!/usr/bin/env bash
# mock-guard.sh — Mock / Placeholder Production Guard
# Scans production source for fabricated-data patterns that must never ship.
# SSOT: referenced from docs/agents/qa/flow/main.md (per-task gate)
#       and docs/agents/dev-team/flow/post-cycle.md (cycle-end backstop).
# Usage:
#   Per-task QA:    bash scripts/audits/mock-guard.sh --files "file1.ts file2.ts"
#   Full backstop:  bash scripts/audits/mock-guard.sh --full
# Exit: 0 = PASS, 1 = HARD-FAIL (fabricated data found), 2 = CAUTION (ambiguous, non-blocking)
# stdout: human-readable findings; stderr: script errors only.

set -uo pipefail
export LC_ALL=C
export LANG=C

# ---------------------------------------------------------------------------
# Inputs
# ---------------------------------------------------------------------------
MODE="${1:-}"        # --files | --full
TARGET="${2:-}"      # space-separated file list (--files mode) or unused (--full)

if [ "${MODE}" != "--files" ] && [ "${MODE}" != "--full" ]; then
  echo "Usage: mock-guard.sh --files \"file1.ts file2.ts\" | --full" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Exclude globs — applied to filter out legitimate test/scenario/spike paths
# Never fire on these path fragments:
# ---------------------------------------------------------------------------
EXCLUDE_PATHS="__tests__|__mocks__|\.test\.|\.spec\.|/sandbox/|/scenarios/|/spike/|/fixtures/|/_deprecated/|/node_modules/|testdata|/\.venv/|site-packages"

# ---------------------------------------------------------------------------
# Patterns (POSIX ERE for grep -E)
# Hard-fail group: strong evidence of fabricated data in a production code path
# Caution group:   ambiguous alone — only comment markers without data fabrication
# ---------------------------------------------------------------------------

# HARD: function/method returns a hardcoded literal AND has a mock/placeholder qualifier
#   Catches: return [ { "ticker": "FPT", ...mock data... } ]
#            return { data: "placeholder", ... }
#            fakeData = [...]
HARD_INLINE_RETURN='(return\s+[\[{]|=\s*[\[{])\s*[^}]*\b(mock|fake|dummy|placeholder|sample)\b'

# HARD: comment on same line as a return or assignment explicitly calling it mock/fabricated
#   Catches: return fetchOhlcvData(ticker)   // Mock fetcher: ...
#            const data = getData()  // placeholder until real API
HARD_COMMENT_QUALIFIER='(return|const|let|var|=)\s+[^;]+//\s*(mock|placeholder|fake|stub|dummy|fabricated|hardcoded|sample data)'

# HARD: explicit marker identifiers in non-test production code
#   Catches: mockData, fakeData, sampleData, dummyData as variable/property names
#            Note: 'placeholder' as identifier excluded — too noisy (SQL sqlInClause)
HARD_IDENTIFIER='\b(mockData|fakeData|sampleData|dummyData|MOCK_DATA|FAKE_DATA|SAMPLE_DATA)\b'

# CAUTION: lone TODO/FIXME/XXX/HACK/TEMP markers (non-blocking)
CAUTION_MARKERS='//\s*(TODO|FIXME|XXX|HACK|TEMP)\b'

# ---------------------------------------------------------------------------
# Build file list
# ---------------------------------------------------------------------------
if [ "${MODE}" = "--files" ]; then
  # Per-task: filter provided files to production source only
  file_list=""
  for f in ${TARGET}; do
    # Skip if path matches any exclude pattern
    if echo "${f}" | grep -qE "${EXCLUDE_PATHS}"; then
      continue
    fi
    # Only include source files
    if echo "${f}" | grep -qE '\.(ts|tsx|js|py|go)$'; then
      [ -f "${f}" ] && file_list="${file_list} ${f}"
    fi
  done
  if [ -z "${file_list}" ]; then
    echo "[mock-guard] No production source files to scan. PASS."
    exit 0
  fi
  SCAN_CMD_PREFIX="grep -nE"
  SCAN_TARGET="${file_list}"
else
  # Full backstop: scan production source roots, exclude test paths
  # Scope: apps/*/src/ (TS), apps/pdf-extractor/ + apps/rag-service/ (Python), apps/*/pkg/ + apps/*/cmd/server/ (Go)
  # Exclude node_modules, test dirs, sandbox, scenarios, spike, fixtures, _deprecated
  SCAN_CMD_PREFIX="grep -rnE --include=*.ts --include=*.tsx --include=*.py --include=*.go"
  SCAN_TARGET="apps/"
fi

# ---------------------------------------------------------------------------
# Run checks
# ---------------------------------------------------------------------------
hard_hits=""
caution_hits=""

run_grep() {
  local pattern="$1"
  local result=""
  if [ "${MODE}" = "--files" ]; then
    # shellcheck disable=SC2086
    result="$(grep -nE "${pattern}" ${SCAN_TARGET} 2>/dev/null || true)"
  else
    result="$(grep -rnE "${pattern}" \
      --include="*.ts" --include="*.tsx" --include="*.py" --include="*.go" \
      "${SCAN_TARGET}" 2>/dev/null || true)"
  fi
  # Filter out excluded paths
  if [ -n "${result}" ]; then
    result="$(echo "${result}" | grep -vE "${EXCLUDE_PATHS}" || true)"
  fi
  echo "${result}"
}

hard_hits_1="$(run_grep "${HARD_INLINE_RETURN}")"
hard_hits_2="$(run_grep "${HARD_COMMENT_QUALIFIER}")"
hard_hits_3="$(run_grep "${HARD_IDENTIFIER}")"

caution_hits="$(run_grep "${CAUTION_MARKERS}")"

hard_hits=""
[ -n "${hard_hits_1}" ] && hard_hits="${hard_hits}${hard_hits_1}"$'\n'
[ -n "${hard_hits_2}" ] && hard_hits="${hard_hits}${hard_hits_2}"$'\n'
[ -n "${hard_hits_3}" ] && hard_hits="${hard_hits}${hard_hits_3}"$'\n'
# Deduplicate
hard_hits="$(echo "${hard_hits}" | sort -u | grep -v '^$' || true)"
caution_hits="$(echo "${caution_hits}" | sort -u | grep -v '^$' || true)"

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
EXIT_CODE=0

if [ -n "${hard_hits}" ]; then
  echo "[mock-guard] HARD-FAIL — fabricated data detected in production source:"
  echo "${hard_hits}"
  EXIT_CODE=1
fi

if [ -n "${caution_hits}" ]; then
  echo "[mock-guard] CAUTION — ambiguous markers (non-blocking, review recommended):"
  echo "${caution_hits}"
  # Only set exit to 2 if not already failing hard
  [ "${EXIT_CODE}" -eq 0 ] && EXIT_CODE=2
fi

if [ "${EXIT_CODE}" -eq 0 ]; then
  echo "[mock-guard] PASS — no fabricated-data patterns found in production source."
fi

exit "${EXIT_CODE}"
