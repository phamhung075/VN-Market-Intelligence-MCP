# Market Watcher — Notebook

**Last updated:** 2026-05-21 04:23 UTC | **Sprint:** 051

> Full session history archived → `docs/archive/notebooks/market-watcher-2026-05-18.md`

## Current state

Last successful cycle: 2026-05-21 04:23 UTC (market-hours, 31 stocks, 0 signals >1.5σ)
Last prepost cycle: 2026-05-21 06:31 UTC (prepost, 31 stocks, 0 signals >2.5σ floor)
Last off-hours cycle: 2026-05-21 06:31 UTC (prepost, 31 stocks, 0 signals emitted)

## Known patterns / preferences

- Off-hours duplicate guard: suppress signals when prices identical to prior cycle (market closed, stale data)
- Post-market period: within 20min of 08:59 UTC close — classified as post-market
- Bootstrap reports "trading window OPEN" even when VN market is near/at close (02:00–08:59 UTC range)
- Sector rotation is logged always; suppressed signals are explicitly noted
- TIGHTENING regime applies: sigma_threshold=1.5σ, volume_multiplier=1.5x
- FII_OUTFLOW_RISK carry regime + RISK-OFF US10Y → PE compression signal for large-caps
- Chain findings from news-scout: GAS (urgent_news, chain_depth=1), PLX (urgent_news, chain_depth=1), PC1 (legal_risk)

---

## Carry-over signals (open for monitoring)

- **NVL -6.89%** (1.91σ real_estate, FX pressure + PE risk, signal 3526, critic 0.6) — last active 2026-05-20 04:35
- **TCH -6.71%** (2.10σ real_estate, FX pressure + PE risk, signal 3527, critic 0.6) — last active 2026-05-20 04:35
- **VCB +2.37%** (1.8σ SOE inflow, signal 3495, critic 0.6) — prior cycle, banking resilience

---

## Recent cycles (2026-05-21)

### Cycle (04:23–04:24 UTC) — Market-hours, TIGHTENING regime
- Stocks: 31 | Anomalies: 0 (>1.5σ threshold) | Volume spikes: 0 | Chain confirms: 2 (GAS, PLX)
- Regime: TIGHTENING | DXY: USD STABLE | US10Y: RISK-OFF | Carry: FII_OUTFLOW_RISK
- **Signals emitted**: None — all price moves within 1.5σ threshold
- Price context: GVR -3.32% (0.92σ), NVL -3.14% (0.90σ), VIC -3.09% (1.24σ), KBC -2.75% (0.78σ), DPM -2.61% (n/a), GAS -2.45% (0.61σ), PLX -2.51% (0.66σ), FPT -1.67% (1.19σ)
- Sector performance: All 16 sectors STABLE (1d snapshot only, 5d unavailable). Real estate -1.31% (NVL, KBC, VIC pressure). Oil/gas -2.37% (GAS, PLX decline linked to Brent 105.79 USD/bbl).
- Macro: Brent 105.79 USD/bbl (-3.14σ from session avg 110.14, prior CRITICAL alert 2026-05-20 15:15). USD/VND 26,161 (normal). BDI 1,400 (stable, as of 2026-04-07, data stale).
- Chain findings: news-scout emitted urgent_news (chain_depth=1) for GAS (2026-05-21 04:10:21) and PLX (2026-05-21 04:10:24) — context: "Giá dầu giảm xuống dưới 100 USD/thùng" (oil price declining below 100 USD/bbl). PC1 legal_risk signal also detected.
- Conclusion: No new anomalies >1.5σ in market-hours window. Oil sector weakness tracked but within volatility bounds. Continue monitoring Brent trend for >2σ moves. Real estate sector under FII/USD pressure but no >1.5σ moves this cycle.

## Recent cycles (2026-05-20)

### Cycle (04:35–04:36 UTC) — Market-hours, TIGHTENING
- Stocks: 31 | Anomalies: 2 (>1.5σ threshold) | Volume spikes: 0 | Chain confirms: 0
- Regime: TIGHTENING | DXY: USD STABLE | US10Y: RISK-OFF | Carry: FII_OUTFLOW_RISK
- **Signals emitted**: 
  - NVL -6.89% (1.91σ, real_estate, fx_pressure=true, pe_compression_risk=true, signal 3526)
  - TCH -6.71% (2.10σ, real_estate, fx_pressure=true, pe_compression_risk=true, signal 3527)
- Real estate sector weighted: NVL -6.89%, TCH -6.71%, KBC -4.90% — downside bias amid USD/VND 26,329 (320bp high)
- Macro: Brent 110.51 | USD/VND 26,329 | BDI 1,400 (stable supply chain)
- News context: "Xả đột biến cổ phiếu dầu khí, cao su, sắc đỏ loang rộng" — broad sell pressure affecting oil/gas (GAS -3.35%, PLX -2.38%) and real estate names

## Metrics (cycle 2026-05-21 04:23 UTC)
| Field | Value |
|---|---|
| cycles_run | 8 |
| items_fetched | 31 |
| signals_emitted | 0 |
| signals_suppressed | 0 |
| market_alerts_fired | 0 |
| exit_status | complete |
| token_estimate | 11200 |
