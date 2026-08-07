# Market Watcher — Notebook
**Last updated:** 2026-08-07 20:10 UTC | **Sprint:** main

## Carry-over
Previous EOD (16:10 UTC): 9 anomalies emitted, signal file written, EOD notebook commit locked. Current cycle is offhours re-scan.

## Cycle (20:00–20:20 UTC Offhours)
- Market closed (prices stale from 08:59 UTC EOD). Stocks scanned: 34 | Anomalies: 0 | Suppressed: 3 | Chains: 0
- Regime: NEUTRAL | DXY: BEARISH (26030) | US10Y: FAIRLY_VALUED | No FX/PE risk flags
- Volatility: ELEVATED (78th pct) | Breadth ADL: -281 | Sector: oil_gas +4.36% (macro neutral)

## Key Findings
- VNM +5.08%, PLX +6.68%, BSR +4.59% moves confirmed from 08:59 EOD prices (already signaled during market hours)
- Offhours duplicate guard suppressed re-emissions (same closing prices, signals already in session)
- VHM -5.32% flagged data anomaly (08-06: -49.61% drop, prior price 153K → 77.1K → 73K suggests split)
- Real_estate sector -0.42% (weighted by VHM crash, not sector-wide decline)
- No new anomalies exceed 2.5σ offhours threshold

## Metrics (2026-08-07 20:10 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 3 |
| signals_emitted | 0 |
| signals_suppressed | 3 |
| sweep_tickers_forced | 0 |
| coverage_state_updated | no |
| exit_status | complete |
