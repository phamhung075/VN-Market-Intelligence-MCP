# BCTC Analyst — Notebook

**Last updated:** 2026-06-14 00:12 UTC (c050) | **Sprint:** BCTC-EXTRACT-QUALITY

## c044 · 2026-06-11T18:08Z
### Analysis Cycle (18:06–18:08 UTC) — mode: mixed
- E2 guard: PASS (18:06 UTC). Slot: bctc-analyst-slot-2. Log ID: 1338.
- Mode: mixed. 1 routine (FPT, E3 cache hit cycle 6) + 28 release BLOCKED (CTG cycle 12 CRITICAL).
- Regime: NEUTRAL (carry +1.38pp). Market EY 8.20% CHEAP (+3.20pp). VN-Index 1798.61.
- Macro: Gold $4,168.2 BULLISH (+2.39%); Brent $89.77 NEUTRAL; USD/VND 26,130 BEARISH.
- FPT Q1-2026: E3 CACHE HIT cycle 6. Net profit 2,476.8ty (+19.8%). OCF -2,847.8ty (mùa vụ). ESC-2 PASS; ESC-3 DATA-COV-LIM GUARD-HELD (~21d).
- EVN lãi kỷ lục 52ty (utilities bullish). Digiworld doanh thu 2 chữ số (retail impact=9).
- Signals: #5783 FPT (0.6), #5784 BATCH-BLOCKED (0.6).

### Carry-over to c045
- CTG cycle 12 CRITICAL: #2776 URGENT escalate nếu c045 blocked (12+ cycles).
- VCB/D2D cycle 7 empty. 28 tickers BLOCKED. FPT ESC-3 GUARD-HELD (~21d).
- Gold $4,168 rebound, USD/VND EXTREME, KBC vol 5x: ưu tiên extraction khi pipeline fix.

## c045 · 2026-06-11T21:08Z
### Analysis Cycle (21:06–21:08 UTC) — mode: mixed
- E2 guard: PASS (21:06 UTC, outside [02:00,08:00)). Slot: bctc-analyst-slot-3. Log ID: 1340.
- Double-publish guard: claimed=true (bctc-slot-3:2026-06-11).
- Mode: mixed. 1 routine (FPT, E3 cache hit cycle 7) + 28 release BLOCKED (CTG cycle 13 CRITICAL; VCB/D2D cycle 8 empty; ACB/EIB/DHG PUB-5 cycle 5; 22 mã khác empty).
- Regime: NEUTRAL (carry +1.38pp). Max Deposit Rate: 5.00%. Market EY 8.20% CHEAP (+3.20pp). VN-Index 1798.61. Investment clock: Overheat/CORE_VN (CPI 5.46%).
- Macro: Gold $4,234.8 +4.02% BULLISH risk-off HIGH alert (+2.84σ); Brent $88.94 -7.57% LOW alert (-2.03σ); USD/VND 26,130 BEARISH (EXTREME alert 26,325 +5.25σ tại 13:30). Châu Âu tăng lãi suất.
- FPT Q1-2026 routine: E3 CACHE HIT cycle 7. PE 13.8 vs sector 17.3 (-20%); ROE 28.3%; EY_SPREAD +2.25pp FAIR. Net profit 2,476.8ty (+19.8% YoY). ESC-2=PASS, ESC-3=DATA-COV-LIM GUARD-HELD cycle 8 (~20d).
- Release batch: CTG cycle 13 CRITICAL. VCB cycle 8 empty. D2D cycle 8 empty. Bug #2776 URGENT UNDEPLOYED.
- Signals: #5796 FPT fundamental_validation (0.8), #5797 BATCH-BLOCKED (0.6).

### Carry-over to c046
- CTG pipeline CRITICAL cycle 13. VCB (cycle 8), D2D (cycle 8). 28 tickers BLOCKED.
- FPT ESC-3: DATA-COV-LIM GUARD-HELD (~20d remaining). Gold $4,234.8 HIGH alert.
- KBC vol 5x priority khi pipeline fix. Brent <$85 → escalate GAS/PLX.

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
- VCB (cycle 10), D2D (cycle 10): filed 2026-06-11, extraction broken. 28 tickers BLOCKED.
- FPT ESC-3: DATA-COV-LIM GUARD-HELD (~19d remaining). Gold risk-off persists.

## c047 · 2026-06-13T15:10Z
### Analysis Cycle (15:09–15:10 UTC) — mode: mixed
- E2 guard: PASS (15:09 UTC, outside [02:00,08:00)). Slot: bctc-analyst-slot-1. Double-publish guard: claimed=true (bctc-slot-1:2026-06-13).
- Mode: mixed. 1 routine (FPT, E3 cache hit cycle 9) + 3 release BLOCKED (CTG cycle 15 CRITICAL, VCB cycle 10, D2D cycle 10).
- Bug #2776: NOT in recent_fixes — confirmed undeployed. No re-escalation (already escalated c046). Skip silently.
- Regime: NEUTRAL (carry +1.38pp, deposit 5.00% vs Fed 3.62%). Market EY 8.20% CHEAP (+3.20pp). VN-Index 1791.65 (-6.96). Tuần thứ 4 liên tiếp giảm.
- Macro: Gold $4,238.8 BULLISH risk-off; Brent $87.33 NEUTRAL; USD/VND 26,122 BEARISH.
- FPT Q1-2026 routine: E3 CACHE HIT cycle 9. PE 13.8 vs sector 17.3 (-20%); ROE 28.3%; EY_SPREAD +2.25pp FAIR.
- Signals: #5975 FPT fundamental_validation → alert-commander. #5976 BATCH-BLOCKED.
- Signal file: docs/signals/bctc_signal_FPT_20260613_routine.json

### Carry-over to c048
- CTG cycle 16 CRITICAL: #2776 persistently undeployed. No re-escalation unless recent_fixes shows fix.
- VCB (cycle 11), D2D (cycle 11): filed 2026-06-12, DB trống. Monitor.
- FPT ESC-3: DATA-COV-LIM GUARD-HELD (~18d remaining).
- Gold $4,238.8 risk-off trend. Brent $87.33 neutral. USD/VND 26,122 slight ease.

## c048 · 2026-06-13T18:13Z
### Analysis Cycle (18:09–18:13 UTC) — mode: mixed
- E2 guard: PASS (18:09 UTC, outside [02:00,08:00)). Slot: bctc-analyst-slot-2. Log ID: 1350. Double-publish guard: claimed=true (bctc-slot-2:2026-06-13).
- Mode: mixed. 1 routine (FPT, E3 cache hit cycle 10) + 3 release BLOCKED (CTG cycle 17 CRITICAL, VCB cycle 12, D2D cycle 12).
- Bug #2776: NOT in recent_fixes — confirmed undeployed. No re-escalation (policy: skip silently after c046 escalation).
- Regime: NEUTRAL (carry +1.38pp, deposit 5.00% vs Fed 3.62%). Market EY 8.20% CHEAP (+3.20pp). VN-Index 1791.65 (-6.96). Tuần 4 giảm.
- Macro: Gold $4,238.8 BULLISH risk-off (+0.0%); Brent $87.33 NEUTRAL; USD/VND 26,122 BEARISH (eased từ 26,325 EXTREME). CPI 5.46% — Investment clock Overheat/CORE_VN.
- Recent context: VN-Index tuần 8-12/6 giảm tuần 4. Vàng SJC tăng +11tr/lượng (2 ngày). Đà Nẵng FTZ tăng tốc (KBC-adjacent +). Fintech xuyên biên giới (neutral tech).
- FPT Q1-2026 routine: E3 CACHE HIT cycle 10 — passes skipped. Net profit 2,476.8ty (+19.8% YoY). PE 13.8x vs sector 17.3x (-20% discount). ROE 28.3% (2.7x median 10.6%). EY_SPREAD +2.25pp FAIR. OCF Q1 -2,847.8ty (mùa vụ). Balance OK (imbalance=0). D/E 0.40x. ESC-1/2/4/5 PASS. ESC-3 DATA-COV-LIM GUARD-HELD (~17d remaining). Insider: clean. Legal: clean. Chain: 0 open.
- Valuation: FPT +0.6% hôm nay vs ngành 0.0%. Kinh Dịch Quẻ 56 Lữ TRUNG TÍNH/GIỮ (tích cực).
- Release batch: CTG cycle 17 CRITICAL (đã nộp 2026-06-13, DB trống). VCB cycle 12 (đã nộp 2026-06-13, DB trống). D2D cycle 12 (đã nộp 2026-06-13, DB trống).
- Open alerts: VCB HIGH price_drop (07:59 UTC). HCM LOW news_mention (07:50 UTC).
- Legal carry: CMG/VNECO2 tax_penalty (2026-05-29), PC1 arrest (2026-05-21 unresolved), VPB Lạng Sơn audit.
- Signals: #5992 FPT fundamental_validation (0.8) → alert-commander. #5993 BATCH-BLOCKED (0.6).
- Signal file: docs/signals/bctc_signal_FPT_20260613_routine.json (updated c048).

### Carry-over to c049 (next slot, 2026-06-13 21:00 UTC)
- CTG cycle 18 CRITICAL: #2776 persistently undeployed 17+ cycles. No re-escalation (policy after c046).
- VCB (cycle 13), D2D (cycle 13): filed 2026-06-13, DB trống. Monitor.
- FPT ESC-3: DATA-COV-LIM GUARD-HELD (~17d remaining).
- Gold $4,238.8 risk-off — if >$4,300 escalate GAS/POW/REE defensives.
- Brent $87.33 NEUTRAL — if <$85 escalate GAS/PLX downside.
- Đà Nẵng FTZ acceleration news: KBC-adjacent positive — ưu tiên extraction khi pipeline fix.
- USD/VND 26,122: eased slightly từ EXTREME 26,325 — ACB/VCB/CTG NIM pressure giảm nhẹ.
- VCB HIGH alert price_drop: monitor nếu tiếp tục giảm mạnh c049.

## c049 · 2026-06-13T21:12Z
### Analysis Cycle (21:09–21:12 UTC) — mode: mixed
- E2 guard: PASS (21:09 UTC, outside [02:00,08:00)). Slot: bctc-analyst-slot-3. Double-publish guard: claimed=true (bctc-slot-3:2026-06-13).
- Mode: mixed. 1 routine (FPT, E3 cache hit cycle 11) + 3 release BLOCKED (CTG cycle 18 CRITICAL, VCB cycle 13, D2D cycle 13).
- Bug #2776: NOT in recent_fixes — confirmed undeployed. No re-escalation (policy: skip silently after c046 escalation).
- Regime: NEUTRAL (carry +1.38pp, deposit 5.00% vs Fed 3.62%). Market EY 8.20% CHEAP (+3.20pp). VN-Index 1791.65 (-6.96). Tuần 4 liên tiếp giảm.
- Macro: Gold $4,238.8 BULLISH risk-off (-0.03% vs c048); Brent $87.33 NEUTRAL (+0.72%); USD/VND 26,122 BEARISH (ổn định). CPI 5.46% — Investment clock Overheat/CORE_VN.
- FPT Q1-2026 routine: E3 CACHE HIT cycle 11 — passes skipped. Net profit 2,476.8ty (+19.8% YoY). PE 13.8x vs sector 17.3x (-20% discount). ROE 28.3% (2.7x median 10.6%). EY_SPREAD +2.25pp FAIR. OCF Q1 -2,847.8ty (mùa vụ). Tiền mặt 7,993.6ty. Balance OK (imbalance≈0). D/E 0.40x. ESC-1/2/4/5 PASS. ESC-3 DATA-COV-LIM GUARD-HELD (~16d remaining). Insider: clean. Legal: clean. Chain: 0 open. Kinh Dịch: Quẻ 56 Lữ TRUNG TÍNH/GIỮ (37%).
- Release batch: CTG cycle 18 CRITICAL. VCB cycle 13 empty. D2D cycle 13 empty (bug #2776 undeployed).
- Open alerts: VCB HIGH price_drop (07:59 UTC). HCM LOW news_mention (07:50 UTC) — ổn định từ c048.
- Legal carry: CMG/VNECO2 tax_penalty (2026-05-29), PC1 arrest (2026-05-21 unresolved), VPB Lạng Sơn audit.
- Signals: #6005 FPT fundamental_validation (0.8) → alert-commander. #6006 BATCH-BLOCKED (0.6).
- Signal file: docs/signals/bctc_signal_FPT_20260613_routine.json (updated c049).

### Carry-over to c050 (next slot, 2026-06-14 00:00 UTC)
- CTG cycle 19 CRITICAL: #2776 persistently undeployed 18+ cycles. No re-escalation (policy after c046).
- VCB (cycle 14), D2D (cycle 14): DB trống. Monitor.
- FPT ESC-3: DATA-COV-LIM GUARD-HELD (~16d remaining).
- Gold $4,238.8 risk-off — nếu >$4,300 escalate GAS/POW/REE defensives.
- Brent $87.33 NEUTRAL — nếu <$85 escalate GAS/PLX downside.
- VCB HIGH alert price_drop: monitor c050 nếu tình trạng tiếp tục.
- Đà Nẵng FTZ: KBC-adjacent positive — ưu tiên extraction khi pipeline fix.

## c050 · 2026-06-14T00:12Z
### Analysis Cycle (00:08–00:12 UTC) — mode: mixed
- E2 guard: PASS (00:08 UTC, outside [02:00,08:00)). Slot: bctc-analyst-slot-4. Log ID: 1354. Double-publish guard: claimed=true (bctc-slot-4:2026-06-14).
- Mode: mixed. 1 routine (FPT, E3 cache hit cycle 12) + 3 release BLOCKED (CTG cycle 19 CRITICAL, VCB cycle 15, D2D cycle 15).
- Bug #2776: NOT in recent_fixes — confirmed undeployed. No re-escalation (policy: skip silently after c046 escalation).
- Regime: NEUTRAL (carry +1.38pp, deposit 5.00% vs Fed 3.62%). Market EY 8.20% CHEAP (+3.20pp). VN-Index 1791.65 (-6.96). Tuần 4 liên tiếp giảm.
- Macro: Gold $4,238.8 BULLISH risk-off (unchanged); Brent $87.33 NEUTRAL; USD/VND 26,122 BEARISH. CPI 5.46% — Investment clock Overheat/CORE_VN.
- FPT Q1-2026 routine: E3 CACHE HIT cycle 12 — passes skipped. Net profit 2,476.8ty (+19.8% YoY). PE 13.8x vs sector 17.3x (-20% discount). PB 3.6x vs sector 1.5x (ROE premium). ROE 28.3% (2.7x median 10.6%). EY_SPREAD +2.25pp FAIR. OCF Q1 -2,847.8ty (mùa vụ). Cash 7,993.6ty. Balance OK (imbalance≈0). D/E 0.40x. ESC-1/2/4/5 PASS. ESC-3 DATA-COV-LIM GUARD-HELD (~15d remaining). [ESC-5] bctc_refined_units empty for FPT-Q1-2026 — skipping. Insider: clean. Legal: clean (CMG/PC1/VPB carry không liên quan FPT). Chain: 0 open. Foreign flow: +500.4M cp net 5 phiên (mạnh hơn ngành +0.0%).
- Release batch: CTG cycle 19 CRITICAL. VCB cycle 15 empty. D2D cycle 15 empty (bug #2776 undeployed).
- Signals: #6017 FPT fundamental_validation (0.8) → alert-commander. #6018 BATCH-BLOCKED (0.6).
- Signal file: docs/signals/bctc_signal_FPT_20260614_routine.json

### Carry-over to c051 (next slot, 2026-06-14 15:00 UTC)
- CTG cycle 20 CRITICAL: #2776 persistently undeployed 19+ cycles. No re-escalation (policy after c046).
- VCB (cycle 16), D2D (cycle 16): DB trống. Monitor.
- FPT ESC-3: DATA-COV-LIM GUARD-HELD (~15d remaining).
- Gold $4,238.8 risk-off — nếu >$4,300 escalate GAS/POW/REE defensives.
- Brent $87.33 NEUTRAL — nếu <$85 escalate GAS/PLX downside.
- VCB HIGH alert price_drop: monitor c051 nếu tiếp tục.
- Đà Nẵng FTZ: KBC-adjacent positive — ưu tiên extraction khi pipeline fix.
