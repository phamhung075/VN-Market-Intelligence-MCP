# Market Watcher — Notebook

**Last updated:** 2026-05-20 04:37 UTC | **Sprint:** 051

> Full session history archived → `docs/archive/notebooks/market-watcher-2026-05-18.md`

## Current state

Last successful cycle: 2026-05-20 04:37 UTC (prepost, 31 stocks, 2 signals >2.5σ prepost floor)
Last market-hours cycle: 2026-05-20 04:35 UTC (market-hours, 31 stocks, 2 signals >1.5σ)
Last off-hours cycle: 2026-05-20 04:37 UTC (prepost, 31 stocks, 2 anomalies)

## Known patterns / preferences

- Off-hours duplicate guard: suppress signals when prices identical to prior cycle (market closed, stale data)
- Post-market period: within 20min of 08:59 UTC close — classified as post-market
- Bootstrap reports "trading window OPEN" even when VN market is near/at close (02:00–08:59 UTC range)
- Sector rotation is logged always; suppressed signals are explicitly noted
- TIGHTENING regime applies: sigma_threshold=1.5σ, volume_multiplier=1.5x
- FII_OUTFLOW_RISK carry regime + RISK-OFF US10Y → PE compression signal for large-caps

---

## Carry-over signals (open for next cycle)

- **NVL -6.89%** (1.91σ real_estate, FX pressure + PE risk, signal 3526, critic 0.6) — current
- **TCH -6.71%** (2.10σ real_estate, FX pressure + PE risk, signal 3527, critic 0.6) — current
- **VCB +2.37%** (1.8σ SOE inflow, signal 3495, critic 0.6) — prior cycle
- **BID +5.47%** (2.73σ banking resilience, signal 3399 from 2026-05-18 08:39, critic 0.6) — archived
- **PLX +6.99%** (2.0σ oil_gas surge Brent 110.51, signal 3400 from 2026-05-18 08:39, critic 0.6) — archived
- **MWG -3.66%** (2.15σ downside retail weakness escalated HIGH, signal 3401 from 2026-05-18 08:39, critic 0.6) — archived

---

## Recent cycles (2026-05-20)

### Cycle (04:37–04:38 UTC) — Prepost, Prepost floor applied
- Stocks: 31 | Anomalies: 2 (>2.5σ prepost floor) | Volume spikes: 0 | Chain confirms: 0
- Regime: TIGHTENING | DXY: STABLE | US10Y: RISK-OFF | fx_pressure: [] | pe_risk: []
- **Signals emitted**: 
  - TCH -6.71% (3.05σ, real_estate sector selloff, signal 3528, critic 0.6)
  - KBC -4.90% (2.72σ, real_estate PE discount, signal 3529, critic 0.6)
- Prepost floor successfully suppressed illiquid-hour noise: NVL -6.89% (2.03σ, sub-threshold), GVR -5.88% (1.43σ, sub-threshold)
- Sector rotation 1d: STABLE across all 16 sectors (1d only, 5d unavailable)
- Real estate weakness: TCH -6.71%, KBC -4.90% vs sector -4.2%. KBC PE=13.8 (discount -29% vs median 19.3)
- Macro: Brent 110.4 (+0.00%) | USD/VND 26,151 (stable) | BDI 1,400 (unchanged)
- Chain context: NVL (3526) and TCH (3527) from prior market-hours cycle carry forward. New KBC signal (3529) extends real estate weakness theme.

### Cycle (04:35–04:36 UTC) — Market-hours, TIGHTENING
- Stocks: 31 | Anomalies: 2 (>1.5σ threshold) | Volume spikes: 0 | Chain confirms: 0
- Regime: TIGHTENING | DXY: USD STABLE | US10Y: RISK-OFF | Carry: FII_OUTFLOW_RISK
- **Signals**: 
  - NVL -6.89% (1.91σ, real_estate, fx_pressure=true, pe_compression_risk=true, signal 3526)
  - TCH -6.71% (2.10σ, real_estate, fx_pressure=true, pe_compression_risk=true, signal 3527)
- Sector rotation 1d: STABLE across all 16 sectors (insufficient 5d data)
- Real estate sector weighted: NVL -6.89%, TCH -6.71%, KBC -4.90%, VRE -1.49%, VHM +0.06%, VIC +0.36% — downside bias amid USD/VND 26,329 (320bp high)
- Macro: Brent 110.51 | USD/VND 26,329 | BDI 1,400 (stable supply chain)
- News context: "Xả đột biến cổ phiếu dầu khí, cao su, sắc đỏ loang rộng" — broad sell pressure affecting oil/gas (GAS -3.35%, PLX -2.38%) and real estate names
- Chain findings: FPT, POW, VPB news signals from news-scout (15min lookback, no direct price triggers)

### Cycle (04:21–04:22 UTC) — Market-hours
- Stocks: 39 | Anomalies: 0 (>1.5σ threshold) | Volume spikes: 0 | Chain confirms: 0
- Regime: TIGHTENING | DXY: STABLE | US10Y: RISK-OFF | fx_pressure: [] | pe_risk: []
- **Signals**: None — no price anomalies detected at 1.5σ threshold
- Sector rotation 1d: stable across all 16 sectors (insufficient 5d data)
- Macro: Brent 110.4 (+0.00%) | USD/VND 26,151 (stable) | BDI 1,400 (unchanged)
- Notable: Real estate mixed (VHM +1.78%, VIC +1.02% vs KBC -3.32%, NVL -3.89%, TCH -3.66%). Banking stable. Oil/gas sector weak (-0.36% to -1.73%).

## Metrics (cycle 2026-05-20 04:37 UTC)
| Field | Value |
|---|---|
| cycles_run | 5 |
| items_fetched | 31 |
| signals_emitted | 4 |
| signals_suppressed | 0 |
| market_alerts_fired | 0 |
| exit_status | complete |
| token_estimate | 9200 |
