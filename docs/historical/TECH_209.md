---
id: TECH_209
req: REQ_209
sprint: 209
status: APPROVED
author: Architect
date: 2026-04-21
---

# TECH_209 — Schema Split Design: 9 Per-Domain Slice Files

## Summary

Split `src/infrastructure/db/schema.ts` (1,571 lines) into 9 domain slice files + 1 thin orchestrator. Zero call-site changes. Zero production behavior changes. Pure additive refactor.

## Current State

| Metric | Value |
|--------|-------|
| `schema.ts` line count | 1,571 |
| Tables defined inline | ~52 |
| Imported DDL (`bctc-schema.ts`) | `SQLITE_DDL` (BCTC tables) |
| External DDL helpers | `ensureCustomAlertRulesTable()` (line 47) |
| `getDb()` callers | 117 across 67 files (unchanged) |

## Target State

| File | Tables | Est. lines |
|------|--------|-----------|
| `schema.ts` (orchestrator) | — (calls all slices) | ~150 |
| `schema-market-data.ts` | `market_prices`, `market_prices_history`, `daily_ohlcv` (x2 — lines 154+1122), `commodity_prices`, `commodity_prices_history`, `foreign_flow`, `ohlcv_backfill_queue`, `vps_push_log` | ~250 |
| `schema-financial-reports.ts` | `pdf_extracted_text`, `bctc_vps_queue`, `vnstock_financials`, `vnstock_balance_sheet`, `vnstock_cash_flow`, `vnstock_trading_stats`, `vnstock_events`, `vnstock_officers`, `vnstock_shareholders`, `vnstock_fetch_log` + BCTC DDL import | ~320 |
| `schema-news.ts` | `rag_analyses`, `agent_signals`, `mention_velocity`, `cascade_rule_hits`, `trade_exposures`, `pharma_events`, `bond_maturity` | ~250 |
| `schema-alerts.ts` | `alerts`, `price_alerts`, `custom_alert_rules`, `alert_mutes` | ~150 |
| `schema-portfolio.ts` | `positions`, `portfolio_pnl_snapshots`, `portfolio_targets` | ~120 |
| `schema-briefings.ts` | `market_messages`, `briefing_log`, `market_summaries` | ~100 |
| `schema-macro.ts` | `macro_indicators`, `sbv_rates`, `sbv_rates_history`, `tracked_indicators`, `prediction_markets`, `prediction_signals`, `prediction_claims`, `calibration_snapshots` | ~280 |
| `schema-sector.ts` | `watchlist`, `reputation_scores`, `broker_sanctions`, `audit_state` | ~150 |
| `schema-system.ts` | `cron_job_runs`, `ask_queue`, `agent_feedback`, `system_logs`, `system_changelog`, `user_requests`, `telegram_reports`, `scheduler_locks`, `agent_work_log`, `kinhdich_readings`, `hexagram_transitions`, `evidence_fragments`, `evidence_scores`, `evidence_likelihood_ratios` | ~380 |

**Note on `daily_ohlcv` duplicate:** Lines 154 and 1122 both define `daily_ohlcv`. The second definition (line 1122) adds columns added in later sprints. The slice must use the union of both DDLs — single `CREATE TABLE IF NOT EXISTS daily_ohlcv` with all columns from both definitions. Architect will verify column diff before extraction.

## Slice File Contract

Each slice file:

```typescript
// src/infrastructure/db/schema-market-data.ts
import { Database } from "bun:sqlite";

export function initMarketDataSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_prices ( ... );
    CREATE INDEX IF NOT EXISTS ...;
    ...
  `);
}
```

- Named export: `initXxxSchema(db: Database): void`
- No default exports
- No imports except `Database` from `bun:sqlite` (and `SQLITE_DDL` for financial-reports slice)
- No side effects at module load time

## Orchestrator Contract

```typescript
// src/infrastructure/db/schema.ts (after refactor, ~150 lines)
import { initMarketDataSchema } from "./schema-market-data.js";
import { initFinancialReportsSchema } from "./schema-financial-reports.js";
// ... 7 more imports

export function initDatabase(): void {
  const db = getDb();
  initMarketDataSchema(db);
  initFinancialReportsSchema(db);
  initNewsSchema(db);
  initAlertsSchema(db);
  initPortfolioSchema(db);
  initBriefingsSchema(db);
  initMacroSchema(db);
  initSectorSchema(db);
  initSystemSchema(db);
  ensureCustomAlertRulesTable(db); // keep existing helper — called last
}
```

`getDb()`, `closeDb()`, `ensureCustomAlertRulesTable()` stay in `schema.ts` — no move.

## Task Breakdown

### Task 1527 — TDD: schema slices test (RED first)

**File:** `src/__tests__/1527-schema-slices.test.ts`

Test cases:
- AC: each of 9 slice `init` functions creates its domain tables on blank `:memory:` DB
- AC: `initDatabase()` orchestrator creates all tables (smoke check: query `sqlite_master` for 10+ tables)
- AC: `initDatabase()` called twice does not throw (idempotent)
- AC: `getDb()` returns same instance on repeat calls
- AC: `schema.ts` line count ≤ 200 (read file, count lines)

### Task 1528 — Extract `schema-market-data.ts`

**Tables to extract:**
- `market_prices` (line 124)
- `market_prices_history` (line 140)
- `daily_ohlcv` — MERGE lines 154+1122 into single DDL with all columns
- `commodity_prices` (line 398)
- `commodity_prices_history` (line 416)
- `vps_push_log` (line 913)
- `ohlcv_backfill_queue` (line 1475)
- All associated `CREATE INDEX IF NOT EXISTS` statements

**Foreign flow tables:** check `ohlcvForeignFlowStore.ts` for any inline DDL — if present, move here too.

### Task 1529 — Extract `schema-financial-reports.ts`

**Tables to extract:**
- `pdf_extracted_text` (line 891)
- `bctc_vps_queue` (line 959)
- `vnstock_financials` (line 1145)
- `vnstock_balance_sheet` (line 1246)
- `vnstock_cash_flow` (line 1267)
- `vnstock_trading_stats` (line 1173)
- `vnstock_events` (line 1194)
- `vnstock_officers` (line 1209)
- `vnstock_shareholders` (line 1223)
- `vnstock_fetch_log` (line 1236)
- BCTC DDL: keep `import { SQLITE_DDL } from "../../../bctc-schema.js"` — call `db.exec(SQLITE_DDL)` in this slice

### Task 1530 — Extract `schema-news.ts`

**Tables to extract:**
- `rag_analyses` (line 224)
- `agent_signals` (line 263)
- `mention_velocity` (line 286)
- `cascade_rule_hits` (line 1074)
- `trade_exposures` (line 1055)
- `pharma_events` (line 1035)
- `bond_maturity` (line 1016)

### Task 1531 — Extract `schema-alerts.ts`

**Tables to extract:**
- `alerts` (line 171)
- `price_alerts` (line 544)
- `custom_alert_rules` — DDL already in `CUSTOM_ALERT_RULES_DDL` constant (line 34); move const here
- `alert_mutes` (line 650)
- **Note:** `ensureCustomAlertRulesTable()` stays in `schema.ts` for API compat — it will call `initAlertsSchema` internally OR remain a passthrough. Architect prefers: keep the function stub in `schema.ts`, have it delegate to `initAlertsSchema(db)`.

### Task 1532 — Extract `schema-portfolio.ts`

**Tables to extract:**
- `positions` (line 562)
- `portfolio_pnl_snapshots` (line 579)
- `portfolio_targets` (line 598)

### Task 1533 — Extract `schema-briefings.ts`

**Tables to extract:**
- `market_messages` (line 1489)
- `briefing_log` (line 1114)
- `market_summaries` (line 866)

### Task 1534 — Extract `schema-macro.ts`

**Tables to extract:**
- `macro_indicators` (line 366)
- `sbv_rates` (line 452)
- `sbv_rates_history` (line 465)
- `tracked_indicators` (line 831)
- `prediction_markets` (line 491)
- `prediction_signals` (line 507)
- `prediction_claims` (line 1366)
- `calibration_snapshots` (line 1405)

### Task 1535 — Extract `schema-sector.ts`

**Tables to extract:**
- `watchlist` (line 108)
- `reputation_scores` (line 301)
- `broker_sanctions` (line 320)
- `audit_state` (line 1101)

### Task 1536 — Extract `schema-system.ts`

**Tables to extract:**
- `cron_job_runs` (line 717)
- `ask_queue` (line 738)
- `agent_feedback` (line 760)
- `system_logs` (line 810)
- `system_changelog` (line 683)
- `user_requests` (line 700)
- `telegram_reports` (line 662)
- `scheduler_locks` (line 1524) — added Sprint 170, already `IF NOT EXISTS`
- `agent_work_log` (line 1288)
- `kinhdich_readings` (line 981)
- `hexagram_transitions` (line 1000)
- `evidence_fragments` (line 1309)
- `evidence_scores` (line 1326)
- `evidence_likelihood_ratios` (line 1345)

### Task 1537 — Orchestrator slim-down + wire-up

After all 9 slice tasks complete:
- Replace inline DDL in `schema.ts` with imports + `initXxxSchema(db)` calls
- Verify `schema.ts` ≤ 200 lines
- Run full test suite: all GREEN
- Run `bun tsc --noEmit`: clean

## Execution Order

Tasks can be parallelized after Task 1527 (TDD) is written:

```
1527 (TDD RED) → 1528..1536 (parallel slices) → 1537 (wire-up) → 1527 GREEN
```

In practice, PM should assign one developer per slice, or a single developer can work through them sequentially.

## Key Invariants

1. Never remove `IF NOT EXISTS` from any DDL
2. Never rename columns or change column types
3. Never reorder `initXxxSchema` calls in orchestrator without checking FK dependencies (none exist currently — all tables use app-level references, no SQLite FKs between domain tables)
4. `bctc-schema.ts` (external file) is not touched — financial-reports slice just imports it
5. The `daily_ohlcv` duplicate (lines 154+1122) must be resolved to single DDL — use column union. Verify with: `grep -n "daily_ohlcv" src/infrastructure/db/schema.ts`

## Token Impact (post-refactor)

| Task type | Context before | Context after | Saving |
|-----------|---------------|---------------|--------|
| DB schema task (any domain) | 1,571 lines | ~150 (orchestrator) + 1 slice | ~80% |
| Alert pipeline fix | all 1,571 lines | schema-alerts.ts ~150 lines | ~90% |
| Portfolio fix | all 1,571 lines | schema-portfolio.ts ~120 lines | ~92% |
| Average agent task | all 1,571 lines | ~670 lines (orchestrator + relevant slice) | ~57% |
