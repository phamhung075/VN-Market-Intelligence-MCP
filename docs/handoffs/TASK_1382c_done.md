# TASK-1382c Done — signalOutcomeJob Cron Wiring

**Completed:** 2026-04-28
**By:** developer
**Commit:** 94c60def

---

## What Was Done

Registered `signalOutcomeJob` in `apps/mcp-server/src/scheduler/jobs.ts`:

1. **Import** added (line ~67):
   ```typescript
   import { runSignalOutcomeJobCron } from './alerts/signalOutcomeJob.js'
   ```

2. **CRONS entry** added after `taAlertNotifier`:
   ```typescript
   signalOutcomeJob: Bun.env.CRON_SIGNAL_OUTCOME_JOB ?? '30 8 * * 1-5',
   ```

3. **cron.schedule call** added in `startScheduler()` after `taAlertNotifier` block:
   ```typescript
   cron.schedule(CRONS.signalOutcomeJob, () => { runSignalOutcomeJobCron().catch(console.error); }, { timezone: 'UTC' })
   ```

4. **AC-9** added to `apps/mcp-server/src/__tests__/1382-signal-outcome-job.test.ts`:
   - Asserts `CRONS.signalOutcomeJob` is defined and is a string

---

## Test Results

- **9/9 tests pass** in 1382-signal-outcome-job.test.ts (AC-1 through AC-9)
- **Full suite: 7915 tests pass** (baseline was 7887; net +28 from 1382d + 1 from AC-9)
- 0 failures

---

## Acceptance Criteria Status

- AC-C1: `CRONS.signalOutcomeJob` key present and is a string — PASS
- AC-C2: `runSignalOutcomeJobCron` imported and scheduled in `startScheduler()` — PASS
- AC-C3: Env override `CRON_SIGNAL_OUTCOME_JOB` respected — PASS (Bun.env ?? fallback pattern)
- AC-C4: Full suite passes — PASS (7915 tests, 0 failures)

---

## Files Modified

- `apps/mcp-server/src/scheduler/jobs.ts` — +4 lines (import + CRONS entry + cron.schedule)
- `apps/mcp-server/src/__tests__/1382-signal-outcome-job.test.ts` — +6 lines (AC-9 test)
