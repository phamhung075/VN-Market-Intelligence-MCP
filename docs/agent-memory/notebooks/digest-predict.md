# Digest Predict — Notebook

**Last updated:** 2026-06-26 17:31 UTC | **Sprint:** FEAT-PREDICTION-CLAIMS-DAILY-CADENCE

## Known patterns / preferences

- Kinh Dịch backtest 501 từ >=2026-05-25 — cần dev-team B-bucket wiring (carry-over 5+ chu kỳ)
- FPT vị thế lỗ dai dẳng qua nhiều chu kỳ — theo dõi điều kiện cắt bớt
- cascade rules 0 evaluated — win-rate pipeline không hoạt động, cần kiểm tra
- VPB rủi ro kiểm toán cho vay Lạng Sơn — chưa giải quyết

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

### Daily Predictions (17:30 UTC) 2026-06-21

- **slot**: digest-daily (cron 30 17 * * *, lần đầu tiên)
- **dedup_gate**: PASS — task claimed: published:digest-daily:2026-06-21
- **regime**: NEUTRAL — VN-Index 1878.02, Oil $73.86 NEUTRAL, Gold $4017.5 BULLISH (risk-off), USD/VND 26131 BEARISH, carry 1.37pp NEUTRAL, EY 7.05% CHEAP. DAMPENING_ACTIVE=false.
- **calibration**: Brier 0.1379 stable, delta 0.000 | Proceed normally
- **cap_status**: 2/3 đã dùng (id=10 FPT bearish, id=11 VPB bearish từ catch-up sáng nay)
- **screened_today** (score_date=2026-06-24): CTG bearish=0.75, VCB bearish=0.75, MBB bearish=0.75, VHM bearish=0.47, VRE bearish=0.31, NVL bearish=0.35, SSI bearish=0.45, HPG bearish=0.32, MWG bullish=0.16
- **qualified_today** (>0.6): CTG, VCB, MBB — tất cả từ cùng 1 sự kiện FII bán ròng 600 tỷ VND (chain_catalyst banking sector-wide). VPB bearish (id=11) đã tạo sáng nay cho cùng luận điểm.
- **decision**: ZERO claims mới — các mã vượt 0.6 đều tương quan với luận điểm VPB banking bearish đã có (id=11). Tạo claim tương quan trùng không thêm conviction. Bằng chứng không độc lập.
- **claims_created**: 0
- **actions**:
  - dedup gate task_claim ✓ (claimed=true)
  - log_agent_work id=1441 running ✓
  - send_telegram WORK ✓ (no-op honest)
  - notebook write ✓
- **carry_over**: kinh-dich backtest 501 (6th cycle); cascade rules 0 evaluated; FPT/VPB resolution 2026-07-01
- **estimated_tokens**: 3500

### Daily Predictions (17:35 UTC) 2026-06-24

- **slot**: digest-daily (cron 30 17 * * *, FIRST-EVER fire FEAT-PREDICTION-CLAIMS-DAILY-CADENCE)
- **dedup_gate**: PASS — task claimed: published:digest-daily:2026-06-24 (claimed=true, TTL 86400s)
- **regime**: NEUTRAL — carry 1.37pp NEUTRAL, equity EY 7.05% CHEAP, gold BULLISH (safe-haven $4017), USD/VND 26131 BEARISH, investment-clock CORE_VN score 8/10. DAMPENING_ACTIVE=false.
- **calibration**: Brier 0.1379 stable, delta=0.000. Proceed normally.
- **market_context**: VN-Index 1,878.02 +0.48%, breadth NEGATIVE (109T/174G), liquidity -41.4%, hexagram 47 Khon (Exhaustion) confidence 25% BAT LOI
- **screened**: NVL bearish=0.35 (UNTRUSTED), VHM bearish=0.47 (UNTRUSTED), MWG bullish=0.16 (UNTRUSTED), VIC bullish=0.7667 (stale 28d), FPT bearish=0.75 (UNTRUSTED), HPG bearish=0.32
- **outcome**: HONEST NO-OP — FPT bearish=0.75 passes score filter but all fragments UNTRUSTED (LR=1.0, n=0); validate_prediction_claims requires Sharpe>1.0 backtest — not satisfiable; get_prediction_accuracy returns no data 30d; prior catch-up already used 2/3 daily cap
- **claims_created**: 0
- **actions**: dedup gate claimed, send_telegram WORK (NO-OP notice), log_agent_work id=1442
- **carry_over**: FPT/VPB resolution 2026-07-01; evidence UNTRUSTED systemic (all LR=1.0 n=0 — dev-team signal needed); kinh-dich backtest 501 (7th cycle)
- **estimated_tokens**: 5000

### Daily Predictions (17:31 UTC) 2026-06-25

- **slot**: digest-daily (cron 30 17 * * *, genuine daily fire — last_fired 2026-06-24T17:31Z)
- **dedup_gate**: PASS — task claimed: published:digest-daily:2026-06-25 (claimed=true, keyed on UTC calendar date 2026-06-25, NOT get_week_period.periodStart — key fix e1e9d6ab verified)
- **regime**: NEUTRAL — VN-Index 1.863,07 (-0,80%), BRENT $74,91 (+2,45%), GOLD $4.046,7 (+0,56%), USD/VND 26.136 BEARISH, carry 1,37pp NEUTRAL. DAMPENING_ACTIVE=false.
- **hexagram_market**: Quẻ 55 Phong — THUẬN LỢI 100%. Breadth: 115T/176G. Thanh khoản 16.114 tỷ (-11,3%).
- **calibration**: Brier 0,1379 stable, delta=0,000 | Tiến hành bình thường
- **screened_today**:
  - POW: bullish=0,6554 (UNTRUSTED LR=1,0 n=0) — passes score filter nhưng hexagram Quẻ 52 Can THẬN TRỌNG 13% mâu thuẫn → LOẠI
  - VIC: bullish=0,7667 (STALE 29 ngày, score_date 2026-05-27) → LOẠI stale
  - VHM: bearish=0,4745 (<0,6) → dưới ngưỡng
  - NVL: bearish=0,3463 (UNTRUSTED, <0,6) → dưới ngưỡng
- **session_context**: BĐS risk-off đồng loạt (VIC -2,39%, NVL -2,32%, VRE -2,31%, VHM -1,94%), FII bán ròng CTG 476k / NVL 237k / FPT 192k. POW bullish catalyst thực (vol 3,8x, FII mua ròng 270k) nhưng không đủ điều kiện claim (LR untrusted + hexagram mâu thuẫn). TCH/VCB vỡ BB dưới; NKG/DPM/REE RSI quá bán.
- **claims_created**: 0 — honest NO-OP (qualify_count=0)
- **actions**:
  - dedup gate task_claim ✓ (claimed=true, key=published:digest-daily:2026-06-25)
  - log_agent_work id=1456 running ✓
  - send_telegram WORK ✓ (NO-OP notice với context đầy đủ)
  - notebook write ✓
- **carry_over**: FPT/VPB resolution 2026-07-01; evidence UNTRUSTED systemic (all LR=1.0 n=0 — 9th cycle); BĐS risk-off cần theo dõi (VIC/VHM/NVL); FPT portfolio lỗ 11,6% (-46,5tr VND)
- **estimated_tokens**: 4500

### Daily Predictions (17:31 UTC) 2026-06-26

- **slot**: digest-daily (cron 30 17 * * *)
- **dedup_gate**: PASS — task claimed: published:digest-daily:2026-06-26 (claimed=true, TTL 86400s)
- **regime**: NEUTRAL — VN-Index 1.871,91 (+0,47%), BRENT $72,54 (-3,25%), GOLD $4.105,7 (+1,64%), USD/VND 26.114, carry 1,37pp NEUTRAL, EY 7,05% CHEAP. DAMPENING_ACTIVE=false.
- **calibration**: Brier 0,1379 stable, delta=0,000 | Tiến hành bình thường
- **market_hexagram**: Quẻ 46 Thăng — THUẬN LỢI 100%. Breadth: 125T/196G. Thanh khoản 16.110 tỷ (-0,0% flat).
- **screened_today** (score_date=2026-06-26 FRESH): VHM bearish=0,6203 (UNTRUSTED), VCB bearish=0,7500 (UNTRUSTED), POW bullish=0,6554 (UNTRUSTED), MWG bullish=0,1575 (<0,6). Stale: VIC bullish=0,7667 (30d), GVR bullish=0,7565 (30d), ACB bearish=0,5040 (51d).
- **decisions**:
  - VHM bearish=0,6203: hexagram Quẻ 38 Khue TRUNG TINH 38% + giá +3,51% mâu thuẫn → LOẠI
  - VCB bearish=0,7500: hexagram Quẻ 23 Bắc BẤT LỢI 25% (độ tin cậy thấp) + giá +0,99% + tin tức ngân hàng Q2 bullish mâu thuẫn → LOẠI
  - POW bullish=0,6554: hexagram Quẻ 59 Hoan THUẬN LỢI 100% HỘI TỤ với thị trường Thăng (46) THUẬN LỢI 100%, giá +2,07% → ĐỦ ĐIỀU KIỆN
- **claims_created**: 1
  - id=12: POW TĂNG p=0,65 horizon=5d resolution=2026-07-03 | giá ref: 14.800 VNĐ, mục tiêu >15.000 VNĐ
- **actions**:
  - dedup gate task_claim ✓ (claimed=true, key=published:digest-daily:2026-06-26)
  - log_agent_work id=1464 running ✓
  - create_prediction_claim POW bullish id=12 ✓
  - send_telegram WORK ✓
  - notebook write ✓
- **carry_over**: FPT/VPB resolution 2026-07-01; POW resolution 2026-07-03; evidence UNTRUSTED systemic (LR=1.0 n=0 — 10th cycle); backtest 501 dev gap (10th cycle); FPT portfolio lỗ (giá 70.800 vs 80.300 mua)
- **estimated_tokens**: 5500
