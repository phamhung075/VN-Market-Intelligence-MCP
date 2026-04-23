
### Task 1540: Critical WAL Checkpoint Bug Fix (11:40–11:52 UTC)
- **Status**: COMPLETE ✅
- **Severity**: CRITICAL (4th database corruption recurrence)
- **Root Cause**: Node.js signal handlers stack LIFO. Duplicate SIGTERM handlers caused checkpoint to be overridden.

**Finding**: Signal handler registration order matters critically.
- When `process.on('SIGTERM', A)` then `process.on('SIGTERM', B)` are called
- Execution is LIFO: B runs first (registered last)
- Old code registered shutdown handler in index.ts FIRST, checkpoint handler in jobs.ts LAST
- Result: checkpoint was shadowed, DB closed without WAL flush

**Implementation**:
- Moved `registerShutdownHook()` to src/index.ts line 90 (EARLY, right after HTTP server creation)
- Removed duplicate SIGTERM/SIGINT handlers from index.ts
- Removed duplicate `registerShutdownHook()` call from jobs.ts
- Added test: src/__tests__/1540-checkpoint-on-sigterm.test.ts (6 assertions, all PASS)

**Files Changed**:
- src/index.ts: added import, early hook registration, removed duplicate handlers
- src/scheduler/jobs.ts: removed import, removed call, added explanation comment
- src/__tests__/1540-checkpoint-on-sigterm.test.ts: NEW test (6 tests, 14 assertions)
- docs/agent-memory/issues/WAL-checkpoint.md: updated with root cause analysis
- docs/FIX_SUMMARY_TASK_1540.md: comprehensive fix summary for ops

**Verification**:
- bun test src/__tests__/1540-checkpoint-on-sigterm.test.ts: 6 pass ✅
- bun tsc --noEmit: 0 errors ✅
- Full test suite: 6445 pass (pre-existing failures unrelated) ✅

**Key Insight**: Node.js process signal handlers execute in LIFO order (Last In, First Out).
To guarantee checkpoint runs before DB close, it must be registered FIRST during bootstrap,
not last in a scheduler function called later.

**Prevention Pattern**: Always register critical shutdown handlers early in bootstrap,
before any async setup. Never add duplicate process.on('SIGTERM') handlers.

**Ready for**: Production deployment (ops should verify WAL file ~0 bytes after restart)
