# TASK_REPORT_1329 — DB isolation for 278-cycle-peer-sync test

| Field | Value |
|-------|-------|
| Task | 1329 |
| Branch | task/1329-test-timeout-278 |
| Merged | 2026-04-17 |
| Sprint | 106 (Complete) |
| Reviewer | QA agent |
| Result | PASS — merged to main |

---

## Checklist

| Check | Result | Detail |
|-------|--------|--------|
| `bun tsc --noEmit` | PASS | 0 errors |
| Target test: 278-cycle-peer-sync (10 tests) | PASS | 869ms total, well under 10s |
| Line 1 of test file = `process.env["DB_PATH"] = ":memory:"` | PASS | Confirmed |
| `buildBaseDeps()` includes `getRecentAlertHistoryFn: async () => []` | PASS | Line 39 |
| No production code changes | PASS | Only `src/__tests__/278-cycle-peer-sync.test.ts` changed |
| DDD compliance (domain/ no infra/app imports) | PASS | Comments only, no actual imports |
| Security scan (no `process.env` in src/) | PASS | Only test files (established pattern) |
| Full regression (4919 tests) | PASS | 4894 pass, 5 fail — all 5 pre-exist on main |

---

## Pre-existing failures (not introduced by 1329)

| Test file | Failure | Pre-exists on main |
|-----------|---------|-------------------|
| 296-ocr-pipeline-e2e.test.ts | OCR e2e timeout (460s) | Yes |
| 1227-source-health-empty-result.test.ts (x2) | Reuters RSS global state | Yes |
| 1168-market-digest.test.ts | Flaky (passes in isolation) | Yes |
| 297-foreign-flow-fix.test.ts | Flaky (passes in isolation) | Yes |

---

## Root cause fixed

Before: 278-cycle-peer-sync.test.ts lacked `process.env["DB_PATH"] = ":memory:"` and `getRecentAlertHistoryFn` in `buildBaseDeps()`. Tests hit the production DB and waited 5s per timeout for `getRecentAlertHistory`, accumulating 50s total.

After: In-memory DB + stub function injected. All 10 tests complete in under 1 second each.

---

## Post-merge

- Branch `task/1329-test-timeout-278` deleted local + remote
- `launchctl kickstart -k` — server healthy (`toolCount: 98`, `status: ok`)
- TASKS.md: Sprint 106 Complete
- `docs/data/project-stats.json`: sprint 107, totalTasksDone 284
