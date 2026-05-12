#!/usr/bin/env bash
# tree-verify.sh — Post-merge tree-hash verification (Control 3)
# Brief: docs/architecture-briefs/2026-05-12-worktree-merge-protocol.md § Control 3
# Usage: bash scripts/audits/tree-verify.sh <expected-sha>
# Exit: 0 = trees match (merge clean), 1 = mismatch detected (pollution event)

set -uo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: tree-verify.sh <expected-sha>" >&2
  exit 1
fi

EXPECTED_SHA="$1"

ACTUAL_FILES=$(git diff-tree --no-commit-id --name-only -r HEAD | sort)
EXPECTED_FILES=$(git diff-tree --no-commit-id --name-only -r "${EXPECTED_SHA}" | sort)

if [ "${ACTUAL_FILES}" = "${EXPECTED_FILES}" ]; then
  exit 0
fi

echo "TREE MISMATCH: HEAD contains unexpected files vs cherry-pick ${EXPECTED_SHA}" >&2
diff <(echo "${EXPECTED_FILES}") <(echo "${ACTUAL_FILES}") >&2
echo "Action: run scripts/audits/recovery-snapshot.sh then inspect stash before re-applying." >&2
exit 1
