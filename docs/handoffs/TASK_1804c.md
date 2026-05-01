# TASK_1804c — VIC/VRE Flat 30-Day Price History Diagnosis

**Date:** 2026-05-01
**Symptom:** VIC (-5.10%) and VRE (+4.87%) show realized intraday moves in `market_prices` but `get_price_history` returns flat/stale data inconsistent with those moves over a 30-day window.

---

## Root Cause: Three Compounding Bugs

### Bug 1 — CRITICAL: `market_prices_history` is pruned to 24 hours; `get_price_history` queries it for up to 90 days

**File:** `apps/mcp-server/src/interface/mcp/routes/pushPricesHandler.ts`, line 190
**File:** `apps/mcp-server/src/interface/mcp/tools/market-data/priceHistoryTools.ts`, line 201

`pushPricesHandler.ts` deletes all `market_prices_history` rows older than 24 hours on every push:
```typescript
const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
db.prepare(`DELETE FROM market_prices_history WHERE fetched_at < ?`).run(cutoff);
```

But `get_price_history` queries `market_prices_history` with `fetched_at >= [N days ago]`. For N=30, the table only has 24 hours of data, so the "history" is 399 intraday ticks from the last day — not 30 daily closing prices.

**Evidence (production DB):**
- `market_prices_history` for VIC: 399 rows, oldest `2026-04-30T03:15Z`, newest `2026-05-01T03:14Z` — exactly 24 hours.
- `get_price_history` with `days=30` returns 399 rows all at VIC's current price of 214,000 — appearing flat.

**Why it appears flat:** all 399 rows returned are intraday ticks from a session where VIC closed unchanged at 214,000 after the open. The realized -5.10% move happened between yesterday's close (225,500 on 2026-04-28) and today's session — the prior close is outside the 24h window and therefore deleted.

### Bug 2 — MODERATE: `daily_ohlcv` has only 7 rows per ticker (not 30)

`daily_ohlcv` is the correct source for 30-day close history, but it only has data since 2026-04-23 (7 days). It is populated two ways:
1. **`pushPricesHandler`** upserts one row per VN date on every push (using today's `close = current_price`).
2. **`ohlcvDailyAggregatorJob`** reads from `market_prices_history` to build OHLCV from intraday ticks — but since `market_prices_history` only retains 24h, there is no historical data available to backfill past days.

**Evidence:**
- `daily_ohlcv` for VIC: oldest row is `2026-04-23`, only 7 rows total.
- 2026-04-29 and 2026-04-30 show `close=214,000` with identical volume (5,786,200) — a stale-volume carry-forward artifact from the `pushPricesHandler` upsert logic (see Bug 3).

### Bug 3 — MODERATE: `daily_ohlcv` volume carry-forward from push upsert

In `pushPricesHandler.ts` line 179, the OHLCV upsert writes `volume = p.volume ?? 0` where `p.volume` is the cumulative intraday volume. The ON CONFLICT updates `volume = excluded.volume` every push. On days with low early-session volume, an earlier high-volume day's cumulative count bleeds into the new day because the row is keyed on `(code, vnDate)`.

**Evidence:** VIC `2026-04-29` and `2026-04-30` both show `volume=5,786,200` — a 10x multiple of today's partial `578,620`. VRE same pattern: `2026-04-29` and `2026-04-30` both `16,939,100` vs today's `1,693,910`.

This is because `ohlcvDailyAggregatorJob` runs at 22:00 VN (15:00 UTC) and should produce the canonical end-of-day row. But if the aggregator ran and produced `volume=578,620` at 10:05 VN, then a late push at 14:00 VN with `volume=5,786,200` overwrites it via the pushPricesHandler upsert. The aggregator's `MAX(volume)` approach is correct but is being overridden.

---

## What `get_price_history` Actually Returns Today

For VIC with `days=30`:
- Returns 399 intraday ticks from the last 24 hours
- All ticks show `price=214,000` (VIC's intraday price, unchanged from open today)
- The -5.10% move vs ref_price (225,500) is in `market_prices.change_pct` but NOT visible in the history because the ref_price close (225,500 on 2026-04-28) was deleted from `market_prices_history` by the 24h pruning

**The "flat" appearance** is because the tool is querying intraday ticks (all same price during flat session) instead of daily closing prices.

---

## Fix Required

`get_price_history` must be rewritten to query `daily_ohlcv` (daily closing prices), not `market_prices_history` (intraday ticks). The `market_prices_history` table was designed as a 24h intraday buffer, not a 30-day history store.

### Proposed fix (interface layer only — ≤15 lines)

In `priceHistoryTools.ts`, replace the `market_prices_history` query with:

```typescript
const rows = db
  .query<{ code: string; date: string; open: number; high: number; low: number; close: number; volume: number }, [string, string]>(
    `SELECT code, date, open, high, low, close, volume
       FROM daily_ohlcv
      WHERE code = ?
        AND date >= ?
      ORDER BY date DESC`,
  )
  .all(code, cutoff.slice(0, 10)); // cutoff as YYYY-MM-DD
```

The `PriceRow` interface and `formatPriceHistory` output format also need updating: replace `price`/`fetched_at` with `close`/`date`.

### Secondary fix needed

The `ohlcvDailyAggregatorJob` volume carry-forward (Bug 3): the `pushPricesHandler` OHLCV upsert should NOT overwrite volume on conflict after the market close. A guard `AND date = today` with `AND NOT EXISTS (SELECT 1 FROM scheduler_locks WHERE ...)` would prevent overwrites after the aggregator runs. This is a separate task.

---

## Scope Assessment

- **Bug 1 fix** (rewrite `get_price_history` to use `daily_ohlcv`): ~15 lines in `priceHistoryTools.ts` + test update in `178-price-history.test.ts`. Medium effort.
- **Bug 3 fix** (stop pushPricesHandler from overwriting aggregator volume): requires a post-close write guard — separate task.
- **Data gap** (`daily_ohlcv` only has 7 days): the VPS OHLCV backfill endpoint (`ohlcv_backfill_queue`) can be triggered to fill historical data from VnDirect API. This needs ops to queue a backfill.

---

## Affected Files

- `apps/mcp-server/src/interface/mcp/tools/market-data/priceHistoryTools.ts` — fix query source
- `apps/mcp-server/src/__tests__/178-price-history.test.ts` — update test fixtures for daily_ohlcv
- `apps/mcp-server/src/interface/mcp/routes/pushPricesHandler.ts` — Bug 3 (separate task)

---

## NEXT ACTION

Spawn `developer` to implement Bug 1 fix:
- Rewrite `get_price_history` to query `daily_ohlcv` instead of `market_prices_history`
- Update `PriceRow` type and `formatPriceHistory` to use `close`/`date` columns
- Update test `178-price-history.test.ts` to seed `daily_ohlcv` instead of `market_prices_history`
- No schema change required — `daily_ohlcv` already exists with correct columns
