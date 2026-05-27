---
tool: get_public_investment_signals
category: sector
agents: [cowork, market-analyst]
---

# `get_public_investment_signals`

**Category:** Sector | **Used by:** cowork, market-analyst

Lấy danh sách kết quả chọn nhà thầu mới nhất từ muasamcong.mpi.gov.vn và ánh xạ sang cổ phiếu liên quan.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `category` | enum | No | all | Danh mục dự án (all, infrastructure, energy, healthcare, education) |
| `minValue` | number | No | 0 | Giá trị tối thiểu hợp đồng (tỷ VNĐ) |
| `days` | number | No | 7 | Thời gian quay lại (ngày) |

## Returns

Plain-text Vietnamese report showing:
- Recent public procurement winners
- Project values and categories
- Estimated stock beneficiaries
- Revenue impact projections
- Contract timeline
- Competitive wins/losses

## Output Example

```
=== TÍN HIỆU ĐẦU TƯ CÔNG ===
Thời gian: 7 ngày qua

--- HẠNG MỤC: CƠ SỞ HẠ TẦNG ---

1. Dự án: Cao tốc Nha Trang - Cam Ranh (100 km)
   Giá trị: 45.500 tỷ VNĐ
   Nhà thầu chính: Tập đoàn XLC (Tổng công ty Xây lắp)
   Ngành con: Thi công, Thiết kế
   Cổ phiếu liên quan: XLC [+3.2% dự báo], HAT, BCI
   Thời gian: 2026-05 đến 2028-12
   Tác động: HAT (bê tông) +120 tỷ VNĐ doanh thu, XLC +280 tỷ
   Độ tin cậy: 95%

2. Dự án: Cầu Rạch Miễu II (Tiền Giang - Bến Tre)
   Giá trị: 28.300 tỷ VNĐ
   Nhà thầu chính: FECON
   Cổ phiếu liên quan: FCN [+2.1% dự báo], CTD, HAT
   Thời gian: 2026-06 đến 2028-10
   Tác động: FCN +180 tỷ VNĐ, CTD (thép) +45 tỷ
   Độ tin cậy: 94%

--- HẠNG MỤC: NĂNG LƯỢNG ---

3. Dự án: Nhà máy năng lượng tái tạo Cà Mau (500 MW)
   Giá trị: 12.000 tỷ VNĐ
   Nhà thầu chính: GEG
   Cổ phiếu liên quan: GEG [+5.1% dự báo], REE, QTP
   Thời gian: 2026-07 đến 2029-06
   Tác động: GEG +150 tỷ VNĐ doanh thu mỗi năm
   Độ tin cậy: 89%

--- HỌC VỤ ---

4. Dự án: Xây dựng 50 trường học tại ĐBSH (giai đoạn 1)
   Giá trị: 5.200 tỷ VNĐ
   Nhà thầu chính: HAT, Hội Từ Thiện
   Cổ phiếu liên quan: HAT [+1.3% dự báo], CTD
   Thời gian: 2026-06 đến 2027-06
   Tác động: HAT +30 tỷ VNĐ
   Độ tin cậy: 88%

TỔNG KẾT:
  Tổng giá trị: 91.000 tỷ VNĐ (7 ngày qua)
  Top beneficiary: HAT (3 dự án, +195 tỷ doanh thu)
  Lợi nhuận dự báo tăng: FCN +2.1%, XLC +1.8%, GEG +1.5%

KHUYẾN CÁO: HAT là lợi thế lớn nhất từ hạng mục cơ sở hạ tầng
```

## Usage

```json
{
  "tool_name": "get_public_investment_signals",
  "input": {
    "category": "infrastructure",
    "minValue": 5,
    "days": 30
  }
}
```

## Data Sources

- `muasamcong.mpi.gov.vn` — Vietnamese government procurement portal
- `public_contracts` table — parsed winning bids
- Stock-contract mapping — manual/ML mapping of contractors to watchlist codes
- Project cash flow schedule — estimated drawdown timeline

## Related Tools

- `get_sector_comparison` — benchmark beneficiary stocks
- `get_ticker_intelligence` — detailed company impact analysis
- `sequential_market_analysis` — causal chain from project to stock returns

---

## Implementation Notes

- **Data freshness:** Fetched daily from muasamcong.mpi.gov.vn
- **Contractor mapping:** Uses company name / tax ID matching to watchlist
- **Revenue impact:** Estimated using contract value, typical margin (15-25%), timing
- **Confidence scoring:** Higher for larger, government-named contracts; lower for subcontractors
- **Competitive tracking:** Shows if firm won/lost vs competitors

## Project Categories

| Category | Key Sectors | Typical Value (tỷ VNĐ) |
|----------|------------|----------------------|
| Infrastructure | XLC, CTD, HAT, FCN | 20-80 |
| Energy | GEG, REE, QTP | 10-50 |
| Healthcare | KBC, PIV | 5-20 |
| Education | HAT, CTD | 2-10 |
| Transportation | BCI, QTP | 10-40 |

## Vietnamese Notes

- **Mua sắm công** = Public procurement
- **Nhà thầu** = Contractor
- **Giá trị hợp đồng** = Contract value
- **Thời gian thực hiện** = Implementation period
- **Tác động doanh thu** = Revenue impact
