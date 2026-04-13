# Task Report — Task 1165: Modify sendTelegramMarket() persist option + 10 call site migrations

> **Branch**: `task/1163-market-message-review`
> **Date reviewed**: 2026-04-13
> **Final status**: APPROVED
> **DDD layer**: infrastructure / scheduler / interface

---

## Kanban Movement

| Column | Date | Notes |
|--------|------|-------|
| Backlog → Todo | 2026-04-13 | 1164 dependency cleared |
| Todo → In Progress | 2026-04-13 | Assigned to Developer |
| In Progress → Review | 2026-04-13 | Developer submitted |
| Review → Done | 2026-04-13 | QA approved — merge pending Task 1166 + 1167 completion |

---

## Role Activity Log

### PM (Project Manager)
- Task scope: extend `sendTelegramMarket()` with optional `persist` field + migrate 10 call sites to pass `from_agent` / `message_type` / `ticker` metadata
- Dependencies: Task 1164 (marketMessageStore.ts and schema DDL)
- Files to modify: `telegram.ts`, `morningBriefingJob.ts`, `eveningSummaryJob.ts`, `franceSummaryJob.ts`, `patternWatchJob.ts`, `calibrationReportJob.ts`, `weeklyPortfolioReportJob.ts`, `weatherCheckJob.ts`, `telegramTools.ts`, `server.ts`

### Developer
- Files modified:
  - `src/infrastructure/notifiers/telegram.ts` — added `persist` field to `SendTelegramOptions`, post-send DB block in `sendTelegramMarket()`, updated `sendTelegram()` alias, updated `notifyTelegramAlert()`, updated `TelegramNotifier` interface
  - `src/scheduler/morningBriefingJob.ts` — direct `insertMarketMessage` call before chunk loop (full-text-before-split pattern)
  - `src/scheduler/eveningSummaryJob.ts` — added `persist` to `sendTelegramMarket` call
  - `src/scheduler/franceSummaryJob.ts` — added `persist` in dynamic import wrapper
  - `src/scheduler/patternWatchJob.ts` — ticker extraction via `/\b([A-Z]{2,4})\b/` before send, `persist` with extracted ticker
  - `src/scheduler/calibrationReportJob.ts` — `persist` added ONLY to MARKET path (`sendMarket`); WORK path (`sendTelegramWork`) left untouched
  - `src/scheduler/weeklyPortfolioReportJob.ts` — added `persist` to `sendTelegramMarket` call
  - `src/scheduler/weatherCheckJob.ts` — added `persist` to `sendTelegramMarket` call
  - `src/interface/mcp/tools/telegramTools.ts` — added `persist` to `market` branch only
  - `src/interface/mcp/server.ts` — added `persist` to three call sites (~318, ~562, ~599)
- Files created (ahead of Task 1166 scope):
  - `src/interface/mcp/tools/marketMessageTools.ts` — handler functions exported for test access (partial Task 1166 work; registry.ts not yet updated, which is correct for Task 1165 scope)
- TDD cycle followed: YES — test commit (fc53049) precedes all implementation commits
- Tests: `src/__tests__/1163-market-message-review.test.ts`, 36 tests total (all 36 currently green including MCP tool handler tests)
- Commit order: 1163 (red) → 1164 (schema + store green) → 1165 (telegram + call sites green)

### QA — Review 1
- Date: 2026-04-13
- Outcome: APPROVED
- `bun test src/__tests__/1163-market-message-review.test.ts`: PASS — 36/36 tests, 92 expect() calls
- `bun tsc --noEmit`: PASS — 0 errors
- `bun test` (full suite): Ran 4158 tests across 280 files — 0 failures (Bun 1.3.11 post-run GC crash is a known Bun runtime bug unrelated to user code)
- Issues found: 0 blocking, 1 non-blocking

---

## Test Results

```
bun test src/__tests__/1163-market-message-review.test.ts

  36 pass
  0 fail
  92 expect() calls
  Ran 36 tests across 1 file. [613.00ms]
```

Test groups verified:
- Groups 1-7 (schema + store): market_messages table DDL, insertMarketMessage, getUnreviewedMarketMessages (ordering, ticker filter, empty state), reviewMarketMessage (success, idempotent, unknown id, invalid verdict)
- Groups 8-12 (telegram persist): sendTelegramMarket on success inserts row, on failure no row, backward compat (no persist = "unknown" defaults)
- Groups 13-19 (MCP tool handlers): all green — handler functions exported from marketMessageTools.ts for direct test access

**Coverage notes**: `marketMessageStore.ts` at 100% function / 98% line coverage. `telegram.ts` at 41%/36% — acceptable for a file with many untested legacy paths not in scope for this task.

---

## Issues Discovered During Review

### BLOCKING Issues

None.

---

### NON-BLOCKING Issues

#### Issue 1165-NB-01

- **Type**: Pre-existing security pattern
- **File**: `src/infrastructure/db/schema.ts:64` and `:550`
- **Description**: `process.env["DB_PATH"]` is used alongside `Bun.env["DB_PATH"]` in `getDb()` and `closeDb()`. This `process.env` usage predates Sprint 068 and is intentionally present for test isolation (the test file sets `process.env["DB_PATH"] = ":memory:"` before module import, which Bun.env cannot intercept in that timing). This is a known and accepted pattern in this codebase.
- **Fix applied**: Not fixed — pre-existing, out-of-scope for Task 1165. Deferred to a future cleanup sprint if Bun adds a pre-import env override mechanism.

#### Issue 1165-NB-02

- **Type**: Forward scope delivery
- **File**: `src/interface/mcp/tools/marketMessageTools.ts`
- **Description**: The developer implemented `handleGetUnreviewedMarketMessages` and `handleReviewMarketMessage` (handler functions) within Task 1165's commit, which is technically Task 1166 work. However, `registry.ts` was NOT updated — the tools are not yet registered on the MCP server. Tests 13-19 (MCP tool handler tests) pass because they call the exported handler functions directly, not via the server's tool dispatch.
- **Impact**: None for Task 1165. The tools are inert until `registerMarketMessageTools` is added to `registry.ts` in Task 1166.
- **Fix applied**: No fix needed. Task 1166 will add the registry entry. This is non-blocking.

---

## Security Report

| # | Category | Description | Risk | Mitigation |
|---|----------|-------------|------|------------|
| 1 | SQL parameterization | `insertMarketMessage`, `getUnreviewedMarketMessages`, `reviewMarketMessage` | None | All queries use `?` positional placeholders via `db.prepare(...).run(...)` / `.all(...)` — no string interpolation |
| 2 | process.env usage | `schema.ts:64,550` use `process.env["DB_PATH"]` | Low | Pre-existing pattern for test isolation; Bun.env used for all production secrets; `DB_PATH` is not a secret — it is a file path |
| 3 | any types | New/modified files in Task 1165 | None | Zero `any` types in `marketMessageStore.ts`, `telegram.ts` new sections, `marketMessageTools.ts` |
| 4 | Secrets in source | telegram.ts, call site files | None | All Telegram credentials read via `Bun.env` — no hardcoded values |

**Security verdict**: CLEAN

---

## Acceptance Criteria Sign-off

| Criterion | Status | Notes |
|-----------|--------|-------|
| `sendTelegramMarket()` has optional `persist` field on `SendTelegramOptions` | PASS | Interface extended backward-compatibly |
| Post-send DB block calls `insertMarketMessage` only when `result.ok === true` | PASS | Verified in `telegram.ts` lines 247-261 |
| DB failure in persist block does not change return value | PASS | Wrapped in try/catch; `result.ok` returned regardless |
| `sendTelegram()` alias passes `alert-digest` / `alert_digest` persist metadata | PASS | `telegram.ts` line 495-499 |
| `notifyTelegramAlert()` passes `alert-commander` / `alert` / `alert.actionCode` ticker | PASS | `telegram.ts` lines 468-477 |
| `morningBriefingJob.ts`: full text inserted once before chunk loop | PASS | Lines 256-265; chunk loop sends without `persist` |
| `eveningSummaryJob.ts`: `persist` with `evening-summary` / `evening_summary` | PASS | Line 118-120 |
| `franceSummaryJob.ts`: `persist` with `france-summary` / `france_summary` | PASS | Lines 131-134 (dynamic import wrapper) |
| `patternWatchJob.ts`: ticker extracted via regex, `persist` with `pattern-watch` / `pattern_watch` | PASS | Lines 113-118 |
| `calibrationReportJob.ts`: `persist` on MARKET path only, WORK path untouched | PASS | Lines 367-372; `sendTelegramWork` call at line 361 unchanged |
| `weeklyPortfolioReportJob.ts`: `persist` with `weekly-portfolio` / `weekly_portfolio` | PASS | Lines 288-291 |
| `weatherCheckJob.ts`: `persist` with `weather-check` / `weather` | PASS | Lines 164-166 |
| `telegramTools.ts`: `persist` on `market` branch only | PASS | Lines 52-55 |
| `server.ts`: `persist` at three call sites (~318, ~562, ~599) | PASS | All three sites confirmed |
| Backward compatibility: callers without `persist` compile and run unchanged | PASS | AC-11 test passes; `persist` is fully optional |
| `bun test src/__tests__/1163-market-message-review.test.ts`: 36/36 | PASS | Confirmed |
| `bun tsc --noEmit`: 0 errors | PASS | Confirmed |
| Full `bun test`: no regressions | PASS | 4158 tests across 280 files — 0 failures |

---

## Merge Summary

Task 1165 is approved for merge as part of the final branch merge after Tasks 1166 and 1167 complete (all five tasks share the `task/1163-market-message-review` branch).

- Key commit: `1a10b7a task(1165): add persist option to sendTelegramMarket + migrate 10 call sites`
- Files changed in Task 1165 commit: `telegram.ts` + 8 scheduler files + 2 interface files
- Tests added: 0 net new (tests were written in Task 1163; 36 tests now green for first time in Task 1165)
- Type errors at review: 0

---

## Notes for Next Tasks

- Task 1166 must add `registerMarketMessageTools` to `registry.ts` — the handler functions are already implemented in `marketMessageTools.ts`; the only remaining step is the import + array entry in `src/interface/mcp/tools/registry.ts`
- Task 1167 can update `docs/data/project-stats.json` `currentSprint` to 68 after Task 1166 is complete
- The `morningBriefingJob.ts` chunking pattern (insertMarketMessage before chunk loop) is the reference implementation for any future scheduler jobs that use multi-chunk sends
- Known tech debt deferred: `process.env["DB_PATH"]` in `schema.ts` — acceptable test isolation pattern
