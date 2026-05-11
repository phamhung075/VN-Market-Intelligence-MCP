# Task Report — 1328

**Task:** fix(test-timeout): 137-fix-alert-pipeline Step E — add DB_PATH=:memory: + inject getRecentAlertHistoryFn
**Sprint:** 105
**Branch:** task/1328-test-timeout-137
**Merged:** 2026-04-17
**QA verdict:** PASS

---

## Checklist Results

| Check | Result |
|-------|--------|
| `bun tsc --noEmit` | 0 errors |
| Test 137 — 19/19 pass | PASS |
| Test 137 runtime | 735ms (limit: 10s) |
| Line 1 = `process.env["DB_PATH"] = ":memory:"` | PASS |
| All 6 `runIntelligenceCycle` calls have `getRecentAlertHistoryFn: async () => []` | PASS |
| Production code changes | NONE (test file only) |
| DDD compliance (domain no infra imports) | PASS |
| Security scan (process.env in prod src) | PASS (test bootstrap only) |
| Full suite (4919 tests) | 4885 pass, 14 fail (all pre-existing) |

---

## Pre-existing Failures (not caused by this task)

| Test file | Failure count | Root cause |
|-----------|--------------|------------|
| 278-cycle-peer-sync.test.ts | 8 | 5s timeouts — pre-existing |
| 297-foreign-flow-fix.test.ts | 1 | SQLite UNIQUE constraint — pre-existing |
| 248-muasamcong.test.ts | 5 | Network error in mock — pre-existing |

None of the 14 failures touch test 137 or task 1328 code.

---

## Fix Summary

Two changes to `src/__tests__/137-fix-alert-pipeline.test.ts` only:

1. **Line 1:** `process.env["DB_PATH"] = ":memory:";` — forces in-memory DB before module imports, preventing production SQLite file access during Step E cycle calls
2. **All 6 `runIntelligenceCycle` calls:** added `getRecentAlertHistoryFn: async () => []` — bypasses `getCooldownDb()` real-DB fallback path inside the cycle

Impact: 4 x 30s timeout eliminated = ~120s saved per full suite run.

---

## Actions Taken

- Merged `task/1328-test-timeout-137` to `main` (no-ff)
- Deleted branch local + remote
- `launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp` — server healthy (toolCount: 98)
- TASKS.md: Sprint 105 → Complete
- Sprint 105 archived to `docs/archive/sprints-064-080.md`
- `docs/data/project-stats.json`: sprint 106, totalTasksDone 283
