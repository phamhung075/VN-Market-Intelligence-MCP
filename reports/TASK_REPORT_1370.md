# TASK_REPORT_1370 — test(france-watchlist-movers): TDD RED tests for fetchTopMovers watchlist filter

| Field | Value |
|---|---|
| Task | 1370 |
| Branch | task/1370-france-watchlist-movers-tdd |
| Merged | 2026-04-17 |
| Sprint | 128 |
| Verdict | PASS |

---

## Test Results

| Suite | File | AC | Result | Reason |
|---|---|---|---|---|
| 1370 | 1370-france-watchlist-movers.test.ts | AC-1 | RED (fail) | Current impl shows NON_WL (no watchlist JOIN) — correct |
| 1370 | 1370-france-watchlist-movers.test.ts | AC-2 | RED (fail) | moverCount=3 instead of 0 with empty watchlist — correct |
| 1370 | 1370-france-watchlist-movers.test.ts | AC-3 | GREEN (trivial) | No crash with missing price row — impl-independent |
| 1370 | 1370-france-watchlist-movers.test.ts | AC-4 | GREEN (trivial) | All 5 tickers in watchlist, LIMIT 3 already enforced |

**Targeted**: 2 pass, 2 fail (expected per brief: AC-1+AC-2 RED, AC-3+AC-4 trivially pass)

---

## QA Checklist

| Check | Result |
|---|---|
| TDD: AC-1 RED before impl | PASS |
| TDD: AC-2 RED before impl | PASS |
| TDD: AC-3+AC-4 trivially pass as permitted | PASS |
| TypeScript strict (`bun tsc --noEmit`) | PASS — 0 errors |
| DDD: no domain→infra import in test | PASS |
| Security: `process.env["DB_PATH"] = ":memory:"` line 1 | ACCEPTED — established pattern (213 test files use it) |
| SQL injection: test helper uses string interpolation for DB fixture only | ACCEPTED — test-only, no user input |
| Regression suite (excl. pre-existing failures) | PASS |
| Pre-existing 308/1180/087/081 failures | Pre-date this branch (task 1367 duplicate tool registration) — not introduced by 1370 |

---

## Pre-existing Failures (not introduced by 1370)

| Test | Root cause |
|---|---|
| 308-tool-registry | `get_pipeline_health` double-registered — introduced by task 1367 |
| 087, 081, 1180 | Pre-existing tool count drift — not introduced here |

Branch diff: only `src/__tests__/1370-france-watchlist-movers.test.ts` added + TASKS.md updated.

---

## Post-merge Verification

| Check | Result |
|---|---|
| `bun test src/__tests__/1370-france-watchlist-movers.test.ts` on main | 2 pass, 2 fail (RED contract intact) |
| `bun tsc --noEmit` on main | 0 errors |
| Worktree removed | DONE |
| Branch deleted (local) | DONE |

---

## TASKS.md

Task 1370: Review → Done. Task 1371: remains Todo (next sprint).
