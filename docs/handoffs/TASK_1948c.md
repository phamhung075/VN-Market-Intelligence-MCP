# TASK_1948c — `selfImproveOrchestratorJob.ts` + Scheduler Wiring

**Sprint:** 1948 Phase 1 (Shadow-Mode Orchestrator)  
**Branch:** `task/1948c-self-improve-orchestrator-job`  
**Size:** M (~4h)  
**Zone:** `apps/mcp-server/`  
**Owner:** dev-mcp-server  
**Dependency:** 1948a + 1948b (both must be merged first)  
**Blocked by:** post-1945-verdict-resolution-scored-pct gate (2026-05-20T07:22Z) + 1948a/b merge

---

## Context

This task implements the orchestrator job itself — the daily cron that wakes up, reads accuracy stats from signal_outcomes, detects degradation, generates hypotheses, logs to `improve_check_log`, and sends a WORK Telegram summary.

Phase 1 is **shadow-mode only**: no signal-bus write, no auto-dispatch, no WIP cap check. The job logs everything and sends a Telegram for human review.

This is the linchpin of the loop — it ties together the DB schema (1948a), detection logic (1948b), and scheduler orchestration.

**Architecture references:**
- `docs/spikes/SPIKE_1947-auto-improve-loop.md` § 6-7 — data flow diagram, Phase 1 scope
- `docs/architecture-briefs/2026-05-18-closed-loop-auto-improvement.md` — orchestrator job spec, wiring points, risk flags
- DDD layer: `interface/scheduler` (reads domain + infrastructure, writes signal-bus JSON in Phase 2+)
- Existing precedent: `accuracyDigestJob.ts` (same location, same cron pattern)

---

## Acceptance Criteria

| AC | Criterion |
|---|---|
| AC-1 | `apps/mcp-server/src/scheduler/audits/selfImproveOrchestratorJob.ts` created (~150L). Exports two functions: `runSelfImproveOrchestrator(deps?: SelfImproveOrchestratorDeps)` and `runSelfImproveOrchestratorCron()`. |
| AC-2 | `SelfImproveOrchestratorDeps` interface: optional `db?: Database`, optional `sendWork?: (text: string) => Promise<boolean>`. Allows injection for testing. |
| AC-3 | `SelfImproveOrchestratorResult` interface: { degradedTypes: number, coverageGaps: number, dispatched: number, shadowOnly: boolean }. Phase 1 always returns `dispatched: 0, shadowOnly: true`. |
| AC-4 | Orchestrator logic flow: (1) Query `signal_outcomes` aggregated by signal_type, compute 7d + 30d accuracy_rate per type via existing `getAccuracyStats()` from `signalOutcomeStore.ts`. (2) Call `classifyDegradation()` for each type. (3) If ≥1 degraded type detected: call `lookupHypothesis()`, store `improve_check_log` row via `insertImproveCheck()`, send WORK Telegram summary. (4) Query coverage gaps: watchlist stocks with ≥1 agent_signals but 0 resolved signal_outcomes in 30d; include in WORK message. (5) Return result object. (6) If zero degradation: log "no_degradation", exit cleanly, no WORK sent. |
| AC-5 | WORK Telegram format (Phase 1): Single message per orchestrator run. Header: "🔍 Signal Accuracy Audit (shadow-mode)". For each degraded signal_type: signal_type name, 30d_rate %, 7d_rate %, delta_pp, hypothesis.likely_cause, hypothesis.suggested_fix. Coverage gaps section: "⚠️ Coverage Gaps: N stocks with signals but no resolved outcomes in 30d" + list. Footer: "Phase 1: shadow-mode logging only. No auto-dispatch." Sent via `sendWork(text)` if provided. |
| AC-6 | Scheduler wiring: (1) Add `CRONS.selfImproveOrchestrator = Bun.env.CRON_SELF_IMPROVE_ORCHESTRATOR ?? '0 9 * * *'` to `cronConfig.ts`. (2) Wire in `startScheduler.ts` after `accuracyDigestJob` block: `cron.schedule(CRONS.selfImproveOrchestrator, async () => { await jobRunRepo.wrapRun('selfImproveOrchestratorJob', async () => { await runSelfImproveOrchestratorCron(); }); });`. (3) `runSelfImproveOrchestratorCron()` calls `runSelfImproveOrchestrator({db: systemDb, sendWork})` where `systemDb` is the existing mcp-server database handle and `sendWork` is the existing WORK channel handler. |
| AC-7 | Integration tests in `apps/mcp-server/__tests__/1948-self-improve-orchestrator.test.ts` (6+ test suites, ≥12 assertions). Tests: (1) Full run with 2 degraded signal types + coverage gaps → WORK message sent, improve_check_log has 2 rows, result.degradedTypes=2. (2) Full run with no degradation → no WORK, no rows inserted, clean exit. (3) Full run with schema absent (simulate DB not initialized) → falls back safely, logs error, does not crash. (4) Full run with all neutral signal types → no degradation triggered. (5) Full run with degraded type but coverage gap query errors → coverage gaps skipped, degradation log completes. (6) Verify shadow-mode only: dispatched=0, shadowOnly=true in result. |
| AC-8 | All tests GREEN. Zero tsc errors. No linting errors. Integration with improveCheckStore, degradationRules, accuracyDigestJob tested (no regression). |

---

## Files to Read First

1. `docs/spikes/SPIKE_1947-auto-improve-loop.md` § 6-7 — data flow, Phase 1 acceptance criteria
2. `docs/architecture-briefs/2026-05-18-closed-loop-auto-improvement.md` § orchestrator spec, risk flags R-1/R-2/R-8
3. `apps/mcp-server/src/scheduler/audits/accuracyDigestJob.ts` — existing precedent (same zone, similar cron pattern, WORK Telegram output)
4. `apps/mcp-server/src/infrastructure/stores/signalOutcomeStore.ts` — `getAccuracyStats()` function signature (called by orchestrator)
5. `apps/mcp-server/src/scheduler/startScheduler.ts` — where the cron is wired; existing `accuracyDigestJob` wiring as template
6. `apps/mcp-server/src/scheduler/cronConfig.ts` — where CRONS object is defined

---

## Files to Create

- `apps/mcp-server/src/scheduler/audits/selfImproveOrchestratorJob.ts` (~150L)
- `apps/mcp-server/__tests__/1948-self-improve-orchestrator.test.ts` (~140L)

---

## Files to Modify

| File | Change | Lines |
|---|---|---|
| `apps/mcp-server/src/scheduler/cronConfig.ts` | Add `selfImproveOrchestrator: Bun.env.CRON_SELF_IMPROVE_ORCHESTRATOR ?? '0 9 * * *',` to CRONS object. | 1L |
| `apps/mcp-server/src/scheduler/startScheduler.ts` | Import `runSelfImproveOrchestratorCron` from `./audits/selfImproveOrchestratorJob.js`. Add cron.schedule block after accuracyDigestJob. | ~8L |

---

## Key Implementation Notes

1. **Data flow (Phase 1):**
   - Query `signal_outcomes` grouped by signal_type, compute 7d + 30d accuracy_rate via `getAccuracyStats()`
   - For each signal_type: call `classifyDegradation(signalType, rate7d, rate30d, count7d, count30d)`
   - If degraded: call `lookupHypothesis(signalType)`, insert row to `improve_check_log` with `dispatch_status='shadow'`, record in result
   - Query coverage gaps: SELECT DISTINCT code FROM watchlist WHERE code NOT IN (SELECT DISTINCT stock_code FROM signal_outcomes WHERE outcome_24h IN ('correct','incorrect','neutral') AND checked_at > now() - interval 30 days) AND code IN (SELECT DISTINCT stock_code FROM agent_signals WHERE created_at > now() - interval 30 days)
   - Send WORK Telegram if ≥1 degraded type or coverage gaps detected
   - Return result with counts

2. **WORK Telegram format (shadow-mode):**
   ```
   🔍 Signal Accuracy Audit (shadow-mode)
   
   [for each degraded signal_type:]
   📊 signal_type_name
      30d accuracy: 45.0% (15/33 correct)
      7d accuracy:  30.0% (3/10 correct)
      Δ: -15.0pp regression
      Hypothesis: likely_cause_text
      Fix: suggested_fix_text

   [if coverage gaps:]
   ⚠️  Coverage Gaps (30-day): 3 stocks
      - SKA
      - FPT
      - VIC

   Phase 1: shadow-mode logging only. No auto-dispatch.
   ```

3. **Error handling:**
   - If `improve_check_log` table doesn't exist (pre-1948a migration): catch error, log to WORK channel, skip insertion, continue (graceful fallback)
   - If `getAccuracyStats()` returns empty result (no signal_outcomes yet): log "insufficient_data", no WORK, exit cleanly
   - If WORK send fails: log error, do NOT crash the job (job_run_repo will record the error)

4. **Dependency injection for testing:**
   - `runSelfImproveOrchestrator(deps)` accepts optional deps with `db` and `sendWork` overrides
   - Tests pass `:memory:` SQLite as db and a mock `sendWork` function
   - `runSelfImproveOrchestratorCron()` is the production entry point that uses the system database and real WORK handler

5. **Phase 1 constraints:**
   - `dispatch_status` ALWAYS `'shadow'`. Never `'dispatched'`. Phase 1 never writes signal-bus JSON.
   - `result.dispatched` always 0.
   - `result.shadowOnly` always true.
   - Env var `SELF_IMPROVE_AUTO_DISPATCH` is documented in `.env.example` but ignored in Phase 1 code (Phase 3 will read it).

6. **Cron time (09:00 UTC):** After `accuracyDigestJob` (07:00 UTC) and `signalOutcomeResolutionJob` (08:30 UTC, assumed), ensuring all signal_outcomes data is resolved before orchestrator runs.

---

## Sequencing & Dependencies

**Predecessor:** 1948a (schema), 1948b (domain rules) — both must be merged  
**Successor:** OBSERVE-1948d (7-day observation gate on 2026-05-25)

This is the final implementation task. Once merged, OBSERVE-1948d begins (passive observation, no code).

---

## Test Checklist

- [ ] Full orchestrator run with 2 degraded signal types produces 1 WORK Telegram
- [ ] improve_check_log receives 2 new rows (one per signal type)
- [ ] Run with zero degradation produces no WORK, no DB writes
- [ ] Run with schema absent gracefully falls back (no crash)
- [ ] Coverage gap detection works (watchlist stocks with signals but no outcomes flagged)
- [ ] Shadow-mode enforced: dispatched=0, shadowOnly=true
- [ ] Cron wiring verified in startScheduler.ts (job registered, runs at 09:00)
- [ ] WORK message format readable and informative
- [ ] All 6+ test suites GREEN
- [ ] 0 tsc errors
- [ ] No regression in existing cron jobs or alert_accuracy tests

---

## QA Handoff

When dev-mcp-server submits, QA will verify:

1. 6+ integration tests GREEN (full orchestrator runs, error cases, wiring)
2. tsc clean
3. Cron wiring correct (cronConfig.ts + startScheduler.ts match)
4. No regression in existing cronJob/alert_accuracy/signal_outcomes tests
5. WORK Telegram format is readable (smoke test against a real WORK handler)
6. SELF_IMPROVE_AUTO_DISPATCH env var documented in .env.example

**Report:** `reports/TASK_REPORT_1948c.md`

---

## Notes

- **Risk R-1 (HIGH):** Sample volume may be low in early weeks. Phase 1 handles gracefully — if sample_count < 10, `classifyDegradation()` returns null (no degradation triggered). No false alarms.
- **Risk R-2 (MEDIUM):** Two-window delta conflates seasonal vs structural issues. Mitigated by human review in Phase 1. Can be re-calibrated in Phase 3 once 4+ weeks of empirical data exists.
- **Risk R-8 (CRITICAL):** Single-writer constraint. Orchestrator runs inside mcp-server process (satisfied). No cross-service HTTP calls to improveCheckStore.
- **Phase 1 to Phase 2 transition:** Once OBSERVE-1948d gate fires (2026-05-25), Phase 2 (manual-gate dispatch) can be designed and scheduled for Sprint 1949+. No code change needed to 1948c for Phase 2 — new signal-bus integration is additive.
