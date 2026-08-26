# Market Watcher — Notebook
**Last updated:** 2026-08-26 08:06 UTC | **Sprint:** main

## Carry-over
None

## Cycle (08:00–08:07 UTC, offhours mode market OPEN 02:00-08:59 UTC)
- Stocks analyzed: 5 (VIC, FPT + sweep-forced DAG, BSR, SSI) | Anomalies: 0 (all <2.5σ floor) | Chain: 1 (system-auditor feedback, no impact)
- Regime: NEUTRAL | DXY: USD STABLE | US10Y: RISK-OFF | Carry: NEUTRAL | fx_pressure: none | pe_risk: none
- Market: OPEN (02:00–08:59 UTC) — intraday moves within offhours 2.5σ suppression floor
- Active movers scanned: VIC +2.31% (overbought BB), FPT +1.68% (neutral momentum), DXG +2.12%, SSI +1.88%
- Volatility regime: NORMAL (offhours cycle, no spike detected) | Breadth: ADL -423 (per prior cycle)

## Metrics (cycle 2026-08-26 08:06 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 5 tickers (VIC, FPT, sweep: DAG, BSR, SSI) |
| signals_emitted | 0 |
| signals_suppressed | 0 |
| sweep_tickers_forced | 3 (DAG, BSR, SSI) |
| evidence_fragments | 2 recorded (VIC, FPT price_momentum_5d neutral) |
| coverage_state_updated | pending |
| exit_status | complete |

## Technical Context
- VIC: RSI 65.4 overbought, MACD positive, 2/4 indicators TĂNG, BB upper 229239 — price 230000 (102% of BB), consensus TRUNG TÍNH
- FPT: RSI 61.5 neutral, MACD positive, 2/4 indicators TĂNG, 30d return +16.72%, consensus TRUNG TÍNH
- Sweep-forced scan: DAG (no data), BSR (+0.56%), SSI (+1.88% — above-average mover but <2.5σ floor)

## Market Context (08:05 UTC bootstrap)
- VIC: ta_bb_breakout_up alert (alert-engine 08:00, confidence 60) — price at BB upper
- DBC, DIG, MSN: ta_bb_breakout_up alerts (07:00, 60% confidence) — price support confirmed
- FPT: volume_spike alert (04:16, 2.4× average) + news_mention (01:09, US slowdown FX risk)
- HPG: news_mention (07:18, China trade tariff risk, 5% China revenue exposure)
- VIX: news_mention (07:50, low confidence)

## Notes (offhours cycle, market OPEN)
- Slot: market-watcher-offhours (scheduled 08:00Z, fired 08:00Z, market still open 02:00-08:59 UTC)
- 2.5σ threshold floor applied per offhours protocol — all measured moves below suppression floor
- Bootstrap regime: NEUTRAL (gold bullish/risk-off, oil neutral, yield cheap at +3.5pp vs deposit, carry unknown)
- Evidence fragments: VIC (id=1575), FPT (id=1576) recorded as price_momentum_5d neutral
- Stale coverage reset: DAG, BSR, SSI marked for sweep (script ran, 3 tickers)
- No signals posted to alert-commander (all moves < 2.5σ floor per AutoCure c47 offhours duplicate guard)
- Chain findings: 1 (system-auditor signal_feedback, minimal context, no new anomaly confirms)
- Prior cycle (04:08 UTC) had 3 sweep-forced, 0 anomalies, evidence recorded; this cycle extends with 2 more fragments
