# TASK-1382c — Developer Handoff: signalOutcomeJob Cron Entry + Integration Test

**Sprint class:** SPRINT-S
**Created:** 2026-04-28
**By:** pm
**Depends on:** 1382a (job must exist before registering cron), 1382b (WHERE clause reads 'fired' rows)

---

## Objective

Register `signalOutcomeJob` in `jobs.ts` and verify the CRON key is present via integration test (AC-9 pattern). This is the final wiring step after 1382a and 1382b are merged.

---

## Files to Modify

### 1. `apps/mcp-server/src/scheduler/jobs.ts`

Net lines added: ~4

**Import** (add near other alert job imports, ~line 65):
```typescript
import { runSignalOutcomeJobCron } from './alerts/signalOutcomeJob.js'
```

**CRONS object entry** (add after taAlertNotifier entry, ~line 153):
```typescript
/** signalOutcomeJob — resolve agent_signals outcomes daily at 08:30 UTC (task 1382) */
signalOutcomeJob: Bun.env.CRON_SIGNAL_OUTCOME_JOB ?? '30 8 * * 1-5',
```

**registerJobs() body** (pattern identical to cascadeBacktest):
```typescript
cron.schedule(CRONS.signalOutcomeJob, () => { runSignalOutcomeJobCron().catch(console.error); })
```

### 2. `apps/mcp-server/src/__tests__/1382-signal-outcome-job.test.ts`

Add AC-9 to the existing test file created in 1382a:

```typescript
it("AC-9: CRONS.signalOutcomeJob key present in jobs.ts", async () => {
  const { CRONS } = await import('../scheduler/jobs.js');
  expect(CRONS.signalOutcomeJob).toBeDefined();
  expect(typeof CRONS.signalOutcomeJob).toBe('string');
});
```

---

## DDD Compliance

- `jobs.ts` is scheduler/interface layer — correct place for cron registration
- No domain or application layer imports added here

---

## Acceptance Criteria

- AC-C1: `CRONS.signalOutcomeJob` key is present and is a string
- AC-C2: `runSignalOutcomeJobCron` is imported and scheduled in `registerJobs()`
- AC-C3: Env override `CRON_SIGNAL_OUTCOME_JOB` is respected (falls back to `'30 8 * * 1-5'`)
- AC-C4: Full `bun test` suite passes with no new failures (baseline 7865+)

---

## Commit Format

```
task(1382c): register signalOutcomeJob cron in jobs.ts + AC-9 integration test

- CRONS.signalOutcomeJob = '30 8 * * 1-5' (env override: CRON_SIGNAL_OUTCOME_JOB)
- wired into registerJobs() via cron.schedule()
- AC-9: test asserts CRONS key present (pattern from 1314)
```
