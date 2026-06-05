# BCTC Analyst — Notebook

**Last updated:** 2026-06-05 15:05 UTC (c023) | **Sprint:** BCTC-EXTRACT-QUALITY

## c021 · 2026-06-04T21:10Z
### Analysis Cycle (21:05–21:10 UTC) — mode: routine
- Mode: routine (no new ĐÃ NỘP vs c020; CTG DATA_INSUFFICIENT 13th cycle)
- Stocks analyzed: 1 (FPT conf 81%) — ACB PUB-5 blocked (conf 38% 13th); CTG no BCTC (13th); DHG PUB-5 blocked (conf 44% 13th); EIB PUB-5 blocked (conf 31% 13th)
- Chain validations: 0 open findings (cycle_id=20260604-2100, minutes_back=30)
- Regime: NEUTRAL (carry +1.38pp updated from prior -0.33pp; regime shift from TIGHTENING/FII_OUTFLOW_RISK — verify next cycle). Max Deposit Rate: 5.00%.
- Macro: Brent $95.26 NEUTRAL (CRITICAL extreme-low alert $94.83 still in 24h window); Gold $4,503.9 BULLISH; USD/VND 26122 BEARISH. Market EY 8.20% CHEAP (+3.20pp).
- Investment clock: Overheat (CPI 5.46%). VN-Index: 1831.55 (rebounded). VinaCapital chain_catalyst (impact=9): 70% stocks at crisis-era valuation lows — non-BCTC domain, noted.
- FPT: PE 13.8 (sector -20%), PB 3.6, ROE 28.3% (sector 10.6%). EY 7.25%, spread +2.25% → FAIR. Net margin 19.8%. No insider activity.
- FPT OCF: -2,847,813 VND mn vs NI +2,476,790. ocf_ni_ratio=-1.15 (Q4/2025 OCF=+4,108ty seasonal). ESC-3 DATA-COVERAGE-LIMITED (2/4 quarters). Guard held 30d.
- FPT ESC-2: assets=68,586ty, L+E=68,586ty, imbalance=0 → PASS. ESC-1/4/5: all FALSE/unavailable. No escalation.
- Legal: CMG/VNECO2, PC1, VPB — all non-watchlist, unchanged from c020.
- NVL: bond 5,000ty VND due 2026-09-15 at 10.5% (GIA HAN). Maturity risk ~92 days.
- Signals: #5009 FPT fundamental_validation (critic 0.4), #5010 ACB DATA_INSUFFICIENT (critic 0.4)
- Signal files: bctc_signal_FPT_20260604_routine.json
- Double-publish guard: claimed=true (slot-3:2026-06-04). Log ID: 1252.

### Carry-over to c022 (00:00 UTC slot, 2026-06-05)
- CTG: 13th cycle no BCTC data. PDF CTG_2026_Q1.pdf (0.5MB) present. BCTC-CTG-ATTACHMENT-FETCH CRITICAL — escalate to dev at next cycle if still fails.
- ACB/DHG/EIB: PUB-5 blocked (13th cycle for ACB/EIB). BAL-1d-DEV corpus reflow blocker persists.
- FPT ESC-3: DATA-COVERAGE-LIMITED (2/4 quarters). Coverage guard held 30d.
- Regime shift note: carry +1.38pp this cycle vs -0.33pp in c018-c020. Re-verify next cycle — may reflect updated macro data rather than structural shift.

## c022 · 2026-06-05T00:10Z
### Analysis Cycle (00:05–00:10 UTC) — mode: routine
- Mode: routine (no new ĐÃ NỘP vs c021; CTG DATA_INSUFFICIENT 14th cycle — ESCALATED to dev)
- Stocks analyzed: 1 (FPT conf 81%) — ACB PUB-5 blocked (conf 38% 14th); CTG no BCTC (14th); DHG PUB-5 blocked (conf 44% 14th); EIB PUB-5 blocked (conf 31% 14th)
- Chain validations: 0 open findings (cycle_id=20260605-0000, minutes_back=30)
- Regime: NEUTRAL (carry +1.38pp confirmed). Max Deposit Rate: 5.00%.
- Macro: Brent $95.2 NEUTRAL; Gold $4,501.1 BULLISH; USD/VND 26122 BEARISH. Market EY 8.20% CHEAP (+3.20pp).
- Investment clock: Overheat (CPI 5.46%). VN-Index: 1831.55.
- FPT: PE 13.8 (sector -20%), PB 3.6, ROE 28.3%, EY 7.25%, spread +2.25% → FAIR. Net margin 19.8%. No insider.
- FPT OCF: -2,847,813 VND mn vs NI +2,476,790. ocf_ni_ratio=-1.15. ESC-3 DATA-COVERAGE-LIMITED (2/4q). Guard held.
- FPT ESC-2: imbalance=0 PASS. ESC-1/4/5: FALSE/unavailable. No escalation. Trick confidence=medium.
- CTG: 14th cycle failure. guard claimed. BUG msg_id=2661 sent. BCTC-CTG-ATTACHMENT-FETCH dev escalation active.
- Legal: CMG/VNECO2/PC1/VPB — unchanged (non-watchlist). NVL: bond 5,000ty due 2026-09-15 (10.5% GIA HAN).
- Signals: #5028 FPT fundamental_validation (critic 0.6), #5029 ACB DATA_INSUFFICIENT (critic 0.6)
- Signal files: bctc_signal_FPT_20260605_routine.json
- Double-publish guard: claimed=true (slot-4:2026-06-05). Log ID: 1253.

### Carry-over to c023 (next slot, 2026-06-05)
- CTG: 14th cycle no BCTC. Dev escalation emitted (bug msg 2661). Guard TTL 24h. Await dev fix.
- ACB/DHG/EIB: PUB-5 blocked (14th cycle ACB/EIB). BAL-1d-DEV corpus reflow still needed.
- FPT ESC-3: DATA-COVERAGE-LIMITED (2/4q). Coverage guard held 30d.
- Regime: NEUTRAL confirmed (carry +1.38pp). Monitor next cycle for stability.

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
