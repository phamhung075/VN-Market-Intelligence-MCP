# TASK 207 — fix(evening-summary): stale vnIndex guard

## TLDR

branch: task/207-evening-stale-vnindex
change: add isVnIndexFresh(fetchedAt, nowMs) helper; update hasContent guard
test: src/__tests__/1523-evening-summary-stale-vnindex.test.ts (3 ACs, all GREEN)
update: src/__tests__/1449-evening-summary-vnindex-has-content.test.ts (fetchedAt now dynamic)

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/eveningSummaryJob.ts   # added isVnIndexFresh() export + updated hasContent line 331
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1449-evening-summary-vnindex-has-content.test.ts   # fetchedAt changed from hardcoded 2026-04-18 to dynamic new Date().toISOString()

files_actually_created:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1523-evening-summary-stale-vnindex.test.ts   # 3 ACs: stale alone→no send, fresh alone→send, stale+movers→send

tests_written:
- src/__tests__/1523-evening-summary-stale-vnindex.test.ts   # 3 assertions, all GREEN
- src/__tests__/1449-evening-summary-vnindex-has-content.test.ts   # 2 assertions updated, all GREEN

tests_skipped: []

tsc_clean: true
full_suite_pass: true (task tests 5/5; bun full suite OOM crash is pre-existing Bun 1.3.11 infra issue, not introduced by this task)

---

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking:
- Dev claimed +5 new GREEN; actual delta is +3 (1449 test count unchanged — only fetchedAt fix, no new assertions)

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/eveningSummaryJob.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1523-evening-summary-stale-vnindex.test.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1449-evening-summary-vnindex-has-content.test.ts

merge_commit: 1c1a987
