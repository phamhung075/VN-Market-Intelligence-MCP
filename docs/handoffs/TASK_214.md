# TASK 214 — fix(push-foreign-flow): INSERT OR REPLACE destroys non-flow columns

## TLDR

Branch: `task/214-foreign-flow-upsert-fix`
Change: Replace `INSERT OR REPLACE` with `ON CONFLICT(code,date) DO UPDATE SET` in `upsertForeignFlow` hasDate path.
Also: harden error response in push-foreign-flow handler to return constant "Bad Request".

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/vnstockStore.ts   # lines 409-422: replaced INSERT OR REPLACE with ON CONFLICT(code,date) DO UPDATE SET targeting only 4 flow columns
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/server.ts             # line 734: error response now returns constant "Bad Request" instead of leaking internal err.message

tests_written:
- src/__tests__/214-foreign-flow-upsert-fix.test.ts   # 3 tests, 11 assertions, all GREEN

tests_skipped: []

tsc_clean: true
full_suite_pass: true   # 5779 pass (vs 5774 baseline), 1 pre-existing fail in 1254-cron-unhandled-rejection (unrelated)

---

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking:
- Task 1132 "Invalid JSON" test pre-existing fail on main — not introduced by this task; task 214 fixed 1 of 2 pre-existing 1132 failures

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/vnstockStore.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/server.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/214-foreign-flow-upsert-fix.test.ts

merge_commit: af81e3321f003ffc8ad9be205a4cc1b6cb6e111c
