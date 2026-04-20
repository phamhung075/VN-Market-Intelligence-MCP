# TASK 198 — fix(schema): wire migrateForeignFlowColumns into initDatabase

## TLDR

branch: task/198-wire-foreign-flow-migration
change: add `await migrateForeignFlowColumns(db);` before closing brace of `initDatabase()`
file: src/infrastructure/db/schema.ts:1536
why: production daily_ohlcv missing 4 foreign flow columns -> foreignFlowMovers always []

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/schema.ts   # added await migrateForeignFlowColumns(db) at end of initDatabase()

tests_written: []   # no new test needed — function already idempotent + tested; wiring verified by tsc

tests_skipped: []

tsc_clean: true
full_suite_pass: true   # 5757 tests pass (baseline 5736, delta = pre-existing additions)

---

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking: []

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/schema.ts

merge_commit: 5aefcf4
