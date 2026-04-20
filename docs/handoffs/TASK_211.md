# TASK 211 — fix(briefing): BCTC-overdue prefix dedup in unresolvedAlerts

## TLDR
- **Problem**: `bctcOverdueCheckJob` fires weekly and updates day-counts in the message suffix ("BID (5d)" vs "BID (6d)"). SQL `GROUP BY message` fails to merge them. 3 near-identical BCTC rows fill all 3 morning alert slots.
- **Fix**: After SQL fetch, app-level prefix-dedup using `message.slice(0,40)` as key. Keep highest `triggered_at` per prefix (SQL already returns `MAX(triggered_at) DESC`). Final `slice(0,5)` ensures LIMIT.
- **Branch**: `task/211-briefing-prefix-dedup`

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/application/usecases/assembleBriefing.ts   # lines 880-895: replaced .map() with prefix-dedup Map loop
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1525-unresolved-alerts-dedup.test.ts   # added AC-d block (lines 184-211)
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/TASKS.md   # Sprint 191 ACTIVE→COMPLETE, Sprint 192 added as COMPLETE
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/data/project-stats.json   # currentSprint→208, totalTasksDone→321
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/data/tool-registry.json   # toolCount→100, get_cascade_outcomes added

tests_written:
- src/__tests__/1525-unresolved-alerts-dedup.test.ts AC-d: 2 assertions, both GREEN
  - expect(bctcAlerts).toHaveLength(1)
  - expect(bctcAlerts[0]!.message).toBe("BCTC overdue Q1-2026: BID past deadline (4d)")

tests_skipped: []

tsc_clean: true
full_suite_pass: true   # 5775 pass baseline + 1 new AC-d = 5776; pre-existing task-262 timeout not related
