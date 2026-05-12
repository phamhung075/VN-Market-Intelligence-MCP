#!/usr/bin/env bash
# recovery-snapshot.sh — Soft-reset rollback aid (Control 5)
# Brief: docs/architecture-briefs/2026-05-12-worktree-merge-protocol.md § Control 5
# Usage: bash scripts/audits/recovery-snapshot.sh
# MUST be called explicitly by operator — NEVER auto-executed by flow scripts
# Exit: 0 = stash created, 1 = error

set -uo pipefail

POLLUTED_SHA=$(git rev-parse --short HEAD)
TIMESTAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
STASH_LABEL="recovery-${TIMESTAMP}-polluted-${POLLUTED_SHA}"

echo "Capturing polluted commit stat to /tmp/polluted-commit-${POLLUTED_SHA}.txt"
git show HEAD --stat > "/tmp/polluted-commit-${POLLUTED_SHA}.txt"

echo "Running: git reset --soft HEAD~1"
git reset --soft HEAD~1

echo "Running: git stash push -m \"${STASH_LABEL}\""
git stash push -m "${STASH_LABEL}"

STASH_REF=$(git stash list | grep "${STASH_LABEL}" | head -1 | cut -d: -f1)

echo ""
echo "Recovery snapshot created."
echo "  Stash ref:    ${STASH_REF}"
echo "  Stash label:  ${STASH_LABEL}"
echo "  Audit file:   /tmp/polluted-commit-${POLLUTED_SHA}.txt"
echo ""
echo "Next steps (manual review required):"
echo "  1. git log --oneline -3          — verify HEAD is at pre-pollution SHA"
echo "  2. cat /tmp/polluted-commit-${POLLUTED_SHA}.txt  — review what was in the polluted commit"
echo "  3. git stash show -p ${STASH_REF}  — inspect stash content"
echo "  4. Re-apply each agent's changes individually with correct commit messages"
echo "  5. git stash drop ${STASH_REF}  — clean up after verified re-apply"
