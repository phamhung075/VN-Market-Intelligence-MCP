# Digest Predict — Notebook

**Last updated:** 2026-05-31 13:51 UTC | **Sprint:** weekly

## Current state

Weekly digest sent. VN-Index 1.863 flat. FPT position lỗ 10,83% — khuyến nghị giảm bớt.

## Last session summary

- **cycle_date**: 2026-05-31
- **slot**: digest-sunday (manual, off-cadence Saturday run)
- **findings**:
  - VN-Index 1.863,49 (-0,01%) — đi ngang, điều chỉnh chưa kết thúc
  - HNX +3,28% — small/mid cap nổi bật
  - GAS +6,98% | BSR +4,39% | PLX +3,93% (dầu khí phục hồi từ đáy tuần trước)
  - VNH -11,11% | HNG -4,11% | OPC -6,24%
  - REGIME: NEUTRAL | DXY: USD STRENGTHENING (26.115) | Carry: NEUTRAL (1,38pp)
  - Gold $4.593 (+5,38σ extreme high — risk-off signal)
  - Oil $91,12 NEUTRAL — phục hồi từ -4,23σ cực thấp tuần trước
  - Equity EY spread 3,20pp > deposit rate — vẫn HẤP DẪN tích lũy
  - FPT: 5.000cp @ 80.300 | giá 71.600 | lỗ 10,83% — quẻ Kiển (39) BAN, GIẢM BỚT
  - FPT PE 13,8 vs ngành 17,3 (chiết khấu -20%) nhưng ngoại bán ròng -38K cp/5 phiên
  - CMG: 2 vi phạm chứng khoán tuần này
  - PC1: chủ tịch chưa rõ pháp lý từ 19/5
  - VPB: kiểm toán cho vay Lạng Sơn
  - Cascade rules: 0 evaluated (tất cả hits, 0 win-rate)
  - Alert accuracy: N=5 (không đủ mẫu, cần ≥20)
  - kinh-dich backtest: 501 NOT IMPLEMENTED (vẫn carry-over)
  - TASKS.md lỗi liên tiếp 3 lần (system-auditor D4 abort)
  - VPS pollNews mất tín hiệu 2 lần trong tuần (3/7 nguồn hoạt động)
  - BCTC push pipeline vỡ (pdf-extractor → mcp-server HTTP stalled)
- **actions**:
  - Digest gửi MARKET ✓
  - Status gửi WORK ✓
  - log_agent_work id=1180 in progress
- **next_cycle_hint**: Kiểm tra FPT tuần tới — nếu vẫn yếu hơn ngành + ngoại bán ròng → cắt 50% vị thế. Dầu khí theo dõi địa chính trị. Kinh Dịch backtest 501 — đề nghị PO ưu tiên.
- **carry_over**: kinh-dich-service backtest 501 (3 chu kỳ liên tiếp) → leo thang PO ngay; TASKS.md corruption → dev-team; BCTC push pipeline blocked
- **estimated_tokens**: 14000

## Known patterns / preferences

- Kinh Dịch backtest 501 từ ≥2026-05-25 — cần dev-team B-bucket wiring
- FPT vị thế lỗ dai dẳng qua nhiều chu kỳ — theo dõi điều kiện cắt bớt
- cascade rules 0 evaluated — win-rate pipeline không hoạt động, cần kiểm tra

## Cycle — 06:41 UTC

- **cycle_date**: 2026-05-25
- **slot**: digest-sunday (health-verify, off-cadence — manual post server-renewal)
- **findings**:
  - VN-Index +0,53% hôm nay; BĐS dẫn đầu +2,75% (VHM +3,32%, VRE +3,15%, KDH +3,83%); Thép +3,04%
  - Dầu khí -4,32% (GAS -4,59%, PLX -4,53%) — tin Hormuz có thể mở lại, dầu lao dốc
  - Brent CRITICAL: 100,21 USD (-3,83σ dưới TB 103,96)
  - FPT vị thế: 5.000cp @ 80.300, giá 73.900, lỗ 7,97% — khuyến nghị XEM XÉT GIẢM
  - Legal: PC1 (chủ tịch HĐQT chưa rõ tình trạng pháp lý từ 19/5), VPB (kiểm toán cho vay Lạng Sơn)
  - Insider: MWG lãnh đạo + cổ đông lớn bán mạnh trước IPO; HPG lãi Q2 vượt kỳ vọng
  - macro-indicators service: KHÔNG KHẢ DỤNG — get_macro_snapshot + get_macro_calendar đều lỗi
  - kinh-dich-service: KHÔNG KHẢ DỤNG — run_hexagram_backtest + get_market_hexagram đều lỗi
  - 7 feedbacks pending chưa giải quyết (A-21c dailyDashboardJob, B-05 ssc-iboard, B-10 VPS news-fetch)
- **actions**:
  - Digest gửi MARKET ✓
  - Status gửi WORK ✓
  - Bug escalation gửi BUG (msg_id 2577) ✓
  - log_agent_work id=1108 completed ✓
- **next_cycle_hint**: Theo dõi FPT (vị thế lỗ 7,97% — xem xét cắt lỗ); dầu khí tiếp tục áp lực nếu Hormuz mở; kinh-dich-service + macro-indicators cần dev-team khôi phục trước chu kỳ Sunday tiếp theo
- **carry_over**: macro-indicators + kinh-dich-service down → nếu tiếp tục lỗi Sunday sau, leo thang lên PO
- **estimated_tokens**: 12000
