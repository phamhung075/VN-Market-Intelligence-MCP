# Alert Commander — Archive (pre-trim)
Archived from 153-line notebook 2026-05-21.

## Alert Cycle (04:20–04:21 UTC, 2026-05-20) — Market-hours 15min cycle

**Status:** SILENT-EXIT (firing gate not met)
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

## Alert Cycle (05:00–05:01 UTC, 2026-05-19) — Market-hours 15min cycle

**Status:** SILENT-EXIT (firing gate not met)
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

## Alert Cycle (17:02–17:04 UTC, 2026-05-18) — Off-hours 2h cycle

**Status:** SILENT-EXIT (firing gate not met)
- **Market:** CLOSED (current UTC 17:02, outside 02:00–08:59 trading window)
- **Signals evaluated:** 5 urgent_news (VCB, BID, PLX, NVL, ACB) — all conviction 0.50
- **Regime:** TIGHTENING | Carry: FII_OUTFLOW_RISK (-0.33%) | Pivot window: false (next: June 2026)
- **Threshold check:** TIGHTENING bullish urgent_news ≥ 0.75 — all 5 signals at 0.50, suppressed
- **CRITICAL overrides:** none (no verified_chain, no legal_risk, no crisis_velocity, no chain_catalyst)
- **Fired:** 0 | Suppressed: 5 | MARKET: 0
- **Outcome:** Silent exit per `no_cycle_headers: true`. No MARKET write. No WORK header.

## Alert Cycle (15:01–15:01 UTC, 2026-05-18) — Off-hours 2h cycle

**Status:** COMPLETED (live MCP probe SUCCEEDED)
- **Market:** CLOSED (15:01 UTC off-hours)
- **Regime:** TIGHTENING | Carry: FII_OUTFLOW_RISK (-0.33%) | Pivot window: false
- **Macro:** Brent 109.98 | Gold 4548.20 | USD/VND 26,327 | US10Y 4.60% RISK-OFF | DXY 99.08
- **Signals:** 0 (agent_bus=0, price_alerts=0, news_mention=20 bootstrap context only)
- **Fired:** 0 | Suppressed: 0 | MARKET: 0
- **log_agent_work id=1006**
- **Carry-over:** Watch banking (BID/VCB buying wave), oil_gas (PLX +6.99% Brent tailwind), real estate weakness (VHM/VRE under FII pressure)
