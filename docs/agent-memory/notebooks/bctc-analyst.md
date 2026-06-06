# BCTC Analyst — Notebook

**Last updated:** 2026-06-06 18:13 UTC (c028) | **Sprint:** BCTC-EXTRACT-QUALITY

## c026 · 2026-06-06T00:09Z
### Analysis Cycle (00:03–00:09 UTC) — mode: routine
- E2 guard: PASS (00:03 UTC, outside [02:00,08:00))
- Mode: routine. Calendar: CTG ĐÃ NỘP 2026-06-05 but extraction still blocked (18th cycle). No new ĐÃ NỘP vs c025.
- Stocks analyzed: 1 (FPT conf 81%) — ACB PUB-5 blocked (conf 38%); CTG no BCTC (18th); DHG PUB-5 blocked (conf 44%); EIB PUB-5 blocked (conf 31%)
- Chain validations: 0 open findings (cycle_id=20260606-0000, minutes_back=30)
- Regime: NEUTRAL (carry +1.38pp). Max Deposit Rate: 5.00%.
- Macro: Brent $92.87 NEUTRAL; Gold $4,353.9 (still HIGH alert, -3.27% vs mean); USD/VND 26124 BEARISH. Market EY 6.83% FAIRLY_VALUED (+1.83pp spread). Investment clock: CORE_VN score=8. VN-Index: 1838.9.
- FPT Q1-2026: PE 13.8 (sector 17.3, -20%), PB 3.6, ROE 28.3% (sector 10.6%). EY 7.25%, spread +2.25% → FAIR. Net margin 19.8%. Net revenue 12,480ty. Balance imbalance=0. OCF -2,847.8ty (Q1 seasonal, DATA-COVERAGE-LIMITED guard held). No insider. Foreign net +168K cp outperforming. Kinhdich unavailable (conn error, skip). trick_confidence=none.
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

## c028 · 2026-06-06T18:13Z
### Analysis Cycle (18:02–18:13 UTC) — mode: routine
- E2 guard: PASS (18:02 UTC, outside [02:00,08:00))
- Mode: routine. CTG calendar updated: ĐÃ NỘP 2026-06-06 (20th cycle — new!). Guard bctc-ctg-attachment-fetch-escalation-c026 still active until ~2026-06-07T00:09Z — deferred to c029.
- Stocks analyzed: 1 (FPT conf 81%) — ACB PUB-5 blocked (38%); CTG guard-blocked (20th); DHG PUB-5 blocked (44%); EIB PUB-5 blocked (31%); BID no data; GAS PDF present but no extraction.
- Chain validations: 0 open findings (cycle_id=20260606-1800, minutes_back=30)
- Regime: NEUTRAL (carry +1.38pp). Max Deposit Rate: 5.00%. Investment clock: Overheat (CPI 5.46%).
- Macro: Brent $93.09 NEUTRAL; Gold $4,365.3 BULLISH; USD/VND 26124 BEARISH. Market EY 8.20% CHEAP (+3.20pp). VN-Index: 1838.9 (stale). [STALE PRICES: all 34 watchlist since 2026-06-05 08:59Z]
- FPT Q1-2026: PE 13.8 (sector 17.3, -20%), PB 3.6, ROE 28.3% (sector 10.6%). EY 7.25%, spread +2.25% → FAIR. Net margin 19.8%. Net revenue 12,480ty. Balance imbalance=0. OCF -2,848ty (Q1 seasonal, DATA-COVERAGE-LIMITED guard held). No insider. Foreign net +168K cp outperforming. trick_confidence=none.
- E3 cache: MISS (no prior cache file). 6 passes run: all clean. ESC: 1=F, 2=PASS(0), 3=DATA-COV-LIM, 4=F, 5=F. No escalation.
- Chain catalysts: Gold mass liquidation risk-off (impact 10, TIGHTENING regime signal). FPT+NVIDIA AI breakthrough (impact 5, EPS bullish).
- Legal: CMG/VNECO2/PC1/VPB unchanged. NVL: bond 5,000ty due 2026-09-15 (~82d). NVL dividend record alert (MEDIUM). VIC foreign fund exit news (LOW).
- Signals: #5223 FPT fundamental_validation (critic 0.8), #5224 CTG DATA_INSUFFICIENT (critic 0.6). Log ID: 1275.
- Signal file: docs/signals/bctc_signal_FPT_20260606_routine.json (overwrite — same ticker, updated cycle)
- Double-publish guard: claimed=true (bctc-slot-2:2026-06-06).

### Carry-over to c029 (next slot, 2026-06-06 21:00 UTC)
- CTG: guard expires ~00:09Z 2026-06-07. c029 (21:00Z) still within guard window — deferred to c030 (00:00Z 2026-06-07). Calendar shows DA NOP, PDF present (6.0MB + 0.5MB). Once guard clears: RELEASE analysis warranted.
- ACB/DHG/EIB: PUB-5 blocked (ongoing). BAL-1d-DEV corpus reflow blocker persists.
- GAS: PDF present (2026-05-28, 16.8MB) but no extracted data — calendar QUA HAN. Monitor for extraction.
- BID: PDF found (non-Q1 BID doc, 2026-06-01) — no Q1 BCTC data yet.
- FPT ESC-3: DATA-COVERAGE-LIMITED guard held (~7d TTL remaining).
- Gold risk-off cascade active — macro headwind for equity broadly; FPT tech less sensitive.
- Market EY 8.20% CHEAP — structural support for equities despite tightening signal.
