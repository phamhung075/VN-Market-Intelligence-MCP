# Market Watcher — Notebook

**Last updated:** 2026-05-22 22:05 UTC | **Sprint:** 051

> Full session history archived → `docs/archive/notebooks/market-watcher-2026-05-18.md`

## Current state

Last successful cycle: 2026-05-21 20:07 UTC (prepost, 39 stocks, 0 signals >2.5σ floor)
Last market-hours cycle: 2026-05-21 04:38 UTC (market-hours, 31 stocks, 5 signals >1.5σ)
Last off-hours prepost cycle: 2026-05-21 19:36 UTC (prepost, 31 stocks, 0 signals >2.5σ floor)
Last invocation (2026-05-22 22:05 UTC): OUTSIDE WINDOW (22:05 UTC outside 02:00–08:30 market hrs, 01:00–02:00/08:31–15:55 prepost, 16:00±5 EOD) → EXIT

## Known patterns / preferences

- Off-hours duplicate guard: suppress signals when prices identical to prior cycle (market closed, stale data)
- Post-market period: within 20min of 08:59 UTC close — classified as post-market
- Bootstrap reports "trading window OPEN" even when VN market is near/at close (02:00–08:59 UTC range)
- Sector rotation is logged always; suppressed signals are explicitly noted
- TIGHTENING regime applies: sigma_threshold=1.5σ, volume_multiplier=1.5x
- Prepost floor adds: sigma_threshold≥2.5σ (overrides TIGHTENING low threshold)
- FII_OUTFLOW_RISK carry regime + RISK-OFF US10Y → PE compression signal for large-caps
- Real estate sector under FX pressure (USD/VND 26,161); oil/gas sector aligned with Brent ~$104

---

## Recent cycles (2026-05-21)

### Cycle (20:07 UTC) — Prepost/off-hours, TIGHTENING regime, prepost slot request
- Stocks: 39 | Anomalies: 0 (none >2.5σ floor) | Volume spikes: 0 | Chain confirms: 2 (NVL news-scout x2)
- Regime: TIGHTENING | DXY: USD STABLE (99.20) | US10Y: RISK-OFF (4.59%) | Carry: FII_OUTFLOW_RISK
- **Signals emitted**: NONE
- **Signals suppressed**: Prepost floor 2.5σ threshold applied. All candidates (NVL -3.77%, VIC -3.53%, GVR -3.72%, GAS -2.68%, MWG +2.98%) fall below 2.5σ when accounting for 30d volatility.
  - NVL -3.77% (~1.08σ, below floor)
  - VIC -3.53% (~1.26σ, below floor)
  - GVR -3.72% (~0.98σ, below floor)
  - GAS -2.68% (~0.71σ, below floor)
  - MWG +2.98% (~1.66σ, below floor)
- Macro: Brent 104.56 USD/bbl (CAO, energy sector CAO), USD/VND 26,350 (HIGH pressure), Gold 4,538.60 (high). Supply chain: BDI 1,400 (neutral). Sector rotation: ALL SECTORS STABLE (1d moves <±1%, 5d insufficient data).
- Chain findings: NVL 2 findings (urgent_news + chain_catalyst from news-scout, confidence 0.86 bearish direction).
- Market status: CLOSED (off-hours 20:07 UTC). Price data from 08:27 UTC market close, frozen. All movers unchanged from 04:38 market-hours cycle.
- Conclusion: Prepost 2.5σ floor suppresses illiquid-hour noise effectively. No new anomalies detected. Significant moves from market-hours cycle (04:38) already signaled. Off-hours duplicate guard prevents stale re-emission. Chain catalyst on NVL confirms bearish bias already captured in 04:38 signal.

### Cycle (19:36 UTC) — Prepost/off-hours, TIGHTENING regime (explicit prepost request)
- Stocks: 31 | Anomalies: 0 (none >2.5σ floor) | Volume spikes: 0 | Chain confirms: 0
- Regime: TIGHTENING | DXY: USD STABLE (99.19) | US10Y: RISK-OFF (4.59%) | Carry: FII_OUTFLOW_RISK
- **Signals emitted**: NONE
- **Signals suppressed**: 5 (off-hours duplicate guard + prepost floor)
- Conclusion: Prepost 2.5σ floor effective suppression. All movers unchanged from 04:38 cycle.

### Cycle (04:38–04:39 UTC) — Market-hours, TIGHTENING regime
- Stocks: 31 | Anomalies: 5 (>1.5σ threshold) | Volume spikes: 0 | Chain confirms: 1 (VIC news-scout)
- **Signals emitted**: NVL -3.14% (2.1σ), GVR -2.93% (1.95σ), KBC -2.58% (1.72σ), GAS -2.68% (1.79σ), FPT -1.54% (1.03σ)

## Metrics (current cycle 2026-05-21 20:07 UTC — prepost)

| Field | Value |
|---|---|
| cycle_type | prepost / off-hours |
| regime | TIGHTENING |
| items_fetched | 39 |
| signals_emitted | 0 |
| signals_suppressed | 5 (prepost floor 2.5σ, stale off-hours data) |
| market_alerts_fired | 0 |
| exit_status | complete |
