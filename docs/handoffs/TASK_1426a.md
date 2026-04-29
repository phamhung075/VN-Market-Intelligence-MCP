# TASK_1426a — compute_market_earning_yield: Domain Pure Function + Use-Case + Cron Job

**Sprint:** 1426 (Báu Phase 2 — Dinh Gia)
**Tier:** 1 — independent, start immediately
**Owner:** developer
**Estimated size:** ~350 lines net new, 2 file edits

---

## Goal

Aggregate EPS/P/E from watchlist tickers in `vnstock_financials`, compute market-wide
median P/E and earning_yield, store results in `tracked_indicators`. Refuse if watchlist
coverage < 70% (fewer than 21 of 30 tickers have valid EPS).

---

## Files to CREATE

| File | Lines | Purpose |
|------|-------|---------|
| `apps/mcp-server/src/domain/services/macro/marketEarningYield.ts` | ~80 | Pure domain fn — types + `computeMarketEarningYield()` |
| `apps/mcp-server/src/application/usecases/computeMarketEarningYield.ts` | ~100 | DB aggregation, coverage check, calls domain fn, writes tracked_indicators |
| `apps/mcp-server/src/interface/scheduler/macro/marketEarningYieldJob.ts` | ~50 | Daily cron wrapper — calls use-case, logs result |
| `apps/mcp-server/src/__tests__/1570a-market-earning-yield.test.ts` | ~120 | Unit tests for pure domain fn — all branches |

## Files to MODIFY

| File | Change |
|------|--------|
| `apps/mcp-server/src/domain/services/macro/index.ts` | Re-export `TickerPE`, `MarketEarningYieldResult`, `computeMarketEarningYield` |
| `apps/mcp-server/src/interface/scheduler/startScheduler.ts` | Register `marketEarningYieldJob` cron (daily 16:30 VN = 09:30 UTC) |

---

## Domain Types (marketEarningYield.ts)

```typescript
export interface TickerPE {
  code: string;
  pe: number; // pre-computed from vnstock_financials.pe, or recomputed from price/eps
}

export interface MarketEarningYieldResult {
  medianPE: number;
  earningYield: number;   // = 1/medianPE * 100, as percentage (e.g. 7.32)
  coverageRatio: number;  // e.g. 0.93 = 28/30 tickers had valid EPS
  coverageCount: number;  // e.g. 28
  totalWatchlist: number; // e.g. 30
  dataAsOf: string;       // "YYYY-QQ" of latest vnstock_financials row seen
  computedAt: string;     // ISO timestamp
}

export function computeMarketEarningYield(
  tickers: TickerPE[],
  totalWatchlist: number,
  dataAsOf: string
): MarketEarningYieldResult | { refused: true; coverageRatio: number; coverageCount: number }
```

Guard: if `tickers.length / totalWatchlist < 0.70`, return `{ refused: true, coverageRatio, coverageCount }`.
Guard: if any input pe is 0 or negative, exclude from tickers array before calling (caller's responsibility, but document).

---

## Use-Case Logic (computeMarketEarningYield.ts)

```
1. Read watchlist codes (SELECT code FROM watchlist)
2. For each code: SELECT pe, year_report, quarter FROM vnstock_financials
   WHERE code=? ORDER BY year_report DESC, quarter DESC LIMIT 1
   - Use stored pe when non-null and > 0
   - Fallback: compute pe = currentPrice * 1000 / eps (if eps != 0)
     (price is in 1000 VND, eps is in VND → pe = price_k * 1000 / eps_vnd)
3. Filter out null/zero pe results
4. Call computeMarketEarningYield(validTickers, watchlistTotal, dataAsOf)
5. If refused: log WARN, return early — no DB write
6. Write to tracked_indicators:
   - indicator='market_earning_yield', value=earningYield, unit='%', source='bau_phase2'
   - indicator='market_median_pe', value=medianPE, unit='ratio', source='bau_phase2'
```

No Telegram alert on completion. Log result at INFO level.

---

## Scheduler Registration (startScheduler.ts)

- Schedule: `30 9 * * 1-5` (09:30 UTC = 16:30 VN, weekdays only)
- After market close — ensures intraday prices are settled

---

## Test File: 1570a-market-earning-yield.test.ts

Cover all branches:
- Happy path: 28 tickers, medianPE computed, earningYield = 1/medianPE * 100
- Coverage guard: only 15 of 30 tickers → `refused: true`
- All-zero pe input: coverage guard fires (caller must filter zeros)
- Zero-length input: coverage guard fires
- medianPE computation: even count (average two middle values), odd count

---

## tracked_indicators Storage Pattern

```
INSERT OR REPLACE INTO tracked_indicators
  (indicator, source, hour_bucket, value, unit, fetched_at)
VALUES
  ('market_earning_yield', 'bau_phase2', strftime('%Y-%m-%d-%H', 'now'), ?, '%', datetime('now')),
  ('market_median_pe',     'bau_phase2', strftime('%Y-%m-%d-%H', 'now'), ?, 'ratio', datetime('now'))
```

Consistent with existing `fed_funds_rate` (source='fred') pattern.

---

## Risk Flags (from architect)

- RISK-1 (HIGH): EPS unit mismatch — price in 1000 VND, EPS in VND. Prefer stored `.pe` column.
  Developer must verify against VCB before shipping.
- RISK-2 (MEDIUM): EPS staleness — include `dataAsOf` (year_report + quarter) in result.
- RISK-3 (MEDIUM): Coverage < 70% on fresh DB → log WARN, skip write, show "unavailable" in snapshot.

---

## Acceptance Criteria

- [ ] `computeMarketEarningYield()` pure fn handles all label branches and coverage guard
- [ ] Use-case reads DB, filters valid PE rows, calls domain fn
- [ ] `tracked_indicators` gets two rows: `market_earning_yield` and `market_median_pe`
- [ ] Cron job registered at 09:30 UTC weekdays in `startScheduler.ts`
- [ ] 1570a test file passes — all branches covered
- [ ] TSC: 0 errors
- [ ] No regression in existing tests (baseline: 8198 pass)

---

## Dependencies

None. This task is Tier 1 — start immediately.

## Handoff to

1426b (get_yield_spread_signal) and 1426c (macro snapshot) both depend on this task being merged first.
