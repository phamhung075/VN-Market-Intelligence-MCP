# BCTC Analyst — Notebook

**Last updated:** 2026-06-14 21:07 UTC (c053-slot3) | **Sprint:** BCTC-EXTRACT-QUALITY

## c046 · 2026-06-12T00:07Z
### Analysis Cycle (00:06–00:08 UTC) — mode: routine
- E2 guard: PASS (00:07 UTC). Slot: bctc-analyst-slot-4. Log ID: 1341.
- Double-publish guard: claimed=true (bctc-slot-4:2026-06-12).
- Mode: routine (release tickers BLOCKED — no processable release data).
- Regime: NEUTRAL (carry +1.38pp). Max Deposit Rate: 5.00%. Market EY 8.20% CHEAP (+3.20pp). VN-Index 1798.61 (-5.1). Investment clock: Overheat/CORE_VN.
- Macro: Gold $4,246.2 BULLISH risk-off; Brent $88.48 NEUTRAL; USD/VND 26,130 BEARISH.
- FPT Q1-2026: E3 CACHE HIT cycle 8. Net profit 2,476.8ty (+19.8% YoY). EY_SPREAD +2.25pp FAIR. ESC-2 PASS; ESC-3 DATA-COV-LIM GUARD-HELD (~19d); ESC-1/4/5 PASS.
- Release batch: CTG cycle 14 CRITICAL (#2776 undeployed, escalated BUG msg_id=2787 + signal file). VCB cycle 9 empty. D2D cycle 9 empty.
- Signals: #5813 FPT fundamental_validation (0.8). Signal: bctc_signal_FPT_20260612_routine.json

### Carry-over to c047
- CTG cycle 15 CRITICAL: bug#2776 escalated cycle 14. Check recent_fixes at c047 start.
- VCB (cycle 10), D2D (cycle 10): filed 2026-06-11, DB trống. Monitor.
- FPT ESC-3: DATA-COV-LIM GUARD-HELD (~19d remaining). Gold risk-off persists.

## c047 · 2026-06-13T15:10Z
### Analysis Cycle (15:09–15:10 UTC) — mode: mixed
- E2 guard: PASS (15:09 UTC, outside [02:00,08:00)). Slot: bctc-analyst-slot-1. Double-publish guard: claimed=true (bctc-slot-1:2026-06-13).
- Mode: mixed. 1 routine (FPT, E3 cache hit cycle 9) + 3 release BLOCKED (CTG cycle 15 CRITICAL, VCB cycle 10, D2D cycle 10).
- Bug #2776: NOT in recent_fixes — confirmed undeployed. No re-escalation (policy: skip silently after c046).
- Regime: NEUTRAL (carry +1.38pp, deposit 5.00% vs Fed 3.62%). Market EY 8.20% CHEAP (+3.20pp). VN-Index 1791.65 (-6.96). Tuần thứ 4 liên tiếp giảm.
- Macro: Gold $4,238.8 BULLISH risk-off; Brent $87.33 NEUTRAL; USD/VND 26,122 BEARISH.
- FPT Q1-2026 routine: E3 CACHE HIT cycle 9. PE 13.8 vs sector 17.3 (-20%); ROE 28.3%; EY_SPREAD +2.25pp FAIR.
- Signals: #5975 FPT fundamental_validation → alert-commander. #5976 BATCH-BLOCKED.
- Signal file: docs/signals/bctc_signal_FPT_20260613_routine.json

### Carry-over to c048
- CTG cycle 16 CRITICAL: #2776 persistently undeployed. No re-escalation unless recent_fixes shows fix.
- VCB (cycle 11), D2D (cycle 11): filed 2026-06-12, DB trống. Monitor.
- FPT ESC-3: DATA-COV-LIM GUARD-HELD (~18d remaining).

## c048 · 2026-06-13T18:13Z
### Analysis Cycle (18:09–18:13 UTC) — mode: mixed
- E2 guard: PASS (18:09 UTC, outside [02:00,08:00)). Slot: bctc-analyst-slot-2. Log ID: 1350. Double-publish guard: claimed=true (bctc-slot-2:2026-06-13).
- Mode: mixed. 1 routine (FPT, E3 cache hit cycle 10) + 3 release BLOCKED (CTG cycle 17 CRITICAL, VCB cycle 12, D2D cycle 12).
- Bug #2776: NOT in recent_fixes — confirmed undeployed. No re-escalation (policy).
- Regime: NEUTRAL (carry +1.38pp, deposit 5.00% vs Fed 3.62%). Market EY 8.20% CHEAP (+3.20pp). VN-Index 1791.65 (-6.96). Tuần 4 giảm.
- Macro: Gold $4,238.8 BULLISH risk-off (+0.0%); Brent $87.33 NEUTRAL; USD/VND 26,122 BEARISH (eased từ 26,325 EXTREME). CPI 5.46% — Investment clock Overheat/CORE_VN.
- FPT Q1-2026 routine: E3 CACHE HIT cycle 10 — passes skipped. Net profit 2,476.8ty (+19.8% YoY). ESC-1/2/4/5 PASS. ESC-3 DATA-COV-LIM GUARD-HELD (~17d remaining).
- Release batch: CTG cycle 17 CRITICAL. VCB cycle 12. D2D cycle 12 (bug #2776 undeployed).
- Signals: #5992 FPT fundamental_validation (0.8). #5993 BATCH-BLOCKED (0.6).

### Carry-over to c049
- CTG cycle 18 CRITICAL: #2776 persistently undeployed 17+ cycles. No re-escalation.
- VCB (cycle 13), D2D (cycle 13): DB trống. Gold $4,238.8 risk-off.

## c049 · 2026-06-13T21:12Z
### Analysis Cycle (21:09–21:12 UTC) — mode: mixed
- E2 guard: PASS (21:09 UTC, outside [02:00,08:00)). Slot: bctc-analyst-slot-3. Double-publish guard: claimed=true (bctc-slot-3:2026-06-13).
- Mode: mixed. 1 routine (FPT, E3 cache hit cycle 11) + 3 release BLOCKED (CTG cycle 18 CRITICAL, VCB cycle 13, D2D cycle 13).
- Bug #2776: NOT in recent_fixes — confirmed undeployed. No re-escalation (policy).
- Regime: NEUTRAL (carry +1.38pp). Market EY 8.20% CHEAP (+3.20pp). VN-Index 1791.65.
- Macro: Gold $4,238.8 BULLISH risk-off; Brent $87.33 NEUTRAL; USD/VND 26,122 BEARISH.
- FPT Q1-2026: E3 CACHE HIT cycle 11. ESC-3 DATA-COV-LIM GUARD-HELD (~16d).
- Signals: #6005 FPT fundamental_validation (0.8). #6006 BATCH-BLOCKED (0.6).

### Carry-over to c050
- CTG cycle 19, VCB cycle 14, D2D cycle 14. FPT ESC-3 GUARD-HELD (~16d).

## c050 · 2026-06-14T00:12Z
### Analysis Cycle (00:08–00:12 UTC) — mode: mixed
- E2 guard: PASS (00:08 UTC). Slot: bctc-analyst-slot-4. Log ID: 1354. Double-publish guard: claimed=true (bctc-slot-4:2026-06-14).
- Mode: mixed. 1 routine (FPT, E3 cache hit cycle 12) + 3 release BLOCKED (CTG cycle 19, VCB cycle 15, D2D cycle 15).
- Bug #2776: NOT in recent_fixes — confirmed undeployed. No re-escalation (policy).
- Regime: NEUTRAL (carry +1.38pp). Market EY 8.20% CHEAP (+3.20pp). VN-Index 1791.65.
- Macro: Gold $4,238.8 BULLISH risk-off; Brent $87.33 NEUTRAL; USD/VND 26,122 BEARISH.
- FPT Q1-2026: E3 CACHE HIT cycle 12. ESC-1/2/4/5 PASS. ESC-3 DATA-COV-LIM GUARD-HELD (~15d). [ESC-5] empty → skipping.
- Foreign flow: +500.4M cp net 5 phien. PB 3.6x vs sector 1.5x (ROE premium).
- Signals: #6017 FPT fundamental_validation (0.8). #6018 BATCH-BLOCKED (0.6).
- Signal file: docs/signals/bctc_signal_FPT_20260614_routine.json

### Carry-over to c051
- CTG cycle 20, VCB cycle 16, D2D cycle 16. FPT ESC-3 GUARD-HELD (~15d).

## c051 · 2026-06-14T15:15Z
### Analysis Cycle (15:10–15:15 UTC) — mode: mixed
- E2 guard: PASS (15:10 UTC, outside [02:00,08:00)). Slot: bctc-analyst-slot-1. Log ID: 1367. Double-publish guard: claimed=true (bctc-slot-1:2026-06-14).
- Mode: mixed. 1 routine (FPT, E3 cache hit cycle 13) + 3 release BLOCKED (CTG cycle 20 CRITICAL, VCB cycle 16, D2D cycle 16).
- Bug #2776: NOT in recent_fixes (top 10) — confirmed undeployed. No re-escalation (policy after c046).
- Regime: NEUTRAL (carry +1.38pp, deposit 5.00% vs Fed 3.62%). Market EY 8.20% CHEAP (+3.20pp). VN-Index 1791.65 (-6.96). Tuần 4+ liên tiếp giảm.
- Macro: Gold $4,238.8 BULLISH risk-off (unchanged); Brent $87.33 NEUTRAL; USD/VND 26,122 BEARISH. CPI 5.46% — Investment clock Overheat/CORE_VN.
- New context: DIG chủ tịch bị giải chấp cổ phiếu (governance alert, DIG not in watchlist). Petrovietnam lãi 52,000ty (utilities bullish). Khối ngoại bán ròng >3,000ty/tuần (MBB/VPB/VIC/VHM/FPT news_mention). HPG MEDIUM dat trang trai 400ha (not BCTC signal).
- FPT Q1-2026 routine: E3 CACHE HIT cycle 13 — passes skipped. Net profit 2,476.8ty (+19.8% YoY). PE 13.8x vs sector 17.3x (-20%). ROE 28.3% (2.7x sector). PB 3.6x. EY_SPREAD +2.25pp FAIR. OCF -2,847.8ty (mùa vụ). Cash 7,993.6ty. D/E 0.40x. Balance OK. ESC-1/2/4/5 PASS. ESC-3 DATA-COV-LIM GUARD-HELD (~14d remaining). Insider: clean. Legal: clean. Chain: 0. KD: Quẻ 56 Lữ TRUNG TÍNH/GIỮ (38%). Foreign flow: +500.4M cp net 5 phien.
- Signals: #6077 FPT fundamental_validation (0.8) → alert-commander. #6078 BATCH-BLOCKED (0.6).
- Signal file: docs/signals/bctc_signal_FPT_20260614_routine.json (updated c051).

### Carry-over to c052 (next slot, 2026-06-14 18:00 UTC)
- CTG cycle 21 CRITICAL: #2776 persistently undeployed 20+ cycles. No re-escalation (policy after c046).
- VCB (cycle 17), D2D (cycle 17): DB trống. Monitor.
- FPT ESC-3: DATA-COV-LIM GUARD-HELD (~14d remaining).
- Gold $4,238.8 risk-off — nếu >$4,300 escalate GAS/POW/REE defensives.
- Brent $87.33 NEUTRAL — nếu <$85 escalate GAS/PLX downside.
- DIG governance alert: chủ tịch giải chấp liên tiếp — không trong watchlist nhưng theo dõi sector BĐS.
- Khối ngoại bán ròng >3,000ty/tuần: áp lực lên banking/BĐS — monitor VCB/VIC/VHM.

## c052 · 2026-06-14T18:20Z
### Analysis Cycle (18:10–18:20 UTC) — mode: mixed
- E2 guard: PASS (18:10 UTC, outside [02:00,08:00)). Slot: bctc-analyst-slot-2. Log ID: 1371. Double-publish guard: claimed=true (bctc-slot-2:2026-06-14).
- Mode: mixed. 1 routine (FPT, E3 cache hit cycle 14) + 3 release BLOCKED (CTG cycle 21 CRITICAL, VCB cycle 17, D2D cycle 17).
- Bug #2776: NOT in recent_fixes (top 10 back to 2026-04-29) — confirmed undeployed. No re-escalation (policy after c046).
- Regime: NEUTRAL (carry +1.38pp, deposit 5.00% vs Fed 3.62%). Market EY 8.20% CHEAP (+3.20pp). VN-Index 1791.65 (-6.96). Tuần 4+ liên tiếp giảm.
- Macro: Gold $4,238.8 BULLISH risk-off; Brent $87.33 NEUTRAL; USD/VND 26,122 BEARISH. CPI (proxy 4%) — Investment clock CORE_VN. Fed có thể tăng lãi suất 2026 (Fulbright cảnh báo áp lực).
- New context: HPG giảm nhân sự (bearish, nhưng không phải BCTC). DIG chủ tịch giải chấp tiếp (không watchlist). Petrovietnam lãi 52,000ty neutral. Thanh khoản mùa World Cup "hụt hơi" (Mirae Asset).
- FPT Q1-2026 routine: E3 CACHE HIT cycle 14 — passes skipped. Net profit 2,476.8ty (+19.8% YoY). PE 13.8x vs sector 17.3x (-20%). ROE 28.3% (2.7x sector). PB 3.6x. EY_SPREAD +2.25pp FAIR. OCF -2,847.8ty (mùa vụ). Cash 7,993.6ty. D/E 0.40x. Balance OK. ESC-1/2/4/5 PASS. ESC-3 DATA-COV-LIM GUARD-HELD (~17d remaining). Insider: clean. Legal: clean. Chain: 0. KD: Quẻ 56 Lữ TRUNG TÍNH/GIỮ (38%). Foreign flow: +500.4M cp net 5 phien. Validation: passed 81%.
- Signals: #6091 FPT fundamental_validation (0.8) → alert-commander. #6092 BATCH-BLOCKED (0.6).
- Signal file: docs/signals/bctc_signal_FPT_20260614_routine.json

### Carry-over to c053 (next slot, 2026-06-14 21:00 UTC)
- CTG cycle 22 CRITICAL: #2776 persistently undeployed 21+ cycles. No re-escalation.
- VCB (cycle 18), D2D (cycle 18): DB trống. Monitor.
- FPT ESC-3: DATA-COV-LIM GUARD-HELD (~17d remaining).
- Gold $4,238.8 risk-off — nếu >$4,300 escalate GAS/POW/REE defensives.
- Brent $87.33 NEUTRAL — nếu <$85 escalate GAS/PLX downside.
- DIG governance alert: chủ tịch giải chấp liên tiếp — không trong watchlist nhưng theo dõi sector BĐS.
- Khối ngoại bán ròng >3,000ty/tuần: áp lực lên banking/BĐS — monitor MBB/VPB/VIC/VHM/FPT.
- Fed tăng lãi suất 2026: nếu xác nhận → đảo chiều carry NEUTRAL→FII_OUTFLOW_RISK; escalate tại c053 nếu có tín hiệu mới.

## c053 · 2026-06-14T21:07Z
### Analysis Cycle (21:00–21:07 UTC) — mode: routine
- E2 guard: PASS (21:00 UTC, outside [02:00,08:00)). Slot: bctc-analyst-slot-3. Log ID: 1376. Double-publish guard: claimed=true (bctc-slot-3:2026-06-14).
- Mode: routine (1 routine FPT, E3 cache hit cycle 15; 3 release BLOCKED: CTG cycle 22, VCB cycle 19, D2D cycle 19 — bug #2776 undeployed 22+ cycles).
- Bug #2776: NOT in recent_fixes (top 10, oldest 2026-04-29) — confirmed undeployed. No re-escalation (policy after c046).
- Regime: NEUTRAL (carry +1.38pp, deposit 5.00% vs Fed 3.63%). Market EY 8.20% CHEAP (+3.20pp). Investment clock Overheat/CORE_VN.
- Macro: Gold $4,238.8 BULLISH risk-off — quỹ vàng lớn xả 6 tấn (signal #6100, impact 7); Brent $87.33 NEUTRAL; USD/VND 26,122 BEARISH. Fed rate hike 2026 risk HIGH (signal #6101, impact 8, COC:headwind).
- FPT Q1-2026: E3 CACHE HIT cycle 15. Net profit 2,476.8ty; PE 13.8x (-20% vs sector 17.3x); ROE 28.3% (2.7x sector); EY_SPREAD +2.25pp FAIR. OCF -2,847.8ty (mùa vụ). Cash 7,993.6ty. D/E 0.40x. ESC-1/2/4/5 PASS. ESC-3 DATA-COV-LIM GUARD-HELD (~13d). ESC-5 EMPTY-SKIP. Insider clean. Legal clean. Chain 0. KD: Quẻ 56 Lữ TRUNG TÍNH/GIỮ (38%). Foreign flow: +500.4M cp net 5 phiên (FPT bucking sector sell trend). m_score=0, f_score=7. Validation 81%.
- Signals: #6105 FPT fundamental_validation (0.8) → alert-commander. #6106 BATCH-BLOCKED (0.6).
- Signal file: docs/signals/bctc_signal_FPT_20260614_routine.json (updated c053).

### Carry-over to c054 (next slot, 2026-06-15 00:00 UTC)
- CTG cycle 23, VCB cycle 20, D2D cycle 20: bug #2776 undeployed. No re-escalation.
- FPT ESC-3: DATA-COV-LIM GUARD-HELD (~13d remaining).
- Gold $4,238.8 risk-off — quỹ vàng xả; nếu >$4,300 escalate POW/REE/GAS defensives.
- Fed rate hike 2026: nếu xác nhận → carry NEUTRAL→FII_OUTFLOW_RISK; escalate tại c054 nếu có tín hiệu mới.
- Brent $87.33 NEUTRAL — nếu <$85 escalate GAS/PLX downside.

## c054 · 2026-06-15T00:10Z
### Analysis Cycle (00:00–00:10 UTC) — mode: routine
- E2 guard: PASS (00:00 UTC, outside [02:00,08:00)). Slot: bctc-analyst-slot-4. Double-publish guard: claimed=true (bctc-slot-4:2026-06-15).
- Mode: routine (1 routine FPT, E3 cache hit cycle 16; 3 release BLOCKED: CTG cycle 24, VCB cycle 21, D2D cycle 21 — bug #2776 undeployed 24+ cycles).
- Bug #2776: NOT in recent_fixes (oldest 2026-04-29) — confirmed undeployed. No re-escalation (policy after c046).
- Regime: NEUTRAL (carry +1.38pp, deposit 5.00% vs Fed 3.63%). Market EY 8.20% CHEAP (+3.20pp). VN-Index 1,791.65 (-6.96). Tuần 4+ liên tiếp giảm.
- MACRO NEW: Gold $4,302.9 (+1.51%) — ngưỡng >$4,300 ĐÃ VƯỢT (risk-off escalate defensives GAS/POW/REE). Brent $83.91 (-3.92%) — ngưỡng <$85 ĐÃ VƯỢT (GAS/PLX downside). Fed rate hike 2026 risk HIGH (Fulbright, signal c053). USD/VND 26,122 BEARISH. Khối ngoại bán ròng >3,000ty/tuần (MBB/VPB/VIC/VHM/FPT).
- FPT Q1-2026 routine: E3 CACHE HIT cycle 16 — passes skipped. Net profit 2,476.8ty (+19.8% YoY). PE 13.8x vs sector 17.3x (-20%). ROE 28.3% (2.7x sector). PB 3.6x. EY_SPREAD +2.25pp FAIR. OCF -2,847.8ty (mùa vụ). Cash 7,993.6ty. D/E 0.40x. Balance OK. ESC-1/2/4/5 PASS. ESC-3 DATA-COV-LIM GUARD-HELD (~12d remaining). ESC-5 EMPTY-SKIP. Insider: clean. Legal: clean. Chain: 0. M-score=0, F-score=7. Validation 81%.
- Signals: #6117 FPT fundamental_validation (0.8) → alert-commander. #6120 BATCH-BLOCKED (0.6).
- Signal file: docs/signals/bctc_signal_FPT_20260615_routine.json

### Carry-over to c055 (next slot, 2026-06-15 15:00 UTC)
- CTG cycle 25, VCB cycle 22, D2D cycle 22: bug #2776 persistently undeployed. No re-escalation.
- FPT ESC-3: DATA-COV-LIM GUARD-HELD (~12d remaining).
- Gold $4,302.9 >$4,300 risk-off — ngưỡng ĐÃ VƯỢT: alert-commander escalate GAS/POW/REE defensives tại c055 nếu tiếp tục.
- Brent $83.91 <$85 — ngưỡng ĐÃ VƯỢT: alert-commander escalate GAS/PLX downside tại c055 nếu tiếp tục.
- Fed rate hike 2026: carry NEUTRAL→FII_OUTFLOW_RISK risk nếu xác nhận — monitor at c055.
- Khối ngoại bán ròng >3,000ty/tuần: áp lực lên MBB/VPB/VIC/VHM/FPT — monitor.
