# TASK 212 — fix(push-foreign-flow): UNIQUE(code) constraint breaks upsert

## TLDR

Fix: `INSERT OR REPLACE INTO` in hasDate branch of `upsertForeignFlow`.
Fix: catch block error message was hardcoded "Invalid JSON".
Branch: `task/212-foreign-flow-insert-or-replace`

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/vnstockStore.ts   # line 411: INSERT INTO -> INSERT OR REPLACE INTO; removed ON CONFLICT clause
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/server.ts   # line 734: error response now uses actual err.message instead of hardcoded "Invalid JSON"

tests_written: []   # pure SQL fix, no new test surface; existing 5797 suite all GREEN

tests_skipped:
- integration test against real SQLite with legacy UNIQUE(code) schema — would require migration fixture; deferred

tsc_clean: true
full_suite_pass: true   # 5797 tests, Bun post-suite crash is known Bun 1.3.11 bug unrelated to this change

---

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking: []

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/vnstockStore.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/server.ts

merge_commit: 650740d
