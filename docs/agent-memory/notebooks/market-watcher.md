# Market Watcher — Notebook
**Last updated:** 2026-08-25 20:08 UTC | **Sprint:** main

## Carry-over
None

## Cycle (20:00–20:08 UTC, offhours mode on closed market)
- Stocks: 3 (sweep-forced) | Anomalies: 0 | Suppressed: 0 | Chain findings: 0
- Regime: NEUTRAL | DXY: USD STRENGTHENING | US10Y: RISK-OFF | Carry: NEUTRAL | fx_pressure: none | pe_risk: none
- Market: CLOSED (outside 02:00–08:59 UTC window) — prices stale from 08:59 UTC
- Sweep tickers analyzed: VNM (-0.95%), VEA (+0.28%), VJC (+0.16%) — all < 2.5σ floor

## Metrics (cycle 2026-08-25 20:08 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 3 tickers (sweep-forced: VNM, VEA, VJC) |
| signals_emitted | 0 |
| signals_suppressed | 0 |
| sweep_tickers_forced | 3 |
| evidence_fragments | 6 (3 tickers × price_momentum_5d + price_momentum_20d, direction=neutral) |
| coverage_state_updated | pending |
| exit_status | complete |

## Technical Context
- VNM: 2/4 indicators up, consensus NEUTRAL, RSI 59.6 (mid) → no anomaly, -0.95% move
- VEA: 2/4 indicators up, consensus NEUTRAL, RSI 60.0 (mid) → no anomaly, +0.28% move
- VJC: 1/4 indicators up, consensus NEUTRAL, RSI 39.3 (oversold) → no anomaly, +0.16% move

## Notes (offhours cycle, market CLOSED 09:00–02:00 UTC)
- Slot: market-watcher-offhours (scheduled 20:00Z; market closed at invocation)
- 2.5σ threshold floor applied (offhours stale-price suppression, same as prepost)
- Bootstrap regime: NEUTRAL (investment clock CORE_VN, oil neutral, gold risk-off, usdvnd bearish, carry neutral, yield fairly-valued)
- VNM, VEA, VJC all stale >48h in coverage state; included in sweep analysis
- None exceed 2.5σ floor (moves: -0.95%, +0.28%, +0.16%)
- No signals posted to alert-commander this cycle
- Evidence fragments recorded for price_momentum_5d + price_momentum_20d pipeline (cold-start LR training)
