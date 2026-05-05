---
tool: get_portfolio_risk
category: portfolio
agents: [cowork, market-analyst, qa]
---

# `get_portfolio_risk`

**Category:** Portfolio | **Used by:** cowork, market-analyst, qa

Portfolio risk metrics: VaR 95%, max drawdown, and per-stock heat map. Uses historical price simulation over the specified lookback period.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `days` | number | No | 252 | Lookback window in trading days (default: 252 = 1 year, min: 30, max: 756 = 3 years) |
| `confidence` | number | No | 0.95 | Confidence level for VaR (default: 0.95 = 95%, also supports 0.99 = 99%) |

## Returns

Plain-text Vietnamese report showing:
- Value at Risk (VaR) at specified confidence level
- Maximum drawdown in lookback period
- Volatility (annualized %)
- Per-stock risk contribution
- Correlation heatmap (if 3+ stocks)
- Stress test scenarios (bear market, sector shock)
- Risk classification (conservative/moderate/aggressive)

## Output Example

```
=== RỦI RO DANH MỤC ===
Ngày: 2026-05-05 | Lookback: 252 ngày | Confidence: 95%

THỐNG KÊ RỦI RO TỔNG QUÁT:

Giá trị danh mục: 177.640 tỷ VNĐ
Volatility (hàng năm): 18.5% (trung bình)

VaR (95%, 1-day): 1.64 tỷ VNĐ
  → Có 95% xác suất không mất hơn 1.64 tỷ VNĐ trong 1 ngày
  → Tương đương: -0.92% danh mục

VaR (95%, 10-day): 5.18 tỷ VNĐ
  → Có 95% xác suất không mất hơn 5.18 tỷ VNĐ trong 10 ngày
  → Tương đương: -2.92% danh mục

Drawdown Tối đa (Max DD): -15.2%
  → Từ 2025-04-15 đến 2025-06-30 (76 ngày)
  → Giá trị danh mục giảm từ 208 tỷ → 176 tỷ VNĐ
  → Thời gian phục hồi: 45 ngày (cho đến 2025-08-15)

PHÂN TÍCH RỦI RO THEO CỔ PHIẾU:

─────────────────────────────────────────────────────────
Mã     Qty   Volatility  VaR Contribution  Risk Score  Heat
─────────────────────────────────────────────────────────
VCB    1K    14.2%       20% of portfolio  LOW         🟢
HPG    500   24.8%       18% of portfolio  MEDIUM      🟡
VNM    800   12.1%       35% of portfolio  LOW         🟢
FPT    300   28.5%       15% of portfolio  HIGH        🔴
CTG    600   16.3%       12% of portfolio  MEDIUM      🟡
─────────────────────────────────────────────────────────

Chi tiết:

1. VCB (Ngân hàng) — RỦI RO THẤP 🟢
   Volatility: 14.2% (ổn định, thấp hơn danh mục)
   VaR Contribution: 20% (lớn nhất tuyệt đối nhưng volatility thấp)
   Beta: 0.82 (dưới thị trường)
   Khuyến cáo: SAFE — nên tăng weight để giảm risk

2. HPG (Thép) — RỦI RO TRUNG BÌNH 🟡
   Volatility: 24.8% (cao hơn danh mục)
   VaR Contribution: 18%
   Beta: 1.25 (trên thị trường)
   Khuyến cáo: MONITOR — xem xét giảm nếu rủi ro tráng

3. VNM (Tiêu dùng) — RỦI RO THẤP 🟢
   Volatility: 12.1% (rất thấp, ổn định nhất)
   VaR Contribution: 35% (cao, nhưng do weight lớn)
   Beta: 0.75 (rất thấp, rất safe)
   Khuyến cáo: SAFE — diversifier tốt

4. FPT (Công nghệ) — RỦI RO CAO 🔴
   Volatility: 28.5% (cao nhất danh mục)
   VaR Contribution: 15%
   Beta: 1.45 (cao nhất)
   Khuyến cáo: CAUTION — xem xét giảm weight từ 12% → 8%

5. CTG (Ngân hàng) — RỦI RO TRUNG BÌNH 🟡
   Volatility: 16.3%
   VaR Contribution: 12%
   Beta: 0.95
   Khuyến cáo: MONITOR — ổn định, giữ weight

MA TRẬN TƯƠNG QUAN:

        VCB    HPG    VNM    FPT    CTG
VCB    1.00   0.52   0.41   0.28   0.88
HPG    0.52   1.00   0.35   0.25   0.48
VNM    0.41   0.35   1.00   0.12   0.38
FPT    0.28   0.25   0.12   1.00   0.22
CTG    0.88   0.48   0.38   0.22   1.00

Giải thích:
  - VCB & CTG: Tương quan rất cao (0.88) → Redundancy, diversify được ít
  - VCB & HPG: Tương quan vừa (0.52) → Hedge tốt
  - VNM: Tương quan thấp với tech (0.12) → Excellent diversifier
  - FPT: Tương quan thấp nhất → Isolated risk

PHÂN TÍCH KỀ SẮC HỌC:

Concentration Risk:
  Top 1 stock (VNM): 40% → TẬP TRUNG CAO
  Top 2 stocks (VNM + VCB): 58% → TẬP TRUNG RẤT CAO
  Top 3 stocks: 74% → TẬP TRUNG NGUY HIỂM

Khuyến cáo: Giảm VNM từ 40% xuống 30%; tăng FPT hoặc VCB

STRESS TEST SCENARIOS:

Scenario 1: Crash thị trường (-10% VNINDEX)
  VCB: -8.2% (beta 0.82)
  HPG: -12.5% (beta 1.25)
  VNM: -7.5% (beta 0.75)
  FPT: -14.5% (beta 1.45)
  CTG: -9.5% (beta 0.95)

  → Danh mục dự báo: -10.0% (đơn vị beta đúng)
  → VaR actual scenario: -1.78 tỷ VNĐ

Scenario 2: Khủng hoảng ngân hàng (-20% VCB/CTG)
  VCB: -20%
  CTG: -20%
  HPG: -5% (correlation 0.48)
  VNM: -3% (correlation 0.38)
  FPT: -2% (correlation 0.22)

  → Danh mục dự báo: -8.4% (lớn, vì 28% danh mục là ngân hàng)
  → VaR actual scenario: -1.49 tỷ VNĐ
  → Khuyến cáo: GIẢM trọng ngân hàng

Scenario 3: Thích ứng công nghệ (FPT +20%, khác +3%)
  FPT: +20%
  Khác: +3%

  → Danh mục dự báo: +5.2% (khả năng nhưng rủi ro)

TỔNG HỢP RỦI RO:

Risk Profile: MODERATE
  Volatility: 18.5% (trung bình ngành)
  VaR 95%: 1.64 tỷ/ngày (acceptable)
  Max DD: -15.2% (normal)

Phân loại:
  ✓ SAFE: VCB, VNM (64% danh mục)
  ⚠️ MEDIUM: HPG, CTG (26% danh mục)
  🔴 RISKY: FPT (12% danh mục)

KHUYẾN CÁO HÀNH ĐỘNG:

Priority 1 (Urgent):
  ✓ Giảm tập trung: Bán VNM từ 40% → 30% (-8 tỷ)
    → Tối ưu hóa concentration risk
    → Tăng diversification

  ✓ Đa dạng hóa: Mua VCB từ 18% → 22% (+4.5 tỷ)
    → VCB là stock safest (vol 14%, beta 0.82)
    → Giảm overall portfolio vol từ 18.5% → 17%

Priority 2 (Moderate):
  ✓ Monitor FPT: Volatility cao (28.5%)
    → Nếu phảng không có catalyst mạnh, xem xét giảm từ 12% → 8%
    → Ngân sách tiết kiệm: 2 tỷ VNĐ

Priority 3 (Optional):
  ✓ Giữ HPG, CTG ở weight hiện tại
    → Correlation tốt với VCB (0.52, 0.95)
    → Volatility chấp nhận được

RỦI RO DỰ BÁO (3-6 THÁNG):

Nếu pairing thị trường bình thường:
  VaR dự báo: 2-3 tỷ VNĐ (10-day, unchanged)
  Drawdown dự báo: Tối đa -10% (seasonal)

Nếu có sốc lãi suất:
  VaR tăng lên: 4-5 tỷ VNĐ
  Banking stocks (VCB, CTG) giảm -15-20%
  FPT có thể tăng (rate hedge)

PHƯƠNG ÁN BẢO VỆ:

1. Hedging tự nhiên:
   → VNM (beta 0.75) + VCB (beta 0.82) là tốt
   → FPT (beta 1.45) vẫn risky

2. Nếu muốn giảm VaR xuống <1.5 tỷ:
   → Bán 30% FPT (tiết kiệm 0.4 tỷ)
   → Mua 15% thêm VNM hoặc VCB (giảm vol)
   → Expected VaR: 1.35 tỷ VNĐ

3. Nếu muốn tăng upside (accept risk):
   → Tăng FPT từ 12% → 16%
   → Giảm VCB từ 20% → 16%
   → Expected return: +1-2% nhưng VaR +0.3 tỷ
```

## Usage

```json
{
  "tool_name": "get_portfolio_risk",
  "input": {
    "days": 252,
    "confidence": 0.95
  }
}
```

## Data Sources

- `market_prices_history` — historical price data for volatility calculation
- `positions` table — current holdings
- `market_prices` — current price for portfolio value
- Correlation matrix computed from historical returns

## Related Tools

- `get_positions` — current holdings
- `get_target_allocation` — rebalance to reduce risk
- `sequential_market_analysis` — understand correlation drivers
- `get_alerts` — identify single-stock risk catalysts

---

## Implementation Notes

- **VaR calculation:** Parametric method (normal distribution assumption)
- **Volatility:** Annualized standard deviation of daily returns
- **Lookback:** Defaults to 252 trading days (1 year); longer period = more stable estimate
- **Correlation:** Computed from returns in lookback period
- **Stress test:** Scenario analysis using beta / historical correlation

## Risk Metrics

| Metric | Calculation | Use |
|--------|-------------|-----|
| Volatility | Std dev of returns × √252 | Overall risk level |
| VaR 95% | 1.645 × vol × portfolio value | Downside protection |
| Drawdown | (Peak - Trough) / Peak | Worst-case loss |
| Beta | Covariance(stock, market) / Var(market) | Systematic risk |

## Vietnamese Notes

- **Rủi ro danh mục** = Portfolio risk
- **Tính toán giá trị rủi ro** = Value at Risk (VaR)
- **Tương quan** = Correlation
- **Volatility** = Độ biến động
- **Sốc thị trường** = Market shock / stress
