# BCTC Analyst — Notebook

**Last updated:** 2026-06-23 18:10 UTC (c061-slot2) | **Sprint:** BCTC-EXTRACT-QUALITY

## c058 · 2026-06-16T00:15Z
### Analysis Cycle (00:00–00:15 UTC) — mode: mixed
- E2 guard: PASS (00:00 UTC). Slot: bctc-analyst-slot-4. Log ID: 1394. Guard: claimed=true.
- Mode: mixed. 1 routine (FPT, E3 cache hit cycle 20) + 4 release BLOCKED (CTG cycle 31 CRITICAL, VCB cycle 28, D2D cycle 28, VNM cycle 3).
- Bug #2776: undeployed 31+ cycles. No re-escalation.
- Regime: NEUTRAL (+1.38pp). EY CHEAP (+2.05pp). VN-Index 1,799.31.
- MACRO: Gold $4,334.7 BULLISH. Brent $83.68 NEUTRAL. USD/VND 26,103 BEARISH.
- FPT Q1-2026: E3 CACHE HIT cycle 20. Net profit 2,476.8ty (+19.8% YoY). PE 13.8x (-20% vs sector). ROE 28.3%. EY_SPREAD +2.25pp. M-score=0, F-score=7. ESC-3 DATA-COV-LIM. ESC-5 EMPTY-SKIP.
- CTG/VCB/D2D/VNM: BLOCKED. Signals: #6246 FPT fundamental_validation (0.8) → alert-commander.

## c059 · 2026-06-16T15:15Z
### Analysis Cycle (15:00–15:15 UTC) — mode: routine
- E2 guard: PASS (15:00 UTC). Slot: bctc-analyst-slot-1. Log ID: 1402. Guard: claimed=true.
- Mode: routine. FPT E3 cache hit cycle 21. 4 release BLOCKED (CTG 32, VCB 29, D2D 29, VNM 4).
- Regime: NEUTRAL (+1.38pp). EY CHEAP (+2.05pp). VN-Index 1,807.94 (+8.63).
- MACRO: Gold $4,338.9 BULLISH. Brent $80.2 NEUTRAL. USD/VND 26,103 BEARISH.
- FPT: E3 CACHE HIT cycle 21. Net profit 2,476.8ty. KD CHANGED: Quẻ 54 Qui Muoi BAT LOI/GIU (63%).
- Signals: #6338 FPT fundamental_validation (0.8, critic 0.8).

## c060 · 2026-06-16T18:20Z
### Analysis Cycle (18:00–18:20 UTC) — mode: routine
- E2 guard: PASS (18:00 UTC). Slot: bctc-analyst-slot-2. Log ID: 1406. Guard: claimed=true.
- Mode: routine. FPT E3 cache hit cycle 22. 4 release BLOCKED (CTG 33 CRITICAL, VCB 30, D2D 30, VNM 5).
- Regime: NEUTRAL (+1.38pp). EY CHEAP (+2.05pp). VN-Index 1,807.94.
- MACRO: Gold $4,365.4 (+0.78%) BULLISH. Brent $78.59 (-6.04%) NEUTRAL. USD/VND 26,103 BEARISH.
- New alerts: HVN +6.86% 2 phiên tăng trần. FDI China $14.8B VN (HPG+). POW 1,600ty LNG one-time.
- FPT: E3 CACHE HIT cycle 22. KD: Quẻ 54 BAT LOI — unchanged. ESC-3 DATA-COV-LIM GUARD-HELD (~8d).
- Signals: #6354 FPT fundamental_validation (0.8, critic 0.4).

### Carry-over to c061
- CTG/VCB/D2D/VNM: BLOCKED #2776. ACV: newly filed 2026-06-16 — monitor DB population.
- KD BAT LOI caution vs strong FPT fundamental. HVN/POW/HPG catalysts pending.

## c061 · 2026-06-23T18:10Z
### Analysis Cycle (18:02–18:10 UTC) — mode: mixed
- E2 guard: PASS (18:02 UTC, outside [02:00,08:00)). Slot: bctc-analyst-slot-2. Log ID: 1422. Guard: claimed=true (bctc-slot-2:2026-06-21).
- Mode: mixed. 1 routine (FPT, E3 cache hit cycle 23) + 1 release BLOCKED (ACV Q1-2026 DB trống cycle 1).
- Bug #2776-class: ACV filed 2026-06-16 — Chưa có dữ liệu BCTC. Monitor.
- Regime: NEUTRAL (carry +1.37pp, deposit 5.00% vs Fed 3.63%). Market EY 7.05% CHEAP (+2.05pp). VN-Index 1,869.04 (+11.13) — TĂNG MẠNH.
- MACRO: Gold $4,149.6 BULLISH risk-off >$2,200. Brent $77.02 NEUTRAL. USD/VND 26,128 BEARISH. Investment clock Overheat/CORE_VN. CPI 5.46%.
- Alerts: D2D CRITICAL volume 5.5x avg. GAS HIGH volume 3.2x avg. VPB HIGH volume 3.7x avg. NVL -5.02%. Điện sector giảm đồng loạt (-1.57% TB). BĐS -2.68% TB.
- News: VIC 18,000ty khoản vay không tính vào hạn mức tín dụng (BULLISH). Ngân hàng định giá thấp +18% profit 2026 (BULLISH). Techcombank CEO: VN duy trì tăng trưởng (BULLISH). Brent -6 tuần liên tiếp Mỹ (BEARISH GAS/PLX).
- FPT Q1-2026: E3 CACHE HIT cycle 23. Net profit 2,476.8ty (+19.8% YoY). PE 13.8x vs sector 17.3x (-20%). PB 3.6x. ROE 28.3% (2.7x sector median 10.6%). EY_SPREAD +2.25pp CHEAP. D/E 0.40x. Cash 7,993.6ty. OCF -2,847.8ty seasonal (ocf_ni_ratio=-1.15, financing +2,586ty). M-score=0, F-score=7.
- ESC-1/2/4 PASS. ESC-3 DATA-COV-LIM (quarters_returned=1, guard reclaimed). ESC-5 SKIP-EMPTY.
- KD: Quẻ Khôn (2) TRUNG TÍNH/GIỮ (38%) — CHANGED từ Quẻ 54 BAT LOI (c059-c060). Tích cực hơn.
- Legal: clean. Insider: clean. Foreign flow: -106K cp net 5 phiên (yếu hơn ngành +1K cp net).
- Chain findings: 0 (cycle_id 20260623-1800). Signal #7185 FPT fundamental_validation (0.8, critic 0.4).
- Signal file: docs/signals/bctc_signal_FPT_20260623_routine.json

### Carry-over to c062 (next slot, 2026-06-23 21:00 UTC)
- ACV cycle 2: DB trống. Monitor.
- CTG/VCB/D2D/VNM: nhóm BLOCKED từ #2776 — không tái escalation.
- FPT ESC-3: DATA-COV-LIM, guard reclaimed.
- KD IMPROVED: Quẻ Khôn TRUNG TÍNH vs prior BAT LOI — monitor confirm next cycle.
- VIC catalyst: 18,000ty cash về tài khoản — theo dõi fundamental BĐS recovery.
- NVL -5.02%, BĐS sector -2.68%: theo dõi fundamental D2D/VRE/KBC.
- Điện sector giảm đồng loạt: theo dõi POW LNG one-time revenue Q2 BCTC.
- Gold $4,149.6 (giảm từ $4,365): risk-off hạ nhiệt nhẹ — theo dõi regime shift.
