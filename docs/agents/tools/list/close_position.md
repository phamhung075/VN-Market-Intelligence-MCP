---
tool: close_position
category: portfolio
agents: [cowork, market-analyst, user]
---

# `close_position`

**Category:** Portfolio | **Used by:** cowork, market-analyst, user

Mark a stock position as closed (set closed_at timestamp). The position record is kept for historical reference but will no longer appear in get_positions.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `actionCode` | string | Yes | — | Stock ticker code to close (e.g. "VCB") |
| `exitPrice` | number | No | — | Exit price (VNĐ). If omitted, uses latest market price. |
| `exitDate` | string | No | now | Exit date (ISO format: 2026-05-05) |

## Returns

Confirmation message showing:
- Position closed
- Quantity exited
- Exit price and date
- Realized P&L (amount and %)
- Impact on portfolio

## Output Example

```
=== ĐÓNG VỊ TRÍ ===

Cổ phiếu: VCB (Ngân hàng Thương mại Cổ phần Việt Nam)
Trạng thái: ĐÃ ĐÓNG ✓

Chi tiết vị trí đóng:
  Số lượng: 1.000 cổ phiếu
  Giá mua trung bình: 32.000 VNĐ/cổ
  Giá bán: 32.400 VNĐ/cổ
  Ngày bán: 2026-05-05
  Thời gian nắm giữ: 51 ngày

Tính toán lợi nhuận:
  Giá trị nhập: 32.000 tỷ VNĐ (1.000 × 32.000)
  Giá trị bán: 32.400 tỷ VNĐ (1.000 × 32.400)
  Lợi nhuận thực hiện: +400 triệu VNĐ
  Tỷ lệ lợi nhuận: +1.25%

Tác động danh mục:
  Giá trị danh mục trước: 177.640 tỷ VNĐ
  Giá trị danh mục sau: 145.240 tỷ VNĐ
  Thay đổi: -32.400 tỷ VNĐ
  Lợi nhuận thực hiện được: +400 triệu VNĐ

Lịch sử vị trí:
  Ngày mở: 2026-03-15
  Ngày đóng: 2026-05-05
  Thời gian nắm giữ: 51 ngày
  Lợi nhuận tổng: +400 triệu VNĐ (+1.25%)

Xác nhận: Vị trí VCB đã được đóng ✓
Vị trí sẽ được lưu trong lịch sử (historical reference)
```

## Usage

```json
{
  "tool_name": "close_position",
  "input": {
    "actionCode": "VCB",
    "exitPrice": 32.400,
    "exitDate": "2026-05-05"
  }
}
```

## Data Sources

- `positions` table — update closed_at timestamp
- `market_prices` — use if exitPrice omitted
- Historical P&L calculation

## Related Tools

- `get_positions` — view open positions only
- `set_position` — record new position
- `get_portfolio_risk` — update risk after exit
- `get_rebalancing_signals` — rebalance after exit

---

## Implementation Notes

- **Position history:** Closed positions remain in DB (closed_at != null) for audit trail
- **Realized P&L:** Calculated as (exitPrice - avgCost) × quantity
- **Exit price fallback:** If not provided, uses latest market_prices entry
- **Timestamp:** Defaults to current time; can be backdated if specified
- **Active positions:** get_positions filters to closed_at IS NULL

## Exit Workflow

1. Call `close_position` with actionCode
2. Position marked with closed_at timestamp
3. Realized P&L calculated and stored
4. Position no longer appears in get_positions
5. Historical record preserved in positions table

## Common Scenarios

### Scenario 1: Exit at Market Price

```json
{
  "actionCode": "VCB"
}
```

→ Uses latest market price; exits today

### Scenario 2: Exit at Specific Price

```json
{
  "actionCode": "VCB",
  "exitPrice": 32.400
}
```

→ Records exit at 32.400 VNĐ; exits today

### Scenario 3: Exit Backdated (Historical Record)

```json
{
  "actionCode": "VCB",
  "exitPrice": 32.200,
  "exitDate": "2026-04-28"
}
```

→ Records exit at 32.200 on 2026-04-28 (for historical accuracy)

## Realized P&L Example

| Metric | Value |
|--------|-------|
| Entry (avg cost) | 32.000 VNĐ |
| Exit price | 32.400 VNĐ |
| Quantity | 1.000 |
| Gain per share | +0.400 VNĐ |
| Total gain | +400 triệu VNĐ |
| % Return | +1.25% |
| Holding period | 51 ngày |
| Annualized return | +9.0% |

## Vietnamese Notes

- **Đóng vị trí** = Close position
- **Giá bán** = Exit price
- **Lợi nhuận thực hiện** = Realized P&L
- **Thời gian nắm giữ** = Holding period
- **Lịch sử** = Historical record
