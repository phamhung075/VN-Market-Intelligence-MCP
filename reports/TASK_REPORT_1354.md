# Task Report: 1354 — test(prediction-signals-fallback): TDD tests for predictionSignals medium fallback
date: 2026-04-17
outcome: APPROVED

## Test Results
- Unit tests (1354): 0 passed / 6 failed — RED phase confirmed (expected, impl in task 1355)
- Full suite: 4936 passed / 6 failed (all 6 = task 1354 RED tests, no pre-existing regressions)
- TypeScript: 0 errors

## DDD Compliance: PASS
- domain/ has zero imports from infrastructure/ or application/ (comments only, no actual imports)
- Test file imports from application/ and infrastructure/ — correct layer for tests

## Security: PASS
- No hardcoded credentials
- `process.env["DB_PATH"] = ":memory:"` at line 1 — established project pattern for test isolation (see 1318, 1322, 1332)
- No HTTP, no Telegram sends, no SQL string interpolation

## Test Quality Assessment: PASS
| AC | Test | Verdict |
|----|------|---------|
| AC-1 | high+critical pass through, medium excluded, stored=3 | solid |
| AC-2 | medium fallback capped at 3 from 4, stored=4 | solid |
| AC-3 | empty signals → [], stored=0 | solid |
| AC-4 | mixed (2h+2m+1l) → only high, stored=5 | solid |
| AC-5a | fn throws → no crash, [], stored=0 | solid |
| AC-5b | fn throws → logger.warn contains "prediction" | solid |

- Injection pattern (getPredictionSignalsFn) avoids mock.module coupling — correct approach
- @ts-expect-error annotations properly mark TDD red-state type gaps for task 1355
- Per-test isolated tmp dirs with beforeEach/afterEach cleanup
- makeSignal() factory helper is clean and reusable
- All 6 tests fail for the correct reasons (missing getPredictionSignalsFn field, missing predictionDiag field, missing medium fallback logic)

## Issues Found
### Blocking
None.
### Non-Blocking
None.

## Merge Status
Merged to main. Task 1355 (implementation) is the next step.
