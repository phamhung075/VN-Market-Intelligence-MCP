---
<!-- size-justification: 100L — architect brief, P0 recurring-class. Schema constraint rationale, design decision matrix, and writer-bypass class closure pattern are load-bearing for future developers encountering this class of bug. -->

id: 2026-06-17-ohlcv-writer-ssot-durable
version: "2026-06-17"
authored_by: architect
task_ref: ARCH-OHLCV-WRITER-SSOT-DURABLE
classification: recurring-bug-escalation (4th occurrence, single-digit-RSI / gia-0 class)
---

# Architecture Brief — OHLCV Writer SSOT Durability
# 4th Recurrence: writeForeignFlowToOhlcv all-zero stub (ARCH-OHLCV-WRITER-SSOT-DURABLE)

---

## Problem Class

Every recurrence of the single-digit-RSI / "giá 0 dưới BB" MARKET-spam incident has a common structure: a `daily_ohlcv` writer bypasses the `writeOhlcvBatch` SSOT and inserts an all-zero or corrupted OHLCV row for today's date before the real bar arrives. The alert scan jobs pick up the latest stub as the current close and produce physically impossible RSI/BB values.

Prior mitigations (Fixes 1–3) migrated Writers A/C/D/E through the SSOT or added guards. Fix 4 (this sprint) addresses **Writer G: `writeForeignFlowToOhlcv`** — the last bypassing writer — which inserts `open=0, high=0, low=0, close=0, volume=0` to satisfy the `close REAL NOT NULL` constraint when the OHLCV bar for today has not yet arrived.

---

## Root Cause: Schema Constraint vs. Merge-Only Semantics

`daily_ohlcv.close REAL NOT NULL` with no DEFAULT. The writer needs to persist foreign-flow columns (`foreign_buy_vol`, `foreign_sell_vol`, `foreign_net_vol`, `put_through_vol`, `foreign_buy_value`, `foreign_sell_value`) for a `(code, date)` key that may not yet exist. The naive INSERT satisfies the NOT NULL but creates a semantically corrupt row.

SQLite does not support `ALTER COLUMN ... DROP NOT NULL`. A full table rebuild on the live named-volume DB was rejected as P0-scope HIGH RISK. NULL-close INSERT is schema-blocked.

---

## Design Decision: Merge-Only (UPDATE-only, no stub INSERT)

The foreign-flow writer's contract is: **enrich an existing OHLCV row with flow metadata**. It has no business inserting OHLCV values. When no OHLCV row exists yet (pre-market open), the correct action is to defer (drop the write) and log at debug level. The OHLCV bar arrives within 2–3 hours via pushPricesHandler. The data gap is honest (`no row`) rather than corrupt (`close=0 row`).

**SQL contract:**
```sql
UPDATE daily_ohlcv
SET
  foreign_buy_vol   = ?,
  foreign_sell_vol  = ?,
  foreign_net_vol   = ?,
  put_through_vol   = ?,
  foreign_buy_value  = COALESCE(?, foreign_buy_value),
  foreign_sell_value = COALESCE(?, foreign_sell_value),
  updated_at = ?
WHERE code = ? AND date = ?
-- changes=0 → no OHLCV row yet → deferred, log debug, no stub
```

This replaces the INSERT … ON CONFLICT entirely.

---

## Writer-Bypass Class Closure

To prevent a 5th writer from reintroducing the class:

1. **SSOT annotation** (P0): `ohlcvWriteService.ts` JSDoc updated with exhaustive writer list + `/* OHLCV-WRITE-BYPASS-ALLOWED */` sentinel pattern. Any new raw `INSERT INTO daily_ohlcv` in a non-SSOT file without this sentinel is an architectural violation.

2. **ESLint rule** (follow-on, LINT-OHLCV-WRITE-BYPASS): Custom rule that errors on any `INSERT INTO daily_ohlcv` literal in `apps/mcp-server/src/**/*.ts` that is not in `ohlcvWriteService.ts` and does not carry the sentinel comment. Existing legitimate bypasses (server.ts push-ohlcv-history, ohlcvBackfill.ts, priceBackfillService.ts) get the sentinel + explanation.

---

## Durable Follow-On: `daily_foreign_flow` Table

The merge-only approach accepts a 2–3 hour window where foreign-flow data for new-day rows is lost if pushPricesHandler has not yet fired. The durable fix (follow-on, non-P0) is a dedicated `daily_foreign_flow (code, date, ...)` table that writes immediately regardless of OHLCV state, with a join at read time. This eliminates R-1 entirely.

New ARCH task to be minted: ARCH-DAILY-FOREIGN-FLOW-TABLE.

---

## Writer Inventory (post-this-fix)

| Writer | File | SQL path | Status |
|---|---|---|---|
| A (pushPricesHandler) | interface/mcp/routes/pushPricesHandler.ts | writeOhlcvBatch (intraday) | Migrated |
| C (ohlcvDailyAggregatorJob) | scheduler/market-data/ohlcvDailyAggregatorJob.ts | writeOhlcvBatch (backfill) | Migrated |
| D (taOhlcvBackfillJob) | scheduler/market-data/taOhlcvBackfillJob.ts | writeOhlcvBatch (backfill) | Migrated |
| E (ohlcvBackfill.ts) | infrastructure/fetchers/ohlcvBackfill.ts | INSERT OR IGNORE (historical, guarded) | In-scope bypass (sentinel) |
| F (priceBackfillService.ts) | domain/services/priceBackfillService.ts | INSERT OR IGNORE (historical mock) | In-scope bypass (sentinel) |
| G (writeForeignFlowToOhlcv) | infrastructure/db/ohlcvForeignFlowStore.ts | **UPDATE-only (this fix)** | **Fixed** |
| H (server.ts push-ohlcv-history) | interface/mcp/server.ts | ON CONFLICT DO UPDATE (guarded) | In-scope bypass (sentinel) |

After this fix: zero `daily_ohlcv` writers insert a `close=0` stub row.
