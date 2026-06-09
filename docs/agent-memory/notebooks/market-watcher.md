# Market Watcher — Notebook
**Last updated:** 2026-06-09 20:05 UTC | **Sprint:** market-watcher-offhours

## Carry-over
Previous cycle (2026-06-09 16:09): All tickers current, 0 anomalies detected >2.5σ floor. EOD dish written to signal file.

## Cycle (20:05 UTC) — offhours
- Stocks analyzed: 41 (prices stale, last update 09:00 UTC from prior market close). Anomalies detected: 0 (>2.5σ offhours floor) | Volume spikes: 0 | Chain confirms: 0
- Regime: NEUTRAL | DXY: BEARISH (26128 > 25000) | US10Y: RISK-OFF (gold $4283.9 slightly down)
- Offhours threshold floor: sigma_threshold=2.5σ, volume_multiplier=2.5x (applied)
- AutoCure c47: No off-hours duplicate signals emitted (all EOD prices unchanged since 08:07 close)
- BDI: 1400 stable | Brent: 91.47 -3.03% (down, easing pressure)

## Coverage Status
All 41 watchlist tickers priced within last 11h (09:00 UTC). No stale entries. Stale threshold: 48h. No forced sweep activated.

## Metrics
| Field | Value |
|---|---|
| cycles_run | 3 |
| items_fetched | 41 |
| signals_emitted | 0 |
| signals_suppressed | 0 |
| sweep_tickers_forced | 0 |
| coverage_state_updated | yes |
| exit_status | complete |
