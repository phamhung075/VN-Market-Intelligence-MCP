#!/usr/bin/env bash
# build.sh — compile TypeScript dashboard sources to browser-ready JS
#
# Usage (from apps/technical-analysis/):
#   ./dashboard/build.sh
#
# Output:
#   dashboard/dist/app.js
#   dashboard/dist/rerun-handler.js
#
# Constraints:
#   - Outputs are plain ES2020 IIFE bundles — no import/export, no module loader.
#   - No Node runtime at page-load time; index.html opens via file://.
#   - Zero external network at runtime; esbuild runs only at build time.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TA_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

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

echo "Build complete. Outputs:"
ls -lh "${SCRIPT_DIR}/dist/"
