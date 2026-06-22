# Decision Journal — Sprint FIX-SCHEDULER-LOCK-NO-RELEASE-TTL · dev-mcp-server

**Sprint goal:** Fix scheduler_locks: release-on-death + TTL/auto-expire so leaked locks self-heal
**Agent:** dev-mcp-server
**Started:** 2026-06-22T01:00:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-22T01:30:00Z
**task-id:** FIX-SCHEDULER-LOCK-NO-RELEASE-TTL
**what-done:** Added sweepLeakedSchedulerLocks() to schedulerLockStore.ts and wrapped releaseSchedulerLock in finally{} in weeklyPortfolioReportJob.ts
**what-considered:**
- Option A: Add expires_at TTL column → ALTER TABLE risk per feedback_sqlite_add_column_unique_silent_noop; needs migration guard; no history preserved
- Option B (CHOSEN): Periodic sweep via sweepLeakedSchedulerLocks() — marks released_at=now WHERE released_at IS NULL AND acquired_at < now-2×cadence; no schema change; preserves row history
**why-decision:** Sweep approach requires zero schema migration, preserves lock history, matches existing datetime() parameterization pattern (isSchedulerLockFresh uses `? || ' minutes'`), and is safe to call idempotently on every job tick before acquire
**why-change:** no change from spec — spec explicitly offered either TTL column or sweep; sweep chosen for migration safety
