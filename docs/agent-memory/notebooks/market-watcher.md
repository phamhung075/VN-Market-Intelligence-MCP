# Market Watcher — Notebook
**Last updated:** 2026-08-13 12:13 UTC | **Sprint:** 2026-08-13

## Carry-over
(none)

## Cycle (12:08–12:13 UTC, offhours mode)
- Stocks: 6 | Anomalies: 0 (all <2.5σ floor) | Volume spikes: 0 | Chain confirms: 0
- Regime: NEUTRAL(fallback, no REGIME field in macro_snapshot JSON) | DXY: NEUTRAL(fallback) | US10Y: NEUTRAL(fallback) | fx_pressure: [] | pe_risk: []
- Sweep forced: 3 (DBC, DPM, KDC — stale >48h, re-swept same set as prior cycle)

## Metrics (cycle 2026-08-13 12:13 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 6 |
| signals_emitted | 0 |
| signals_suppressed | 0 |
| sweep_tickers_forced | 3 |
| coverage_state_updated | no (mutex acquire failed 5x — script bug, ttl_seconds:30 < schema min 60; BUG reported) |
| exit_status | complete |

## Analysis
Sweep (DBC, DPM, KDC): all TRUNG TÍNH on 60d+120d technical (MACD bullish histogram, RSI neutral 41-62, MA mixed). DBC trades at 33% PE / 31% PB discount to agri-sector median with ROE 20.3% above median (6.2x vs 9.3x) — cheapest name in coverage. DPM +137% PE premium to sector, KDC +206% PE premium — both rich vs peers despite soft technicals. No insider activity, no BCTC data for DBC/KDC (gap). Evidence fragments recorded (price_momentum_5d + 20d, all neutral, 6 total).

Movers screened (EIB -3.85%/1.42σ, VRE -3.34%/1.00σ, GEX -2.87%/0.68σ): real 30d dailyStdDev computed from get_price_history — none clear the offhours 2.5σ floor despite large %-moves; these are simply high-volatility names (GEX stddev 4.2%/day). No volume spikes vs 30d avg (today's volumes all well below average — thin off-hours session). VIC (-3.53%, already signaled this session at 08:09 cycle, unchanged close) not re-run — AutoCure duplicate guard applies, no re-check needed.

Market context: vol_regime ELEVATED (76th %ile RV20d), breadth weak (19 new 52w lows vs 0 new highs, ADL -278), relative_strength tool errored (500, logged skip). Liquidity: OMO/interbank both blocked at source (VPS/HTML parse gaps, is_estimate). Macro: USDVND 25870 bearish/depreciating, gold bullish (safe-haven), oil neutral ($87.31, in-band). Macro-health-read fully degraded this cycle — no PMI/CPI/FDI live tools yet, all tracks is_estimate=true.
