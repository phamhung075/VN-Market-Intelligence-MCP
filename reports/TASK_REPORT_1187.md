# Task Report — 1187: Fix pollNewsJob Dead Code Path

**Date:** 2026-04-14
**QA Agent:** QA / CI-CD
**Branch:** task/1187-pollnews-dead-path
**Status:** PASS — merged to main

---

## Summary

Task 1187 removed `newsPollerJob.ts` (a scheduler file that was never registered in
`jobs.ts`) and fixed `defaultPollNews()` in `intelligenceCycleJob.ts` to inject empty
stubs for the three VN geo-blocked fetchers (CafeF, VnExpress, VnEconomy). These sources
are delivered exclusively via POST /api/push-news from the Vinahost VPS. Calling them
directly from France produced circuit-breaker errors and `rows_written=0` on every
15-minute cycle. Reuters and Trading Economics (non-geo-blocked global sources) were
preserved with their real default fetchers.

---

## QA Checklist

### Step 1 — Branch checkout
PASS. Branch `task/1187-pollnews-dead-path` checked out cleanly.

### Step 2 — Task test suite (bun test src/__tests__/1187-pollnews-dead-path.test.ts)
PASS. 4/4 tests green, 0 failures.

- Test 1: `newsPollerJob.ts file is removed` — PASS
- Test 2: `pollNews geo-blocked VN fetchers return empty without network calls` — PASS
- Test 3: `intelligenceCycleJob calls pollNews with empty VN geo-blocked fetchers` — PASS
- Test 4: `jobs.ts does not reference newsPollerJob` — PASS

### Step 3 — Related existing tests
PASS. `102-job-news-poll.test.ts` (29 tests) and `1101-record-job-run-wrapper.test.ts`
both green after the newsPollerJob import references were removed.

### Step 4 — TypeScript strict check (bun tsc --noEmit)
PASS. 0 errors. Pre-push hook confirmed: `[pre-push] tsc OK`.

### Step 5 — DDD compliance
No violations introduced by this task. Pre-existing `import type` statements from domain
to infrastructure (in `intradayAnalyzer.ts`, `supplyChainAnalyzer.ts`,
`climateImpactMapper.ts`, `recencyWeighter.ts`) were present before this task and are not
in scope.

Files changed by task 1187:
- `src/scheduler/intelligenceCycleJob.ts` — no cross-layer violations added
- `src/scheduler/newsPollerJob.ts` — deleted
- `src/__tests__/1187-pollnews-dead-path.test.ts` — new test file
- `src/__tests__/102-job-news-poll.test.ts` — dead reference removed
- `src/__tests__/1101-record-job-run-wrapper.test.ts` — dead reference removed
- `TASKS.md` — status update

### Step 6 — Security scan (process.env)
PASS. All `process.env` hits are confined to test files. No production source code
uses `process.env` (uses `Bun.env` as required).

---

## Acceptance Criteria Verification

| Criterion | Result |
|-----------|--------|
| `newsPollerJob.ts` deleted | PASS — file absent from `src/scheduler/` |
| `intelligenceCycleJob.ts` `defaultPollNews()` injects empty stubs for cafef/vnexpress/vneconomy | PASS — lines 197-199 confirmed |
| Reuters and Trading Economics fetchers preserved (fall through to real defaults) | PASS — confirmed in `pollNews.ts` lines 325-329, not overridden |
| `jobs.ts` has no reference to `newsPollerJob` or `runNewsPoller` | PASS — grep returns empty |
| Test suite `1187-pollnews-dead-path.test.ts` passes | PASS — 4/4 green |

---

## Full Regression

The full `bun test` suite was run. Pre-existing failures were observed in tests unrelated
to task 1187 (tasks 172, 179, 1025, 1168, VPS proxy watchdog). None of these failures
appear in files modified by this task. Zero task-1187-related failures.

---

## Merge

```
git merge --no-ff task/1187-pollnews-dead-path
# TASKS.md conflict resolved: 1187 → Done, 1186 → Review preserved
git branch -d task/1187-pollnews-dead-path
git push origin --delete task/1187-pollnews-dead-path
```

Pre-push hook (`bun tsc --noEmit`) passed on remote delete.

---

## Verdict: PASS
