#!/usr/bin/env bash
# test-sha-drift-guard.sh — Deliberate-stale-image end-to-end proof.
# Asserts that verify-deploy-sha.sh FAILS on an image built with a stale SHA label.
# Exit 0: guard correctly caught drift (proof PASSED).
# Exit 1: guard returned OK on stale image (FALSE-GREEN — guard is broken).
#
# LIVE RUN IS OPS-DEFERRED: This script requires a Docker daemon and will build/run
# a temporary Alpine container. It must NOT be run during development on memory-
# constrained hosts (16GB Mac with Docker capped at 8GB). Execution is delegated to
# the ops agent in a dedicated rebuild slot after DRIFT-3-A1 (Dockerfile labels) lands.
# Unit tests (test-sha-comparison-unit.sh) cover the comparison logic without Docker.
#
# Usage: bash scripts/test-sha-drift-guard.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

STALE_SHA="0000000000000000000000000000000000000000"
HEAD_SHA="$(git rev-parse HEAD)"
TEST_IMAGE="vn-drift-guard-test:stale"
TEST_CONTAINER="vn-drift-guard-test-container"

cleanup() {
  docker rm -f "$TEST_CONTAINER" 2>/dev/null || true
  docker rmi -f "$TEST_IMAGE" 2>/dev/null || true
}
trap cleanup EXIT

echo "--- SHA drift guard proof ---"
echo "HEAD SHA  : $HEAD_SHA"
echo "Stale SHA : $STALE_SHA"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Build a minimal image with the deliberately stale SHA label.
# The label is set via both --label (image metadata) and ARG GIT_SHA (Dockerfile).
# ---------------------------------------------------------------------------
echo "Building test image with stale SHA label..."
docker build \
  --build-arg GIT_SHA="$STALE_SHA" \
  --label "vn.market.git_sha=$STALE_SHA" \
  -t "$TEST_IMAGE" \
  -f - . <<'DOCKERFILE'
FROM alpine:3.20
ARG GIT_SHA=unknown
LABEL vn.market.git_sha="${GIT_SHA}"
CMD ["sleep", "30"]
DOCKERFILE

# ---------------------------------------------------------------------------
# Step 2: Run the test container in detached mode.
# ---------------------------------------------------------------------------
echo "Starting test container..."
docker run -d --name "$TEST_CONTAINER" "$TEST_IMAGE"

# ---------------------------------------------------------------------------
# Step 3: Read the label the same way verify-deploy-sha.sh does.
# ---------------------------------------------------------------------------
DEPLOYED_SHA=$(docker inspect \
  --format '{{ index .Config.Labels "vn.market.git_sha" }}' \
  "$TEST_CONTAINER")

echo "Deployed label SHA : $DEPLOYED_SHA"
echo ""

# ---------------------------------------------------------------------------
# Step 4: Source verify-deploy-sha.sh and call compare_shas directly.
# This mirrors exactly what the deploy gate does.
# The guard MUST return non-zero for the proof to pass.
# ---------------------------------------------------------------------------
# shellcheck source=./verify-deploy-sha.sh
source "$SCRIPT_DIR/verify-deploy-sha.sh"

if compare_shas "$DEPLOYED_SHA" "$HEAD_SHA" 2>/dev/null; then
  # Guard returned 0 on a stale image — this is a false-green failure
  echo "ERROR: proof FAILED — guard returned OK on a stale image (false-green). Guard is broken." >&2
  exit 1
fi

# Guard correctly returned non-zero — verify the stale label is what we injected
if [ "$DEPLOYED_SHA" = "$STALE_SHA" ]; then
  echo "OK: guard correctly detected drift (deployed=$STALE_SHA, expected=$HEAD_SHA)."
  echo "OK: deliberate-stale proof PASSED — verify-deploy-sha.sh will block stale deploys."
  exit 0
fi

echo "ERROR: unexpected label value: '$DEPLOYED_SHA' (expected stale=$STALE_SHA)" >&2
exit 1
