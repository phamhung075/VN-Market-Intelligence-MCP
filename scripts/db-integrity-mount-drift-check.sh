#!/usr/bin/env bash
# scripts/db-integrity-mount-drift-check.sh — REGRESSION GUARD (AC-7,
# FIX-DB-INTEGRITY-SIDECAR-NAMED-VOLUME-DRIFT).
#
# WHY THIS EXISTS: the 2026-08-06 root-cause was that the mcp-server RUNTIME's DB mount
# was migrated (2026-07-15 commit 5ba622eca: docker named volume -> host bind mount
# ./data/live:/app/data) while the READ-ONLY OBSERVER scripts (db-integrity-counts.sh,
# db-integrity-probe.sh) kept targeting the old mount for 21 days, silently. Nothing
# ever asserted the two stayed in sync. This script closes that gap: it resolves the
# mcp-server container's LIVE `/app/data` bind-mount source (ground truth, via `docker
# inspect`) and asserts it is the SAME path the observer scripts are configured to read
# (MARKET_DB_HOST_PATH default, same env var/default as db-integrity-counts.sh /
# db-integrity-probe.sh / db-empty-table-classify.sh). A future re-drift (e.g. someone
# re-introducing a named volume, or moving the bind mount elsewhere) makes this FAIL LOUD.
#
# SCOPE: this needs the LIVE docker stack running (the actual mcp-server container) to
# assert anything meaningful — CI (GitHub Actions ubuntu-latest) has no such stack, so
# this script is NOT wired into .github/workflows/ci.yml (it would only ever SKIP there,
# which is not a useful gate). It IS runnable locally / by ops / by a periodic check
# against the real stack. The regression-coverage half of AC-7 is
# db-integrity-mount-drift-check.test.sh (pure bash, stubbed `docker`, real assertion
# logic exercised — runs anywhere, no live docker/DB needed).
#
# VERDICT CONTRACT:
#   exit 0 = PASS (mounts match) OR SKIP (docker/container unreachable — cannot assert,
#            not a defect on its own; distinguishable via the printed message).
#   exit 1 = FAIL — mcp-server IS running but its /app/data mount source does NOT match
#            the observer scripts' configured path (the regression this guard exists
#            to catch), OR the container is running with no /app/data mount at all.
#
# Env overrides (test seam — db-integrity-mount-drift-check.test.sh mocks `docker` as a
# function after sourcing, same pattern as db-integrity-probe.test.sh):
#   MARKET_DB_HOST_PATH — observer's configured DB file path (default: <repo>/data/live/market.db)
#   MCP_CONTAINER_NAME_FILTER — docker ps name filter (default: mcp-server)
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MARKET_DB_HOST_PATH="${MARKET_DB_HOST_PATH:-$REPO_ROOT/data/live/market.db}"
MCP_CONTAINER_NAME_FILTER="${MCP_CONTAINER_NAME_FILTER:-mcp-server}"

_realpath_dir() {
  # Portable realpath-of-a-directory (bash 3.2 / macOS-safe — no `realpath` dependency).
  ( cd "$1" 2>/dev/null && pwd -P )
}

run_mount_drift_check() {
  local ctr mount_src observer_dir observer_real mount_real

  ctr=$(docker ps --format '{{.Names}}' 2>/dev/null | grep "$MCP_CONTAINER_NAME_FILTER" | head -1)
  if [ -z "$ctr" ]; then
    echo "[db-integrity-mount-drift-check] SKIP: no running container matching '${MCP_CONTAINER_NAME_FILTER}' — cannot assert mount drift (docker/stack not available in this environment)" >&2
    return 0
  fi

  mount_src=$(docker inspect "$ctr" --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Source}}{{end}}{{end}}' 2>/dev/null)
  if [ -z "$mount_src" ]; then
    echo "[db-integrity-mount-drift-check] FAIL: container '${ctr}' is running but has NO /app/data mount at all (docker inspect returned empty) — cannot be the live DB host" >&2
    return 1
  fi

  observer_dir="$(dirname "$MARKET_DB_HOST_PATH")"
  observer_real="$(_realpath_dir "$observer_dir")"
  mount_real="$(_realpath_dir "$mount_src")"

  if [ -z "$observer_real" ] || [ -z "$mount_real" ]; then
    echo "[db-integrity-mount-drift-check] SKIP: could not resolve realpath for observer_dir='${observer_dir}' or mount_src='${mount_src}' (path does not exist on this host) — cannot assert" >&2
    return 0
  fi

  if [ "$observer_real" = "$mount_real" ]; then
    echo "[db-integrity-mount-drift-check] PASS: mcp-server container '${ctr}' /app/data mount source (${mount_real}) matches the observer scripts' configured DB dir (${observer_real})"
    return 0
  fi

  echo "[db-integrity-mount-drift-check] FAIL: MOUNT DRIFT DETECTED — mcp-server container '${ctr}' /app/data mount source is '${mount_real}' but the observer scripts (db-integrity-counts.sh, db-integrity-probe.sh, db-empty-table-classify.sh) are configured to read '${observer_real}' (MARKET_DB_HOST_PATH). The runtime and the observer have diverged AGAIN — this is exactly the FIX-DB-INTEGRITY-SIDECAR-NAMED-VOLUME-DRIFT class of bug. Fix: either update MARKET_DB_HOST_PATH to match the container's real mount, or fix the mount — do NOT silently ignore." >&2
  return 1
}

# ── Standalone execution (only when run directly, not sourced by a test harness) ──
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_mount_drift_check
  exit $?
fi
