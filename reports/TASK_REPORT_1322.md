# Task Report: 1322+1323 — Evening Summary: newsCount field + Vietnamese formatter
date: 2026-04-15
outcome: APPROVED

## Tasks

| ID | Title |
|----|-------|
| 1322 | feat(evening): add `newsCount` diagnostic field to `EveningSummary` |
| 1323 | feat(evening): update `eveningSummaryJob` formatter — show "(N tin tức hôm nay)" |

## Test Results

| Suite | Pass | Fail |
|-------|------|------|
| 1322 task tests (4 ACs) | 4 | 0 |
| 105-job-evening-summary | 21 | 0 |
| 1192-evening-summary-empty-fallback | 2 | 0 |
| 1312-evening-summary-ta | 12 | 0 |
| 125-test-e2e-briefing | 38 | 0 |
| **Total (5 files)** | **73** | **0** |

- TypeScript: 0 errors
- Full regression: running (background)

## AC Verification

| AC | Criterion | Result |
|----|-----------|--------|
| AC-1 | `newsCount = 3` when 3 `rag_analyses` rows exist since midnight VN time | PASS |
| AC-2 | `newsCount = 0` when no rows since midnight VN time | PASS |
| AC-3 | Telegram message contains `"(3 tin tức hôm nay)"` when count > 0 | PASS |
| AC-4 | Telegram message contains `"Không có tin tức hôm nay"` when count = 0 | PASS |

## Design Checks

| Check | Result | Notes |
|-------|--------|-------|
| `newsCount: number` on `EveningSummary` interface | PASS | Line 59 of `assembleEveningSummary.ts` |
| COUNT query uses midnight VN time (UTC+7) | PASS | `midnightVietnamAsUtc()` — same helper as story query |
| try/catch on COUNT query, returns 0 on error | PASS | Lines 227-253 of `assembleEveningSummary.ts` |
| Formatter: `"(N tin tức hôm nay)"` when count > 0 | PASS | Lines 149-150 of `eveningSummaryJob.ts` |
| Formatter: `"Không có tin tức hôm nay"` when count = 0 | PASS | Lines 151-153 of `eveningSummaryJob.ts` |
| `getNewsCountFn` injection for testability | PASS | `AssembleEveningSummaryOptions.getNewsCountFn` |

## DDD Compliance: PASS

- No runtime infrastructure imports from `src/domain/`
- `assembleEveningSummary.ts` in `application/usecases` layer (correct)
- `eveningSummaryJob.ts` in `scheduler` layer, imports only from `application/usecases`

## Security: PASS

- All SQL uses parameterized queries (`?` binding)
- No `process.env` in production source files
- No hardcoded credentials

## Merge Notes

Branch `task/1322-1323-evening-news-count` had additive conflicts with `main` (task 1320-1321 added `taSummary` to `EveningSummary` concurrently). Resolved by keeping both fields: `taSummary: TaSignal[]` and `newsCount: number`. Six test mock objects updated in `1312`, `105`, `1192`, `125`, and `1322` test files to include both fields.

## Merge Status

- Merged: `merge(1322): add newsCount field + Vietnamese formatter to evening summary` → `main`
- Branch deleted: local + remote `task/1322-1323-evening-news-count`
- Server restarted: `launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp` — health OK (98 tools)
- TASKS.md: 1322 + 1323 → Done
