#!/usr/bin/env bash
# index-check.sh — Pre-merge staged-index guard (Control 1)
# Brief: docs/architecture-briefs/2026-05-12-worktree-merge-protocol.md § Control 1
# Usage: bash scripts/audits/index-check.sh
# Exit: 0 = index clean (safe to merge), 1 = staged files found (abort merge)

set -uo pipefail

if git diff --cached --quiet; then
  exit 0
fi

echo "ABORT: staged index not empty before merge gate" >&2
echo "Staged files:" >&2
git diff --cached --name-only >&2
echo "Action: git reset HEAD to unstage, or commit staged content explicitly before retry." >&2
exit 1
