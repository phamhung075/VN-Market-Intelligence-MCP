#!/bin/bash
# scripts/test-all.sh — full-suite runner.
#
# Two Bun bugs force per-file isolation:
#
#   1. napi teardown crash on 011-rag-embeddings, 012-lancedb-store, and
#      013-rag-retriever (see docs/TEST_OOM_INVESTIGATION.md). Tests pass,
#      but Bun panics during finalizer shutdown.
#
#   2. Singleton + env leakage: our DB layer (schema.ts) and a few
#      schedulers cache state in module-level `_db` / `_isRunning` singletons.
#      When Bun runs many tests in one process, test N can inherit the
#      `:memory:` DB opened by test N-1, producing "no such table: alerts"
#      false failures that disappear when each file runs alone.
#
# Mitigation: run every test file in its own Bun subprocess. Slower (~3 min
# vs ~20s) but deterministic. A teardown crash with 0 fails is treated as
# slice success so bug #1 is swallowed. Bug #2 simply cannot happen when
# each file owns its own process.
#
# Exit code: 0 iff every file reports 0 fails (teardown crashes allowed).
#
# Usage:
#   bun run test:all       # recommended
#   ./scripts/test-all.sh  # direct

set -u

cd "$(dirname "$0")/.."

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

export RUST_LOG="${RUST_LOG:-error}"

TOTAL_PASS=0
TOTAL_FAIL=0
TOTAL_FILES=0
FAILED_FILES=()
CRASHED_FILES=()

run_file() {
  local file=$1
  TOTAL_FILES=$((TOTAL_FILES + 1))

  local tmp
  tmp=$(mktemp)
  bun test "$file" > "$tmp" 2>&1
  local status=$?

  local pass fail
  pass=$(grep -E "^[[:space:]]*[0-9]+ pass$" "$tmp" | tail -1 | awk '{print $1}')
  fail=$(grep -E "^[[:space:]]*[0-9]+ fail$" "$tmp" | tail -1 | awk '{print $1}')
  pass=${pass:-0}
  fail=${fail:-0}

  TOTAL_PASS=$((TOTAL_PASS + pass))
  TOTAL_FAIL=$((TOTAL_FAIL + fail))

  local basename
  basename=$(basename "$file")

  # Case 1: Bun napi teardown crash — tests passed, process crashed after
  if grep -q "panic(main thread): A C++ exception" "$tmp"; then
    if [ "$fail" = "0" ]; then
      printf "  %-55s ${YELLOW}teardown-crash${NC} (${pass} pass / ${fail} fail — swallowed)\n" "$basename"
      CRASHED_FILES+=("$basename")
      rm "$tmp"
      return 0
    fi
  fi

  # Case 2: real failure
  if [ "$status" -ne 0 ] || [ "$fail" != "0" ]; then
    printf "  %-55s ${RED}FAIL${NC} (${pass} pass / ${fail} fail, exit=${status})\n" "$basename"
    FAILED_FILES+=("$basename")
    rm "$tmp"
    return 1
  fi

  # Case 3: clean pass
  printf "  %-55s ${GREEN}OK${NC} (${pass} pass)\n" "$basename"
  rm "$tmp"
  return 0
}

echo "=== VN Market MCP — full test suite (per-file isolation) ==="
START_TIME=$(date +%s)

for f in $(ls src/__tests__/*.test.ts | sort); do
  run_file "$f"
done

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo
echo "=== Summary ==="
echo "  files     : $TOTAL_FILES"
echo "  pass      : $TOTAL_PASS"
echo "  fail      : $TOTAL_FAIL"
echo "  crash-swallowed (napi teardown) : ${#CRASHED_FILES[@]}"
echo "  elapsed   : ${ELAPSED}s"

if [ "${#CRASHED_FILES[@]}" -gt 0 ]; then
  echo
  echo "Teardown-crashed files (tests passed, Bun panicked on exit):"
  for f in "${CRASHED_FILES[@]}"; do echo "  - $f"; done
fi

if [ "${#FAILED_FILES[@]}" -gt 0 ]; then
  echo
  echo -e "${RED}Failed files:${NC}"
  for f in "${FAILED_FILES[@]}"; do echo "  - $f"; done
  echo
  echo -e "${RED}=== FAIL ===${NC}"
  exit 1
fi

echo
echo -e "${GREEN}=== ALL GREEN ===${NC}"
exit 0
