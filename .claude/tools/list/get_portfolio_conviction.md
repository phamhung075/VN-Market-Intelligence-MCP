---
tool: get_portfolio_conviction
category: portfolio
agents: [cowork, market-analyst]
---

# `get_portfolio_conviction`

**Category:** Portfolio | **Used by:** cowork, market-analyst

Returns a ranked conviction dashboard for all watchlist stocks. Each stock shows: conviction score (0-1), signal direction, sector peer movement, open alert count, and 7-day conviction trend. Stocks ranked by conviction score descending. Use this to get a full portfolio health check at any time.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `minConviction` | number | No | 0.0 | Filter to stocks with conviction ≥ this threshold (0.0-1.0) |
| `includeNonPositions` | boolean | No | true | Include watchlist stocks not currently held (true/false) |

## Returns

Plain-text Vietnamese dashboard showing:
- All stocks sorted by conviction score (highest first)
- Conviction score (0-1 scale with color-coded severity)
- Signal direction and recent alerts
- Sector peer comparison
- 7-day conviction trend (arrow notation)
- Composite portfolio conviction
- Recommendation actions (BUY/HOLD/SELL/EXIT)

## Output Example

```
=== BẢng ĐIỀU KHIỂN NIỀM TIN DANH MỤC ===
Cập nhật: 2026-05-05 14:30:00 GMT+7

NIỀM TIN TỔNG THỂ: 0.72 (TỐT)
├─ Dự báo: Bullish trung bình
├─ Rủi ro: Thấp-Trung bình
└─ Hành động: GIỮ / MUA NHẸ

──────────────────────────────────────────────────────────────────
Mã    Conviction Signal    Peers Alert/7d Trend Recommendation
──────────────────────────────────────────────────────────────────
FPT   0.86 🟢   BUY       +1.2% 2/3   ↗    MUA / TĂNG WEIGHT
VCB   0.82 🟢   BUY       +0.8% 1/2   →    MUA / GIỮ
HPG   0.78 🟡   HOLD      +2.1% 1/2   ↘    GIỮ
VNM   0.65 🟡   HOLD      -0.5% 2/4   ↘    GIỮ / CẢNH BÁO
CTG   0.61 🟡   HOLD      +1.0% 1/2   ↗    GIỮ
DIG   0.55 🟡   NEUTRAL   -1.2% 1/1   ↘    BÁN NHẸ
SAB   0.42 🟠   SELL      -2.1% 3/4   ↙    BÁN / GIẢM WEIGHT
PSI   0.38 🔴   SELL      -3.2% 4/5   ↙    BÁN MẠNH / EXIT
──────────────────────────────────────────────────────────────────

CHI TIẾT CỔ PHIẾU:

1. FPT — CONVICTION: 0.86 🟢 [RẤT CAO]
   Mã: FPT | Giá: 66.500 VNĐ | Giá target: 70-72 VNĐ

   Tín hiệu chính:
     + TA bounce từ supply zone (tăng +2.1% trong 3 ngày)
     + News: Điều chỉnh dividend tăng 20% (dự báo 2026)
     + Fundamental: P/E 12.5 vs sector 15.2 (undervalued)

   Tín hiệu âm:
     - Volatility cao (28.5% annualized)
     - Kỹ thuật: Overextended 1h/4h (có thể pullback)

   Peers (IT sector):
     VNI: +0.5% (yếu hơn FPT +2.1%)
     TPB: +1.8% (FPT vẫn mạnh hơn)

   Cảnh báo hoạt động: 2 trong 3 ngày (TA + News)

   7-day trend: ↗ (tăng từ 0.79 → 0.86)

   Khuyến cáo: MUA MẠNH
     Priority: HIGH
     Action: Tăng từ 12% → 15% danh mục
     Target: 70-72 VNĐ (upside 5-8%)
     Stop loss: 64 VNĐ (downside 4%)
     Risk/reward: 5:4 (favorable)

2. VCB — CONVICTION: 0.82 🟢 [RẤT CAO]
   Mã: VCB | Giá: 32.400 VNĐ | Giá target: 33-34 VNĐ

   Tín hiệu chính:
     + Fundamental: NIM expansion (lãi suất tăng lợi nhuận)
     + Insider: 2 lãnh đạo mua (Phạm Viết Thắng, Trần Ngọc Tâm)
     + Sentiment: Analyst bullish (5/7 buy, 2/7 hold)

   Tín hiệu âm:
     - Macro: Fed rate hike → VND pressure (short-term headwind)
     - TA: Overbought 2h/4h (consolidation likely)

   Peers (Banking):
     CTG: +1.0% (VCB +1.3%, mạnh hơn)
     ACB: -0.3% (VCB mạnh nhất sector)

   Cảnh báo hoạt động: 1 (insider)

   7-day trend: → (stable 0.81-0.82)

   Khuyến cáo: GIỮ / MUA NHẸ
     Priority: MEDIUM
     Action: Tương ứng 20% danh mục (không thay đổi)
     Target: 33-34 VNĐ (upside 1.8-5%)
     Consolidation zone: 32-33 VNĐ
     Risk/reward: 1:3 (conservative)

3. HPG — CONVICTION: 0.78 🟡 [CAO]
   Mã: HPG | Giá: 53.100 VNĐ | Giá target: 52-54 VNĐ

   Tín hiệu chính:
     + Supply chain: Shipping cost tăng (+2.5σ) → bullish
     + Fundamental: BCTC Q1 expected tốt (trong 2 tuần)

   Tín hiệu âm:
     - Macro: China economy slowdown → thép giá giảm dự báo
     - Momentum: RSI 70+ (overbought, có thể pullback -3-5%)

   Peers (Steel):
     NKG: +1.5% (HPG +2.1%, mạnh hơn)

   Cảnh báo hoạt động: 1 (supply chain)

   7-day trend: ↘ (giảm từ 0.82 → 0.78)

   Khuyến cáo: GIỮ
     Priority: LOW
     Action: Giữ 16% danh mục (cân nhắc giảm nếu conviction tiếp tục giảm)
     Target: 54-56 VNĐ (long-term, 3+ tháng)
     Pullback zone: 51-52 VNĐ (có thể re-entry)
     Risk/reward: 3:1 (bullish nhưng rủi ro)

4. VNM — CONVICTION: 0.65 🟡 [TRUNG BÌNH-CAO]
   Mã: VNM | Giá: 88.200 VNĐ | Giá target: 85-92 VNĐ

   Tín hiệu chính:
     + News: Dividend tăng 10% (trong 2 tuần công bố)
     + Fundamental: Volume tăng stable (nhu cầu ổn định)

   Tín hiệu âm:
     - TA: Break below 20-day MA (downside signal)
     - Macro: Inflation cao → chi phí tăng áp lực margin
     - Peer: Sector FMCG yếu (-0.5% average)

   Cảnh báo hoạt động: 2 (TA + macro)

   7-day trend: ↘ (giảm từ 0.72 → 0.65)

   Khuyến cáo: GIỮ / CẢNH BÁO
     Priority: MONITOR
     Action: Giữ 40% danh mục nhưng THEO DÕI (concentration high)
     Target: 90-92 VNĐ (dividend story)
     Stop loss: 85 VNĐ (support line)
     Conviction watch: Nếu giảm <0.60, xem xét giảm weight

5. CTG — CONVICTION: 0.61 🟡 [TRUNG BÌNH]
   Mã: CTG | Giá: 21.800 VNĐ | Giá target: 22-23 VNĐ

   Tín hiệu chính:
     + Fundamental: Tăng trưởng tín dụng +5% (khỏe mạnh)
     + Sentiment: Analyst neutral-to-buy

   Tín hiệu âm:
     - Sector: Banking margin pressure (lãi suất liên ngân hàng tăng)
     - TA: Range-bound (21.5-22.5), không momentum

   Peers: VCB +1.3% vs CTG +0% (underperform)

   Cảnh báo hoạt động: 1

   7-day trend: ↗ (tăng từ 0.58 → 0.61)

   Khuyến cáo: GIỮ
     Priority: LOW
     Action: Giữ 10% danh mục
     Target: 22-23 VNĐ (boring, +3-5% upside)
     Risk: Giảm nếu banking sector weakens

6. DIG — CONVICTION: 0.55 🟡 [TRUNG BÌNH]
   Mã: DIG | Giá: 12.850 VNĐ | Giá target: 13-15 VNĐ

   Tín hiệu chính:
     + Bond maturity 15 ngày (refinance risk watching)
     + Project pipeline: 3 dự án mới announced

   Tín hiệu âm:
     - Sector: BĐS credit growth chậm (3.8% YoY)
     - TA: Support 12.5 VNĐ bị break, test 12.2 (weakness)
     - Macro: Lãi suất cao → tái cấp vốn đắt (margin pressure)

   Cảnh báo hoạt động: 1 (refinance)

   7-day trend: ↘ (giảm từ 0.62 → 0.55)

   Khuyến cáo: BÁN NHẸ / HOLD
     Priority: MONITOR
     Action: Không giữ hiện tại (not in portfolio) nhưng MONITOR
     Reason: Refinance risk 15 ngày, margin pressure (DIG nên tránh 2-4 tuần)
     Re-entry: Nếu refinance thành công + credit flow tăng → 0.70+

7. SAB — CONVICTION: 0.42 🟠 [THẤP-TRUNG BÌNH]
   Mã: SAB | Giá: 68.300 VNĐ | Giá target: 65-70 VNĐ

   Tín hiệu chính:
     - Fundamental: Profit margin giảm 3pp (cost pressure)
     - News: Cạnh tranh giá sư từ competitor (pressure)

   Tín hiệu âm:
     - TA: Double top 72 VNĐ, giảm xuống test 68 (breakdown)
     - Sector: FMCG sentiment yếu (-0.5% average)
     - Peers: VNM +0.8% vs SAB -1.2% (underperform)

   Cảnh báo hoạt động: 3 (TA + news + sector)

   7-day trend: ↙ (giảm từ 0.52 → 0.42)

   Khuyến cáo: BÁN
     Priority: HIGH
     Action: BÁN nếu giữ; KHÔNG MUA mới
     Target: 65 VNĐ (downside risk)
     Stop loss: 70 VNĐ (nếu giữ)
     Reason: Weakness convergence (TA + fundamental + sector)

8. PSI — CONVICTION: 0.38 🔴 [RẤT THẤP]
   Mã: PSI | Giá: 32.100 VNĐ | Giá target: 28-32 VNĐ

   Tín hiệu âm:
     - Fundamental: Revenue down -8% YoY (business weakness)
     - News: 3 analyst downgrade (VCBS, SHS, Maybank)
     - TA: Support 30 VNĐ test, volume dry (selling pressure)
     - Legal: Điều tra từ chính quyền (không xác nhận nhưng đáng lo)

   Cảnh báo hoạt động: 4 (news + TA + legal)

   7-day trend: ↙ (giảm từ 0.52 → 0.38)

   Khuyến cáo: EXIT / BÁN MẠNH
     Priority: CRITICAL
     Action: BÁN ngay nếu giữ
     Target: 28-30 VNĐ (downside risk)
     Reason: Multi-factor weakness + legal risk = high risk of continued decline
     Exit fully: Không re-entry trước khi clarity trên business/legal

TỔNG HỢP PORTFOLIO CONVICTION:

Conviction thấp (< 0.5): PSI (1 stock)
  → Khuyến cáo: EXIT

Conviction vừa (0.5-0.7): SAB, DIG (2 stocks)
  → Khuyến cáo: SELL / BÁN NHẸ / MONITOR

Conviction cao (0.7+): FPT, VCB, HPG, VNM, CTG (5 stocks)
  → Khuyến cáo: BUY / HOLD / GIỮ

Portfolio-level conviction: 0.72 (TỐT)
  → Trend: Stable (↔ 7-day)
  → Sentiment: Bullish trung bình
  → Action: GIỮ danh mục / MUA NHẸ nếu crash

HÀNH ĐỘNG ĐỀ XUẤT:

Ngay hôm nay:
  ✓ EXIT PSI (BÁN hết nếu giữ) — conviction 0.38, nguy hiểm pháp lý

Tuần này:
  ✓ BÁN SAB (1-2% danh mục) — conviction 0.42 yếu
  ✓ MUA FPT (1% thêm) — conviction 0.86 cao nhất
  ✓ MONITOR DIG (refinance watch)

Trong 2 tuần:
  ✓ Giảm VNM từ 40% → 35% (concentration, conviction ↘)
  ✓ Tăng VCB từ 20% → 22% (conviction 0.82, ổn định)

DỰ BÁO CONVICTION (1-2 TUẦN):

FPT: 0.86 → 0.82 (pullback kỹ thuật dự báo)
VCB: 0.82 → 0.84 (tăng từ insider, dividend)
HPG: 0.78 → 0.72 (giảm nếu China slowdown news)
VNM: 0.65 → 0.68 (tăng nếu dividend announce)
SAB: 0.42 → 0.35 (tiếp tục giảm)
PSI: 0.38 → 0.25 (tiếp tục giảm)

Portfolio: 0.72 → 0.71 (ổn định, nhẹ giảm)
```

## Usage

```json
{
  "tool_name": "get_portfolio_conviction",
  "input": {
    "minConviction": 0.5,
    "includeNonPositions": true
  }
}
```

## Data Sources

- `conviction_history` table — conviction score per stock
- `alerts` table — recent alerts and signal directions
- `watchlist` — sector classification and peer grouping
- `market_prices` — current price and direction
- Signal cache — latest signals (TA, fundamental, news, macro)

## Related Tools

- `get_positions` — current holdings
- `get_alerts` — detailed alert status
- `get_target_allocation` — rebalance based on conviction
- `sequential_market_analysis` — deep dive on low-conviction stocks

---

## Implementation Notes

- **Conviction score:** Composite of TA (30%), fundamental (30%), sentiment (25%), macro (15%)
- **Trend arrows:** ↗ (increasing), → (stable), ↘ (decreasing) over 7 days
- **Peer comparison:** vs. sector median (or index if not sector-bound)
- **Alert count:** Sum of active alerts in past 7 days
- **Update frequency:** Real-time (as signals update)

## Conviction Scale

| Score | Level | Color | Recommendation |
|-------|-------|-------|-----------------|
| 0.8+ | Very High | 🟢 | Strong BUY |
| 0.7-0.8 | High | 🟢 | BUY |
| 0.6-0.7 | Medium-High | 🟡 | HOLD |
| 0.5-0.6 | Medium | 🟡 | HOLD / SELL |
| 0.4-0.5 | Low | 🟠 | SELL |
| <0.4 | Very Low | 🔴 | EXIT |

## Vietnamese Notes

- **Niềm tin** = Conviction / confidence
- **Tín hiệu** = Signal
- **Cảnh báo** = Alert
- **Cơ sở** = Fundamental
- **Kỹ thuật** = Technical analysis
