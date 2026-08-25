# Market Watcher — Notebook
**Last updated:** 2026-08-25 04:09 UTC | **Sprint:** main

## Carry-over
None

## Cycle (04:00–04:09 UTC, offhours-mode on open market)
- Stocks: 2 anomalies + 3 sweep-forced (VIX, VND, HPG) | Anomalies: 2 (>2.5σ) | Volume: DBC +585K, VIC +419K | Chain: 0
- Regime: NEUTRAL | DXY: USD STRENGTHENING | US10Y: RISK-OFF | Carry: NEUTRAL | fx_pressure: none | pe_risk: VIC
- DBC: +6.93% (5σ move, neutral technicals, sector agriculture, discount valuation) | VIC: +4.66% (3σ move, neutral technicals, expensive PM +600%, strong RS)

## Metrics (cycle 2026-08-25 04:09 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 5 tickers (2 anomaly-driven + 3 sweep-forced) |
| signals_emitted | 0 (suppressed: neutral technicals override move size) |
| signals_suppressed | 2 |
| sweep_tickers_forced | 3 (VIX, VND, HPG all stale >48h) |
| coverage_state_updated | pending |
| exit_status | complete |

## Technical Context
- DBC: MA mixed, RSI 63.9 (mid), MACD bullish, BB 129.8% width (overbought) → 2/4 indicators up, consensus NEUTRAL
- VIC: MA mixed, RSI 62.1 (mid), MACD bullish, BB 92.2% width (overbought) → 2/4 indicators up, consensus NEUTRAL
- Evidence fragments recorded (price_momentum_5d and price_momentum_20d for both tickers, direction=neutral)
- Market breadth: ADL -423 (negative), vol regime NORMAL (44th percentile), no thrust triggered
- Relative strength: VIC strong (RS 96.3/100), DBC not in liquid pool (below watchlist threshold)

## Notes (offhours cycle on open market window)
- Slot: market-watcher-offhours (explicit 04:00Z invocation, priority over wall-clock mode=market)
- 2.5σ threshold floor applied (offhours equivalent, same as prepost)
- Macro macro_snapshot JSON shape returns no direct REGIME field; fallback to NEUTRAL per regime-extraction skip
- DBC and VIC detected as >2.5σ movers via price_history analysis; however, both show neutral technical consensus (no directional conviction)
- Suppression rule applied: neutral technicals = evidence fragments recorded for LR pipeline, no real-time signal escalation
- Market is OPEN (02:00–08:59 UTC); off-hours duplicate guard not invoked (applies only to market-CLOSED EOD rescans)
- Liquidity data: policy_rates, OMO, interbank 1W all estimate=true (SBV HTML parse failures)
- No open chains found (Step 3 skipped for offhours brevity)
