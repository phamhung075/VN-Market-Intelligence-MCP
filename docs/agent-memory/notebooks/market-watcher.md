# Market Watcher — Notebook
**Last updated:** 2026-07-21 20:09 UTC | **Sprint:** 2026-Q3

## Carry-over
- **SLOT OVERLAP (prev cycle):** EOD 16:13 + offhours 16:09 both processed same 08:32 close. Cadence fix needed in dispatcher.
- EOD slot had 4-day gap; self-recovered 2026-07-21.

## Cycle (offhours, 20:09 UTC)
- Stocks: 0 | Anomalies: 0 | Volume spikes: 0 | Chain confirms: 0
- Regime: NEUTRAL (offhours default) | DXY: UNAVAILABLE | US10Y: UNAVAILABLE
- Prices stale: 08:32 UTC (11.5h old) — market CLOSED, no new intraday moves
- Offhours floor applied: sigma 2.5σ, volume_multiplier 2.5x
- No sweep-forced tickers due (last coverage check shows all tickers analyzed since 2026-07-21 08:32)

### Status
- AutoCure c47 guard active: off-hours duplicate suppression on stale EOD prices
- No anomalies emitted (no price movement > 2.5σ on stale data)
- Coverage state maintained (all tickers reviewed today at market close)

## Data Status
- Bootstrap: OK | Macro snapshot: degraded (is_estimate fields present) | Volatility regime: data available
- Last signal from bus: 2026-07-21 16:13 (EOD cycle outputs)
- System status: healthy, no gateway blockers

## Metrics (cycle 2026-07-21 20:09 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 0 |
| signals_emitted | 0 |
| signals_suppressed | 0 |
| sweep_tickers_forced | 0 |
| coverage_state_updated | no |
| exit_status | complete |
