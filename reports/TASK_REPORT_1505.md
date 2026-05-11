# Task Report 1505 — cascade-backtest daily cron fills outcome cols

verdict: APPROVED
sprint: 192
merge_commit: bd0b4df
branch: task/1505b-cascade-backtest-green

## Results

| Check | Result |
|-------|--------|
| targeted tests (1505) | 7 pass / 0 fail |
| regression (full suite) | 5705 pass / 5 fail (pre-existing task-217 failures, unrelated) |
| NEW_PASS match | 5705 = expected |
| tsc --noEmit | 0 errors |
| DDD compliance | PASS — cascadeBacktestJob.ts in scheduler/, imports from infrastructure/ (inward) |
| security (process.env) | PASS — Bun.env used throughout |
| schema backward-compat | PASS — daily_ohlcv NOT NULL DEFAULT 0 / DEFAULT '' on open/high/low/volume/updated_at; close stays NOT NULL |
| cron-registry.json | schedulerFileCount 36→37, cascadeBacktestJob entry present |
| 1190 watchdog count | 16 pass / 0 fail (count updated 36→37) |

## changed

| File | Change |
|------|--------|
| src/scheduler/cascadeBacktestJob.ts | NEW — runCascadeBacktest(deps?) injectable, fills price_impact_3d/7d/outcome_correct |
| src/scheduler/jobs.ts | CRONS.cascadeBacktest key + cron.schedule block at 20:30 UTC daily |
| docs/data/cron-registry.json | +1 entry, schedulerFileCount 36→37 |
| src/infrastructure/db/schema.ts | daily_ohlcv DEFAULT fixes (NOT NULL → DEFAULT 0 / DEFAULT '') |
| src/__tests__/1190-pipeline-watchdog.test.ts | count assertion 36→37 |
| src/__tests__/1505-cascade-backtest.test.ts | NEW — 7 assertions (AC-1 through AC-7) |

## Notes

- Server restart required after merge (new scheduler file registered)
- 5 pre-existing failures in task-217 compare_stocks formatting — not introduced by this branch
- Bun 1.3.11 crash at end of suite run is known upstream bug, does not affect test results
