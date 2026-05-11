---
tool: get_pharma_signals
category: sector
agents: [cowork, market-analyst]
---

# `get_pharma_signals`

**Category:** Sector | **Used by:** cowork, market-analyst

Get recent pharma sector signals: drug approvals (DAV), disease outbreaks, hospital tenders, price regulations, FDI. Filter by stock code and time window.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `stock` | string | No | — | Stock ticker code to filter by (e.g. 'DAV', 'DHG'). Omit for all pharma stocks. |
| `days` | number | No | 30 | Look-back window in days (default: 30, max: 90) |
| `signalType` | enum | No | all | Filter by signal type: all, approvals, tenders, regulations, outbreaks, fdi |

## Returns

Plain-text Vietnamese report showing:
- New drug approvals and pricing
- Hospital tender results and volumes
- Regulatory price changes
- Disease outbreak impacts
- FDI/partnership announcements
- Sector confidence classification
- Stock impact estimates

## Output Example

```
=== TÍN HIỆU NGÀNH DƯỢC ===
Thời gian: 30 ngày qua

--- PHÁT HÀNH THUỐC MỚI / PHỤC VỤ ---

[POSITIVE] 2026-05-02: DAV - Phê duyệt 2 loại thuốc ung thư mới
  Loại thuốc: Lenvatinib + Pembrolizumab
  Nguồn gốc: Phê duyệt từ FDA (Hoa Kỳ)
  Tác động: DAV có độc quyền phân phối Việt Nam 3 năm
  Doanh số dự báo: +150-200 tỷ VNĐ/năm
  Giá lên: Dự báo +3-4%
  Tác động EPS: +5-8% (lợi suất cao từ ung thư)

[POSITIVE] 2026-04-25: DHG - Phê duyệt Amlodipine generics (SX nội địa)
  Loại thuốc: Hạ huyết áp generics
  Công suất: 15 tấn/tháng (chi phí sản xuất thấp)
  Doanh số dự báo: +80-120 tỷ VNĐ/năm
  Giá lên: Dự báo +1-2%
  Tác động EPS: +2-3% (lợi suất thấp, nhưng volume lớn)

--- THẦU BỆNH VIỆN ---

[POSITIVE] 2026-04-30: Thầu Bệnh viện Bạch Mai (HCM)
  Nhà thầu: DHG + DAV (liên doanh)
  Giá trị hợp đồng: 320 tỷ VNĐ (3 năm)
  Danh sách: 45 loại thuốc (tất cả generic)
  Tỉ lệ giành được: 95% (rất cao)
  Tác động: +32 tỷ VNĐ/năm doanh số
  Giá lên cỡ: +0.5-1%

[NEUTRAL] 2026-04-15: Thầu Bệnh viện Việt Đức
  Nhà thầu chính: Công ty Dược A (cạnh tranh cao)
  Giá trị hợp đồng: 180 tỷ VNĐ (2 năm)
  Danh sách: 30 loại thuốc
  Tỉ lệ giành được: 60% (trung bình)
  Tác động: Netral (dự báo có)

--- QUY ĐỊNH / ĐIỀU CHỈNH GIÁ ---

[NEGATIVE] 2026-04-20: QUY ĐỊNH MỚI - Giảm giá thuốc ung thư từ 30%
  Nhà nước quyết định: Giảm giá các loại thuốc ung thư để tiếp cận đông hơn
  Lên hiệu lực: 2026-06-01
  Tác động: DAV doanh số ung thư có thể tăng 50% nhưng lợi nhuận giảm 20-30%
  Giá lên: Dự báo -2-3% (lo ngại lợi nhuận)
  Tác động EPS: -1-2% (tăng volume nhưng lợi suất giảm)
  Khuyến cáo: GIẢM (DAV có rủi ro)

[POSITIVE] 2026-04-10: Giảm mức ưu tiên VAT cho thuốc rằng bệnh bán lẻ
  Nhà nước quyết định: Từ 5% → 0% VAT cho thuốc không kê đơn
  Tác động: Giảm giá 4-5% → volume tăng 20-30%
  Tác động: DHG lợi nhuận tăng vì chi phí thấp hơn
  Giá lên: Dự báo +1-2%
  Tác động EPS: +2-4%

--- DỊCH BỆNH / CẬP CỨU ---

[POSITIVE] 2026-04-28: Cảnh báo sốt xuất huyết tại Nam Bộ (cao hơn bình thường 20%)
  Số ca: 15.000 ca (tương đương bình thường 12.500 ca)
  Thời gian: Dự báo kéo dài 2-3 tuần nữa
  Tác động: Thuốc sốt xuất huyết tăng nhu cầu 15-20%
  Lợi nhuận: DHG, DAV lợi suất cao (bán điều trị)
  Giá lên: Dự báo +1-2%
  Tác động EPS: +1-2% (tạm thời 2-3 tuần)

[NEGATIVE] 2026-03-15: Bệnh viêm dạ dày tại Bắc Bộ (thấp hơn bình thường 15%)
  Số ca: 8.000 ca (thấp)
  Tác động: Thuốc viêm dạ dày nhu cầu giảm
  Lợi nhuận: DHG (bao 40% từ viêm dạ dày) rủi ro giảm -1-2%

--- ĐẦU TƯ NƯỚC NGOÀI / HỢP TÁC ---

[POSITIVE] 2026-04-25: DAV ký hợp đồng với Tập đoàn Novartis
  Nội dung: DAV trở thành đại lý độc quyền Novartis tại Việt Nam (5 năm)
  Danh sách: 20 loại thuốc (phạm vi rộng)
  Doanh số dự báo: +250-350 tỷ VNĐ/năm
  Tác động EPS: +8-12% (lâu dài, 5 năm)
  Giá lên: Dự báo +3-5% (đáng kể)

[POSITIVE] 2026-04-10: DHG xây dựng nhà máy sản xuất mới (FDI: Samsung + Takeda)
  Công suất: 50 tấn/năm (tăng 200%)
  Đầu tư: 800 triệu USD
  Thời gian hoàn thành: 2027
  Tác động: Sản xuất tự chủ +200%, chi phí -15-20%
  Tác động EPS: +5-8% (từ 2027)
  Giá lên: Dự báo +2-3%

TỔNG KẾT:

Sentiment ngành: TÍCH CỰC (net +4 signals)

Cổ phiếu được lợi:
  DAV [+4.5% dự báo]: Phê duyệt mới + hợp tác Novartis rất tốt
  DHG [+2.5% dự báo]: VAT, generic, nhà máy mới tích lũy tốt

Cổ phiếu rủi ro:
  DAV [-2% từ quy định giảm giá] — nhưng có thể offset bằng volume

KHUYẾN CÁO:
  DAV [MUA MẠNH]: Novartis + phê duyệt = catalyst mạnh
  DHG [MUA]: VAT + nhà máy mới = long-term value
  Pharma ngành: TÍCH CỰC outlook, tăng weight
```

## Usage

```json
{
  "tool_name": "get_pharma_signals",
  "input": {
    "stock": "DAV",
    "days": 30,
    "signalType": "approvals"
  }
}
```

## Data Sources

- `news_articles` — drug approvals, hospital tenders, regulatory news
- `bactc` quarterly — pharma company revenues by drug category
- WHO/Vietnam Ministry of Health — disease outbreak data
- Hospital tender databases — publicly announced bids
- FDI tracking services — partnership announcements

## Related Tools

- `get_bctc_full` — detailed pharma company revenue breakdown
- `compare_stocks` — DAV vs DHG vs other pharma
- `analyze` — causal chain: drug approval → stock appreciation

---

## Implementation Notes

- **Signal classification:** Approvals (positive, 3-6 month impact), tenders (timing-dependent), regulations (variable), outbreaks (1-2 week impact), FDI (long-term positive)
- **Confidence scoring:** 85%+ for approvals/tenders (documented); 70%+ for outbreaks (duration uncertain)
- **Update frequency:** Daily (news), Weekly (disease surveillance), Monthly (tenders)
- **Revenue impact:** Based on historical drug/generic pricing, market size, competitive landscape

## Pharma Stock Categories

| Stock | Focus | Key Drivers |
|-------|-------|-----------|
| DAV | Innovation + tenders | Drug approvals, distributor role |
| DHG | Generic + contract | Volume growth, margin optimization |
| DPC | General + retail | Pharmacy network, OTC sales |
| DMC | Contract manufacturing | Capacity, cost leadership |

## Vietnamese Notes

- **Phê duyệt thuốc** = Drug approval
- **Thầu bệnh viện** = Hospital tender
- **Quy định giá** = Price regulation
- **Dịch bệnh** = Disease outbreak
- **Hợp tác FDI** = FDI partnership
- **Bán lẻ / điều trị** = Retail / therapeutic treatment
