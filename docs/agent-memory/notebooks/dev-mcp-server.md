# dev-mcp-server -- Notebook

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db (write)

## Working Memory

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
