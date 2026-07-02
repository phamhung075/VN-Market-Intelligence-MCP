# Digest Predict — Notebook

**Last updated:** 2026-07-02 17:45 UTC | **Sprint:** FEAT-PREDICTION-CLAIMS-DAILY-CADENCE

## Known patterns / preferences

- Kinh Dịch backtest 501 từ >=2026-05-25 — cần dev-team B-bucket wiring (carry-over 15+ chu kỳ)
- FPT vị thế lỗ dai dẳng — 5.000cp @ 80.300, giá hiện 72.500 (lỗ ~9,7%)
- cascade rules 0 evaluated — win-rate pipeline không hoạt động, cần kiểm tra
- VPB rủi ro kiểm toán cho vay Lạng Sơn chưa giải quyết; nay xuất hiện tín hiệu bullish mới (Forbes Global 2000)
- Calibration Brier 0,2135 degrading (computed 06-28) — chưa cập nhật 2 FP mới (FPT id=10/VPB id=11 resolved 07-01)
- FR-3 fix 2026-07-01 (TASK-EVIDENCE-HOP2-AGENTS): validate_prediction_claims KHÔNG phải hard gate — claims phải tạo dù xác suất hiệu chỉnh thấp/<50%, không "LOẠI" như 12 chu kỳ liên tiếp trước đó
- BCTC ngân hàng Q1/2026 (CTG/VIC/MBB) lỗi OCR/vi phạm đẳng thức kế toán — dev-team đang xử lý FIX-BCTC-BANK-SUMMARY-MAPPING

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

### Daily Predictions (17:37 UTC) 2026-06-29

- **slot**: digest-daily (cron 30 17 * * *)
- **dedup_gate**: PASS — task claimed: published:digest-daily:2026-06-29 (claimed=true, TTL 100800s)
- **regime**: NEUTRAL — VN-Index 1.854,97 (-0,90%), BRENT $73,86 (+0,98%), GOLD $4.039,6 (-0,75%), USD/VND 26.121, carry NEUTRAL. DAMPENING_ACTIVE=true (calibration degrading Brier +0,076).
- **calibration**: Brier 0,2135 degrading (+0,076 vs tuần trước) | 65% bucket over-confident (50% actual) | DAMPENING_ACTIVE=true
- **market_hexagram**: Quẻ 15 Khiêm THUẬN LỢI (signal TIÊU CỰC 64%) + snapshot Quẻ 19 Lâm THUẬN LỢI 100%. Breadth: 187T/132G TÍCH CỰC. Thanh khoản 17.396 tỷ (+8,0%).
- **context**: Ngày phân hóa — BĐS bị bán mạnh (VIC -4,74%, VHM -3,65%, VRE -2,67%) nhưng độ rộng tích cực. FII chain_catalyst: dịch chuyển từ ngân hàng/BĐS sang bluechips phi tài chính (impact=10, confidence=81).
- **screened_fresh** (score_date=2026-06-29): VHM bearish=0,62, CTG bearish=0,75, VPB bearish=0,75, ACB bullish=0,56 (<0,6), MWG bullish=0,16 (<0,6), BID bearish=0,22 (<0,6)
- **screened_stale**: VIC bullish=0,77 (33d), GAS bullish=0,76 (33d), GVR bullish=0,76 (33d)
- **decisions**:
  - VHM bearish=0,62: quẻ 63 Ký Tế THUẬN LỢI 63% mâu thuẫn bearish → LOẠI
  - CTG bearish=0,75: quẻ 23 Bắc BẤT LỢI 25% hỗ trợ, nhưng cùng luận điểm FII banking với VPB id=11 đang hoạt động → LOẠI (không độc lập)
  - VPB bearish=0,75: trùng claim id=11 đang hoạt động → LOẠI
- **claims_created**: 0 — honest NO-OP (qualify_count=0)
- **actions**:
  - dedup gate task_claim ✓ (claimed=true, key=published:digest-daily:2026-06-29)
  - log_agent_work id=1501 completed ✓
  - send_telegram WORK ✓ (NO-OP notice với phân tích rotation đầy đủ)
  - notebook write ✓
- **carry_over**: FPT/VPB resolution 2026-07-01 (NGÀY MAI); POW resolution 2026-07-03; evidence UNTRUSTED systemic (LR=1.0 n=0 — 11th cycle); Brier 0,2135 degrading (tăng mạnh từ 0,1379) — cần dev-team calibration pipeline fix; backtest 501 gap (11th cycle)
- **estimated_tokens**: 4500

### Daily Predictions (17:37 UTC) 2026-06-30

- **slot**: digest-daily (cron 30 17 * * * — H1 cuối kỳ)
- **dedup_gate**: PASS — task claimed: published:digest-daily:2026-06-30 (claimed=true, TTL 86400s)
- **regime**: NEUTRAL — VN-Index 1.860,01 (+5,04pts), BRENT $73,62 NEUTRAL, GOLD $4.044,3 BULLISH (safe-haven), USD/VND 26.106 BEARISH, carry 1,37pp NEUTRAL, EY 7,05% CHEAP, inv-clock 8/10 CORE_VN. Volatility NORMAL rv_20d=14,4% (71st pct). DAMPENING_ACTIVE=true (Brier 0,2135 +0,076 degrading, ×0,90).
- **calibration**: Brier 0,2135 degrading (+0,076) | 65% bucket over-confident (50% actual) | DAMPENING_ACTIVE=true
- **market_hexagram**: Quẻ 36 Minh Di BẤT LỢI 64% (TIÊU CỰC — ánh sáng bị thương, cần ẩn nhẫn)
- **context**: Ngày cuối H1 2026. VN-Index +4% nửa đầu năm. GDP H2 dự báo +11,9% (lợi cho BID/CTG/VCB). VNM CRITICAL volume spike 6,3× (-2,32%). chain_catalyst: commodity inflation risk H2 (impact=7, COC:headwind, M2:headwind, phase=slowdown).
- **screened** (score_date=2026-06-30 FRESH): CTG bearish=0,75, VCB bearish=0,75, VHM bearish=0,6203, VNM bearish=0,5305, SSI bearish=0,3867, BID bearish=0,2195 — tất cả UNTRUSTED LR=1,0 n=0
- **decisions**:
  - CTG bearish=0,75: Quẻ 8 Ty THUẬN LỢI 100% MÂU THUẪN trực tiếp + GDP +11,9% H2 state-bank-bullish + giá +0,15% → LOẠI
  - VCB bearish=0,75: Quẻ 45 Tuy THUẬN LỢI MÂU THUẪN + GDP +11,9% H2 (VCB hưởng lợi trực tiếp) + giá +0,32% → LOẠI
  - VHM bearish=0,6203: Quẻ 64 Vi Tế TRUNG TÍNH 38% (không xác nhận) + giá +1,00% phục hồi phản xu hướng + UNTRUSTED → LOẠI
  - VNM bearish=0,5305: dưới ngưỡng P-4 (<0,6) dù CRITICAL volume spike 6,3× (-2,32%) → không đủ điều kiện
- **claims_created**: 0 — honest NO-OP (qualify_count_effective=0 sau lọc mâu thuẫn)
- **actions**:
  - dedup gate task_claim ✓ (claimed=true, key=published:digest-daily:2026-06-30)
  - log_agent_work id=1519 completed ✓
  - send_telegram WORK ✓ (NO-OP notice H1 cuối kỳ)
  - notebook write ✓
- **carry_over**: FPT/VPB resolution 2026-07-01; POW resolution 2026-07-03; evidence UNTRUSTED systemic (LR=1,0 n=0 — 12th cycle); Brier 0,2135 degrading; VNM anomaly volume; GDP H2 +11,9% catalyst banking
- **estimated_tokens**: 5500

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
  - VIC bullish=0,6728: giá +1,47% xác nhận hôm nay, nhưng LR sentiment thấp (0,16) + quẻ Vị Tế (64) khuyến nghị BÁN 38% → ĐỦ ĐIỀU KIỆN (top-3 by delta), final_p=0,6728×0,16×0,90=0,097 (tín hiệu yếu, tạo claim đúng theo FR-3)
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
  - git commit SKIPPED — no Bash tool available in this session; Write landed but commit-mutex protocol (git add/commit/push) could not execute
- **carry_over**: POW id=12 resolution 2026-07-03 (NGÀY MAI, giá ref 14.800 target >15.000, giá hiện 14.900); CTG/MBB/VIC id=13/14/15 resolution 2026-07-09; BCTC bank OCR corrupt (CTG/VIC total_assets=0, MBB identity violation 14,9%) — dev-team FIX-BCTC-BANK-SUMMARY-MAPPING đang xử lý; evidence LR hồi phục một phần (0,52/0,16 thay vì toàn bộ UNTRUSTED LR=1,0 như trước); calibration report chưa cập nhật resolution 07-01 (2 FP FPT/VPB) — Brier có thể tệ hơn 0,2135 khi tính lại; **notebook chưa được git-committed — cần agent kế tiếp hoặc router commit-sweep xử lý**
- **doc_self_heal**: fixed `docs/agents/tools/package/digest-predict.md` — `create_prediction_claim` param table + example used stale `ticker/prediction/confidence`; corrected to verified `stock/claim_text/probability/horizon_days/resolution_criteria` (confirmed live via id=13/14/15 this cycle)
- **estimated_tokens**: 20000
