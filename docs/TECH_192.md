# TECH-192: cascade-backtest — daily cron fills outcome cols on cascade_rule_hits

status: APPROVED_BY_ARCHITECT
req_ref: REQ-192

## Brownfield Impact

- Files created: `src/scheduler/cascadeBacktestJob.ts`, `src/__tests__/1505-cascade-backtest.test.ts`
- Files modified: `src/scheduler/jobs.ts` (lines 144, 649), `docs/data/cron-registry.json`
- Files deleted: none
- Breaking changes: no

## Architecture Decision

`cascadeBacktestJob.ts` follows the `ohlcvStalenessCheckJob.ts` deps-injection pattern exactly — dynamic `import("../infrastructure/db/schema.js")` and `import("../infrastructure/notifiers/telegram.js")` when deps not injected, allowing full in-memory test isolation. `updateOutcome` from `cascadeHitStore.ts` (Sprint 191) is the only infrastructure write path — no new infra code. Multi-ticker averaging and per-row catch/skip keep the batch fault-tolerant.

## DDD Layer Plan

| Component              | Layer      | File                                           | New/Modify |
| ---------------------- | ---------- | ---------------------------------------------- | ---------- |
| `runCascadeBacktest`   | scheduler  | `src/scheduler/cascadeBacktestJob.ts`          | NEW        |
| CRONS key insertion    | scheduler  | `src/scheduler/jobs.ts:144`                    | MODIFY     |
| cron.schedule block    | scheduler  | `src/scheduler/jobs.ts:649`                    | MODIFY     |
| cron-registry entry    | data       | `docs/data/cron-registry.json`                 | MODIFY     |
| TDD test file          | test       | `src/__tests__/1505-cascade-backtest.test.ts`  | NEW        |

## Interface Contracts

### Exported from cascadeBacktestJob.ts

```typescript
export interface CascadeBacktestDeps {
  db?: Database;
  nowMsFn?: () => number;
  sendWorkFn?: (msg: string) => Promise<boolean>;
}

export interface CascadeBacktestResult {
  processed: number;
  skipped: number;
  noData: number;
}

export async function runCascadeBacktest(
  deps?: CascadeBacktestDeps
): Promise<CascadeBacktestResult>
```

### updateOutcome call site (existing, no change to signature)

```typescript
import { updateOutcome } from "../infrastructure/db/cascadeHitStore.js"
// updateOutcome(db, hit.id, { priceImpact3d, priceImpact7d, outcomeCorrect })
```

### jobs.ts CRONS map (line 144, after ohlcvStalenessCheck)

```typescript
/** cascadeBacktest — daily backtest: fills price_impact_3d/7d/outcome_correct on cascade_rule_hits rows >3d old */
cascadeBacktest: Bun.env.CRON_CASCADE_BACKTEST ?? '30 20 * * *',
```

### jobs.ts cron.schedule block (line 649, before the log line)

```typescript
// 20:30 UTC daily — cascade backtest — task 1505, Sprint 192
// Fills price_impact_3d/7d/outcome_correct on cascade_rule_hits rows older than 3 days.
// Runs after ohlcvDailyAggregator (20:00 UTC) so D+3/D+7 closes are ready.
cron.schedule(CRONS.cascadeBacktest, async () => {
  await recordJobRun(getDb(), 'cascade-backtest', async () => {
    const { runCascadeBacktest } = await import('./cascadeBacktestJob.js');
    await runCascadeBacktest();
  });
}, { timezone: 'UTC' });
```

## Business Logic Detail

### Pending rows query

```sql
SELECT id, rule_key, hit_at, affected_stocks
FROM cascade_rule_hits
WHERE outcome_correct IS NULL
  AND price_impact_3d IS NULL
  AND hit_at <= datetime('now', '-3 days')
```

### Per-row processing

1. Parse `affected_stocks` (comma-split, trim). Empty/NULL → `noData++`, skip.
2. For each code: query `daily_ohlcv` for D+0 (`date(hit_at)`), D+3 (`date(hit_at, '+3 days')`), D+7 (`date(hit_at, '+7 days')`).
3. Missing `close_d0` for ALL codes → `noData++`, skip row.
4. Missing `close_d3` for ALL codes → `noData++`, skip row (leave untouched — retry next cycle).
5. Codes with data: compute `impact = (close_d3 - close_d0) / close_d0 * 100`. Average across codes that have data.
6. Round `priceImpact3d` to 4 decimal places.
7. `outcomeCorrect`: `1` if avg > 1.0, `0` if avg < -1.0, `null` if exactly ±1.0 or no d3 data.
8. `priceImpact7d`: average if any code has d7 data, else `null` — always passes to `updateOutcome` as `undefined` when no data (do not overwrite with null unnecessarily).
9. Call `updateOutcome(db, hit.id, { priceImpact3d, priceImpact7d, outcomeCorrect })`. `processed++`.
10. Wrap steps 1-9 in per-row try/catch → on error: `console.warn`, `noData++`.

### WORK summary format

```
[cascade-backtest] processed=N skipped=0 noData=K
```

`skipped` is always 0 (WHERE clause pre-filters; no in-process age check needed).

## Task Breakdown

1. [1505a] TDD RED — write failing test assertions in `1505-cascade-backtest.test.ts`
2. [1505b] GREEN — implement `cascadeBacktestJob.ts` + patch `jobs.ts` + update `cron-registry.json`

Dependencies: 1505b depends on 1505a (RED must precede GREEN).

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
| ---- | ----------- | ------ | ---------- |
| D+3 date = weekend → no OHLCV row | High | Low | REQ spec: leave row untouched, retry next cycle (noData) |
| Multi-ticker: partial data (some codes missing d3) | Medium | Low | Average across codes WITH data; only skip if ALL missing |
| `hit_at` format mismatch | Low | Medium | Use SQLite `date(hit_at)` function — handles `YYYY-MM-DD HH:MM:SS` |
| Large backlog on first run | Low | Low | Low volume (<50 rows/day per spec); no batch size cap needed |

## Security Review

- SQL parameterized: yes — all queries use `?` binding
- File paths validated: N/A
- External HTTP rate-limited: N/A — DB-only job
- Secrets via Bun.env only: yes
