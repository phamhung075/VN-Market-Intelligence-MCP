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

---

### STEP qa-S1 · qa · 2026-06-22T01:45:00Z
**task-id:** FIX-SCHEDULER-LOCK-NO-RELEASE-TTL
**verdict:** APPROVED-CODE-LEVEL (REBUILD_REQUIRED)
**what-considered:**
- tsc EXIT 0 (no type errors)
- Per-file isolation: 2027 8/8 green; 1221+1457 22/22 green
- Full CI: 13351 pass / 53 skip / 30 fail — 13 failing files all pre-existing disjoint from the 3 changed files (last-touch commits fff91143, 950cf014, f1f70ec3, a42d0835, 1aea2e84, 92e2c1ea — all predate db082049; none introduced by this fix)
- finally{} analysis: lockAcquired flag set ONLY after acquireSchedulerLock returns true; inner try/finally (L394–513) releases only when lockAcquired=true; throw at sendFn is re-thrown (L504) so finally{} catches it; outer try (L344) catches unhandled errors to prevent propagation — correct two-level error containment
- sweep SQL: datetime('now', ? || ' minutes') with thresholdParam=`-${cadenceMinutes*2}` — matches isSchedulerLockFresh pattern; string concat is on the parameter side not in SQL template; no interpolation in SQL string body; correct per feedback_sqlite_iso8601_datetime_strcompare_bypass
- marks not deletes: UPDATE SET released_at = datetime('now') — lock history preserved
- single consumer: grep confirms acquireSchedulerLock called only in weeklyPortfolioReportJob.ts production code; generic mandate met for current consumer count
- DDD: schedulerLockStore.ts infra layer, no domain imports; weeklyPortfolioReportJob.ts domain import (VN_OFFSET_MS) pre-existing from 1aea2e84, not introduced by db082049
- Security: no process.env, no hardcoded secrets, all SQL parameterized, mock-guard EXIT 0
- Tests genuine: real :memory: via ensureSchedulerLocksTable (production DDL function); simulate throw mid-run (throwingFn) → assert released_at non-null; insert leaked lock 3×cadence ago → sweep → released_at set; fresh lock (30min) → not swept; properly released → not reset; job-name isolation (targetJob vs untouchedJob); no-op on absent row
**why-decision:** All code-level gates pass. Verdict APPROVED-CODE-LEVEL because REBUILD_REQUIRED — live gate (kill job mid-run on named-vol DB → assert finally release; pre-existing leaked lock → assert sweep clears it) requires ops container rebuild before it can be executed.
