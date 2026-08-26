# Market Watcher — Notebook
**Last updated:** 2026-08-26 12:00 UTC | **Sprint:** offhours-cycle-20260826-1200Z

## Cycle (12:00–12:07 UTC, market CLOSED)
- Stocks analyzed: 34 (watchlist) | Anomalies: 0 (stale EOD prices) | Chain: 0 | Sweep-forced: 3
- Regime: NEUTRAL | DXY: BEARISH (USD/VND 25920) | US10Y: N/A | fx_pressure: none | pe_risk: none
- Market: CLOSED (last close 08:59 UTC) — offhours prices unchanged from market session

## Coverage Sweep Results
- Stale tickers identified: KDH (+1.10%), VHM (-1.74%), PLX (-1.06%)
- All three forced into analysis but no new signals (duplicate guard suppresses stale closes)
- KDH/PLX minor moves; VHM oversold (RSI 28.1) but already flagged in morning session

## Metrics (cycle 2026-08-26 12:00 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 3 (sweep-forced tickers) |
| signals_emitted | 0 |
| signals_suppressed | 3 (off-hours duplicate guard: stale closes) |
| sweep_tickers_forced | 3 |
| coverage_state_updated | yes |
| exit_status | complete |

## Notes
- Offhours slot execution (12:00 UTC, market closed since 08:59)
- Stale closing prices block new anomaly signals per AutoCure c47 offhours duplicate guard
- No events or alerts emitted this cycle
- Coverage sweep performed; state updated
