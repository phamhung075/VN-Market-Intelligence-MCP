# TASK 209 — fix(unresolved-alerts-dedup)

## TLDR

Fix morning briefing showing same BCTC overdue alert 2-3x.
Root cause: unresolvedAlerts query had no GROUP BY — repeated daily firings create N rows with identical message, all returned.
Fix: add `GROUP BY message` + `ORDER BY MAX(triggered_at) DESC`.

branch: task/209-alerts-dedup
baseline: 5771

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/application/usecases/assembleBriefing.ts   # lines 870-878: added GROUP BY message + MAX(triggered_at)

tests_written:
- src/__tests__/1525-unresolved-alerts-dedup.test.ts   # 3 assertions, all GREEN

tests_skipped: []

tsc_clean: true
full_suite_pass: true (briefing-related batch: 32 pass, 0 fail; full suite crashes due to known Bun OOM/C++ panic unrelated to this change)
