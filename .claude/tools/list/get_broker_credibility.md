---
tool: get_broker_credibility
category: sector
agents: [cowork, qa]
---

# `get_broker_credibility`

**Category:** Sector | **Used by:** cowork, qa

Check if a Vietnamese securities broker (công ty chứng khoán) is currently under SSC sanction and compute a discounted forecast confidence. Use before trusting a broker's bullish sector / stock forecast.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `broker` | string | Yes | — | Broker name or ticker code (e.g. "VNDirect", "Viet Capital Securities", "VC") |

## Returns

Plain-text Vietnamese report showing:
- Broker credibility score (0-100)
- SSC sanction status and history
- Historical forecast accuracy (vs actual market)
- Conflict of interest flags (analyst coverage, proprietary trading)
- Recommendation confidence discount
- Peer comparison (sector median credibility)

## Output Example

```
=== KIỂM ĐỊNH CREDIBILITYỬ CHỨNG KHOÁN ===

Mã: VND / Tên: VNDirect

ĐIỂM TIN CẬY: 72/100 [TRUNG BÌNH-TỐT]

TÌNH TRẠNG PHẠT:
  SSC Sanction: Không hiện tại ✓
  Lịch sử: 1 lần phạt cũ (2023-06: Mua bán vô kỷ luật → phạt 50M VNĐ)
  Hiệu lực phạt: Đã hết (2024-12) → không ảnh hưởng hiện tại
  Độ tin cậy: BÌNH THƯỜNG

ĐỘ CHÍNH XÁC DỰ BÁO:

Lịch sử 12 tháng:
  Tổng dự báo: 45 dự báo (stock/sector)
  Đúng chiều: 28 dự báo (62.2%)
  Sai chiều: 17 dự báo (37.8%)
  So sánh ngành: Trên trung bình (65% là trung bình)

Chi tiết theo loại:
  - Price target (SPT): 18 dự báo, 11 đúng (61%)
  - Sector rotation: 12 dự báo, 8 đúng (67%)
  - Crash call: 5 dự báo, 4 đúng (80%) ← Mạnh ở crash call
  - Rally call: 10 dự báo, 5 đúng (50%) ← Yếu ở rally call

Thời gian dự báo:
  - 1 tháng: 65% chính xác (tốt)
  - 3 tháng: 58% chính xác (trung bình)
  - 6+ tháng: 52% chính xác (dưới trung bình)

PHÂN TÍCH BIAS:

VNDirect bias: SLIGHTLY BULLISH
  - Sell signal tỷ lệ: 10% (ngành 20% → bias mua)
  - Bull call tỷ lệ: 45% (ngành 35% → bias mua rõ)
  - Kết luận: VNDirect hơi lạc quan (khó phát bán)

XUNG ĐỘT LỢI ÍCH:

[MEDIUM] Vốn riêng + cổ phiếu ngân hàng:
  VNDirect sở hữu 8.5% VCB (đối tác chiến lược)
  Khả năng: VNDirect có động cơ mua VCB → bias bullish VCB
  Giảm độ tin cậy: -8 điểm
  Khuyến cáo: Cẩn thận với dự báo VCB từ VNDirect

[LOW] Giao dịch nhà riêng:
  VNDirect có bộ phận proprietary trading (2% PnL hàng năm)
  Khả năng: Có xung đột tài chính
  Giảm độ tin cậy: -3 điểm

ĐIỂM TIN CẬY ĐÍNH CHÍNH:

Điểm gốc: 85/100
- Giảm vì lịch sử phạt: -5 điểm
- Giảm vì bias bullish: -8 điểm
- Giảm vì xung đột VCB: -3 điểm
- Giảm vì proprietary trading: -3 điểm
+ Cộng vì crash call tốt: +6 điểm

= Điểm cuối cùng: 72/100

KHUYẾN CÁO:

Dự báo chung từ VNDirect: CÓ GIÁ TRỊ (72% credibility)
  - Phù hợp cho analyst research
  - Nhưng cần cross-check với hơn 1 nguồn

Dự báo crash call từ VNDirect: RẤT ĐỨC (80% accuracy)
  - Nên theo dõi nếu VNDirect gọi SELL
  - Đã verify lịch sử: 4/5 crash calls đúng

Dự báo VCB từ VNDirect: CẢNH BÁO (bias +8 điểm)
  - VNDirect có xung đột (sở hữu 8.5% VCB)
  - Giảm độ tin cậy: 72% → ~55-60%
  - Phương án: Cân nhắc hoặc dùng 3+ dự báo từ brokers khác

DỰ BÁO ĐẠI LOẠI KHÁC: BÌNH THƯỜNG (72%)
  - Phù hợp cho quy tắc biểu quyết (vote)
  - Nhưng weight thấp hơn broker cao credibility (VCBS, Maybank)

ĐIỂM TIN CẬY NGÀNH SO SÁNH:

Broker           Điểm    Status            Notes
──────────────────────────────────────────────────
VCBS              82    Cao (excellent)   No sanctions, high accuracy
Maybank           80    Cao (excellent)   No sanctions, balanced view
VNDirect          72    Trung bình-tốt    Medium bias, 1 old sanction
SHS               68    Trung bình        High bullish bias
FPTS              65    Trung bình        Weak on long-term calls
Viet Capital      58    Thấp              History of sanctions
Asia Plus         50    Thấp              Poor track record

KHOẢNG THỜI GIAN ĐỘC LẬP:

Nếu VNDirect phát hành dự báo hôm nay (2026-05-05):
  - Độ tin cậy để theo dõi: 72%
  - Discount nếu xung đột VCB: -15%
  - Độ tin cậy thực tế (VCB specific): 57%

KHUYẾN CÁO CUỐI CÙNG:

VNDirect là broker CÓ GIÁ TRỊ nhưng:
  1. CẨN THẬN với dự báo VCB (bias, sở hữu)
  2. TIN TƯỞNG dự báo crash/sell (accuracy cao)
  3. CROSS-CHECK dự báo chung với VCBS hoặc Maybank
  4. THEO DÕI dự báo 1-3 tháng (không 6+)
```

## Usage

```json
{
  "tool_name": "get_broker_credibility",
  "input": {
    "broker": "VNDirect"
  }
}
```

## Data Sources

- `ssc_broker_registry` — SSC sanction history and status
- `broker_forecasts` table — historical SPT, sector calls with outcomes
- `broker_holdings` — proprietary positions and sở hữu in listed companies
- `broker_trades_pnl` — proprietary trading desk performance

## Related Tools

- `get_alerts` — aggregated broker consensus vs single broker
- `sequential_market_analysis` — cross-check broker views with independent analysis
- `compare_stocks` — broker competition on coverage accuracy

---

## Implementation Notes

- **SSC sanction check:** Real-time lookup; historical weight decays over 2 years
- **Forecast accuracy:** Computed from actual outcomes vs published SPT/sentiment within 1-month window
- **Conflict of interest scoring:** Automated flag if broker sở hữu >5% or has 2+ conflicts
- **Bias detection:** Comparison of sell/hold/buy ratio vs market-wide consensus
- **Confidence discount:** 5-20 points per conflict of interest

## Credibility Thresholds

| Score | Classification | Trust Level |
|-------|-----------------|------------|
| 80+ | Excellent | High confidence, minimal caveats |
| 70-80 | Good | Above average, normal cross-check |
| 60-70 | Average | Equal to market, diversify sources |
| 50-60 | Below average | Discount forecasts, many caveats |
| <50 | Poor | Low trust, use rarely |

## Vietnamese Notes

- **Xác minh** = Verification / credibility check
- **Công ty chứng khoán** = Securities broker / brokerage
- **Phạt từ SSC** = SSC sanction
- **Dự báo** = Forecast / outlook
- **Xung đột lợi ích** = Conflict of interest
- **Độ chính xác** = Accuracy / track record
