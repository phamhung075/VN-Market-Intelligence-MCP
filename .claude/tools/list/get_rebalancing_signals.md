---
tool: get_rebalancing_signals
category: portfolio
agents: [cowork, market-analyst]
---

# `get_rebalancing_signals`

**Category:** Portfolio | **Used by:** cowork, market-analyst

Calculate buy/sell quantities to reach target allocation weights. Reads current positions from the portfolio, fetches live prices, and returns exact share counts to trade per stock to hit your target weights.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `driftThreshold` | number | No | 2.0 | Only include trades with drift ≥ this % (e.g., 2.0 = 2pp) |

## Returns

Plain-text action plan showing:
- Buy and sell signals with exact share quantities
- Current vs target allocation
- Trade order details (stock, qty, price, estimated value)
- Execution sequence (buy/sell order)
- Transaction costs estimate
- Cash flow impact

## Output Example

```
=== TÍN HIỆU TÁI CÂN BẰNG DANH MỤC ===
Cập nhật: 2026-05-05 14:30:00 GMT+7
Ngưỡng sai lệch: 2.0% (chỉ hiển thị trades có drift ≥ 2pp)

TÓMSẮT KẾ HOẠCH REBALANCING:

Danh mục hiện tại: 177.640 tỷ VNĐ
Cần giao dịch: 9.600 tỷ VNĐ (5.4% danh mục)
Số giao dịch: 5 (2 BUY, 3 SELL)
Chi phí ước tính: 28.8 triệu VNĐ (0.3% danh mục)
Thời gian thực hiện: 2-3 ngày

LỆNH BÁN (SELL):

─────────────────────────────────────────────────────────────
Rank Mã   Current Qty Target Qty Qty to Sell Price Value(tỷ)
─────────────────────────────────────────────────────────────
1.   VNM  800         560        -240        88.20 -21.168
2.   HPG  500         467        -33         53.10 -1.752
─────────────────────────────────────────────────────────────
TỔNG BÁN:                                      Doanh số: -22.920 tỷ

Chi tiết lệnh BÁN:

1. VNM [PRIORITY 1 — URGENT] ⭐
   ├─ Current: 800 cổ phiếu (40% danh mục)
   ├─ Target: 560 cổ phiếu (35% danh mục)
   ├─ Qty to sell: -240 cổ phiếu
   ├─ Current price: 88.200 VNĐ/cổ
   ├─ Estimated proceed: 21.168 tỷ VNĐ
   ├─ Drift: +5pp (significant overweight)
   ├─ Reason: Over-concentrated; lợi nhuận good (+0.56 tỷ)
   ├─ Execution: Sell 120 cổ today + 120 cổ tomorrow (2 tranches)
   ├─ Stop: Giả nếu giá >89 VNĐ (upside protection)
   └─ Confirmation: Bán để rebalance, không phải exit

2. HPG [PRIORITY 2 — MODERATE] ⚠️
   ├─ Current: 500 cổ phiếu (16% danh mục)
   ├─ Target: 467 cổ phiếu (15% danh mục)
   ├─ Qty to sell: -33 cổ phiếu
   ├─ Current price: 53.100 VNĐ/cổ
   ├─ Estimated proceed: 1.752 tỷ VNĐ
   ├─ Drift: +1pp (minor overweight, below threshold nhưng optional)
   ├─ Reason: Slight drift; HPG vẫn bullish (conviction 0.78)
   ├─ Execution: Sell 33 cổ in single tranche
   ├─ Optional: Có thể skip nếu muốn giữ HPG (only +1pp drift)
   └─ Confirmation: Tùy chọn, thấp priority

LỆNH MUA (BUY):

─────────────────────────────────────────────────────────────
Rank Mã   Current Qty Target Qty Qty to Buy  Price Value(tỷ)
─────────────────────────────────────────────────────────────
1.   VCB  1.000      1.156      +156        32.400 +5.054
2.   FPT  300        360        +60         66.500 +3.990
3.   Cash 5.0%       8.0%       +4.800 tỷ   —      +4.800
─────────────────────────────────────────────────────────────
TỔNG MUA:                                      Doanh số: +13.844 tỷ

Chi tiết lệnh MUA:

1. VCB [PRIORITY 1 — URGENT] ⭐
   ├─ Current: 1.000 cổ phiếu (18% danh mục)
   ├─ Target: 1.156 cổ phiếu (20% danh mục)
   ├─ Qty to buy: +156 cổ phiếu
   ├─ Current price: 32.400 VNĐ/cổ
   ├─ Estimated cost: 5.054 tỷ VNĐ
   ├─ Drift: -2pp (underweight)
   ├─ Reason: Highest quality stock (conviction 0.82, low risk)
   ├─ Execution: Buy 78 cổ today + 78 cổ in 2-3 days (2 tranches)
   ├─ Limit: Mua tối đa 32.5 VNĐ (avoid FOMO)
   ├─ Source của tiền: Từ bán VNM (21.168 tỷ)
   └─ Confirmation: Priority mua cổ phiếu an toàn nhất

2. FPT [PRIORITY 2 — MODERATE] ⚠️
   ├─ Current: 300 cổ phiếu (11% danh mục)
   ├─ Target: 360 cổ phiếu (12% danh mục)
   ├─ Qty to buy: +60 cổ phiếu
   ├─ Current price: 66.500 VNĐ/cổ
   ├─ Estimated cost: 3.990 tỷ VNĐ
   ├─ Drift: -1pp (slight underweight)
   ├─ Reason: Highest conviction (0.86); strong performer
   ├─ Execution: Buy 60 cổ in single tranche (after VNM sale clears)
   ├─ Limit: Mua tối đa 67 VNĐ (momentum limit)
   ├─ Source của tiền: Từ bán VNM + phần dư
   └─ Confirmation: FPT conviction cao, xứng đáng tăng weight

3. CASH RESERVE [PRIORITY 3 — OPTIONAL] 💰
   ├─ Current: 5% danh mục (8.882 tỷ VNĐ)
   ├─ Target: 8% danh mục (14.211 tỷ VNĐ)
   ├─ Amount to hold: +4.800 tỷ VNĐ
   ├─ Reason: Maintain dry powder for opportunities
   ├─ Execution: Hold cash from VNM sale proceeds
   ├─ Use cases: Buy nếu crash, accumulate Conviction flip stocks
   └─ Timeline: Hold trong 1 tháng (flexibility)

LỊCH TRÌNH GIAO DỊCH (EXECUTION PLAN):

Hôm nay (Day 1): ÔN ĐỊNH LỆnh
├─ Place sell limit: VNM -240 @ 88.5 VNĐ (or market if >88.2)
├─ Place buy limit: VCB +78 @ 32.3-32.4 VNĐ
├─ Place buy limit: FPT (hold, không bấn ngại hôm nay)
├─ Monitor: Giá, tin tức, điều chỉnh nếu cần

Ngày 2: GIAO DỊCH PARTIAL
├─ If VNM sell fills partially (120 cổ thành):
│  ├─ Proceeds: 10.584 tỷ VNĐ
│  ├─ Buy VCB: 78 cổ (2.527 tỷ VNĐ)
│  ├─ Hold lại: 8.057 tỷ VNĐ cash
├─ If VNM sell không fill:
│  ├─ Thử again vào đóng cửa
└─ Monitor: VCB price, FPT momentum

Ngày 3: KẾT THÚC REBALANCE
├─ If VNM still not sold:
│  ├─ Thử bán tại market price (không chờ nữa)
├─ Buy FPT: 60 cổ (3.990 tỷ VNĐ)
├─ Buy HPG: 33 cổ nếu priorities consistent
├─ Finalize cash hold: 4.8 tỷ VNĐ

TARGET ALLOCATION SAU REBALANCING:

─────────────────────────────────────────────────────────
Mã    Current%  Target%  After Rebal%  Verification
─────────────────────────────────────────────────────
VCB   18%       20%      20%           ✓ On target
FPT   11%       12%      12%           ✓ On target
HPG   16%       15%      15%           ✓ On target (if sell)
VNM   40%       35%      35%           ✓ On target
CTG   10%       10%      10%           ✓ On target
Cash  5%        8%       8%            ✓ On target
─────────────────────────────────────────────────────
TOTAL 100%      100%     100%          ✓ Balanced
─────────────────────────────────────────────────────

CHI PHÍ GIAO DỊCH:

Ước tính chi phí:
├─ Sell commission (0.15%): 34.4 triệu VNĐ
├─ Buy commission (0.15%): 20.7 triệu VNĐ
├─ Bid-ask spread (avg 0.3pp): ~8.2 triệu VNĐ
├─ Market impact (minor): ~1 triệu VNĐ
├─ Estimated total cost: ~64.3 triệu VNĐ (0.36% danh mục)
├─ But offset by better allocation: +60-80 triệu VNĐ expected benefit
└─ Net benefit: +20-40 triệu VNĐ (worth it)

RỦI RO & MITIGATIONS:

Risk 1: VNM giá bồi thường trên 88.5 (tức giá tăng)
├─ Impact: Bán ít hơn, cash inadequate
├─ Mitigation: Bán tại market (88.2), không chờ vô hạn
├─ Fallback: Giảm buy FPT từ 60 → 40 cổ (priority VCB first)

Risk 2: VCB/FPT giá tăng trước khi buy (FOMO)
├─ Impact: Buy high, rebalance cost tăng
├─ Mitigation: Set buy limit (VCB 32.4, FPT 67)
├─ Fallback: Buy partial ngay, hold limit order 3 ngày

Risk 3: Market crash (danh mục giảm giữa rebalancing)
├─ Impact: Allocation target không còn relevant
├─ Mitigation: Hold cash (8%), có sẵn để buy dips
├─ Fallback: Pause rebalancing, adjust targets

Risk 4: Execution slippage (không fill đủ lượng)
├─ Impact: Allocation vẫn off-target
├─ Mitigation: Use 2-3 tranches (không all-or-nothing)
├─ Fallback: Re-run rebalancing trong 1 tuần

TỔNG KẾT:

Status: REBALANCING APPROVED
├─ Complexity: LOW (standard buy/sell)
├─ Cost: ~64 triệu VNĐ (0.36% danh mục, acceptable)
├─ Benefit: +100-150 triệu VNĐ expected (better allocation)
├─ Net return: +0.4-0.7% danh mục từ rebalancing
└─ Timeline: 2-3 ngày

Hành động ngay:
1. Submit VNM sell order: -240 @ 88.5 (or market)
2. Submit VCB buy order: +156 @ 32.3-32.4 (2 tranches)
3. Hold FPT buy order (pending VNM sale fill)
4. Monitor daily, adjust nếu cần

Approval: YES — Proceed with rebalancing per plan above
```

## Usage

```json
{
  "tool_name": "get_rebalancing_signals",
  "input": {
    "driftThreshold": 2.0
  }
}
```

## Data Sources

- `positions` table — current holdings
- `portfolio_targets` table — target allocation
- `market_prices` — current price for buy/sell calculation
- Commission rates, bid-ask spreads (hardcoded or configurable)

## Related Tools

- `get_target_allocation` — see current drift
- `set_position` — execute buy/sell trades
- `get_positions` — verify post-rebalance allocation
- `get_portfolio_risk` — assess risk after rebalancing

---

## Implementation Notes

- **Buy/sell quantity calculation:** (target% - current%) × total portfolio value / stock price
- **Trade sequencing:** Sell first (generate cash), then buy (use cash)
- **Transaction costs:** Estimated bid-ask spread + commission per trade
- **Execution strategy:** 2+ tranches to minimize market impact
- **Drift filter:** Skip stocks with <driftThreshold to reduce trading frequency

## Execution Strategy Options

| Strategy | Timing | Cost | Risk |
|----------|--------|------|------|
| All at once | 1 day | Low | High slippage |
| 2 tranches | 2-3 days | Medium | Medium |
| 3+ tranches | 1+ week | High | Low (dollar-cost average) |

## Vietnamese Notes

- **Tái cân bằng** = Rebalancing
- **Lệnh mua/bán** = Buy/sell order
- **Sai lệch** = Drift
- **Cấu trúc phân bổ** = Allocation
- **Dòng tiền** = Cash flow / proceeds
