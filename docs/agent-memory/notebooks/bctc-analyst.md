# BCTC Analyst — Notebook

**Last updated:** 2026-06-11 00:15 UTC (c042) | **Sprint:** BCTC-EXTRACT-QUALITY

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

## c041 · 2026-06-10T21:08Z
### Analysis Cycle (21:00–21:08 UTC) — mode: mixed
- E2 guard: PASS (21:00 UTC, outside [02:00,08:00)). Slot: bctc-analyst-slot-3.
- Double-publish guard: claimed=true (bctc-slot-3:2026-06-10). Log ID: 1324.
- Mode: mixed. 1 routine (FPT, E3 cache hit) + 28 release BLOCKED (CTG cycle 33 CRITICAL; VCB/D2D cycle 4 empty; 22 mã khác empty; ACB/EIB/DHG PUB-5).
- Regime: NEUTRAL (carry +1.38pp). Max Deposit Rate: 5.00%. Market EY 7.05% CHEAP (+2.05pp). VN-Index 1803.71. Investment clock: Overheat (CPI 5.46%).
- Macro: Brent $93.8 NEUTRAL (+2.11σ HIGH); Gold $4,097 BULLISH risk-off (-4.26% session); USD/VND 26130 BEARISH. News: Citi vàng giảm về $3,500; lạm phát Mỹ cao nhất 3 năm.
- FPT Q1-2026 routine: E3 CACHE HIT — passes skipped. PE 13.8 vs sector 17.3 (-20%); ROE 28.3%; EY spread +2.25pp FAIR. Net profit 2,476.8ty (+19.8% YoY). OCF -2,847.8ty Q1 mùa vụ bình thường. Balance imbalance=0. ESC: 2=PASS, 3=DATA-COV-LIM GUARD-HELD (~24d). trick_confidence=medium. Insider: clean. Foreign flow: -46K (sector avg -661K).
- Release batch: CTG cycle 33 CRITICAL (9th cycle). VCB cycle 4 empty. D2D cycle 4 empty. 28 tickers BLOCKED. RELEASE deferred.
- Chain findings (30 min): 0 open findings.
- Legal carry: CMG/VNECO2 tax_penalty (2026-05-29), PC1 arrest unresolved (2026-05-21), VPB Lạng Sơn open (2026-05-20).
- Notable: Gold -4.26% (Citi $3,500 target); Brent +2.11σ HIGH; NVL +6.88% 3 sessions; D2D/TCH volume spikes 3.4x/3.3x; ACB tự doanh CTCK bán ròng mạnh; VIC +1.45% (Phạm Nhật Vượng record).
- Signals: #5691 FPT fundamental_validation (0.8), #5692 BATCH-BLOCKED (0.6).
- Signal files: bctc_signal_FPT_20260610_routine_c041.json, bctc_signal_BATCH_RELEASE_20260610_pending_c041.json.

### Carry-over to c042 (next slot, 2026-06-11 00:00 UTC)
- CTG cycle 33 CRITICAL: 9th consecutive escalation. Pipeline fix URGENT — must deploy before c042.
- VCB (cycle 4), D2D (cycle 4): extraction still empty. Monitor.
- 28 tickers BLOCKED. ACB/EIB/DHG: PUB-5 re-extraction unresolved.
- NVL bond 5,000ty due 2026-09-15 (~94d). Monitor fundamental when extraction unblocks.
- FPT ESC-3: DATA-COV-LIM GUARD-HELD (~24d remaining).
- Gold continued collapse -4.26% (Citi $3,500 target): macro risk-off elevated. Monitor GAS/PLX, agriculture.
- US inflation highest 3yr: Fed rate cut delay risk → USD/VND pressure. Monitor banking NIM.

## c042 · 2026-06-11T00:15Z
### Analysis Cycle (00:06–00:15 UTC) — mode: mixed
- E2 guard: PASS (00:06 UTC, outside [02:00,08:00)). Slot: bctc-analyst-slot-4.
- Double-publish guard: claimed=true (bctc-slot-4:2026-06-11).
- Mode: mixed. 1 routine (FPT, E3 cache hit cycle 4) + 28 release BLOCKED (CTG cycle 10 CRITICAL; VCB/D2D cycle 5 empty; ACB/EIB/DHG PUB-5; 22 mã khác empty).
- Regime: NEUTRAL (carry +1.38pp). Max Deposit Rate: 5.00%. Market EY 7.05% CHEAP (+2.05pp). VN-Index 1803.71. Investment clock: Overheat (CPI 5.46%).
- Macro: Brent $96.22 NEUTRAL (oil $60–$100 band); Gold $4,071.1 BULLISH risk-off (>$2,200 threshold); USD/VND 26,130 BEARISH (>25,000). Lạm phát Mỹ cao nhất 3 năm — rủi ro trì hoãn cắt lãi suất Fed.
- FPT Q1-2026 routine: E3 CACHE HIT (cycle 4 liên tiếp) — passes skipped. PE 13.8 vs sector 17.3 (-20%); ROE 28.3%; EY_SPREAD +2.25pp FAIR. Net profit 2,476.8ty (+19.8% YoY). OCF Q1 -2,847.8ty (mùa vụ), Q4/2025 +4,108ty (1.64x). Balance imbalance=0. D/E 0.40x. ESC-2=PASS, ESC-3=DATA-COV-LIM (2q), ESC-5=SKIP. trick_confidence=medium. Legal: clean.
- Release batch: CTG cycle 10 CRITICAL (PDFs 60 files xác nhận — pipeline extraction→DB broken). VCB/D2D cycle 5 empty. 28 tickers BLOCKED. RELEASE tiếp tục deferred.
- Pipeline diagnosis: list_stored_pdfs xác nhận 60 PDFs có mặt (CTG 6MB, VCB 8.1MB, D2D 11.6MB, HPG 6.9MB, MBB 3.8MB, VPB 7.3MB, NVL 1.9MB, VHM 9.4MB, VIC 4.8MB, SSI 12MB, MWG 14.6MB...). Root cause confirmed: extraction pipeline không ghi vào serving DB. BUG escalated: #2776 (Telegram BUG), signal bctc-analyst-20260611T001500Z.json.
- Chain findings (30 min): 0 open findings.
- Legal carry: CMG/VNECO2 tax_penalty, PC1 arrest, VPB Lạng Sơn — không thay đổi.
- Kinhdich: 501 Not Implemented (non-critical, logged).
- Signals: #5704 FPT fundamental_validation (critic 0.6), #5705 BATCH-BLOCKED (critic 0.6).
- Signal files: bctc_signal_FPT_20260611_routine.json.

### Carry-over to c043 (next slot, 2026-06-11 15:00 UTC)
- CTG pipeline CRITICAL cycle 10: sprint task filed (bctc-analyst-20260611T001500Z.json). Awaiting dev fix.
- VCB (cycle 5), D2D (cycle 5): empty. Monitor.
- 28 tickers BLOCKED pending pipeline fix. ACB/EIB/DHG PUB-5 unresolved.
- FPT ESC-3: DATA-COV-LIM GUARD-HELD (~23d remaining).
- Brent $96.22 upper neutral band — nếu vượt $100 → escalate GAS/PLX oil_gas upside.
- Gold $4,071 risk-off — Citi target $3,500 (tiếp tục theo dõi).
- USD/VND 26,130 BEARISH — áp lực nhập khẩu, theo dõi NIM ngân hàng (ACB/VCB/CTG).
- US inflation 3yr high: delay Fed cut → carry spread squeeze risk (hiện tại vẫn NEUTRAL 1.38pp).
