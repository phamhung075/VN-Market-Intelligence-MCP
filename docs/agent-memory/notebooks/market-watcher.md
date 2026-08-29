# Market Watcher — Notebook
**Last updated:** 2026-08-29 00:40 UTC | **Sprint:** market-watcher-offhours-20260829-0040Z

## Carry-over
- (none carried from previous cycle — previous entry closed clean at 2026-08-26 20:00 UTC)

## Cycle (00:15–00:40 UTC, Saturday, market CLOSED)
- Watchlist scanned: 34 tickers | Priced this cycle: 3 (sweep-forced) | Anomalies: 0 (>2.5σ floor) | Volume spikes: 0 | Chain confirms: 0
- Regime: NEUTRAL (fallback — no explicit Global Liquidity line in macro snapshot; logged per regime-extraction) | DXY: USD STRENGTHENING (usdVnd BEARISH 25,880) | US10Y: RISK-OFF (gold BULLISH 4,504.1) | fx_pressure: none | pe_risk: none
- Market: CLOSED since 08:59 UTC 2026-08-28 — prices frozen; all moves below 2.5σ offhours floor

## Coverage Sweep Results
- Stale tickers identified (coverage-stamp.sh --list-stale): KBC, NVL, PDR (all >48h, last covered 2026-08-24T20:07:23Z)
- All 3 forced into analysis: KBC -0.54%, NVL -1.51%, PDR -1.98% — none meets ≥2.5σ offhours threshold → no signals emitted (sweep-forced tickers never emit price_anomaly without a real move)
- Technical reads (60d/120d): all TRUNG TÍNH (neutral) — KBC 1/4 bullish, NVL 0/4, PDR 2/4

## Evidence Fragments (Step 1b)
- 6 fragments recorded: price_momentum_5d (KBC id=1631, NVL id=1632, PDR id=1633) + price_momentum_20d (KBC id=1634, NVL id=1635, PDR id=1636) — all neutral, magnitude 0.3, confidence 0.6

## Market Indicators (Step 2)
- Volatility: rv_10d 13.68% | rv_20d 15.57% (29th pct) | rv_60d 18.00% | gk_vol_20d 13.65% — moderate
- Breadth: ADL -468, accruing since 2026-06-30 (WARMUP) | Liquidity: refi 4.5% (is_estimate=true) | Momentum/RS/52w: mixed-neutral per ticker | Insider sentiment: null → [SKIP]
- Macro: BRENT 88.29 (NEUTRAL), GOLD 4,504.1 (BULLISH), USD_VND 25,880; carry spread 1.37pp NEUTRAL; yield FAIRLY_VALUED (1.70pp)
- Sector rotation: all sectors ỔN ĐỊNH (stable, 1-day data only); supply chain no data; climate/energy no alarms

## Metrics (cycle 2026-08-29 00:40 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 3 (sweep-forced tickers priced) |
| signals_emitted | 0 |
| signals_suppressed | 0 (no candidate ≥2.5σ; duplicate guard not triggered) |
| sweep_tickers_forced | 3 (KBC, NVL, PDR) |
| coverage_state_updated | yes (3 tickers stamped) |
| exit_status | complete |
