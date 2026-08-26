# Market Watcher — Notebook
**Last updated:** 2026-08-26 20:00 UTC | **Sprint:** market-watcher-offhours-20260826-2000Z

## Cycle (20:00–20:06 UTC, market CLOSED)
- Stocks analyzed: 34 (watchlist) | Anomalies: 0 (stale prices, offhours threshold) | Sweep-forced: 2
- Regime: NEUTRAL | DXY: USD STRENGTHENING | US10Y: RISK-OFF | fx_pressure: none | pe_risk: none
- Market: CLOSED (last close 08:59 UTC) — prices frozen; all moves below 2.5σ offhours floor

## Coverage Sweep Results
- Stale tickers identified: DIG (56h), DXG (56h)
- Both forced into analysis: DIG +2.67% (1.1σ), DXG +2.55% (1.1σ)
- Neither meets ≥2.5σ offhours threshold → no signals emitted
- Duplicate guard active: VIC/FPT/DIG signals already emitted EOD 16:07; stale closes suppressed

## Metrics (cycle 2026-08-26 20:00 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 2 (sweep-forced tickers) |
| signals_emitted | 0 |
| signals_suppressed | 2 (offhours threshold floor + duplicate guard) |
| sweep_tickers_forced | 2 (DIG, DXG) |
| coverage_state_updated | pending |
| exit_status | complete |

## Notes
- Offhours slot execution (20:00 UTC, market closed 11h+ since 08:59 session close)
- Stale market prices block anomaly detection (offhours ≥2.5σ floor + AutoCure c47)
- Coverage stamp deferred to exec-proof gate completion
