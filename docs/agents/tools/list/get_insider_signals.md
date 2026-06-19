---
tool: get_insider_signals
category: sector
agents: [cowork, market-analyst, qa]
---

# `get_insider_signals`

**Category:** Sector | **Used by:** cowork, market-analyst, qa

Phân tích giao dịch nội bộ của lãnh đạo công ty và tạo tín hiệu mua/bán/mass-buy cho cổ phiếu.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `code` | string | Yes | — | Mã cổ phiếu, ví dụ VCB, HPG |
| `outstandingShares` | number | No | 0 | Số cổ phiếu đang lưu hành. Không bắt buộc — mặc định 0 nếu bỏ qua. Khi bằng 0, tín hiệu phần trăm bị bỏ qua (honest skip). Không có auto-fetch: caller cần cung cấp nếu muốn phân loại theo % lưu hành. |
| `windowDays` | number | No | 30 | Cửa sổ thời gian cho mass insider buy (ngày) |
| `transactions` | array | No | [] | Danh sách giao dịch cần phân tích. Lấy từ `get_insider_transactions`. Nếu bỏ qua, trả về "không có tín hiệu". |

## Returns

Plain-text Vietnamese report showing:
- Recent insider transactions (buys/sells by board, executives, major shareholders)
- Transaction volumes and prices
- Confidence classification (MASS_BUY, BUY, HOLD, SELL, MASS_SELL)
- Historical precedent (past similar patterns and 3-month returns)
- Market sentiment alignment
- Recommendations

## Output Example

```
=== TÍN HIỆU NỘI BỘ (INSIDER SIGNALS) ===
Mã: VCB | Thời gian: 30 ngày qua

GIAO DỊCH NỘI BỘ:

[BUY] 2026-05-03: Phạm Viết Thắng (Phó Chủ tịch HĐQT)
  Mua: 50.000 cổ phiếu
  Giá: 32.200 VNĐ/cổ
  Giá trị: 1.610 tỷ VNĐ
  % Sở hữu hiện tại: 2.1%
  Độ tin cậy: 92% (mua vào giá thấp, nhà ngoài nhìn)

[BUY] 2026-04-28: Trần Ngọc Tâm (Giám đốc điều hành)
  Mua: 30.000 cổ phiếu
  Giá: 31.800 VNĐ/cổ
  Giá trị: 954 tỷ VNĐ
  % Sở hữu hiện tại: 0.8%
  Độ tin cậy: 88%

[SELL] 2026-04-22: Nguyễn Hữu Độ (Thành viên HĐQT)
  Bán: 100.000 cổ phiếu
  Giá: 31.500 VNĐ/cổ
  Giá trị: 3.150 tỷ VNĐ
  % Sở hữu hiện tại: 1.2% (vẫn nắm)
  Độ tin cậy: 62% (có thể tái cân bằng, không phải rủi ro)

PHÂN LOẠI TÍN HIỆU:

Tổng số giao dịch 30 ngày: 3
  Mua (BUY): 2 giao dịch (1.564 tỷ VNĐ)
  Bán (SELL): 1 giao dịch (3.150 tỷ VNĐ)

Tỉ lệ buy/sell: 1.97 (2 mua : 1 bán)
  Kết luận: BUY signal (Insider tự tin)

Thang điểm insider:
  BUY volume: 49 (1.564 tỷ) vs 90-day avg (800M)
  Signal strength: MEDIUM-STRONG
  Khuyến cáo: MUA

TIÊN LỆ LỊCH SỬ:

Giao dịch tương tự trong quá khứ:
  2025-04: Phạm Viết Thắng mua 40K cổ, 3 tháng sau +12.3%
  2024-10: Trần Ngọc Tâm mua 25K cổ, 3 tháng sau +8.7%
  2024-08: Nguyễn Hữu Độ bán 80K (bình thường), 3 tháng sau +2.1% (không ảnh hưởng)

Kết luận: Mua của lãnh đạo có tương quan dương (+10% trung bình 3 tháng)

SƠ ĐỒ GIAO DỊCH:

Thời gian    Người          Loại   Lượng    Giá      Tín hiệu
─────────────────────────────────────────────────────────────
2026-05-03   P.V. Thắng     BUY    50K     32.20    STRONG
2026-04-28   T.N. Tâm       BUY    30K     31.80    MEDIUM
2026-04-22   N.H. Độ        SELL   100K    31.50    NEUTRAL

KHUYẾN CÁO:

Tín hiệu ngoài: MUA [STRONG]
  - 2 lãnh đạo mua trong 5 ngày (kết nối?)
  - Giá mua 31.8-32.2 gần thấp kỳ gần đây
  - Lịch sử: Mua này kỳ vọng +10% 3 tháng

Rủi ro: THẤP
  - Không có bán khối lớn từ lãnh đạo chính
  - Người bán (Độ) chỉ bán một phần sở hữu (62% còn lại)

Tác động giá dự báo:
  - 1 tuần: +1-2% (tín hiệu mua)
  - 1 tháng: +4-6% (nếu không có tin tức xấu)
  - 3 tháng: +8-12% (historical precedent)

KHUYẾN CÁO GIAO DỊCH:
  Chiến lược: MUA
  Entry: 31.5-32.0 VNĐ (current level)
  Target: 34-35 VNĐ (3-tháng)
  Stop loss: 30.5 VNĐ
  Confidence: 85%
```

## Usage

Minimal call (code only — outstandingShares omitted, defaults to 0):
```json
{
  "tool_name": "get_insider_signals",
  "input": {
    "code": "VCB"
  }
}
```

With outstanding shares (enables % classification):
```json
{
  "tool_name": "get_insider_signals",
  "input": {
    "code": "VCB",
    "outstandingShares": 4674000000,
    "windowDays": 30,
    "transactions": []
  }
}
```

## Data Sources

- `insider_transactions` table — board/management trades (via `get_insider_transactions`)
- `market_prices` — transaction price validation
- Outstanding shares: caller-provided only (no auto-fetch; use `get_market_cap` to obtain `shares_outstanding_approx` if needed)

## Related Tools

- `get_crisis_early_warning` — management misconduct flags
- `get_legal_risk_signals` — insider trading violations
- `analyze` — causal chain: insider confidence → stock performance

---

## Implementation Notes

- **Insider definition:** Board members, executives, major shareholders (>5%)
- **Buy/sell scoring:** Buy volumes multiplied by 1.5× weight vs sells; same-day patterns count double
- **Historical precedent:** Aggregates past 2 years of similar trades, calculates 3-month returns
- **False positive filter:** Requires $5M+ volume or >1% sở hữu change to flag
- **Update frequency:** Weekly (T+1 from SSC filings)

## Signal Classification

| Signal | Buy Count | Volume (tỷ VNĐ) | 3-Month Return | Action |
|--------|-----------|-----------------|----------------|--------|
| MASS_BUY | 5+ | >5 tỷ | Avg +18% | STRONG BUY |
| BUY | 2-4 | 1-5 tỷ | Avg +10% | BUY |
| HOLD | ≤1 or mixed | <1 tỷ | Avg +2% | HOLD |
| SELL | 1+ big sells | >2 tỷ | Avg -5% | SELL |
| MASS_SELL | 3+ exits | >5 tỷ | Avg -15% | STRONG SELL |

## Vietnamese Notes

- **Giao dịch nội bộ** = Insider trading / insider transactions
- **Lãnh đạo** = Leadership / executives
- **Sở hữu** = Ownership / shareholding
- **Khối lượng** = Volume
- **Tín hiệu mua** = Buy signal
- **Tiên lệ lịch sử** = Historical precedent
