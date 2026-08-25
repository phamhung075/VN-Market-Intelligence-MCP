# Market Watcher — Notebook
**Last updated:** 2026-08-25 08:00 UTC | **Sprint:** main

## Carry-over
None

## Cycle (08:00–08:09 UTC, offhours-mode on open market)
- Stocks: 6 analyzed (3 anomaly-driven + 3 sweep-forced) | Anomalies: 3 (>2.5σ floor) | Suppressed: 3 | Chain findings: 1 (VIC)
- Regime: NEUTRAL | DXY: USD STRENGTHENING | US10Y: RISK-OFF | Carry: NEUTRAL | fx_pressure: none | pe_risk: none
- DBC: +6.63% (agriculture, neutral technicals 2/4) | VIC: +2.80% (real_estate, neutral technicals 2/4) | HUT: +3.85% (construction, neutral technicals 1/4)

## Metrics (cycle 2026-08-25 08:00 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 6 tickers (3 anomaly-driven + 3 sweep-forced FPT/GEX/DPM) |
| signals_emitted | 0 (suppressed: neutral technicals override move size) |
| signals_suppressed | 3 |
| sweep_tickers_forced | 3 (FPT, GEX, DPM all stale >48h) |
| evidence_fragments | 6 (3 tickers × 2 types: 5d + 20d momentum, all neutral) |
| coverage_state_updated | pending |
| exit_status | complete |

## Technical Context
- DBC: MA mixed, RSI 63.4 (mid), MACD bullish, BB 128.3% width (overbought) → 2/4 indicators up, consensus NEUTRAL
- VIC: MA mixed, RSI 59.4 (mid), MACD bullish, BB 81.4% width (overbought) → 2/4 indicators up, consensus NEUTRAL
- HUT: MA mixed, RSI 41.5 (mid), MACD weak bullish, BB 44.4% width → 1/4 indicators up, consensus NEUTRAL
- Evidence fragments recorded (price_momentum_5d and price_momentum_20d for all 3 tickers, direction=neutral, magnitude=0.3)
- Market breadth: ADL -423 (negative trend), vol regime NORMAL (40th percentile), no thrust triggered
- Open chains: 4 findings (1 VIC from news-scout, 1 VPB, 2 macro catalysts)

## Notes (offhours cycle, market OPEN 02:00–08:59 UTC)
- Slot: market-watcher-offhours (explicit 08:00Z invocation via cowork scheduler)
- 2.5σ threshold floor applied (offhours equivalent, same as prepost)
- Bootstrap regime: NEUTRAL (investment clock CORE_VN, oil neutral, gold risk-off, usdvnd bearish, carry neutral, yield fairly-valued)
- DBC, VIC, HUT all exceed 2.5σ via price moves but show neutral technical consensus (no directional conviction)
- Suppression rule applied: neutral technicals = evidence fragments recorded for LR pipeline, no real-time signal escalation (per Step 4)
- Market is OPEN; off-hours duplicate guard not invoked (applies only to market-CLOSED EOD rescans)
- No signals posted to alert-commander this cycle
