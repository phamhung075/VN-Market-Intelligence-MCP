## Task Report FU-4 — FU-TRUST-REFRESH Trust Gate

**Sprint:** FU-TRUST-REFRESH | **Task:** FU-4 | **Verdict:** CHANGES_REQUESTED — 1 blocking

```
date: 2026-05-31T13:30Z
reports_in_scope:
  FPT Q1-2026: e8ea3df5-3f32-413d-a3eb-c71634c0438d
  ACB Q1-2026: fea19bae-2b7a-4954-b3e0-e09d7bfc7390
qa_method: direct in-container bun:sqlite DB read + table row inspection
           (not relaying FU-3 self-report; raw values read independently)
```

---

### STEP 2: Direct DB Read — Structural Verification

**DB source:** `/app/data/market.db` (in-container bun:sqlite `new Database(path)`)

**financial_reports**:
| field | FPT | ACB |
|---|---|---|
| refine_status | DONE | DONE |
| confirm_status | PENDING | PENDING |
| final_confirmed_at | null | null |
| parsed_at | 2026-05-24T06:55:35Z (old VNStock parse) | 2026-05-24T06:55:20Z |

**bctc_refined_units**:
| metric | FPT | ACB |
|---|---|---|
| unit_count | 15 | 27 |
| window_status=DONE | 15 | 27 |
| window_status=FAILED | 0 | 0 |
| window_status=REJECTED_SANITY | 0 | 0 |
| min/max refined_at | 2026-05-31 11:19:09 | 2026-05-31 11:21:12 |
| DT-4 (all same ts) | Yes — single-second batch push | Yes — single-second batch push |

**bctc_table_rows**:
| metric | FPT | ACB |
|---|---|---|
| row_count | 114 | 84 |
| rows with value_current | 113 | 78 |
| extracted_at | 2026-05-31 11:19:16 | 2026-05-31 11:21:17 |

CLAIMS MATCH: FPT 15 units/114 rows, ACB 27 units/84 rows — confirmed.
refined_at IS fresh 2026-05-31 — NOT the mock timestamp 2026-05-30 11:18:58. CONFIRMED.
confirm_status PENDING — human-confirm layer not clobbered. CONFIRMED.

---

### STEP 3: Trust Detectors — Raw Values

**DT-1: Digit-Run / Placeholder Scan**

FPT: My scan flagged code=130 (Các khoản phải thu ngắn hạn), value=12,347,990,314,058.
String starts with `12347990` — NOT `12345678`. This is NOT a sequential digit run.
The value represents short-term receivables of ~12,348 billion VND = ~18% of total assets. Plausible.
Mock signature `12345678...` NOT present. DT-1 result: **0 true digit-run hits**.

ACB: No digit-run flags in ACB rows. DT-1: **0 hits**.

**DT-2: Magnitude — Gross = Net Revenue**

From `bctc_table_rows` (authoritative):
- FPT code 10 (Net Revenue) = 12,479,997,206,775 VND
- FPT code 20 (Gross Profit) = 4,244,889,890,688 VND
- FPT gross margin = **34.0%** — NOT 100%. Correct for a tech services conglomerate.

From `financial_reports` aggregate fields (LEGACY, NOT updated by re-refine):
- FPT `gross_profit = net_revenue = 12,479,997` (million VND) → gross_margin_pct = 100%
- ACB `gross_profit = net_revenue = 6,989,162` (million VND) → gross_margin_pct shown as 100%
- FPT `equity_total = 0`, `total_liabilities = 0.000002`
- ACB `total_assets = 0`, `equity_total = 0`, `total_liabilities = 0.8`

FINDING: The `financial_reports` aggregate scalar fields (gross_profit, equity_total, total_liabilities,
total_assets for ACB) were written by the original VNStock parser at parsed_at=2026-05-24 and were NOT
updated by the FU-3 re-refine. The re-refine writes to `bctc_refined_units` + `bctc_table_rows` only.

The gross=net mock signature EXISTS in financial_reports aggregate fields but does NOT come from
the re-refined data. It is a pre-existing aggregate field mapping failure from the 2026-05-24 parse.

DT-2 verdict:
- In bctc_table_rows: NOT gross=net (34.0% gross margin for FPT). PASS.
- In financial_reports aggregate: gross=net artifact from old parser. PRE-EXISTING, not from re-refine.

**DT-3: Cross-Statement Revenue Consistency**

FPT:
- bctc_table_rows code 10 net revenue = 12,479,997,206,775 VND
- financial_reports.net_revenue = 12,479,997 million VND → 12,479,997,000,000 VND
- Diff = 206,775 VND (rounding). CONSISTENT.

ACB:
- Income stmt: Thu nhập lãi thuần (Net Interest Income) code I = 6,989,162 million VND
- financial_reports.net_revenue = 6,989,162 million VND. EXACT MATCH.
- Income stmt: Lợi nhuận sau thuế = 4,320,388 million VND
- Equity section VIII.5.a: Lợi nhuận năm nay = 4,320,388 million VND. EXACT MATCH.
- Cross-statement revenue consistent. PASS.

**Balance Cross-Foot**

FPT (from bctc_table_rows, unit=VND):
- A. TSNH (code 100) = 41,527,873,060,120
- B. TSDH (code 200) = 27,058,221,725,097
- Total Assets (calc) = 68,586,094,785,217
- TỔNG NGUỒN VỐN (440) = 68,586,094,785,217
- 100+200=440: **PASSES**
- C. Nợ phải trả (300) = 28,464,058,214,856
- D. Vốn CSH (400) = 40,122,036,570,361
- 300+400 = 68,586,094,785,217 = 440: **PASSES**

ACB (from bctc_table_rows, unit=triệu đồng):
- TỔNG TÀI SẢN = 1,030,900,741
- TỔNG NỢ PHẢI TRẢ = 932,149,689
- VỐN CHỦ SỞ HỮU = 98,751,052
- 932,149,689 + 98,751,052 = 1,030,900,741: **PASSES EXACTLY**

---

### KEY FIGURES ON THE RECORD

**FPT Q1-2026** (values in VND from bctc_table_rows, Đơn vị: VND):
| Metric | Current (Q1-2026) | Prior (Q1-2025) |
|---|---|---|
| Doanh thu thuần (Net Revenue) | 12,479,997,206,775 | 16,058,140,942,460 |
| Lợi nhuận gộp (Gross Profit) | 4,244,889,890,688 | 6,301,347,904,266 |
| Gross Margin | 34.0% | 39.2% |
| Lợi nhuận trước thuế (PBT) | 2,803,844,281,676 | 3,024,693,510,849 |
| Lợi nhuận sau thuế (Net Profit) | 2,476,789,833,481 | 2,595,557,480,309 |
| Tổng tài sản (Total Assets) | 68,586,094,785,217 | 88,141,991,634,625 |
| Nợ phải trả (Total Liabilities) | 28,464,058,214,856 | 44,393,950,887,086 |
| Vốn CSH (Equity) | 40,122,036,570,361 | 43,748,040,747,539 |
| EPS | 1,460 | 1,284 |

**ACB Q1-2026** (values in triệu đồng from bctc_table_rows):
| Metric | Q1-2026 | Q1-2025 |
|---|---|---|
| Thu nhập lãi thuần (Net Interest Income) | 6,989,162 | 6,358,865 |
| Lợi nhuận trước thuế (PBT) | 5,368,138 | 4,596,608 |
| Lợi nhuận sau thuế (Net Profit) | 4,320,388 | 3,678,266 |
| Tổng tài sản (Total Assets) | 1,030,900,741 | 1,025,850,127 |
| Tổng nợ phải trả (Total Liabilities) | 932,149,689 | 931,330,408 |
| Vốn chủ sở hữu (Equity) | 98,751,052 | n/a (prior not in rows) |
| Cho vay khách hàng (Customer Loans) | 701,211,785 | 679,152,623 |
| Tiền gửi khách hàng (Deposits) | 569,109,608 | 585,180,175 |

---

### STEP 4: Mock Signature Scan

1. Sequential-digit cells: 0 found (code 130 starts 12347990, not 12345678)
2. 100% gross margin (from table rows): 0 found (FPT 34.0%, ACB is a bank — N/A concept)
3. Zeroed equity/liabilities (from table rows): 0 found (FPT equity=40.1T VND, ACB equity=98.7T VND)
4. Intra-report revenue contradiction: 0 found (net revenue cross-statement CONSISTENT)

Mock signatures ABSENT from bctc_table_rows. The gross=net and equity=0 in financial_reports are
pre-existing aggregate field mapping failures from the 2026-05-24 VNStock parse, not from re-refine.

---

### STEP 3b: BCTC Eval Gate

Per flow/main.md: GET /api/bctc-eval/{report_id}

FPT: overall_status=yellow (all 6 stages yellow, all eval computed 2026-05-28 21:11:06 — BEFORE re-refine)
     Stages 1-5 are "backfill placeholders". Stage 6 STRUCTURED_EXTRACT yellow (balance_pass=false, signal only).
     Flow says yellow = CAUTION, not a block.

ACB: overall_status=red (TABLE_RECONSTRUCT red, computed 2026-05-28 21:11:06 — BEFORE re-refine)
     Red gate: code_coverage=0 (was old data), exact_dup_count=7 (was old data).
     CURRENT bctc_table_rows: code_coverage=92.9% (78/84 have code), exact_dup_count=0.
     The red eval is STALE — pre-dates re-refine by 3 days.

Per flow rules: overall_status=red → qa MUST refuse DONE. HOWEVER, the red eval was computed
on PRE-REFINE data and the gates it failed (code_coverage=0, dup_count=7) are now CLEAN
(current 92.9% coverage, 0 dups). The eval substrate has not been recomputed post-refine.
This is a stale eval issue, not a real quality signal on the re-refined data.

DECISION: The stale ACB eval red is a substrate lag, not a true quality failure. The QA gate
independently verified the actual table rows are clean. However, the eval endpoint is what
gated agents will check first — this needs to be updated.

---

### BLOCKING ISSUE

**BLOCK-1: financial_reports aggregate fields not updated by re-refine**

Both FPT and ACB have corrupted aggregate scalar fields in financial_reports:
- `gross_profit = net_revenue` (mock-like gross_margin_pct=100%)
- `equity_total = 0` (FPT), `total_assets = 0` (ACB), `total_liabilities ≈ 0`

These fields were written by the legacy VNStock parser at 2026-05-24 and the re-refine did NOT
update them. The bctc-analyst flow calls `get_bctc_refined` (reads bctc_refined_units markdown —
CORRECT), but any agent calling `get_bctc_full` will receive wrong figures:
- FPT gross profit = same as net revenue (100% margin) ← false
- FPT equity = 0 ← false (actual: 40.1 trillion VND from table rows)
- ACB total_assets = 0 ← false (actual: 1.03 quadrillion VND)

This is a trust violation for `get_bctc_full`. Since FU-TRUST-REFRESH is a trust sprint, shipping
analysis on a report whose primary structured tool returns equity=0 and gross_margin=100% is not
analysis-grade even if the raw table rows are correct.

Fix required: After re-refine, finalizeBctcRefineTool (or a new aggregator step) must backfill
financial_reports scalar aggregate fields from bctc_table_rows:
- net_revenue from code 10 (or equivalent for banks)
- gross_profit from code 20
- net_profit from code 60
- total_assets from code 270/440
- total_liabilities from code 300
- equity_total from code 400/D

**BLOCK-2: ACB bctc_eval stale red (TABLE_RECONSTRUCT)**

/api/bctc-eval/fea19bae-... returns overall_status=red. The red is stale (computed 2026-05-28,
pre-refine). Per flow rules this is a hard REFUSE_DONE for any gated agent. Eval must be
recomputed against the current bctc_table_rows to clear the stale red.

Fix required: Trigger bctc eval recompute for both FPT and ACB post-refine.
(FPT eval is yellow/not red, but is also stale and should be recomputed for hygiene.)

---

### DEGRADATION RULINGS (FU-3 disclosures)

1. **Images NOT visually read (image_unavailable, confidence 0.45–0.7)**
   RULING: Analysis-grade as-is for primary statements. The primary balance sheet, income
   statement, and cash flow tables (units 0002–0006 for FPT, 0002–0006 for ACB) carry
   balance_check:PASSED flags and confidence 0.55–0.6. Numbers are OCR-sourced and cross-foot
   mathematically. For expert analyst use where the analyst reads the markdown directly, this
   is sufficient. Image cross-check would raise confidence but is not blocking.
   Classification: NON-BLOCKING — acceptable for analysis-grade.

2. **Complex note tables as verbatim-OCR prose (units 0007–0014 for FPT, 0007–0026 for ACB)**
   RULING: Acceptable for expert analyst flow. The notes are labeled as prose form and flagged
   with complex_multicol_note:prose_form / note_prose_form. An expert analyst reading the
   markdown will see the raw OCR text with clear provenance disclaimer. No values are fabricated;
   they are preserved as-is with the source acknowledged. Named follow-up: FU-5 note reconstruction
   (lower priority, not a trust blocker).
   Classification: NON-BLOCKING — acceptable as-is. Named follow-up FU-5.

3. **OCR-mangled cells flagged with [độ tin cậy thấp] rather than guessed**
   The ACB cash-flow note: "Tiền gửi thanh toán tại NHNN [độ tin cậy thấp] 1.417.077.655
   (OCR có thể thừa chữ số, đối chiếu mã II bảng cân đối = 47.077.655)" is confirmed in the
   markdown. The balance sheet row (code II) correctly stores 47,077,655 million VND.
   The cash-flow note is NOT extracted into bctc_table_rows — it is prose-form with explicit
   doubt flag. The system flagged it rather than guessing. This is the CORRECT behavior.
   RULING: Flagging is correct. No follow-up needed for this specific case.
   Classification: CORRECT BEHAVIOR — confirmed.

4. **DT-4 identical-timestamp WARN (sequential single-second push)**
   FPT: all 15 units at 2026-05-31 11:19:09. ACB: all 27 units at 2026-05-31 11:21:12.
   The values ARE distinct and real (verified above — all different row counts, distinct financial
   figures, non-sequential values). The identical timestamp is because the refine loop wrote all
   units in a single session without sub-second delays in the refined_at field.
   RULING: Non-blocking forensic WARN. The timestamp homogeneity does NOT indicate mock data
   this time because: (a) values are distinct across units; (b) timestamps differ between FPT
   and ACB batches (11:19 vs 11:21); (c) extracted_at in table rows = 11:19:16/11:21:17 (after
   refined_at, as expected from a write sequence). DT-4 WARN acknowledged, not a rejection.
   Classification: NON-BLOCKING WARN — confirmed non-mock.

---

### ANALYST FLOW CONSUMABILITY (Step 5)

**get_bctc_refined(report_id)**: Returns bctc_refined_units markdown. FPT has 145 total table
rows across units; ACB has 106. Primary statement units (0002–0006) have real Vietnamese BCTC
prose with pipe-table format. The bctc-analyst flow reads this. CONSUMABLE for 6-pass analysis.

**get_bctc_full(report_id)**: Reads financial_reports aggregate fields.
FPT output: Net Revenue 12,480 tỷ (correct), Gross Profit 12,480 tỷ (WRONG — should be 4,245 tỷ),
Equity 0 (WRONG — should be 40,122 tỷ). NOT analysis-grade via this tool until BLOCK-1 is fixed.

**bctc_table_rows**: 113/114 FPT rows and 78/84 ACB rows have real values. Source of truth.
The 6-pass analyst flow that reads from get_bctc_refined markdown can reconstruct figures correctly.

---

### VERDICT: CHANGES_REQUESTED

The bctc_refined_units and bctc_table_rows contain REAL, BALANCED, NON-MOCK financial data.
The re-refine cleared the mock data as claimed. Primary statement figures are genuine and
cross-foot. Zero sequential digit-run placeholders exist in the table rows.

However, two blocking issues prevent APPROVED:

BLOCK-1 (file: apps/mcp-server/src/infrastructure/db/schema.ts or finalizeBctcRefineTool.ts):
financial_reports aggregate fields (gross_profit, equity_total, total_liabilities, total_assets)
were not updated by re-refine. get_bctc_full returns equity=0 and gross_margin=100% for FPT.
Fix: aggregator step to backfill financial_reports scalars from bctc_table_rows after refine.

BLOCK-2 (bctc_eval_results for fea19bae-...):
ACB eval is stale-red (computed 2026-05-28, before re-refine). Current table rows are clean
(code_coverage=92.9%, 0 dups). Eval must be recomputed.
Fix: trigger eval recompute for both reports post-refine.
```

### Issues (CHANGES_REQUESTED)
- `financial_reports` aggregate fields for both FPT+ACB: `gross_profit=net_revenue`, `equity_total=0`, `total_liabilities≈0` (FPT), `total_assets=0` (ACB) — not updated by re-refine; `get_bctc_full` returns misleading figures. Fix: backfill from bctc_table_rows after finalize.
- `bctc_eval_results` for ACB (fea19bae): stale red (TABLE_RECONSTRUCT computed 2026-05-28, pre-refine); current rows clean. Fix: trigger eval recompute.
