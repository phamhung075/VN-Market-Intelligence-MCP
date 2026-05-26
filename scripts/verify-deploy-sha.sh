#!/usr/bin/env bash
# verify-deploy-sha.sh — Deploy gate: verify running container image SHA matches HEAD.
# Replaces the timestamp-comparison step in docs/protocols/docker-deployment-runbook.md §Step 4.
# Usage: scripts/verify-deploy-sha.sh <service> [expected_sha]
# Exit 0: deployed SHA matches expected SHA.
# Exit 1: SHA drift detected, label absent, or container not found.
#
# Skipped services: flaresolverr (pulled image, no local Dockerfile — no vn.market.git_sha label).
#
# Exportable comparison function (sourced by unit tests — no Docker required):
#   compare_shas <deployed_sha> <expected_sha>
#   Returns 0 on match, 1 on mismatch or empty deployed SHA.

set -euo pipefail

# ---------------------------------------------------------------------------
# compare_shas — pure logic, no Docker, unit-testable
# ---------------------------------------------------------------------------
compare_shas() {
  local deployed="$1"
  local expected="$2"

  if [ -z "$deployed" ]; then
    echo "ERROR: vn.market.git_sha label absent — image built without GIT_SHA arg. Rebuild required." >&2
    return 1
  fi

  if [ "$deployed" != "$expected" ]; then
    echo "ERROR: SHA drift detected. deployed=$deployed expected=$expected" >&2
    return 1
  fi

  echo "OK: deployed SHA matches HEAD ($deployed)."
  return 0
}
export -f compare_shas

# ---------------------------------------------------------------------------
# Main — only executed when script is run directly (not sourced)
# ---------------------------------------------------------------------------
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  SERVICE="${1:-}"
  EXPECTED_SHA="${2:-$(git rev-parse HEAD)}"

  if [ -z "$SERVICE" ]; then
    echo "ERROR: service name required. Usage: $0 <service> [expected_sha]" >&2
    exit 1
  fi

  CONTAINER_ID=$(docker compose ps -q "$SERVICE" 2>/dev/null | head -1)
  if [ -z "$CONTAINER_ID" ]; then
    echo "ERROR: container not found for service=$SERVICE (is it running?)" >&2
    exit 1
  fi

  # Confirm the container is in running state before reading its label
  CONTAINER_STATE=$(docker inspect --format '{{.State.Status}}' "$CONTAINER_ID" 2>/dev/null)
  if [ "$CONTAINER_STATE" != "running" ]; then
    echo "ERROR: container for service=$SERVICE is not running (state=$CONTAINER_STATE)" >&2
    exit 1
  fi

  DEPLOYED_SHA=$(docker inspect \
    --format '{{ index .Config.Labels "vn.market.git_sha" }}' \
    "$CONTAINER_ID")

  compare_shas "$DEPLOYED_SHA" "$EXPECTED_SHA"
fi
