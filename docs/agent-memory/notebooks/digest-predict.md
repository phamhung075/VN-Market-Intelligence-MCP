# Digest Predict — Notebook

**Last updated:** 2026-07-19 13:52 UTC (weekly digest 2026-W29) | **Sprint:** FEAT-PREDICTION-CLAIMS-DAILY-CADENCE

## Known patterns / preferences

- FPT vị thế lỗ dai dẳng — 5.000cp @ 80.300, giá hiện 70.900 (lỗ ~11,71%) — GIÁ ĐÃ DƯỚI ngưỡng cắt lỗ tính toán (74.679) kể từ 07-12; conviction dashboard khuyến nghị GIẢM BỚT; crisis radar 42,5 WARNING xu hướng xấu đi. 07-13: momentum LAGGARD decile1 + khối ngoại bán ròng mạnh (LR 0,10 n=18 TRUSTED) — claim bearish id=21 tạo chu kỳ này, theo dõi sát.
- Danh mục 100% tập trung 1 mã (FPT) — không đa dạng hoá thực tế; get_rebalancing_signals không có target allocation nên không tính được khuyến nghị tái cân bằng.
- cascade rules 0/12 evaluated tuần này (win-rate pipeline vẫn không hoạt động — carry-over 15+ chu kỳ)
- Kinh Dịch backtest + transition_probabilities: "chưa đủ lịch sử" — carry-over dai dẳng, cần dev-team wiring lịch sử đọc quẻ.
- get_prediction_accuracy(7d) trả về rỗng dù claims id=13-18 có resolution 07-09/07-10 (trong cửa sổ) — bất thường ghi nhận 07-12, KHÔNG tự chẩn đoán, cần dev-team kiểm tra verdictResolutionJob/get_prediction_accuracy window logic.
- BCTC pipeline: hàng loạt mã (ACB/BID/D2D/EIB/GAS/GVR/HCM/HSG/MBB/NKG/POW/SSI/VCI) lỗi "ENRICH 0-rows" Q4/2025 — B02-TCTD parser nghẽn. Mở rộng: BSR + VIC Q1/2026 CORRUPT DATA; 07-13 xác nhận sống get_bctc_full(BID) Q4/2025 CORRUPT DATA (total_assets=0, OCR fail) — không dùng số liệu BCTC các mã này trong claim_text tới khi refine lại. 07-17 xác nhận sống lại: CTG/POW Q1/2026 vẫn CORRUPT DATA (total_assets=0); VEA 2025-Q4 EBITDA vẫn phi lý scale; GAS/MBB/VPB "Chưa có dữ liệu BCTC" (absent, không phải corrupt).
- get_macro_snapshot vẫn schema JSON (không có "Global Liquidity"/US10Y/DXY text field) — regime-extraction fallback NEUTRAL mỗi chu kỳ từ 07-03. get_macro_calendar liên tục "unavailable" (source_tier 4).
- get_policy_signals không có trường VIRA/VARA survey consensus (T-23) — khoảng trống dữ liệu dai dẳng, chưa thấy tool nào cung cấp.
- T-42 trade-fx-pressure-decomp: không có tool MCP chuyên biệt trong digest-predict package — luôn degraded/skip.
- FR-3 fix 2026-07-01 (TASK-EVIDENCE-HOP2-AGENTS): validate_prediction_claims KHÔNG phải hard gate — áp dụng từ 07-02 trở đi (không còn narrate "loại do final_p<50%").
- get_evidence_summary một số mã score_date rất cũ với "no fragments found" dù score cao (BSR carry-over từ 07-12, vẫn 2026-05-18 tại 07-17) — SKIP honest-gap. VIC score_date 07-17 nhưng bullish 0,5533 dưới ngưỡng 0,6 (không qualify chu kỳ này).
- claim-truth-gate skill cần Bash tool để chạy scripts/narrative-truth-gate.sh — không khả dụng trong phiên cowork subagent digest-predict nhiều chu kỳ liên tiếp (07-12, 07-13, 07-16, 07-17, 07-18, 07-19; chỉ Read/Write/Edit/gateway) → thay bằng cross-check thủ công claim_text so với tool output sống trước create_prediction_claim; cần dev-team xác nhận có nên cấp Bash tool cho cowork subagent này không.
- [MỚI 07-13] P-5 công thức "probability = score * top_likelihood_ratio": khi fragment top có sample_size≥10 và LR<1 (VD BID/EIB/SHB LR=0,29 n=16; FPT LR=0,10 n=18; GAS 07-17 LR=0,16 n=16), multiply literal cho probability <0,5 — mâu thuẫn hướng claim. Áp dụng nhất quán: dùng score trực tiếp (top_likelihood_ratio=1,0 mặc định) thay vì nhân literal — cần dev-team làm rõ ngữ nghĩa công thức khi sample đủ lớn (LR<1 nghĩa gì trong context này).
- [MỚI 07-13] Nhiều mã ngân hàng (BID/EIB/SHB/VCB/CTG/MBB/VPB) dùng CHUNG 1 fragment tin tức ngành giống hệt hoặc rỗng fragment — không phân biệt theo mã cụ thể. Nên đối chiếu thêm dữ liệu kỹ thuật sống (RS/momentum/52w) trước khi qualify để lọc false-positive.
- [MỚI 07-16, xác nhận lại 07-17/07-18] Watchlist 58 mã. get_evidence_summary "(no fragments found)" dù fragment_count>0 lặp lại cho nhiều mã stale (score_date cũ) liên tiếp 3 chu kỳ (GVR/BSR-cũ/VEA/CTG/MBB/VPB-cũ/POW) — nghi ngờ cơ chế prune tách fragment khỏi score cache khi score_date cũ, cần dev-team kiểm tra. Kỹ thuật sống thường mâu thuẫn trực tiếp khi score_date cũ.
- [MỚI 07-17] GAS lần đầu trong nhóm raw-qualify có fragment THẬT SỰ hiển thị (không phải "(no fragments found)"): dùng làm tiêu chí phân biệt: chỉ claim khi evidence có fragment kiểm chứng được (score_date tươi + fragment hiển thị nội dung thật), KHÔNG claim khi "(no fragments found)" dù score cao.
- [MỚI 07-18] BSR: fragment TRUSTED tươi (LR=0,16 n=16, tin giá dầu tăng) nhưng BCTC Q1/2026 vẫn CORRUPT DATA (total_assets=166,52 < equity — balance-sheet identity violated) + UPCOM ngoài phạm vi RS/momentum/52w → SKIP theo tiền lệ VEA 07-16 (BCTC lỗi tự nó đủ loại bỏ dù có tín hiệu khác xác nhận).
- [MỚI 07-18] VIX lần đầu được claim: KQKD quý 2/2026 lợi nhuận giảm ~94-95% xác nhận qua 3 nguồn tin độc lập (cafef x2, vietnambiz) trong open_alerts 04:42-09:47 18/7 — dùng đa nguồn tin làm căn cứ xác thực khi VIX không có dữ liệu RS/momentum/52w (data gap hiếm, không phải mâu thuẫn).
- calibration report vẫn dated "2026-06-28" y hệt nhiều chu kỳ liền (07-16/07-17/07-18) — carry-over stale; DAMPENING_ACTIVE=true áp dụng đúng theo dữ liệu sống trả về (không tự suy diễn thêm).
- Thứ Bảy 18/7 xác nhận cadence daily-predict vẫn chạy đúng lịch (không bị bỏ qua) dù thị trường đóng cửa cuối tuần (53/58 giá STALE >24h) — không dùng giá stale cho tín hiệu intraday, chỉ dùng evidence/momentum/RS đã tính từ phiên gần nhất (17/7).
- doc-self-heal 07-17: đã sửa `docs/agents/tools/list/get_evidence_summary.md` (tham số thật là `stock`) và `docs/agents/tools/list/create_prediction_claim.md` (tham số thật là `stock/claim_text/probability/horizon_days/resolution_criteria`).
- doc-self-heal 07-19: đã sửa `docs/agents/tools/list/get_transition_probabilities.md` (tham số thật là `hexagram_number: number`, KHÔNG phải `ticker` — gọi với ticker trả lỗi "Expected number, received nan") và `docs/agents/tools/package/digest-predict.md` (2 dòng: get_transition_probabilities + get_insider_signals thiếu tham số `code: string` bắt buộc).
- [MỚI 07-18] Lần đầu current_holder KHÁC session (không cùng session như 07-17): task_claim published:digest-daily:2026-07-18 → claimed:false, owner_agent="digest-predict" nhưng owner_client_session khác (peer coordination session, claimed_at ~17:35 UTC cùng ngày, TTL 86400s chưa hết hạn, đã tạo 3 claims id=14/15/16). Xác nhận gate là mutex theo NGÀY LỊCH, không theo session (main.md Step pre-D chỉ kiểm tra claimed=true/false, không so sánh session_id) — hoạt động đúng thiết kế cross-session, không phải bug, không cần escalate.
- [MỚI 07-19] Calibration report LẦN ĐẦU tươi sau nhiều tuần (dated 2026-07-19, không còn 06-28) — Brier 0,2135 trend STABLE (delta 0,000, không degrading) → Dampening=false. Đồng thời GAS lần đầu tái hiện anomaly fragment-prune (FRESH 07-18 TRUSTED → stale 05-27 "no fragments found" hôm nay) — mở rộng nhóm carry-over GVR/BSR/VEA/CTG/MBB/VPB/POW sang GAS. VHM lần đầu xuất hiện qualify thô (0,62) với BCTC Q1/2026 CORRUPT (total_assets=0) — thêm vào danh sách mã BCTC lỗi.
- [MỚI 07-19] Chủ Nhật: weekly digest-sunday (13:52 UTC) VÀ daily-predict (17:30 UTC) đều chạy cùng ngày lịch — 2 slot độc lập, đúng thiết kế (daily-predict chạy 7/7, weekly chỉ Chủ Nhật). task_claim published:digest-daily:2026-07-19 collision với session d0ec32a5-... (session ID trùng với session đã publish claims 07-18) claimed ~17:36:05 UTC chỉ vài chục giây trước phiên này — có thể dispatcher tái sử dụng session ID cố định theo slot thay vì random mỗi lần fire; không ảnh hưởng tính đúng đắn của gate (vẫn chặn đúng theo periodKey/UTC_DATE).

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
- **actions**: task_claim dedup gate ✓ | log_agent_work id=1611 completed ✓ | send_telegram MARKET ✓ | send_telegram WORK ✓ | notebook write ✓ | git commit SKIPPED (no Bash/git tool)
- **next_cycle_hint**: FPT stop-loss đã phá — theo dõi quyết định người dùng chu kỳ tới. prediction_accuracy(7d) rỗng bất thường — theo dõi tái diễn. BCTC ENRICH 0-rows nhiều mã vẫn chưa xử lý xong.
- **carry_over**: FPT stop-loss breach; cascade rules 0 evaluated; kinh-dich backtest thiếu lịch sử; BCTC B02-TCTD nghẽn nhiều mã; regime fallback NEUTRAL; macro_calendar unavailable dai dẳng; VIRA/VARA field gap dai dẳng
- **estimated_tokens**: 26000

### Daily Predictions (17:40 UTC) 2026-07-12

- Calibration: stable (Brier 0,2135, N=6/90d, trend delta 0,000) | Claims: 1 (VIC p=0,79 5d, id=19) | Dampening: no (regime NEUTRAL fallback)
- Qualify (bullish/bearish>0,6, 33 mã watchlist quét đủ): BSR bullish 0,7569 (score_date 58 ngày cũ, 1 fragment rỗng, BCTC CORRUPT) → SKIPPED honest-gap; VIC bullish 0,7920 (fresh 07-10, 3 fragment, BCTC CORRUPT nhưng claim dựa RS/momentum/52w) → claimed. FPT bullish 0,60 sát ngưỡng nhưng KHÔNG >0,6 → không đủ điều kiện.
- dedup_gate daily: PASS — task_claim published:digest-daily:2026-07-12 (claimed=true, TTL 86400s)
- git commit SKIPPED — no Bash/git tool available in this session.

### Daily Predictions (17:45 UTC) 2026-07-13

- Calibration: stable (Brier 0,2135, N=6/90d, trend delta 0,000) | Claims: 2 (BID p=0,67 10d bullish id=20; FPT p=0,63 20d bearish id=21) | Dampening: no
- Full watchlist scan 33/33 mã. BID/EIB/SHB dùng chung 1 fragment tin ngành ngân hàng giống hệt (LR=0,29 n=16). Đối chiếu kỹ thuật sống: BID xác nhận (RS STRONG 74,75, momentum decile8 LEADER) → claimed. EIB/SHB MÂU THUẪN (AT 52W LOW, momentum trung tính/âm) → SKIP honest-gap.
- dedup_gate daily: PASS — task_claim published:digest-daily:2026-07-13 (claimed=true, TTL 86400s)
- git commit SKIPPED — no Bash/git tool available.

### Daily Predictions (17:38 UTC) 2026-07-16

- Calibration: DEGRADING (Brier 0,2135, trend +0,076>0,05) → DAMPENING_ACTIVE=true | Claims: 0 (NO-OP) | Regime NEUTRAL fallback
- Watchlist mở rộng 58 mã. Qualify thô 8 mã, tất cả "(no fragments found)" + BCTC lỗi/phi lý ở 2 mã kỹ thuật mạnh nhất (POW/VEA) → SKIP honest-gap cả 8. NO-OP.
- dedup_gate daily: PASS — task_claim published:digest-daily:2026-07-16 (claimed=true, TTL 86400s)
- git commit SKIPPED — no Bash/git tool.

### Daily Predictions (17:40 UTC) 2026-07-17

- Calibration: DEGRADING (Brier 0,2135, trend +0,076>0,05) → DAMPENING_ACTIVE=true (-10%) | Claims: 1 (GAS p=0,62 5d bullish id=13) | Regime NEUTRAL fallback
- Watchlist 58/58 quét đủ. Qualify thô 8 mã; chỉ GAS có fragment TRUSTED tươi thật sự hiển thị (07-17) → claimed dựa evidence+momentum/RS. 7/8 mã còn lại "(no fragments found)"/stale → SKIP honest-gap.
- dedup_gate daily: PASS — task_claim published:digest-daily:2026-07-17 (claimed=true, TTL 86400s)
- git commit SKIPPED — no Bash tool.

### Daily Predictions (dedup-blocked, re-fire) 2026-07-17 ~17:45 UTC

- Router spawned slot=digest-daily again same UTC calendar day sau khi 17:40 UTC đã publish. Step pre-D dedup gate: claimed:false, same-agent holder — gate hoạt động đúng thiết kế. Clean EXIT, không bootstrap/claim/telegram lặp lại.

### Daily Predictions (17:35 UTC) 2026-07-18

- Calibration: DEGRADING (Brier 0,2135, N=6/90d, trend +0,076 > ngưỡng 0,05, report vẫn dated 2026-06-28) → DAMPENING_ACTIVE=true (-10%) | Claims: 3 (VIX p=0,68 5d bearish id=14; PLX p=0,63 5d bullish id=15; GAS p=0,63 5d bullish id=16) | Regime NEUTRAL (fallback, macro_snapshot JSON không có "Global Liquidity"); CARRY_REGIME NEUTRAL đọc trực tiếp carry.regime (1,37pp: SBV 5,00% vs Fed 3,63%).
- Watchlist 58/58 mã quét đủ (Thứ Bảy — thị trường đóng cửa, giá stale từ phiên 17/7, không ảnh hưởng evidence/momentum/RS đã tính). Qualify thô (>0,6): 10 mã — GVR bullish 0,7565 (stale 05-27, no fragments), CTG bearish 0,75 (stale 06-30, no fragments), MBB bearish 0,75 (stale 06-30, no fragments), VPB bullish 0,66 (FRESH 07-18, TRUSTED), BSR bullish 0,6979 (FRESH 07-18, TRUSTED nhưng BCTC Q1/2026 CORRUPT + UPCOM ngoài phạm vi RS/momentum/52w), GAS bullish 0,6946 (FRESH 07-18, TRUSTED), PLX bullish 0,6979 (FRESH 07-18, TRUSTED), VEA bullish 0,842 (stale 05-18, no fragments), VIX bearish 0,7518 (FRESH 07-18, fragment thật LR=1,0 n=0), POW bullish 0,7185 (stale 06-30, no fragments).
- Honest-gap SKIP 5/10 mã stale + "(no fragments found)" (GVR/CTG/MBB/VEA/POW). BSR SKIP riêng dù fragment TRUSTED — BCTC CORRUPT (total_assets=166,52<equity) — theo tiền lệ VEA 07-16 (BCTC lỗi tự nó đủ loại bỏ).
- 4 mã còn lại corroborate được: VPB (RS STRONG 77,8 + momentum decile10 LEADER +26,8% xác nhận mạnh cùng chiều bullish), GAS (momentum decile9 LEADER +19,5% z=1,10 mạnh nhất nhóm + RS h252 LEADING 88,9%ile), PLX (momentum decile8 LEADER +4,18% + RS trung tính 40,7 kéo bởi h126 yếu), VIX (không có RS/momentum — data gap hiếm với HOSE — nhưng xác nhận qua 3 nguồn tin độc lập KQKD quý 2 giảm 94-95%, đối chiếu open_alerts). Rank |bullish-bearish|: VIX 0,7518 > PLX/BSR 0,6979 (BSR đã loại ở bước trước) > GAS 0,6946 > VPB 0,66 → cap 3 áp dụng trên tập đã lọc: VIX, PLX, GAS claimed; VPB loại do cap (rank 4).
- BCTC sống xác nhận trước khi claim: VPB/GAS/PLX/VIX đều "Chưa có dữ liệu" (absent, không dùng làm căn cứ, không phải corrupt).
- Thị trường (phiên 17/7, thứ Bảy đóng cửa): VN-Index 1.787,45 (-0,93%), độ rộng 91 tăng/212 giảm/55 đứng, thanh khoản HOSE 11.645 tỷ (-39,6%) — tiêu cực, dùng làm bối cảnh đối trọng cho claim VIX bearish.
- [Judgment call — như 07-13/07-17] GAS/PLX top fragment TRUSTED n=16 nhưng LR=0,16 literal cho probability<0,5 mâu thuẫn hướng bullish → dùng score trực tiếp (top_likelihood_ratio=1,0) nhất quán lịch sử; VIX n=0<10 mặc định LR=1,0 (không cần override).
- CLAIM-TRUTH GATE: không có Bash tool phiên này → cross-check thủ công claim_text VIX/PLX/GAS vs get_evidence_summary/get_roc_momentum/get_relative_strength/get_52w_proximity/get_bctc_full/get_market_snapshot/open_alerts sống, khớp 100% trước create_prediction_claim.
- dedup_gate daily: PASS — task_claim published:digest-daily:2026-07-18 (claimed=true, TTL 86400s).
- git commit SKIPPED — không có Bash/git tool phiên này (chỉ Read/Write/Edit/gateway); ghi notebook qua Write tool trực tiếp.

### Daily Predictions (dedup-blocked, re-fire) 2026-07-18 ~17:4X UTC

- Router spawned slot=digest-daily again (coordination_session=4e2956e8-35fc-4f7f-a2e0-611f269e0b03) same UTC calendar day, sau khi chu kỳ 17:35 UTC (session d0ec32a5-...) đã publish 3 claims (VIX/PLX/GAS id=14/15/16). Step pre-D dedup gate: task_claim(published:digest-daily:2026-07-18) → claimed:false, current_holder.owner_agent="digest-predict" nhưng owner_client_session KHÁC (peer session lần đầu, không phải cùng session như 07-17) — gate chặn đúng thiết kế theo NGÀY LỊCH bất kể session nào giữ.
- Không lặp lại P-0..P-8, không create_prediction_claim, không telegram, không signal thêm chu kỳ này. get_cycle_bootstrap + get_macro_snapshot đã gọi song song với task_claim trước khi biết kết quả gate (không gây side-effect, chỉ read-only).
- git commit SKIPPED — không có Bash/git tool phiên này (chỉ Read/Write/Edit/gateway).

## Cycle — 13:52 UTC (Weekly — Sunday digest)

- **cycle_date**: 2026-07-19
- **slot**: digest-sunday (cron 47 13 * * 0)
- **dedup_gate**: PASS — task_claim published:digest-sunday:2026-07-13/2026-07-19 (claimed=true, weekLabel=2026-W29, TTL 691200s)
- **regime**: NEUTRAL (fallback — schema JSON không có Global Liquidity). Carry UNKNOWN (input lãi suất suppressed theo DSI-INV-1) → coi NEUTRAL. US10Y/DXY: no field → fallback NEUTRAL/STABLE. Gold BULLISH $4.018,8. Oil nội bộ NEUTRAL $88,1 (biên $60-100) NHƯNG cảnh báo hệ thống CỰC ĐOAN +5,35σ/+20,08% tuần — lệch giữa ngưỡng tĩnh và biến động thực. USD/VND 26.110 BEARISH. Equity yield CHEAP (EY 8,2%, +3,2pp, không đổi so tuần trước). Investment-clock 8/10 CORE_VN.
- **week_performance**: 64 tin phân tích, 7 cảnh báo (1 critical: Brent), 35 báo cáo tài chính. Phiên gần nhất (17/7 Thứ Sáu): VN-Index 1.787,45 (-0,93%), độ rộng 91 tăng/212 giảm/55 đứng, thanh khoản HOSE 11.645 tỷ (-39,6%). Ngành giảm: Thép -2,54%, Dầu khí -1,75%, Hàng không -1,49%, BĐS -1,46%. [ANOMALY MỚI] get_market_summary(weekly)/get_sector_rotation(5d) trả "no price data"/N/A cho toàn bộ 32 mã dù get_market_snapshot(codes=...) trả giá đầy đủ đúng cùng lúc — đã báo BUG channel msg 3590.
- **market_hexagram**: Khiêm (15) — THUẬN LỢI nguyên lý, tín hiệu hiện tại TIÊU CỰC 64%. Hào: VN-Index 0,00 | USD/VND 0,00 | Dầu +1,00 | Vàng -1,00 | Ngoại tệ +0,03 | Vĩ mô -1,00.
- **portfolio_thesis (FPT)**: 5.000cp @ 80.300, giá 67.000 (giảm từ 70.600 tuần trước), lỗ -16,56% (-66.500.000 VNĐ) — nặng hơn tuần trước (-12,08%). Stop-loss 74.679 đã phá, giá càng rời xa. Conviction 0,48 MODERATE, khuyến nghị GIẢM BỚT (không đổi). Sector: PE 13,8 vs 17,3 (rẻ -20%), PB 3,6 vs 1,5 (đắt +136%), ROE 28,3% vs 10,6%. Không giao dịch nội bộ đáng chú ý. VaR95% -0,1% (-475.177 VNĐ), MaxDD -0,3%. Rebalancing: vẫn không có target allocation.
- **calibration**: SKIPPED per weekly.md — server calibrationReportJob gửi riêng 13:00 UTC.
- **signal_effectiveness**: alert_accuracy N=8 (<20, giảm từ N=16 tuần trước), scored 28%, hit8/miss0/unknown306 (tổng 314, tuần trước ~961 — cùng nhóm ANOMALY dữ liệu). signal_effectiveness(7d): không có dữ liệu. cascade_metrics: 0/12 rules evaluated (11 dead). hexagram_backtest(7d): chưa đủ lịch sử. transition_probabilities(hex=15 Khiêm): chưa đủ lịch sử. prediction_accuracy(7d): không có dữ liệu.
- **system_improvement**: (1) [MỚI] Nghi vấn dữ liệu lịch sử giá 5 ngày/tương quan bị thu hẹp đột ngột đa công cụ (correlation_matrix chỉ 2/33 mã, market_summary weekly toàn "no price data", alert_accuracy total ~314 vs ~961) — đã báo BUG msg 3590, cần dev-team xác minh pipeline OHLCV, KHÔNG tự chẩn đoán thêm. (2) BCTC: 6 mã low-confidence mới tuần này (KDH/D2D/CTG/NKG/DIG/SAB) theo mẫu OCR lỗi đã biết (VNM/VEA pattern). (3) 26/58 mã watchlist quá hạn nộp BCTC Q1/2026.
- **other_risk**: Crisis radar reputation<50: CHỈ DXG 35,0 WARNING (tuần trước 8 mã — cải thiện đáng kể). Legal: 1 tín hiệu PC1/Rox Energy disclosure_violation (ngoài watchlist). Climate: mùa nắng nóng, IDC/KBC/GEG/REE theo dõi rủi ro thiếu điện. Energy grid: bình thường (ước tính, không lấy được dữ liệu hồ chứa thực).
- **data_gaps**: get_macro_calendar unavailable (tier4, carry-over); get_policy_signals thiếu VIRA/VARA (T-23, carry-over); T-42 trade-fx-pressure-decomp không có tool riêng (carry-over); prediction_accuracy(7d) rỗng (carry-over từ 07-12); macro-health-read 6 track vẫn toàn is_estimate=true (thiếu PMI/IIP/CPI-components/liquidity-state tools).
- **actions**: task_claim dedup gate ✓ | log_agent_work id=1523 completed ✓ | send_telegram BUG (data-gap anomaly, msg 3590) ✓ | send_telegram MARKET ✓ | send_telegram WORK ✓ | notebook write ✓ | decision journal ✓ | git commit — no Bash/git tool this session (Read/Write/Edit/gateway only)
- **next_cycle_hint**: theo dõi liệu correlation_matrix/weekly-summary anomaly có tự phục hồi tuần tới hay không (nếu vẫn 2 mã → escalate mạnh hơn). FPT lỗ tiếp tục nặng thêm — theo dõi quyết định người dùng. 26/58 mã quá hạn BCTC vẫn tồn đọng.
- **carry_over**: FPT stop-loss breach nặng thêm; correlation/weekly-summary data anomaly (MỚI, theo dõi tuần tới); cascade rules 0 evaluated; kinh-dich backtest thiếu lịch sử; BCTC B02-TCTD nghẽn nhiều mã + 26/58 quá hạn; regime fallback NEUTRAL; macro_calendar unavailable dai dẳng; VIRA/VARA field gap dai dẳng
- **estimated_tokens**: 22000

### Daily Predictions (dedup-blocked, re-fire) 2026-07-19 ~17:36 UTC

- Router spawned slot=digest-daily (coordination_session=7361f6dd-30a1-4cb2-a4ff-2788afbd9ab9), mode=manual-spawn, cho ngày lịch 2026-07-19 (Chủ Nhật — cùng ngày đã chạy weekly digest-sunday 13:52 UTC; daily-predict là slot độc lập chạy 7/7 ngày theo capabilities, không xung đột). Step pre-D dedup gate: task_claim(published:digest-daily:2026-07-19) → claimed:false, current_holder.owner_agent="digest-predict", owner_client_session="d0ec32a5-5f74-4bc0-a076-10d925d061a5" (session KHÁC phiên này; claimed_at ~17:36:05 UTC — chỉ vài chục giây trước lần gọi này, TTL 86400s chưa hết hạn, expires_at=1784568965). Gate chặn đúng thiết kế mutex theo NGÀY LỊCH bất kể session nào giữ (tiền lệ 07-17/07-18) — không escalate.
- Không lặp lại P-0..P-8, không create_prediction_claim, không telegram, không signal thêm chu kỳ này. get_cycle_bootstrap + get_macro_snapshot đã gọi song song với task_claim trước khi biết kết quả gate (chỉ read-only, không side-effect).
- git commit SKIPPED — không có Bash/git tool phiên này (chỉ Read/Write/Edit/gateway).

### Daily Predictions (17:39 UTC) 2026-07-19

- Calibration: STABLE lần đầu tươi sau nhiều tuần (Brier 0,2135, N=6/90d, trend delta 0,000, report dated 2026-07-19 không còn 06-28) | Claims: 0 (NO-OP) | Dampening: không | Regime NEUTRAL fallback (macro_snapshot JSON thiếu field)
- dedup_gate daily: PASS — task_claim published:digest-daily:2026-07-19 (claimed=true, session d0ec32a5-..., TTL 86400s) — 1 peer session (7361f6dd) bị chặn đúng thiết kế ngay sau đó (xem entry trên).
- Watchlist 58/58 quét đủ. Qualify thô (>0,6): 9 mã — VEA 0,842 (stale 05-18, BCTC EBITDA phi lý carry-over), VIC 0,767 (stale 05-27), BSR 0,757 (stale 05-18, BCTC CORRUPT carry-over), GVR 0,757 (stale 05-27, BCTC Q1/2026 sạch confidence 80% passed_with_warnings ROE 3,9% — không khớp score cao), GAS 0,757 (ĐẢO NGƯỢC từ FRESH 07-18 TRUSTED → stale 05-27 hôm nay — mở rộng anomaly fragment-prune sang GAS lần đầu), MBB/VPB 0,75 (stale 06-30), POW 0,719 (stale 06-30), VHM 0,620 (stale 06-30, BCTC Q1/2026 CORRUPT total_assets=0 — mã mới xuất hiện qualify thô).
- TẤT CẢ 9 mã "(no fragments found)" — không mã nào đạt tiêu chí honest-gap (07-17: cần score_date tươi + fragment hiển thị nội dung thật) → SKIP toàn bộ 9/9 → NO-OP.
- BCTC xác nhận thêm (get_bctc_full): GVR Q1/2026 sạch nhưng fragment vắng mặt nên vẫn SKIP; VHM Q1/2026 CORRUPT (total_assets=0); VEA 2025-Q4 EBITDA vẫn phi lý scale (carry-over).
- alert-engine verified_decision signals (pipeline khác) bắn 17:30 hôm nay cho GAS/PLX/BSR confidence=75 — không dùng làm căn cứ claim vì get_evidence_summary riêng của digest-predict không xác nhận fragment thật cho các mã này.
- send_telegram WORK (NO-OP) ✓ | log_agent_work id=1526 completed ✓
- git commit SKIPPED — không có Bash/git tool phiên này (chỉ Read/Write/Edit/gateway); ghi notebook qua Edit tool trực tiếp.

### Daily Predictions (17:41 UTC) 2026-07-21

- Calibration: STABLE (Brier 0,2135, N=6/90d, trend delta 0,000, report vẫn dated 2026-07-19) | Claims: 1 (VIC p=0,71 5d bullish id=13) | Dampening: không | Regime NEUTRAL fallback (macro_snapshot JSON không có "Global Liquidity"); CARRY_REGIME NEUTRAL đọc trực tiếp carry.regime (1,37pp).
- dedup_gate daily: PASS — task_claim published:digest-daily:2026-07-21 (claimed=true, TTL 86400s). Router spawned trên main.md (slot=digest-daily, drift_min=6, tick-snapshot 17:38 dùng thay get_cycle_bootstrap độc lập).
- Watchlist 58/58 mã quét đủ. Thị trường phiên nay giảm mạnh toàn diện: VN-Index -0,74% (giảm ~13đ), BĐS giảm đồng loạt 9 mã (DIG -3,56%...VIC -1,23%), Dầu khí giảm SỐC (GAS -6,98%, BSR -6,49%, PLX -4,81%) dù Brent +2,34% — lệch hướng bất thường, Ngân hàng giảm đồng loạt nhẹ. Breadth xấu: ADL -316 (3 phiên), net new highs -26/58.
- Qualify thô (>0,6): 9 mã — GVR 0,7565 (stale 05-27, no fragments), MBB 0,75/VPB 0,75 (stale 06-30, no fragments), BSR 0,7569 (stale 05-18, fragment hiển thị nhưng bearish price_momentum mâu thuẫn hướng bullish tổng + UPCOM ngoài RS/momentum/52w), GAS 0,68 (FRESH 07-21, fragment TRUSTED thật hiển thị NHƯNG giá thực hôm nay -6,98% mâu thuẫn trực tiếp, RS composite chỉ NEUTRAL 51,85), VEA 0,842 (stale 05-18, no fragments, BCTC EBITDA phi lý carry-over), VIC 0,7122 (FRESH 07-21, 5 fragment TRUSTED thật, xác nhận tin tự doanh gom ròng phiên giảm sâu), HPG 0,636 bearish (FRESH 07-21 NHƯNG bearish gộp bị chi phối bởi 1 fragment UNTRUSTED n=0 duy nhất; fragment TRUSTED n=16 lại BULLISH; giá thực +0,97%; momentum NEUTRAL decile5; BCTC sentiment trend TĂNG — mâu thuẫn hướng rõ), POW 0,7185 (stale 06-30, no fragments).
- [MỚI 07-21] 2 trường hợp mới: (1) GAS — lần đầu fragment FRESH+TRUSTED hiển thị thật NHƯNG bị phủ quyết bởi biến động giá sống trong ngày mâu thuẫn trực tiếp (không phải do stale/no-fragments như các carry-over trước) — mở rộng honest-gap sang "live price contradiction" ngoài "stale/no-fragments/BCTC-corrupt". (2) HPG — bearish tổng bị 1 fragment UNTRUSTED n=0 lấn át fragment TRUSTED n=16 ngược hướng — áp dụng nguyên tắc ưu tiên TRUSTED + đối chiếu giá thực/momentum/BCTC sentiment trước khi claim.
- BCTC xác nhận trước khi claim: VIC Q1/2026 CORRUPT DATA (total_assets=0) — không dùng làm căn cứ, claim dựa tin tức+RS/momentum (đúng tiền lệ 07-12); GAS "Chưa có dữ liệu" (absent, không phải corrupt — không phải lý do SKIP); HPG BCTC sạch confidence 80%, sentiment trend TĂNG (mâu thuẫn thêm với bearish claim).
- VIC corroborate đa nguồn: RS composite 95,37 STRONG (h63/h126/h252 đều LEADING 91-97%ile), momentum decile10 LEADER (roc +83,48%, z=3,28 mạnh nhất watchlist), above MA50+MA200, cách đáy 52w +108,9%, tin tự doanh gom ròng (open_alerts 10:30) — 4 nguồn độc lập cùng chiều bullish dù index giảm sâu.
- CLAIM-TRUTH GATE: không có Bash tool phiên này (xác nhận qua tool-schema thực tế, không suy diễn từ carry-over — đúng nguyên tắc "PROBE, don't inherit") → cross-check thủ công claim_text VIC vs get_evidence_summary/get_relative_strength/get_roc_momentum/get_52w_proximity/get_bctc_full/open_alerts sống, khớp 100% trước create_prediction_claim. Không có claim absence-fabrication nào trong claim_text.
- send_telegram WORK ✓ | log_agent_work id=1568 completed ✓
- git commit: sẽ thử qua commit-mutex skill; nếu không có Bash/git tool → SKIPPED (ghi qua Edit tool trực tiếp, như các chu kỳ trước).

### Daily Predictions (dedup-blocked, re-fire) 2026-07-21 ~17:43 UTC

- Router spawned slot=digest-daily lần 2 (coordination_session=b2b99ded-b3cd-4f4b-bae6-87dc3c7d7162), task=digest-daily, cùng ngày lịch 2026-07-21 — race với phiên trên (session 9f4a6bfc-b001-4349-8a44-545f24c1b0ac) đã claim và hoàn tất chu kỳ ~17:41 UTC (VIC id=13). Step pre-D dedup gate: task_claim(published:digest-daily:2026-07-21) → claimed:false, current_holder.owner_agent="digest-predict", owner_client_session="9f4a6bfc-b001-4349-8a44-545f24c1b0ac" (claimed_at epoch 1784655560 ≈ 17:39 UTC, TTL 86400s, expires_at epoch 1784741960 ≈ 2026-07-22 17:39 UTC). Gate chặn đúng thiết kế mutex theo NGÀY LỊCH bất kể session nào giữ (tiền lệ 07-17/07-18/07-19, 4 lần liên tiếp) — không escalate, không phải bug.
- Không lặp lại P-0..P-8, không create_prediction_claim, không telegram, không signal thêm chu kỳ này. get_cycle_bootstrap + get_macro_snapshot đã gọi song song với task_claim trước khi biết kết quả gate (chỉ read-only, không side-effect) — dữ liệu khớp với entry phiên thắng ở trên (VN-Index 1.730,56, GAS/PLX/BSR giảm mạnh nhóm dầu khí, FPT -3,43%, 9 alert HIGH bất động sản).
- File notebook bị ghi đè giữa lần Read và lần Write đầu tiên của phiên này (lỗi "modified since read") — đã Read lại và append đúng sau entry của phiên thắng thay vì overwrite, tránh mất dữ liệu chu kỳ thành công vừa ghi.
- git commit SKIPPED — không có Bash/git tool phiên này (chỉ Read/Write/Edit/mcp__gateway__call_tool).
