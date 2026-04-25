# Task Report: fix-bctc-ocr — BCTC OCR Fallback Hardening
date: 2026-04-24
outcome: APPROVED

## Test Results
- 048-ssc-pipeline: 10 pass / 0 fail
- 293-ocr-fallback-pipeline: 6 pass / 0 fail
- 1294b-bctc-fallback: 5 pass / 3 fail (RED 3/4/5 — pre-existing on main, see notes)
- Full suite: 6866 pass / 6 fail (matches main baseline)
- TypeScript: 0 errors

## DDD Compliance: PASS
application/ importing infrastructure/ is permitted (inward direction). No domain/ → infrastructure/ violations.

## Security: PASS
No process.env usage in modified files. No hardcoded credentials.

## Contamination Check
- telegram.ts: comment-only diff vs main (comment text on line 525 updated, actual coreSend("bug") call unchanged). No functional contamination.
- vpsProxyWatchdogJob.ts: identical to main. No diff.

## Merge Conflict Resolution
Conflict in fetchParseAndStoreBctc.ts:378 — extraction_method UPDATE stamping. Main version (try/catch + period.sortKey) kept over task branch inline version. Functionally equivalent; main's version is safer (error-guarded, uses computed sortKey variable).

## Notes on 1294b RED 3/4/5 Failures
Tests RED 3 (stale signals), RED 4 (contradictory signals), RED 5 (insufficient signals) each expect `result?.fallback === false` and `result?.reason` on the return value of `fetchParseAndStoreBctc`. The function signature returns `FinancialReport | null` — rejection cases return `null`, not a `{fallback, reason}` object. These 3 tests are pre-existing failures on main (1294b file exists on main with these tests). They represent unimplemented acceptance criteria for the rejection-reason surface, not regressions introduced by this fix. Fixer correctly identified them as out-of-scope for this branch.

Follow-up required: open a task to either extend the return type to surface rejection reasons to callers, or rescope the tests to verify `null` is returned (if surfacing rejection reason externally is not required).

## Issues Found
### Blocking
None.
### Non-Blocking
- fetchParseAndStoreBctc.ts — 1294b RED 3/4/5: 3 test cases verifying `result.fallback/reason` can never pass since the function returns `null | FinancialReport`. Requires follow-up task.

## Merge Status
Merged to main as commit 1e366b66. Branch task/fix-bctc-ocr deleted.
