# dev-mcp-server -- Notebook

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db (write)

## Working Memory

### Task 1943a — BCTC Q1-2026 queue reset + batch sweep diagnosis + auto-retry (2026-05-18, DONE)

**Root cause / goal:** 31 bctc_vps_queue rows stuck at url_not_found for Q1-2026 (MAX_ENRICH_ATTEMPTS=5 exhausted). bctcBatchSweepJob zero runs in cron_job_runs. No auto-retry policy for parked rows.

**FIX A:** `resetQ1UrlNotFound(db)` in schema-financial-reports.ts — idempotent UPDATE (status=pending, attempts=0 WHERE url_not_found AND year=2026 AND quarter=Q1). Called from initFinancialReportsTables() after backfillAllNetProfit(). Returns change count.

**FIX B (diagnostic):** Added `console.log('[bctcBatchSweepJob] Starting...')` at entry of runBctcBatchSweepJob. Root cause documented: wrapRun key 'bctcBatchSweepJob' in startScheduler.ts is CORRECT (no mismatch). Zero-run = container likely down at 2026-04-25 09:00 UTC. Next scheduled fire: 2026-07-25 09:00 UTC. Added seasons skip log too.

**FIX C:** Extended bctcQueueEnricherJob.ts WHERE clause with Arm 2 (grace-period): `status='url_not_found' AND last_attempt IS NOT NULL AND last_attempt < datetime('now', '-7 days') AND attempts < 6`. Graceful fallback to Arm 1 only when `last_attempt` column absent (older test schemas). Also updated `updateStmt` to `SET source_url=?, status='pending'` so grace-period rows are re-queued for PDF pull.

**Tests:** 16 new tests in `BCTC-1943-queue-reset-and-retry.test.ts` — AC-1 (4 tests), AC-2 (3), AC-3 (4), AC-4 (5). All GREEN. 87 total BCTC enricher/sweep tests pass.

**Key gotcha:** makeMinimalDb() in 1782 test lacks last_attempt column → fallback logic needed in enricher query. Fixed with "no such column: last_attempt" catch → Arm 1 only fallback.

**Files changed:** schema-financial-reports.ts, bctcQueueEnricherJob.ts, bctcBatchSweepJob.ts, BCTC-1943-queue-reset-and-retry.test.ts (new), TASKS.md

Zone health: queue reset idempotent; grace-period prevents permanent blindspots; batch sweep has diagnostics | HEALTHY

---

### Task 1942a — vnstock startup backfill probe (2026-05-18, DONE → REVIEW)

**Root cause / goal:** Cold Docker restart leaves vnstock_financials empty until Monday 01:00 UTC cron. Probe fills the gap.

**Implementation:**
- `vnstockStartupProbe.ts` (NEW): injectable deps pattern (`getDb`, `runJob`, `scheduleDelay`, `log`). Guard: COUNT(DISTINCT code WHERE data_type='financials') < 10 OR last fetched_at > 7 days → fire job after 90s delay. Non-fatal: all errors caught + job fires anyway (FR-6 safe fallback).
- `startScheduler.ts`: added import for `runVnstockFundamentalsJob` + `runVnstockStartupProbe`; wired IIFE after accuracyDigest block.
- AC-7 confirmed: no `_resetRunningState` in probe. `_isFundamentalsRunning` in job handles Monday cron overlap.

**Tests (6/6 GREEN):** T1 cold DB fires job, T2 stale >7d fires job, T3 warm skips, T4 DB error caught + job fires anyway, T5 delay=90000ms, T6 missing table caught + fires.

**Key design decision:** extracted into separate module (`vnstockStartupProbe.ts`) with injectable deps rather than inline IIFE. Enables clean unit tests without module-level mocking. Pattern matches ohlcvStartupProbe.ts.

**Commits:** `b1293a56` (feat)

Zone health: startup probe pattern consistent with EFFR + ohlcv probes; DDD layers respected (probe in scheduler/financial-reports, not domain); 100% branch coverage on probe | HEALTHY

---

### Task 1941c — Daily accuracy WORK digest job (2026-05-18, DONE → REVIEW)

**Root cause / goal:** Signal outcome feedback loop (Sprint 1941). Wire a daily 07:00 UTC cron job that reads `signal_outcomes`, computes 30-day accuracy stats, and sends a top-3/bottom-3 signal type breakdown to the WORK Telegram channel.

**Implementation (DDD layers):**
- `infrastructure/db/signalOutcomeStore.ts`: added `SignalTypeAccuracy` + `SystemAccuracyDigestStats` interfaces + `getSystemAccuracyDigestStats(db, days)` — 4-query pattern (per-signal-type aggregation, system totals, new stocks count, neutral-only discriminator).
- `application/usecases/buildAccuracyDigest.ts`: pure `buildAccuracyDigestText(stats, dateStr)` function — AC-8 short digest path (all-neutral), AC-4 n/a guard (< 10 resolved), top-3 + bottom-3 sections.
- `scheduler/digest/accuracyDigestJob.ts`: `_running` module-scope guard + `alreadySentToday()` DB dedup + `runAccuracyDigest(deps?)` with AC-3 graceful skip + AC-8 short digest.
- `scheduler/cronConfig.ts`: `accuracyDigest: '0 7 * * *'` (env `CRON_ACCURACY_DIGEST`).
- `scheduler/startScheduler.ts`: cron.schedule block with `jobRunRepo.wrapRun('accuracyDigestJob', ...)`.

**Tests (7/7 GREEN):**
- TC1: empty table → exits without send (AC-3)
- TC2: all-neutral rows → sends short digest with "all outcomes neutral" (AC-8)
- TC3: ≥6 eligible types → top-3 + bottom-3 in digest (AC-5/AC-6)
- TC4: n/a when totalResolved < 10 (AC-4)
- TC5: accuracy % when totalResolved >= 10 (AC-4)
- TC6: neutralOnlyRows=5 DB integration (AC-8 discriminator)
- TC7: zero stats for empty table (AC-3 DB layer)

**FK discovery:** `signal_outcomes.signal_id` references `agent_signals(id)`. Test seed helper must insert parent `agent_signals` row first before seeding outcomes.

**Commits:** `d524ede8` (feat), `fbe3cd43` (docs)
**Type check:** 0 errors on 1941c files (pre-existing 1941d untracked test excluded from check)

Zone health: accuracyDigestJob wired; signal_outcomes + cron_job_runs + sendTelegramWork all connected; DDD layers respected | HEALTHY

---

### Task 1940a — PC1 legal_risk tool gap (2026-05-18, DONE → REVIEW)

**Fix:** `get_legal_risk_signals` queried ONLY `alerts`. Added `queryAgentSignalsTable()` in `legalRiskTools.ts` for dual-source. 7/7 tests GREEN. Commit `80873d1c`.

---

### TNB Critic Gate — Sprint A + B (2026-05-17, DONE)

Sprint A: schema + tnbCriticScorer.ts (5 checks × 0.2, threshold 0.6). Sprint B: gate wire + retry. 49/49 tests GREEN. QA c143 APPROVED.

---

### Task 1930b — cashFlow OCF/NI ratio guard (2026-05-17, DONE)

OCF_NI_RATIO_PLAUSIBILITY_LIMIT=20. FPT (504×) + VCB (1.42e8×) suppressed. 7/7 tests GREEN.
