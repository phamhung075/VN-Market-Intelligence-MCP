#!/usr/bin/env bash
# build.sh — compile TypeScript dashboard sources + bake sandbox verdicts.
#
# Usage (from apps/technical-analysis/):
#   ./dashboard/build.sh
#
# Output:
#   dashboard/dist/app.js
#   dashboard/dist/rerun-handler.js
#   dashboard/dist/scenario-results.js   ← auto-generated; contains real pass/fail
#
# Constraints:
#   - Outputs are plain ES2020 IIFE bundles — no import/export, no module loader.
#   - No Node runtime at page-load time; index.html opens via file://.
#   - Zero external network at runtime; esbuild runs only at build time.
#   - Sandbox runs with CGO_ENABLED=0 and zero DB credentials (env-audited).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TA_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SCENARIOS_ROOT="$(cd "${TA_ROOT}/../.." && pwd)/docs/scenarios/technical-analysis"

mkdir -p "${SCRIPT_DIR}/dist"

echo "Building dashboard TypeScript sources..."

# app.ts → dist/app.js
"${TA_ROOT}/node_modules/.bin/esbuild" \
  "${SCRIPT_DIR}/app.ts" \
  --bundle=false \
  --format=iife \
  --target=es2020 \
  --platform=browser \
  --outfile="${SCRIPT_DIR}/dist/app.js" \
  --log-level=info

# rerun-handler.ts → dist/rerun-handler.js
# rerun-handler imports a type-only reference from app.ts (stripped at compile time).
"${TA_ROOT}/node_modules/.bin/esbuild" \
  "${SCRIPT_DIR}/rerun-handler.ts" \
  --bundle=false \
  --format=iife \
  --target=es2020 \
  --platform=browser \
  --outfile="${SCRIPT_DIR}/dist/rerun-handler.js" \
  --log-level=info

# ---------------------------------------------------------------------------
# Bake sandbox verdicts → dashboard/dist/scenario-results.js
#
# Runs CGO_ENABLED=0 go run ./cmd/sandbox over every scenario JSON,
# captures the "status" field ("green"|"red") from the JSON output,
# and writes window.__SCENARIO_RESULTS__ so the dashboard shows real
# pass/fail on open — no manual paste required.
#
# Security: CGO_ENABLED=0, sandbox audited for zero DB credentials.
# Manual paste-back path (rerun-handler.js) is preserved unchanged.
# ---------------------------------------------------------------------------
echo ""
echo "Baking sandbox verdicts..."

RESULTS_FILE="${SCRIPT_DIR}/dist/scenario-results.js"
SANDBOX_CMD="CGO_ENABLED=0 go run ${TA_ROOT}/cmd/sandbox"

passed=0
failed=0
errors=0

# Start JSON object
printf 'window.__SCENARIO_RESULTS__ = {\n' > "${RESULTS_FILE}"

run_scenario() {
  local tier="$1"
  local filename="$2"
  local scenario_path="$3"

  # Run sandbox; capture stdout; exit code 0=green, 1=red, other=error
  local output
  output=$(CGO_ENABLED=0 go run "${TA_ROOT}/cmd/sandbox" \
    -tier="${tier}" \
    -scenario="${scenario_path}" \
    2>/dev/null) || true

  local status
  status=$(echo "${output}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('status','red'))" 2>/dev/null) || status="red"

  if [ -z "${status}" ]; then
    status="red"
  fi

  printf '  "%s": "%s",\n' "${filename%.json}" "${status}" >> "${RESULTS_FILE}"

  if [ "${status}" = "green" ]; then
    passed=$((passed + 1))
    echo "  [green] ${tier}/${filename}"
  else
    failed=$((failed + 1))
    echo "  [RED]   ${tier}/${filename}"
  fi
}

# Primitive scenarios
for f in "${SCENARIOS_ROOT}/primitives/"*.json; do
  filename=$(basename "${f}")
  run_scenario "primitive" "${filename}" "${filename}"
done

# Module scenarios
for f in "${SCENARIOS_ROOT}/module/"*.json; do
  filename=$(basename "${f}")
  run_scenario "module" "${filename}" "${filename}"
done

# Service scenarios (httptest.NewServer — in-process, no port, zero credentials)
for f in "${SCENARIOS_ROOT}/service/"*.json; do
  filename=$(basename "${f}")
  run_scenario "service" "${filename}" "${filename}"
done

# Close JSON object (trailing comma on last entry is harmless in modern JS engines,
# but to be safe we use a sentinel entry that parsers ignore)
printf '  "__built__": "%s"\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "${RESULTS_FILE}"
printf '};\n' >> "${RESULTS_FILE}"

echo ""
echo "Sandbox results: ${passed} passed / ${failed} failed"
echo "Results file: ${RESULTS_FILE}"
echo ""
echo "Build complete. Outputs:"
ls -lh "${SCRIPT_DIR}/dist/"

# ---------------------------------------------------------------------------
# Render gate — headless browser check (G8 honest red/green proof).
#
# Loads file://...index.html in headless Chromium via playwright-core,
# reads the live rendered DOM, and asserts full-green state:
#   30 dot-green, 0 dot-red, 0 dot-pending, 0 JS errors, no NOT RUN text.
#
# Exits non-zero (and fails the build) if any assertion fails.
# Screenshot saved to dashboard/dist/render-check.png as evidence.
# ---------------------------------------------------------------------------
echo ""
echo "Running headless render check (verify-render.mjs)..."
node "${SCRIPT_DIR}/verify-render.mjs"
