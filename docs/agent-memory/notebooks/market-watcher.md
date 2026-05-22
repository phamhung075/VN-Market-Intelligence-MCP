# Market Watcher — Notebook

**Last updated:** 2026-05-22 16:07 UTC | **Sprint:** 051

> Full session history archived → `docs/archive/notebooks/market-watcher-2026-05-18.md`

## Current state

Last successful cycle: 2026-05-22 16:07 UTC (eod offhours, 31 stocks with prices, 4 anomalies)
Last market-hours cycle: 2026-05-22 04:07 UTC (market-hours, 39 stocks, 3 anomalies)
Last prior cycle: 2026-05-22 03:51 UTC (market-hours, 30 stocks, 6 anomalies >1.5σ)

## Known patterns / preferences

- Off-hours duplicate guard: suppress signals when prices identical to prior cycle (market closed, stale data)
- Post-market period: within 20min of 08:59 UTC close — classified as post-market
- Bootstrap reports "trading window OPEN" even when VN market is near/at close (02:00–08:59 UTC range)
- Sector rotation is logged always; suppressed signals are explicitly noted
- Prepost floor applies: sigma_threshold≥2.5σ (overrides regime thresholds)
- Market hours mode: adaptive thresholds per regime (TIGHTENING=1.5σ, EASING=2.5σ, NEUTRAL=2.0σ)
- NEUTRAL regime (current): sigma_threshold=2.0σ baseline, downside_bias=false
- Macro backdrop: Brent $103.42 stable, USD/VND 26,340 (SBV carry spread -0.33), Gold $4,517.6, BDI 1,400 stable
- Real estate sector: structural weakness (-2.03% 1d sector avg); 6-8 stocks flagged for PE compression risk
- EOD mode: no technical indicators for 8 HNX/UPCOM tickers (below price freshness threshold); 31 tickers with prices

---

## Current cycle (2026-05-22 16:07 UTC — EOD Offhours)

**Cycle (16:07 UTC) — Market CLOSED, NEUTRAL regime (baseline 2.0σ), 39 stocks monitored, 31 with prices**
- Market status: CLOSED (outside 02:00–08:59 UTC trading window)
- Stocks: 39 total | Prices available: 31 | N/A (HNX/UPCOM): 8 (BDI, DLC, ACV, VDC, SIS, JSH)
- Anomalies: 4 flagged (VNH -10%, VHM -3.75%, VRE -3.35%, GAS -2.75%)
- Signal file: docs/signals/price_anomaly_20260522T1600.json (atomically written)
- Technical indicators: all tickers insufficient history (5-22 candles vs. 35 required for MACD); known backlog condition (1970-TA-OHLCV-BACKFILL WIP)
- Regime: NEUTRAL → base 2.0σ | DXY: USD STABLE | US10Y: RISK-OFF | Carry: NEUTRAL (-0.33 VND carry spread)
- **Signals emitted**: 1 signal file (eod mode, no channel alerts)
- Sector flags: Real estate -2.03% sector avg (VNH -10%, VHM -3.75%, VRE -3.35%, KBC -0.32%, TCH +0.32%, D2D +0.45%, NVL +1.31%); banking -0.92% sector avg (BID -1.83%, VCB -2.16%, others mixed); oils_gas -2.54% sector avg (GAS -2.75%, PLX -2.33%); steel +1.33% (resilience); securities +0.63% (mixed)
- Macro backdrop: Brent $103.42 stable, USD/VND 26,340 (carry pressure), Gold $4,517.6, global liquidity TIGHTENING, US10Y RISK-OFF (PE compression)
- Top movers: VNH -10.00% (HNX extreme move, 5 candles history), VHM -3.75% (real estate sector lead), VRE -3.35% (real estate persistent weakness), GAS -2.75% (FX + commodity pressure), BID -1.83% (banking sector pressure), VCB -2.16% (banking sector lead)
- Real estate sector: Continued weakness across 6+ tickers; VNH extreme move (-10%) + VHM/VRE all >3% = systematic sector capitulation into NEUTRAL/RISK-OFF environment. VIC bullish catalyst (news-scout 0.75, 2026-05-22 03:52) visible in signal file but not translating to price recovery = confidence gap.
- Supply chain: BDI N/A (UPCOM, closed), no disruptions flagged
- Market intelligence: Insider activity nil at EOD window; open chain findings: 0 (from 2026-05-22 15:30–16:00 window)
- Market status: CLOSED (16:00 UTC window). Price data fresh from 2026-05-22 08:30–09:00 VN time (HOSE/HNX last close). Conclusion: Real estate sector under sustained systematic pressure (NEUTRAL regime RISK-OFF environment, US10Y pressuring PE valuations). Energy sector FX + commodity headwinds. Banking sector risk-off sell. Signal file contains full EOD snapshot with brief_action recommendations per ticker. Next cycle: 2026-05-23 02:00 UTC (market hours).

## Metrics (current cycle 2026-05-22 16:07 UTC — eod offhours)

| Field | Value |
|---|---|
| cycle_type | eod-offhours |
| regime | NEUTRAL |
| sigma_threshold | 2.0 (baseline) |
| items_fetched | 39 |
| items_with_prices | 31 |
| items_with_n_a | 8 |
| signals_emitted | 1 (signal file) |
| signals_suppressed | 0 |
| anomalies_detected | 4 |
| chain_confirms | 0 |
| insider_activity_flagged | 0 |
| market_alerts_fired | 0 |
| supply_chain_status | stable (BDI N/A, no disruptions) |
| technical_indicator_readiness | BLOCKED (5-22 candles <35 min for MACD) |
| exit_status | complete |
| token_estimate | ~6,800 |

---

## Archive reference

Previous cycles: 2026-05-22 04:07 UTC (market-hours, 3 signals), 03:51 UTC (market-hours, 6 signals >1.5σ) → see docs/archive/notebooks/market-watcher-2026-05-18.md
