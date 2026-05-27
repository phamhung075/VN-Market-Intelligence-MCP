---
tool: get_target_allocation
category: portfolio
agents: [cowork, market-analyst]
---

# `get_target_allocation`

**Category:** Portfolio | **Used by:** cowork, market-analyst

Show current portfolio target weights vs actual allocation with drift column. Reads portfolio_targets, positions, and market_prices tables. Falls back to avg_price when live price is unavailable.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| — | — | — | — | No parameters |

## Returns

Plain-text table showing:
- Target weight (%) for each stock or sector
- Current actual weight (%)
- Drift (actual - target, in percentage points)
- Dollar amount at risk / underweight
- Rebalancing recommendation
- Action items

## Output Example

```
=== PHÂN BỐ MỤC TIÊU DANH MỤC ===
Cập nhật: 2026-05-05 14:30:00 GMT+7

─────────────────────────────────────────────────────────
Mã     Target % | Actual % | Drift (pp) | $ Unbalance | Action
─────────────────────────────────────────────────────────
VCB    20%      | 18%      | -2pp       | -3.2 tỷ     | MUA
HPG    15%      | 16%      | +1pp       | +1.6 tỷ     | BÁN
VNM    35%      | 40%      | +5pp       | +8.0 tỷ     | BÁN MẠNH
FPT    12%      | 11%      | -1pp       | -1.6 tỷ     | MUA NHẸ
CTG    10%      | 10%      | 0pp        | 0.0 tỷ      | GIỮ
Cash   8%       | 5%       | -3pp       | -4.8 tỷ     | TĂNG TIỀN
─────────────────────────────────────────────────────────
TOTAL  100%     | 100%     | 0pp        | —           | —

CHI TIẾT REBALANCING:

Drift Analysis:
  Overweight (actual > target):
    - VNM: +5pp (40% actual vs 35% target) — MUA QUÁ
    - HPG: +1pp (16% actual vs 15% target) — BÁN NHẸ
    Tổng overweight: +6pp

  Underweight (actual < target):
    - VCB: -2pp (18% actual vs 20% target) — THIẾU MUA
    - FPT: -1pp (11% actual vs 12% target) — THIẾU MUA NHẸ
    - Cash: -3pp (5% actual vs 8% target) — THIẾU TIỀN MẶT
    Tổng underweight: -6pp

Allocation Drift Severity:
  Max single-stock drift: +5pp (VNM) — VÀNG / CẢNH BÁO
  Avg absolute drift: 2.0pp (trung bình)
  Overall drift: Balanced (overweight = underweight)

Giá trị dòng tiền cần hành động:
  MUA (to rebalance underweight):
    - VCB: +3.2 tỷ VNĐ (để đạt 20% target)
    - FPT: +1.6 tỷ VNĐ (để đạt 12% target)
    - Cash accumulation: +4.8 tỷ VNĐ (để đạt 8% target)
    → Tổng MUA cần: 9.6 tỷ VNĐ

  BÁN (to rebalance overweight):
    - VNM: -8.0 tỷ VNĐ (để hạ từ 40% xuống 35%)
    - HPG: -1.6 tỷ VNĐ (để hạ từ 16% xuống 15%)
    → Tổng BÁN cần: 9.6 tỷ VNĐ

KẾ HOẠCH REBALANCING:

Priority 1 (Urgent — Drift >3pp):
  ✓ BÁN VNM 20.000 cổ (8.0 tỷ VNĐ) — Giảm từ 40% → 35%
    → Giá hiện: 88.200 VNĐ/cổ
    → Lợi nhuận: +560 triệu VNĐ
    → Lý do: Overweight tích lũy quá nhiều; lợi nhuận tốt để lấy
    → Timeline: Hôm nay hoặc tuần này

Priority 2 (Moderate — Drift 1-3pp):
  ✓ MUA VCB 5.000 cổ (3.2 tỷ VNĐ) — Tăng từ 18% → 20%
    → Giá hiện: 32.400 VNĐ/cổ
    → Lợi nhuận: +200 triệu VNĐ
    → Lý do: Underweight; banking sector tốt
    → Timeline: Trong 2 tuần

  ✓ BÁN HPG 3.000 cổ (1.6 tỷ VNĐ) — Giảm từ 16% → 15%
    → Giá hiện: 53.100 VNĐ/cổ
    → Timeline: Flexible (trong 1 tháng)

Priority 3 (Optional — Drift <1pp):
  ✓ MUA FPT (nhẹ) — 1.6 tỷ VNĐ
    → Nếu có dòng tiền từ VNM bán
    → Timeline: Sau khi bán VNM

  ✓ Tích tiền mặt (Cash) — +4.8 tỷ VNĐ
    → Sau khi hoàn thành các giao dịch

DÒNG LỰC REBALANCING:

1. Ngay hôm nay: Đặt lệnh BÁN VNM (8.0 tỷ VNĐ)
2. Ngày mai (nếu bán thành công): Đặt lệnh MUA VCB (3.2 tỷ VNĐ)
3. Trong tuần: BÁN HPG (1.6 tỷ VNĐ), MUA FPT (1.6 tỷ VNĐ) — NET = 0
4. Dự trữ: Cash tích lũy +4.8 tỷ (để sẵn cho cơ hội mua)

RỦI RO REBALANCING:

  ✓ Thị trường hoảng loạn trước khi bán VNM → giá giảm, lỗ bỏ lợi
    → Cách: Bán trong 2 tuần nếu giá không tuột (>88 VNĐ)

  ✓ Không đủ dòng tiền mới để mua VCB → allocation vẫn thiếu
    → Cách: Giữ Cash buffer tạm (có dùng được)

HIỆU SUẤT TRƯỚC/SAU REBALANCE:

Hiệu suất danh mục trước rebalance: +1.3% (ytd)

Dự báo hiệu suất sau rebalance (3 tháng):
  Nếu VNM quay đầu (giảm) từ 40% → 35%: Tránh được lỗ 2-3%
  Nếu VCB tăng (+4-6% expected): Lợi thêm 0.8-1.2%
  → Net expected benefit: +1.0-2.0% (long-term)

KHUYẾN CÁO:

Status: ⚠️ REBALANCING NEEDED

Hành động: MUA VCB / BÁN VNM ngay
  Priority: HIGH (VNM drift +5pp)
  Target execution: Trong 2 tuần
  Approved: Tùy chiến lược rủi ro

Frequency: Rebalance lại nếu drift >3pp hoặc hàng quý (định kỳ)
```

## Usage

```json
{
  "tool_name": "get_target_allocation",
  "input": {}
}
```

## Data Sources

- `portfolio_targets` table — target weight per stock/sector
- `positions` table — current holdings
- `market_prices` — current price for weight calculation
- avg_price fallback — if market price unavailable

## Related Tools

- `get_rebalancing_signals` — exact buy/sell quantities to hit targets
- `get_positions` — detailed position view
- `set_position` — execute rebalancing trades
- `get_portfolio_risk` — assess risk after rebalancing

---

## Implementation Notes

- **Weight calculation:** (Position value / Total portfolio value) × 100%
- **Drift:** Actual% - Target% (in percentage points)
- **Rebalancing threshold:** Typically 2-3pp drift triggers action
- **Price fallback:** Uses avg_cost if market_prices unavailable
- **Update frequency:** Real-time (on price updates)

## Drift Thresholds

| Drift | Severity | Action |
|-------|----------|--------|
| >5pp | Critical | Buy/sell immediately |
| 3-5pp | High | Execute within 1-2 weeks |
| 1-3pp | Moderate | Execute within 1 month |
| <1pp | Low | Hold or next scheduled rebalance |

## Vietnamese Notes

- **Phân bỗi mục tiêu** = Target allocation
- **Sai lệch thực tế** = Drift
- **Tái cân bằng** = Rebalancing
- **Không cân bằng** = Imbalanced
- **Dòng tiền** = Cash flow
