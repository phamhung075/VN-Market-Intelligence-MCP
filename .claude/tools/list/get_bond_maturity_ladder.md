---
tool: get_bond_maturity_ladder
category: sector
agents: [cowork, market-analyst, qa]
---

# `get_bond_maturity_ladder`

**Category:** Sector | **Used by:** cowork, market-analyst, qa

Get upcoming corporate bond (TPDN BĐS) maturity calendar for real estate developers. Includes risk alerts for maturities within 7/14/30 days. Returns Vietnamese plain-text report.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `months` | number | No | 6 | Look-ahead window in months (default: 6, max: 24) |

## Returns

Plain-text Vietnamese report showing:
- Bond maturity schedule (issuer, amount, maturity date)
- Interest rate burden
- Developer refinancing risk
- Market conditions for new issuance
- Alert flags for near-term maturities
- Impact on developer stock prices

## Output Example

```
=== LỊCH KỲ HẠN TRỨ VỊ TRÁI PHIẾU DOANH NGHIỆP ===
Khoảng thời gian: 6 tháng (2026-05 → 2026-11)

CẢNH BÁO CẤP BÁCH (7 ngày):
  Không có trái phiếu đáo hạn trong 7 ngày tới

CẢNH BÁO GẦN HẠN (14 ngày):
  Không có trái phiếu đáo hạn trong 14 ngày tới

CẢNH BÁO TRUNG HẠNMID-TERM (30 ngày):
  [MEDIUM] 2026-05-20: DIG phát hành 2.000 tỷ VNĐ, lãi 7.5%
    Nhà phát hành: Công ty Cổ phần BĐS Điều hành (DIG)
    Giá trị phát hành: 2.000 tỷ VNĐ
    Lãi suất: 7.5%/năm
    Khoảng cách: 15 ngày (rủi ro trung bình)
    Tình trạng: Đang báo cáo refinancing plan (xác nhận)
    Tác động: DIG có thể tái phát hành 1.5-2.0 tỷ ở mức 7.8-8.2% (lãi suất tăng)
    Khuyến cáo: THEO DÕI giá cổ phiếu DIG (có thể giảm nếu refinance khó)

  [LOW] 2026-05-25: VNR phát hành 1.500 tỷ VNĐ, lãi 8.0%
    Nhà phát hành: Công ty Cổ phần Bất động sản Việt Nam (VNR)
    Giá trị phát hành: 1.500 tỷ VNĐ
    Lãi suất: 8.0%/năm
    Khoảng cách: 20 ngày (rủi ro thấp)
    Tình trạng: VNR chuẩn bị refinance, câu chuyện tốt, nhu cầu cao
    Tác động: VNR dự báo refinance thành công ở 7.5-8.0%
    Khuyến cáo: GIỮ cổ phiếu (tín dụng ổn định)

--- LỊCH TỔNG QUÁT (6 THÁNG) ---

Tháng 5 (2026-05):
  2026-05-20: DIG 2.000 tỷ (7.5%) — CẢNH BÁO
  2026-05-25: VNR 1.500 tỷ (8.0%) — CẢNH BÁO

Tháng 6 (2026-06):
  2026-06-10: NVL 1.800 tỷ (8.5%) — ĐÃO HẠN 35 NGÀY
  2026-06-15: HBC 1.200 tỷ (9.0%) — ĐÃO HẠN 40 NGÀY

Tháng 7 (2026-07):
  2026-07-05: VRE 2.500 tỷ (9.2%) — ĐÃO HẠN 60 NGÀY
  2026-07-20: IDC 1.500 tỷ (7.8%) — ĐÃO HẠN 75 NGÀY

Tháng 8 (2026-08):
  2026-08-10: KBC 900 triệu (10.0%) — ĐÃO HẠN 95 NGÀY
  2026-08-25: PHR 1.200 tỷ (8.5%) — ĐÃO HẠN 110 NGÀY

Tháng 9 (2026-09):
  2026-09-12: SHB 1.500 tỷ (6.5%) — ĐÃO HẠN 128 NGÀY

Tháng 10-11 (2026-10 to 2026-11):
  2026-10-05: BID 2.000 tỷ (6.0%) — ĐÃO HẠN 150 NGÀY
  2026-11-20: EID 800 triệu (10.5%) — ĐÃO HẠN 195 NGÀY

--- PHÂN TÍCH TỔNG HỢP ---

Tổng giá trị đáo hạn: 17.500 tỷ VNĐ (6 tháng)
  - Tháng 5: 3.500 tỷ (rủi ro CAO)
  - Tháng 6-8: 9.200 tỷ (rủi ro TRUNG)
  - Tháng 9-11: 4.800 tỷ (rủi ro THẤP)

Lãi suất trung bình: 8.25%/năm
  - Xu hướng: Lãi suất cao hơn năm ngoái (+50bp)
  - Mục ý: Thị trường chặt lãi suất cho BĐS

Khả năng refinance:
  - Tốt: VNR, IDC, SHB (tín dụng A+, nhu cầu cao)
  - Trung bình: DIG, NVL, VRE (tín dụng A, có khó khăn)
  - Khó: EID, KBC (tín dụng thấp hơn, lãi suất cao)

--- IMPACT TRÊN CỔ PHIẾU ---

TÍCH CỰC:
  VNR [GIỮ → MUA]: Refinance dễ dàng
  IDC [GIỮ]: Đáo hạn sớm, nhu cầu cao
  SHB [TĂNG]: Lãi suất thấp (6.0%), tái phát hành có lợi

TRUNG LẬP:
  DIG [GIỮ]: Cần theo dõi refinance news
  NVL [GIỮ]: Rủi ro nhẹ, tín dụng ổn định
  VRE [GIỮ]: Khối lượng lớn nhưng khả năng ổn định

TIÊU CỰC:
  EID [GIẢM]: Refinance khó (lãi suất 10.5%), rủi ro tín dụng
  KBC [GIẢM]: Khối lượng nhỏ nhưng lãi suất cao, quản lý dòng tiền khó

KHUYẾN CÁO CHIẾN LƯỢC:

1. THÁNG 5: CẢNH BÁO VỀ LÃNH ĐẠO
   - DIG, VNR đạo hạn: theo dõi thông tin refinance
   - Cổ phiếu có thể giảm 2-5% nếu refinance khó
   - Cổ phiếu có thể tăng 2-3% nếu refinance thành công

2. THÁNG 6-8: ĐỢI KÊNH THAY ĐỔI
   - NVL, VRE có rủi ro: nếu lãi suất lên 9%+, refinance sẽ đắt hơn
   - IDC tích cực: lãi suất thấp, refinance có lợi

3. THÁNG 9-11: ĐIỀU CHỈNH DANH MỤC
   - Vị trí EID, KBC rủi ro cao: xem xét giảm
   - VNR, SHB tích cực: có thể tăng weight

ĐIỂM CẢNH BÁO HỆ THỐNG:
  - Nếu 10Y VN bond lên 8%+, tất cả đạo hạn 6-12 tháng sẽ khó refinance
  - Giám sát lãi suất VND hàng ngày (Bloomberg, VNX)
  - Nếu EID/KBC không công bố refinance plan trong 30 ngày, rủi ro DEFAULT tăng
```

## Usage

```json
{
  "tool_name": "get_bond_maturity_ladder",
  "input": {
    "months": 6
  }
}
```

## Data Sources

- `corporate_bonds` table — maturity dates, coupon rates, issuers
- `watchlist` — filter to RE developers
- `market_prices` — developer stock prices
- Bond prospectuses — refinancing history, issuer credit ratings
- Historical refinancing success rates

## Related Tools

- `get_bctc_full` — developer debt levels and interest burden
- `get_credit_flow_signals` — refinancing market conditions
- `analyze` — causal chain: maturity wall → stock impact

---

## Implementation Notes

- **Risk levels:** CRITICAL (7d), HIGH (14d), MEDIUM (30d), LOW (30-90d)
- **Refinancing probability:** Based on developer credit rating and market conditions
- **Interest rate forecast:** Uses current 10Y VND bond yield as baseline
- **Update frequency:** Weekly (as new maturities approach)
- **Confidence scoring:** 90%+ (official bond data); lower for refinancing predictions

## Developer Bond Risk Matrix

| Developer | Credit | Bond Size (tỷ) | Refinance Risk |
|-----------|--------|-----------------|----------------|
| VNR | A+ | 10-15 | Low |
| NVL | A | 8-12 | Medium |
| DIG | A- | 5-8 | Medium |
| IDC | A | 3-5 | Low |
| VRE | BBB+ | 4-7 | Medium-High |
| EID | BBB | 2-4 | High |

## Vietnamese Notes

- **Trái phiếu doanh nghiệp** = Corporate bonds
- **Đáo hạn** = Maturity date
- **Lãi suất coupon** = Coupon rate
- **Tái phát hành** = Refinance
- **Tường lửa kỳ hạn** = Maturity wall
- **Rủi ro tín dụng** = Credit risk
