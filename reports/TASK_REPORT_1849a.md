# TASK REPORT — 1849a: Schema Migration + Store Functions

**Status:** COMPLETE
**Date:** 2026-05-07
**Owner:** dev-mcp-server

---

## AC Checklist

- [x] AC-1: Schema migration — 2 ALTER TABLE + 1 CREATE INDEX in schema-system.ts
- [x] AC-2: ResolutionStatus type (5 values: none/fixed/wontfix/duplicate/monitoring)
- [x] AC-3: All SELECT statements project all 10 columns (C-2 fixed)
- [x] AC-4: markResolved() implemented with parameterized query
- [x] AC-5: listUnresolvedReports() — excludes fixed/wontfix/duplicate + processed
- [x] AC-6: listResolvedReports() — includes fixed/wontfix/duplicate, optional limit
- [x] AC-7: 8 new test cases in 226-telegram-report-store.test.ts (37 total pass)
- [x] AC-8: 0 tsc errors, 0 test failures

---

## Files Modified

| File | Change |
|------|--------|
| `src/infrastructure/db/schema-system.ts` | Added 2 ALTER TABLE + CREATE INDEX (lines ~266-271) |
| `src/infrastructure/db/telegramReportStore.ts` | ResolutionStatus type, TelegramReport extended, 4 SELECT fixed, 3 new functions |
| `src/__tests__/226-telegram-report-store.test.ts` | 8 new test cases in Task 1849a describe block |

---

## Key Decisions

- C-1: ResolutionStatus has exactly 5 values — no "claimed"
- C-2: All 4 SELECT statements (listNewReports, listAllReports, getReport, listNewReportsUnclaimed) now project all 10 columns
- C-4: ALTER TABLE uses try/catch pattern (SQLite doesn't support IF NOT EXISTS on ALTER)
- listUnresolvedReports excludes both terminal resolutions AND status=processed rows
- listResolvedReports has two code paths (with/without LIMIT) to avoid LIMIT NULL in SQLite

---

## Test Results

```
37 pass, 0 fail
bun tsc --noEmit: 0 errors
```
