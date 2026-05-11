# Task Report 1450_a — compact (RED phase)
date: 2026-04-18
outcome: APPROVED (RED phase verified)

changed: src/__tests__/1450-france-summary-vnindex.test.ts (new, 176 lines, 6 tests)

## Test Results
- 1450 file: 3 pass / 3 fail (expected)
- Full suite: 5494 pass / 3 fail / 21 skip
- Failing 3: ALL in describe "1450 (a)" — vnIndex present assertions
- Passing 3: (b1) sent=false guard, (c1) formatFranceSummaryVI null guard, (c2) runFranceSummary null guard
- Baseline delta: 5512 + 3 new pass - 3 new fail = 5512 non-failing; skips pre-existing
- tsc: not run (RED phase, no implementation files changed)

## RED Phase Verification
| Test | Group | Status | Reason correct |
|------|-------|--------|----------------|
| formatFranceSummaryVI renders VN-Index line | a1 | FAIL | fn not yet accepting vnIndex param |
| runFranceSummary with fetchVnIndexFn → VN-Index | a2 | FAIL | fetchVnIndexFn not yet wired |
| VN-Index block appears before movers | a3 | FAIL | formatting not implemented |
| sent=false when vnIndex null + no data | b1 | PASS | current silent-skip logic covers this |
| formatFranceSummaryVI omits VN-Index when null | c1 | PASS | current fn omits VN-Index (it doesn't render it at all yet) |
| runFranceSummary null fetchFn → no VN-Index in output | c2 | PASS | current fn never emits VN-Index |

## DDD Compliance: N/A (test-only change, smart-skip applied)
## Security: N/A (test-only change, smart-skip applied)

## Merge Status
DO NOT MERGE — RED phase. Branch task/1450-france-summary-vnindex stays open for GREEN implementation.
