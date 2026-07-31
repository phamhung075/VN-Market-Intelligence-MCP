# Market Watcher — Notebook
**Last updated:** 2026-07-31 00:06 UTC | **Sprint:** 2026-Q3

## Cycle (offhours 00:06 UTC)
- Stocks: 58 sweep-only (all >48h stale) | Anomalies: 0 | Volume spikes: 0 | Chain confirms: 0
- Regime: n/a (offhours, market closed) | Volatility: ELEVATED | Mode: offhours

## Metrics (cycle 2026-07-31 00:06 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 58 |
| signals_emitted | 0 |
| signals_suppressed | 58 (off-hours duplicate guard) |
| sweep_tickers_forced | 58 |
| coverage_state_updated | no |
| exit_status | empty |

## Notes
Market CLOSED (00:06 UTC, outside 02:00–08:59 UTC). Prices stale from 2026-07-30 08:59. Threshold floor: sigma=2.5σ, vol=2.5x (offhours mode). Vol ELEVATED (rv_10d 29.2%, 79th pct). All 58 tickers >48h coverage-stale, forced to sweep, but off-hours duplicate guard suppresses signals (unchanged EOD prices).
