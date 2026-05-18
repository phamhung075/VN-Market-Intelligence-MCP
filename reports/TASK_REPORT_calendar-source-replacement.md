## Task Report calendar-source-replacement
date: 2026-05-18
outcome: APPROVED
type: FIX / WONTFIX (infrastructure layer — NullCalendarAdapter replacing dead InvestingCalendarAdapter)
round: 1

changed:
- apps/macro-indicators/src/infrastructure/scrapers/investing-economic-calendar.ts
- apps/macro-indicators/src/application/fetch-external-macro.ts (DEFAULT_TIMEOUTS.calendar: 5000 → 0)
- apps/macro-indicators/src/index.ts (wire NullCalendarAdapter, idleTimeout: 120 → 90)
- apps/macro-indicators/__tests__/unit/scrapers/investing-economic-calendar.test.ts (4 new tests)
- apps/macro-indicators/__tests__/unit/fetch-external-macro.test.ts (calendar block updated)

tests: 4 new GREEN / 14 pass (fetch-external-macro) / 103 pass total in macro-indicators suite
1 pre-existing fail (trading-economics-vn VN_TE_SLUGS length: confirmed on main before task)
tsc: pre-existing errors in adb-kidb, fred-macro, imf-weo, world-bank-macro test files (confirmed on main, not introduced by this task). My files: type-clean.
ddd: PASS — NullCalendarAdapter in infrastructure/, wires via index.ts (composition root), no domain→infra violations
security: PASS — no process.env introduced, no hardcoded secrets, no SQL (adapter returns [] immediately)

merge commit: chore(macro-indicators): merge task/calendar-source-replacement — wontfix NullCalendarAdapter
