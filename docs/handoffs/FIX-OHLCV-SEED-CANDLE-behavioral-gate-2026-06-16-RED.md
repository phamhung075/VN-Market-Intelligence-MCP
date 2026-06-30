# Behavioral Gate RESULT — FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0 + FIX-ALERT-ENGINE-RSI-SINGLEDIGIT

**Verdict: RED (partial).** Router RAW-verified LIVE on the FIRST production cycle after the
2026-06-15 08:02→04:29Z rebuild (morning briefing 01:00Z, Writer D 01:30Z, first TA scan 02:15Z all
ran). The watchlist-major poison is HEALED, but the fix is **NOT generic** — residual corruption
persists for non-major tickers across **4 distinct root classes**. Do NOT flip RSI-SINGLEDIGIT to
done_verified; do NOT release FIX-ALERT-OPEN-ZERO-PRICE-RACE; mint a dev-mcp-server follow-on P0.

## GREEN dimension (what the fix DID achieve)
Canonical `get_technical_indicators` (named-volume DB, source_tier 3), 2026-06-16 04:55Z:
| Ticker | Price (VND) | RSI | Verdict |
|---|---|---|---|
| VHM | 136,100 | 35.7 | real mid-band (was 8.8 pre-fix) ✓ |
| VIC | 193,500 | 36.2 | real mid-band (was 6.5) ✓ |
| VJC | 138,400 | 27.3 | RSI band ok BUT price suspect (see Class 4) |
No single-digit, no 100.0 pegs on the majors. The Writer-A/D migration + prevClose-seeded
`detectAndNormalizeScaleFromPrevClose` fixed the ÷1000 class **for tickers whose prior real close was
found**. That is the watchlist majors — not the universe.

## RED dimension — RAW DB evidence (date='2026-06-16', 1569 rows; flat_seed=775; null_env=117)
46 tickers show implausible >15% single-day moves vs prior real close (HOSE limit ±7%, UPCoM ±15%).
Writer signatures (`O|H|L|C|vol|data_env|flat`):

```
DAG  0|0|0|0       vol=0     env=NULL        flat=Y   ← Class 2 zero-price
DFF  0|0|0|0       vol=0     env=NULL        flat=Y   ← Class 2
DMC  0|0|0|0       vol=0     env=NULL        flat=Y   ← Class 2
POM  0|0|0|0       vol=0     env=NULL        flat=Y   ← Class 2
PDN  105.2 (×4)    vol=100   env=production  flat=Y   ← Class 3 ÷1000 (prior 99,800)
NHD  118/118.6/103.2/118.6 vol=1400 env=production flat=N ← Class 3 ÷1000 (prior 92,500)
DCR  5900 (×4)     vol=0     env=production  flat=Y   ← Class 1 aggregator wrong-price seed (prior 3,600, +64%)
H11  25700 (×4)    vol=0     env=production  flat=Y   ← Class 1 (prior 17,500, +47%)
VJC  143500|144100|138200|138400 vol=48640 env=NULL flat=N ← Class 4 corp-action discontinuity (prior 183,700, -25%)
```

## Four root classes (the fix gap)
1. **Aggregator/seeder writes flat vol=0 bars at WRONG prices (env=production, flat=Y).** DCR/H11 +
   ~773 of the 775 flat-seed rows. This writer (suspect `ohlcvDailyAggregatorJob.ts` — "seed today's
   candle") was **NOT migrated to `writeOhlcvBatch`**, so it bypasses FR-S1 seed-rejection entirely.
   PRIMARY GAP.
2. **Zero-price all-zero bars (env=NULL, vol=0).** DAG/DFF/DMC/POM. data_env=NULL = Writer-D-class
   path. FR-S1 (`date>=vnToday AND vol=0 AND O=H=L=C → skip`) should reject 0=0=0=0 today — either an
   un-migrated env=NULL writer exists, or FR-S1 is not on this path. Source of "giá 0 dưới BB" alerts.
3. **÷1000 leak on a production writer (PDN/NHD).** env=production, prior real close exists (99,800 /
   92,500) yet landed ÷1000. Either a prevClose-miss in the batch JOIN or an un-migrated production
   writer. The exact VHM/VIC bug, just on tickers the migration didn't cover → proves non-generic.
4. **Corporate-action price-adjustment discontinuity (VJC).** Real-shaped candle (proper O/H/L/C
   spread, 48,640 vol, env=NULL/VNDIRECT) but the WHOLE bar is ~-25% vs unadjusted prior 183,700 —
   beyond any VN limit → almost certainly an ex-div/ex-rights ADJUSTED close stitched onto an
   unadjusted history. Poisons RSI/MACD/BB across the adjustment boundary. NEW scope — the pipeline
   has no adjusted-vs-unadjusted continuity handling. Live example today; generic across any ex-date
   ticker.

## Recommendation to PO
1. **Keep FIX-ALERT-ENGINE-RSI-SINGLEDIGIT in review[]** — majors healed but gate is non-generic.
2. **Keep FIX-ALERT-OPEN-ZERO-PRICE-RACE on hold** — Class 2 zero-price bars are still its giá=0 source.
3. **Mint dev-mcp-server P0 follow-on** (e.g. `FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0`): migrate the
   remaining OHLCV writer(s) — esp. the daily aggregator/seeder — through `writeOhlcvBatch` so FR-S1
   seed-rejection + scale-normalization + zero-guard apply to ALL tickers (generic, /goal#2). Add a
   fail-closed reject for C=0. Trace why PDN/NHD prevClose-normalization missed (Class 3).
4. **Class 4 corp-action**: separate task (P2) — detect adjusted-close discontinuity (|move| beyond
   listing-board limit) → reconcile against an adjusted-history source or flag+exclude the boundary
   bar from TA. Do NOT silently serve a false -25% bar for VJC (a watchlist major) per /goal#1.

## Provenance
Router LIVE RAW 2026-06-16 04:53–04:57Z: named-volume DB `vn-market-intelligence-mcp_market_data`
`/data/market.db` `daily_ohlcv` (sqlite3 sidecar, 5 queries), `get_technical_indicators` VHM/VIC/VJC
via gateway call_tool. Not a relayed badge.
