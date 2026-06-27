# Decision Journal — CLEAN-STALE-BRANCH-CI-RED-FIX-BUNTEST (dev-team router)

**task-id:** CLEAN-STALE-BRANCH-CI-RED-FIX-BUNTEST
**date:** 2026-06-27T21:12Z tick
**actor:** dev-team router
**outcome:** DEFERRED (blocked by dirty active-scratchpad worktree — NOT forced)

## What happened
Dispatched qa (afaaff92f983ec1af) to remove the stale merged branch `ci-red-fix-buntest`.
qa correctly **ABORTED** rather than force-discarding real uncommitted work.

## RAW-verify (router, on-disk — not relayed)
- `git log main..ci-red-fix-buntest --oneline` → EMPTY → branch fully merged (eac0cc65 / 436f7376 / 6bcbe2e5 all in main); deletion-safe in principle.
- `git branch --list ci-red-fix-buntest` → `+ ci-red-fix-buntest` (checked out in a worktree).
- `git worktree list` → worktree at `/private/tmp/claude-501/<session>/scratchpad/ci-red-fix` @ `6bcbe2e5`.
- Worktree `git status --porcelain` non-empty: ` M bun.lock`, ` M docs/agent-memory/modules/tool-usage-stats.json`, ` D apps/mcp-server/data`, plus 3 `??` session files (2026-06-27 developer/ops/qa).
- qa journal `756ebb5b` = 1-file clean explicit-path commit (DJ-GATE-1 satisfied).

## Decision + rationale
DEFER, do not force. The worktree is **this session's own active scratchpad** holding genuine uncommitted edits; `git worktree remove --force` would silently destroy them. Router does not force-discard work it did not create ("surface, don't force"). Released `task:CLEAN-STALE-BRANCH-CI-RED-FIX-BUNTEST`. Not a board WIP slot → no lane flip.

## Retry contract (future tick)
Once the worktree owner concludes (or its dirty edits are explicitly committed/discarded by their owner): `git worktree remove <path>` then `git branch -D ci-red-fix-buntest`. Do NOT retry while the worktree status is dirty.

Claude-Session: https://claude.ai/code/session_01UuGZRKMFUAZR2E417u9aKd
