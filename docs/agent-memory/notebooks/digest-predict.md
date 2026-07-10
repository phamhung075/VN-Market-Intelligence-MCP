# Digest Predict — Notebook

**Last updated:** 2026-07-04 17:52 UTC | **Sprint:** FEAT-PREDICTION-CLAIMS-DAILY-CADENCE

## Known patterns / preferences

- Kinh Dịch backtest 501 từ >=2026-05-25 — cần dev-team B-bucket wiring (carry-over 15+ chu kỳ)
- FPT vị thế lỗ dai dẳng — 5.000cp @ 80.300, giá hiện 72.300 (lỗ ~10,0%)
- cascade rules 0 evaluated — win-rate pipeline không hoạt động, cần kiểm tra
- VPB rủi ro kiểm toán cho vay Lạng Sơn chưa giải quyết; tín hiệu bullish liên tục 2 chu kỳ (Forbes Global 2000) — claim id=16 tạo 07-03
- Calibration Brier 0,2135 degrading (computed 06-28) — chưa cập nhật FP mới (FPT/VPB 07-01, POW đến hạn 07-03) — cần dev-team recompute
- FR-3 fix 2026-07-01 (TASK-EVIDENCE-HOP2-AGENTS): validate_prediction_claims KHÔNG phải hard gate — claims phải tạo dù xác suất hiệu chỉnh thấp/<50%, không "LOẠI"
- BCTC ngân hàng Q1/2026 (CTG/VIC/MBB) lỗi OCR/vi phạm đẳng thức kế toán — dev-team đang xử lý FIX-BCTC-BANK-SUMMARY-MAPPING
- get_macro_snapshot đổi schema JSON (quan sát 07-03) — không còn dòng text "Global Liquidity: X"; regime-extraction phải fallback về NEUTRAL — cần kiểm tra/cập nhật skill

## Cycle — 15:05 UTC (catch-up one-off)

- **cycle_date**: 2026-06-24
- **slot**: monday-prediction-synthesis (catch-up manual, prediction_claims stale since 2026-06-14)
- **regime**: NEUTRAL — VN-Index 1878.02 (+0.48%), Gold $4028.20 (risk-off but down -$99.50), Oil $73.46 NEUTRAL, USD/VND 26131 BEARISH, carry 1.37pp NEUTRAL, equity EY 7.05% (+2.05pp vs deposit) CHEAP. Investment clock score 8/10 CORE_VN. DAMPENING_ACTIVE=false.
- **calibration**: Brier 0.1379 stable. 75% bucket under-confident (actual hit 100%). Proceed normally.
- **market_hexagram**: Quẻ 36 Minh Di — BẤT LỢI, tín hiệu TIÊU CỰC, độ tin cậy 64%. Độ rộng: 109 tăng/174 giảm, thanh khoản 18.167 tỷ (-41.4% vs hôm qua).
- **screened**: FPT, VHM, NVL, MWG, HPG, VIC, ACB, VCB, BID, GAS, VRE, DPM, VPB, SSI, DHG (15 tickers)
- **qualified** (bearish_score > 0.6, score_date 2026-06-23 fresh):
  - FPT: bearish_score=0.75, 2 fragments ngoại tổ chức, sentiment 6/15 bearish slope -0.01, ROE 6.2%, quẻ Khôn (2) TRUNG TÍNH (không mâu thuẫn)
  - VPB: bearish_score=0.75, 3 fragments (mạnh nhất watchlist), quẻ Truân (3) BẤT LỢI (hội tụ), rủi ro kiểm toán Lạng Sơn
  - VCB: bearish_score=0.75, 2 fragments — ĐÃ LOẠI TRỪ do quẻ Phục (24) THUẬN LỢI 100% mâu thuẫn + sentiment 3 bullish/0 bearish
- **disqualified_stale** (score_date trước 2026-06-01): VIC (2026-05-27), BID (2026-05-18), GAS (2026-05-27), ACB (2026-05-06)
- **claims_created**: 2
  - id=10: FPT GIẢM p=0.75 horizon=5d resolution=2026-07-01 | giá ref: 70.800 VNĐ
  - id=11: VPB GIẢM p=0.75 horizon=5d resolution=2026-07-01 | giá ref: 26.550 VNĐ
- **actions**:
  - create_prediction_claim FPT bearish id=10 ✓
  - create_prediction_claim VPB bearish id=11 ✓
  - log_agent_work id=1438 completed ✓
  - send_telegram WORK ✓
  - Notebook write ✓
- **next_cycle_hint**: Kiểm tra resolution FPT/VPB vào 2026-07-01. FPT vị thế người dùng 5.000cp @ 80.300 — giá hiện 70.800 (lỗ 11.8%) — cân nhắc điều kiện cắt lỗ nếu tiếp tục giảm. VPB kiểm toán Lạng Sơn cần theo dõi.
- **carry_over**: kinh-dich backtest 501 (5th cycle); cascade rules 0 evaluated; FPT vị thế lỗ; VPB audit risk
- **estimated_tokens**: 6000

### Daily Predictions (17:38 UTC) 2026-07-01

- **slot**: digest-daily (cron 30 17 * * * — H2 ngày đầu tiên)
- **dedup_gate**: PASS — task claimed: published:digest-daily:2026-07-01 (claimed=true, TTL 86400s)
- **regime**: NEUTRAL — VN-Index 1.867,21 (+7,2pts H2 debut), BRENT $71,37 (-2,70% NEUTRAL), GOLD $4.087 (+1,53% BULLISH risk-off), USD/VND 26.106 BEARISH, carry 1,37pp NEUTRAL, EY 7,05% CHEAP, inv-clock 8/10 CORE_VN. DAMPENING_ACTIVE=true (Brier 0,2135 +0,076 degrading, ×0,90).
- **calibration**: Brier 0,2135 degrading (+0,076) | 65% bucket over-confident | DAMPENING_ACTIVE=true
- **resolution_today**: id=10 FPT bearish p=0,75 → giá 72.900 (+3,85% vs ref 70.800) → **FALSE POSITIVE** | id=11 VPB bearish p=0,75 → giá 27.700 (+2,59% vs ref 26.550) → **FALSE POSITIVE**
- **chain_catalyst**: FII đảo chiều mua ròng đầu tháng 7 (impact=7, conf=75) | Gold surge safe-haven (impact=8) | Oil supply easing -2,70% (impact=7)
- **vol_regime**: NORMAL rv_20d=14,39% (31st pct) | ADL today +60 (vs -10 hôm qua) | breadth HISTORY_INSUFFICIENT (2 phiên)
- **screened_fresh** (score_date=2026-07-01 FRESH): FPT bearish=0,6268 (TRUSTED LR=0,50 n=18), CTG bearish=0,75 (TRUSTED LR=0,50 n=18), VPB bearish=0,75 (TRUSTED LR=0,50 n=18), BID bearish=0,238 (<0,6), SSI bearish=0,387 (<0,6), MWG bullish=0,158 (<0,6)
- **decisions** (đã bị FR-3 sửa 2026-07-01 sau chu kỳ này — xem Known patterns): FPT/CTG/VPB bị LOẠI theo tiêu chí final_p<50% — TIÊU CHÍ NÀY KHÔNG CÒN ÁP DỤNG từ 07-02 trở đi
- **claims_created**: 0 — NO-OP (dùng tiêu chí final_p<50%, đã được sửa bởi FR-3 ngay sau chu kỳ này)
- **actions**:
  - dedup gate task_claim ✓ (claimed=true, key=published:digest-daily:2026-07-01)
  - log_agent_work id=1536 completed ✓
  - send_telegram WORK ✓ (NO-OP notice với resolution report FP)
  - notebook write ✓
- **carry_over**: POW resolution 2026-07-03 (giá 14.600 < target 15.000 — cần theo dõi); Brier degrading (2 FP mới — sẽ cập nhật khi calibration report recompute); FPT portfolio lỗ user (5.000cp @ 80.300, giá 72.900, lỗ ~9,2%); FR-3 fix TASK-EVIDENCE-HOP2-AGENTS áp dụng ngay sau chu kỳ này
- **estimated_tokens**: 5500

### Daily Predictions (17:45 UTC) 2026-07-02

- **slot**: digest-daily (cron 30 17 * * *)
- **dedup_gate**: PASS — task claimed: published:digest-daily:2026-07-02 (claimed=true, TTL 86400s)
- **regime**: NEUTRAL — VN-Index 1.866,35 (-0,86pts flat), BRENT $71,17 (-0,03% NEUTRAL), GOLD $4.136,2 (+2,09% BULLISH safe-haven), USD/VND 26.105 BEARISH, carry 1,37pp NEUTRAL, EY 7,05% CHEAP, inv-clock 8/10 CORE_VN. Vol regime NORMAL rv_20d=14,18% (30th pct). Breadth HISTORY_INSUFFICIENT (3 phiên), ADL +15.
- **calibration**: Brier 0,2135 degrading (computed 06-28, chưa cập nhật 2 FP 07-01) | 65% bucket over-confident | DAMPENING_ACTIVE=true
- **fix_applied**: FR-3 (TASK-EVIDENCE-HOP2-AGENTS, 2026-07-01) — validate_prediction_claims KHÔNG phải hard gate. Claims được tạo dù xác suất hiệu chỉnh <50% (bỏ tiêu chí "final_p<50% → LOẠI" đã dùng sai 12 chu kỳ trước).
- **market_hexagram**: Quẻ 36 Minh Di BẤT LỢI 64% (TIÊU CỰC). Breadth 117T/162G/77 đứng, trần 5/sàn 2. Thanh khoản 17.238 tỷ (+0,3%).
- **context**: Ngân hàng bán tháo đồng loạt (ACB/MBB/VPB nhóm, TB -1,15%) — FII bán ròng. 'Họ' Vin bứt phá quý II (VIC +1,47%, VHM +1,14%) khối ngoại gom. HCM +3,2% volume spike 2,5x. BCTC CTG/MBB/VIC Q1/2026 lỗi OCR (corrupt/vi phạm đẳng thức) — không dùng xác nhận cơ bản.
- **screened_fresh** (score_date=2026-07-02): CTG bearish=0,75 (TRUSTED LR=0,52 n=18), MBB bearish=0,75 (TRUSTED LR=0,52 n=18), VIC bullish=0,6728 (TRUSTED LR=0,16 n=16), VPB bullish=0,64 (TRUSTED LR=0,16 n=16, tin Forbes Global 2000), FPT bull=0,51/bear=0,58 (<0,6 cả hai), ACB bullish=0,5663 (<0,6)
- **decisions**:
  - CTG bearish=0,75: quẻ Kiến (39) BẤT LỢI 25% xác nhận + FII outflow + banking selloff → ĐỦ ĐIỀU KIỆN, final_p=0,75×0,52×0,90=0,35
  - MBB bearish=0,75: cùng cấu trúc bằng chứng CTG, quẻ Kiến (39) xác nhận → ĐỦ ĐIỀU KIỆN, final_p=0,35
  - VIC bullish=0,6728: giá +1,47% xác nhận hôm nay, nhưng LR sentiment thấp (0,16) + quẻ Vị Tế (64) khuyến nghị BÁN 38% → ĐỦ ĐIỀU KIỆN (top-3 by delta), final_p=0,6728×0,16×0,90=0,097
  - VPB bullish=0,64: delta 0,64 < VIC 0,6728 → loại do cap=3 (4th ranked)
- **claims_created**: 3
  - id=13: CTG GIẢM p=0,35 horizon=5d resolution=2026-07-09 | giá ref: 34.250 VNĐ, target <33.000
  - id=14: MBB GIẢM p=0,35 horizon=5d resolution=2026-07-09 | giá ref: 25.650 VNĐ, target <24.800
  - id=15: VIC TĂNG p=0,10 horizon=5d resolution=2026-07-09 | giá ref: 220.300 VNĐ, target >225.000
- **actions**:
  - dedup gate task_claim ✓ (claimed=true, key=published:digest-daily:2026-07-02)
  - log_agent_work id=1547 completed ✓
  - create_prediction_claim CTG id=13 ✓, MBB id=14 ✓, VIC id=15 ✓
  - send_telegram WORK ✓
  - notebook write ✓ (pruned ### sub-blocks 06-21/06-24/06-25/06-26 per AC-2b cap=4)
  - git commit SKIPPED — no Bash tool available in this session
- **carry_over**: POW id=12 resolution 2026-07-03; CTG/MBB/VIC id=13/14/15 resolution 2026-07-09; BCTC bank OCR corrupt — dev-team FIX-BCTC-BANK-SUMMARY-MAPPING đang xử lý; calibration report chưa cập nhật resolution 07-01
- **estimated_tokens**: 20000

### Daily Predictions (17:37 UTC) 2026-07-03

- **slot**: digest-daily (cron 30 17 * * *)
- **dedup_gate**: PASS — task claimed: published:digest-daily:2026-07-03 (claimed=true, TTL 86400s)
- **regime**: NEUTRAL (fallback — get_macro_snapshot đổi schema JSON, không còn dòng text "Global Liquidity: X"; investment-clock 8/10 CORE_VN, Gold BULLISH $4.187,3 +1,21%, USD/VND BEARISH 26.103, carry NEUTRAL 1,37pp, EY CHEAP 7,05%). Vol regime NORMAL rv_20d=14,13% (30th pct). Breadth HISTORY_INSUFFICIENT (4 phiên), ADL -80 (đảo chiều từ +15 hôm qua).
- **calibration**: Brier 0,2135 degrading (computed 06-28, +0,076) | 65% bucket over-confident | DAMPENING_ACTIVE=true
- **market_hexagram**: Quẻ 15 Khiêm THUẬN LỢI (tín hiệu TIÊU CỰC 64%). Breadth 104T/199G/57 đứng, trần 3/sàn 3. Thanh khoản 15.657 tỷ (-9,2%).
- **context**: HVN volume spike 3,6x (+6,53%) — margin cut HoSE 59 mã Q3 (bao gồm HVN/DGC/BCG). EIB tự doanh gom mạnh 300 tỷ trong khi khối ngoại xả ròng 789 tỷ toàn thị trường. GAS/PLX/REE giảm (dầu khí/điện chịu áp lực bán).
- **screened_fresh** (score_date=2026-07-03, 18 mã kiểm tra): CTG bearish=0,75 (TRUSTED LR=0,52 n=18), MBB bearish=0,75 (TRUSTED LR=0,52 n=18), VIC bullish=0,698 (TRUSTED LR=0,16 n=16), VPB bullish=0,64 (TRUSTED LR=0,16 n=16) — 4 mã >0,6; còn lại (FPT bull=0,552/bear=0,58, HCM bull=0,56, SSI bull=0,56, ACB bull=0,4891, GAS bear=0,448, HVN bull=0,525) đều <0,6
- **decisions**:
  - CTG bearish=0,75: TRÙNG claim id=13 đang hoạt động (cùng mã, cùng hướng, cùng bằng chứng foreign_flow_institutional, resolution 07-09 chưa tới) → LOẠI (không độc lập)
  - MBB bearish=0,75: TRÙNG claim id=14 đang hoạt động, cùng cấu trúc → LOẠI (không độc lập)
  - VIC bullish=0,698: TRÙNG claim id=15 đang hoạt động (bullish, resolution 07-09) → LOẠI (không độc lập)
  - VPB bullish=0,64: KHÔNG có claim đang hoạt động (id=11 VPB bearish đã resolved FALSE POSITIVE 07-01) → ĐỦ ĐIỀU KIỆN — quẻ Giải (40) THUẬN LỢI, tín hiệu GIỮ, độ tin cậy 100% xác nhận, final_p=0,64×0,16×0,90=0,092
- **claims_created**: 1
  - id=16: VPB TĂNG p=0,09 horizon=5d resolution=2026-07-10 | giá ref: 27.800 VNĐ, target >28.500
- **actions**:
  - dedup gate task_claim ✓ (claimed=true, key=published:digest-daily:2026-07-03)
  - log_agent_work id=1560 completed ✓
  - get_bctc_full(VPB) → "Chưa có dữ liệu BCTC" [SKIP]
  - create_prediction_claim VPB id=16 ✓
  - send_telegram WORK ✓
  - notebook write ✓ (dropped ### sub-block 06-29 per AC-2b cap=4)
  - git commit SKIPPED — no Bash/git tool available in this session (router instructed "do not push" this cycle)
- **carry_over**: POW id=12 resolution HÔM NAY 07-03 (ref 14.800, target >15.000, giá đóng cửa gần nhất 14.900 — CHƯA ĐẠT, verdictResolutionJob sẽ xử lý tự động); CTG/MBB/VIC id=13/14/15 resolution 07-09 vẫn active — áp dụng loại trừ trùng lặp lần đầu cho 3/4 ứng viên cùng lúc; VPB id=16 resolution 07-10; Brier 0,2135 degrading chưa cập nhật FP 07-01 — cần recompute; regime-extraction fallback NEUTRAL do get_macro_snapshot schema drift — theo dõi chu kỳ tới có tái diễn không
- **estimated_tokens**: 11000

### Daily Predictions (17:52 UTC) 2026-07-04

- **slot**: digest-daily (cron 30 17 * * * — thứ Bảy, VN market đóng cửa cuối tuần)
- **dedup_gate**: PASS — task claimed: published:digest-daily:2026-07-04 (claimed=true, TTL 86400s)
- **regime**: NEUTRAL (fallback — get_macro_snapshot vẫn schema JSON, không có REGIME field). VN-Index 1.862,08 (-0,23%, -4,27đ). Gold BULLISH $4.187,3 (safe-haven, 3 phiên tăng liên tiếp). USD/VND BEARISH 26.103. Carry NEUTRAL 1,37pp. EY CHEAP 8,2% (spread +3,2pp). Investment-clock 8/10 CORE_VN. Vol regime NORMAL rv_20d=14,13% (30th pct). Breadth INSUFFICIENT (4 phiên), ADL -80.
- **calibration**: Brier 0,2135 degrading (+0,076, chưa cập nhật từ 06-28) | 65% bucket over-confident | DAMPENING_ACTIVE=true (×0,90)
- **context**: GDP 6 tháng đầu năm tăng trưởng cao nhất nhiều nhiệm kỳ. Khủng hoảng chip nhớ toàn cầu — giá laptop/RAM/SSD tăng, áp lực CPI tiêu dùng VN (chain_catalyst impact=9, M2/COC headwind, phase=slowdown).
- **screened** (36 mã tradeable, score_date=2026-07-04 fresh trừ ghi chú): CTG bearish=0,75, MBB bearish=0,75, VPB bullish=0,64, VIC bullish=0,7293, HPG bullish=0,6030, POW bullish=0,75 — 6 mã >0,6; DPM/NVL/VRE/REE stale (không tính)
- **decisions**:
  - CTG bearish=0,75 / MBB bearish=0,75 / VIC bullish=0,7293 / VPB bullish=0,64: TRÙNG claim id=13/14/15/16 đang hoạt động (resolution 07-09/07-10 chưa tới) → LOẠI cả 4 (không độc lập)
  - HPG bullish=0,6030: không có claim đang hoạt động — ĐỦ ĐIỀU KIỆN, LR top=0,16 (n=16 TRUSTED), final_p=0,603×0,16×0,90=0,087
  - POW bullish=0,75: claim cũ id=12 hết hạn 07-03 (chưa đạt, không còn active) — ĐỦ ĐIỀU KIỆN, LR top=1,0 (n=4 UNTRUSTED), final_p=0,75×1,0×0,90=0,675. BCTC Q1/2026 CORRUPT (total_assets=0, OCR fail) — không dùng xác nhận cơ bản
- **claims_created**: 2
  - id=17: HPG TĂNG p=0,09 horizon=5d resolution=2026-07-10 | giá ref: 23.250 VNĐ, target >24.000
  - id=18: POW TĂNG p=0,68 horizon=5d resolution=2026-07-10 | giá ref: 14.900 VNĐ, target >15.300
- **actions**:
  - dedup gate task_claim ✓ (claimed=true, key=published:digest-daily:2026-07-04)
  - log_agent_work id=1581 completed ✓
  - get_bctc_full(POW) → CORRUPT [SKIP dùng làm xác nhận]
  - create_prediction_claim HPG id=17 ✓, POW id=18 ✓
  - send_telegram WORK ✓
  - notebook write ✓ (dropped ### sub-block 06-30 per AC-2b cap=4)
  - git commit SKIPPED — no Bash/git tool available in this session (same limitation as 07-01/07-02/07-03 cycles)
- **known_issue**: claim_text id=17/18 viết thiếu dấu tiếng Việt (lỗi thao tác chu kỳ này) — chu kỳ tới đảm bảo full diacritics theo constraint agent
- **carry_over**: HPG id=17 / POW id=18 resolution 07-10; CTG/MBB/VIC/VPB id=13/14/15/16 vẫn active (resolution 07-09/07-10); Brier 0,2135 degrading chưa cập nhật resolution gần đây — cần dev-team recompute; POW BCTC OCR corrupt (total_assets=0) — cần dev-team fix pipeline; FPT vị thế lỗ user vẫn theo dõi (5.000cp @ 80.300)
- **estimated_tokens**: 24000
