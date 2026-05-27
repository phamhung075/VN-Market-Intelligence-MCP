---
tool: get_legal_risk_signals
category: sector
agents: [cowork, market-analyst, qa]
---

# `get_legal_risk_signals`

**Category:** Sector | **Used by:** cowork, market-analyst, qa

Get recent legal risk signals (khởi tố, phong tỏa tài sản, truy thu thuế, etc.) for watchlist stocks. Returns Vietnamese plain-text summary.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `stock` | string | No | — | Stock ticker code to filter by (e.g. 'VCB'). Omit for all stocks. |
| `days` | number | No | 30 | Look-back window in days (default: 30, max: 90) |

## Returns

Plain-text Vietnamese report showing:
- Legal cases (khởi tố) by stock
- Asset freezes (phong tỏa tài sản) with dates and amounts
- Tax disputes (truy thu thuế) with penalties
- Regulatory sanctions
- Severity classification and confidence scores

## Output Example

```
=== TÍN HIỆU RỦI RO PHÁP LÝ ===
Thời gian: 30 ngày qua

--- Khởi tố / Điều tra ---
[CRITICAL] VNM: Khởi tố Giam giữ - Nghi án rửa tiền (2026-05-02)
  Khách: Trần Văn A (Chủ tịch)
  Độ tin cậy: 92%
  Tác động: Có thể ảnh hưởng đến hoạt động kinh doanh

--- Phong tỏa tài sản ---
[HIGH] HPG: Phong tỏa 500 tỷ VNĐ (2026-04-28)
  Lý do: Tranh chấp hợp đồng xây dựng
  Thời gian: Chưa rõ
  Độ tin cậy: 85%

--- Truy thu thuế ---
[MEDIUM] VJC: Truy thu thuế 120 tỷ VNĐ (2026-04-20)
  Năm: 2024
  Khoản: Thuế VAT
  Độ tin cậy: 78%

TỔNG KẾT: 3 rủi ro được phát hiện — VNM có mức độ CRITICAL
```

## Usage

```json
{
  "tool_name": "get_legal_risk_signals",
  "input": {
    "stock": "VNM",
    "days": 30
  }
}
```

## Data Sources

- `news_articles` — legal case mentions (keyword-based extraction)
- `legal_events` table (if populated) — structured legal event data
- External news APIs — Vietnamese financial news sources
- Regulatory databases — SSC, NHNN sanction lists

## Related Tools

- `get_crisis_early_warning` — velocity-based crisis detection
- `get_insider_signals` — leadership legal issues
- `get_broker_credibility` — broker sanction status

---

## Implementation Notes

- **Data freshness:** News-based; may lag official announcements by 1-2 days
- **Severity levels:** LOW (regulatory inquiry), MEDIUM (administrative fine), HIGH (asset freeze), CRITICAL (criminal investigation)
- **Confidence scoring:** Based on source count and official confirmation status
- **False positive handling:** Filters out rumors; requires 2+ sources for inclusion

## Vietnamese Notes

- **Khởi tố** = Criminal prosecution / investigation
- **Phong tỏa tài sản** = Asset freeze
- **Truy thu thuế** = Tax dispute / back-tax demand
- **Điều tra** = Investigation
- **Độ tin cậy** = Confidence
