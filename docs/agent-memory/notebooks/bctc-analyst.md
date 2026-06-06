# BCTC Analyst — Notebook

**Last updated:** 2026-06-06 15:18 UTC (c027) | **Sprint:** BCTC-EXTRACT-QUALITY

## c025 · 2026-06-05T21:09Z
### Analysis Cycle (21:02–21:09 UTC) — mode: routine
- Mode: routine (CTG ĐÃ NỘP 2026-06-05 but extraction still blocked, 17th cycle)
- Stocks analyzed: 1 (FPT conf 81%) — ACB PUB-5 blocked (conf 38%); CTG no BCTC (17th); DHG PUB-5 blocked (conf 44%); EIB PUB-5 blocked (conf 31%); MBB/VCB no BCTC data
- Chain validations: 0 open findings (cycle_id=20260605-2100, minutes_back=30)
- Regime: NEUTRAL (carry +1.38pp). Max Deposit Rate: 5.00%.
- Macro: Brent $92.94 NEUTRAL; Gold $4,341 (-3.56%, HIGH alert); USD/VND 26124 BEARISH. Market EY 6.83% FAIRLY_VALUED (+1.83pp spread). Investment clock: CORE_VN score=8. VN-Index: 1838.9.
- FPT: PE 13.8 (sector 17.3, -20%), PB 3.6, ROE 28.3% (sector 10.6%). EY 7.25%, spread +2.25% → FAIR. Net margin 19.8%. Net revenue 12,480ty. No insider activity. Foreign net +168K cp (outperforming sector).
- FPT ESC: ESC-1 FALSE. ESC-2 imbalance=0 PASS. ESC-3 DATA-COVERAGE-LIMITED (1/4q, guard already held). ESC-4 FALSE. ESC-5 skip (refined units empty prior cycles). No escalation. trick_confidence=none.
- CTG: 17th cycle blocked. Guard bctc-ctg-attachment-fetch-escalation expires ~2026-06-06T02:35Z (~5.5h). PDF 6.0MB (2026-06-05) present, extraction pipeline not yet fixed.
- Legal: CMG/VNECO2/PC1/VPB unchanged (non-watchlist). NVL: bond 5,000ty due 2026-09-15 (10.5% GIA HAN, ~102d).
- Signals: #5125 FPT fundamental_validation (critic 0.8), #5126 CTG DATA_INSUFFICIENT (critic 0.6)
- Signal file: bctc_signal_FPT_20260605_routine.json
- Double-publish guard: claimed=true (slot-3:2026-06-05). Log ID: 1269.

### Carry-over to c026 (next slot, 2026-06-06 00:00 UTC)
- CTG: 17th cycle blocked. Guard expires ~02:35 UTC 2026-06-06. If dev fix lands before next cycle, release analysis possible in c026.
- ACB/DHG/EIB: PUB-5 blocked (ongoing). BAL-1d-DEV corpus reflow blocker persists.
- FPT ESC-3: DATA-COVERAGE-LIMITED guard held (esc-datacov:FPT:Q1-2026:ESC-3, 8d TTL).
- Gold: HIGH alert active ($4,341, -3.56%). Monitor for macro stabilization.
- Regime: NEUTRAL confirmed. Carry +1.38pp stable.

## c026 · 2026-06-06T00:09Z
### Analysis Cycle (00:03–00:09 UTC) — mode: routine
- E2 guard: PASS (00:03 UTC, outside [02:00,08:00))
- Mode: routine. Calendar: CTG ĐÃ NỘP 2026-06-05 but extraction still blocked (18th cycle). No new ĐÃ NỘP vs c025.
- Stocks analyzed: 1 (FPT conf 81%) — ACB PUB-5 blocked (conf 38%); CTG no BCTC (18th); DHG PUB-5 blocked (conf 44%); EIB PUB-5 blocked (conf 31%)
- Chain validations: 0 open findings (cycle_id=20260606-0000, minutes_back=30)
- Regime: NEUTRAL (carry +1.38pp). Max Deposit Rate: 5.00%.
- Macro: Brent $92.87 NEUTRAL; Gold $4,353.9 (still HIGH alert, -3.27% vs mean); USD/VND 26124 BEARISH. Market EY 6.83% FAIRLY_VALUED (+1.83pp spread). Investment clock: CORE_VN score=8. VN-Index: 1838.9.
- FPT Q1-2026: PE 13.8 (sector 17.3, -20%), PB 3.6, ROE 28.3% (sector 10.6%). EY 7.25%, spread +2.25% → FAIR. Net margin 19.8%. Net revenue 12,480ty. Balance imbalance=0. OCF -2,847.8ty (Q1 seasonal, DATA-COVERAGE-LIMITED guard held). No insider. Foreign net +168K cp outperforming. Kinhdich unavailable (conn error, skip). trick_confidence=none (refined units empty).
- FPT ESC: ESC-1 FALSE. ESC-2 imbalance=0 PASS. ESC-3 DATA-COVERAGE-LIMITED (guard esc-datacov:FPT:Q1-2026:ESC-3 held, 8d remaining). ESC-4 FALSE. ESC-5 skip. No escalation.
- CTG: 18th cycle blocked. Old guard (bctc-ctg-attachment-fetch-escalation, from c022) expired ~00:09Z. New guard claimed: bctc-ctg-attachment-fetch-escalation-c026 (TTL 24h). Bug msg 2685 sent to re-alert dev team.
- Legal: CMG/VNECO2/PC1/VPB unchanged (non-watchlist). NVL: bond 5,000ty due 2026-09-15 (10.5% GIA HAN, ~103d to maturity).
- Alerts: HPG insider sell 6.6M shares (Lãnh đạo Hòa Phát) at market bottom — HIGH signal cross-check. Gold HIGH macro alert persists. VNH +12.50% price surge (non-BCTC).
- Signals: #5138 FPT fundamental_validation (critic 0.4), #5139 CTG DATA_INSUFFICIENT (critic 0.4)
- Signal file: bctc_signal_FPT_20260606_routine.json
- Double-publish guard: claimed=true (slot-1:2026-06-06). Log ID: 1270.

### Carry-over to c027 (next slot, 2026-06-06 15:00 UTC)
- CTG: 18th cycle blocked. New guard bctc-ctg-attachment-fetch-escalation-c026 held (TTL 24h). Watch: FU-CTG-REFINE-PICKUP expected dev fix by 09:00Z 2026-06-06 per orch-state. If extraction fix lands, CTG release analysis possible in c027+.
- ACB/DHG/EIB: PUB-5 blocked (ongoing). BAL-1d-DEV corpus reflow blocker persists.
- FPT ESC-3: DATA-COVERAGE-LIMITED guard held (esc-datacov:FPT:Q1-2026:ESC-3, ~8d TTL).
- HPG: insider sell alert (6.6M shares by executive, MEDIUM alert) — monitor for BCTC when filed.
- Gold: HIGH macro alert persists ($4,353.9, -3.27%). Monitor stabilization.
- Regime: NEUTRAL confirmed. Carry +1.38pp stable.

## c027 · 2026-06-06T15:18Z
### Analysis Cycle (15:02–15:18 UTC) — mode: routine
- E2 guard: PASS (15:02 UTC, outside [02:00,08:00))
- Mode: routine. No new ĐÃ NỘP vs c026. CTG extraction still blocked (19th cycle).
- Stocks analyzed: 1 (FPT conf 81%) — ACB PUB-5 blocked (conf 38%); CTG no BCTC (19th); DHG PUB-5 blocked (conf 44%); EIB PUB-5 blocked (conf 31%)
- Chain validations: 0 open findings (cycle_id=20260606-1500, minutes_back=30)
- Regime: NEUTRAL (carry +1.38pp). Max Deposit Rate: 5.00%.
- Macro: Brent $93.09 NEUTRAL; Gold $4,365.3 BULLISH (safe-haven demand, still elevated); USD/VND 26124 BEARISH. Market EY 8.20% CHEAP (+3.20pp spread) — UPGRADED vs prior cycles (6.83%). Investment clock: Overheat (CPI 5.46%, growth UP). CORE_VN score=8. VN-Index: 1838.9 (stale).
- FPT Q1-2026: PE 13.8 (sector 17.3, -20%), PB 3.6, ROE 28.3% (sector 10.6%). EY 7.25%, spread +2.25% → FAIR. Net margin 19.8%. Net revenue 12,480ty. Balance imbalance=0. OCF -2,848ty (Q1 seasonal, DATA-COVERAGE-LIMITED guard held). No insider. Foreign net +168K cp outperforming. Kinhdich unavailable (conn error). trick_confidence=none.
- FPT ESC: ESC-1 FALSE. ESC-2 imbalance=0 PASS. ESC-3 DATA-COVERAGE-LIMITED (guard esc-datacov:FPT:Q1-2026:ESC-3 held, ~7d TTL). ESC-4 FALSE. ESC-5 skip. No escalation.
- CTG: 19th cycle blocked. Guard bctc-ctg-attachment-fetch-escalation-c026 still held (TTL 24h from 00:09Z). FU-CTG-REFINE-PICKUP dev fix not yet confirmed landed.
- Legal: CMG/VNECO2/PC1/VPB unchanged. NVL: bond 5,000ty due 2026-09-15 (10.5% GIA HAN, ~91d to maturity).
- HPG insider: no current insider signals (tool returned "không có tín hiệu đáng kể" — prior c026 alert may have cleared).
- Alerts: GAS/PLX HIGH (oil price surge risk). VIC LOW (VN-Index decline news).
- Signals: #5205 FPT fundamental_validation (critic 0.6), #5206 CTG DATA_INSUFFICIENT (critic 0.6)
- Signal file: bctc_signal_FPT_20260606_routine.json
- Double-publish guard: claimed=true (slot-1:2026-06-06 re-confirmed). Log ID: 1273.
- Data freshness: Prices stale since 2026-06-05 08:59Z (VPS leg dead per dispatcher). BCTC source last push 2026-06-05 14:48Z. Flagged in signals.

### Carry-over to c028 (next slot, 2026-06-06 18:00 UTC)
- CTG: 19th cycle blocked. Guard expires ~2026-06-07T00:09Z. Await FU-CTG-REFINE-PICKUP dev confirmation.
- ACB/DHG/EIB: PUB-5 blocked (ongoing). BAL-1d-DEV corpus reflow blocker persists.
- FPT ESC-3: DATA-COVERAGE-LIMITED guard held (esc-datacov:FPT:Q1-2026:ESC-3, ~7d TTL).
- Market EY upgraded to CHEAP (8.20%, +3.20pp). Monitor if this reflects a pricing recalibration.
- GAS/PLX: HIGH alert oil surge risk — monitor BCTC when Q1-2026 PDFs become available.
- Regime: NEUTRAL confirmed. Carry +1.38pp stable.
