# Phương pháp luận Trần Ngọc Báu (WiGroup)
# Top-Down Macro + Flow of Funds + Asset Valuation Framework

**Source:** Bàn Tròn Kinh Tế discussions — CEO WiGroup
**Document purpose:** Reference methodology for system implementation
**Last updated:** 2026-04-29

---

## Triết lý cốt lõi

> **"Top-down từ vĩ mô toàn cầu xuống tài sản cụ thể."**

Không phân tích cổ phiếu trước. Phân tích môi trường vĩ mô trước, sau đó mới xuống từng tài sản.

### Khung "Thiên thời — Địa lợi — Nhân hòa"

| Tầng | Ý nghĩa | Câu hỏi cần trả lời |
|------|---------|---------------------|
| **Thiên thời** | Vĩ mô toàn cầu | Fed đang ở đâu trong chu kỳ? DXY đang tăng hay giảm? Thanh khoản toàn cầu co hay nở? |
| **Địa lợi** | Nội tại quốc gia | Việt Nam đang ưu tiên tăng trưởng hay ổn định tỷ giá? Tài sản nào hưởng lợi từ chính sách hiện tại? |
| **Nhân hòa** | Điểm rơi hành động | Thời điểm "vàng" để vào lệnh — khi cả 3 tầng cùng thuận chiều |

**Nguyên tắc:** Đi ngược "Thiên thời" là đặt mình vào thế bất lợi. Ví dụ: mua cổ phiếu khi lãi suất đang tăng mạnh toàn cầu.

---

## Cascade Top-Down (5 bước)

```
[1] Vĩ mô toàn cầu
    Fed Funds Rate → DXY → US 10Y Yield → Global risk appetite
         ↓
[2] Vĩ mô trong nước
    CPI Việt Nam vs target → GDP thực chất → PMI sản xuất
         ↓
[3] Thanh khoản hệ thống ngân hàng
    OMO (SBV bơm/hút tiền) → Lãi suất liên ngân hàng → Trạng thái ngoại tệ NHTM
         ↓
[4] Chọn loại tài sản
    Cổ phiếu vs Trái phiếu vs Bất động sản vs Vàng/Crypto
         ↓
[5] Chọn ngành + cổ phiếu
    Ngành nào hưởng lợi từ môi trường lãi suất/tỷ giá hiện tại?
    Doanh nghiệp nào có fundamental tốt trong ngành đó?
```

---

## Trụ cột 1 — Phân tích Dòng tiền Liên ngân hàng (Interbank Flow)

### 1.1 Chênh lệch lãi suất VND/USD (Carry Trade Signal)

- **Công thức:** Carry Spread = VND Deposit Rate − USD Fed Funds Rate
- **Ý nghĩa:**
  - Carry dương cao → hot money chảy vào Việt Nam để hưởng lãi suất chênh lệch
  - Carry âm / thu hẹp mạnh → áp lực tỷ giá, nguy cơ FII rút vốn đột ngột
- **Dữ liệu cần:** SBV refi rate (có) + US Fed Funds Rate (FRED API, miễn phí)
- **Cảnh báo:** Carry trade tạo "hot money" — vào nhanh, rút nhanh khi môi trường thay đổi

### 1.2 OMO và Tín phiếu (Open Market Operations)

- **SBV bơm tiền (reverse repo):** Hệ thống đang thiếu thanh khoản → lãi suất ngắn hạn có thể tăng
- **SBV hút tiền (T-Bill issuance):** Hệ thống thừa tiền → SBV hút bớt để kiểm soát lạm phát/tỷ giá
- **Net OMO position hàng tuần** là chỉ báo sớm cho xu hướng lãi suất huy động 1-2 tháng tới
- **Nguồn dữ liệu:** `sbv.gov.vn` — bảng HTML công bố hàng tuần

### 1.3 Trạng thái ngoại tệ ngân hàng thương mại (Net Open Position)

- **Quy tắc:** NHTM không được giữ trạng thái ngoại tệ ròng vượt 20% vốn tự có
- **Tín hiệu:**
  - NOP tiếp cận giới hạn 20% (đang "găm" USD) → SBV sắp phải bán ngoại tệ can thiệp
  - NOP giảm mạnh (bán USD ra) → NHTM dự đoán VND tăng hoặc cần thanh khoản VND
- **Ứng dụng:** Dự báo thời điểm SBV can thiệp tỷ giá TRƯỚC KHI xảy ra

### 1.4 Số dư tiền gửi tại SBV (Excess Reserves)

- **Ý nghĩa:** Tiền nhàn rỗi của NHTM gửi tại SBV
- **Cao → tốt gỗ cho lãi suất huy động giảm:** Ngân hàng thừa tiền, không cần huy động thêm từ dân
- **Leading indicator:** Dự báo lãi suất huy động dân cư 1-2 tháng tới
- **Nguồn:** SBV báo cáo định kỳ (khó tự động hóa — cần news NLP extraction)

---

## Trụ cột 2 — Mô hình "Tốt Gỗ" vs "Tốt Nước Sơn"

### Phân loại yếu tố hấp dẫn vốn ngoại

| Loại | Yếu tố | Đặc điểm |
|------|--------|-----------|
| **Tốt Nước Sơn** (bề nổi) | Tỷ giá ổn định, lãi suất cao (swap dương), nâng hạng chứng khoán, ưu đãi thuế | Có thể "làm đẹp" nhanh. Thu hút hot money — vào nhanh rút nhanh |
| **Tốt Gỗ** (nội tại bền vững) | Sức khỏe doanh nghiệp, GDP thực chất, hạ tầng, pháp lý minh bạch | Xây dựng lâu dài. Thu hút FDI/FII chiến lược — ở lại dài hạn |

### Ứng dụng phân tích

**Chẩn đoán Việt Nam hiện tại:**
- Đang ưu tiên "Nước Sơn": ổn định tỷ giá + nâng hạng thị trường → hút hot money ngắn hạn
- Rủi ro: Nếu "Gỗ" (nội tại) chưa cải thiện → dòng vốn đảo chiều khi sentiment toàn cầu xấu

**Phân loại dòng vốn FII:**
- Vào theo swap dương + momentum → Hot money (rủi ro cao khi carry thu hẹp)
- Vào theo fundamental doanh nghiệp + dài hạn → Structural capital (ổn định)

---

## Trụ cột 3 — Phân tích Chu kỳ Vĩ mô và GDP

### 3.1 Seasonal Adjustment (Điều chỉnh Mùa vụ)

- **Sai lầm phổ biến:** So sánh GDP Q1 với Q4 → Q1 thường thấp hơn vì mùa vụ
- **Phương pháp đúng:** So GDP Q1 năm nay với TRUNG BÌNH GDP Q1 các năm trước
- **Ứng dụng:** Phát hiện "vượt trội thực chất" hay chỉ là bình thường theo mùa
- **Formula:** `Deviation = (Q1_current / avg(Q1_historical)) - 1`

### 3.2 PMI như Leading Indicator

- **Vietnam Manufacturing PMI** (S&P Global, công bố đầu tháng)
- PMI > 50: Khu vực sản xuất mở rộng → GDP quý tới tích cực
- PMI < 50 hai tháng liên tiếp: Cảnh báo GDP yếu TRƯỚC khi số liệu chính thức ra
- **Lead time:** ~6-8 tuần trước GDP chính thức

### 3.3 CPI Target Tracking và SBV Pivot Timing

- **Mục tiêu SBV:** CPI ≤ 4.5%
- **Khi CPI → 4%:** Xác suất thắt chặt chính sách tăng → trái phiếu/cổ phiếu chịu áp lực
- **Khi CPI < 3%:** SBV có dư địa cắt giảm → hỗ trợ định giá tài sản
- **Pivot windows:** Các tháng công bố dữ liệu GSO = 3, 6, 9, 12 → xem xét policy shift

### 3.4 Macro Data Release Calendar

| Chỉ số | Tần suất | Thời điểm công bố | Nguồn |
|--------|----------|-------------------|-------|
| CPI | Hàng tháng | Tuần đầu tháng sau | GSO (gso.gov.vn) |
| GDP | Hàng quý | ~Ngày 15 tháng sau Q | GSO |
| Industrial Production | Hàng tháng | Tuần đầu tháng sau | GSO |
| PMI Manufacturing | Hàng tháng | Ngày 2-3 đầu tháng | S&P Global |
| Retail Sales | Hàng tháng | Tuần đầu tháng sau | GSO |

---

## Trụ cột 4 — Phân tích Liên thị trường (Inter-market Analysis)

### 4.1 Bản đồ nhân quả toàn cầu → Việt Nam

```
Fed Funds Rate ──────────────────────┐
                                     ↓
DXY (USD Index) ──→ VND/USD pressure ──→ SBV intervention cost
                                     ↓
US 10Y Yield ────────────────────────┤
                                     ↓
                              EM capital flows
                                     ↓
                         Vietnam FII net inflow/outflow
                                     ↓
                              VN equity market
```

### 4.2 DXY — Kim chỉ nam áp lực tỷ giá

- **DXY tăng mạnh (> +2% trong 1 tháng):** USD mạnh → VND yếu → áp lực tỷ giá → SBV phải dùng dự trữ ngoại hối → thắt chặt VND thanh khoản
- **DXY giảm:** Môi trường tốt cho EM assets, VND ổn định, FII vào tích cực

### 4.3 US 10Y Yield — Barometer rủi ro toàn cầu

- **Yield tăng (> 4.5%):** Risk-off toàn cầu, FII rút khỏi EM bao gồm Việt Nam, discount rate tăng → PE compression
- **Yield giảm (< 4%):** Risk-on, dòng tiền tìm EM yield → VN hưởng lợi
- **Spread: VN earning yield vs US 10Y** = Premium đầu tư VN equity. Spread thu hẹp → VN kém hấp dẫn

### 4.4 Hàng hóa → CPI → Chính sách tiền tệ

| Hàng hóa | Tác động VN | Kênh truyền dẫn |
|----------|-------------|-----------------|
| Dầu Brent tăng | Lạm phát tăng | Chi phí vận tải + điện → CPI → SBV thắt chặt |
| Vàng tăng mạnh | Tín hiệu liquidity surge | Tiền nhàn rỗi dân cư đổ vào vàng → thoát khỏi VND asset |
| Giá thép/đồng | Tác động ngành | Đầu vào sản xuất → ảnh hưởng biên lợi nhuận công ty |

---

## Trụ cột 5 — Định giá Tài sản (Asset Valuation)

### 5.1 Earning Yield vs Lãi suất huy động

- **Earning Yield = 1 / P/E thị trường**
- **Cổ phiếu rẻ khi:** Earning Yield > Lãi suất huy động (tiết kiệm không cạnh tranh được)
- **Cổ phiếu đắt / áp lực giảm khi:** Lãi suất huy động tăng gần hoặc vượt Earning Yield
- **Ứng dụng:** Tính P/E bình quân VN-Index → so sánh với lãi suất kỳ hạn 12 tháng

**Ví dụ thực tế:**
```
VN-Index P/E = 12x → Earning Yield = 8.3%
SBV Deposit Rate 12M = 5.5%
→ Spread = +2.8% → Cổ phiếu còn hấp dẫn

Nếu Deposit Rate tăng lên 7%:
→ Spread = +1.3% → Cổ phiếu kém hấp dẫn hơn, áp lực định giá
```

### 5.2 G-Bond Yield vs Equity Earning Yield (Yield Spread)

- **G-Bond 10Y yield > Earning Yield:** Trái phiếu chính phủ an toàn hơn MÀ lợi suất cao hơn → dòng tiền rời equities sang bonds
- **Đây là chỉ báo chuyển chế độ (regime change signal)**

### 5.3 Crypto và Vàng như Barometer Tâm lý Đầu cơ

- Không đầu tư crypto/vàng trực tiếp nhưng dùng như tín hiệu
- **Gold run-up mạnh:** Dân cư đang tìm nơi trú ẩn → VND liquidity seeking safe haven → thường xảy ra khi niềm tin vào VND tài sản giảm
- **Crypto pump mạnh:** Dấu hiệu thanh khoản dư thừa trong hệ thống → surplus money looking for returns → thường xuất hiện TRƯỚC khi thị trường chứng khoán pump
- **Lead indicator:** Crypto thường đi trước 2-4 tuần so với chứng khoán VN

---

## Trụ cột 6 — Phân tích Chính sách (Policy Analysis)

### 6.1 Đọc vị ưu tiên chính sách: Tăng trưởng vs Ổn định tỷ giá

Tại mỗi thời điểm, Chính phủ/SBV chỉ có thể ưu tiên MỘT trong hai:

| Chế độ | Dấu hiệu nhận biết | Tác động tài sản |
|--------|-------------------|------------------|
| **Ưu tiên Tăng trưởng** | Cắt giảm lãi suất, nới tín dụng, bơm OMO, chấp nhận VND yếu hơn | Tích cực cho cổ phiếu, bất động sản. Tiêu cực cho VND/trái phiếu |
| **Ưu tiên Ổn định tỷ giá** | Giữ/tăng lãi suất, hút OMO, bán ngoại tệ can thiệp | Tích cực cho VND, trái phiếu. Tiêu cực cho định giá cổ phiếu |

**Conflict point:** Việt Nam không thể vừa tăng trưởng mạnh, vừa giữ tỷ giá ổn định, vừa kiểm soát lạm phát đồng thời — "Impossible Trinity" adapted.

### 6.2 Tác động Luật pháp đến Dòng vốn ngành

| Luật / Chính sách | Ngành bị ảnh hưởng | Hướng dòng vốn |
|-------------------|-------------------|----------------|
| Luật Đất đai (sửa đổi) | Bất động sản, Ngân hàng | Tùy điều khoản định giá đất, siết/nới tín dụng BĐS |
| Luật Các TCTD (sửa đổi) | Ngân hàng | Tỷ lệ an toàn vốn, room tín dụng, sở hữu chéo |
| Nghị định room ngoại | Ngân hàng, Bán lẻ | Nới room → FII inflow trực tiếp vào cổ phiếu |
| Chính sách xuất khẩu | Dệt may, Thủy sản, Thép | Thuế quan, hạn ngạch |

### 6.3 Pivot Timing — Các Tháng Quan Sát Chính sách

Tháng **3, 6, 9, 12** = kỳ công bố dữ liệu vĩ mô GSO + họp chính sách → xác suất pivot cao nhất

**Framework dự báo pivot:**
```
CPI tháng 3 → SBV họp tháng 4 → xem xét điều chỉnh lãi suất
CPI tháng 6 → SBV họp tháng 7 → mid-year review
CPI tháng 9 → SBV họp tháng 10 → Q3 assessment
CPI tháng 12 → SBV họp tháng 1 năm sau → year-end review
```

---

## Mô hình Phân loại Vốn Ngoại (FII Capital Classification)

### Hot Money (Tiền nóng) — Rủi ro cao

**Đặc điểm:**
- Vào theo carry trade (swap dương)
- Vào theo momentum / nâng hạng kỳ vọng
- Holding period ngắn (< 6 tháng)
- Rất nhạy cảm với biến động DXY và US yield

**Tín hiệu nhận biết:**
- FII inflow tăng đột biến khi VND/USD carry spread tăng
- Inflow tập trung vào liquid large-cap (dễ thoát)
- Flow velocity cao (mua rồi bán trong tuần)

### Structural Capital (Vốn chiến lược) — Ổn định

**Đặc điểm:**
- Vào theo fundamental doanh nghiệp
- FDI hoặc FII dài hạn (ETF rebalancing, sovereign wealth funds)
- Ít nhạy cảm với biến động ngắn hạn

**Tín hiệu nhận biết:**
- Inflow ổn định, ít biến động theo tuần
- Tập trung vào cổ phiếu có BCTC mạnh
- Không đảo chiều đột ngột khi carry thay đổi nhỏ

---

## Ứng dụng Thực chiến — Checklist Phân tích

### Trước khi đưa ra bất kỳ khuyến nghị nào, phải trả lời đủ 5 câu hỏi:

```
□ 1. THIÊN THỜI: Fed đang ở đâu? DXY trend? US 10Y level?
     → Global liquidity: EXPANSIVE / NEUTRAL / TIGHTENING

□ 2. ĐỊA LỢI: VN CPI vs target? OMO net position? Carry spread?
     → VN regime: GROWTH PRIORITY / FX STABILITY PRIORITY

□ 3. THANH KHOẢN: Interbank rate? Bank NOP? Excess reserves?
     → Banking liquidity: AMPLE / NEUTRAL / TIGHT

□ 4. ĐỊNH GIÁ: VN Earning Yield vs deposit rate? G-Bond yield?
     → Equity: CHEAP / FAIRLY VALUED / EXPENSIVE vs risk-free

□ 5. NHÂN HÒA: Có catalyst policy trong 1-2 tháng tới không?
     → Action timing: ENTER / HOLD / REDUCE / AVOID
```

Chỉ khi 3/5 yếu tố thuận chiều mới có conviction cao để hành động.

---

## Lưu ý Quan trọng về Dữ liệu

### Dữ liệu ưu tiên theo độ tin cậy

| Loại | Nguồn | Độ trễ | Ghi chú |
|------|-------|--------|---------|
| Interbank rate (thực tế) | Vietstock (requires login) | Hàng ngày | Khác với SBV policy rate |
| OMO operations | sbv.gov.vn | Hàng tuần | HTML table, có thể scrape |
| G-Bond yields | hnx.vn | Hàng ngày | Public data |
| CPI / GDP | gso.gov.vn | Hàng tháng/quý | HTML tables |
| PMI Manufacturing | S&P Global → news | Đầu tháng | Headline free, detail paid |
| DXY | Yahoo Finance (DX-Y.NYB) | Real-time | Không bị geo-block |
| US 10Y Yield | Yahoo Finance (^TNX) | Real-time | Không bị geo-block |
| Fed Funds Rate | FRED API (fred.stlouisfed.org) | Daily | Free API, no auth |
| Bank NOP | SBV press releases | Không đều | NLP extraction needed |

### Thứ tự ưu tiên thực hiện

| # | Data | Status | Notes |
|---|------|--------|-------|
| 1 | DXY + US10Y | ✅ DONE (Sprint 1423a) | Yahoo Finance fetcher |
| 2 | Fed Funds Rate | ✅ DONE (Sprint 1423b) | FRED API |
| 3 | Carry Trade Signal | ✅ DONE (Sprint 1423c) | `carryTradeSignal.ts` |
| 4 | `get_macro_snapshot` Thien Thoi block | ✅ DONE (Sprint 1423d/f) | REGIME extracted by all agents |
| 5 | Macro Calendar | ✅ DONE (Sprint 1423e) | `get_macro_calendar()` MCP tool |
| 6 | G-Bond Yields | ⏳ PENDING | HNX scrape via VPS — `get_bond_maturity_calendar()` may have partial data |
| 7 | OMO Tracker | ⏳ PENDING | sbv.gov.vn HTML table scrape via VPS |
| 8 | GSO Indicators (CPI/GDP raw) | ⏳ PENDING | gso.gov.vn scrape via VPS (monthly) |
| 9 | Interbank Rate | ⏳ PENDING | Vietstock — Playwright bot-guard, hardest |

### Agent Flow Implementation Status (2026-04-29)

| Flow | Pillar 1 (Carry) | Pillar 2 (FII type) | Pillar 3 (Seasonal/PMI) | Pillar 4 (DXY/US10Y) | Pillar 5 (EY/GBond) | Pillar 6 (Policy) |
|------|-----------------|---------------------|-------------------------|-----------------------|---------------------|-------------------|
| news-scout | ✅ | — | ✅ PMI detection | ✅ | — | — |
| financial-analyst | ✅ | — | — | ✅ | ✅ EY + GBond fallback | — |
| market-watcher | ✅ | — | — | ✅ adaptive thresholds | — | — |
| alert-commander | ✅ | — | — | ✅ | — | ✅ pivot window |
| report-analyzer | — | — | ✅ seasonal note | — | — | — |
| digest-predict/daily | ✅ | — | — | ✅ | ✅ Nhân Hòa EY | ✅ |
| digest-predict/monday | ✅ dampening | — | — | — | — | — |
| digest-predict/weekly | ✅ | — | — | ✅ | ✅ | ✅ |
| digest-predict/monthly | ✅ | — | — | ✅ | ✅ | ✅ VN policy mode |
| unified-agent | ✅ | ✅ FII type | — | ✅ | — | ✅ REGIME_TRANSITION |
| market-analyst | ✅ | — | — | ✅ | ✅ EY gate | ✅ |

---

*Document dựa trên: Bàn Tròn Kinh Tế sessions — Trần Ngọc Báu, CEO WiGroup*
*Compiled for VN Market Intelligence MCP system implementation*
*Last synced with agent flows: 2026-04-29*
