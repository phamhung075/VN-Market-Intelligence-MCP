# Alert Commander — Notebook

**Last updated:** 2026-05-20 04:21 UTC | **Sprint:** c212

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

### Alert Cycle (04:20–04:21 UTC, 2026-05-20) — Market-hours 15min cycle
- **Status:** SILENT-EXIT (firing gate not met)
- **Market:** OPEN (trading window 02:00–08:59 UTC)
- **Regime:** TIGHTENING | Carry: FII_OUTFLOW_RISK (-0.33%) | Pivot window: false (next: June 2026)
- **Macro:** Brent 110.35 | Gold 4469.00 | USD/VND 26,329 | US10Y 4.67% RISK-OFF | DXY 99.30
- **Signals evaluated:** 6 urgent_news (freshness-sla-monitor SLA breach — no stockCode, conf=0.50) | verified_chain=0 | chain_catalyst=0 | price_anomaly=0
- **position-danger check (TIGHTENING 2/3):** stopLossHit=false | singleDayDrop>5%=false (max GVR -4.51%) | newsSentiment<-0.5=false → 0/2
- **watchlist-opportunity check (TIGHTENING):** kinhDichSignal=none | agentsMajority=none → 0/4
- **CRITICAL overrides:** none (legal_risk=0, crisis_velocity=0, verified_chain=0, chain_catalyst=0)
- **Fired:** 0 | Suppressed: 6 | MARKET: 0
- **Outcome:** Silent exit per `no_cycle_headers: true`. No MARKET write. WORK summary sent.
- **log_agent_work id=1046**
- **Notable:** MBB — Phó Tổng đăng ký bán 1 triệu cp (LOW alert, no agent_signal chain). Gold -2.45σ macro deviation (2 alerts). Khối ngoại bán ròng 830 tỷ MBB/SSI context.

### Alert Cycle (05:00–05:01 UTC, 2026-05-19) — Market-hours 15min cycle
- **Status:** SILENT-EXIT (firing gate not met)
- **Market:** OPEN (trading window 02:00–08:59 UTC)
- **Regime:** TIGHTENING | Carry: FII_OUTFLOW_RISK (-0.33%) | Pivot window: false (next: June 2026)
- **Macro:** Brent 109.98 | Gold 4544.70 | USD/VND 26,327 | US10Y 4.62% RISK-OFF | DXY 99.15
- **Signals evaluated:** 3 news_mention (ACB MEDIUM, GAS HIGH, PLX HIGH) — no agent_signals on bus, no price_anomaly, no verified_chain, no chain_catalyst
- **position-danger check (TIGHTENING 2/3):** stopLossHit=false | singleDayDrop>5%=false (max drop GVR -2.42%) | newsSentiment<-0.5=false → 0/2
- **watchlist-opportunity check (TIGHTENING):** no kinh dich signals, no agentsMajority=BUY → 0/4
- **CRITICAL overrides:** none (legal_risk=0, crisis_velocity=0, verified_chain=0)
- **Fired:** 0 | Suppressed: 3 | MARKET: 0
- **Outcome:** Silent exit per `no_cycle_headers: true`. No MARKET write. WORK summary sent.
- **log_agent_work id=1042**

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

## Carry-over for next market-hours cycle (04:30 UTC 2026-05-20)

- MBB insider sale: Phó Tổng đăng ký bán 1 triệu cp — watch if chain_catalyst or verified_chain follows from financial-analyst
- Gold macro deviation: 2 consecutive HIGH macro alerts (-2.45σ and -2.46σ below mean) — risk-off signal, monitor for crisis_velocity escalation
- Khối ngoại bán ròng 830 tỷ MBB/SSI session 2026-05-19 — FII outflow pressure on banking/securities sector ongoing
- Real estate: KBC -3.32%, NVL -3.89%, TCH -3.66% — approaching position-danger singleDayDrop threshold, monitor for -5% breach
- VHM/VIC counter-trend bullish (+1.78%/+1.07%) amid broad real estate weakness — watch for chain confirmation
- PC1 chairman arrest legal_risk gap (2026-05-16) — 6+ cycles unfilled, escalate to news-scout
- Freshness SLA breaches: price (19min>10), bctc (310min>120), news (46min>30), foreign_flow (37min>10) — data quality risk for signal validation
