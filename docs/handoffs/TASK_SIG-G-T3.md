# TASK_SIG-G-T3 — Orchestrator + Cron Wiring

Sprint SELF-IMPROVE-GATE · Phase 2 lane-B proven-gate CODE · Task 3 of 6 dev tasks

**Owner:** dev-mcp-server | **Handoff from:** PM (SIG-IMPL-GATE decomposition) | **Date:** 2026-05-27

---

## Task Summary

Implement the daily `selfImproveOrchestratorJob.ts` scheduler entry and wire it into `cronConfig.ts` and `startScheduler.ts`. The job must run the full detect→hypothesis→log→WORK-Telegram pipeline in shadow mode (auto-dispatch OFF, per TASK-5).

**Files to create/modify:**
1. `apps/mcp-server/src/scheduler/audits/selfImproveOrchestratorJob.ts` — NEW file
2. `apps/mcp-server/src/scheduler/cronConfig.ts` — Modify: add `selfImproveOrchestrator` = **`2 9 * * *`** (HN-1: NOT `0 9 * * *`)
3. `apps/mcp-server/src/scheduler/startScheduler.ts` — Modify: import + register the new job

**Test file:** `apps/mcp-server/src/__tests__/1948c-self-improve-orchestrator.test.ts` — 9 acceptance criteria tests

**Dependencies:** TASK-1 (improveCheckStore) + TASK-2 (detectDegradedSignalTypes)

**Blocked by:** TASK-2 must be complete first

**Blocks:** TASK-4 (proposal-doc bridge) + TASK-5 (kill-switch) — both extend this job

---

## DDD Layer

- **Interface/Scheduler:** The orchestrator job lives in the scheduler layer
- **Imports from:** Infrastructure DB (`improveCheckStore`, `getAccuracyStats`), Domain services (`detectDegradedSignalTypes`), Infrastructure notifiers (Telegram)
- **NEVER imports from:** Another scheduler job

---

## Cron Slot (HN-1 — CRITICAL)

**HARDENING NOTE:** The blueprint's rationale cites `bctcOverdueCheck = '0 9 * * 1-5'` (weekdays). **This is FACTUALLY INCORRECT.** Live `cronConfig.ts:26` is `0 9 * * *` (DAILY, all days). The actual collision is:
- `marketOpen = '0 9 * * 1-5'` (weekdays only)
- `bctcOverdueCheck = '0 9 * * *'` (DAILY, all days)

**Decision:** Offset to `2 9 * * *` (09:02 UTC daily). This cleanly avoids BOTH collisions at zero cost. This is the CORRECT decision.

**ONE new cron slot only.** No additional slots beyond `2 9 * * *`.

```typescript
// cronConfig.ts
export const CRONS = {
  // ... existing entries ...
  selfImproveOrchestrator: Bun.env.CRON_SELF_IMPROVE_ORCHESTRATOR ?? '2 9 * * *',
};
```

---

## Job Execution Steps (SPIKE §6 Phase 1 + §7, settled)

1. **Dedup guard via `cron_job_runs`:** Use `jobRunRepo.wrapRun('selfImproveOrchestratorJob', ...)` pattern (exact same as `accuracyDigestJob.ts`). If a `success` row exists for today, skip and exit cleanly.

2. **In-memory concurrency guard:** Module-scope `let _running = false` (same pattern as `accuracyDigestJob.ts`). Prevents re-entrant execution on the same tick.

3. **Get accuracy stats:** Call `getAccuracyStats(db, {days: 7})` and `getAccuracyStats(db, {days: 30})`. Both must succeed. If either throws, log error and exit cleanly (non-fatal).

4. **Detect degradation:** Call `detectDegradedSignalTypes(stats7d, stats30d)`. Returns array of findings.

5. **Query coverage gaps:** Call `queryCoverageGaps(db)` (placement in improveCheckStore.ts per architect blueprint §3). Returns array of stocks with signals but no outcomes.

6. **No findings → exit:** If no findings and no coverage gaps, log `[selfImproveOrchestratorJob] no_degradation` and exit cleanly. **NO WORK Telegram sent** (AC-T3-3).

7. **Combine findings:** Merge degradation findings + coverage gap findings into a single list.

8. **Anti-runaway gate:** Max 2 new `shadow` rows per job run (SPIKE §9). If findings > 2, take the top 2 by severity:
   - `DEGRADED > PERSISTENTLY_LOW > COVERAGE_GAP`
   - Log the remainder as skipped.

9. **Cooldown guard:** Before inserting, check `improve_check_log` for an existing row for the same `signal_type` with `dispatch_status IN ('shadow','dispatched')` within the last 7 days. If found, skip that finding and log it (duplicate suppression).

10. **Insert rows:** For each finding (after anti-runaway + cooldown), call `insertImproveCheckSnapshot(db, {...})` with `dispatch_status='shadow'`.

11. **Send WORK Telegram:** Exactly 1 WORK Telegram listing all findings (signal_type, baseline_rate, current_rate, delta, hypothesis text). If no findings survive cooldown, send nothing (AC-T3-3).

12. **Kill-switch check (Phase 2: always false):** Read the per-path kill-switch value (via `isAutoDispatchEnabled()` from TASK-5). Since TASK-5 defaults all to `false`, nothing dispatches at ship time. The check is present in code but evaluates to false (AC-T3-9 allows deps injection for testing).

---

## Injectable Dependencies (Reference: `AccuracyDigestDeps` in accuracyDigestJob.ts)

```typescript
export interface SelfImproveOrchestratorDeps {
  db?: Database;
  sendWork?: (text: string) => Promise<boolean>;
  detectFn?: (
    stats7d: SignalAccuracyStats[],
    stats30d: SignalAccuracyStats[],
  ) => DegradationFinding[];
  coverageGapFn?: (db: Database) => CoverageGapFinding[];
  writeProposalFn?: (finding: DegradationFinding, runDate: string) => Promise<void>;
}

export async function runSelfImproveOrchestrator(
  deps?: SelfImproveOrchestratorDeps,
): Promise<void> { /* ... */ }
```

**Production wiring in startScheduler.ts:**
```typescript
const deps: SelfImproveOrchestratorDeps = {
  db: getDb(),
  sendWork: sendTelegramWork,
  detectFn: detectDegradedSignalTypes,
  coverageGapFn: queryCoverageGaps,
  writeProposalFn: writeImprovementProposal,
};
await jobRunRepo.wrapRun('selfImproveOrchestratorJob', () => runSelfImproveOrchestrator(deps));
```

---

## Coverage Gap Detection

```typescript
export interface CoverageGapFinding {
  stock_code: string;
  agent_signals_count: number;  // ≥1
  last_signal_at: string | null;
}

/**
 * Query watchlist stocks with ≥1 agent_signals row but 0 resolved signal_outcomes
 * rows in the last 30 days. Returns array of findings.
 * Placement: infrastructure/db/improveCheckStore.ts
 */
export function queryCoverageGaps(db: Database): CoverageGapFinding[];
```

---

## Acceptance Criteria

### AC-T3-1: Success with no degradation (SPIKE AC-1)

**Test:** Call `runSelfImproveOrchestrator()` with an injected DB containing 0 signal_outcomes rows. Assert `cron_job_runs` has status='success' after run.

**Evidence to paste:**
```
Test result: PASS
Empty signal_outcomes table
runSelfImproveOrchestrator() completes
cron_job_runs row: status='success'
Log message: '[selfImproveOrchestratorJob] no_degradation'
```

---

### AC-T3-2: improve_check_log rows inserted with correct rates (SPIKE AC-2)

**Test:** Inject DB with signal_outcomes for 'price_confirmation': 7d=0.40, 30d=0.55. Run orchestrator. Assert 1 row in `improve_check_log` with `window_7d_rate=0.40`, `window_30d_rate=0.55`.

**Evidence to paste:**
```
Test result: PASS
Signal: price_confirmation, 7d_rate=0.40, 30d_rate=0.55, delta=0.15
1 row inserted in improve_check_log
Row fields: signal_type='price_confirmation', window_7d_rate=0.40, window_30d_rate=0.55
dispatch_status='shadow'
```

---

### AC-T3-3: No Telegram on no-degradation (SPIKE AC-3)

**Test:** Inject `sendWork` mock. Run with empty stats. Assert mock called 0 times.

**Evidence to paste:**
```
Test result: PASS
Empty signal_outcomes
sendWork mock: called 0 times
cron_job_runs: status='success'
No Telegram sent
```

---

### AC-T3-4: Exactly 1 Telegram on findings (SPIKE AC-4)

**Test:** Inject `sendWork` mock + stats with 1 degraded type. Run. Assert mock called exactly 1 time (one message, all findings listed).

**Evidence to paste:**
```
Test result: PASS
1 degraded finding injected
sendWork mock: called 1 time
Message contains: signal_type='price_confirmation', rates, delta, hypothesis
```

---

### AC-T3-5: Fail-loud on missing table (SPIKE AC-5)

**Test:** Call orchestrator against a DB WITHOUT `initSystemTables()` called. Assert job exits without process throw (logs error, status='error' in cron_job_runs, no unhandled exception).

**Evidence to paste:**
```
Test result: PASS
DB created without initSystemTables()
runSelfImproveOrchestrator() called
cron_job_runs: status='error'
Error logged: '[selfImproveOrchestratorJob] improve_check_log table not found'
No unhandled exception thrown to process
```

---

### AC-T3-6: Coverage gap in WORK message (SPIKE AC-7)

**Test:** Inject DB with watchlist entry + `agent_signals` row but 0 `signal_outcomes` rows in 30d. Inject `sendWork` mock. Run. Assert mock called with text containing the stock_code.

**Evidence to paste:**
```
Test result: PASS
Watchlist: stock_code='FPT'
agent_signals: 1 row for FPT
signal_outcomes: 0 rows for FPT (coverage gap)
sendWork message contains: 'FPT' or 'coverage gap'
```

---

### AC-T3-7: Cooldown guard blocks duplicate

**Test:** Insert existing 'shadow' row for 'price_confirmation' with `checked_at=today`. Run orchestrator with a new finding for same signal_type. Assert NO second row inserted.

**Evidence to paste:**
```
Test result: PASS
Existing row: signal_type='price_confirmation', dispatch_status='shadow', checked_at=TODAY
New finding detected for 'price_confirmation'
After orchestrator run: improve_check_log has 1 row (not 2)
Log: '[D-IMPROVE] skip duplicate: price_confirmation'
```

---

### AC-T3-8: Anti-runaway max 2 findings

**Test (HN-2 note):** Inject `detectFn` returning 5 findings. Assert exactly 2 rows inserted. Assert order follows architect's `DEGRADED > PERSISTENTLY_LOW > COVERAGE_GAP`.

**Evidence to paste:**
```
Test result: PASS
detectFn returns 5 findings:
  - DEGRADED (price_confirmation)
  - DEGRADED (chain_catalyst)
  - PERSISTENTLY_LOW (volume_spike)
  - COVERAGE_GAP (FPT)
  - COVERAGE_GAP (VNM)
After anti-runaway: 2 rows inserted
Rows selected: DEGRADED (price) + DEGRADED (chain)
Remaining 3 logged as skipped
```

---

### AC-T3-9: Deps injection works (no real implementations in tests)

**Test:** Construct deps with mock `db`, mock `sendWork`, mock `detectFn`, mock `coverageGapFn`. Run. Assert all mocks were called (not real implementations).

**Evidence to paste:**
```
Test result: PASS
deps.db: mock Database
deps.sendWork: mock function
deps.detectFn: mock function
deps.coverageGapFn: mock function
After runSelfImproveOrchestrator(deps):
  - mock db: called ✓
  - mock sendWork: called ✓
  - mock detectFn: called ✓
  - mock coverageGapFn: called ✓
No real implementations invoked
```

---

## Hardening Notes

**HN-1 (Cron CRITICAL):** Use `2 9 * * *` (NOT `0 9 * * *`). The premise in the blueprint's text is factually wrong (it says bctcOverdueCheck is weekdays, but it's daily). The decision is correct.

**HN-2 (Anti-runaway order):** The architect's canonical order is `DEGRADED > PERSISTENTLY_LOW > COVERAGE_GAP`. When you have more than 2 findings, select top-2 using this order. AC-T3-8 test must assert this order.

---

## Implementation Notes

1. **Pattern mirror:** Copy the structure exactly from `accuracyDigestJob.ts`:
   - Module-scope `let _running = false` guard
   - `jobRunRepo.wrapRun()` in startScheduler.ts
   - Injectable `deps` object for testing
   - Error logging, non-fatal cleanup

2. **Cooldown logic:** Query `improve_check_log` for rows with:
   ```sql
   signal_type = ? 
   AND dispatch_status IN ('shadow', 'dispatched')
   AND checked_at >= datetime('now', '-7 days')
   ```
   If found, skip this finding and log it.

3. **Severity ordering:** When selecting top-2 findings, use:
   ```
   DEGRADED = 3 (highest)
   PERSISTENTLY_LOW = 2
   COVERAGE_GAP = 1 (lowest)
   ```
   Sort by severity descending, take first 2.

4. **Error handling:** Wrap each major step in try/catch. Log errors, never rethrow (except to cron_job_runs status='error'). The pipeline must be robust to stale data or missing columns.

5. **Telegram message format:** Plain text, one finding per line:
   ```
   Signal Accuracy Degradation Detected (2 findings):
   
   price_confirmation: 7d=40.0%, 30d=55.0% (delta -15pp)
   Likely cause: [from hypothesis]
   
   chain_catalyst: 7d=35.0%, 30d=50.0% (delta -15pp)
   Likely cause: [from hypothesis]
   ```

6. **No git adds/commits:** Leave all files UNSTAGED.

---

## Files Touched

| File | Change | Lines |
|---|---|---|
| `apps/mcp-server/src/scheduler/audits/selfImproveOrchestratorJob.ts` | NEW | ~250 lines |
| `apps/mcp-server/src/scheduler/cronConfig.ts` | Modify: add one line | +1 |
| `apps/mcp-server/src/scheduler/startScheduler.ts` | Modify: import + register | +3 lines |
| `apps/mcp-server/src/__tests__/1948c-self-improve-orchestrator.test.ts` | NEW | ~300 lines (9 test suites) |

---

## Submission Checklist

- [ ] `selfImproveOrchestratorJob.ts` created with full 12-step pipeline
- [ ] `cronConfig.ts` modified: `selfImproveOrchestrator = '2 9 * * *'`
- [ ] `startScheduler.ts` modified: import + `jobRunRepo.wrapRun()` registration
- [ ] Test file created with 9 ACs passing
- [ ] AC-T3-1 through AC-T3-9 all PASS in `bun test`
- [ ] Cron slot verified: `2 9 * * *` (NOT `0 9 * * *`)
- [ ] Anti-runaway order verified: `DEGRADED > PERSISTENTLY_LOW > COVERAGE_GAP`
- [ ] Cooldown guard implemented + tested
- [ ] No real Telegram sends in unit tests (mocks injected)
- [ ] No bare `except` swallows, fail-loud-first
- [ ] All files UNSTAGED (NOT staged with `git add`)
- [ ] No new branches created (all on `main`)

---

## Next Task

After this task is complete and verified PASS, the next task is **TASK-4 (SIG-G-T4)**: D-IMPROVE proposal-doc bridge. TASK-4 extends this job to write proposal docs.
