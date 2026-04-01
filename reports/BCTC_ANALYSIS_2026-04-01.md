# BCTC Analysis Report — 2026-04-01
**Analyst:** Report Analyzer (Automated)
**Schedule:** Daily 21:00 Vietnam Time
**Cycle:** 2026-04-01T12:13 UTC

---

## Database Status

No financial data exists in the structured DB for any of the 5 watchlist stocks (VEA, VCB, VNM, HPG, FPT).
**Action required:** run `fetch_ssc_reports` to populate the database from the SSC portal.

Two BCTC PDFs were found in storage and analyzed manually this cycle:

| File | Company | Period | Downloaded |
|------|---------|--------|-----------|
| `BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf` | VNM (Vinamilk) | FY2025 Consolidated | 2026-03-29 |
| `000000015802468_Bao_cao_tai_chinh_Rieng_nam_2025.pdf` | VEA (VEAM) | FY2025 Separate | 2026-03-29 |

---

## VNM — Công ty Cổ phần Sữa Việt Nam (Vinamilk)
**Report:** Hợp nhất (Consolidated) | Year ended 31/12/2025 | Auditor: KPMG Vietnam

### Income Statement (unit: VND tỷ)

| Metric | FY2025 | FY2024 | YoY |
|--------|--------|--------|-----|
| Net Revenue (Doanh thu thuần) | 63,645.9 | 61,782.6 | **+3.0%** |
| Gross Profit | 26,209.5 | 25,590.2 | **+2.4%** |
| Gross Margin | 41.2% | 41.4% | −0.2pp |
| Financial Income | 1,496.9 | 1,585.7 | −5.6% |
| Net Profit Before Tax | 11,650.0 | 11,599.7 | +0.4% |
| Income Tax | 2,273.3 | 2,240.9 | +1.4% |
| **Net Profit After Tax** | **9,413.6** | **9,452.9** | **−0.4%** |
| → Attributable to Parent | 9,410.2 | 9,392.3 | +0.2% |
| EPS (VND) | 4,028 | 4,022 | +0.1% |

**Q4 2025 standalone (vs Q4 2024):**
- Revenue: 17,033.6B vs 15,477.1B → **+10.1% YoY**
- NPAT: 2,827.2B vs 2,146.8B → **+31.7% YoY** ✅ (strong Q4 recovery)

### Balance Sheet (31/12/2025, VND tỷ)

| Metric | FY2025 | FY2024 |
|--------|--------|--------|
| Current Assets | 36,261.2 | 37,553.7 |
| Total Assets | 53,312.4 | 55,049.1 |
| Short-term Liabilities | 18,520.3 | 18,459.5 |
| Total Liabilities | 18,829.4 | 18,874.7 |
| Owner's Equity | 34,483.0 | 36,174.4 |
| Short-term Borrowings | 9,393.7 | 9,115.4 |

**Key Ratios:**
- D/E: 18,829 / 34,483 = **0.55** ✅
- Current Ratio: 36,261 / 18,520 = **1.96** ✅
- Gross Margin: **41.2%** ✅ (excellent for FMCG)

### Cash Flow (FY2025, VND tỷ)

| Item | FY2025 | FY2024 |
|------|--------|--------|
| Net CF from Operations | 8,668.1 | 9,685.9 |
| Net CF from Investing | 1,976.1 | (3,739.1) |
| Net CF from Financing | (11,081.9) | (6,641.3) |
| Net Change | (437.7) | (694.4) |
| Ending Cash | 1,794.9 | 2,225.9 |

Note: VNM paid **11,264.5B VND dividends** in FY2025 (+38% vs 8,159.6B in 2024) — explains large negative financing CF.

### Flags

| Flag | Severity | Detail |
|------|----------|--------|
| Inventory build | ⚠️ WATCH | Inventories +20% YoY: 6,839B vs 5,687B — monitor demand absorption |
| Financial income down | ⚠️ WATCH | 1,496.9B vs 1,585.7B (−5.6%) |
| Full-year NPAT slightly down | ⚠️ WATCH | −0.4% YoY; however Q4 was very strong (+31.7%) |
| OCF lower YoY | ⚠️ WATCH | 8,668B vs 9,686B (−10.5%), partly working capital drag |
| Operating CF positive | ✅ OK | Strong absolute level |
| D/E healthy | ✅ OK | 0.55 — no leverage concern |
| Current ratio healthy | ✅ OK | 1.96 — adequate liquidity |

**🟡 VERDICT: STABLE — No critical flags. FY2025 modest growth (+3% revenue); NPAT essentially flat (−0.4%); Q4 very strong (+31.7%). Generous dividend payout. Watch inventory build.**

---

## VEA — Tổng Công ty Máy Động lực và Máy Nông nghiệp Việt Nam (VEAM)
**Report:** Riêng (Separate/Parent-only) | Year ended 31/12/2025

> **Context:** VEA is a holding company. Core earnings are **dividend income from JV stakes**:
> Honda Vietnam (30%), Toyota Vietnam (20%), Ford Vietnam (25%).
> JV dividends (~7.5T VND/year) flow as "Doanh thu hoạt động tài chính" (Financial Income).
> These are correctly reclassified to Investing CF in the cash flow statement.

### Income Statement (VND tỷ)

| Metric | FY2025 | FY2024 | YoY |
|--------|--------|--------|-----|
| Net Revenue (products/services) | 553.5 | 316.9 | **+74.7%** ⬆️ |
| COGS | 522.8 | 290.5 | +80.0% |
| Gross Profit (products) | 30.7 | 26.3 | +16.8% |
| **Financial Income (JV dividends)** | **7,497.6** | **6,531.8** | **+14.8%** ✅ |
| Financial Expenses | 10.5 | 3.1 | +236% (small abs.) |
| Selling Expenses | 24.9 | 19.0 | +31.1% |
| G&A Expenses | 181.8 | 153.1 | +18.7% |
| Net Profit from Operations | 7,332.2 | 6,389.1 | **+14.8%** |
| Net Profit Before Tax | 7,332.2 | 6,391.7 | **+14.7%** |
| Income Tax | 144.2 | 138.3 | +4.3% |
| **Net Profit After Tax** | **7,188.0** | **6,253.4** | **+14.9%** ✅ |

**Q4 2025 standalone (vs Q4 2024):**
- Product revenue Q4: 259.9B vs 68.5B → **+279% YoY** (machinery/equipment sales surge)
- Financial income Q4: 908.6B vs 532.9B → **+70.5% YoY**
- NPAT Q4: 825.3B vs 445.6B → **+85.2% YoY** ✅

### Balance Sheet (31/12/2025, VND tỷ)

| Metric | FY2025 | FY2024 |
|--------|--------|--------|
| Cash & Equivalents | 164.5 | 146.2 |
| Short-term HTM Deposits | 12,559.0 | 11,996.8 |
| Short-term Receivables | 3,800.6 | 3,250.5 |
| Inventories | 533.0 | 664.2 |
| Current Assets | 17,138.7 | 16,138.9 |
| Non-current Assets | 3,591.7 | 3,616.1 |
| **Total Assets** | **20,730.3** | **19,755.0** |
| Total Liabilities | 254.4 | 213.6 |
| **Owner's Equity** | **20,475.9** | **19,541.5** |
| Contributed Capital | 13,288.0 | 13,288.0 |
| Undistributed Earnings | 7,188.0 | 6,253.4 |

**Key Ratios:**
- D/E: 254.4 / 20,475.9 = **0.012** ✅ (virtually zero debt)
- Current Ratio: 17,138.7 / 254.4 = **67.4** ✅ (extraordinary liquidity)
- Net Margin: 7,188 / (553.5 + 7,497.6) = **89.3%** (JV dividend dominated)

### Cash Flow Notes (FY2025)

VEA's operating CF is structurally negative once JV dividend income (7,496B) is excluded from operations and reclassified to investing. This is correct accounting for a holding company — the JV dividends are real cash inflow, just classified under investing activities. **This is not a red flag.**

### Flags

| Flag | Severity | Detail |
|------|----------|--------|
| Operating CF negative (core) | ℹ️ STRUCTURAL | Holding company nature — JV dividends are investing CF. Normal. |
| G&A expenses +18.7% | ⚠️ WATCH | Growing faster than core revenue |
| Large other receivables | ⚠️ WATCH | 4,251.1B receivables (likely JV-related), 973B provision — review note V.5 |
| JV dividends +14.8% | ✅ POSITIVE | Honda/Toyota/Ford Vietnam all delivered strong 2025 |
| Product revenue +74.7% | ✅ POSITIVE | Major surge in machinery/equipment sales |
| Zero debt | ✅ POSITIVE | D/E = 0.012 — fortress balance sheet |
| 12.5T in HTM deposits | ✅ POSITIVE | Ultra-conservative treasury management |

**🟢 VERDICT: STRONG — VEA FY2025 excellent. JV dividends +14.8%, product revenue +74.7%, NPAT +14.9%. Fortress balance sheet (D/E near zero, 12.5T in deposits). No critical flags.**

---

## Market Context (2026-04-01)

- **249 news articles** analyzed today
- **7 alerts triggered** (2 HIGH, 1 MEDIUM, 4 LOW)
- VEA flagged HIGH twice (US mortgage rates + VN market upgrade news — sector sentiment, not VEA-specific)
- **All watchlist stocks positive today**: VCB +1.55%, VNM +1.32%, FPT +0.80%, HPG +0.93%, VEA +0.30%
- **VN-Index −11% YTD** (context from March 31 headlines — broad market weakness)
- **Global**: Lithium rebounds (CNY 160K+/ton), EU carbon at 6-week high (€73.8/ton)

---

## Summary Scorecard

| Stock | Data | Revenue YoY | NPAT YoY | D/E | Current Ratio | OCF | Signal |
|-------|------|-------------|----------|-----|---------------|-----|--------|
| VNM | PDF FY2025 consolidated | +3.0% | −0.4% | 0.55 ✅ | 1.96 ✅ | +8,668B ✅ | 🟡 STABLE |
| VEA | PDF FY2025 separate | +74.7% (products) | +14.9% | 0.012 ✅ | 67.4 ✅ | Structural neg.* | 🟢 STRONG |
| VCB | No DB data | — | — | — | — | — | ⬜ PENDING |
| HPG | No DB data | — | — | — | — | — | ⬜ PENDING |
| FPT | No DB data | — | — | — | — | — | ⬜ PENDING |

*VEA OCF negative is structural for a holding company; investing CF captures JV dividends.

---

## Actions Required

1. **Run `fetch_ssc_reports`** — load VCB, HPG, FPT FY2025 data into DB for automated monitoring
2. **Monitor VNM inventories** — +20% YoY build; confirm demand absorption in Q1 2026
3. **Review VEA receivables** — 4.25T "other receivables" with 973B provision; check Note V.5
4. **VN-Index −11% YTD** — fundamental quality of VNM/VEA remains solid; valuations may be attractive given broad market dip

---
*Report generated: 2026-04-01T12:13 UTC | Next cycle: 2026-04-02T02:00 UTC (09:00 Vietnam)*
