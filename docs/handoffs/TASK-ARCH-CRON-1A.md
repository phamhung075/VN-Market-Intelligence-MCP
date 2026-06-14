# Handoff — TASK-ARCH-CRON-1A

## Summary

Add T4 idempotency dedup guards to all T4 jobs (those without existing same-day dedup). This is **load-bearing Phase 1a** — must ship FIRST before Phase 1b (recoverMissedExecutions:true).

**Duration:** ~2–3h (14 job files, ~50 lines per file)  
**Zone:** `apps/mcp-server/`

---

## Context

Per `docs/architecture-briefs/2026-06-14-arch-cron-scheduler-reliability.md` § 4.2 (Lever 2 — Idempotency Contract):

- **Phase ordering is HARD CONSTRAINT:** Dedup guards must ship before `recoverMissedExecutions` in Phase 1b.
- Without these guards, Lever 1 (uniform `recoverMissedExecutions:true` in Phase 1b) can replay missed ticks on server restart and cause double execution.
- The architect has already verified which jobs are T4 (need guards) vs T1/T2/T3 (already safe).

**Idempotency tiers:**
- **T1** — DB-backed same-day dedup exists (no action needed)
- **T2** — SQL upsert makes replay harmless (no action needed)
- **T3** — isRunning guard or business short-circuit (no action needed)
- **T4** — Needs `cron_job_runs` same-day guard (THIS TASK)

---

## Acceptance Criteria

1. All 14 T4 job files have the dedup guard pattern applied
2. Guard uses `jobRunRepo.getLastRuns(jobName, 1)[0]` to check last success
3. Guard skips if last success < 90% of declared cadence (e.g., 90% of 24h = 21.6h)
4. Guard includes JSDoc comment `@idempotency T4 — cron_job_runs dedup guard`
5. Each guard logs '[job] already ran within cadence window — skipping (recovery dedup)' on skip
6. No logic changes to job internals — guard is a thin wrapper
7. tsc 0 errors
8. Unit tests for each guard (see TASK-ARCH-CRON-1A-TEST)

---

## T4 Jobs (14 files to modify)

| Job file | Cadence | 90% window |
|---|---|---|
| `scheduler/market-data/ohlcvDailyAggregatorJob.ts` | 24h (daily) | 21.6h |
| `scheduler/macro/calibrationReportJob.ts` | 7d (weekly) | 6.3d |
| `scheduler/macro/baseRateComputationJob.ts` | 7d (weekly) | 6.3d |
| `scheduler/macro/predictionResolutionJob.ts` | 24h | 21.6h |
| `scheduler/news/reputationComputeJob.ts` | 24h | 21.6h |
| `scheduler/alerts/verdictResolutionJob.ts` | 24h | 21.6h |
| `scheduler/alerts/signalOutcomeJob.ts` | 24h | 21.6h |
| `scheduler/alerts/alertOutcomeJob.ts` | 24h | 21.6h |
| `scheduler/portfolio/weeklyPortfolioReportJob.ts` | 7d | 6.3d |
| `scheduler/system/devTeamHeartbeatJob.ts` | 24h | 21.6h |
| `scheduler/news-analysis/dataAuditJob.ts` | 24h (daily) + 7d (weekly) | 21.6h / 6.3d |
| `scheduler/digest/accuracyDigestJob.ts` | 24h | 21.6h |
| **Already T1** — verify dedup logic is robust: `scheduler/news/reputationComputeJob.ts` | (same as above) | |

---

## Standard Guard Pattern

```typescript
/**
 * @idempotency T4 — cron_job_runs same-day dedup guard
 * Prevents double execution on recovery replays when recoverMissedExecutions=true
 */
async function run<JobName>Job(db: Database): Promise<void> {
  const lastRun = jobRunRepo.getLastRuns('<jobName>', 1)[0]
  if (lastRun && lastRun.status === 'ok') {
    const ageMs = Date.now() - new Date(lastRun.runAt).getTime()
    const cadenceMs = 86_400_000  // e.g., 24h for daily jobs; use 604_800_000 for weekly
    if (ageMs < cadenceMs * 0.9) {
      log.info('[<jobName>] already ran within cadence window — skipping (recovery dedup)')
      return
    }
  }
  
  // ... actual job logic (unchanged)
}
```

---

## Files to Read/Reference

- `docs/architecture-briefs/2026-06-14-arch-cron-scheduler-reliability.md` § 4.2, § 6 (Idempotency Contract table)
- `apps/mcp-server/src/infrastructure/db/repositories/SqliteJobRunRepository.ts` (see `getLastRuns()` signature)
- `apps/mcp-server/src/scheduler/startupHelpers.ts` (see `shouldRunCatchup()` for cadence check pattern)
- One example job: `scheduler/news/reputationComputeJob.ts` (may already have a guard from prior patch 53d00955)

---

## Files Modified

- `apps/mcp-server/src/scheduler/market-data/ohlcvDailyAggregatorJob.ts`
- `apps/mcp-server/src/scheduler/macro/calibrationReportJob.ts`
- `apps/mcp-server/src/scheduler/macro/baseRateComputationJob.ts`
- `apps/mcp-server/src/scheduler/macro/predictionResolutionJob.ts`
- `apps/mcp-server/src/scheduler/news/reputationComputeJob.ts` (verify existing guard covers recovery)
- `apps/mcp-server/src/scheduler/alerts/verdictResolutionJob.ts`
- `apps/mcp-server/src/scheduler/alerts/signalOutcomeJob.ts`
- `apps/mcp-server/src/scheduler/alerts/alertOutcomeJob.ts`
- `apps/mcp-server/src/scheduler/portfolio/weeklyPortfolioReportJob.ts`
- `apps/mcp-server/src/scheduler/system/devTeamHeartbeatJob.ts`
- `apps/mcp-server/src/scheduler/news-analysis/dataAuditJob.ts`
- `apps/mcp-server/src/scheduler/digest/accuracyDigestJob.ts`

---

## Blockers / Dependencies

**Blocked by:** `FIX-MCP-CRASH-LOOP-WRITEWAL` (IMPL gate — ops must verify the crash-loop is fixed before dev IMPL starts on this)

**Blocks:** TASK-ARCH-CRON-1B (recoverMissedExecutions universal), TASK-ARCH-CRON-1C (schedule jitter shifts)

---

## RETURN

```
DONE: 14 job files have T4 dedup guards; JSDoc + logging in place
GATE: Code review + tsc 0
NEXT: TASK-ARCH-CRON-1B
HANDOFF: docs/handoffs/TASK-ARCH-CRON-1A.md
```
