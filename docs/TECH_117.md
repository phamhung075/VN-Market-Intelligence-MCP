# TECH-117: fix(france-summary-cron) — Widen cron window to survive server restarts

status: APPROVED_BY_ARCHITECT
req_ref: REQ-117

## Brownfield Impact

- Files modified: `src/scheduler/jobs.ts` (1 line — CRONS.franceSummary default string)
- Files created: `src/__tests__/1348-france-summary-cron-window.test.ts`
- Files deleted: none
- Breaking changes: no — env override `CRON_FRANCE_SUMMARY` path is unchanged; behaviour change is additive (more fire points, same dedup contract)

## Architecture Decision

The root cause is a single-point cron (`'0 7 * * 1-5'`) that silently misses when the server restarts after 07:00 UTC. The correct fix is widening the cron expression to a rolling 30-minute interval (`'*/30 6-8 * * 1-5'`), relying on the existing `alreadySentToday()` dedup guard (Sprint 115, Task 1345) to prevent duplicate sends. No logic changes are required in `franceSummaryJob.ts` — the guard is already correct and fail-open. The fix is intentionally the smallest safe change: one string replacement in `CRONS`, zero new infrastructure.

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|-----------|-------|-----------|------------|
| CRONS.franceSummary default | interface/scheduler | `src/scheduler/jobs.ts` line 121 | MODIFY |
| TDD test suite | test | `src/__tests__/1348-france-summary-cron-window.test.ts` | NEW |
| alreadySentToday() guard | interface/scheduler | `src/scheduler/franceSummaryJob.ts` | NO CHANGE |
| recordJobRun wrapper | interface/scheduler | `src/scheduler/jobs.ts` lines 411-419 | NO CHANGE |

## Interface Contracts

### No new interfaces

`runFranceSummary` signature is unchanged. The injectable `FranceSummaryOptions` already supports `{ db, sendFn, nowFn }` — the test uses this pattern verbatim from Task 1344.

### Existing contract (read-only reference)

```typescript
// src/scheduler/franceSummaryJob.ts
export interface FranceSummaryOptions {
  db?: Database
  sendFn?: SendFn
  nowFn?: () => Date
}
export async function runFranceSummary(opts: FranceSummaryOptions = {}): Promise<FranceSummaryResult>
```

### Target cron expression (Task 1349)

```typescript
// src/scheduler/jobs.ts — line 121
/** France morning summary: every 30 min 06:00-08:59 UTC Mon-Fri — task 1349, Sprint 117
 *  Widened from single-point '0 7 * * 1-5' to survive server restarts during active dev.
 *  Dedup guard (alreadySentToday) in franceSummaryJob.ts prevents duplicate sends. */
franceSummary: Bun.env.CRON_FRANCE_SUMMARY ?? '*/30 6-8 * * 1-5',
```

Fire points after widening: 06:00, 06:30, 07:00, 07:30, 08:00, 08:30 UTC Mon-Fri (6 ticks/day vs 1 previously).

## Task Breakdown

Tasks are already defined in TASKS.md Sprint 117. Dependency order is fixed:

1. **Task 1348** — Write `src/__tests__/1348-france-summary-cron-window.test.ts` FIRST. Tests must fail against the pre-fix `'0 7 * * 1-5'` default (AC-6) and pass for the injectable `runFranceSummary` calls (AC-1 through AC-5). See test spec below.
2. **Task 1349** — Apply the one-line default change in `jobs.ts`. All tests in Task 1348 must now pass. `bun tsc --noEmit` must be clean.

## Test Spec — Task 1348

File: `src/__tests__/1348-france-summary-cron-window.test.ts`

Line 1 must be: `process.env["DB_PATH"] = ":memory:";`

Reuse `makeDb()` and `seedMover()` helpers verbatim from `1344-france-summary-stale-alerts.test.ts`.

| # | Test name | Setup | Call | Assertion |
|---|-----------|-------|------|-----------|
| 1 | AC-1: no prior send → digest sends on first tick | fresh DB + seedMover | `runFranceSummary({ db, sendFn, nowFn })` | `result.sent === true`, sendFn called once |
| 2 | AC-2: already sent today → dedup blocks re-send | seedMover + `market_messages` row `from_agent='france-summary'` `sent_at=datetime('now')` | `runFranceSummary({ db, sendFn, nowFn })` | `result.sent === false`, sendFn never called |
| 3 | AC-3: nowFn = 06:30 UTC → sends with correct date | fresh DB + seedMover | `nowFn: () => new Date("2026-04-16T06:30:00.000Z")` | `result.sent === true`, message contains `"16/04/2026"` |
| 4 | AC-4: nowFn = 07:00 UTC (original tick) → sends | fresh DB + seedMover | `nowFn: () => new Date("2026-04-16T07:00:00.000Z")` | `result.sent === true` |
| 5 | AC-5: nowFn = 08:00 UTC (last window tick) → sends | fresh DB + seedMover | `nowFn: () => new Date("2026-04-16T08:00:00.000Z")` | `result.sent === true` |
| 6 | AC-6: CRONS.franceSummary default after fix | import CRONS from `jobs.ts` (post-Task-1349) | read `CRONS.franceSummary` | equals `'*/30 6-8 * * 1-5'` |

Note: AC-6 can only pass after Task 1349 is applied. The Dev agent writes it in Task 1348 (it will fail at that point) and confirms it passes after Task 1349.

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| `alreadySentToday()` uses `date('now')` which is UTC midnight — digest sent at 06:30 UTC and 07:00 UTC on the same UTC calendar day correctly deduped | Low | High | Existing Task 1344 AC-3/AC-4 already cover this; Task 1348 AC-2 re-verifies |
| Server restarts at 08:45 UTC — outside the window, digest missed for that day | Low | Low | Acceptable per REQ-117 edge case — documented in spec |
| Cron fires 6x/day instead of 1x — performance regression on `alreadySentToday()` COUNT query | Very Low | None | Single indexed COUNT on `market_messages` WHERE clause; < 1 ms per REQ-117 NFR |
| `CRON_FRANCE_SUMMARY` env override silently uses old single-point value in production | Low | Medium | No code change required — override path unchanged; user must update env var manually if they want the wider window |

## Security Review

- SQL parameterized? Yes — `alreadySentToday()` uses no user input; query is fully static
- File paths validated? N/A — no file I/O in this change
- External HTTP rate-limited? N/A — no new HTTP calls
- Secrets via Bun.env only? Yes — `CRON_FRANCE_SUMMARY` env var read via `Bun.env`
