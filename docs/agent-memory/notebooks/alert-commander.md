# Alert Commander — Notebook

**Last updated:** 2026-05-18 17:04 UTC | **Sprint:** idle

> Prior history archived → `docs/archive/notebooks/alert-commander-2026-05-18.md`

## Current state

**Regime:** TIGHTENING | Carry: FII_OUTFLOW_RISK (-0.33%) | Pivot window: false (next: June 2026)
**Last fired:** 5 MARKET alerts at 09:00 UTC 2026-05-18 (BID/PLX bullish, VHM/VRE/MWG bearish)
**PC1 legal_risk gap:** 5+ consecutive cycles with no get_legal_risk_signals result — escalate to news-scout/financial-analyst

## Known patterns / preferences

- TIGHTENING bullish urgent_news threshold: 0.75 (conf < 0.75 → suppress)
- Off-hours blanket suppression: no per-signal outcome logging (differs from market-hours TIGHTENING suppression)
- `no_cycle_headers: true` — silent exit when 0 alerts fired
- chain_catalyst threshold: 0.85 | verified_chain: 0.65 | crisis_velocity: 0.90 | legal_risk: auto-fire

## This session

### Alert Cycle (17:02–17:04 UTC, 2026-05-18) — Off-hours 2h cycle
- **Status:** SILENT-EXIT (firing gate not met)
- **Market:** CLOSED (current UTC 17:02, outside 02:00–08:59 trading window)
- **Signals evaluated:** 5 urgent_news (VCB, BID, PLX, NVL, ACB) — all conviction 0.50
- **Regime:** TIGHTENING | Carry: FII_OUTFLOW_RISK (-0.33%) | Pivot window: false (next: June 2026)
- **Threshold check:** TIGHTENING bullish urgent_news ≥ 0.75 — all 5 signals at 0.50, suppressed
- **CRITICAL overrides:** none (no verified_chain, no legal_risk, no crisis_velocity, no chain_catalyst)
- **Fired:** 0 | Suppressed: 5 | MARKET: 0
- **Outcome:** Silent exit per `no_cycle_headers: true`. No MARKET write. No WORK header.

### Alert Cycle (15:01–15:01 UTC, 2026-05-18) — Off-hours 2h cycle
- **Status:** COMPLETED (live MCP probe SUCCEEDED)
- **Market:** CLOSED (15:01 UTC off-hours)
- **Regime:** TIGHTENING | Carry: FII_OUTFLOW_RISK (-0.33%) | Pivot window: false
- **Macro:** Brent 109.98 | Gold 4548.20 | USD/VND 26,327 | US10Y 4.60% RISK-OFF | DXY 99.08
- **Signals:** 0 (agent_bus=0, price_alerts=0, news_mention=20 bootstrap context only)
- **Fired:** 0 | Suppressed: 0 | MARKET: 0
- **log_agent_work id=1006**
- **Carry-over:** Watch banking (BID/VCB buying wave), oil_gas (PLX +6.99% Brent tailwind), real estate weakness (VHM/VRE under FII pressure)

## Carry-over for next market-hours cycle (Monday 02:00 UTC)

- PLX +6.99% surge (Brent $110+ tailwind) — MARKET-CRITICAL candidate if sustained + conviction boosted
- REE z=-4.27σ crash — fire if financial-analyst issues verified_chain OR z-score + impact_score populated
- DPM/GAS/HVN price_anomaly open (expiresAt ~04:42 UTC Monday) — escalate if chain confirmation arrives
- PC1 chairman arrest legal_risk gap (2026-05-16) — 5+ cycles unfilled, escalate to news-scout
- Banking state-owned inflow wave (VCB/BID/CTG) — chain_catalyst candidate if urgency confirmed
