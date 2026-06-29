# BCTC Analyst — Notebook

**Last updated:** 2026-06-29 18:15 UTC (c062-slot2) | **Sprint:** BCTC-EXTRACT-QUALITY

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

## c061 · 2026-06-23T18:10Z
### Analysis Cycle (18:02–18:10 UTC) — mode: mixed
- E2 guard: PASS (18:02 UTC, outside [02:00,08:00)). Slot: bctc-analyst-slot-2. Log ID: 1422. Guard: claimed=true (bctc-slot-2:2026-06-21).
- Mode: mixed. 1 routine (FPT, E3 cache hit cycle 23) + 1 release BLOCKED (ACV Q1-2026 DB trống cycle 1).
- Bug #2776-class: ACV filed 2026-06-16 — Chưa có dữ liệu BCTC. Monitor.
- Regime: NEUTRAL (carry +1.37pp, deposit 5.00% vs Fed 3.63%). Market EY 7.05% CHEAP (+2.05pp). VN-Index 1,869.04 (+11.13) — TĂNG MẠNH.
- MACRO: Gold $4,149.6 BULLISH risk-off >$2,200. Brent $77.02 NEUTRAL. USD/VND 26,128 BEARISH. Investment clock Overheat/CORE_VN. CPI 5.46%.
- FPT Q1-2026: E3 CACHE HIT cycle 23. Net profit 2,476.8ty (+19.8% YoY). PE 13.8x vs sector 17.3x (-20%). M-score=0, F-score=7. KD: Quẻ Khôn TRUNG TÍNH GIỮ (38%).
- Signal #7185 FPT fundamental_validation (0.8, critic 0.4).

## c062 · 2026-06-29T18:15Z
### Analysis Cycle (18:00–18:15 UTC) — mode: mixed
- E2 guard: PASS (18:00 UTC, outside [02:00,08:00)). Slot: bctc-analyst-slot-2. Log ID: 1503. Guard: claimed=true.
- Mode: mixed. 1 routine (FPT, E3 cache hit cycle 24) + 1 release (VCB Q1-2026 FIRST PROCESS). 4 BLOCKED (CTG #2776 corrupt, D2D/VNM/ACV DB trống).
- CTG: Bug #2776 — validation failed 100% imbalance (Assets=0). Confidence 56%. No re-escalation.
- D2D/VNM: Chưa có dữ liệu BCTC — DB trống. ACV cycle 3: DB trống. Filed 2026-06-16.
- Regime: NEUTRAL (+1.37pp carry). EY 7.05% CHEAP (+2.05pp). VN-Index 1,854.97 (-16.94 — BĐS sell-off).
- MACRO: Gold $4,039.6 BULLISH. Brent $73.86 NEUTRAL. USD/VND 26,121 BEARISH. Clock Overheat CPI 5.46%.
- Alerts: BĐS đồng loạt HIGH: VIC -4.74% VHM -3.65% VRE -2.67% (-3.69% TB). ACB smart money accum +376K cp 3d HIGH. BID exit -146K cp 3d. HVN: Long Thành Dec 2026 + lãi 7,600ty MEDIUM. KBC tự doanh bán 300ty.
- JSH CRITICAL legal: Chủ tịch Nguyễn Chơn Hùng bị bắt — governance risk elevated.
- VCB Q1-2026 RELEASE: Net profit 9,462.1ty (+9.6% QoQ; YoY N/A PUB-7). PE 14.1x (+57% vs sector 9.0x). EY_spread +2.09pp FAIR. OCF/NI 1.37. ESC-2 PASS (0.37%). ESC-3 DATA-COV-LIM. ESC-5 SKIP-EMPTY. KD Quẻ 20 Quan TRUNG TÍNH GIỮ (38%). Verdict: in-line.
- FPT Q1-2026: E3 CACHE HIT cycle 24. Net profit 2,476.8ty (+19.8% YoY). PE 13.8x (-20% sector). ROE 28.3%. M=0 F=7. KD Quẻ 2 Khôn TRUNG TÍNH GIỮ (38%) — unchanged from c061.
- Signals: #7942 VCB fundamental_validation (0.75, critic 0.8) + #7943 FPT fundamental_validation (0.8, critic 0.8).
- Files: bctc_signal_VCB_20260629_release.json + bctc_signal_FPT_20260629_routine.json.

### Carry-over to c063 (next slot, 2026-06-29 21:00 UTC)
- CTG: #2776 Assets=0 corrupt — no re-escalation.
- D2D/VNM/ACV: DB trống — monitor population.
- VCB: Q1-2026 processed in-line. YoY Q1-2025 missing — monitor DB.
- JSH: Chủ tịch bị bắt — monitor governance developments.
- BĐS sell-off: VIC/VHM/VRE/D2D/KBC — fundamental BCTC context pending (D2D still blocked).
- ACB smart accumulation +376K cp — watch fundamental confirmation.
- GAS/PVD: MBS dự báo Q2 lợi nhuận +380% — watch Q2 BCTC filing.
