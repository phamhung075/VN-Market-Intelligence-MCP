# TASK 1920i — Extend freshnessSlaMonitor to cover all wired tables

**Sprint:** 1920 | **Tier:** 4 | **Type:** FEATURE | **Zone:** apps/mcp-server/ | **Size:** M
**DDD Layer:** domain (SLA checker) + infrastructure/db + scheduler
**Owner:** dev-mcp-server
**Status:** Ready for Dev (sequenced LAST — depends on 1920a/b/c/d/e/f/g landing)

---

## Context

`freshnessSlaMonitorJob.ts` currently monitors exactly 5 signal types via a hard-coded UNION ALL query:
`price`, `bctc`, `news`, `sbv_fx`, `foreign_flow`.

The domain checker `freshnessSlaChecker.ts` uses a `SignalType` union type and a hard-coded SLA threshold map for those 5 types.

After Sprint 1920 tasks 1920a–g land, the following tables become actively written:
- `vnstock_financials`, `vnstock_balance_sheet`, `vnstock_cash_flow`, `vnstock_events`, `vnstock_officers`, `vnstock_shareholders`, `vnstock_trading_stats` (1920a)
- `bond_maturity` (1920b)
- `commodity_prices`, `commodity_prices_history` (1920c)
- `broker_sanctions` (1920d)
- `backtest_runs` (1920e)
- `signal_quality_audit` (1920f)
- `prediction_claims` (1920g)

Sprint 1920 success metric AC-2: `coverage_pct >= 95%` of declared tables. Currently ~5 monitored / ~50+ declared = ~10%. After this task: all newly-wired tables get SLA entries.

---

## Scope

Only tables with **active scheduler writers** after 1920a–g. Tables formally deprecated (1920h: `user_requests`, `skips`) are explicitly excluded. Tables that are read-only at scheduler layer (e.g., `daily_ohlcv` written by stock-price microservice) should be included if they have a freshness SLA.

---

## Requirements

### FR-1 — Extend SignalType union in freshnessSlaChecker.ts
**DDD layer:** domain

Add new signal types to the `SignalType` union and to the `SLA_THRESHOLDS` map:

| Signal type | Source table | Column | SLA threshold |
|---|---|---|---|
| `vnstock_fundamentals` | `vnstock_financials` | `updated_at` | 72h (quarterly data; SLA = 3 days after dispatch) |
| `bond_maturity` | `bond_maturity` | `updated_at` or `created_at` | 168h (weekly; SLA = 7 days) |
| `commodity_prices` | `commodity_prices` | `fetched_at` | 36h (daily cadence; 1.5x window) |
| `broker_sanctions` | `broker_sanctions` | `created_at` | 2160h (quarterly; 90 days) |
| `backtest_runs` | `backtest_runs` | `run_at` | 36h (daily job; 1.5x window) |
| `signal_quality_audit` | `signal_quality_audit` | `created_at` | 48h (event-driven; tolerate quiet periods) |
| `prediction_claims` | `prediction_claims` | `created_at` | 168h (weekly minimum) |

### FR-2 — Extend querySignalAges with new UNION ALL entries
**DDD layer:** infrastructure/db

Add one UNION ALL entry per new signal type in `freshnessSlaMonitorJob.ts:querySignalAges()`. Pattern mirrors existing 5 entries.

Example for `commodity_prices`:
```sql
UNION ALL
SELECT
  'commodity_prices' as signal_type,
  CAST((? - CAST(strftime('%s', (SELECT MAX(fetched_at) FROM commodity_prices)) AS INTEGER)) / 60 AS INTEGER) as age_minutes
```

For tables using `created_at` (TEXT ISO 8601, not epoch):
```sql
CAST((? - CAST(strftime('%s', (SELECT MAX(created_at) FROM prediction_claims)) AS INTEGER)) / 60 AS INTEGER)
```

Handle NULL (table has zero rows): SQLite `MAX()` of empty table returns NULL. `strftime('%s', NULL) = NULL`. The age calculation would return NULL, not an integer. The CAST would yield NULL. The query result row would have `age_minutes = NULL`. Guard in `querySignalAges`: if `age_minutes IS NULL`, treat as `999999` (always-stale sentinel) — not a breach alarm unless table is expected to have rows. See FR-4 for null guard.

### FR-3 — coverage_pct calculation and WORK channel report
**DDD layer:** application/scheduler

After running all SLA checks, compute:
```
coverage_pct = (count of monitored signal types) / (count of all declared schema tables with writers)
```

For Sprint 1920, the target is declared tables with active writers. Developer to enumerate the count of monitored types after this task lands.

Add to `sendWorkFn` call in `freshnessSlaMonitorJob`:
```
[freshness-sla] coverage=NN/MM tables (XX%)
```

This satisfies AC-2 of Sprint 1920.

### FR-4 — Null age guard for zero-row tables
**DDD layer:** infrastructure

In `querySignalAges()`, if any result row has `age_minutes IS NULL` (table has zero rows), substitute a configurable "not-yet-seeded" sentinel:
- Return `age_minutes = -1` for zero-row tables.
- In `freshnessSlaChecker.ts`, treat `age_minutes === -1` as "not seeded yet" — DO NOT raise a breach alert. Log at DEBUG level only.

This prevents false breach alerts on day-1 before any data is loaded (e.g., `bond_maturity` zero rows before first weekly poll).

### FR-5 — WORK channel format update
**DDD layer:** interface/scheduler

Current WORK output: breach alert only when SLA exceeded.
New WORK output: add a daily "coverage snapshot" summary (once per day at first freshnessSlaMonitor run after midnight UTC):
```
[freshness-sla] daily coverage snapshot
  price: 5m | bctc: 3h | news: 12m | sbv_fx: 2h | foreign_flow: 4h
  commodity_prices: 8h | vnstock_fundamentals: 18h | bond_maturity: not-seeded
  backtest_runs: 14h | signal_quality_audit: 2h | prediction_claims: 6h
  broker_sanctions: not-seeded
  coverage: 10/12 tables (83%)
```

Gate the summary to once-per-day (track `_lastSummaryDate` module-level string, same pattern as `_lastSscScanDate` in intelligenceCycleJob).

---

## Acceptance Criteria

- AC-1: `querySignalAges` returns ≥12 signal type entries (5 existing + 7 new) after this task.
- AC-2: `coverage_pct` reported in WORK daily snapshot is ≥ 83% (10/12 minimum after 1920a–g land; target 95%+ after all tasks complete).
- AC-3: Zero-row table (e.g., `bond_maturity` before first weekly run) does NOT trigger a WORK breach alert.
- AC-4: A real SLA breach on `commodity_prices` (age > 36h) DOES trigger a WORK alert (existing escalation behavior preserved).
- AC-5: Existing 5 signal types retain their current SLA thresholds (no regression to existing behavior).
- AC-6: `tsc` 0 errors.
- AC-7: Existing test suite for `freshnessSlaMonitorJob` remains green.

---

## Edge Cases

- `backtest_runs.run_at` is a TEXT ISO 8601 datetime — use `strftime('%s', ...)` for epoch conversion, same as other timestamp columns.
- `broker_sanctions` is quarterly; the 2160h (90-day) threshold means it will almost never breach. Correct — it is there for observability, not daily alerting.
- `vnstock_fundamentals` monitors `vnstock_financials.updated_at`. If 1920a wires multiple tables, only one representative table needs monitoring to confirm the job ran.
- Vietnamese data quality: `commodity_prices.fetched_at` uses Yahoo Finance UTC timestamps. `bond_maturity` uses VN market data; timestamps should be UTC-normalized before insert.

---

## Sequencing Constraint

This task MUST be merged AFTER 1920a, 1920b, 1920c, 1920d, 1920e, 1920f, 1920g. If merged before those tasks ship, `querySignalAges` references tables that may have zero rows — which is safe (FR-4 null guard), but coverage_pct will under-report. Order of operations is soft: code can be written in parallel, but the WORK daily snapshot only becomes meaningful post-1920a–g.

---

## Files Changed (expected)

- `apps/mcp-server/src/domain/services/freshnessSlaChecker.ts` — extend `SignalType` union + `SLA_THRESHOLDS`
- `apps/mcp-server/src/scheduler/system/freshnessSlaMonitorJob.ts` — extend `querySignalAges` UNION ALL, add null guard, add coverage_pct + daily summary
- `apps/mcp-server/src/__tests__/` — extend existing freshness SLA test + add new test for null-guard and coverage_pct

---

## Blockers

None at spec time. Soft sequencing dependency on 1920a–g is noted but does not block writing this code — it can be merged once any one of 1920a–g lands.

---

## Test Criteria Summary

| AC | Test type | Pass condition |
|----|-----------|----------------|
| AC-1 | Unit | querySignalAges returns 12 keys |
| AC-2 | Integration | coverage_pct ≥ 83% in summary string |
| AC-3 | Unit | age_minutes=-1 (null guard) → no escalation callback |
| AC-4 | Unit | age_minutes > SLA_THRESHOLDS.commodity_prices → escalation fired |
| AC-5 | Unit | Existing 5 signal type thresholds unchanged |
| AC-6 | tsc | 0 errors |
| AC-7 | Test run | Existing freshness suite green |
