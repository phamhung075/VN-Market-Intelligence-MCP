# Market Watcher — Notebook
**Last updated:** 2026-08-25 12:08 UTC | **Sprint:** main

## Carry-over
None

## Cycle (12:08–12:09 UTC, offhours-mode on closed market)
- Stocks: 3 (sweep-forced) | Anomalies: 0 | Suppressed: 0 | Chain findings: 0
- Regime: NEUTRAL | DXY: USD STRENGTHENING | US10Y: RISK-OFF | Carry: NEUTRAL | fx_pressure: none | pe_risk: none
- Market: CLOSED (outside 02:00–08:59 UTC window) — prices stale from 08:59 UTC
- Sweep tickers analyzed: KDC (+0.00%), MSN (-0.71%), SAB (+0.00%) — all < 2.5σ floor

## Metrics (cycle 2026-08-25 12:08 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 3 tickers (sweep-forced: KDC, MSN, SAB) |
| signals_emitted | 0 |
| signals_suppressed | 0 |
| sweep_tickers_forced | 3 |
| evidence_fragments | 3 (KDC/MSN/SAB × price_momentum_5d, direction=neutral) |
| coverage_state_updated | pending |
| exit_status | complete |

## Technical Context
- KDC: 1/4 indicators up, consensus NEUTRAL, RSI 66.0 (upper mid) → no anomaly
- MSN: 2/4 indicators up, consensus NEUTRAL, RSI 57.5 (mid), BB 92.7% width → no anomaly
- SAB: 2/4 indicators up, consensus NEUTRAL, RSI 51.0 (mid), BB 67.4% width → no anomaly

## Notes (offhours cycle, market CLOSED 09:00–02:00 UTC)
- Slot: market-watcher-offhours (scheduled 12:00Z; market closed at 12:08Z invocation)
- 2.5σ threshold floor applied (offhours stale-price suppression, same as prepost)
- Bootstrap regime: NEUTRAL (investment clock CORE_VN, oil neutral, gold risk-off, usdvnd bearish, carry neutral, yield fairly-valued)
- KDC, MSN, SAB all stale >48h in coverage state; included in sweep analysis
- None exceed 2.5σ floor (moves: 0.0%, -0.71%, 0.0%)
- No signals posted to alert-commander this cycle
- Evidence fragments recorded for price_momentum_5d pipeline (cold-start LR training)
