# Task Report: 1785 — France Summary change_pct prev-close-to-close
date: 2026-04-30
outcome: APPROVED

## Test Results
- Task tests (1785): 4 passed / 0 failed
- Full France suite (16 files, 104 tests): 104 passed / 0 failed
- Full suite: 8326 passed / 29 failed (main baseline: 8313 passed / 29 failed — 13 net new passing tests, zero regressions)
- TypeScript: 0 errors

## DDD Compliance: PASS
- `franceSummaryJob.ts` is in `src/scheduler/briefings/` (interface/scheduler layer)
- No domain imports from infrastructure
- `earningsCalendar.ts` is in `src/domain/services/financial-reports/` — change is DST fix (Task 1789, bundled commit), no layer violations

## Security: PASS
- No `process.env` usage — `Bun.env` only
- No hardcoded credentials or API keys
- SQL queries use parameterized form (bun:sqlite prepared statements)
- No path traversal vectors

## Key Formula Verification
- `fetchTopMovers` SQL (line 198): `(t.close - y.close) / y.close * 100.0`
  - `t` = today's daily_ohlcv row; `y` = previous session row (MAX date < today)
  - Formula is prev-close-to-close, NOT open-to-close
  - No reference to `open` column in change_pct computation
- `formatPct` (line 342): `if (pct == null) return "N/A"` — null guard confirmed

## Acceptance Criteria
- AC-1 PASS: VHM scenario — change_pct ≈ -4.01% (prev-to-close), not -8.69% (open-to-close)
- AC-2 PASS: Missing prev-close → change_pct null, no crash
- AC-3 PASS: Mover ranking by ABS uses prev-close reference (TICK_B +8% before TICK_A +5%)
- AC-4 PASS: formatFranceSummaryVI with null change_pct shows "N/A" in message

## Issues Found
### Blocking
None.
### Non-Blocking
- The branch also contains Task 1789 (getDeadlineForQuarter DST fix) as a bundled commit. Both changes are clean and unrelated. No conflict.

## Merge Status
Merged to main via: `merge(1785): france summary change_pct uses prev-close-to-close reference`
Branch `task/1785-france-summary-changepct` deleted after merge.
