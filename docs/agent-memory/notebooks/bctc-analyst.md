# BCTC Analyst — Notebook

**Last updated:** 2026-06-16 18:20 UTC (c060-slot2) | **Sprint:** BCTC-EXTRACT-QUALITY

## c057 · 2026-06-15T21:10Z
### Analysis Cycle (21:00–21:10 UTC) — mode: mixed
- E2 guard: PASS (21:00 UTC, outside [02:00,08:00)). Slot: bctc-analyst-slot-3. Log ID: 1392. Double-publish guard: claimed=true (bctc-slot-3:2026-06-15).
- Mode: mixed. 1 routine (FPT, E3 cache hit cycle 19) + 4 release BLOCKED (CTG cycle 29 CRITICAL, VCB cycle 26, D2D cycle 26, VNM cycle 1 NEW).
- Bug #2776: NOT in recent_fixes (oldest 2026-04-29) — confirmed undeployed. No re-escalation (policy after c046).
- Regime: NEUTRAL (carry +1.38pp). Market EY 7.05% CHEAP (+2.05pp). VN-Index 1,799.31 (+7.66).
- MACRO: Gold $4,332.5 BULLISH risk-off >$4,300. Brent $83.51 NEUTRAL (US-Iran peace deal). USD/VND 26,103 BEARISH. Investment clock Overheat/CORE_VN. CPI 5.46%.
- FPT Q1-2026 routine: E3 CACHE HIT cycle 19. Net profit 2,476.8ty (+19.8% YoY). PE 13.8x vs sector 17.3x (-20%). ROE 28.3% (2.7x sector). ESC-1/2/4 PASS. ESC-3 DATA-COV-LIM GUARD-HELD (~11d). ESC-5 EMPTY-SKIP.
- VNM: MỚI ĐÃ NỘP 2026-06-15 — DB trống (lỗi #2776). Cycle 1.
- Signals: #6236 FPT fundamental_validation (0.8, critic 0.6) → alert-commander. #6237 BATCH-BLOCKED (0.6).

### Carry-over to c058 (next slot, 2026-06-16 00:00 UTC)
- CTG cycle 30 CRITICAL: #2776 persistently undeployed. No re-escalation.
- VCB (cycle 27), D2D (cycle 27): DB trống. Monitor.
- VNM (cycle 2): Mới nộp 2026-06-15 — DB trống. Monitor.
- FPT ESC-3: DATA-COV-LIM GUARD-HELD (~11d remaining).
- Securities chain_catalyst score 8.5; VIC khối ngoại >4,200ty theo dõi fundamental.

## c058 · 2026-06-16T00:15Z
### Analysis Cycle (00:00–00:15 UTC) — mode: mixed
- E2 guard: PASS (00:00 UTC, outside [02:00,08:00)). Slot: bctc-analyst-slot-4. Log ID: 1394. Double-publish guard: claimed=true (bctc-slot-4:2026-06-16).
- Mode: mixed. 1 routine (FPT, E3 cache hit cycle 20) + 4 release BLOCKED (CTG cycle 31 CRITICAL/corrupt, VCB cycle 28, D2D cycle 28, VNM cycle 3).
- Bug #2776: NOT in recent_fixes (oldest 2026-04-29) — confirmed undeployed 31+ cycles. No re-escalation (policy after c046).
- Regime: NEUTRAL (carry +1.38pp, deposit 5.00% vs Fed 3.62%). Market EY 7.05% CHEAP (+2.05pp). VN-Index 1,799.31.
- MACRO: Gold $4,334.7 BULLISH risk-off >$4,300. Brent $83.68 NEUTRAL. USD/VND 26,103 BEARISH. Investment clock Overheat/CORE_VN.
- New legal: JSH chủ tịch bị bắt (c057, confirmed). VPB Lạng Sơn audit. CMG vi phạm CK (peer FPT). DIG giải chấp.
- FPT Q1-2026 routine: E3 CACHE HIT cycle 20 — passes skipped. Net profit 2,476.8ty (+19.8% YoY). PE 13.8x (-20% vs sector 17.3x). ROE 28.3% (2.7x sector). EY_SPREAD +2.25pp CHEAP. D/E 0.40x. Cash 7,993.6ty. M-score=0, F-score=7. ESC-1/2/4 PASS. ESC-3 DATA-COV-LIM GUARD-HELD (~10d). ESC-5 EMPTY-SKIP. Insider: clean. Legal: clean. Chain: 0. KD: Quẻ 48 Tỉnh TRUNG TÍNH/GIỮ (38%). Foreign flow: +500.4M cp net 5 phiên.
- CTG: data corrupt (assets=0, EBITDA=362,940ty). Bug #2776 — BLOCKED cycle 31.
- VCB: data partial (confidence=75%, single period, validation=passed). No YoY possible — BLOCKED cycle 28.
- D2D, VNM: DB trống — BLOCKED cycles 28/3.
- Signals: #6246 FPT fundamental_validation (0.8, critic 0.6) → alert-commander. #6249 BATCH-BLOCKED (0.6).
- Signal file: docs/signals/bctc_signal_FPT_20260616_routine.json

### Carry-over to c059 (next slot, 2026-06-16 15:00 UTC)
- CTG cycle 32 CRITICAL: data corrupt + #2776 persistently undeployed. No re-escalation.
- VCB (cycle 29), D2D (cycle 29): DB trống/partial. Monitor.
- VNM (cycle 4): DB trống. Monitor.
- FPT ESC-3: DATA-COV-LIM GUARD-HELD (~10d remaining).
- Gold $4,334.7 risk-off >$4,300; defensive posture GAS/POW/REE.
- VIC khối ngoại >4,200ty: theo dõi fundamental BĐS.
- VPB audit Lạng Sơn: theo dõi compliance exposure banking sector.
- DPM/REE/NVL RSI quá bán: monitor oversold bounce potential.

## c059 · 2026-06-16T15:15Z
### Analysis Cycle (15:00–15:15 UTC) — mode: routine
- E2 guard: PASS (15:00 UTC, outside [02:00,08:00)). Slot: bctc-analyst-slot-1. Log ID: 1402. Double-publish guard: claimed=true (bctc-slot-1:2026-06-16).
- Mode: routine (1 routine FPT, E3 cache hit cycle 21; 4 release BLOCKED: CTG cycle 32, VCB cycle 29, D2D cycle 29, VNM cycle 4 — bug #2776 undeployed 32+ cycles).
- Bug #2776: NOT in recent_fixes (oldest 2026-04-29) — confirmed undeployed. No re-escalation (policy after c046).
- Regime: NEUTRAL (carry +1.38pp, deposit 5.00% vs Fed 3.63%). Market EY 7.05% CHEAP (+2.05pp). VN-Index 1,807.94 (+8.63) — PHỤC HỒI.
- MACRO: Gold $4,338.9 BULLISH risk-off >$4,300. Brent $80.2 (-4.11%) NEUTRAL. USD/VND 26,103 BEARISH. Investment clock Overheat/CORE_VN. CPI 5.46%.
- Legal: JSH chủ tịch bị bắt confirmed. CMG vi phạm CK (peer FPT). DIG giải chấp. VPB Lạng Sơn audit. HVN price_surge 3.5x volume.
- FPT Q1-2026: E3 CACHE HIT cycle 21. Net profit 2,476.8ty. PE 13.8x (-20% vs sector 17.3x). ROE 28.3% (2.7x sector). EY_SPREAD +2.25pp CHEAP. D/E 0.40x. Cash 7,993.6ty. OCF -2,847.8ty (seasonal). M-score=0, F-score=7. ESC-1/2/4 PASS. ESC-3 DATA-COV-LIM GUARD-HELD (~10d). ESC-5 EMPTY-SKIP. Insider: clean. Legal: clean. KD: Quẻ 54 Qui Muoi BAT LOI/GIU (63%) — CHANGED from Quẻ 48.
- CTG cycle 32: corrupt (assets=0, EBITDA=362,940,957,001.8ty). BLOCKED.
- VCB cycle 29: single period only. BLOCKED. D2D/VNM cycles 29/4: DB trong. BLOCKED.
- Signals: #6338 FPT fundamental_validation (0.8, critic 0.8) → alert-commander. #6339 BATCH-BLOCKED (0.6).
- Signal file: docs/signals/bctc_signal_FPT_20260616_routine.json

### Carry-over to c060 (next slot, 2026-06-16 18:00 UTC)
- CTG cycle 33 CRITICAL: data corrupt + #2776 persistently undeployed. No re-escalation.
- VCB (cycle 30), D2D (cycle 30): DB trong/partial. Monitor. VNM (cycle 5): DB trong. Monitor.
- FPT ESC-3: DATA-COV-LIM GUARD-HELD (~10d remaining).
- KD CHANGED: FPT Quẻ 54 BAT LOI vs prior Quẻ 48 TICH CUC — caution, possible short-term reversal.
- HVN: price_surge + volume_spike 3.5x average (Vietnam Airlines momentum). Monitor aviation fundamental.
- VIC: khối ngoại bán ròng >100ty phiên 16/6 after >4,200ty mua ròng — đảo chiều. Monitor BĐS fundamental.
- Brent $80.2 (-4.11%) pullback — watch GAS/PLX Oil&Gas sector margin relief.

## c060 · 2026-06-16T18:20Z
### Analysis Cycle (18:00–18:20 UTC) — mode: routine
- E2 guard: PASS (18:00 UTC, outside [02:00,08:00)). Slot: bctc-analyst-slot-2. Log ID: 1406. Double-publish guard: claimed=true (bctc-slot-2:2026-06-16).
- Mode: routine (1 routine FPT, E3 cache hit cycle 22; 4 release BLOCKED: CTG cycle 33 CRITICAL, VCB cycle 30, D2D cycle 30, VNM cycle 5 — bug #2776 undeployed 33+ cycles).
- Bug #2776: NOT in recent_fixes (oldest 2026-04-29) — confirmed undeployed. No re-escalation (policy after c046).
- Regime: NEUTRAL (carry +1.38pp, deposit 5.00% vs Fed 3.63%). Market EY 7.05% CHEAP (+2.05pp). VN-Index 1,807.94 (+8.63).
- MACRO: Gold $4,365.4 (+0.78%) BULLISH risk-off >$4,300. Brent $78.59 (-6.04%) NEUTRAL. USD/VND 26,103 BEARISH. Investment clock Overheat/CORE_VN. CPI 5.46%.
- New alerts: HVN price_surge +6.86% vol 3.5x avg (Vietnam Airlines 2 phiên tăng trần). FDI catalyst: Top-50 China firm $14.8B VN investment (HPG sector positive). POW: potential 1,600ty one-time LNG revenue.
- FPT Q1-2026: E3 CACHE HIT cycle 22. Net profit 2,476.8ty. PE 13.8x (-20% vs sector 17.3x). ROE 28.3% (2.7x sector). EY_SPREAD +2.25pp CHEAP. D/E 0.40x. Cash 7,993.6ty. OCF -2,847.8ty seasonal. M-score=0, F-score=7. ESC-3 DATA-COV-LIM GUARD-HELD (~8d remaining). ESC-5 EMPTY-SKIP. Insider: clean. Legal: clean. KD: Quẻ 54 Qui Muoi BAT LOI/GIU (63%) — unchanged.
- Sector: FPT foreign flow +500M cp net (5 phiên, mạnh hơn ngành). Tech sector avg +1.1%. FPT -0.54% ngày 16/6 — short-term pressure vs strong fundamental.
- Signals: #6354 FPT fundamental_validation (0.8, critic 0.4) → alert-commander. #6355 BATCH-BLOCKED (0.6).
- Signal file: docs/signals/bctc_signal_FPT_20260616_routine.json

### Carry-over to c061 (next slot, 2026-06-16 21:00 UTC)
- CTG cycle 34 CRITICAL: data corrupt + #2776 persistently undeployed. No re-escalation.
- VCB (cycle 31), D2D (cycle 31): DB trong/partial. Monitor. VNM (cycle 6): DB trong. Monitor.
- FPT ESC-3: DATA-COV-LIM GUARD-HELD (~8d remaining).
- KD UNCHANGED: FPT Quẻ 54 BAT LOI — caution vs strong fundamental.
- HVN: monitor aviation fundamental post 2-phiên tăng trần (Vietnam Airlines sentiment).
- POW: theo dõi 1,600ty LNG one-time revenue confirmation in Q2 BCTC.
- HPG: FDI $14.8B signal — watch steel demand catalyst Q3 effect.
- Brent $78.59 (-6.04%): GAS/PLX margin relief — watch Q2 BCTC margin expansion.
