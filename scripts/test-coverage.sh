#!/usr/bin/env bash
# scripts/test-coverage.sh — local-dev coverage runner for apps/mcp-server
#
# PROBLEM: bunfig.toml [test] coverage=false suppresses coverage to prevent OOM on CI.
# bun 1.3.13: --coverage flag is silently ignored when bunfig sets coverage=false.
# SOLUTION: temporarily move bunfig.toml aside, run bun test --coverage, restore on exit.
#
# Usage (from apps/mcp-server or repo root):
#   bun run test:cov                        — full suite with coverage
#   bun run test:cov src/__tests__/foo.ts   — single file with coverage
#   bash scripts/test-coverage.sh [bun test args...]
#
# Verified: bun 1.3.13 — coverage table produced correctly (2026-06-08, architect spike).
# CANONICAL POINTER: docs/architecture-briefs/2026-06-08-ci-coverage-off-mechanism.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_DIR="$SCRIPT_DIR/../apps/mcp-server"
BUNFIG="$MCP_DIR/bunfig.toml"
BUNFIG_ASIDE="$MCP_DIR/bunfig.toml.nocov"

if [ ! -f "$BUNFIG" ]; then
  echo "[test-coverage] bunfig.toml not found at $BUNFIG — running bun test --coverage directly"
  cd "$MCP_DIR"
  exec bun test --coverage "$@"
fi

# Move bunfig aside so --coverage flag is not suppressed
mv "$BUNFIG" "$BUNFIG_ASIDE"

# Restore on exit (success, failure, or interrupt)
restore_bunfig() {
  if [ -f "$BUNFIG_ASIDE" ]; then
    mv "$BUNFIG_ASIDE" "$BUNFIG"
  fi
}
trap restore_bunfig EXIT INT TERM

cd "$MCP_DIR"
bun test --coverage "$@"
