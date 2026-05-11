# Task Report: 1390 — GREEN fix: weekly-portfolio-filler
date: 2026-04-17
outcome: CHANGES_REQUESTED

## Test Results

| Scope | Pass | Fail |
|-------|------|------|
| Targeted (1389-weekly-portfolio-filler.test.ts) | 4 | 0 |
| Adjacent (218 + 1221 + 1389) | 17 | 6 |
| Full suite | not run (Bun OOM known) | — |
| TypeScript (`bun tsc --noEmit`) | 0 errors | — |

## DDD Compliance: PASS

`src/scheduler/weeklyPortfolioReportJob.ts` imports only from `infrastructure/`. No domain/ or application/ imports.

## Security: PASS

- No `process.env` (uses `Bun.env` via config)
- All SQL uses parameterized queries

## Issues Found

### Blocking

**B1** — `src/__tests__/218-weekly-portfolio-report.test.ts:144`
```
expect(result).toContain("BAO CAO")
```
Fails because 1390 Change 2 renamed header to `"BÁO CÁO DANH MỤC TUẦN (..."`. Old assertion checks unaccented string. Fix: update to `"BÁO CÁO"`.

**B2** — `src/__tests__/218-weekly-portfolio-report.test.ts:379`
```
expect(capturedMessage.length).toBeGreaterThan(0)
// comment: "Still sends a report (even with empty portfolio)"
```
Fails because 1390 Change 1 adds early return when `portfolioRows.length === 0`. The old test assumed send fires on empty portfolio — directly contradicts the new behavior specified in the handoff. Fix: update assertion to `expect(capturedMessage.length).toBe(0)` (or `expect(sendCalled).toBe(false)`), and update comment to reflect silent-skip behavior.

**B3** — `src/__tests__/1221-weekly-portfolio-db-lock.test.ts:82,98,115` (3 tests)
Tests "proceeds when stale lock / no lock / different job" all expect `sendCallCount === 1`. They use an empty positions DB (no rows inserted into `positions`). With 1390 Change 1, early return fires before send — `sendCallCount` stays 0.
Fix: seed at least one open position in each `buildDb()` call (or per-test), so the job reaches the send step.

### Non-Blocking

- Developer noted "Bun OOM crash on full run (known Bun 1.3.11 issue)" in handoff. Acceptable known issue — targeted + adjacent file runs sufficient for this task scope.
- `218` test 13 comment `"Still sends a report (even with empty portfolio)"` is now stale documentation regardless of fix approach.

## Merge Status

MERGED — cd55373

---

### Fix — 2026-04-17
- **Issue**: B1 — `218-weekly-portfolio-report.test.ts:144` toContain("BAO CAO") stale after diacritics rename
- **Root cause**: Test string not updated when production code changed header to "BÁO CÁO DANH MỤC TUẦN"
- **Fix**: `src/__tests__/218-weekly-portfolio-report.test.ts:144` — `"BAO CAO"` → `"BÁO CÁO"`
- **Tests added**: None
- **Verified**: `bun test` PASS | `bun tsc --noEmit` PASS

- **Issue**: B2 — `218-weekly-portfolio-report.test.ts:379` asserts send on empty portfolio
- **Root cause**: Test assumed old behavior (always sends); Change 1 added early return when `portfolioRows.length === 0`
- **Fix**: `src/__tests__/218-weekly-portfolio-report.test.ts:378-379` — updated comment + changed assertion to `toBe(0)`
- **Tests added**: None
- **Verified**: `bun test` PASS | `bun tsc --noEmit` PASS

- **Issue**: B3+B4 — `1221-weekly-portfolio-db-lock.test.ts:82,98,115,136` — 4 "proceeds" tests expect sendCallCount===1 but empty DB triggers early return
- **Root cause**: `buildDb()` seeds no rows in `positions`; Change 1 early return fires before send
- **Fix**: Seeded `INSERT INTO positions (code, shares, avg_price, closed_at) VALUES ('VCB', 100, 80000, NULL)` in each of the 4 "proceeds" tests
- **Tests added**: None
- **Verified**: `bun test` PASS | `bun tsc --noEmit` PASS

Developer must fix 3 test files before re-review:
1. `src/__tests__/218-weekly-portfolio-report.test.ts` — line 144 (assert `"BÁO CÁO"`) + line 379 (assert send NOT called on empty positions)
2. `src/__tests__/1221-weekly-portfolio-db-lock.test.ts` — seed ≥1 open position in the 3 "proceeds" tests (stale lock, no row, different job) so the job reaches the Telegram send step

---

## [QA] Review Record

verdict: CHANGES_REQUESTED
blocking_issues:
  - "src/__tests__/218-weekly-portfolio-report.test.ts:144 — toContain('BAO CAO') must be updated to 'BÁO CÁO'"
  - "src/__tests__/218-weekly-portfolio-report.test.ts:379 — assertion expects send on empty portfolio; contradicts Change 1 silent-skip. Update to expect no send."
  - "src/__tests__/1221-weekly-portfolio-db-lock.test.ts:82,98,115 — 3 tests expect sendCallCount===1 but empty positions DB triggers early return. Seed ≥1 open position in each test."
non_blocking:
  - "test 13 comment in 218 is stale — update doc string"

files_confirmed_clean:
  - /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/weeklyPortfolioReportJob.ts
  - /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1389-weekly-portfolio-filler.test.ts

merge_commit: not merged
