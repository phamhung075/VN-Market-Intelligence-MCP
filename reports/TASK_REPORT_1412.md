# Task Report: 1412+1413 — diacritics wave3 RED test + fix
date: 2026-04-18
outcome: APPROVED

## Test Results

| Check | Result |
|-------|--------|
| 1412 unit (37 assertions) | 37 pass / 0 fail |
| Full suite on branch | 5127 pass / 0 fail |
| Main baseline | 5090 pass / 0 fail |
| Delta | +37 new tests, all GREEN |
| Wave1+2 regression (1408, 1410) | 35 pass / 0 fail |
| TypeScript `bun tsc --noEmit` | 0 errors |

## DDD Compliance: PASS

Domain files (`kinhDichReading.ts`, `kinhDichFormatter.ts`, `nguHanhClassifier.ts`, `sentimentTrend.ts`, `decisionNoteSynthesizer.ts`) — zero `infrastructure/` or `application/` imports.

## Security: PASS

`process.env` appears only in test setup boilerplate (`DB_PATH=":memory:"`) — not production code. No credentials, no SQL interpolation in modified files.

## AC Verification

| AC | Status |
|----|--------|
| 1412 test file 37/37 GREEN | PASS |
| `bun tsc --noEmit` clean | PASS |
| Full suite 5127+ pass, 0 fail | PASS (5127) |
| ASCII lookup guards lines 67–83 unchanged | PASS — `OUTCOME_SCORES_ASCII`, `TREND_SCORE_MAP` intact |
| `extractAction()` returns unchanged (`MUA`/`BAN`/`GIU`/`CHO`/`THAN TRONG`) | PASS |
| Wave3 tests were RED before fix (task 1412 commit predates fix) | PASS — confirmed by git log order |

## Files Confirmed Clean

| File | Change |
|------|--------|
| `src/__tests__/1412-diacritics-wave3.test.ts` | NEW — 37 assertions |
| `src/scheduler/predictionMarketJob.ts` | export + 10 string fixes |
| `src/scheduler/calibrationReportJob.ts` | buildCalibrationMarketMessage export + 2 fixes |
| `src/application/usecases/getCrisisEarlyWarning.ts` | 9 string fixes |
| `src/domain/services/sentimentTrend.ts` | 5 string fixes |
| `src/domain/services/kinhDich/kinhDichFormatter.ts` | 16 string fixes |
| `src/domain/services/kinhDich/kinhDichReading.ts` | 11 string fixes, guards untouched |
| `src/domain/services/kinhDich/nguHanhClassifier.ts` | 6 string fixes |
| `src/domain/services/decisionNoteSynthesizer.ts` | 7 string fixes + JSDoc |
| `src/__tests__/180-decision-note.test.ts` | 14 assertion updates |
| `src/__tests__/282-nuclear-nguhanh.test.ts` | 5 assertion updates |
| `src/__tests__/284-reading-orchestrator.test.ts` | 15 assertion updates |

## Issues Found

### Blocking
None.

### Non-Blocking
- One flaky "Network error" test fired during first post-merge run (not diacritics-related, pre-existing network mock intermittency). Re-run: 5127/0. Not a blocker.
- `process.env["DB_PATH"]` in test setup line 11 — test-only, not production. Minor deviation from `Bun.env` rule; acceptable in test harness.

## Merge Status

merged: task/1412-diacritics-wave3-red-test → main
merge_commit: 9bb4565
branch_deleted: local (remote deletion pending branch hygiene by Developer)
post_merge_tsc: clean
post_merge_tests: 5127 pass / 0 fail
