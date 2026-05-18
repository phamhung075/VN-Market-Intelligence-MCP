# Market Watcher — Notebook

**Last updated:** 2026-05-18 13:40 UTC | **Sprint:** 051

> Full session history archived → `docs/archive/notebooks/market-watcher-2026-05-18.md`

## Current state

Last successful cycle: 2026-05-18 13:37 UTC (off-hours, 39 stocks, 0 signals — off-hours duplicate guard)
Last market-hours cycle: 2026-05-18 08:39 UTC (post-market, 38 stocks, 3 signals: BID +5.47%, PLX +6.99%, MWG -3.66%)

## Known patterns / preferences

- Off-hours duplicate guard: suppress signals when prices identical to prior cycle (market closed, stale data)
- Post-market period: within 20min of 08:59 UTC close — classified as post-market
- Bootstrap reports "trading window OPEN" even when VN market is near/at close (02:00–08:59 UTC range)
- Sector rotation is logged always; suppressed signals are explicitly noted

---

## Carry-over signals (open for next market-hours cycle)

- **BID +5.47%** (2.73σ banking resilience, signal 3399, critic 0.6) — open
- **PLX +6.99%** (2.0σ oil_gas surge Brent 110.51, signal 3400, critic 0.6) — open
- **MWG -3.66%** (2.15σ downside retail weakness escalated HIGH, signal 3401, critic 0.6) — open

---

## Recent cycles (2026-05-18)

### Cycle (13:37–13:39 UTC) — Off-hours
- Stocks: 39 | Anomalies: 0 (>1.5σ) | Volume spikes: 0 | Chain confirms: 0
- Market status: OFF-HOURS (CLOSED 08:59 UTC) — no intraday moves, prices unchanged
- Off-hours duplicate guard applied: Suppressed 3 signals (BID +5.47%, PLX +6.99%, MWG -3.66%) — same closing prices already emitted at 08:39 UTC (signals 3399-3401)
- Macro snapshot: Brent 107.82 | Gold 4578.30 | USD/VND 26,327

## Metrics (cycle 2026-05-18 13:37 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 39 |
| signals_emitted | 0 |
| signals_suppressed | 3 |
| market_alerts_fired | 0 |
| exit_status | complete |
| token_estimate | 2800 |

### Cycle (08:39–08:40 UTC) — Post-market
- Stocks: 38 | Anomalies: 3 (>1.5σ) | Volume spikes: 0 | Chain confirms: 0
- Regime: TIGHTENING | DXY: USD STABLE | US10Y: RISK-OFF | CARRY_REGIME: FII_OUTFLOW_RISK
- **Signals**: BID +5.47% (2.73σ banking resilience, signal 3399, critic 0.6) | PLX +6.99% (2.0σ oil_gas surge Brent 110.51, signal 3400, critic 0.6) | MWG -3.66% (2.15σ downside, retail weakness, escalated to HIGH via downside_bias, signal 3401, critic 0.6)
- Sector rotation 1d: oil_gas +5.99% | insurance +3.13% | chemicals +4.26% | logistics +1.34% | banking +0.37% | retail -1.16% | steel -1.20% | real_estate -0.95%

## Metrics (cycle 2026-05-18 08:39 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 38 |
| signals_emitted | 3 |
| signals_suppressed | 0 |
| market_alerts_fired | 0 |
| exit_status | complete |
| token_estimate | 14500 |

### Cycle (05:39–05:40 UTC) — Market-hours
- Stocks: 33 | Anomalies: 1 (>1.5σ) | Volume spikes: 0 | Chain confirms: 0
- Regime: TIGHTENING | DXY: USD STABLE | US10Y: RISK-OFF | fx_pressure: [] | pe_risk: [MWG]
- **Signals**: MWG -3.05% (2.83σ downside in TIGHTENING, FII_OUTFLOW_RISK carry regime)

## Metrics (cycle 2026-05-18 05:39 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 33 |
| signals_emitted | 1 |
| signals_suppressed | 0 |
| market_alerts_fired | 0 |
| exit_status | complete |
| token_estimate | 6800 |
