---
source_name: vmt-nso-monthly-probe
sprint: VN-MACRO-TOOLING
probe: PROBE-3
recon_date: 2026-06-14
verdict: PASS
unblocks: VMT-3b, VMT-4
---

# Recon: NSO/GSO Monthly Socio-Economic Release (IIP, Retail, FDI, CPI)

## Source URL
`https://www.nso.gov.vn/` (new GSO domain — National Statistics Office)

## CRITICAL TLS NOTE
`www.gso.gov.vn` has a **TLS SAN mismatch** — cert is issued for `nso.gov.vn` (new brand), served at `www.gso.gov.vn`. System cacert alone fails (`SSL: no alternative certificate subject name matches`).

**Fix — per policy no `-k`; instead pin the intermediate cert:**
```bash
# One-time setup: download GlobalSign RSA OV SSL CA 2018 intermediate
curl -s "http://secure.globalsign.com/cacert/gsrsaovsslca2018.crt" -o /tmp/gs_int_raw.crt
openssl x509 -inform DER -in /tmp/gs_int_raw.crt -out /tmp/gs_int.pem
cat /etc/ssl/certs/ca-certificates.crt /tmp/gs_int.pem > /tmp/combined_ca.pem
# Now use: curl --cacert /tmp/combined_ca.pem https://www.nso.gov.vn/...
```

## Working Request Recipe
```bash
COMBINED_CA=/tmp/combined_ca.pem  # see TLS setup above
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# 1. Discover latest monthly report URL from index page
curl -s --cacert "$COMBINED_CA" -L \
  -H "User-Agent: $UA" -H "Accept-Language: vi-VN,vi;q=0.9" \
  "https://www.nso.gov.vn/bao-cao-tinh-hinh-kinh-te-xa-hoi-hang-thang/"

# 2. Fetch press release page (to find Excel download link)
curl -s --cacert "$COMBINED_CA" -L \
  -H "User-Agent: $UA" -H "Accept-Language: vi-VN,vi;q=0.9" \
  "https://www.nso.gov.vn/bai-top/2026/06/bao-cao-tinh-hinh-kinh-te-xa-hoi-thang-nam-va-5-thang-dau-nam-2025-2/"

# 3. Download monthly Excel (all indicators)
curl -s --cacert "$COMBINED_CA" -L \
  -H "User-Agent: $UA" \
  "https://www.nso.gov.vn/wp-content/uploads/2026/06/02.-Bieu-T5.2026-final.xlsx" \
  -o /tmp/gso_monthly_may2026.xlsx
```

## HTTP Probe Results
- HTTP status: 200 (nso.gov.vn)
- Final URL: `https://www.nso.gov.vn/bai-top/2026/06/bao-cao-tinh-hinh-kinh-te-xa-hoi-thang-nam-va-5-thang-dau-nam-2025-2/`
- Platform: WordPress CMS
- Anti-bot: None
- Monthly Excel size: 646,186 bytes (contains 19 sheets)
- IIP dedicated Excel: 20,883 bytes

## Anti-Bot Assessment
**Type:** None
**Technique:** Standard HTTPS fetch with GlobalSign intermediate cert

## Page Structure

### All 5 indicators NOT on one page — they are in separate Excel sheets
- Press release HTML page: text-only narrative (0 HTML tables)
- **All structured data is in Excel downloads**
- Monthly Excel (`02.-Bieu-T{M}.{YYYY}-final.xlsx`) contains ALL indicators in 19 sheets

### Sheet Map (confirmed from May 2026 Excel)
| Sheet index | Sheet name | English |
|---|---|---|
| 1 | 1.Nong nghiep | Agriculture |
| **2** | **2.IIPthang** | **IIP (monthly industrial production)** |
| 3 | 3.SPCNthang | Industrial production by product |
| 4 | 4.LĐCN | Industrial labor |
| 11 | 11. VĐT | Public/total investment |
| **12** | **12.FDI** | **Foreign Direct Investment** |
| **13** | **13. Tongmuc** | **Retail sales & consumer services** |
| 14 | 14. XK | Exports |
| 15 | 15. NK | Imports |
| **16** | **16.CPI** | **Consumer Price Index** |
| 17 | 17. VT HK | Passenger transport |
| 18 | 18. VT HH | Freight transport |
| 19 | 19. KQT | International visitors |

### IIP Sheet (2.IIPthang) — Columns
```
Col 1: Sector/subsector name (Vietnamese)
Col 2: Tháng 04 vs cùng kỳ năm trước (%)
Col 3: Tháng 05 vs cùng kỳ năm trước (%)
Col 4: 05 tháng vs cùng kỳ năm trước (%)
Col 5: Tháng 05 vs tháng trước (%)
```
Sample row: `["Công nghiệp chế biến, chế tạo", "168.4", "99.56", "184.43", "166.47"]`

### Retail Sales Sheet (13. Tongmuc) — Columns
```
Col 1: Category (Vietnamese)
Col 2: Tháng 5 absolute (tỷ đồng)
Col 3: Cộng dồn 5 tháng (tỷ đồng)
Col 4: % tháng 5 vs cùng kỳ năm trước
Col 5: % 5 tháng vs cùng kỳ năm trước
```
Total retail May 2026: 643,765 tỷ đồng (+11.83% YoY)

### FDI Sheet (12.FDI) — Columns
```
Col 1: Province/entity
Col 2: Số dự án (Number of projects)
Col 3: Vốn đăng ký (Registered capital, triệu USD)
Col 4: Vốn thực hiện (Disbursed capital, triệu USD)
```
Total 5M 2026: 24,810 M USD registered (+34.9% YoY)

### CPI Sheet (16.CPI) — Structure
**15 categories present (11 main + 4 subcategories):**
```
CHỈ SỐ GIÁ TIÊU DÙNG (Total CPI)
  Hàng ăn và dịch vụ ăn uống (Food & Dining)
    Lương thực (Staple food/foodstuffs)
    Thực phẩm (Food products)
    Ăn uống ngoài gia đình (Dining out)
  Đồ uống và thuốc lá (Beverages & Tobacco)
  May mặc, giày dép và mũ nón (Clothing & Footwear)
  Nhà ở, điện nước, chất đốt và VLXD (Housing & Utilities)
  Thiết bị và đồ dùng gia đình (Household Equipment)
  Thuốc và dịch vụ y tế (Health)
  Giao thông (Transport)
  Thông tin và truyền thông (Communication)
  Giáo dục (Education)
  Văn hoá, giải trí và du lịch (Culture & Tourism)
  Hàng hóa và dịch vụ khác (Other)
```

**CPI weights NOT in Excel table.** Weights are published in a separate CPI methodology PDF (updated ~every 5 years). Only index values (multiple reference periods) are in the sheet.

**CPI columns:**
```
T04/2025 vs kỳ gốc | T05/2025 vs kỳ gốc | T05/2026 vs kỳ gốc | T05/2026 vs T04/2026 | BQ 5T/2026 vs BQ 5T/2025
```

**May 2026 CPI (from press release text):**
- vs prior month: +0.29%
- vs Dec 2025: +3.61%
- vs same period 2025 (YoY): +5.60%
- 5M 2026 avg YoY: +4.31%
- Core inflation 5M 2026 YoY: +4.04%

## URL Discovery Pattern
Monthly index: `https://www.nso.gov.vn/bao-cao-tinh-hinh-kinh-te-xa-hoi-hang-thang/`
Lists recent reports as `bai-top/{YYYY}/{MM}/bao-cao-...` links.

Excel URL: found in the press release page as a `.xlsx` download link (`wp-content/uploads/{YYYY}/{MM}/02.-Bieu-T{N}.{YYYY}-final.xlsx`).

## Parse Strategy Recommendation
**Excel download path** (not HTML — no HTML tables in press releases).
1. GET index URL → find latest `bai-top/` link
2. GET press release page → regex find `.xlsx` download URL
3. GET Excel → parse with `excelize` (Go) or `openpyxl` (Python)
4. Read named sheets by name (stable) — do NOT use positional sheet index

## Sample Response Excerpt
From index page — most recent reports:
```
bai-top/2026/06/bao-cao-tinh-hinh-kinh-te-xa-hoi-thang-nam-va-5-thang-dau-nam-2025-2/
bai-top/2026/05/bao-cao-tinh-hinh-kinh-te-xa-hoi-thang-tu-va-4-thang-dau-nam-2026/
bai-top/2026/04/bao-cao-tinh-hinh-kinh-te-xa-hoi-quy-i-nam-2026/
```

## Files
- Script: `scripts/probes/vmt-probe-3.sh`
- Sample: `scripts/probes/vmt-3-sample.json`
