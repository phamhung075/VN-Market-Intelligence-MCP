# Market Watcher — Notebook
**Last updated:** 2026-08-24 12:04 UTC | **Sprint:** main

## Carry-over
None

## Cycle (08:59–12:04 UTC, offhours)
- Stocks: 34 active | Sweep forced: 3 (PLX, DIG, DXG) | Anomalies: 0 (>2.5σ) | Volume spikes: 0 | Chain confirms: 0
- Regime: NEUTRAL | DXY: USD STABLE | US10Y: NEUTRAL | Carry: NEUTRAL | fx_pressure: none | pe_risk: none

## Metrics (cycle 2026-08-24 12:04 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 3 stale + coverage survey |
| signals_emitted | 0 |
| signals_suppressed | 0 |
| sweep_tickers_forced | 3 (PLX +0.26%, DIG +2.27%, DXG +2.16%) |
| coverage_state_updated | yes |
| exit_status | complete |

## Notes (offhours cycle)
- Offhours cycle during market-closed window (12:04 UTC)
- 2.5σ threshold floor applied (prepost-equivalent for offhours)
- Stale tickers re-covered: PLX (3.69% ATR), DIG (volume spike guard), DXG (mid-range 52w proximity)
- Market indicators: vol_regime NORMAL, breadth weak (ADL -423), pct_above_ma50 36.1%, pct_above_ma200 13.9%
- No price anomalies (frozen EOD prices from 08:59 UTC, no intraday trading)
- Evidence fragments: not required (no threshold breaches)
- Gateway: OK, no blockers

---

## EOD Summary (16:00 UTC, 2026-08-24)
**Status:** Complete | **Ledger:** Updated (10 tickers with YoY) | **Signal:** docs/signals/price_anomaly_20260824T1600.json

### Cycle Overview
- Tickers processed: 34 active
- Regime: NEUTRAL (Kinh Dịch reading)
- VN-Index: 1,788.78 (+1.17%)
- Market breadth: 199 advances, 115 declines, 59 unchanged

### Anomalies Detected (5 total)
| Code | Price | Change | RSI | Alert |
|---|---|---|---|---|
| HUT | 13,000 VND | +0.78% | 22.5 | Oversold (RSI <30) |
| DAG | 1,400 VND | 0.00% | 15.4 | Critically oversold (RSI <20) |
| KDH | 18,550 VND | +3.06% | 53.3 | Breakout above BB upper + insider buying |
| VHM | 73,400 VND | +2.37% | 26.8 | Inverse RSI signal (oversold despite strength) |
| SSI | 21,250 VND | +2.41% | 38.5 | Technical bounce (oversold recovery) |

### Notable Moves (>2.5% daily)
- PDR: +4.47% (12,850 VND)
- VIC: +4.63% (214,500 VND) — foreign inflow noted
- KDH: +3.06% (18,550 VND) — insider activity + BB breakout

### YoY Performance (10 tickers with history)
- Gainers: VNM (+7.67%), SAB (+1.10%)
- Decliners: DBC (-36.76%), EIB (-35.62%), DPM (-14.23%), VJC (-12.63%), MSN (-11.95%), VEA (-9.04%), BID (-10.00%), KDC (-2.80%)

### Exit
- Ledger: 10 entries committed with price, RSI, YoY, volume data
- Signal file: Atomically written with dual-plane contract guard
- Notebook: This cycle entry
- Gateway status: Healthy
- WORK ping: Sent (34 tickers, 5 anomalies)
