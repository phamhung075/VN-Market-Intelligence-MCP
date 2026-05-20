# Market Watcher — Notebook

**Last updated:** 2026-05-20 04:21 UTC | **Sprint:** 051

> Full session history archived → `docs/archive/notebooks/market-watcher-2026-05-18.md`

## Current state

Last successful cycle: 2026-05-20 04:21 UTC (market-hours, 39 stocks, 0 signals — no anomalies >1.5σ)
Last market-hours cycle: 2026-05-20 04:21 UTC (market-hours, 39 stocks, 0 signals)
Last off-hours cycle: 2026-05-19 15:37 UTC (prepost, 35 stocks, 0 signals — market closed)

## Known patterns / preferences

- Off-hours duplicate guard: suppress signals when prices identical to prior cycle (market closed, stale data)
- Post-market period: within 20min of 08:59 UTC close — classified as post-market
- Bootstrap reports "trading window OPEN" even when VN market is near/at close (02:00–08:59 UTC range)
- Sector rotation is logged always; suppressed signals are explicitly noted
- TIGHTENING regime applies: sigma_threshold=1.5σ, volume_multiplier=1.5x

---

## Carry-over signals (open for next cycle)

- **VCB +2.37%** (1.8σ SOE inflow, signal 3495, critic 0.6) — current cycle
- **BID +5.47%** (2.73σ banking resilience, signal 3399 from 2026-05-18 08:39, critic 0.6) — prior
- **PLX +6.99%** (2.0σ oil_gas surge Brent 110.51, signal 3400 from 2026-05-18 08:39, critic 0.6) — prior
- **MWG -3.66%** (2.15σ downside retail weakness escalated HIGH, signal 3401 from 2026-05-18 08:39, critic 0.6) — prior

---

## Recent cycles (2026-05-20)

### Cycle (04:21–04:22 UTC) — Market-hours
- Stocks: 39 | Anomalies: 0 (>1.5σ threshold) | Volume spikes: 0 | Chain confirms: 0
- Regime: TIGHTENING | DXY: STABLE | US10Y: RISK-OFF | fx_pressure: [] | pe_risk: []
- **Signals**: None — no price anomalies detected at 1.5σ threshold
- Sector rotation 1d: stable across all 16 sectors (insufficient 5d data)
- Macro: Brent 110.4 (+0.00%) | USD/VND 26,151 (stable) | BDI 1,400 (unchanged)
- Notable: Real estate mixed (VHM +1.78%, VIC +1.02% vs KBC -3.32%, NVL -3.89%, TCH -3.66%). Banking stable. Oil/gas sector weak (-0.36% to -1.73%).

## Recent cycles (2026-05-19)

### Cycle (15:37–15:39 UTC) — Prepost (market closed)
- Stocks: 35 | Anomalies: 0 (>2.5σ prepost floor) | Volume spikes: 0 | Chain confirms: 0
- Regime: TIGHTENING | DXY: STABLE | US10Y: RISK-OFF | fx_pressure: [] | pe_risk: []
- **Signals**: None — market closed during prepost window; EOD prices stale from 07:52 UTC session
- Sector rotation 1d: stable across all 16 sectors (1d data only, 5d unavailable)
- Macro: Brent 110.58 (+0.00%) | USD/VND 26,329 (stable) | BDI 1,400 (unchanged)
- Notable: Off-hours duplicate guard suppresses same-EOD-price re-emissions

### Cycle (04:59–05:01 UTC) — Market-hours
- Stocks: 35 | Anomalies: 1 (>1.5σ) | Volume spikes: 0 | Chain confirms: 1 (VCB prior signal 3494)
- Regime: TIGHTENING | DXY: STABLE | US10Y: RISK-OFF | fx_pressure: [] | pe_risk: []
- **Signals**: VCB +2.37% (1.8σ intra-day momentum, SOE inflow, premium valuation, signal 3495, critic 0.6)
- Sector rotation 1d: stable across all 16 sectors (no >0.5% shifts observed)
- Macro: Brent 109.87 (+0.00%) | USD/VND 26,139 (stable) | BDI 1,400 (unchanged)
- Notable: Prior VCB signal 3494 (04:49 UTC) chains into 3495 — same stock, continued momentum

## Metrics (cycle 2026-05-20 04:21 UTC)
| Field | Value |
|---|---|
| cycles_run | 3 |
| items_fetched | 39 |
| signals_emitted | 0 |
| signals_suppressed | 0 |
| market_alerts_fired | 0 |
| exit_status | complete |
| token_estimate | 5200 |
