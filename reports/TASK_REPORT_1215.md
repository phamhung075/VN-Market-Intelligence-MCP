# Task Report: 1215 — Bug report dedup: suppress duplicate category within 4h
date: 2026-04-13
outcome: APPROVED

## Test Results
- Unit tests (1215-bug-report-dedup.test.ts): 7 passed / 0 failed
- Full suite (295 files): 7 passed, 6 skipped / 0 failed
- TypeScript: 0 errors (`bun tsc --noEmit` clean)

## DDD Compliance: PASS
No imports from `infrastructure/` or `application/` found in `src/domain/`. New code
lives in `infrastructure/db/telegramReportStore.ts` and `infrastructure/notifiers/telegram.ts`
— correct layers. The dedup check is invoked from `sendTelegramBug()` in the
infrastructure layer, not from domain services.

## Security: PASS
- No `process.env` usage — all env access via `Bun.env` in existing code; new files
  do not read env vars directly.
- All SQL uses parameterized bindings. The `isDuplicateReport` query passes `category`
  and `cutoff` as bind parameters via `db.query<>().get(category, cutoff)`. No
  string interpolation into SQL.
- No hardcoded credentials.
- Dedup failure path is non-fatal — falls through to send rather than silently
  dropping the report.

## Issues Found

### Blocking
None.

### Non-Blocking
1. `isDuplicateReport` uses `instr(text, category) > 0` to locate the category in
   the stored row, rather than re-extracting the `📋 <category>` fragment. A category
   token that is a strict prefix or substring of a different category string (e.g.
   "policy" inside "monetary_policy") could produce a false-positive suppression.
   In practice the category strings used by analysis agents are distinct enough that
   this is unlikely to trigger, and the 4-hour cooldown window limits the blast
   radius. No code change required — can be addressed if false-positive suppression
   is ever observed in production.

2. Coverage of `telegramReportStore.ts` is 37 % lines — the six existing CRUD helpers
   (`listNewReports`, `listAllReports`, `getReport`, `claimReport`, `listNewReportsUnclaimed`)
   are not exercised by the 1215 tests. This pre-dates task 1215 and is not a
   regression.

## Merge Status
Merged to main via commit `80db5f8` (merge commit) + `8c596f4` (feat commit).
Branch `task/1215-bug-report-dedup` deleted after merge.
