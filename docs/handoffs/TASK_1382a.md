# TASK-1382a — Architect Handoff: Signal Outcome Tracking

**Sprint class:** SPRINT-S (≤30 lines changed, ≤5 files, 1 domain)
**Prepared:** 2026-04-28
**By:** architect

---

## Root Cause

Two completely separate systems handle signals — they share no FK:

| System | Table | Dispatch path | Outcome call |
|--------|-------|---------------|--------------|
| TA/BB alert scanner | `alerts` | `taAlertNotifierJob` sets `notified_telegram=1` | **never** |
| Agent signal bus | `agent_signals` | Alert Commander cowork agent | **never** (flow doc says to call it, agent ignores it) |

`recordOutcome()` in `agentSignalStore.ts` (infra layer) is fully implemented and updates `outcome`, `outcome_at`, `outcome_detail` on `agent_signals`. It is never called by any scheduler or job. The MCP tool `record_signal_outcome` is registered and tested in isolation but has zero callers in the automated pipeline.

The `alerts` table has no `signal_id` FK to `agent_signals`. These tables are permanently decoupled — wiring them together would require a schema migration and is out of scope for SPRINT-S.

**Scope decision:** Fix the agent signal bus only (`agent_signals` table). The TA/BB alerts-table path is a separate tracking system that is not broken — it records `notified_telegram` correctly. The 90% "unknown" outcome stat comes from `agent_signals` rows posted by News Scout, Market Watcher, etc. — those are what the effectiveness dashboard reads.

---

## What "Alert Resolution" Means Here

**Time-based.** The VN market closes 15:00 VN (08:00 UTC). Resolution is deterministic: check whether price moved in the predicted direction within 4 hours of signal creation.

Resolution logic:
- Signal type `urgent_news` / `price_anomaly` / `chain_catalyst` / `verified_chain` with a non-null `stock_code` → compare close price at `created_at` vs close price 4h later
- Price moved ≥ 1% in the predicted direction → `confirmed`
- Price moved ≥ 1% against the prediction → `false_positive`
- Price flat (< 1% move) → `confirmed` (no false alarm, signal stayed valid)
- Signal has no `stock_code` (market-wide) → skip, leave outcome NULL

Resolution runs **once daily at 08:30 UTC** (30 min after VN market close), targeting signals created during the prior trading day that still have `outcome IS NULL`.

This timing avoids racing against live market data and aligns with the existing `predictionResolution` job pattern (which runs at `30 16 * * *`).

---

## Files to Touch (5 files, ≤30 lines net)

### File 1 — NEW: `apps/mcp-server/src/scheduler/alerts/signalOutcomeJob.ts`

New scheduler job. ~25 lines of logic.

```
export interface SignalOutcomeJobDeps {
  db?: Database;
  nowFn?: () => Date;
}

export interface SignalOutcomeJobResult {
  evaluated: number;   // rows examined
  confirmed: number;
  false_positive: number;
  skipped: number;     // no stock_code or no price data
}

export async function runSignalOutcomeJob(
  deps?: SignalOutcomeJobDeps
): Promise<SignalOutcomeJobResult>
```

**Logic:**
1. Query `agent_signals` rows where `outcome IS NULL` AND `created_at >= datetime('now', '-2 days')` (2-day window catches weekend lag)
2. For each row with a non-null `stock_code`:
   - Query `market_prices_history`: average close price in a 30-min window around `created_at` (baseline) and in a 30-min window starting 4h after `created_at` (resolution)
   - If either price missing → skip (no data yet or weekend gap)
   - Compute `pct = (resolution - baseline) / baseline * 100`
   - Determine direction from `signal_type`:
     - `ta_overbought`, `price_anomaly` with payload.direction='down' → bearish expected (price should fall)
     - `ta_oversold`, `chain_catalyst`, `verified_chain`, `urgent_news` → bullish expected (price should rise)
     - Unknown direction → assume bullish (matches majority of signals)
   - If abs(pct) < 1.0 → `confirmed` (no harmful move)
   - If pct in expected direction ≥ 1.0 → `confirmed`
   - If pct against expected direction ≥ 1.0 → `false_positive`
3. Call `recordOutcome(db, row.id, outcome, detail)` — already exported from `agentSignalStore.ts`
4. Return summary counts

**DDD compliance:** Scheduler layer. Imports only from `infrastructure/db/`. No imports from `interface/` or `application/`.

---

### File 2 — MODIFY: `apps/mcp-server/src/scheduler/jobs.ts`

Add one CRON entry and one import.

```typescript
// Import (add near other alert job imports ~line 65):
import { runSignalOutcomeJobCron } from './alerts/signalOutcomeJob.js'

// In CRONS object (add after taAlertNotifier entry ~line 153):
/** signalOutcomeJob — resolve agent_signals outcomes daily at 08:30 UTC (task 1382) */
signalOutcomeJob: Bun.env.CRON_SIGNAL_OUTCOME_JOB ?? '30 8 * * 1-5',
```

Register the cron in the `registerJobs()` function body (pattern identical to `cascadeBacktest`):
```typescript
cron.schedule(CRONS.signalOutcomeJob, () => { runSignalOutcomeJobCron().catch(console.error); })
```

Net lines added: ~4

---

### File 3 — MODIFY: `apps/mcp-server/src/scheduler/market-data/taAlertNotifierJob.ts`

After successful send and `notified_telegram=1` mark, also record `"fired"` on any linked `agent_signals` rows for the same tickers.

**BUT:** There is no FK from `alerts` to `agent_signals`. The cost of joining these tables correctly exceeds SPRINT-S scope. The correct fix here is narrower:

After the batch send loop, call `recordOutcome` for any `agent_signals` rows that:
- Have `outcome IS NULL`
- Have `stock_code IN (batch tickers)`
- Have `created_at >= datetime('now', '-4 hours')`
- Are of type `price_anomaly` or `urgent_news`

This marks in-market signals as `fired` immediately on dispatch — the daily job then upgrades them to `confirmed`/`false_positive` after close.

Net lines added: ~8

**Risk:** This double-writes outcome — `fired` first, then the daily job may overwrite with `confirmed` / `false_positive`. This is intentional and correct: the 4-value enum is ordered (fired → confirmed/false_positive). The daily job must check `outcome = 'fired'` (not just `outcome IS NULL`) when selecting candidates to resolve.

Revise the daily job's WHERE clause:
```sql
WHERE (outcome IS NULL OR outcome = 'fired')
  AND created_at >= datetime('now', '-2 days')
```

---

### File 4 — MODIFY: `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts`

No change needed. `recordOutcome()` is already exported and correct. Do not touch.

---

### File 5 — NEW: `apps/mcp-server/src/__tests__/1382-signal-outcome-job.test.ts`

TDD unit tests. Pattern: in-memory DB with full `agent_signals` DDL (including outcome columns from schema-news.ts Task 244 migration).

**Required test cases:**

```
AC-1: No NULL-outcome signals → returns { evaluated:0, confirmed:0, false_positive:0, skipped:0 }
AC-2: Signal with no stock_code → skipped (outcome stays NULL)
AC-3: Signal with stock_code but no price history → skipped
AC-4: Price rose ≥1% for bullish signal → outcome='confirmed'
AC-5: Price fell ≥1% for bullish signal → outcome='false_positive'
AC-6: Price flat (<1% move) → outcome='confirmed'
AC-7: Signal already outcome='confirmed' → not re-evaluated
AC-8: Signal outcome='fired' → IS re-evaluated (upgraded by daily job)
AC-9: CRONS.signalOutcomeJob key present in jobs.ts
```

Use `deps` injection pattern (identical to `taAlertScanDeps`) for `db` and `nowFn`.

---

## What NOT to Do

- Do not add a `signal_id` FK column to the `alerts` table — schema migration risk, out of SPRINT-S scope
- Do not call `record_signal_outcome` MCP tool from within other MCP tools — that would be interface→interface, a DDD violation
- Do not add price-fetch HTTP calls inside the outcome job — use `market_prices_history` (already local SQLite, no network)
- Do not run the outcome job during market hours — it needs post-close data

---

## Outcome Enum Reference

`agent_signals.outcome` values (from `agentSignalStore.ts`):

| Value | Meaning | Set by |
|-------|---------|--------|
| `NULL` | Not yet resolved | (default) |
| `fired` | Signal dispatched to Telegram | taAlertNotifierJob (after this task) |
| `confirmed` | Price moved in predicted direction | signalOutcomeJob |
| `false_positive` | Price moved against prediction | signalOutcomeJob |
| `suppressed` | Signal filtered/not sent | Alert Commander (manual) |

---

## Test Strategy Summary

- Unit tests in `1382-signal-outcome-job.test.ts` — in-memory DB, injected deps, no HTTP
- No integration test needed (job is additive, no existing job modified in logic)
- Verify `CRONS.signalOutcomeJob` key present (AC-9 pattern from test 1314)
- Run full suite after: `bun test` — baseline currently 7865+ passing

---

## Risk Flags

1. **Weekend gap:** Signals created Friday 15:00 VN resolve Saturday — no price data. The 2-day window + skip-on-missing-price handles this correctly. Monday's job will still find them as `fired`/NULL and skip (no Saturday price data ever). These stay unresolved permanently. Acceptable — do not force-resolve stale signals.

2. **Direction inference from signal_type:** Some `urgent_news` signals are bearish (bad earnings). The payload may carry `direction` or `sentiment`. The job should check `payload_json` for a `direction` field before defaulting to bullish. Parser should be lenient — if payload unparseable, assume bullish.

3. **taAlertNotifierJob change:** The `fired` marking loop adds a DB query per batch. At max batch size 10 tickers, this is trivial (~1ms). No perf risk.

---

## Developer Checklist

- [ ] Create `signalOutcomeJob.ts` with `runSignalOutcomeJob()` + `runSignalOutcomeJobCron()` wrapper
- [ ] Add `CRONS.signalOutcomeJob` entry in `jobs.ts` and register cron
- [ ] Add `fired` marking in `taAlertNotifierJob.ts` after successful send
- [ ] Write `1382-signal-outcome-job.test.ts` (AC-1 through AC-9)
- [ ] Confirm `bun test` passes (all existing + new tests)
- [ ] Confirm `get_alert_accuracy` MCP tool returns non-zero confirmed count after manual test signal
