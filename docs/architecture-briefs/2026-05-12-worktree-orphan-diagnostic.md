# Worktree Orphan Diagnostic — c55 WORKTREE-ORPHAN-c55

**Status:** RESOLVED  
**Date:** 2026-05-12  
**Worktrees Cleaned:** 2  
**Cleanup Method:** unlock + force-remove + branch -D  

## Findings

### Worktree #1: `agent-a4ff5ad521bfd10e4`
- **Path:** `.claude/worktrees/agent-a4ff5ad521bfd10e4`
- **Branch:** `worktree-agent-a4ff5ad521bfd10e4`
- **Lock Status:** Locked by dead PID 67883
- **Commits Unique to Branch:** None (merged to main)
- **State:** Safe to remove
- **Cleanup:** unlock → force-remove → branch -D ✓

### Worktree #2: `agent-a66e04c8b9546ff28`
- **Path:** `.claude/worktrees/agent-a66e04c8b9546ff28`
- **Branch:** `worktree-agent-a66e04c8b9546ff28`
- **Lock Status:** Locked by dead PID 18429
- **Commits:** Pointing to 6848c848 (feat: seed 7 high-vol tickers)
- **Analysis:** Commit 6848c848 IS on main (via c53 merge at 388e6533 chore(c53/pre-merge))
  - Task 1876a-A6 already SHIPPED in c53
  - Worktree branch is a duplicate, not orphaned work
- **State:** Safe to remove (duplicate task already merged)
- **Cleanup:** unlock → force-remove → branch -D ✓

## Root Cause

**SDK isolation spawn pathology:** When agent spawned with `isolation:"worktree"` dies unexpectedly (process kill/timeout), the SDK's auto-cleanup handler fails to:
1. Unlock the worktree (lock file persists even after process death)
2. Remove the worktree directory
3. Delete the orphaned branch

The lock file references a dead PID but remains valid until explicitly unlocked. This is the 2nd manifestation (c47 had c47-worktree-merge-protocol incident driving Sprint 1895a/1895b).

## Systemic Issue

SDK cleanup is **fire-and-forget** on normal exit but **no fallback** on abnormal termination. macOS + Docker environment may be specific factor (process SIGKILL harder to intercept than Linux).

## Resolution Actions

- Cleaned both worktrees
- All branches now on main only
- git worktree list = empty (clean state)

## Escalation

**To Architect:** SDK isolation cleanup handler needs:
- Process death detection + cleanup guarantee (signalHandler or at-exit hook)
- Automated worktree gc on main-terminal startup (drain orphans before next cycle)
- Lock timeout mechanism (e.g., 24h lock expiry)
