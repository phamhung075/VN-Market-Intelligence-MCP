# BCTC Analyst — Notebook

**Last updated:** 2026-06-10 18:12 UTC (c040) | **Sprint:** BCTC-EXTRACT-QUALITY

## c038 · 2026-06-09T21:10Z
### Analysis Cycle (21:00–21:10 UTC) — mode: mixed
- E2 guard: PASS (21:00 UTC, outside [02:00,08:00)). Slot: bctc-analyst-slot-3.
- Double-publish guard: claimed=true (bctc-slot-3:2026-06-09). Log ID: 1309.
- Mode: mixed. 1 routine (FPT, E3 cache hit) + 28 release BLOCKED (CTG cycle 30+; VCB filed 2026-06-09 empty; D2D filed 2026-06-09 empty; MBB/HPG/VHM/VPB/VRE/KBC/NVL/TCH/REE/HVN/MWG/SSI/HCM/DPM/GVR/NKG/POW/VCI/VIC/PPC/PLX/HSG empty; ACB 38%/EIB 31%/DHG 44% PUB-5).
- Regime: NEUTRAL (carry +1.38pp). Max Deposit Rate: 5.00%. Market EY 8.20% CHEAP (+3.20pp). VN-Index 1793.05 (UP +2.52). Investment clock: Overheat (CPI 5.46%).
- Macro: Brent $91.96 NEUTRAL; Gold $4,285.6 BULLISH (risk-off); USD/VND 26128 BEARISH.
- FPT Q1-2026 routine: E3 CACHE HIT — passes skipped. PE 13.8 vs sector 17.3 (-20%); ROE 28.3%; EY spread +2.25pp FAIR. Net profit 2,476.8ty (19.8%). OCF -2,847.8ty seasonal Q1. Balance imbalance=0. ESC: 2=PASS, 3=DATA-COV-LIM GUARD-HELD (~27d). trick_confidence=medium. F-score=5/9. Insider: clean.
- Release batch: CTG cycle 30+ CRITICAL (6th consecutive escalation, filed 2026-06-09). VCB filed 2026-06-09 (1st cycle empty). D2D filed 2026-06-09 (1st cycle empty). 28 tickers total. RELEASE deferred.
- Chain findings (2h): CTG urgent_news #5551 (VietinBank Capital→Petrosetco). NVL chain_catalyst bearish conf=0.75 #5553 (sector selloff -4.33%). POW urgent_news #5552. Macro: Gold -2.18σ, Oil -2.07σ alerts active.
- ACB note: +4.95% session; Nhóm Âu Lạc gom 102M cổ phiếu per cafef; no formal insider disclosure registered.
- Legal carry: CMG/VNECO2 tax_penalty (2026-05-29), PC1 arrest unresolved (2026-05-21), VPB Lạng Sơn open (2026-05-20). NVL bond 5,000ty due 2026-09-15 (~98d).
- Signals: #5560 FPT fundamental_validation (0.8), #5561 BATCH-BLOCKED (0.6).

### Carry-over to c039 (next slot, 2026-06-10 00:00 UTC)
- CTG cycle 30+ CRITICAL: 6th consecutive escalation. Pipeline fix deploy URGENT.
- VCB/D2D: filed 2026-06-09, extraction 1st cycle empty. Monitor next slot.
- 28 tickers BLOCKED. ACB/EIB/DHG: PUB-5 re-extraction unresolved.
- NVL bond 5,000ty due 2026-09-15 (~97d at next slot). VPB Lạng Sơn open.
- FPT ESC-3: DATA-COV-LIM GUARD-HELD (~27d remaining).
- BĐS sector: NVL/VRE/VIC chain bearish signals active. Monitor.

## c039 · 2026-06-10T15:10Z
### Analysis Cycle (15:05–15:10 UTC) — mode: mixed
- E2 guard: PASS (15:05 UTC, outside [02:00,08:00)). Slot: bctc-analyst-slot-1.
- Double-publish guard: claimed=true (bctc-slot-1:2026-06-10). Log ID: 1317.
- Mode: mixed. 1 routine (FPT, E3 cache hit) + 28 release BLOCKED (CTG cycle 31+ CRITICAL; VCB/D2D cycle 2 empty; all others empty or PUB-5).
- Regime: NEUTRAL (carry +1.38pp). Max Deposit Rate: 5.00%. Market EY 7.05% CHEAP (+2.05pp). VN-Index 1803.71 (UP +10.66). Investment clock: Overheat (CPI 5.46%).
- Macro: Brent $92.62 NEUTRAL; Gold $4,191.7 BULLISH (risk-off, -3.09σ MACRO EXTREME alert); USD/VND 26130 BEARISH.
- Alerts 24h: NVL +6.88% price_surge × 3 alerts + news "bất ngờ có biến"; D2D volume_spike 3.4×; TCH volume_spike 3.3×; DHG volume_spike 2.4×; ACB bán ròng CTCK; VIC/GAS/PLX news alerts. Gold EXTREME macro deviation -3.09σ.
- FPT Q1-2026 routine: E3 CACHE HIT — passes skipped. PE 13.8 vs sector 17.3 (-20%); ROE 28.3%; EY spread +2.25pp FAIR. Net profit 2,476.8ty (19.8%). OCF -2,847.8ty seasonal Q1. Balance imbalance=0. ESC: 2=PASS, 3=DATA-COV-LIM GUARD-HELD (~26d). trick_confidence=medium. F-score=5/9. Insider: clean.
- Release batch: CTG cycle 31+ CRITICAL (7th consecutive escalation, filed 2026-06-09). VCB (cycle 2 empty). D2D (cycle 2 empty). 28 tickers BLOCKED. RELEASE deferred.
- Chain findings (30 min): 0 open findings.
- Legal carry: CMG/VNECO2 tax_penalty, PC1 arrest unresolved, VPB Lạng Sơn open. NVL bond 5,000ty due 2026-09-15 (~96d).
- Signals: #5657 FPT fundamental_validation (0.8), #5658 BATCH-BLOCKED (0.6).

### Carry-over to c040 (next slot, 2026-06-10 18:00 UTC)
- CTG cycle 31+ CRITICAL: 7th consecutive escalation. Pipeline fix MUST ship before c040.
- VCB (cycle 2), D2D (cycle 2): extraction still empty. Monitor.
- 28 tickers BLOCKED. ACB/EIB/DHG: PUB-5 re-extraction unresolved.
- NVL bond 5,000ty due 2026-09-15 (~96d). NVL +6.88% session — monitor price + news for fundamental catalyst.
- FPT ESC-3: DATA-COV-LIM GUARD-HELD (~26d remaining).
- Gold -3.09σ EXTREME deviation: macro risk-off signal. Monitor GAS/PLX energy sector.

## c040 · 2026-06-10T18:12Z
### Analysis Cycle (18:06–18:12 UTC) — mode: mixed
- E2 guard: PASS (18:06 UTC, outside [02:00,08:00)). Slot: bctc-analyst-slot-2.
- Double-publish guard: claimed=true (bctc-slot-2:2026-06-10). Log ID: 1322.
- Mode: mixed. 1 routine (FPT, E3 cache hit) + 28 release BLOCKED (CTG cycle 32 CRITICAL; VCB/D2D cycle 3 empty; 25 mã khác empty/PUB-5).
- Regime: NEUTRAL (carry +1.38pp). Max Deposit Rate: 5.00%. Market EY 7.05% CHEAP (+2.05pp). VN-Index 1803.71. Investment clock: Overheat (CPI 5.46%).
- Macro: Brent $94.29 NEUTRAL (+1.87%); Gold $4,134.6 BULLISH (risk-off, -3.38%); USD/VND 26130 BEARISH. Macro alert: Brent +2.11σ (HIGH). PLX news: dầu neo cao → hoàn nhập dự phòng tồn kho.
- FPT Q1-2026 routine: E3 CACHE HIT — passes skipped. PE 13.8 vs sector 17.3 (-20%); ROE 28.3%; EY spread +2.25pp FAIR. Net profit 2,476.8ty (19.8%). OCF -2,847.8ty Q1 mùa vụ bình thường (Q4 +4,108ty ratio 1.64). Balance imbalance=0. ESC: 2=PASS, 3=DATA-COV-LIM GUARD-HELD (~25d). trick_confidence=medium. F-score=5/9. Insider: clean.
- Release batch: CTG cycle 32 CRITICAL (8th cycle, filed 2026-06-10). VCB filed 2026-06-10 (cycle 3 empty). D2D filed 2026-06-10 (cycle 3 empty). 28 tickers BLOCKED. RELEASE deferred.
- Chain findings (30 min): 2 ops signals (unknown stock, no ticker relevance). Kinhdich + search_similar: VPS connectivity unavailable — non-critical, logged.
- Legal carry: CMG/VNECO2 tax_penalty, PC1 arrest unresolved, VPB Lạng Sơn open. NVL bond 5,000ty due 2026-09-15 (~95d).
- Notable: NVL +6.88% (3 consecutive alerts); Brent +2.11σ macro deviation; Gold -3.38% continued decline; ACB insider accumulation (Nhóm Âu Lạc 102M cp + ACBS vốn tăng 2,000ty).
- Signals: #5673 FPT fundamental_validation (0.8), #5674 BATCH-BLOCKED (0.6).
- Signal files: bctc_signal_FPT_20260610_routine.json (c040), bctc_signal_BATCH_RELEASE_20260610_pending.json (28 tickers).

### Carry-over to c041 (next slot, 2026-06-10 21:00 UTC)
- CTG cycle 32 CRITICAL: 8th consecutive escalation. Pipeline fix MUST deploy before c041.
- VCB (cycle 3), D2D (cycle 3): extraction still empty. Monitor.
- 28 tickers BLOCKED. ACB/EIB/DHG: PUB-5 re-extraction unresolved.
- NVL bond 5,000ty due 2026-09-15 (~95d). NVL +6.88% — monitor fundamental when extraction unblocks.
- FPT ESC-3: DATA-COV-LIM GUARD-HELD (~25d remaining).
- Brent +2.11σ HIGH deviation: GAS/PLX energy upside risk monitor.
- ACB: Nhóm Âu Lạc accumulation + ACBS capital injection — watch for formal insider disclosure.
