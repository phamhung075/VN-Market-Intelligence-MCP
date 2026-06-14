<!-- size-justification: 290L — systemic scheduler redesign: full job inventory (50+ jobs), watchdog spec, migration path, brownfield risk table, idempotency contract, DDD layer assignments. Each section is load-bearing for PM task breakdown. -->
# Architecture Brief — ARCH-CRON-SCHEDULER-RELIABILITY

**Date:** 2026-06-14
**Author:** architect
**Priority:** P1
**Status:** FINAL — hand-off to pm
**Recurrence count:** 4th touch — per recurring-bug-escalation policy, systemic root-cause fix required
**IMPL GATE:** dev IMPL is blocked behind FIX-MCP-CRASH-LOOP-WRITEWAL landing. A crash-looping server is itself a tick-drop source. Design proceeds independently; implementation does not.

---

## 1. Problem Statement

node-cron v3.0.3 silently drops scheduled ticks under Node.js event-loop saturation when `recoverMissedExecutions=false`. The root mechanic: the node-cron internal `setTimeout` drift tracker misses the scheduled fire-time when the JS event loop is busy (long-running cron callback occupying the thread). With `recoverMissedExecutions=false` (the default), the missed tick is permanently discarded.

**Three compounding failure modes confirmed:**

| Mode | Description | Jobs confirmed dead |
|---|---|---|
| **M1 — Silent tick drop** | Event loop busy at exact fire time + `recoverMissedExecutions=false` = tick silently discarded | `vnstockFundamentalsRefresh` (dead since 2026-06-08), `ohlcvDailyAggregatorJob` (missed 2026-06-13), `reputationComputeJob` (missed 2026-06-12 08:30) |
| **M2 — Concurrent-minute collision** | Multiple jobs on the same minute cause event-loop saturation burst exactly when peers need to fire | `foreignFlowFetch` (every 1 min) + `vnIndexRefresh` (every 5 min) + `deepFetchVps/Main` (every 5 min) all cluster at minute boundaries |
| **M3 — Per-job patch without systemic fix** | Commit 53d00955 added `recoverMissedExecutions: true` to `evidenceAccumulatorJob` and `reputationComputeJob` only. Recurred for `reputationComputeJob` on 2026-06-12. Per-job patching has failed twice. |  |

**Confirmed-dead jobs (silent auto-fire failure, pre-dating the 2026-06-13 crash-loop):**
- `vnstockFundamentalsRefresh` — last auto-run 2026-06-08; banner-bridge bug fixed in c35db4fc but auto-fire never restored
- `ohlcvDailyAggregatorJob` — last run 2026-06-12; missed 2026-06-13 weekday; 16-sector N/A rotation
- `reputationComputeJob` — missed 2026-06-12 08:30 despite 53d00955 patch

---

## 2. Brownfield Findings

### 2.1 Zone

`apps/mcp-server/` — single zone. All scheduler code lives here. No cross-service scheduler changes needed.

### 2.2 Verified Paths

| Path | Role |
|---|---|
| `apps/mcp-server/src/scheduler/cronConfig.ts` | CRONS map — 55 schedule keys, all Bun.env-overridable |
| `apps/mcp-server/src/scheduler/startScheduler.ts` | `startScheduler()` — 1072-line master registration (50+ `cron.schedule()` calls) |
| `apps/mcp-server/src/scheduler/jobs.ts` | Barrel re-export |
| `apps/mcp-server/src/infrastructure/db/cronJobRunStore.ts` | `recordJobRun()`, `insertCronJobRunStart()`, `updateCronJobRunEnd()`, `reapZombieJobRuns()` |
| `apps/mcp-server/src/infrastructure/db/repositories/SqliteJobRunRepository.ts` | `wrapRun()` — the standard wrapper used by 40+ jobs; delegates to `recordJobRun()` |
| `apps/mcp-server/src/scheduler/startupHelpers.ts` | `shouldRunCatchup()` — startup miss-detection for briefing/summary jobs |
| `apps/mcp-server/src/scheduler/news/reputationComputeJob.ts` | Most recent victim — `recoverMissedExecutions: true` added in 53d00955 but recurred |
| `apps/mcp-server/src/scheduler/market-data/ohlcvDailyAggregatorJob.ts` | Dead 2026-06-13 — currently no `recoverMissedExecutions` |
| `apps/mcp-server/src/scheduler/financial-reports/vnstockFundamentalsJob.ts` | Dead 2026-06-08 — currently no `recoverMissedExecutions` |

### 2.3 Current Scheduler Library State

```
node-cron v3.0.3 (package.json)
  recoverMissedExecutions: true — applied to: alertDigestJob, evidenceAccumulatorJob, reputationComputeJob
  recoverMissedExecutions: false (default) — applied to: all other 47+ jobs
  Concurrent schedulers at same-minute: minute=0 has 9+ jobs; minute=30 has 6+ jobs
```

### 2.4 Full Job Inventory

**55 CRONS keys registered.** Jobs grouped by saturation risk:

| Risk | Jobs (same-minute collisions) |
|---|---|
| HIGH — every-minute | `foreignFlowFetch` (`*/1 * * * *`) |
| HIGH — every-5-min | `vpsServiceHealth`, `vnIndexRefresh` (market hours), `deepFetchVps`, `deepFetchMain` |
| HIGH — every-15-min | `intelligenceCycle`, `bctcQueueEnricher`, `taAlertScan/bbAlertScan/taAlertNotifier` (7 jobs) |
| HIGH — minute=0 | `cronHealthAlert`, `weatherCheck`, `imfIndicatorPoller` + hourly pattern |
| HIGH — minute=30 | `pipelineWatchdog`, `bctcPdfPull`, `predictionMarketPoll`, `walCheckpoint`, `franceSummary` |
| MEDIUM — daily | All 20+ daily jobs scattered across specific UTC hours |
| LOW — weekly/monthly | `summaryWeekly`, `bondMaturityPoller`, `integrityCheck`, `bctcBatchSweep`, etc. |

**Jobs currently WITHOUT `recoverMissedExecutions: true` that are at risk:**

`ohlcvDailyAggregatorJob`, `vnstockFundamentalsRefresh`, `vnstockTradingStatsRefresh`, `baseRateComputation`, `predictionResolution`, `calibrationReport`, `foreignFlowAlert`, `insiderCheck`, `morningBriefingJob`, `eveningSummaryJob`, `franceSummaryJob`, `summaryDaily`, `marketOpen`, `marketClose`, `sscCheck`, `patternWatch`, `predictionOutcome`, `davPharmacyCheck`, `bctcOverdueCheck`, `bctcReparseJob`, `weeklyPortfolioReport`, `devTeamHeartbeat`, `predictionMarketPoll`, `cascadeBacktest`, `macroIndicatorRefresh`, `commodityTrackerRefresh`, `sbvRatesRefresh`, `marketEarningYield`, `signalOutcomeJob`, `alertOutcomeJob`, `verdictResolutionJob`, `signalOutcomeResolution`, `accuracyDigest`, `monthlySignalQualityAudit`, `taOhlcvBackfill`, `bctcBatchSweep`, `bondMaturityPoller`, `publicContractsRefresh`, `brokerSanctionsSweep`, `integrityCheck`, `dailyDashboard`, `dataAuditDaily`, `dataAuditWeekly`, `tasksMdJanitor`, `selfImproveOrchestrator`, `bctcEvalRecompute`, `agmPlanRefresh`, `boardDetailsRefresh`, `diskUsageAlert`, `newsHeadlinesRefresh`, `trackSessionToolUsage`, `ohlcvStalenessCheck`, `ohlcvSanityCheck`

---

## 3. Design Decision — Library Evaluation

### 3.1 Options Evaluated

**Option A — Upgrade to node-cron v4.x**

node-cron v4 (2024, semver-major) is in active development. It improves TypeScript typings and fixes some tick-drift behavior. However: (a) no published guarantee that `recoverMissedExecutions` behavior under event-loop saturation is fundamentally re-engineered in v4; (b) brownfield risk: `cron.schedule()` API changed (returns `ScheduledTask` object with different lifecycle methods); (c) 55 call sites in `startScheduler.ts` would need review/touch; (d) potential Bun runtime compatibility risk (node-cron v4 targets Node.js — Bun compatibility not benchmarked).

**VERDICT: REJECTED.** The API surface change creates brownfield risk across 55 call sites with no guarantee the core tick-drop bug is fixed.

**Option B — Replace with `croner` library**

`croner` (npm `croner`) is a well-maintained alternative with explicit missed-execution recovery, true cron expression compatibility, and proven Bun support. API: `Cron("* * * * *", { catch: true, protect: true }, fn)`. `protect: true` prevents overlapping executions. `catch: true` prevents uncaught errors from killing the scheduler.

**VERDICT: VIABLE but high brownfield risk.** 55 call sites, different option keys, different error handling. Migration effort is high for a production system. Reject for this sprint.

**Option C — Keep node-cron v3.0.3, apply uniform `recoverMissedExecutions: true` + idempotency guards + jitter + watchdog**

This is the minimal-brownfield path. node-cron v3's `recoverMissedExecutions: true` is the existing mechanism that already works for `evidenceAccumulatorJob` and `alertDigestJob`. The systemic failure is that it was applied per-job in isolation, without (a) universal coverage, (b) idempotency guards on all covered jobs, or (c) a watchdog to catch anything that still slips through.

**VERDICT: SELECTED.** Zero new library surface. All 55 call sites already follow `jobRunRepo.wrapRun()` pattern. `recoverMissedExecutions: true` can be applied uniformly. Idempotency guards via `cron_job_runs` already exist. Jitter is additive to cronConfig schedule strings (env-overridable). Watchdog is a new job that reads `cron_job_runs.last_run` — fully within existing infrastructure.

### 3.2 Selected Design: Four-Lever System

```
Lever 1 — recoverMissedExecutions: true, uniformly applied to all jobs
Lever 2 — Per-tick idempotency dedup guard (same-day / same-cadence key in cron_job_runs)
Lever 3 — Deterministic per-job jitter (stagger concurrent-minute jobs)
Lever 4 — Missed-fire watchdog: detect last_run age > 2× declared cadence → WORK alert + self-heal trigger
```

---

## 4. Detailed Design

### 4.1 Lever 1 — Uniform `recoverMissedExecutions: true`

**Change:** Add `recoverMissedExecutions: true` to every `cron.schedule()` call in `startScheduler.ts` that does not already have it.

**File:** `apps/mcp-server/src/scheduler/startScheduler.ts`

**Pattern:** Every registration block becomes:
```typescript
cron.schedule(CRONS.<key>, async () => {
  await jobRunRepo.wrapRun('<jobName>', async () => { ... })
}, { timezone: 'UTC', recoverMissedExecutions: true })
```

**Exceptions (do NOT add `recoverMissedExecutions: true`):**
- `foreignFlowFetch` (`*/1 * * * *`) — fires every 60s by design; recovery would double-fetch within seconds. Instead apply Lever 3 (jitter) to reduce collision risk. Guard: the underlying `runForeignFlowFetcherJobCron()` is already a no-op if data is fresh.
- `walCheckpoint` (`*/30 * * * *`) — TRUNCATE is idempotent; no harm in `recoverMissedExecutions: true` here, but the WAL brief already handles this separately. ADD it for consistency.
- `vpsServiceHealth` (`*/5 * * * *`), `vnIndexRefresh`, `deepFetchVps/Main` — ADD it. Each underlying job has a no-op/short-circuit for already-fresh data.

**Risk:** `recoverMissedExecutions: true` replays missed ticks on server restart. For jobs without idempotency guards this could cause double execution. Lever 2 closes this gap.

### 4.2 Lever 2 — Idempotency Contract per Job

The existing `jobRunRepo.wrapRun()` writes a `cron_job_runs` row. Jobs that carry a business-level dedup guard (same-day check) are safe for `recoverMissedExecutions: true` already. Jobs that do NOT have a same-day guard need one added.

**Idempotency tiers:**

| Tier | Description | Jobs | Required action |
|---|---|---|---|
| **T1 — Already idempotent** | DB-backed same-day dedup exists inside job | `alertDigestJob`, `evidenceAccumulatorJob`, `franceSummaryJob`, `morningBriefingJob`, `eveningSummaryJob`, `accuracyDigestJob`, `summaryDaily` | None — already safe |
| **T2 — Idempotent by SQL upsert** | Writes use `INSERT OR REPLACE` / `ON CONFLICT DO UPDATE`; a replay writes the same row again harmlessly | `ohlcvDailyAggregatorJob`, `vnstockTradingStatsRefresh`, `commodityTrackerRefresh`, `sbvRatesRefresh`, `macroIndicatorRefresh`, `taOhlcvBackfill`, `ohlcvStalenessCheck`, `ohlcvSanityCheck`, `insiderCheck`, `foreignFlowAlert`, `agmPlanRefresh`, `boardDetailsRefresh`, `marketEarningYield`, `bctcEvalRecompute` | None — SQL semantics are safe |
| **T3 — Idempotent by business short-circuit** | Job function has `isRunning` guard or explicit cadence check | `vnstockFundamentalsRefresh` (has `_isFundamentalsRunning` guard), `bctcBatchSweep` (has `isEarningsSeason()` guard), `brokerSanctionsSweep` (has quarter guard), `selfImproveOrchestrator` (shadow-mode) | None — short-circuit prevents double-work |
| **T4 — Needs `cron_job_runs` same-day guard** | No dedup exists; a replay could double-send Telegram or double-compute | `calibrationReportJob`, `baseRateComputation`, `predictionResolution`, `weeklyPortfolioReport`, `devTeamHeartbeat`, `predictionOutcome`, `patternWatch`, `dataAuditDaily`, `dataAuditWeekly`, `bctcOverdueCheck`, `bctcReparseJob`, `davPharmacyCheck`, `sscCheck`, `marketOpen`, `marketClose`, `cascadeBacktest`, `bondMaturityPoller`, `verdictResolutionJob`, `signalOutcomeJob`, `alertOutcomeJob`, `signalOutcomeResolution`, `tasksMdJanitor`, `diskUsageAlert`, `dailyDashboard`, `newsHeadlinesRefresh`, `reputationComputeJob` | Add `shouldRunCatchup()`-style guard OR use `jobRunRepo.getLastRuns()` to check if already ran in current cadence window |

**Standard dedup guard pattern (dev MUST follow):**
```typescript
// At top of job runner function:
async function runJob(db: Database): Promise<void> {
  const lastRun = jobRunRepo.getLastRuns('jobName', 1)[0]
  if (lastRun && lastRun.status === 'ok') {
    const ageMs = Date.now() - new Date(lastRun.runAt).getTime()
    const cadenceMs = CADENCE_MS  // e.g. 86_400_000 for daily
    if (ageMs < cadenceMs * 0.9) {  // 90% of cadence = safe skip window
      log('[job] already ran within cadence window — skipping (recovery dedup)')
      return
    }
  }
  // ... actual job logic
}
```

The `getLastRuns()` method already exists on `SqliteJobRunRepository`. No new infra needed.

### 4.3 Lever 3 — Deterministic Per-Job Jitter

**Problem:** Multiple jobs sharing the same minute (`*/15 * * * *`, `*/30 * * * *`, `0 * * * *`) create event-loop bursts exactly when node-cron needs to fire missed-tick callbacks. 

**Design:** Shift selected high-collision jobs by a fixed offset. The offsets must be:
- Deterministic (not random — random jitter creates schedule drift that breaks the watchdog cadence calculation)
- Env-overridable (all CRONS entries already use `Bun.env.CRON_*` — no change needed to the pattern)
- Not conflicting with existing collision-avoidance rules (the minute=7/17/47 cluster already exists for this reason)

**Proposed shifts for confirmed-dead and high-risk jobs:**

| Job | Current schedule | Proposed schedule | Rationale |
|---|---|---|---|
| `ohlcvDailyAggregatorJob` | `0 15 * * 1-5` | `3 15 * * 1-5` | +3min offset from top-of-hour pile-up |
| `vnstockFundamentalsRefresh` | `0 1 * * 1` | `5 1 * * 1` | +5min, well clear of hour boundary |
| `reputationComputeJob` | `30 8 * * *` | `33 8 * * *` | +3min, clear of `signalOutcomeJob` at `30 8 * * 1-5` |
| `baseRateComputation` | `0 19 * * 0` | `7 19 * * 0` | +7min, joins minute=7 cluster (already intentional for verdictResolution) |
| `predictionResolution` | `30 16 * * *` | `35 16 * * *` | +5min, clear of `ohlcvDailyAggregator` at new `3 15` |
| `calibrationReport` | `0 13 * * 0` | `4 13 * * 0` | +4min, clear of hour pile-up |
| `cascadeBacktest` | `30 20 * * *` | `37 20 * * *` | +7min, clear of `agmPlanRefresh` at `30 20` |
| `dailyDashboard` | `30 23 * * *` | `38 23 * * *` | +8min, clear of `summaryDaily` at `30 22` |

**Note:** Env override keys already exist for all these. Default value changes in `cronConfig.ts` are the only code change needed. The `CRON_*` env override can restore the old schedule in any environment that needs the old timing.

### 4.4 Lever 4 — Missed-Fire Watchdog

**This is the systemic safety net.** Even with Levers 1–3, a scheduler bug or extreme event-loop stall could still drop a tick. The watchdog detects it within 2 cadence cycles and either self-heals or sends a WORK alert.

**Design:**

**New job:** `apps/mcp-server/src/scheduler/system/schedulerWatchdogJob.ts`

**Schedule:** `*/10 * * * *` (every 10 min) — faster than any monitored job's cadence

**Logic:**
```
1. Read WATCHDOG_MANIFEST (static map of jobName → declared cadence in ms → alert threshold multiplier)
2. For each monitored job:
   a. Query: SELECT MAX(started_at) FROM cron_job_runs WHERE job_name = ? AND status IN ('success', 'error')
   b. If no row found: fire WORK alert "[watchdog] <jobName> has never run — scheduler registration may be missing"
   c. If last_run age > declared_cadence × THRESHOLD_MULTIPLIER:
      - action = MANIFEST[jobName].action  (either "alert-only" or "self-heal")
      - If "alert-only": send_telegram(channel="work", "[watchdog] <jobName> last ran <age>h ago (expected every <cadence>h). Stale since <last_run>.")
      - If "self-heal": call the job's runner function directly + send_telegram(channel="work", "[watchdog] <jobName> missed tick — auto-triggered at <now>")
3. Rate limit: per-job alert cooldown 2h (tracked in process memory Map — not DB, to avoid WAL writes from the watchdog itself)
```

**WATCHDOG_MANIFEST (initial):**

| jobName | cadenceMs | thresholdMultiplier | action |
|---|---|---|---|
| `ohlcvDailyAggregatorJob` | 86_400_000 (1d) | 1.5 | self-heal |
| `vnstockFundamentalsRefresh` | 604_800_000 (7d) | 1.3 | alert-only |
| `reputationComputeJob` | 86_400_000 (1d) | 1.5 | self-heal |
| `evidenceAccumulatorJob` | 86_400_000 (1d) | 1.5 | self-heal |
| `morningBriefingJob` | 86_400_000 (1d) | 1.5 | alert-only |
| `eveningSummaryJob` | 86_400_000 (1d) | 1.5 | alert-only |
| `franceSummaryJob` | 86_400_000 (1d) | 1.5 | alert-only |
| `foreignFlowAlert` | 86_400_000 (1d) | 1.5 | alert-only |
| `insiderCheckJob` | 86_400_000 (1d) | 1.5 | alert-only |
| `calibrationReportJob` | 604_800_000 (7d) | 1.3 | alert-only |
| `baseRateComputationJob` | 604_800_000 (7d) | 1.3 | alert-only |
| `predictionResolutionJob` | 86_400_000 (1d) | 1.5 | alert-only |
| `macroIndicatorRefreshJob` | 86_400_000 (1d) | 1.5 | alert-only |
| `taOhlcvBackfill` | 86_400_000 (1d) | 1.5 | self-heal |
| `accuracyDigestJob` | 86_400_000 (1d) | 1.5 | alert-only |
| `summaryJob:daily` | 86_400_000 (1d) | 1.5 | alert-only |

**Self-heal constraint:** self-heal action MUST call the job's runner through `jobRunRepo.wrapRun()` to ensure dedup guard fires. If the dedup guard detects the job already ran within cadence window, the self-heal is a clean no-op.

**DDD Layer:** interface/scheduler (`system/` subfolder). Watchdog reads from `cron_job_runs` (infrastructure/db) — this is a valid read at the scheduler layer. No new tables. No domain imports.

**cronConfig key:**
```typescript
schedulerWatchdog: Bun.env.CRON_SCHEDULER_WATCHDOG ?? '*/10 * * * *'
```

---

## 5. Migration Path — All Jobs

### 5.1 Phase order (within a single sprint after IMPL gate clears)

```
Phase 1 (load-bearing — ships first):
  a. Apply Lever 2: add T4 dedup guards to all T4 jobs (idempotency precondition for Lever 1)
  b. Apply Lever 1: add recoverMissedExecutions: true universally in startScheduler.ts
  c. Apply Lever 3: shift cronConfig.ts default schedule strings for 8 high-collision jobs

Phase 2 (builds on Phase 1):
  d. Implement schedulerWatchdogJob.ts (Lever 4)
  e. Register in startScheduler.ts + add cronConfig key
  f. Unit tests for watchdog logic

Phase 3 (validation):
  g. Integration test: simulated event-loop saturation — inject 5s sleep in intelligenceCycleJob callback, verify ohlcvDailyAggregatorJob fires within 2 cadence windows
  h. Live verification: 48h uptime with all 3 confirmed-dead jobs auto-firing on schedule
```

### 5.2 Files to Modify

| File | Change | Phase |
|---|---|---|
| `apps/mcp-server/src/scheduler/startScheduler.ts` | Add `recoverMissedExecutions: true` to 50+ `cron.schedule()` calls that lack it | 1b |
| `apps/mcp-server/src/scheduler/cronConfig.ts` | Shift 8 default schedule strings (Lever 3) + add `schedulerWatchdog` key | 1c + 2e |
| `apps/mcp-server/src/scheduler/market-data/ohlcvDailyAggregatorJob.ts` | Add T4 dedup guard (check `cron_job_runs` before running) | 1a |
| `apps/mcp-server/src/scheduler/macro/calibrationReportJob.ts` | Add T4 dedup guard | 1a |
| `apps/mcp-server/src/scheduler/macro/baseRateComputationJob.ts` | Add T4 dedup guard | 1a |
| `apps/mcp-server/src/scheduler/macro/predictionResolutionJob.ts` | Add T4 dedup guard | 1a |
| `apps/mcp-server/src/scheduler/news/reputationComputeJob.ts` | Add T4 dedup guard (the existing `recoverMissedExecutions: true` is insufficient without this) | 1a |
| `apps/mcp-server/src/scheduler/alerts/verdictResolutionJob.ts` | Add T4 dedup guard | 1a |
| `apps/mcp-server/src/scheduler/alerts/signalOutcomeJob.ts` | Add T4 dedup guard | 1a |
| `apps/mcp-server/src/scheduler/alerts/alertOutcomeJob.ts` | Add T4 dedup guard | 1a |
| `apps/mcp-server/src/scheduler/portfolio/weeklyPortfolioReportJob.ts` | Add T4 dedup guard | 1a |
| `apps/mcp-server/src/scheduler/system/devTeamHeartbeatJob.ts` | Add T4 dedup guard | 1a |
| `apps/mcp-server/src/scheduler/news-analysis/dataAuditJob.ts` | Add T4 dedup guard for both daily and weekly variants | 1a |
| `apps/mcp-server/src/scheduler/digest/accuracyDigestJob.ts` | Already has DB-backed dedup — verify guard also covers recovery replays (T1) | 1a |

### 5.3 Files to Create

| File | Content | Phase |
|---|---|---|
| `apps/mcp-server/src/scheduler/system/schedulerWatchdogJob.ts` | Watchdog — WATCHDOG_MANIFEST + per-job age check + alert/self-heal dispatch | 2d |
| `apps/mcp-server/src/__tests__/ARCH-CRON-watchdog.test.ts` | Unit: (1) no alert within cadence window; (2) alert fires at 1.5× cadence; (3) self-heal calls wrapRun; (4) dedup guard in self-heal target prevents double execution; (5) rate-limit: only 1 alert per 2h per job | 2f |
| `apps/mcp-server/src/__tests__/ARCH-CRON-idempotency.test.ts` | Unit: for each T4 job, simulate recovery replay; verify no double Telegram send | 1a |

---

## 6. Idempotency Contract (Canonical)

Every job registered in `startScheduler.ts` MUST satisfy one of the following tiers:

```
T1 — DB-backed same-day dedup inside job body (alreadySentToday pattern)
T2 — SQL upsert (INSERT OR REPLACE / ON CONFLICT DO UPDATE) makes replay harmless
T3 — isRunning flag or business guard short-circuits the second run
T4 — cron_job_runs recency check: if last successful run < 90% of declared cadence, skip

Tier must be documented in a JSDoc comment at the top of each job's runner function:
  @idempotency T2 — INSERT OR REPLACE; replay is harmless
```

This contract is the gate: the architect must verify tier assignment before approving any new cron job in future design reviews.

---

## 7. Watchdog Spec

**File:** `apps/mcp-server/src/scheduler/system/schedulerWatchdogJob.ts`

**Interface:**
```typescript
export interface WatchdogManifestEntry {
  cadenceMs: number
  thresholdMultiplier: number
  action: 'alert-only' | 'self-heal'
  selfHealFn?: () => Promise<void>  // required when action='self-heal'
}

export type WatchdogManifest = Record<string, WatchdogManifestEntry>

export async function runSchedulerWatchdog(deps?: {
  db?: Database
  manifest?: WatchdogManifest
  sendFn?: (msg: string) => Promise<void>
  nowMs?: number
}): Promise<{ checked: number; alerted: number; healed: number }>
```

**Alert message format:**
```
[scheduler-watchdog] ohlcvDailyAggregatorJob: last ran 26h ago (cadence=24h, threshold=1.5×). 
Auto-trigger fired. Check cron_job_runs for status.
```

**Telegram channel:** `work` (not `bug` — operational signal, same pattern as WAL alerts)

**DB interaction:** read-only `SELECT MAX(started_at) FROM cron_job_runs WHERE job_name=? AND status IN ('success', 'error')`. No writes from watchdog itself (avoids WAL pressure from the safety net).

**In-process rate limit:** `Map<jobName, lastAlertMs>` — if `Date.now() - lastAlertMs < 7_200_000` (2h), skip. Resets on server restart (acceptable — restart clears cooldown, which is correct behavior after a fix is deployed).

---

## 8. DDD Layer Assignments

| Component | Layer | Folder |
|---|---|---|
| `schedulerWatchdogJob.ts` | interface/scheduler | `apps/mcp-server/src/scheduler/system/` |
| `WATCHDOG_MANIFEST` constant | interface/scheduler | same file |
| Dedup guard (T4 pattern) | interface/scheduler | inside each job file |
| `cron_job_runs` read queries in watchdog | infrastructure (via existing `SqliteJobRunRepository.getLastRuns()`) | injected |

**Golden rule compliance:** watchdog reads `cron_job_runs` via the repository interface, not direct `getDb()` call. Inject `db` as a parameter. No domain imports.

---

## 9. Brownfield Risk / DDD Risk Table

| Risk | Severity | Mitigation |
|---|---|---|
| **R-1 — `recoverMissedExecutions: true` causes missed-tick replay on restart that double-fires a non-idempotent job** | HIGH | Lever 2 (T4 dedup guards) MUST ship in Phase 1a BEFORE Lever 1. Sequencing is hard: dev MUST implement 1a before 1b in same sprint. PM must enforce this in task ordering. |
| **R-2 — Watchdog self-heal fires a long-running job (e.g. vnstockFundamentals, 7–10 min) during market hours, competing with intelligenceCycle** | MEDIUM | Self-heal jobs in WATCHDOG_MANIFEST are set to `alert-only` for long-running sweeps. Only `ohlcvDailyAggregatorJob`, `reputationComputeJob`, `taOhlcvBackfill`, `evidenceAccumulatorJob` are `self-heal` — all are quick (<2 min) or have `isRunning` guards. |
| **R-3 — Jitter shifts break timing dependencies** | MEDIUM | Cross-check: `ohlcvDailyAggregatorJob` at `3 15` → must complete before `eveningSummaryJob` at `30 22` VN (= `15 15` UTC). 12 min gap is sufficient. `reputationComputeJob` at `33 8` → after `taOhlcvBackfill` at `30 1` — no conflict. `predictionResolution` at `35 16` → no consumers until `cascadeBacktest` at `37 20` — 4h gap, safe. |
| **R-4 — All 50+ jobs touched in one PR → merge conflict risk** | HIGH | PM must split into 3 atomic tasks: (T1) T4 dedup guards only, (T2) `recoverMissedExecutions` + jitter shifts in startScheduler/cronConfig, (T3) watchdog new file. Sequential, no worktree isolation needed (all same zone/file set). |
| **R-5 — IMPL gate: FIX-MCP-CRASH-LOOP-WRITEWAL must land first** | CRITICAL | A crash-looping server restarts every ~2h; each restart clears in-process rate-limit state and re-fires startup probes. This ARCH-CRON-SCHEDULER-RELIABILITY IMPL must not ship before WRITEWAL fix is live and verified. |
| **R-6 — cronConfig.ts default value changes affect tests that assert specific schedule strings** | LOW | Search `__tests__/` for hardcoded cron expressions. Dev must update test fixtures to match new defaults, or use env-override pattern. |
| **R-7 — Watchdog self-heal calls runner via `jobRunRepo.wrapRun()` — this creates a second `cron_job_runs` row within the same cadence window. Dedup guard must check BOTH rows** | MEDIUM | T4 dedup guard uses `getLastRuns(jobName, 1)[0]` — returns most recent, regardless of caller. If watchdog just healed, the dedup guard on the next scheduled tick will find a recent success row and skip. Correct behavior. |

---

## 10. Standard Detection

```
NEW FEATURE (apps/mcp-server/ already exists):
  BUILD-STANDARD: lean
  BUILD-STANDARD-REF: docs/standards/microservice-build-standard.md
  NOTE: dev-mcp-server drives end-to-end; no relay required
```

Rationale: new scheduler infrastructure (watchdog job) within existing zone. No new MCP tools, no new domain services, no new DB tables. `schedulerWatchdogJob.ts` is a new file but within existing `scheduler/system/` module.

**Dev zone:** `dev-mcp-server` owns all changes.

**Doc ownership note (per dev-* doc-ownership rule):** Any doc edits to `docs/standards/cron-jobs.md` or `docs/data/cron-registry.json` reflecting the new watchdog job and updated schedules are owned by `dev-mcp-server`, not included in this brief directly.

---

## 11. Test Strategy

| Test | Type | File | Gate |
|---|---|---|---|
| Watchdog: no alert within cadence window | Unit | `ARCH-CRON-watchdog.test.ts` | bun test green |
| Watchdog: WORK alert fires at 1.5× cadence | Unit | `ARCH-CRON-watchdog.test.ts` | bun test green |
| Watchdog: self-heal calls `wrapRun` | Unit | `ARCH-CRON-watchdog.test.ts` | bun test green |
| Watchdog: self-heal dedup guard prevents double execution | Unit | `ARCH-CRON-watchdog.test.ts` | bun test green |
| Watchdog: 2h rate-limit prevents spam | Unit | `ARCH-CRON-watchdog.test.ts` | bun test green |
| T4 dedup: ohlcvDailyAggregatorJob skips replay when last run < 22h ago | Unit | `ARCH-CRON-idempotency.test.ts` | bun test green |
| T4 dedup: reputationComputeJob skips replay when last run < 22h ago | Unit | `ARCH-CRON-idempotency.test.ts` | bun test green |
| T4 dedup: calibrationReportJob skips replay when last run < 6 days ago | Unit | `ARCH-CRON-idempotency.test.ts` | bun test green |
| `recoverMissedExecutions` integration: inject 5s sleep, verify job fires within 2 cadence windows | Integration | `ARCH-CRON-recovery.test.ts` (in-memory) | bun test green |
| tsc 0 errors | Pre-commit | — | pre-commit hook |

---

## 12. Acceptance Criteria

| AC | Gate |
|---|---|
| All `cron.schedule()` calls in `startScheduler.ts` have `recoverMissedExecutions: true` | Code review |
| All T4 jobs have a dedup guard that skips replay when last success < 90% of declared cadence | Code review |
| `schedulerWatchdogJob.ts` deployed and registered | `cron_job_runs` shows `schedulerWatchdogJob` rows every 10 min |
| Live: `ohlcvDailyAggregatorJob` fires on 2026-06-16 (first weekday post-deploy) at ~15:03 UTC | ops verify `cron_job_runs WHERE job_name='ohlcv-daily-aggregator' AND status='success'` |
| Live: `reputationComputeJob` fires daily at ~08:33 UTC | ops verify for 3 consecutive days |
| Live: `vnstockFundamentalsRefresh` fires on next Monday at ~01:05 UTC | ops verify |
| Live: watchdog sends WORK alert within 10 min of any job exceeding 1.5× cadence | can be tested by temporarily disabling a job via env-override |
| No double-execution Telegram in MARKET or WORK channels within 24h post-deploy | ops monitor |
| tsc 0 errors | pre-commit hook |
| All new tests pass (watchdog + idempotency + recovery) | bun test green |

---

*Authored: 2026-06-14 | Zone: apps/mcp-server/ (scheduler layer)*
