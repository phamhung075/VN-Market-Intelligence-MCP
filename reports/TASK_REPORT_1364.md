# Task Report: 1364 — test(france-ta-detail): TDD tests for TA signal detail in France briefing
date: 2026-04-17
outcome: APPROVED

## Test Results

| Scope | Pass | Fail | Notes |
|---|---|---|---|
| Task tests (1364) | 0 | 5 | ALL RED — expected for TDD phase |
| Full suite | 4980 | 6 | 5 are task-1364 (expected RED); 1 is pre-existing OCR e2e timeout (unrelated) |
| TypeScript | 0 errors | — | `bun tsc --noEmit` clean |

## TDD Compliance: PASS

- Test file: `src/__tests__/1364-france-ta-detail.test.ts` — 259 lines, 5 tests
- Written before implementation (single commit `068e539`, no implementation changes)
- All 5 ACs covered: AC-1 overbought label, AC-2 empty fallback, AC-3 computeTaFn injection, AC-4 null computeTaFn graceful handling, AC-4b result shape (taSignals is array not number)
- Tests are meaningful — assert specific Vietnamese strings, array structure, injection behaviour
- Edge cases covered: empty taSignals, null computeTaFn, result type shape

## DDD Compliance: PASS

- No actual imports from `infrastructure/` or `application/` in `src/domain/`
- Test file imports only from `src/scheduler/` — correct layer

## Security: PASS

- No hardcoded credentials
- `process.env["DB_PATH"] = ":memory:"` on line 1 is established test-bootstrap pattern (present in 380+ test files); not a production code violation
- No SQL in test (DB seeded via `db.exec` with literals, no user input)

## Issues Found

### Blocking
None.

### Non-Blocking
- `process.env` in test line 1 — acceptable test-bootstrap idiom; consistent with all other test files in suite

## Forward contract for task 1365

Task 1365 (Dev) must implement:
1. `TaSignalRow` interface exported from `franceSummaryJob.ts`
2. `formatFranceSummaryVI` 4th arg changes from `taCount: number` to `taSignals: TaSignalRow[]`
3. `FranceSummaryOptions.computeTaFn` injectable dependency
4. `FranceSummaryResult.taSignals: TaSignalRow[]` replaces `taCount: number`
5. Vietnamese labels: "qua mua" (overbought), "qua ban" (oversold), "tren MA20" / "duoi MA20"
6. Empty fallback text: "Khong co tin hieu ky thuat"

## Merge Status

APPROVED — merged to main.
