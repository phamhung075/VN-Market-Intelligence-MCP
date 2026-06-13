# Handoff — TASK-FIX-MCP-CRASH-LOOP-A-1

**Sprint:** FIX-MCP-CRASH-LOOP-WRITEWAL  
**Task ID:** A-1  
**Owner:** dev-mcp-server  
**Priority:** MEDIUM (guardrail, after BC-1 deployed)  
**Size:** S (~2h)

---

## Summary

GUARDRAIL: Detect restart cadence anomaly. When mcp-server restarts ≥2 times in a 4-hour window, send a WORK-channel alert. This guardrail is meaningful only after BC-1 is deployed (when the crash loop is broken); it fires continuously before BC-1 live.

---

## Design

**Startup sentinel:**  
At server startup (composition-root.ts), write a row to the existing `cron_job_runs` table with `job_name='mcpServerStartup'` and `status='success'`. Reuses existing infrastructure — no new table needed.

**Restart-cadence alert cron:**  
Add a new 30-min cron job (staggered from the WAL checkpoint cron) that queries `cron_job_runs WHERE job_name='mcpServerStartup' AND started_at >= NOW() - INTERVAL '4 hours'`. If count ≥ 2, send a WORK-channel Telegram alert with the restart count and timestamps.

---

## Files to Modify

### `apps/mcp-server/src/composition-root.ts`

**Change:** After `initDatabase()`, write startup sentinel.

**Location:** Line ~30 (after database init, before cron start).

**Implementation:**
```typescript
// After initDatabase():
await jobRunRepo.createRun({
  job_name: 'mcpServerStartup',
  status: 'success',
  started_at: new Date(),
  ended_at: new Date(),
  error_message: null,
});
```

**Reuse:** Use existing `jobRunRepo` pattern (do NOT duplicate with raw SQL).

---

### `apps/mcp-server/src/scheduler/cronConfig.ts`

**Add:** New cron expression for restart-cadence alert.

**Implementation:**
```typescript
export const CRONS = {
  // ... existing crons ...
  restartCadenceAlert: Bun.env.CRON_RESTART_CADENCE_ALERT ?? '15,45 * * * *',
  // (fires at :15 and :45 of every hour, staggered 15 min from WAL checkpoint at :00 and :30)
};
```

---

### `apps/mcp-server/src/scheduler/startScheduler.ts`

**Change:** Register the new restart-cadence alert cron job.

**Location:** In the cron registration loop (lines ~??).

**Implementation:**
```typescript
registerCron(CRONS.restartCadenceAlert, async () => {
  await runRestartCadenceAlertJob(deps);
});
```

**Reuse:** Follow existing `jobRunRepo.wrapRun` pattern for error handling and logging.

---

## Files to Create

### `apps/mcp-server/src/scheduler/system/restartCadenceAlertJob.ts`

**Export:** `runRestartCadenceAlertJob(deps?: { db?: Database; sendFn?: TelegramSender })`

**Implementation:**
1. Query `cron_job_runs WHERE job_name='mcpServerStartup' AND started_at >= NOW() - INTERVAL '4 hours'`
2. Count rows
3. If count ≥ 2:
   - Extract timestamps of the 2+ rows (for context in alert)
   - Compose alert message: "mcp-server restarted {count} times in last 4h: {timestamps}"
   - Send WORK-channel Telegram alert (use existing `sendTelegram(CHANNELS.WORK, message)` pattern)
4. If count < 2, silent (no log, no alert)
5. Return `{ restartCount, alertSent }`

**Error handling:** Non-fatal. Query error or send error is logged but does not propagate.

**Reuse:** Injectable `db` and `sendFn` for testing (mock query, mock send).

---

### `apps/mcp-server/src/__tests__/FIX-MCP-CRASH-LOOP-A-restart-cadence.test.ts`

**Test suite:** 4 unit tests.

1. **Test: no alert when count=1**
   - Mock db to return 1 startup row in 4h window
   - Call `runRestartCadenceAlertJob()`
   - Assert sendFn NOT called
   - Assert alertSent=false

2. **Test: alert fires when count=2**
   - Mock db to return 2 startup rows in 4h window
   - Call `runRestartCadenceAlertJob()`
   - Assert sendFn called once
   - Assert alert message contains "2 times"
   - Assert alertSent=true

3. **Test: alert fires when count=3**
   - Mock db to return 3 startup rows in 4h window
   - Call `runRestartCadenceAlertJob()`
   - Assert sendFn called once
   - Assert alert message contains "3 times"
   - Assert alertSent=true

4. **Test: alert is silent when all starts are outside 4h window**
   - Mock db to return 5 startup rows, all >4h old
   - Call `runRestartCadenceAlertJob()`
   - Assert sendFn NOT called
   - Assert alertSent=false

---

## Acceptance Criteria

| AC | Gate |
|---|---|
| Unit: alert fires when 2+ startup sentinel rows exist in last 4 h | `bun test FIX-MCP-CRASH-LOOP-A-restart-cadence.test.ts` (tests 2, 3) pass |
| Unit: alert silent when only 1 startup row in window | `bun test FIX-MCP-CRASH-LOOP-A-restart-cadence.test.ts` (test 1) passes |
| Live: after ops force-recreate (1 restart), no false alert fires | Ops verifies: no WORK-channel alert during 4h observation post-rebuild |
| tsc 0 errors | `bun run tsc --noEmit` pre-commit hook passes |

---

## Live-Verify Recipe

After ops deploys (force-recreate):

```bash
# Monitor WORK channel for 4 hours
# Expected: NO restart-cadence alert (count=1, silent)

# If a second restart occurs, alert should fire immediately on next cron tick
# Expected: WORK alert "mcp-server restarted 2 times in last 4h: ..."

# Check log output
docker logs vn-market-intelligence-mcp-mcp-server-1 --since 4h | grep "restartCadenceAlertJob"
# Expected: silent (no matches) if count<2 in window
```

---

## Reuse & Constraints

- **Reuse:** Existing `cron_job_runs` table (no migration).
- **Reuse:** Existing `jobRunRepo` pattern for sentinel write.
- **Reuse:** Existing `sendTelegram(CHANNELS.WORK, ...)` pattern.
- **Constraint:** Injectable deps (db, sendFn) for testing.
- **Constraint:** Alert sent to WORK channel (not BUG), matching existing WAL alert pattern.
- **Constraint:** No new MCP tools, no new domain services.

---

## Sequence & Dependencies

- **Blocks:** none.
- **Depends on:** BC-1 must be merged and deployed first (alert is only meaningful after root fix is live).
- **Can run parallel with:** D-1 (no shared files except startScheduler.ts, which has separate cron registration blocks).

---

## Dev Notes

- Alert fires at :15 and :45 of every hour (configurable via env var `CRON_RESTART_CADENCE_ALERT`).
- Staggered 15 min from WAL checkpoint cron (:00 and :30) to avoid simultaneous cron load.
- Sentinel row includes `started_at` timestamp for context in alert message.
- Query uses ISO 8601 `NOW() - INTERVAL '4 hours'` for consistency with other time windows.

---

## Brief Reference

Full design: `docs/architecture-briefs/2026-06-14-fix-mcp-crash-loop-writewal.md` (§ 3, Fix-Class A).
