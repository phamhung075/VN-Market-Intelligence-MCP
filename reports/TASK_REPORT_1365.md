# Task Report: 1365 — feat(france-ta-detail): replace taCount with top-3 TA signal detail
date: 2026-04-17
outcome: APPROVED

## Summary

| Check | Result |
|---|---|
| Task tests (1364) — 5/5 | PASS |
| TypeScript `bun tsc --noEmit` | PASS (0 errors) |
| France + TA regression (68 tests) | PASS |
| Scheduler regression (36 tests) | PASS |
| DDD compliance | PASS |
| Security scan | PASS |

## Test Results

```
src/__tests__/1364-france-ta-detail.test.ts  5 pass / 0 fail (14 expect calls)
France+TA related (6 files)                 68 pass / 0 fail
Scheduler jobs (5 files)                    36 pass / 0 fail
```

## Acceptance Criteria

| AC | Status |
|---|---|
| AC-1: `formatFranceSummaryVI` with overbought signal → "VHM" + "qua mua" in message | PASS |
| AC-2: empty `taSignals` → "Khong co tin hieu ky thuat" | PASS |
| AC-3: DB with ≥8 daily_ohlcv rows → sent message includes ticker + RSI status | PASS |
| AC-4: empty daily_ohlcv → no crash, sends with "Khong co tin hieu ky thuat" | PASS |
| AC-5: `bun tsc --noEmit` 0 errors | PASS |

## DDD / Security

- `src/domain/` — zero imports from `infrastructure/` or `application/`: CLEAN
- `process.env` in non-test `src/` files: NONE (test-only DB_PATH isolation — acceptable)
- No hardcoded credentials or SQL string interpolation

## Implementation Notes

- `fetchTaSignalCount` (DB COUNT query) replaced by `fetchTaSignals` (watchlist × computeTaFn, per-ticker isolation)
- `TaSignalRow` interface exported for testability
- `computeTaFn` injected via `FranceSummaryOptions` — defaults to null (empty signals) when not provided; production caller wires real TA function
- `formatFranceSummaryVI` signature changed: `taCount: number` → `taSignals: TaSignalRow[] | number` with legacy-number fallback (no breaking change)
- Per-ticker try/catch inside `fetchTaSignals` — single ticker failure does not abort loop
- Sort by `abs(rsi14 - 50)` descending — most extreme RSI first, top 3 sliced
- Vietnamese labels: "qua mua" (overbought), "qua ban" (oversold), "gia tren MA20" / "gia duoi MA20"

## Files Changed

| File | Change |
|---|---|
| `src/scheduler/franceSummaryJob.ts` | Replace taCount with TaSignalRow[], add fetchTaSignals, formatFranceSummaryVI updated |
| `src/__tests__/1364-france-ta-detail.test.ts` | Minor fix (trailing newline) |
| `src/__tests__/1316-france-summary-rewrite.test.ts` | Updated taCount → taSignals assertions |
| `src/__tests__/1290-france-summary-job.test.ts` | Updated taCount → taSignals assertions |
| `src/scheduler/jobs.ts` | Import/wiring update |
| `TASKS.md` | Status update |
