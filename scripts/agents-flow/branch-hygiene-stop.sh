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
#
# NON-BLOCKING: exit code never delays session close (NFR-1 — a Stop hook
# COULD legitimately delay session end via exit 2, but that would be new
# blocking behavior this fix never asked for; not adopted here).
#   0 = clean pass OR a real branch-hygiene WARNING was found and reported
#       (unchanged from before this fix — reporting a dirty tree/wrong branch
#       is NOT a crash).
#   1 = FR-2 discriminator (UC-CRITIC-HOOKS-ENFORCEMENT) detected that one of
#       the 3 `git` calls below itself crashed (OPPOSITE failure polarity
#       from the other 3 load-bearing hooks: here a crash used to fall
#       through as "" / true, which reads as CLEAN — silently indistinguishable
#       from "nothing wrong", before this fix).
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# FR-2 (UC-CRITIC-HOOKS-ENFORCEMENT): shared crash-vs-clean-pass discriminator.
source "$SCRIPT_DIR/lib/hook-guard.sh"
cd "$SCRIPT_DIR/../.." || exit 0

problems=()
prereq_crash=0

if branch=$(hg_run "git:rev-parse-branch" git rev-parse --abbrev-ref HEAD); then
  if [[ "$branch" != "main" ]]; then
    problems+=("HEAD is on '$branch' — must checkout main before exit")
  fi
else
  problems+=("git rev-parse --abbrev-ref HEAD itself crashed — cannot determine branch (see stderr)")
  prereq_crash=1
fi

if dirty_raw=$(hg_run "git:status-porcelain" git status --porcelain); then
  dirty=$(printf '%s\n' "$dirty_raw" | grep -vE '^\?\? \.claude/(state/|scheduled_tasks\.lock)' || true)
  if [[ -n "$dirty" ]]; then
    problems+=("Working tree has uncommitted changes:")
    while IFS= read -r line; do problems+=("    $line"); done <<<"$dirty"
  fi
else
  problems+=("git status --porcelain itself crashed — cannot determine tree cleanliness (see stderr)")
  prereq_crash=1
fi

if worktrees_raw=$(hg_run "git:worktree-list" git worktree list --porcelain); then
  worktrees=$(printf '%s\n' "$worktrees_raw" | grep -E '^worktree .*\.claude/worktrees/' || true)
  if [[ -n "$worktrees" ]]; then
    problems+=("Leftover worktrees under .claude/worktrees/ — remove with 'git worktree remove --force'")
  fi
else
  problems+=("git worktree list --porcelain itself crashed — cannot check for leftover worktrees (see stderr)")
  prereq_crash=1
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

# FR-1: exit 1 (not 0) ONLY when a prerequisite git call itself crashed —
# distinguishes "hook ran clean and reported real branch-hygiene problems"
# (still exit 0, unchanged) from "hook could not even check" (before this
# fix, silently indistinguishable from clean).
[[ "$prereq_crash" -eq 1 ]] && exit 1
exit 0
