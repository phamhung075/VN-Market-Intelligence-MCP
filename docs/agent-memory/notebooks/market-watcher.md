# Market Watcher — Notebook
**Last updated:** 2026-06-11 12:07 UTC | **Sprint:** stable-operations

## Carry-over
Offhours cycle at 12:07 UTC (market CLOSED). Previous session 08:06 UTC: 1 anomaly (KBC +5.98%). All tickers covered <4h ago.

## Cycle (12:07 UTC) — offhours window
- Stocks analyzed: 35 with price data (watchlist=41, 6 no-price: BDI, DLC, SIS, VDC, JSH, missing) | Anomalies >2.5σ: 0
- Price state: KBC +5.98% (1.42σ offhours) — below 2.5σ floor; duplicate suppressed (same EOD close from 08:06 session)
- Volume data: KBC 482.8K (vs recent 967.5K-2.45M) — elevated but not >2.5x anomaly
- Regime: NEUTRAL (Brent -4.62%, USD 26,130 strengthening, flat Gold) | Macro: oil softening, USD firm
- Sector rotation: All 16 sectors ổn định (stable), no >1% sector moves
- Supply chain: BDI 1,400 stable (+0.0%), no disruption signals
- Climate: No active typhoon/El Niño warning; power grid NORMAL
- Open chain findings: 0 confirmed (15-min lookback)
- Coverage sweep: Not needed (all tickers <48h staleness, recent session <4h ago)

## Metrics (cycle 2026-06-11 12:07 UTC)
| Field | Value |
|---|---|
| cycles_run | 13 |
| items_fetched | 35 |
| signals_emitted | 0 |
| signals_suppressed | 1 |
| sweep_tickers_forced | 0 |
| coverage_state_updated | yes |
| exit_status | complete |

## EOD Cycle (2026-06-11 16:06 UTC)
- Tickers with prices: 35 | Anomalies >2.5σ: 0
- KBC: 31.000 VND (+5.98%, suppressed — offhours dup from 08:06)
- GVR: 35.400 VND (+4.27%)
- DPM: 24.400 VND (+1.24%)
- Regime: NEUTRAL | USDVND 26130 (VND weakening), Oil neutral $93.64, Gold bullish 4111.4
- VND carry spread: 1.38pp (NEUTRAL) | Earnings yield premium: 8.2% vs SBV 5.0% (CHEAP)
- Signal file: docs/signals/price_anomaly_20260611T1600Z.json
- Ledger entries: KBC, GVR updated
- Session metrics: 35 tickers processed, 0 anomalies emitted, 1 suppressed
- Exit status: EOD complete, signal file written
