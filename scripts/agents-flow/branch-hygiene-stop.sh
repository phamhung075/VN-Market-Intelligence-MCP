#!/usr/bin/env bash
# Branch hygiene Stop hook — runs at end of every Claude Code session.
#
# Production Bun runs `--hot` from `main`. If a session exits while the repo
# is on a feature branch (or has uncommitted task work), hot-reload picks up
# half-merged code and main is missing the work entirely. This hook enforces:
#   1. We end on `main`
#   2. Working tree is clean
#   3. No leftover task/* worktrees
#
# Behavior: emit a non-blocking warning to stderr (visible to Claude) listing
# anything that needs cleanup. Never auto-deletes — Claude must do the
# checkout/merge consciously.
set -u
cd "$(dirname "$0")/../.." || exit 0

problems=()

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
if [[ "$branch" != "main" ]]; then
  problems+=("HEAD is on '$branch' — must checkout main before exit")
fi

dirty=$(git status --porcelain 2>/dev/null | grep -vE '^\?\? \.claude/(state/|scheduled_tasks\.lock)' || true)
if [[ -n "$dirty" ]]; then
  problems+=("Working tree has uncommitted changes:")
  while IFS= read -r line; do problems+=("    $line"); done <<<"$dirty"
fi

worktrees=$(git worktree list --porcelain 2>/dev/null | grep -E '^worktree .*\.claude/worktrees/' || true)
if [[ -n "$worktrees" ]]; then
  problems+=("Leftover worktrees under .claude/worktrees/ — remove with 'git worktree remove --force'")
fi

if [[ ${#problems[@]} -gt 0 ]]; then
  {
    echo "BRANCH HYGIENE WARNING — end-of-session checks failed:"
    for p in "${problems[@]}"; do echo "  • $p"; done
    echo ""
    echo "Fix before next session: production Bun --hot reads from main."
  } >&2
  # Non-blocking: exit 0 so the session can still close. Claude sees stderr.
fi
exit 0
