# Market Watcher — Notebook
**Last updated:** 2026-08-26 04:08 UTC | **Sprint:** main

## Carry-over
None

## Cycle (04:08–04:09 UTC, offhours mode market OPEN 02:00-08:59 UTC)
- Stocks: 3 (sweep-forced) + 3 (evidence recorded) | Anomalies: 0 | Suppressed: 0 | Chain findings: 0
- Regime: NEUTRAL | DXY: USD STRENGTHENING | US10Y: RISK-OFF | Carry: NEUTRAL | fx_pressure: none | pe_risk: none
- Market: OPEN (02:00–08:59 UTC) — intraday small moves within offhours 2.5σ floor
- Sweep tickers analyzed: VCB (+0.33%), DGC (+1.58%), DAG (no data) — all < 2.5σ floor, no anomalies
- Active tickers monitored: FPT (+0.98%), HUT (-1.50%), PDR (-1.96%) — all < 2.5σ floor
- Volatility regime: NORMAL (RV20d 17.6%, 40th percentile) | Breadth declining (ADL -423)

## Metrics (cycle 2026-08-26 04:08 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 6 tickers (sweep: 3, active: 3) |
| signals_emitted | 0 |
| signals_suppressed | 0 |
| sweep_tickers_forced | 3 (VCB, DGC, DAG) |
| evidence_fragments | 3 recorded (VCB, DGC, FPT price_momentum_5d) |
| coverage_state_updated | pending |
| exit_status | complete |

## Technical Context
- VCB: 2/4 indicators TĂNG, RSI 57.5 (neutral) → TRUNG TÍNH consensus → sweep-forced, no anomaly
- DGC: 2/4 indicators TĂNG, RSI 60.9 (neutral, overbought positioning) → TRUNG TÍNH consensus → sweep-forced, no anomaly  
- FPT: 2/4 indicators TĂNG, RSI 59.8 (neutral, overbought positioning) → TRUNG TÍNH consensus → active monitor

## Market Context
- Breadth: ADL -423, thrust not triggered, McClellan warmup (21 sessions)
- Momentum: VIC (+3.2σ leader), VHM (+1.97σ leader), SAB (leader); DGC, GEX, VCI lagging
- Strength: VIC STRONG (95.1), VNM STRONG (89.2), KDC STRONG (86.3); many weak (DAG, DBC, DGC, EIB, GEX, KDH, PDR, SSI, VCI, VHM, VIX)
- 52w Positioning: KDC NEAR_HIGH; DAG, HUT AT_LOW; most mid-range
- Net new highs: -12 (1 new high, 13 new lows)

## Macro Snapshot (04:07 UTC)
- Oil NEUTRAL: 85.17/bbl ($60–$100 band)
- Gold BULLISH: 4702/oz (>$2200 risk-off signal)
- USDVND BEARISH: 25920 (VND depreciation, >25000 threshold)
- Carry NEUTRAL: 1.37pp spread (SBV 5.00% vs Fed 3.63%)
- Yield CHEAP: Equity yield 8.2% >> Deposit 5.0% (+3.2pp spread, strong risk premium)
- Investment Clock: CORE_VN (tier 8/10)

## Notes (offhours cycle, market OPEN)
- Slot: market-watcher-offhours (scheduled 04:00Z, market opened 02:00Z)
- 2.5σ threshold floor applied (offhours, offhours-equivalent suppression)
- Bootstrap regime: NEUTRAL (gold risk-off, oil neutral, yield attractive, carry balanced)
- VCB, DGC sweep-forced; DAG missing data (no 30d history available)
- Evidence fragments: VCB, DGC, FPT recorded as price_momentum_5d (id: 1568, 1570, 1572)
- No signals posted to alert-commander this cycle (all moves < 2.5σ floor)
- No macro regime shift detected vs 00:07Z cycle
