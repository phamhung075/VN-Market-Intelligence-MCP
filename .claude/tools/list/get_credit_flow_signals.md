---
tool: get_credit_flow_signals
category: sector
agents: [cowork, market-analyst]
---

# `get_credit_flow_signals`

**Category:** Sector | **Used by:** cowork, market-analyst

Phân tích thay đổi tín dụng bất động sản của NHNN và tạo tín hiệu thị trường cho cổ phiếu ngân hàng và BDS. Tất cả tham số đều tùy chọn — nếu không cung cấp, công cụ tự đọc lãi suất tái cấp từ DB SBV và dùng giá trị mặc định cho dư nợ tín dụng.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `currentReCreditTrillion` | number | No | auto-fetch | Real estate credit outstanding (trillion VND). Auto-fetch from SBV if omitted. |
| `priorReCreditTrillion` | number | No | prior month | Prior month real estate credit (trillion). Default: previous month from DB. |
| `rateReCreditPercent` | number | No | auto-fetch | Re-credit interest rate (%). Auto-fetch from SBV if omitted. |
| `rateInterBankPercent` | number | No | auto-fetch | Interbank rate (%). Auto-fetch from Bloomberg if omitted. |

## Returns

Plain-text Vietnamese report showing:
- Real estate credit flows (month-on-month, YoY)
- Central bank re-credit rate and signals
- Impact on banking stocks (capital costs, NIM)
- Impact on real estate developer stocks (financing availability)
- Money supply signals
- Market sentiment classification (bullish/bearish/neutral)

## Output Example

```
=== TÍN HIỆU DÒNG TÍN DỤNG BẤT ĐỘNG SẢN ===
Cập nhật: 2026-05-05

TÌNH TRẠNG DÒNG TIỀN BẤT ĐỘNG SẢN:

Dư nợ tín dụng BĐS: 1.245 tỷ VNĐ
  Tháng trước: 1.192 tỷ VNĐ
  Thay đổi: +53 tỷ VNĐ (+4.4% so tháng trước)
  YoY: 1.052 tỷ VNĐ (+18.3% so năm trước)

PHÂN TÍCH:

Lãi suất tái cấp NHNN: 4.50% (giữ nguyên)
  Trước: 4.50% (kỳ trước: 4.75%)
  Xu hướng: NHNN sẽ duy trì lãi suất 4.50% cho đến Q3

Lãi suất liên ngân hàng: 3.80% (tăng 15bp từ tuần trước)
  Ý nghĩa: Thanh khoản thị trường siết chặt (cảnh báo)
  Tác động: Ngân hàng sẽ tăng lãi suất cho vay BĐS 10-20bp

TĂNG TRƯỞNG TÍN DỤNG BĐS:

Q1 2026: +4.2% (chậm)
Q2 2026 dự báo: +3.8% (dự báo từ NHNN)

So sánh:
  Tín dụng BĐS Q1 2025: +2.8%
  Tín dụng BĐS Q1 2024: +1.5%

Kết luận: Tăng trưởng chậm hơn dự kiến — doanh nghiệp chưa mạnh dạn vay

TÁC ĐỘNG CỔ PHIẾU:

--- NGÂN HÀNG ---

VCB [TRUNG LẬP → GIẢM] Margin kép áp lực:
  (1) Lãi suất liên ngân hàng tăng → chi phí vốn tăng
  (2) Tăng trưởng tín dụng chậm → doanh số tăng thấp
  Tác động NIM: Dự báo giảm 20-30bp năm 2026
  Tác động EPS: Giảm 3-5%
  Khuyến cáo: GIẢM (từ GIỮ)

ACB [GIẢM]:
  Margin rủi ro cao hơn VCB (danh mục BĐS lớn)
  Tác động: Dự báo giảm 4-6% nếu liên ngân hàng tiếp tục tăng
  Khuyến cáo: BÁN

BID [TRUNG LẬP]:
  Danh mục BĐS nhỏ hơn (chủ yếu doanh nghiệp)
  Tác động: Margin ổn định ±2%
  Khuyến cáo: GIỮ

--- BẤT ĐỘNG SẢN ---

VNR [TĂNG] Tín dụng tăng 4.4% là tín hiệu tích cực:
  Doanh đạo chủ đầu tư có vốn mới
  Tác động: Doanh số kỳ vọng +6-8% trong 6 tháng
  Khuyến cáo: MUA (từ GIỮ)

DIG [TĂNG]:
  Cấp vốn cho dự án đang triển khai
  Tác động: Tiến độ dự án tốt → tăng doanh số
  Khuyến cáo: MUA

NVL [TRUNG LẬP]:
  Tín dụng BĐS tăng chậm — rủi ro dòng tiền
  Tác động: Kỳ vọng giữ nguyên EPS, rủi ro hạ lệnh Q3
  Khuyến cáo: GIỮ (rủi ro)

TỔNG KẾT:

Dòng tiền BĐS: PHỤC HỒI CHẬM (tín dụng tăng nhưng thấp hơn kỳ vọng)

Impact:
  Ngân hàng: NEGATIF (margin áp lực, tăng trưởng chậm)
  BĐS: TÍCH CỰC (tín dụng khả dụng, doanh số tăng)

Khuyến cáo chiến lược:
  - TĂNG BĐS (VNR, DIG) — tín dụng sẽ duy trì 4%+
  - GIẢM NIM-ngân hàng (VCB, ACB) — margin khó phục hồi nhanh
  - GIỮ ngân hàng bảo thủ (BID, BIDV) — ổn định
```

## Usage

```json
{
  "tool_name": "get_credit_flow_signals",
  "input": {
    "currentReCreditTrillion": 1.245,
    "rateReCreditPercent": 4.50
  }
}
```

## Data Sources

- `tracked_indicators` — real estate credit outstanding, re-credit rate
- `sbv_macroeconomics` table — NHNN rate history, credit growth forecasts
- Bloomberg/Reuters — interbank rate, USD/VND carry cost
- BCTC quarterly — banking NIM compression signals

## Related Tools

- `get_bctc_full` — detailed bank profitability by NIM component
- `compare_stocks` — VCB vs ACB vs BID comparison during tightening
- `analyze` — causal chain from credit policy to stock returns

---

## Implementation Notes

- **Auto-fetch logic:** Reads SBV database if parameters omitted
- **Credit growth calculation:** (Current - Prior) / Prior × 100%
- **NIM impact estimation:** Based on historical correlation (credit growth × -0.3pp per 1% growth decline)
- **Confidence scoring:** 85%+ (macro data is official); lower for real estate submarket forecast
- **Update frequency:** Monthly (SBV data), weekly (interbank rates)

## Banking Stock Sensitivity

| Stock | Re-Credit Sensitivity | Policy Rate Sensitivity |
|-------|----------------------|------------------------|
| VCB | High (NIM exposure) | Medium |
| ACB | Very High (25% BĐS portfolio) | High |
| BID | Medium (10% BĐS portfolio) | Low |
| CTG | Low (enterprise focus) | Low |

## Vietnamese Notes

- **Tín dụng bất động sản** = Real estate credit
- **Lãi suất tái cấp** = Re-credit rate (NHNN's lending rate to banks)
- **Dư nợ** = Credit outstanding
- **Dòng tiền** = Cash flow / credit flow
- **NIM** = Lợi nhuận ròng từ lãi suất (Net Interest Margin)
- **Cấp vốn** = Capital provision / financing
