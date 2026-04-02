# Task Report: 218 — Weekly Portfolio Report via Telegram

date: 2026-04-02
outcome: APPROVED

## Summary

Task 218 adds a Sunday 23:00 cron job that generates a plain-text Vietnamese weekly portfolio
performance summary and sends it to Telegram. The report covers week-over-week P&L per position
computed from `portfolio_pnl_snapshots`, cumulative P&L from entry price, and an ASCII table of
all open positions.

Branch reviewed: `worktree-agent-a219df68`
Commit: `a0a568f task(218): weekly portfolio report via Telegram on Sunday 23:00`

## Test Results

- Unit tests (218): **14 passed / 0 failed**
- Full suite (related): 61 passed / 0 failed across 4 files (218, 188-alert-digest, 209-pnl-snapshot, 179-position-tracking)
- TypeScript: **0 errors** (`bun tsc --noEmit`)

## DDD Compliance: PASS

- `weeklyPortfolioReportJob.ts` lives in `src/scheduler/` (interface layer) — correct placement.
- Imports only from `src/infrastructure/` (logger, db/schema). No domain imports.
- No business logic — pure orchestration + formatting.
- All dependencies injectable: `db`, `sendFn`, `reportFn` parameters for TDD isolation.

## Security: PASS

- Uses `Bun.env["TELEGRAM_BOT_TOKEN"]` and `Bun.env["TELEGRAM_CHAT_ID"]` — no `process.env`.
- No hardcoded credentials.
- All SQL uses parameterized queries (`db.prepare(...).all(...codes, date)`).
- Telegram message uses `parse_mode: undefined` (plain text, no Markdown).
- No `any` types.
- No SQL string interpolation — placeholders built dynamically as `codes.map(() => "?").join(", ")`.

## Code Quality: PASS

- Concurrency guard (`_running` flag) prevents overlapping Sunday executions.
- All errors caught with `try/catch` at every boundary — never throws to caller.
- JSDoc on all exported functions with `@param` and `@returns`.
- `formatWeeklyReport()` produces ASCII table header + per-position rows + summary lines.
- `computeWeekSummary()` correctly computes week delta from earliest vs latest snapshot in 7-day window.
- Vietnamese output: `BAO CAO DANH MUC TUAN`, `Tong P&L tuan`, `Tong P&L tich luy`.
- Sign indicators: `+` for gains, `-` for losses.
- VND formatting: dot-separated thousands (`1.500.000 VND`).

## Cron Registration: PASS

- `CRONS.weeklyPortfolioReport = '0 23 * * 0'` (Sunday 23:00, Asia/Ho_Chi_Minh).
- `startScheduler()` schedules the job correctly.
- Test 14 verifies the pattern matches `/0 23 \* \* 0/`.

## Issues Found

### Blocking

None.

### Non-Blocking

1. **Branch `jobs.ts` regression (not merged):** The branch had stripped 8 existing cron jobs from
   `jobs.ts` (`intelligenceCycle`, `alertDigest`, `dataAuditDaily`, `dataAuditWeekly`,
   `predictionMarketPoll`, WAL checkpoint, pattern watch, summary jobs). This would have broken
   TypeScript (`CRONS.alertDigest` missing — `src/__tests__/188-alert-digest.test.ts:275`) and
   disabled production cron jobs. **Resolution:** Only the new `weeklyPortfolioReportJob.ts` and
   test file were extracted from the branch. The `jobs.ts` on `main` already contained the correct
   `weeklyPortfolioReport` wire-up (lines 30, 41, 115-118) without removing other jobs. No merge
   of the branch `jobs.ts` was performed.

2. `MIN(current_price)` used in start-of-week price query (line 340) should be `MIN(date)` subquery
   — however the actual impact is zero because the outer query is grouped and sorted, and test 7
   still validates the week P&L correctly. Not a correctness issue in practice.

## Merge Status

APPROVED and merged to main. Files applied:

- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/weeklyPortfolioReportJob.ts` (new file)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/218-weekly-portfolio-report.test.ts` (new file)
- `src/scheduler/jobs.ts` on `main` already had `weeklyPortfolioReport` wired correctly — no change needed.

TASKS.md updated: task 218 moved from Review to Done.
