#!/usr/bin/env bash
# repro-ci-red-b7b84d9b.sh — reproduce CI-RED-b7b84d9b-FIX isolation failure
#
# Root cause: performance smoke test in 160-stock-aliases.test.ts had a 5ms
# threshold that flaked under CPU contention from P=16 parallel bun processes
# on the GitHub Actions ubuntu-latest runner. The function takes ~0.03ms
# locally but the cold-JIT first-call + scheduler preemption could push wall
# time past 5ms on a loaded 2-core CI runner.
#
# Fix: threshold raised from 5ms to 500ms (still >16,000x the actual cost —
# guards against O(n²) regressions or accidental I/O).
#
# Usage (from repo root):
#   bash scripts/repro-ci-red-b7b84d9b.sh
#   # Or reproduce CI parallelism pressure:
#   bash scripts/repro-ci-red-b7b84d9b.sh --parallel

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT/apps/mcp-server"

echo "=== Repro: 160-stock-aliases.test.ts per-file isolation ==="

if [ "${1:-}" = "--parallel" ]; then
  echo "--- P=16 parallel simulation ---"
  bash "../../scripts/ci-per-file-isolation.sh" 16
else
  echo "--- Single-file isolation (CI equivalent) ---"
  STOCK_PRICE_DB_PATH="/tmp/repro_test_stock_price.db" \
    bun test src/__tests__/160-stock-aliases.test.ts
  rm -f /tmp/repro_test_stock_price.db
fi

echo "=== PASS ==="
