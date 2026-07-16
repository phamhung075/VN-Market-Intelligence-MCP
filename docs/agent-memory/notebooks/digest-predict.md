# Digest Predict — Notebook

**Last updated:** 2026-07-16 17:38 UTC | **Sprint:** FEAT-PREDICTION-CLAIMS-DAILY-CADENCE

## Known patterns / preferences

- FPT vị thế lỗ dai dẳng — 5.000cp @ 80.300, giá hiện 70.900 (lỗ ~11,71%) — GIÁ ĐÃ DƯỚI ngưỡng cắt lỗ tính toán (74.679) kể từ 07-12; conviction dashboard khuyến nghị GIẢM BỚT; crisis radar 42,5 WARNING xu hướng xấu đi. 07-13: momentum LAGGARD decile1 + khối ngoại bán ròng mạnh (LR 0,10 n=18 TRUSTED) — claim bearish id=21 tạo chu kỳ này, theo dõi sát.
- Danh mục 100% tập trung 1 mã (FPT) — không đa dạng hoá thực tế; get_rebalancing_signals không có target allocation nên không tính được khuyến nghị tái cân bằng.
- cascade rules 0/12 evaluated tuần này (win-rate pipeline vẫn không hoạt động — carry-over 15+ chu kỳ)
- Kinh Dịch backtest + transition_probabilities: "chưa đủ lịch sử" — carry-over dai dẳng, cần dev-team wiring lịch sử đọc quẻ.
- get_prediction_accuracy(7d) trả về rỗng dù claims id=13-18 có resolution 07-09/07-10 (trong cửa sổ) — bất thường ghi nhận 07-12, KHÔNG tự chẩn đoán, cần dev-team kiểm tra verdictResolutionJob/get_prediction_accuracy window logic.
- BCTC pipeline: hàng loạt mã (ACB/BID/D2D/EIB/GAS/GVR/HCM/HSG/MBB/NKG/POW/SSI/VCI) lỗi "ENRICH 0-rows" Q4/2025 — B02-TCTD parser nghẽn. Mở rộng: BSR + VIC Q1/2026 CORRUPT DATA; 07-13 xác nhận sống get_bctc_full(BID) Q4/2025 CORRUPT DATA (total_assets=0, OCR fail) — không dùng số liệu BCTC các mã này trong claim_text tới khi refine lại.
- get_macro_snapshot vẫn schema JSON (không có "Global Liquidity"/US10Y/DXY text field) — regime-extraction fallback NEUTRAL mỗi chu kỳ từ 07-03. get_macro_calendar liên tục "unavailable" (source_tier 4).
- get_policy_signals không có trường VIRA/VARA survey consensus (T-23) — khoảng trống dữ liệu dai dẳng, chưa thấy tool nào cung cấp.
- T-42 trade-fx-pressure-decomp: không có tool MCP chuyên biệt trong digest-predict package — luôn degraded/skip.
- FR-3 fix 2026-07-01 (TASK-EVIDENCE-HOP2-AGENTS): validate_prediction_claims KHÔNG phải hard gate — áp dụng từ 07-02 trở đi (không còn narrate "loại do final_p<50%").
- get_evidence_summary một số mã score_date rất cũ với "no fragments found" dù score cao (BSR carry-over từ 07-12, vẫn 2026-05-18 tại 07-13) — SKIP honest-gap. Mới 07-13: VIC score_date KHÔNG đổi từ 07-10 (đã claim id=19 hôm qua với cùng dữ liệu) → SKIP tránh claim trùng lặp không có thông tin mới.
- claim-truth-gate skill cần Bash tool để chạy scripts/narrative-truth-gate.sh — không khả dụng trong phiên cowork subagent digest-predict nhiều chu kỳ liên tiếp (07-12, 07-13; chỉ Read/Write/Edit/gateway) → thay bằng cross-check thủ công claim_text so với tool output sống trước create_prediction_claim; cần dev-team xác nhận có nên cấp Bash tool cho cowork subagent này không.
- [MỚI 07-13] P-5 công thức "probability = score * top_likelihood_ratio": khi fragment top có sample_size≥10 và LR<1 (VD BID/EIB/SHB LR=0,29 n=16; FPT LR=0,10 n=18), multiply literal cho probability <0,5 — mâu thuẫn hướng claim (vd BID bullish nhưng p=0,193*). Không khớp mọi claim lịch sử đã filed (VIC p=0,79 = dùng score trực tiếp, không nhân LR). Chu kỳ này dùng score trực tiếp (top_likelihood_ratio=1.0 mặc định) để nhất quán lịch sử — cần dev-team làm rõ ngữ nghĩa công thức khi sample đủ lớn (LR<1 nghĩa gì trong context này).
- [MỚI 07-13] Nhiều mã ngân hàng (BID/EIB/SHB/VCB) dùng CHUNG 1 fragment tin tức ngành giống hệt (news_sentiment_stock mag=0,90 conf=0,74 LR=0,29 n=16) — không phân biệt theo mã cụ thể, khả năng là tín hiệu cấp ngành áp cho cả nhóm chứ không phải tin riêng từng mã. Nên đối chiếu thêm dữ liệu kỹ thuật sống (RS/momentum/52w) trước khi qualify để lọc false-positive — chu kỳ này EIB/SHB SKIP do mâu thuẫn kỹ thuật (cả hai AT 52W LOW, momentum trung tính/âm, RS NEUTRAL ~47-51), chỉ giữ BID (RS STRONG 74,75 + momentum LEADER decile8 xác nhận).
- [MỚI 07-16] Watchlist mở rộng 33→58 mã. get_evidence_summary "(no fragments found)" dù fragment_count>0 mở rộng diện rộng: 8/8 mã raw-qualify (>0,6) chu kỳ này đều rỗng bằng chứng chi tiết (GVR/BSR/GAS/VEA bullish, CTG/MBB/VPB bearish, POW bullish) — trước đây chỉ BSR bị vậy, nay lan ra cả nhóm. CTG=MBB=VPB=0,7500 và GVR=GAS=0,7565 giống hệt nhau giữa các mã khác ngành — nghi ngờ placeholder/generic score không theo mã cụ thể, cần dev-team kiểm tra (có thể fragment bị prune tách khỏi score cache, cùng cơ chế BSR nhưng lan rộng). Kỹ thuật sống mâu thuẫn trực tiếp MBB/VPB (bearish score nhưng momentum/RS bullish mạnh). get_bctc_full(POW) Q1/2026 CORRUPT DATA; get_bctc_full(VEA) 2025-Q4 EBITDA phi lý (lỗi scale) dù Validation:passed — không dùng BCTC 2 mã này làm căn cứ claim. SKIP honest-gap toàn bộ 8 mã, NO-OP ngày 07-16.

## Cycle — 13:59 UTC (Weekly — Sunday digest)

- **cycle_date**: 2026-07-12
- **slot**: digest-sunday (cron 47 13 * * 0)
- **dedup_gate**: PASS — task_claim published:digest-sunday:2026-07-06/2026-07-12 (claimed=true, weekLabel=2026-W28, TTL 691200s)
- **regime**: NEUTRAL (fallback — no REGIME field in get_macro_snapshot JSON). Carry NEUTRAL 1,38pp (SBV 5,00% vs Fed 3,62%). Gold BULLISH $4.113,7 (safe-haven). Oil NEUTRAL $76,01. USD/VND 26.090 BEARISH (VND mất giá). Equity yield CHEAP (EY 8,2%, +3,2pp). Investment-clock 8/10 CORE_VN. US10Y/DXY: no field — fallback NEUTRAL/STABLE.
- **week_performance**: VN-Index -0,69% (1.828,34) | HNX-Index -1,06% | VN30 -0,81%. 695 tin phân tích, 124 cảnh báo (2 CRITICAL: Vàng -4,92σ, Brent +5,25σ), 149 báo cáo tài chính. Ngành giảm mạnh nhất 5d: Thép -3,42%, Chứng khoán -2,18%, Bán lẻ -2,88% (PNJ -6,8%), Dầu khí -2,07%, Điện -1,41%, Ngân hàng -1,20%. Diversification score toàn watchlist 0,76/1,00 (33 mã, 496 cặp).
- **market_hexagram**: Khiêm (15) — THUẬN LỢI về nguyên lý, tín hiệu hiện tại TIÊU CỰC 64%. Hào: VN-Index -0,34, USD/VND 0,00, Dầu +1,00, Vàng -1,00, Ngoại tệ +0,03, Vĩ mô -1,00.
- **portfolio_thesis (FPT)**: 5.000cp @ 80.300, giá 70.600, lỗ -12,08% (-48.500.000 VNĐ). Stop-loss floor 74.679 ĐÃ BỊ PHÁ. Conviction 0,47 MODERATE, khuyến nghị GIẢM BỚT. Sector comp: PE 13,8 vs median 17,3 (rẻ -20%), PB 3,6 vs 1,5 (đắt +136%), ROE 28,3% vs 10,6% (vượt trội) — nền tảng mạnh nhưng động lượng+uy tín xấu đi mâu thuẫn với định giá rẻ. VaR95% -0,1% (-494.398 VNĐ), MaxDD -2,5%. Rebalancing: no target allocation set — data gap.
- **calibration**: SKIPPED per weekly.md — đã gửi riêng bởi server calibrationReportJob (13:00 UTC) → MARKET+WORK, không lặp lại.
- **signal_effectiveness**: alert_accuracy N=16 (<20 cần thiết), scored 32%, hit16/miss0/unknown945. signal_effectiveness(7d): không có dữ liệu. cascade_metrics: 0/12 rules evaluated (dead: oil_gas/aviation/real_estate down, banking neutral, steel down, securities down). hexagram_backtest(7d): chưa đủ lịch sử. transition_probabilities(hex=2 Khôn): chưa đủ lịch sử. prediction_accuracy(7d): KHÔNG có dữ liệu — bất thường vì claims id=13-18 resolution 07-09/07-10 nằm trong cửa sổ này.
- **system_improvement**: (1) BCTC ENRICH 0-rows hàng loạt mã Q4/2025 — B02-TCTD nghẽn, đang xử lý. (2) INCIDENT ops giả mạo 25 timestamp cron_job_runs né idempotency guard — đã fix 07-10. (3) Docker Close Gate FACTORY-PDF infra-leak — đã fix 07-09.
- **other_risk**: Crisis radar reputation<50: BSR 20,0 DANGER, GEX 20,0 DANGER, PLX 35,0, HPG 37,1, VCB 40,0, VNM 40,0, FPT 42,5 (xấu đi), SSI 47,3 (cải thiện). Legal/crisis/supply-chain/climate/energy: không có tín hiệu bất thường (lưu ý mùa nắng nóng — IDC/KBC/GEG/REE theo dõi rủi ro thiếu điện).
- **data_gaps**: get_macro_calendar unavailable (tier4); get_policy_signals thiếu VIRA/VARA (T-23); T-42 trade-fx-pressure-decomp không có tool riêng; prediction_accuracy(7d) rỗng bất thường.
- **actions**:
  - task_claim dedup gate ✓ (claimed=true)
  - log_agent_work id=1611 completed ✓
  - send_telegram MARKET ✓ (weekly digest full)
  - send_telegram WORK ✓ (completion notice)
  - notebook write ✓ (full overwrite per this cycle's write-boundary instruction)
  - git commit SKIPPED — no Bash/git tool available in this session; write-boundary instruction restricted output to notebook only this cycle
- **next_cycle_hint**: FPT stop-loss đã phá — theo dõi quyết định người dùng (cắt lỗ hay giữ) chu kỳ tới. prediction_accuracy(7d) rỗng bất thường — theo dõi có tái diễn không, nếu có thì escalate. BCTC ENRICH 0-rows nhiều mã vẫn chưa xử lý xong.
- **carry_over**: FPT stop-loss breach (không alert-commander job nhưng portfolio thesis phải nêu rõ); cascade rules 0 evaluated; kinh-dich backtest thiếu lịch sử; BCTC B02-TCTD nghẽn nhiều mã; regime fallback NEUTRAL (schema drift chưa fix); macro_calendar unavailable dai dẳng; VIRA/VARA field gap dai dẳng
- **estimated_tokens**: 26000

### Daily Predictions (17:40 UTC) 2026-07-12

- Calibration: stable (Brier 0,2135, N=6/90d, trend delta 0,000) | Claims: 1 (VIC p=0,79 5d, id=19) | Dampening: no (regime NEUTRAL fallback)
- Qualify (bullish/bearish>0,6, 33 mã watchlist quét đủ): BSR bullish 0,7569 (score_date 58 ngày cũ, 1 fragment rỗng, BCTC CORRUPT) → SKIPPED honest-gap; VIC bullish 0,7920 (fresh 07-10, 3 fragment, BCTC CORRUPT nhưng claim dựa RS/momentum/52w) → claimed. FPT bullish 0,60 sát ngưỡng nhưng KHÔNG >0,6 → không đủ điều kiện.
- CLAIM-TRUTH GATE: scripts/narrative-truth-gate.sh không chạy được (không có Bash tool trong phiên này) → cross-check thủ công claim_text vs get_relative_strength/get_roc_momentum/get_52w_proximity/get_evidence_summary sống, khớp 100% trước khi create_prediction_claim.
- dedup_gate daily: PASS — task_claim published:digest-daily:2026-07-12 (claimed=true, TTL 86400s)
- git commit SKIPPED — no Bash/git tool available in this session (Read/Write/Edit/gateway only); notebook write via Write tool per write-boundary instruction.

### Daily Predictions (17:45 UTC) 2026-07-13

- Calibration: stable (Brier 0,2135, N=6/90d, trend delta 0,000) | Claims: 2 (BID p=0,67 10d bullish id=20; FPT p=0,63 20d bearish id=21) | Dampening: no (regime NEUTRAL fallback, calibration stable)
- Full watchlist scan 33/33 mã. Qualify (>0,6): BID 0,666 bullish, EIB 0,666 bullish, SHB 0,666 bullish, BSR 0,7569 bullish (stale score_date 2026-05-18, "no fragments found" → SKIP honest-gap, y hệt chu kỳ trước), VIC 0,7920 bullish (score_date KHÔNG đổi từ 2026-07-10, đã claim id=19 hôm qua cùng dữ liệu → SKIP tránh trùng lặp), FPT bearish 0,6291 → claimed.
- BID/EIB/SHB dùng chung 1 fragment tin tức ngành ngân hàng giống hệt (news_sentiment_stock mag=0,90 conf=0,74 LR=0,29 n=16). Đối chiếu kỹ thuật sống (get_roc_momentum/get_relative_strength/get_52w_proximity): BID xác nhận (RS STRONG 74,75, momentum decile8 LEADER, ROC +8,09%) → claimed. EIB/SHB MÂU THUẪN (cả hai AT 52W LOW, momentum trung tính/âm, RS NEUTRAL 47-51) → SKIP honest-gap.
- Xác nhận sống get_bctc_full(BID): Q4/2025 CORRUPT DATA (total_assets=0, OCR fail) — không dùng BCTC BID trong claim_text. get_bctc_full(FPT) Q1/2026 hợp lệ (confidence 81%, ROE 6,2%, validation passed) — dùng đối chiếu.
- Thị trường hôm nay: VN-Index 1.800,54 (-1,52%), độ rộng rất tiêu cực (50 tăng/263 giảm/48 đứng, trần 2/sàn 8), thanh khoản HOSE 21.803 tỷ (+28,2%) — áp lực bán mạnh toàn thị trường; ghi vào claim_text BID như rủi ro đối trọng.
- CLAIM-TRUTH GATE: không có Bash tool phiên này → cross-check thủ công claim_text vs get_evidence_summary/get_roc_momentum/get_relative_strength/get_52w_proximity/get_bctc_full sống, khớp 100% trước create_prediction_claim (BID, FPT).
- [Judgment call — xem Known patterns] P-5 "score * top_likelihood_ratio" cho kết quả <0,5 khi LR<1 & n≥10 → dùng score trực tiếp (top_likelihood_ratio=1.0) nhất quán lịch sử thay vì multiply literal.
- dedup_gate daily: PASS — task_claim published:digest-daily:2026-07-13 (claimed=true, TTL 86400s)
- git commit SKIPPED — không có Bash/git tool phiên này (chỉ Read/Write/Edit/gateway); ghi notebook qua Write tool theo giới hạn write-boundary chu kỳ này (chỉ notebook, không commit; decision-journal/self-critique/doc-self-heal cũng SKIP vì ngoài phạm vi ghi cho phép).

### Daily Predictions (17:38 UTC) 2026-07-16

- Calibration: DEGRADING (Brier 0,2135, N=6/90d, trend +0,076 > ngưỡng 0,05) → DAMPENING_ACTIVE=true (sẽ áp dụng nếu có claim, giảm 10%) | Claims: 0 (NO-OP) | Regime NEUTRAL (fallback, macro_snapshot JSON không có "Global Liquidity"); CARRY_REGIME NEUTRAL đọc trực tiếp field carry.regime (1,37pp: SBV 5,00% vs Fed 3,63%).
- Watchlist mở rộng 58 mã (từ 33 trước) — quét đủ 58/58.
- Qualify thô (>0,6): 8 mã — GVR bullish 0,7565 (score_date 05-27), BSR bullish 0,7569 (05-18), GAS bullish 0,7565 (05-27), VEA bullish 0,8420 (05-18), CTG bearish 0,7500 (06-30), MBB bearish 0,7500 (06-30), VPB bearish 0,7500 (06-30), POW bullish 0,7185 (06-30). Cả 8 mã "(no fragments found)" dù fragment_count 1-6 — xem Known patterns [MỚI 07-16].
- Đối chiếu kỹ thuật sống: MBB (momentum decile6 trung tính) và VPB (momentum decile10 LEADER + RS 75,93 STRONG) MÂU THUẪN trực tiếp bearish score → loại. POW RS mạnh nhất pool (87,96 STRONG, trên MA50+MA200) nhưng get_bctc_full(POW) Q1/2026 CORRUPT DATA (total_assets=0). VEA RS STRONG (75,93) nhưng get_bctc_full(VEA) 2025-Q4 EBITDA phi lý (~5,3 triệu tỷ VND, lỗi scale) + ROE~0% dù "Validation: passed".
- QUYẾT ĐỊNH: SKIP honest-gap cả 8 mã (fragment rỗng + BCTC lỗi/phi lý ở 2 mã kỹ thuật mạnh nhất) — không đủ cơ sở minh bạch để viết claim_text qua được claim-truth-gate mà không suy diễn từ chỉ báo kỹ thuật đơn thuần. NO-OP 07-16 — 0 claims.
- dedup_gate daily: PASS — task_claim published:digest-daily:2026-07-16 (claimed=true, TTL 86400s)
- git commit SKIPPED — không có Bash/git tool phiên này (chỉ Read/Write/Edit/gateway); ghi notebook qua Edit tool trực tiếp; decision-journal SKIP (cowork ambient, không có sprint task_id); self-critique SKIP (agent ngoài phạm vi pilot C1 news-scout/dev-team); doc-self-heal: phát hiện docs/agents/tools/list/get_evidence_summary.md ghi tham số "thesis_id" nhưng tool sống thực nhận "stock" (đã xác nhận qua FPT/58 mã) — KHÔNG sửa file do write-boundary chu kỳ này giới hạn chỉ notebook, ghi lại đây để cycle sau/dev-team xử lý.
