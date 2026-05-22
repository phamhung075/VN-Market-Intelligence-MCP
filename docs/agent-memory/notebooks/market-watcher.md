# Market Watcher — Notebook

**Last updated:** 2026-05-22 04:07 UTC | **Sprint:** 051

> Full session history archived → `docs/archive/notebooks/market-watcher-2026-05-18.md`

## Current state

Last successful cycle: 2026-05-22 04:07 UTC (market-hours, 39 stocks, 3 anomalies)
Last prior cycle: 2026-05-22 03:51 UTC (market-hours, 30 stocks, 6 anomalies >1.5σ)
Last prepost cycle: 2026-05-22 01:36 UTC (prepost, 30 stocks, 0 signals >2.5σ floor)

## Known patterns / preferences

- Off-hours duplicate guard: suppress signals when prices identical to prior cycle (market closed, stale data)
- Post-market period: within 20min of 08:59 UTC close — classified as post-market
- Bootstrap reports "trading window OPEN" even when VN market is near/at close (02:00–08:59 UTC range)
- Sector rotation is logged always; suppressed signals are explicitly noted
- Prepost floor applies: sigma_threshold≥2.5σ (overrides regime thresholds)
- Market hours mode: adaptive thresholds per regime (TIGHTENING=1.5σ, EASING=2.5σ, NEUTRAL=2.0σ)
- NEUTRAL regime (current): sigma_threshold=2.0σ baseline, downside_bias=false
- Macro backdrop: Brent $104.2, USD/VND 26,160 (SBV), Gold $4,529.7, BDI 1,400 stable
- Real estate sector: structural weakness (-2.03% 1d sector avg); 6 stocks flagged for PE compression risk

---

## Current cycle (2026-05-22 04:07 UTC — Market Hours)

**Cycle (04:07 UTC) — Market OPEN, NEUTRAL regime (2.0σ threshold), 39 stocks monitored**
- Stocks: 39 | Anomalies: 3 (>2.0σ equivalent) | Volume spikes: 0 | Chain confirms: 8 (KBC, VRE, VHM, HCM, DPM, VIC, MWG)
- Regime: NEUTRAL → base 2.0σ | DXY: USD STABLE | US10Y: RISK-OFF | Carry: NEUTRAL
- **Signals emitted**: 3 (VNH -10.00% id=3689, VHM -4.26% id=3690, BID -2.17% id=3691)
- Sector flags: Real estate -2.03% sector avg (broad weakness, 6-stock pattern: VNH -10.00%, VHM -4.26%, VIC -3.43%, VRE -3.51%, KBC -3.48%, TCH -0.32%); banking -0.92% sector avg (BID -2.17% outperformer decline); oils_gas -1.81% sector avg (GAS -2.18%, PLX -1.40%)
- Macro backdrop: Brent $104.2 stable, USD/VND 26,160 (SBV), Gold $4,529.7, BDI 1,400 no disruptions
- Top movers: VNH -10.00% (real estate HNX extreme move, limited history), VHM -4.26% (real estate HOSE sector lead), VIC -3.43% (real estate chain catalyst bullish 0.75, price pressure), VRE -3.51% (real estate persistent weakness), KBC -3.48% (real estate broad sell), BID -2.17% (banking sector weakness), GAS -2.18% (oil/gas FX pressure + commodity risk), HCM -2.25% (securities RISK-OFF pressure)
- Real estate sector: Continued weakness across 6 tickers; VNH extreme move (-10%) + VHM/VIC/VRE/KBC all >3% = systematic sector capitulation into NEUTRAL/RISK-OFF environment. VIC has bullish chain catalyst (news-scout, 0.75 confidence, 2026-05-22 03:52) but still down 3.43% = confidence gap between narrative (bullish) and price (bearish)
- Supply chain: BDI 1,400 stable, no disruptions, no exceptional events detected
- Chain findings: 8 open findings from prior cycles (KBC id=3676, VRE id=3677, VHM id=3678, HCM id=3679, DPM id=3680, VIC id=3681 news-scout bullish 0.75, MWG id=3683 urgent_news). Market-watcher now validates 3 core anomalies (VNH, VHM, BID) in current cycle 04:07; VIC bullish catalyst not translating to price recovery.
- Market status: OPEN (02:00–08:59 UTC). Price data fresh from 2026-05-22 04:05-04:07 UTC. Off-hours duplicate guard: NOT APPLICABLE (market OPEN). Conclusion: Real estate sector under sustained systematic pressure (NEUTRAL regime RISK-OFF environment, US10Y pressuring PE valuations). 3 signals detected and posted to alert-commander. Next cycle in ~8min (04:15 UTC).

## Metrics (current cycle 2026-05-22 04:07 UTC — market-hours)

| Field | Value |
|---|---|
| cycle_type | market-hours |
| regime | NEUTRAL |
| sigma_threshold | 2.0 |
| items_fetched | 39 |
| signals_emitted | 3 |
| signals_suppressed | 0 |
| anomalies_filtered_for_threshold | 3 (VNH, VHM, BID) |
| chain_confirms | 8 (cross-validated) |
| market_alerts_fired | 0 |
| supply_chain_status | stable (BDI 1,400) |
| exit_status | complete |
| token_estimate | ~7,200 |

---

## Archive reference

Previous cycles: 2026-05-22 03:51 UTC (market-hours, 6 signals >1.5σ), 03:37 UTC → see docs/archive/notebooks/market-watcher-2026-05-18.md
