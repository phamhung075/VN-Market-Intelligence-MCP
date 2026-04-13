# TECH-062: Cron Observability Completion

status: APPROVED_BY_ARCHITECT
req_ref: REQ-062

---

## Brownfield Impact

- Files modified: `src/scheduler/jobs.ts`, `src/scheduler/summaryJobs.ts`
- Files created: none
- Files deleted: none
- Breaking changes: no — no public signatures change, no schema changes

---

## Architecture Decision

Every scheduler callback in `jobs.ts` that currently calls a job function directly will be
wrapped in `recordJobRun(getDb(), jobName, async () => { ... })`. This is the established
pattern already used by 11 of 28 jobs (e.g. `foreignFlowAlertJob`, `evidenceAccumulatorJob`).
The wrap belongs at the `cron.schedule(...)` call site in `jobs.ts`, not inside the job file
itself, so that concurrency guards and injectable-test parameters inside each job file remain
unmodified. The single exception is `summaryJobs.ts`, which owns its own cron registration
and must import `recordJobRun` directly.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|-----------|-------|-----------|------------|
| `recordJobRun` imports | interface/scheduler | `src/scheduler/jobs.ts` | MODIFY |
| 15 wrap sites (FR-1..FR-15) | interface/scheduler | `src/scheduler/jobs.ts` | MODIFY |
| Remove 3 inline try/catch | interface/scheduler | `src/scheduler/jobs.ts` | MODIFY |
| `runSummaryJob` wrap | interface/scheduler | `src/scheduler/summaryJobs.ts` | MODIFY |
| `recordJobRun` imports | interface/scheduler | `src/scheduler/summaryJobs.ts` | MODIFY |

No domain or infrastructure files are touched. All changes stay in the `interface/scheduler`
layer, which is the correct layer for cron orchestration wiring.

---

## Interface Contracts

No new interfaces. `recordJobRun` signature (already in `src/infrastructure/db/cronJobRunStore.ts`):

```typescript
export async function recordJobRun(
  db: Database,
  jobName: string,
  fn: () => Promise<{ rowsWritten?: number } | void>,
): Promise<void>
```

Contract invariants relevant to this sprint:
- Never re-throws — errors are captured in `error_msg`. All three existing inline try/catch
  blocks in `jobs.ts` (bctcOverdueCheck, vpsProxyWatchdog, cronHealthAlert) must be removed.
  Keeping them would swallow errors before `recordJobRun` can see them.
- When `fn` returns `{ rowsWritten: N }`, N is stored; void / undefined stores NULL.

---

## Canonical Wrap Patterns

### Pattern A — void jobs (12 of 15 jobs.ts sites)

The standard pattern for jobs that return `Promise<void>` and have no useful metric to
extract. Used for FR-1, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12.

```typescript
cron.schedule(CRONS.someJob, async () => {
  await recordJobRun(getDb(), "someJobName", async () => {
    await runSomeJob()
  })
}, { timezone: 'Asia/Ho_Chi_Minh' })
```

### Pattern B — rowsWritten extraction (2 jobs.ts sites)

Used when the job returns a result object with a countable metric.

**intelligenceCycleJob (FR-2)** — returns `CycleResult | null` (null when concurrency guard fires):

```typescript
cron.schedule(CRONS.intelligenceCycle, async () => {
  await recordJobRun(getDb(), "intelligenceCycleJob", async () => {
    const result = await runIntelligenceCycle()
    return { rowsWritten: (result?.newsFetched ?? 0) + (result?.impactEventsRan ?? 0) }
  })
}, { timezone: 'Asia/Ho_Chi_Minh' })
```

**bctcOverdueCheckJob (FR-14)** — returns `RunResult` with `alertsInserted`:

```typescript
cron.schedule(CRONS.bctcOverdueCheck, async () => {
  await recordJobRun(getDb(), "bctcOverdueCheckJob", async () => {
    const r = await runBctcOverdueCheck()
    if (r.alertsInserted > 0) {
      log(`[bctc-overdue] inserted=${r.alertsInserted} overdue=${r.overdueFound} checked=${r.stocksChecked}`)
    }
    return { rowsWritten: r.alertsInserted }
  })
}, { timezone: 'Asia/Ho_Chi_Minh' })
```

**cronHealthAlertJob (FR-15)** — returns `CronHealthAlertResult` with `alertsSent`:

```typescript
cron.schedule(CRONS.cronHealthAlert, async () => {
  await recordJobRun(getDb(), "cronHealthAlertJob", async () => {
    const r = await runCronHealthAlert()
    if (r.alertsSent > 0) {
      log(`[cron-health-alert] degraded=${r.alertsSent}`)
    }
    return { rowsWritten: r.alertsSent }
  })
}, { timezone: 'UTC' })
```

### Pattern C — string-return job (FR-13)

`runVpsProxyWatchdog` returns `Promise<string>`. The string is used only for a conditional
log; it must not be passed to `rowsWritten`.

```typescript
cron.schedule(CRONS.vpsProxyWatchdog, async () => {
  await recordJobRun(getDb(), "vpsProxyWatchdogJob", async () => {
    const status = await runVpsProxyWatchdog()
    if (status !== "ok" && status !== "off-hours" && status !== "cooldown") {
      log(`[vps-watchdog] ${status}`)
    }
  })
}, { timezone: 'UTC' })
```

### Pattern D — summaryJobs.ts self-contained wrap (FR-16)

`summaryJobs.ts` owns its own cron registration. The wrap goes inside `runSummaryJob`,
not in `jobs.ts`. The file must add two imports at the top.

New imports to add to `summaryJobs.ts` (after the existing `logger` import):

```typescript
import { getDb } from "../infrastructure/db/schema.js"
import { recordJobRun } from "../infrastructure/db/cronJobRunStore.js"
```

Replacement `runSummaryJob` function (replaces lines 54–75 in `summaryJobs.ts`):

```typescript
async function runSummaryJob(periodType: PeriodType): Promise<void> {
  const db = getDb()
  await recordJobRun(db, `summaryJob:${periodType}`, async () => {
    const start = Date.now()
    logger.info(`[summaryJob] starting ${periodType} summary generation`)
    const summary = await generatePeriodicSummary(periodType)
    const durationMs = Date.now() - start
    logger.info(`[summaryJob] ${periodType} summary complete`, {
      id: summary.id,
      periodStart: summary.periodStart,
      periodEnd: summary.periodEnd,
      newsCount: summary.newsCount,
      alertCount: summary.alertCount,
      durationMs,
    })
  })
}
```

The outer `try/catch` in the original `runSummaryJob` (lines 58–74) is superseded by
`recordJobRun`'s own error capture and must be removed. The `durationMs` variable is
preserved in the success-path log only; no error-path log is needed because `recordJobRun`
writes the error to `error_msg` in the DB.

---

## jobs.ts: Required Changes Summary

### 1. Add two imports (after existing imports block, before CRONS declaration)

Current last import line is line 50 (`runForeignFlowAlertJobCron`). Add after it:

```typescript
import { getDb } from '../infrastructure/db/schema.js'
import { recordJobRun } from '../infrastructure/db/cronJobRunStore.js'
```

### 2. Inline try/catch blocks to REMOVE (replace with recordJobRun)

Three call sites currently have inline try/catch that must be replaced wholesale:

| Job | jobs.ts lines | Action |
|-----|--------------|--------|
| `bctcOverdueCheck` | 276–285 | Remove try/catch, apply Pattern B |
| `vpsProxyWatchdog` | 292–301 | Remove try/catch, apply Pattern C |
| `cronHealthAlert` | 306–315 | Remove try/catch, apply Pattern B |

Note: `foreignFlowAlertJob` (lines 345–352) also has an inline try/catch but is already
instrumented via its own internal `recordJobRun` call. That try/catch is NOT in scope for
this sprint — leave it untouched.

### 3. Plain `await runX()` calls to wrap (no try/catch to remove)

These 12 call sites are clean single-line awaits — add `recordJobRun` around them:

| Job | jobs.ts lines | Pattern |
|-----|--------------|---------|
| `morningBriefing` | 130–132 | A |
| `intelligenceCycle` | 143–145 | B |
| `eveningSummary` | 158–160 | A |
| `alertDigest` | 163–165 | A |
| `patternWatch` | 174–176 | A |
| `weeklyPortfolioReport` | 241–243 | A |
| `franceSummary` | 246–248 | A |
| `devTeamHeartbeat` | 251–253 | A |
| `predictionOutcome` | 257–259 | A |
| `weatherCheck` | 263–265 | A |
| `davPharmacyCheck` | 268–270 | A |
| `predictionMarketPoll` | 201–203 | A |

---

## Exclusions

**insiderCheckJob (FR-17):** `runInsiderCheck` is not imported or called in `jobs.ts`. It
is dead scheduler code. Do NOT instrument it — recording a job that never fires produces
false health data. Log a backlog item for Sprint 063+ to decide: register with a new CRON
key or delete the file.

**walCheckpoint (line 169–171):** `runWalCheckpoint()` is a synchronous SQLite maintenance
call, not a domain job. It intentionally stays outside `recordJobRun`.

**bctcReparseJob startup catch-up (lines 213–222):** The `setTimeout` fire-and-forget
catch-up block is a one-shot on-boot call, not a cron tick. It keeps its own try/catch.
The cron registration for `bctcReparseJob` (lines 206–208) is already instrumented and
must not be touched.

---

## Task Breakdown

Tasks are batched by similarity to keep count manageable. All are single-file changes in
`src/scheduler/jobs.ts` or `src/scheduler/summaryJobs.ts`, layer `interface/scheduler`.
No task has external dependencies.

### Task 1136 — jobs.ts imports + summaryJobs.ts wrap (FR-16, FR-18)

**Files**: `src/scheduler/jobs.ts`, `src/scheduler/summaryJobs.ts`
**Lines in jobs.ts**: add 2 import lines after line 50
**Lines in summaryJobs.ts**: add 2 import lines after line 21; replace lines 54–75 with Pattern D

Work:
1. Add `getDb` and `recordJobRun` imports to `jobs.ts` (after line 50).
2. Add `getDb` and `recordJobRun` imports to `summaryJobs.ts` (after line 21).
3. Replace `runSummaryJob` (lines 54–75 of `summaryJobs.ts`) with the Pattern D version.

This task is the prerequisite for all other tasks (imports must land first). It is small
enough to merge alone before the batch tasks start.

---

### Task 1137 — Wrap critical briefing/cycle jobs (FR-1, FR-2, FR-3, FR-4)

**File**: `src/scheduler/jobs.ts`
**Jobs**: morningBriefing, intelligenceCycle, eveningSummary, alertDigest

| Job | Current lines | Pattern |
|-----|--------------|---------|
| morningBriefing | 130–132 | A |
| intelligenceCycle | 143–145 | B (null-safe `result?.newsFetched ?? 0`) |
| eveningSummary | 158–160 | A |
| alertDigest | 163–165 | A |

Work: replace each plain `await runX()` body with the appropriate `recordJobRun(getDb(), ...)` wrapper.

---

### Task 1138 — Wrap market/portfolio/prediction jobs (FR-5, FR-6, FR-7, FR-8)

**File**: `src/scheduler/jobs.ts`
**Jobs**: patternWatch, weeklyPortfolioReport, predictionMarketPoll, predictionOutcomeCheck

| Job | Current lines | Pattern |
|-----|--------------|---------|
| patternWatch | 174–176 | A |
| weeklyPortfolioReport | 241–243 | A |
| predictionMarketPoll | 201–203 | A |
| predictionOutcome | 257–259 | A |

Work: replace each plain `await runX()` body with Pattern A `recordJobRun` wrapper.

---

### Task 1139 — Wrap utility/infra jobs (FR-9, FR-10, FR-11, FR-12)

**File**: `src/scheduler/jobs.ts`
**Jobs**: franceSummary, devTeamHeartbeat, weatherCheck, davPharmacyCheck

| Job | Current lines | Pattern |
|-----|--------------|---------|
| franceSummary | 246–248 | A |
| devTeamHeartbeat | 251–253 | A |
| weatherCheck | 263–265 | A |
| davPharmacyCheck | 268–270 | A |

Work: replace each plain `await runX()` body with Pattern A `recordJobRun` wrapper.

---

### Task 1140 — Replace try/catch blocks: bctcOverdueCheck, vpsProxyWatchdog, cronHealthAlert (FR-13, FR-14, FR-15)

**File**: `src/scheduler/jobs.ts`
**Jobs**: bctcOverdueCheckJob, vpsProxyWatchdogJob, cronHealthAlertJob

| Job | Current lines | Action | Pattern |
|-----|--------------|--------|---------|
| bctcOverdueCheck | 276–285 | Remove try/catch, wrap with recordJobRun | B |
| vpsProxyWatchdog | 292–301 | Remove try/catch, wrap with recordJobRun | C |
| cronHealthAlert | 306–315 | Remove try/catch, wrap with recordJobRun | B |

Work:
- For each of the three blocks: delete the existing `try { ... } catch (err) { log(...) }`
  structure and replace the entire callback body with the `recordJobRun(getDb(), ...)` wrapper.
- The conditional log statements inside bctcOverdueCheck and cronHealthAlert are preserved
  inside the `recordJobRun` callback (before the `return { rowsWritten: ... }` line).
- The conditional log for vpsProxyWatchdog is preserved inside the callback.

This task must verify that after the change, no standalone try/catch remains for these three
call sites (AC-4).

---

## Test Plan

No new test files are required by this sprint (REQ-062 explicitly states "no new tests beyond
verifying the wrap is present"). The existing test suite (`bun test`) must continue to pass.

Recommended smoke checks after each task merges:
1. `bun tsc --noEmit` — no type errors.
2. `bun test` — all existing tests pass.
3. After server restart (`launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp`), wait one
   intelligence cycle (15 min), then call `get_cron_health` with `days=1` and confirm
   `intelligenceCycleJob` appears with `last_status=success`.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Import conflict — `getDb` already imported under different alias | Low | Low | grep `getDb` in jobs.ts before adding import; none currently present |
| Double error-swallowing if inline try/catch is kept alongside recordJobRun | Medium | Medium | AC-4 check: inspect jobs.ts after task 1140 for zero standalone try/catch on the three jobs |
| `result?.newsFetched` field renamed in CycleResult | Low | Low | grep `newsFetched` in intelligenceCycleJob.ts to confirm field name before writing pattern |
| `summaryJobs.ts` getDb called at registration time rather than per-run | Low | Medium | `getDb()` is called inside the `recordJobRun` callback (per-run), not at module level |
| cronHealthAlertJob circular-read concern | Low | None | Safe by construction: recordJobRun writes the row after `runCronHealthAlert` returns; the health query window cannot see a row that does not yet exist |

---

## Security Review

- SQL parameterized: yes — `recordJobRun` and all store functions use parameterized bindings; no new SQL introduced
- File paths validated: N/A — no file I/O added
- External HTTP rate-limited: N/A — no new HTTP calls
- Secrets via Bun.env only: N/A — no new env reads
