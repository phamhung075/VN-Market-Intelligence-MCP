# TASK-1382b Done Handoff

**Status:** COMPLETE
**Committed:** f6e49ff5
**Branch:** task/stale-tickers-fix
**Tests:** 7903 pass (baseline 7877 + 26 new)

---

## What Was Done

Wired `taAlertNotifierJob` to write `outcome='fired'` to `agent_signals` after dispatching a Telegram alert batch.

### Files Changed

- `apps/mcp-server/src/scheduler/market-data/taAlertNotifierJob.ts`
  - Added import: `import { recordOutcome } from '../../infrastructure/db/agentSignalStore.js'`
  - Added FR-5 block after the `notified_telegram=1` mark loop (~27 lines)
  - Query: `outcome IS NULL AND stock_code IN (batch codes) AND created_at >= datetime('now', '-4 hours') AND signal_type IN ('price_anomaly', 'urgent_news')`
  - Per-row try/catch with logger.warn on failure — resilient to individual row errors

- `apps/mcp-server/src/__tests__/1314-ta-alert-notifier.test.ts`
  - Added `agent_signals` DDL to `makeDb()` helper
  - Added `seedSignal()` helper
  - Added 4 new describe blocks covering AC-B1 through AC-B4

### Acceptance Criteria

- AC-B1: price_anomaly and urgent_news rows for dispatched tickers get `outcome='fired'` — PASS
- AC-B2: Rows with `outcome` already set are not overwritten — PASS (WHERE `outcome IS NULL`)
- AC-B3: Rows older than 4 hours are not touched — PASS (WHERE `created_at >= datetime('now', '-4 hours')`)
- AC-B4: `recordOutcome` not called when `sendFn` throws — PASS (guard: early return before FR-5 block)

### DDD Compliance

- Scheduler layer importing infrastructure layer — correct
- No imports from `application/` or `interface/`
- No new HTTP calls — DB-only

---

## For QA

Verify:
1. All 7903 tests pass on merge
2. AC-B1 through AC-B4 test cases in `1314-ta-alert-notifier.test.ts`
3. No regression in existing 24 AC-1 through AC-10 tests
