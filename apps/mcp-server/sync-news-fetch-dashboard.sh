#!/usr/bin/env bash
# sync-news-fetch-dashboard.sh
#
# Syncs the news-fetch dashboard assets from the canonical source location
# (apps/news-fetch/dashboard/) into the mcp-server served copy
# (apps/mcp-server/src/interface/news-fetch-dashboard/).
#
# Run this script after ANY change to apps/news-fetch/dashboard/ to keep
# both locations in sync. The served copy is what the container serves
# at http://localhost:3000/dashboards/news-fetch/.
#
# DRY note:
#   - data.js, rerun-handler.js, results.json — copied VERBATIM (unchanged)
#   - index.html — copied + ENDPOINT var rewritten from absolute to relative
#       FROM: var ENDPOINT = 'http://localhost:3000/api/news-fetch/live?source=all&limit=20';
#       TO:   var ENDPOINT = '/api/news-fetch/live?source=all&limit=20';
#     The relative path resolves same-origin when served at
#     http://localhost:3000/dashboards/news-fetch/ — no CORS required.
#   - dash-check.mjs — NOT copied (file:// test harness; unsuitable for container smoke test)
#   - render-check.png — NOT copied (generated output, not a source asset)
#
# Usage from repo root:
#   bash apps/mcp-server/sync-news-fetch-dashboard.sh
#
# Usage from apps/mcp-server/:
#   bash sync-news-fetch-dashboard.sh
#   bun run sync-news-fetch-dashboard
#
# After running: review git diff in apps/mcp-server/src/interface/news-fetch-dashboard/
# and commit the changed files explicitly (never git add -A).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

SRC="${REPO_ROOT}/apps/news-fetch/dashboard"
DST="${REPO_ROOT}/apps/mcp-server/src/interface/news-fetch-dashboard"

echo "[sync-news-fetch-dashboard] repo root: ${REPO_ROOT}"
echo "[sync-news-fetch-dashboard] source:    ${SRC}"
echo "[sync-news-fetch-dashboard] dest:      ${DST}"

# Verify source exists
if [ ! -d "${SRC}" ]; then
  echo "[sync-news-fetch-dashboard] ERROR: source directory not found: ${SRC}" >&2
  exit 1
fi

mkdir -p "${DST}"

# ── 1. Copy verbatim assets ────────────────────────────────────────────────────
for asset in data.js rerun-handler.js results.json; do
  if [ -f "${SRC}/${asset}" ]; then
    cp "${SRC}/${asset}" "${DST}/${asset}"
    echo "[sync-news-fetch-dashboard] copied (verbatim): ${asset}"
  else
    echo "[sync-news-fetch-dashboard] WARNING: source asset not found, skipping: ${asset}"
  fi
done

# ── 2. Copy index.html + apply ENDPOINT rewrite ───────────────────────────────
INDEX_SRC="${SRC}/index.html"
INDEX_DST="${DST}/index.html"

if [ ! -f "${INDEX_SRC}" ]; then
  echo "[sync-news-fetch-dashboard] ERROR: source index.html not found: ${INDEX_SRC}" >&2
  exit 1
fi

# Copy source first
cp "${INDEX_SRC}" "${INDEX_DST}"

# Rewrite: absolute ENDPOINT → relative ENDPOINT
# FROM: var ENDPOINT = 'http://localhost:3000/api/news-fetch/live?source=all&limit=20';
# TO:   var ENDPOINT = '/api/news-fetch/live?source=all&limit=20';
sed -i '' \
  "s|var ENDPOINT = 'http://localhost:3000/api/news-fetch/live|var ENDPOINT = '/api/news-fetch/live|g" \
  "${INDEX_DST}"

# Also rewrite the absolute error-message references (cosmetic — user-visible text only)
sed -i '' \
  "s|check that mcp-server is running at localhost:3000\.|the live endpoint returned an error.|g" \
  "${INDEX_DST}"
sed -i '' \
  "s|Could not reach the server — check that mcp-server is running at localhost:3000\.|Could not reach the live endpoint — check that mcp-server is running.|g" \
  "${INDEX_DST}"

# Inject GENERATED header comment at the top of the file (after DOCTYPE)
HEADER='<!-- GENERATED FILE — DO NOT EDIT BY HAND.
     Source: apps/news-fetch/dashboard/index.html
     Sync:   apps/mcp-server/sync-news-fetch-dashboard.sh
     Served: /dashboards/news-fetch/ (via mcp-server port 3000)
     KEY DIFFERENCE from source: ENDPOINT is a RELATIVE path (/api/news-fetch/live...)
     so this copy works same-origin when served by mcp-server on port 3000.
     To re-sync: cd <repo-root> && bash apps/mcp-server/sync-news-fetch-dashboard.sh
-->'

TMP_FILE=$(mktemp)
head -1 "${INDEX_DST}" > "${TMP_FILE}"
printf '%s\n' "${HEADER}" >> "${TMP_FILE}"
tail -n +2 "${INDEX_DST}" >> "${TMP_FILE}"
mv "${TMP_FILE}" "${INDEX_DST}"

echo "[sync-news-fetch-dashboard] copied (with ENDPOINT rewrite + header): index.html"

# ── 3. Verification ────────────────────────────────────────────────────────────
echo ""
echo "[sync-news-fetch-dashboard] Verification:"

# Confirm no absolute localhost:3000 in served index.html ENDPOINT var
if grep -q "var ENDPOINT = 'http://localhost:3000" "${INDEX_DST}"; then
  echo "[sync-news-fetch-dashboard] ERROR: absolute ENDPOINT still present in ${INDEX_DST}" >&2
  exit 1
fi
echo "[sync-news-fetch-dashboard] PASS: no absolute ENDPOINT in served index.html"

# Confirm relative ENDPOINT present
if ! grep -q "var ENDPOINT = '/api/news-fetch/live" "${INDEX_DST}"; then
  echo "[sync-news-fetch-dashboard] ERROR: relative ENDPOINT not found in ${INDEX_DST}" >&2
  exit 1
fi
echo "[sync-news-fetch-dashboard] PASS: relative ENDPOINT present in served index.html"

# Confirm file:// degrade check is present
if ! grep -q "window.location.protocol === 'file:'" "${INDEX_DST}"; then
  echo "[sync-news-fetch-dashboard] ERROR: file:// degrade check missing in ${INDEX_DST}" >&2
  exit 1
fi
echo "[sync-news-fetch-dashboard] PASS: file:// degrade check present"

# Confirm no creds
if grep -qE "VPS_PUSH_API_KEY|x-api-key|Authorization|Bearer|DB_PATH|process\.env|Bun\.env" "${INDEX_DST}"; then
  echo "[sync-news-fetch-dashboard] ERROR: credentials detected in ${INDEX_DST}" >&2
  exit 1
fi
echo "[sync-news-fetch-dashboard] PASS: no credentials in served index.html"

echo ""
echo "[sync-news-fetch-dashboard] DONE. Review: git diff apps/mcp-server/src/interface/news-fetch-dashboard/"
