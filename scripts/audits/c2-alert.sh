#!/usr/bin/env bash
# c2-alert.sh — C2 atomicity rule check (Control 4)
# Brief: docs/architecture-briefs/2026-05-12-worktree-merge-protocol.md § Control 4
# Usage: bash scripts/audits/c2-alert.sh <commit-sha>
# Exit: 0 always (detective control, non-blocking); prints WARNING to stdout on violation

set -uo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: c2-alert.sh <commit-sha>" >&2
  exit 1
fi

SHA="$1"
SUBJECT=$(git log -1 --format="%s" "${SHA}")
TYPE_AREA=$(echo "${SUBJECT}" | grep -oE '^\w+\([^)]+\)' || true)
FILES=$(git diff-tree --no-commit-id --name-only -r "${SHA}")

TYPE=$(echo "${TYPE_AREA}" | grep -oE '^\w+' || true)

HAS_CODE=$(echo "${FILES}" | grep -E '\.(ts|py|js|json|sh)$' || true)
HAS_DOCS=$(echo "${FILES}" | grep -E '\.md$' || true)

VIOLATIONS=0

# Rule 1: docs(...) commit that contains non-doc files
if [ "${TYPE}" = "docs" ] && [ -n "${HAS_CODE}" ]; then
  echo "WARNING C2 ALERT: commit ${SHA} type=docs but contains code/config files:" >&2
  echo "${HAS_CODE}" >&2
  echo "Subject: ${SUBJECT}" >&2
  VIOLATIONS=$((VIOLATIONS + 1))
fi

# Rule 2: feat/fix commit containing only .md files (lower severity)
if { [ "${TYPE}" = "feat" ] || [ "${TYPE}" = "fix" ]; } && [ -n "${HAS_DOCS}" ] && [ -z "${HAS_CODE}" ]; then
  echo "WARNING C2 WARN: commit ${SHA} type=${TYPE} but contains only .md files — may be intentional spec commit." >&2
  echo "Subject: ${SUBJECT}" >&2
  VIOLATIONS=$((VIOLATIONS + 1))
fi

# Rule 3: chore(memory/...) commit touching non-notebook paths
if echo "${TYPE_AREA}" | grep -qE '^chore\(memory/'; then
  NON_NOTEBOOK=$(echo "${FILES}" | grep -v '^docs/agent-memory/notebooks/' || true)
  if [ -n "${NON_NOTEBOOK}" ]; then
    echo "WARNING C2 ALERT: commit ${SHA} is chore(memory/...) but modifies files outside notebooks/:" >&2
    echo "${NON_NOTEBOOK}" >&2
    echo "Subject: ${SUBJECT}" >&2
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
fi

if [ "${VIOLATIONS}" -eq 0 ]; then
  echo "C2 OK: commit ${SHA} — type/scope consistent with file set."
fi

exit 0
