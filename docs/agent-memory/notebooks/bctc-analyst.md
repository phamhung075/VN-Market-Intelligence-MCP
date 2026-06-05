# BCTC Analyst — Notebook

**Last updated:** 2026-06-05 21:09 UTC (c025) | **Sprint:** BCTC-EXTRACT-QUALITY

## c023 · 2026-06-05T15:05Z
### Analysis Cycle (15:01–15:05 UTC) — mode: routine
- Mode: routine (no new ĐÃ NỘP vs c022; CTG DATA_INSUFFICIENT 15th cycle)
- Stocks analyzed: 1 (FPT conf 81%) — ACB PUB-5 blocked (conf 38% 15th); CTG no BCTC (15th); DHG PUB-5 blocked (conf 44% 15th); EIB PUB-5 blocked (conf 31% 15th)
- Chain validations: 0 open findings (cycle_id=20260605-1500, minutes_back=30)
- Regime: NEUTRAL (carry +1.38pp confirmed). Max Deposit Rate: 5.00%.
- Macro: Brent $93.78 NEUTRAL; Gold $4,376.3 (alert -2.88σ below mean $4,492.75); USD/VND 26124 BEARISH. Market EY 6.83% FAIRLY_VALUED.
- Investment clock: Overheat (CPI 5.46%). VN-Index: 1838.9 (+7.35 vs c022).
- FPT: PE 13.8 (sector 17.3 -20%), PB 3.6, ROE 28.3% (sector 10.6%). EY 7.25%, spread +2.25% → FAIR. Net margin 19.8%. Net revenue 12,480ty. Foreign net +168K cp.
- FPT OCF: -2,847,813 VND mn vs NI +2,476,790. ocf_ni_ratio=-1.15 (Q1 seasonal). ESC-3 DATA-COVERAGE-LIMITED (2/4q). Guard held 30d.
- FPT ESC-2: imbalance=0 PASS. ESC-1/4/5: FALSE/unavailable. No escalation.
- Legal: CMG/VNECO2/PC1/VPB — unchanged (non-watchlist). NVL: bond 5,000ty due 2026-09-15 (10.5% GIA HAN).
- Signals: #5093 FPT fundamental_validation (critic 0.8), #5094 ACB DATA_INSUFFICIENT (critic 0.6)
- Signal files: bctc_signal_FPT_20260605_routine.json
- Double-publish guard: claimed=true (slot-1:2026-06-05). Log ID: 1263.

### Carry-over to c024 (next slot, 2026-06-05)
- CTG: 15th cycle no BCTC. Dev escalation active (bug msg 2661 from c022). Await dev fix.
- ACB/DHG/EIB: PUB-5 blocked (15th cycle ACB/EIB). BAL-1d-DEV corpus reflow blocker persists.
- FPT ESC-3: DATA-COVERAGE-LIMITED (2/4q). Coverage guard held 30d.
- Regime: NEUTRAL confirmed. Carry +1.38pp stable. VN-Index 1838.9.
- Gold: -2.88σ below mean ($4,376.3 vs $4,492.75) — macro alert HIGH active, monitor.

## c024 · 2026-06-05T18:15Z
### Analysis Cycle (18:05–18:15 UTC) — mode: mixed (1 release + routine)
- Mode: mixed (CTG release=DATA_INSUFFICIENT; routine FPT analyzed)
- Stocks analyzed: 1 routine (FPT conf 81%); CTG release blocked (16th cycle, PDF 6.0MB downloaded today, extraction pending)
- Chain validations: 0 open findings (cycle_id=20260605-1800, minutes_back=30)
- Regime: NEUTRAL (carry +1.38pp). Max Deposit Rate: 5.00%.
- Macro: Brent $92.87 (-2.45%) NEUTRAL; Gold $4,363.5 (-3.06%, -2.88σ HIGH alert persists); USD/VND 26124 BEARISH. Market EY 6.83% FAIRLY_VALUED (+1.83pp spread).
- Investment clock: CORE_VN phase, score=8. VN-Index: 1838.9.
- FPT: PE 13.8 (-20% sector), PB 3.6, ROE 28.3% (sector 10.6%). EY 7.25%, spread +2.25% → FAIR. Net margin 19.8%. Net revenue 12,480ty. NVIDIA AI partnership catalyst (2026-06-05, LOW alert) — BCTC CONFIRMS re-rating case. Foreign net +168K cp (MẠNH HƠN ngành).
- FPT ESC: ESC-1/4/5 FALSE/clear. ESC-2 imbalance=0 PASS. ESC-3 DATA-COVERAGE-LIMITED (2/4q, guard held 30d). No escalation. trick_confidence=none (refined units empty).
- CTG: 16th cycle no parseable BCTC. PDF 6.0MB present (downloaded 2026-06-05). Dev escalation guard still held (bctc-ctg-attachment-fetch-escalation, TTL ~18h remaining). Calendar: ĐÃ NỘP 2026-06-05. Release mode blocked.
- Legal: CMG/VNECO2/PC1/VPB unchanged (non-watchlist). NVL: bond 5,000ty due 2026-09-15 (10.5% GIA HAN, ~91d maturity risk).
- Signals: #5111 FPT fundamental_validation (critic 0.6), #5112 CTG DATA_INSUFFICIENT (critic 0.6)
- Signal file: bctc_signal_FPT_20260605_routine.json
- Double-publish guard: claimed=true (slot-2:2026-06-05).

### Carry-over to c025 (next slot, 2026-06-05 21:00 UTC)
- CTG: 16th cycle blocked. Dev escalation active. PDF present but unextracted. Await dev fix before release analysis possible.
- ACB/DHG/EIB: PUB-5 blocked (ongoing). BAL-1d-DEV corpus reflow blocker persists.
- FPT ESC-3: DATA-COVERAGE-LIMITED (2/4q). Coverage guard held 30d.
- FPT+NVIDIA AI catalyst active (LOW alert) — monitor for price confirmation from market-watcher.
- Gold: -2.88σ HIGH alert active ($4,363.5). Monitor for stabilization.
- Regime: NEUTRAL confirmed. Carry +1.38pp stable.

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
