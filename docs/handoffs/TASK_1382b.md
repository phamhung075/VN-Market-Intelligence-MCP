# TASK-1382b — Developer Handoff: Wire taAlertNotifierJob to Write 'fired' Outcome

**Sprint class:** SPRINT-S
**Created:** 2026-04-28
**By:** pm
**Depends on:** none (independent of 1382a)
**Required before:** 1382a (signalOutcomeJob reads 'fired' rows)

---

## Objective

After `taAlertNotifierJob` successfully dispatches a batch of alerts to Telegram, mark any matching `agent_signals` rows as `outcome='fired'`. This gives the daily resolver (1382a) a concrete starting state to upgrade to `confirmed`/`false_positive`.

---

## File to Modify

`apps/mcp-server/src/scheduler/market-data/taAlertNotifierJob.ts`

Net lines added: ~8

---

## Logic to Add

After the batch send loop (after `notified_telegram=1` mark), add a block that calls `recordOutcome` for `agent_signals` rows matching ALL of:

- `outcome IS NULL`
- `stock_code IN (batch tickers)`
- `created_at >= datetime('now', '-4 hours')`
- `signal_type IN ('price_anomaly', 'urgent_news')`

Use `recordOutcome(db, row.id, 'fired', 'dispatched by taAlertNotifierJob')` — already exported from `agentSignalStore.ts`.

Import: `import { recordOutcome } from '../../infrastructure/db/agentSignalStore.js'`

---

## DDD Compliance

- Scheduler layer calling infrastructure layer — correct
- No imports from `interface/` or `application/`
- No new HTTP calls — DB-only

---

## Acceptance Criteria

- AC-B1: After batch send, `agent_signals` rows for dispatched tickers with matching type and recency get `outcome='fired'`
- AC-B2: Rows with `outcome` already set (not NULL) are not touched
- AC-B3: Rows older than 4 hours are not touched
- AC-B4: `recordOutcome` is NOT called if the batch send itself failed (guard inside existing error path)

---

## Risk Note

This adds one DB query per batch (max 10 tickers) — trivial overhead (~1ms). No perf risk.

---

## Commit Format

```
task(1382b): wire taAlertNotifierJob to write 'fired' outcome on agent_signals

- after successful batch send, marks matching agent_signals rows outcome='fired'
- filters: outcome IS NULL, stock_code IN batch, created_at >= -4h, type IN (price_anomaly, urgent_news)
- uses existing recordOutcome() from agentSignalStore.ts
```
