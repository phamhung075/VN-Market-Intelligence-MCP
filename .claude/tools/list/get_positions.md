---
tool: get_positions
category: portfolio
agents: [cowork, market-analyst]
---

# `get_positions`

**Category:** Portfolio | **Used by:** cowork, market-analyst

List all open stock positions with live P&L computed from latest market prices. Displays cost basis, current value, unrealized profit/loss (amount and %) for each position, plus aggregate totals. Prices from the market_prices table (updated by the intelligence cycle).

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| — | — | — | — | No parameters |

## Returns

Plain-text report showing:
- All open positions (stocks held)
- Quantity and average cost per position
- Current price from market_prices
- Unrealized gain/loss (amount and %)
- Portfolio total value and aggregate P&L
- Position-level details (entry date, size, performance)

## Output Example

```
=== VỊ TRÍ HIỆN TẠI (OPEN POSITIONS) ===
Cập nhật: 2026-05-05 14:30:00 GMT+7

─────────────────────────────────────────────────────────────
Mã      Số lượng  Giá nhập  Giá hiện  Giá trị        P&L        % Lợi
─────────────────────────────────────────────────────────────
VCB     1.000     32.000   32.400    32.400 tỷ      +400 tỷ     +1.3%
HPG     500       52.000   53.100    26.550 tỷ      +550 tỷ     +2.1%
VNM     800       87.500   88.200    70.560 tỷ      +560 tỷ     +0.8%
FPT     300       65.000   66.500    19.950 tỷ      +450 tỷ     +2.3%
CTG     600       21.500   21.800    13.080 tỷ      +180 tỷ     +1.4%
─────────────────────────────────────────────────────────────
TỔNG              —        —         162.540 tỷ    +2.140 tỷ    +1.3%

CHI TIẾT VỊ TRÍ:

1. VCB - Ngân hàng Thương mại Cổ phần Việt Nam
   Số lượng: 1.000 cổ phiếu
   Giá nhập: 32.000 VNĐ/cổ
   Ngày mua: 2026-03-15
   Giá hiện tại: 32.400 VNĐ/cổ
   Giá trị hiện tại: 32.400 tỷ VNĐ
   Lợi nhuận chưa thực hiện: +400 triệu VNĐ (+1.3%)
   Xếp hạng: 20% danh mục

2. HPG - Tập đoàn Posco Việt Nam
   Số lượng: 500 cổ phiếu
   Giá nhập: 52.000 VNĐ/cổ
   Ngày mua: 2026-02-10
   Giá hiện tại: 53.100 VNĐ/cổ
   Giá trị hiện tại: 26.550 tỷ VNĐ
   Lợi nhuận chưa thực hiện: +550 triệu VNĐ (+2.1%)
   Xếp hạng: 16% danh mục

... (3 vị trí còn lại)

TỔNG HỢP DANH MỤC:

Tổng giá trị hiện tại: 162.540 tỷ VNĐ
Tổng vốn đầu tư: 160.400 tỷ VNĐ
Lợi nhuận chưa thực hiện: +2.140 tỷ VNĐ (+1.3%)

Danh mục breakdown:
  - Ngân hàng (VCB, CTG): 33 tỷ VNĐ (20%)
  - Thép (HPG): 26.55 tỷ VNĐ (16%)
  - Tiêu dùng (VNM): 70.56 tỷ VNĐ (43%)
  - Công nghệ (FPT): 19.95 tỷ VNĐ (12%)
  - Khác: 12.5 tỷ VNĐ (8%)

Hiệu suất hàng ngày: -0.2% (hôm nay)
Hiệu suất tuần: +1.8%
Hiệu suất tháng: +4.2%

XẾP HẠNG HIỆU SUẤT:

Top gainer:
  1. FPT: +2.3% (best)
  2. HPG: +2.1%
  3. VCB: +1.3%
  4. CTG: +1.4%
  5. VNM: +0.8% (weakest)

Top loser: (none)

CẢNH BÁO:

- VNM: Hiệu suất yếu hơn thị trường (+0.8% vs +1.2% VNINDEX) → xem xét giảm
- FPT: Performer mạnh nhất → xem xét tăng weight nếu tiếp tục
- CTG: Giao dịch dải hẹp (±0.5%) → cân nhắc consolidation
```

## Usage

```json
{
  "tool_name": "get_positions",
  "input": {}
}
```

## Data Sources

- `positions` table — all open positions (qty, avg_cost, entry_date)
- `market_prices` — latest price per stock
- Historical P&L calculation

## Related Tools

- `set_position` — record new position
- `close_position` — mark position as closed
- `get_portfolio_risk` — aggregate portfolio risk metrics
- `get_rebalancing_signals` — rebalance to target allocation

---

## Implementation Notes

- **Live P&L:** Computed in real-time using latest market_prices entry
- **Cost basis:** Average price of all buys for the position
- **Closed positions:** Not displayed; use history query for realized P&L
- **Update frequency:** Real-time (on market price updates)
- **Currency:** All prices in Vietnamese Dong (VND)

## Columns Explained

| Column | Calculation | Source |
|--------|-------------|--------|
| Số lượng | Sum of all buys - sells | positions table |
| Giá nhập | Total cost / shares | positions table |
| Giá hiện | Latest from market_prices | market_prices table |
| Giá trị | Qty × Current Price | Calculated |
| P&L | (Current - Cost) × Qty | Calculated |
| % Lợi | (Current - Cost) / Cost × 100% | Calculated |

## Vietnamese Notes

- **Vị trí** = Position
- **Lợi nhuận chưa thực hiện** = Unrealized P&L
- **Giá nhập** = Entry price / cost basis
- **Giá hiện tại** = Current price
- **Xếp hạng** = Rank / allocation %
