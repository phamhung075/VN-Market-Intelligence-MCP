# TASK_1302a — Create Domain Text Utils

**Sprint:** 1302
**Branch:** main
**Status:** Ready for QA

## TLDR

Move pure truncation logic to `src/domain/services/textUtils.ts`.
Export `truncateNewsSummary` (1000 graphemes), `truncatePolicySummary` (500 graphemes), `smartTruncate` helper.
Fix DDD boundary violation: truncation was only in infrastructure layer.

## Acceptance Criteria

- [x] textUtils.ts created, 2 public methods + helper
- [x] Tests pass (16 TCs covering 5 ACs, all GREEN)
- [x] `bun tsc --noEmit` clean
- [x] DDD check: `src/domain/services/textUtils.ts` has no imports from infrastructure/ ✓

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/index.ts   # added textUtils barrel export
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/textUtils.ts   # created: smartTruncate + truncateNewsSummary + truncatePolicySummary
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1302-text-utils.test.ts   # created: 16 tests across 5 ACs

tests_written:
- src/__tests__/1302-text-utils.test.ts   # 16 assertions, all GREEN

tests_skipped: []

tsc_clean: true
full_suite_pass: true   # baseline 6575 pass / 10 fail (pre-existing); our changes add 16 new passes, 0 regressions

---

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking: []

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/textUtils.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1302-text-utils.test.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/index.ts

merge_commit: n/a (branch = main, no merge needed)
