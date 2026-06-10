## Task Report BPE-QA-1
date: 2026-06-10
sprint: BCTC-PROSE-EXTRACT
outcome: CHANGES_REQUESTED

### Scope
End-to-end live verification gate for FPT Q1-2026 (report_id=e8ea3df5-3f32-413d-a3eb-c71634c0438d) after BPE-DEV-3 (OCR fix), BPE-OPS-1 (re-OCR 46 pages), BPE-DEV-4 (layout-first re-flow + prose units).

### Container Health
- mcp-server: Up 28 min (healthy), port 3000
- pdf-extractor: Up 42 hours (unhealthy — pre-existing, not introduced by sprint)
- All 8 peers intact (rag-service, news-fetch, macro-indicators, frontend, api-gateway, mcp-gateway — all healthy)

### Test Results
- Unit tests: N/A (live end-to-end serving verification — no new unit tests in BPE-QA-1 scope)
- Raw API probing: all checks executed against live container endpoints

### A. Prose / Non-Table Pages — PASS

| Check | Result |
|-------|--------|
| Page 12 `text_content` length | 4099 chars |
| Page 12 `has_pek` | true |
| Page 12 `pek_coverage_gap` | null (covered) |
| Page 12 `confidence` | 1.0 |
| Page 12 text | Vietnamese prose confirmed: "THUYẾT MINH BÁO CÁO TÀI CHÍNH HỢP NHẤT" |
| `total_pages` on all responses | 46 (GAP-1 fix confirmed) |
| Page 16 | 5706 chars, PEK unit covered |
| Page 23 | 794 chars, fallback OCR text |
| Page 30 | 1678 chars, PEK unit covered |
| Page 40 | 2120 chars, fallback OCR text |
| Page 46 | 1845 chars, fallback OCR text |
| Original defect ("No OCR text for page 12") | RESOLVED |

### B. Table Pages — REGRESSION CONFIRMED (BLOCKING)

**bctc_layout_units for report e8ea3df5:**
- Total units: 18
- Non-empty (prose pages): 5 (schema_pages 12, 15, 16, 18, 30 — all page_type=prose)
- **Empty (table pages): 13 — all page_type=table**

| schema_page | page_type | page_numbers | sm_len | Status |
|-------------|-----------|--------------|--------|--------|
| 1 | table | [1,2,3,4,5,6] | 0 | EMPTY — REGRESSION |
| 7 | table | [7,8,9] | 0 | EMPTY — REGRESSION |
| 10 | table | [10] | 0 | EMPTY — REGRESSION |
| 11 | table | [11] | 0 | EMPTY — REGRESSION |
| 12 | prose | [12] | 4099 | OK |
| 13 | table | [13,14] | 0 | EMPTY — REGRESSION |
| 15 | prose | [15] | 3124 | OK |
| 16 | prose | [16,17] | 5706 | OK |
| 18 | prose | [18,19] | 7449 | OK |
| 20 | table | [20] | 0 | EMPTY — REGRESSION |
| 21 | table | [21,22,23,24,25,26,27,28] | 0 | EMPTY — REGRESSION |
| 29 | table | [29] | 0 | EMPTY — REGRESSION |
| 30 | prose | [30] | 1678 | OK |
| 31 | table | [31,32,33,34] | 0 | EMPTY — REGRESSION |
| 35 | table | [35] | 0 | EMPTY — REGRESSION |
| 36 | table | [36] | 0 | EMPTY — REGRESSION |
| 37 | table | [37,38,39,40,41] | 0 | EMPTY — REGRESSION |
| 42 | table | [42,43,44,45,46] | 0 | EMPTY — REGRESSION |

What serving clients see for table pages (pp.1-10): `pek_coverage_gap:true` → fallback to raw OCR from pdf_extracted_text (unstructured scan text, not structured table rows). No structured tabular content is served.

Comparison with other reports: DGC, DIG, VNM, EIB, SHB, DHG, BSR, VEA all have `empty=0` table units. FPT Q1-2026 is the only report with 13 empty table units — regression is isolated to this sprint's layout-first re-flow invocation.

### C. Data Integrity — PASS

- pdf_extracted_text for FPT: **46/46 pages present** (all pages 1-46), confidence=0.8 each
- Pages 11-22: all 12 present, lengths 1801-7449 chars
- Pages 36-46: all 11 present, lengths 1013-3324 chars
- No other ticker's data affected (62 distinct filenames in pdf_extracted_text — all non-FPT rows untouched)

### Issues Found

#### Blocking
- `apps/pdf-extractor/` — BPE-DEV-4 layout-first re-flow populated prose units (schema_pages 12, 15, 16, 18, 30) but left ALL 13 table-type units with `stitched_markdown=''`. Table pages covering the balance sheet (pp.1-6), income statement (pp.7-10), and notes appendix tables (pp.20-28, 31-35, 36-46) serve empty structured content. User requirement: "detect table and no table for extract text or table" — requires BOTH paths populated. Empty table units = 72% of the PDF's content units are blank.

### Verdict
CHANGES_REQUESTED — prose defect is fixed, table regression not. Sprint BCTC-PROSE-EXTRACT stays OPEN.

### Next Task
BPE-DEV-5 (to be created on board): dev-pdf-extractor owns `apps/pdf-extractor/` — run a proper full `/extract-layout-first` re-flow for FPT Q1-2026 now that CPU load has normalized. The re-flow must populate BOTH table-type AND prose-type `stitched_markdown` fields without overwriting populated units with empty placeholders. Target: 0 empty units for this report_id (matching the DGC/DIG/VNM pattern).
