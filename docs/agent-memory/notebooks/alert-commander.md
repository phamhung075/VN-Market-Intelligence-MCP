# Alert Commander — Notebook

**Last updated:** 2026-05-21 04:39 UTC | **Sprint:** 1960c

> Prior history archived → `docs/archive/notebooks/alert-commander-2026-05-21.md`

## Current state

**Regime:** TIGHTENING | Carry: FII_OUTFLOW_RISK (-0.33%) | Pivot window: false (next: June 2026)
**Last fired:** 5 MARKET alerts at 09:00 UTC 2026-05-18 (BID/PLX bullish, VHM/VRE/MWG bearish)
**PC1 legal_risk:** FIRED 04:38 UTC 2026-05-21 (verdict ec181d4e pending). Chairman arrest unresolved since 2026-05-19.
**VPB legal_risk:** FIRED again 04:38 UTC 2026-05-21 (verdict 5f780ed3 pending). Lending audit findings VPBank Lang Son — distinct from prior cycle verdict 9bf08121.

## Known patterns / preferences

- TIGHTENING bullish urgent_news threshold: 0.75 (conf < 0.75 → suppress)
- Off-hours blanket suppression: no per-signal outcome logging (differs from market-hours TIGHTENING suppression)
- `no_cycle_headers: true` — silent exit when 0 alerts fired
- chain_catalyst threshold: 0.85 | verified_chain: 0.65 | crisis_velocity: 0.90 | legal_risk: auto-fire

## This session

### Alert Cycle (04:37–04:39 UTC, 2026-05-21) — Market-hours 15min cycle
- **Status:** FIRED — 2 CRITICAL (PC1 + VPB legal_risk)
- **Market:** OPEN (trading window 02:00–08:59 UTC)
- **Regime:** TIGHTENING | Carry: FII_OUTFLOW_RISK (-0.33%) | Pivot window: false (next: June 2026 — 11 days)
- **Macro:** Brent 105.86 | Gold 4540.90 | USD/VND 26,355 | US10Y 4.57% RISK-OFF | DXY 99.17
- **Signals evaluated:** 1 urgent_news (VIC block-trade conf=0.50, TIGHTENING thr 0.75 → suppressed; suppress signal 3587 posted) | legal_risk 3 signals: PC1 new (id latest) + VPB x2 — PC1 new → CRITICAL auto-fire, VPB 2026-05-20 → CRITICAL auto-fire (new cycle, new fire)
- **position-danger check:** max intraday drop NVL -3.14%, GVR -2.93%, VIC -2.29% — none exceed 5% | price_alerts=0 | stopLossHit=false → 0/3. Gate NOT met.
- **watchlist-opportunity check:** no kinhDich signals on bus | no agentsMajority=BUY → 0/4. Gate NOT met.
- **CRITICAL overrides:** PC1 legal_risk → AUTO-FIRE | VPB legal_risk → AUTO-FIRE | crisis_velocity=0
- **Fired:** 2 | Suppressed: 1 (VIC urgent_news) | MARKET: 2
- **Verdict:** ec181d4e pending (PC1 bearish) | 5f780ed3 pending (VPB bearish)
- **write_alert_verdict note:** `legal_risk` still not in alertSource enum → used `urgent_news` fallback (same workaround as prior cycles). Dev-team bug still open.
- **log_agent_work id=1066**
- **Notable:** PC1 chairman arrest unresolved 2+ days. VPB audit findings persist. Both fire in TIGHTENING regime — PE re-rating suppressed by legal exposure. VIC block-trade 3.4T bullish signal but conf too low for TIGHTENING. Macro: Brent 105.86 (article "dưới 100 USD" in news but MCP live data shows 105.86 — discrepancy; watch GAS/PLX). USD/VND 26,355 (above 25,500 pressure threshold).

### Alert Cycle (04:23–04:28 UTC, 2026-05-21) — Market-hours 15min cycle
- **Status:** FIRED — 1 CRITICAL (PC1 legal_risk)
- **Market:** OPEN (trading window 02:00–08:59 UTC)
- **Regime:** TIGHTENING | Carry: FII_OUTFLOW_RISK (-0.33%) | Pivot window: false (next: June 2026 — 11 days)
- **Macro:** Brent 105.94 | Gold 4536.60 | USD/VND 26,355 | US10Y 4.57% RISK-OFF | DXY 99.19
- **VN-Index:** 1,894.20 (-0.99%)
- **Signals evaluated:** 3 (PC1 legal_risk NEW id=3573 → CRITICAL auto-fire | VPB legal_risk x2 stale 2026-05-20 → suppressed | GAS urgent_news conf=0.50 TIGHTENING thr 0.75 → suppressed | PLX urgent_news conf=0.50 → suppressed)
- **position-danger check (TIGHTENING 2/3):** GVR -3.32%, NVL -3.46%, VIC -3.26% — none exceed 5% | stopLossHit=false | price_alerts=0 → 0/2. Gate NOT met.
- **watchlist-opportunity check (TIGHTENING: kinhDich≥80+BUY + news≥0.5 + agentsMajority=BUY):** Kinh Dich global Khon MUA 100% — no stock-level signals on bus | no agentsMajority=BUY → 0/4. Gate NOT met.
- **CRITICAL overrides:** PC1 legal_risk NEW (id=3573, created 2026-05-21 04:10, not prev fired) → AUTO-FIRE | crisis_velocity=0
- **Fired:** 1 | Suppressed: 4 | MARKET: 1
- **Verdict:** 59d92c19 pending (PC1 bearish position_danger)
- **log_agent_work id=1064**
- **Notable:** PC1 chairman arrest investigation unresolved since 2026-05-19 — TIGHTENING regime suppresses PE re-rating. GAS -2.56%/PLX -2.51% oil sector pressure from Brent ~106/bbl continuing but conf=0.50 < TIGHTENING thr 0.75. Kinh Dich global Khon MUA 100% persists — watch stock-level readings next cycle if newssentiment recovers ≥0.5 for watchlist-opportunity.

### Alert Cycle (04:09–04:10 UTC, 2026-05-21) — Market-hours 15min cycle
- **Status:** SILENT-EXIT (firing gate not met)
- **Market:** OPEN (trading window 02:00–08:59 UTC)
- **Regime:** TIGHTENING | Carry: FII_OUTFLOW_RISK (-0.33%) | Pivot window: false (next: June 2026 — 11 days)
- **Macro:** Brent 105.81 | Gold 4530.10 | USD/VND 26,355 | US10Y 4.57% RISK-OFF | DXY 99.19
- **Signals evaluated:** 2 urgent_news (ACB conf=0.50, VIC conf=0.50 — TIGHTENING thr 0.75, suppressed) | 2 stale legal_risk VPB (already fired 2026-05-20 04:37, verdict 9bf08121, suppressed) | chain_catalyst=0 | verified_chain=0 | price_anomaly=0
- **position-danger check (TIGHTENING 2/3):** max intraday drop VIC -4.37%, NVL -3.46%, KBC -2.75%, GVR -2.93% — none exceed 5% threshold | stopLossHit=false | singleDayDrop>5%=false → 0/2
- **watchlist-opportunity check (TIGHTENING: kinhDich≥80+BUY + news≥0.5 + agentsMajority=BUY):** no kinhDich signals on bus | no agentsMajority=BUY → 0/4
- **CRITICAL overrides:** VPB legal_risk stale (already fired) | crisis_velocity=0 | verified_chain=0 | chain_catalyst=0
- **Fired:** 0 | Suppressed: 4 | MARKET: 0
- **Outcome:** Silent exit per `no_cycle_headers: true`. No MARKET write. WORK summary sent.
- **log_agent_work id=1061**
- **Notable:** Brent 105.81 continuing downward (was 105.89 prev cycle, 110.51 on 2026-05-20). News article: "Đọc nhanh 21-5: Giá dầu giảm xuống dưới 100 USD/thùng" — watch for GAS/PLX stop-loss triggers if Brent continues to fall. VIC -4.37% — approaching 5% threshold; monitor next cycle. News sentiment today: mixed (bullish pharma/retail, bearish oil/market outlook).

### Alert Cycle (03:26–03:28 UTC, 2026-05-21) — Market-hours 15min cycle
- **Status:** SILENT-EXIT (firing gate not met)
- **Market:** OPEN (trading window 02:00–08:59 UTC)
- **Regime:** TIGHTENING | Carry: FII_OUTFLOW_RISK (-0.33%) | Pivot window: false (next: June 2026 — 11 days)
- **Macro:** Brent 105.89 | Gold 4536.90 | USD/VND 26,355 | US10Y 4.57% RISK-OFF | DXY 99.20
- **Signals evaluated:** 2 stale legal_risk (VPB, dated 2026-05-20 — already fired 04:37 UTC 2026-05-20, verdict 9bf08121) | agent_signals bus=0 | price_alerts=0
- **position-danger check (TIGHTENING 2/3):** max intraday drop VIC -2.07%, FPT -1.93%, GAS -1.90% — none exceed 5% threshold | stopLossHit=false | singleDayDrop>5%=false → 0/2
- **watchlist-opportunity check (TIGHTENING: kinhDich≥80+BUY + news≥0.5 + agentsMajority=BUY):** no kinhDich signals | no agentsMajority → 0/4
- **CRITICAL overrides:** VPB legal_risk stale (not new, already fired) | crisis_velocity=0 | verified_chain=0 | chain_catalyst=0
- **Fired:** 0 | Suppressed: 2 (stale VPB legal_risk) | MARKET: 0
- **Outcome:** Silent exit per `no_cycle_headers: true`. No MARKET write. WORK summary sent.
- **log_agent_work id=1059**
- **Notable:** Brent dropped to 105.89 (was 110.51 last market-hours cycle) — macro CRITICAL alert at -3.14σ from previous session. Oil/gas sector (GAS -1.90%, PLX -1.71%) under pressure. Global news: Giá dầu giảm xuống dưới 100 USD/thùng reported — watch for further GAS/PLX stop-loss triggers next cycle. MACRO deviation CRITICAL from yesterday (Brent -3.14σ at 106.87) carries forward.

## Carry-over for next market-hours cycle

- VPB legal_risk FIRED this cycle — verdict 9bf08121 pending. Watch for news-scout verified_chain follow-up or financial-analyst BCTC validation.
- write_alert_verdict enum gap: `legal_risk` not in alertSource enum → used `position_danger` fallback. Flag for dev-team correction (enum should include `legal_risk`).
- GVR -5.88%, NVL -6.89%, TCH -6.71% all breach singleDayDrop >5% but only 1/3 position-danger conditions met (stopLossHit=false, no structured newsSentiment signal). Monitor next cycle for additional conditions.
- Kinh Dich global Khon MUA 100% — check stock-level kinh dich readings next cycle for watchlist-opportunity if newsSentiment recovers.
- MBB insider sale: Phó Tổng đăng ký bán 1 triệu cp — watch if chain_catalyst or verified_chain follows.
- Gold macro deviation: 3 consecutive HIGH macro alerts (now -2.45σ, -2.46σ) — risk-off signal active.
- Khối ngoại bán ròng 830 tỷ MBB/SSI — FII outflow pressure banking/securities ongoing.
- PC1 chairman arrest legal_risk gap — 7+ cycles unfilled. Escalate to news-scout.
- VN-Index broad selloff today (-1.62%) — majority of watchlist in red. Market-wide bearish context.
