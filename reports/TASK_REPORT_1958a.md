## Task Report 1958a
date: 2026-05-20
outcome: APPROVED
commit reviewed: 84c2b375
round: 1
zone: apps/mcp-server/

### Changed Files
- apps/mcp-server/src/scheduler/startScheduler.ts (+34 lines: catchup probes for alertDigestJob + summaryJob:daily; recoverMissedExecutions:true on alertDigestJob; import runSummaryJob)
- apps/mcp-server/src/scheduler/summaryJobs.ts (+7 lines: export runSummaryJob; recoverMissedExecutions:true on daily cron)
- apps/mcp-server/src/__tests__/1958a-alert-digest-summary-catchup.test.ts (NEW — 181 lines, 16 tests)

### Test Results
- Targeted tests (16 new): 16 pass / 0 fail [279ms]
- Full suite: 9287 pass / 284 fail
  - Baseline at 1955b (prior QA): 9271 pass / 284 fail
  - +16 new 1958a tests = 9287 expected — exact match, zero regression
  - 284 pre-existing fails: BCTC PDF extraction, doc invariants, coordination-store (79ac45e9) — unchanged
- tsc: pre-existing errors in coordinationStore.ts + coordinationTools.ts (commit 79ac45e9, NOT 1958a files). 1958a files: 0 new errors.

### Checks

| Check | Result |
|-------|--------|
| AC-1: RCA documented with event-loop trace + DB evidence | PASS |
| AC-2: Fix idempotent (shouldRunCatchup DB guard + wrapRun success row) | PASS |
| AC-3: All 5 jobs have startup catchup probes | PASS — morningBriefing/eveningSummary/franceSummary pre-existing (lines 306/320/329); alertDigest/summaryJob:daily added (lines 345/355) |
| AC-4: Zero regression — 9287 = 9271 + 16 new | PASS |
| New tests coverage: startup fires when no row / skips when row exists | PASS — AC-1a/1b/2a/2b |
| New tests coverage: weekdayOnly=true blocks weekend for alertDigest | PASS — AC-1d/1e/1f |
| New tests coverage: weekdayOnly=false allows Saturday for summaryJob:daily | PASS — AC-2d/2e |
| New tests coverage: DB error fail-safe | PASS — AC-3 |
| Order: catchup probes fire AFTER getDb() + SqliteJobRunRepository + reapZombieJobRuns | PASS — lines 103-111 precede line 302 (setTimeout block) |
| DDD scan: domain/ has zero infra imports | PASS |
| DDD scan: scheduler infra imports are correct DDD pattern | PASS |
| Security: no process.env in changed files | PASS |
| Security: no hardcoded secrets | PASS |
| summaryJob:daily dedup: recordJobRun writes success row; wrapRun re-checks on next restart | PASS |
| recoverMissedExecutions:true on alertDigestJob cron | PASS — startScheduler.ts:184 |
| recoverMissedExecutions:true on summaryJob:daily cron | PASS — summaryJobs.ts:94 |
| Import runSummaryJob from summaryJobs.js | PASS — startScheduler.ts:15 |
| Commit convention | PASS — fix(1958a/mcp-server), Task+AC trailers |

### Non-Blocking Notes
- NB-1: summaryJob:daily uses `recordJobRun` (no explicit `alreadySentToday()` call) but dedup is equivalent — `wrapRun` on the catchup probe writes a success row; next restart finds it via `shouldRunCatchup` DB query. Functionally identical to alertDigest's `alreadySentToday()` pattern.
- NB-2: tsc errors (coordinationStore.ts/coordinationTools.ts) are pre-existing from commit 79ac45e9 — not introduced by 1958a. Tracked separately.

### Merge Status
Approved. APPROVED merge to main. AC-3 live observation gate deferred to ops 2026-05-21T09:00Z.
