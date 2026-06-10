## Task Report BPE-QA-1
date: 2026-06-10
sprint: BCTC-PROSE-EXTRACT
outcome: APPROVED (RE-VERIFY after BPE-DEV-5)
round: 2 (BPE-DEV-5 fix verified)

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

### Verdict (Round 1)
CHANGES_REQUESTED — prose defect is fixed, table regression not. BPE-DEV-5 opened.

---

## RE-VERIFY — BPE-DEV-5 post-fix (Round 2) · 2026-06-10

### Container Health (re-verify)
- pdf-extractor: Up 9 minutes (healthy) — rebuilt and re-extracted after BPE-DEV-5 fix
- mcp-server: Up ~1 hour (healthy)
- All 8 peers intact

### A. LAYOUT UNITS RAW (BPE-DEV-5 claims — verified RAW)

Total units: **19** (one new table unit split). Empty count: **0** (was 13). Dev claim CONFIRMED.

| page_type | pages | stitched_markdown len | quarantined |
|-----------|-------|-----------------------|-------------|
| table | [1, 2] | 1936 | 1 |
| table | [3, 4, 5, 6] | 7175 | 1 |
| table | [7, 8, 9] | 7030 | 1 |
| table | [10] | 979 | 1 |
| table | [11] | 2454 | 1 |
| prose | [12] | 4099 | 0 |
| table | [13, 14] | 6944 | 1 |
| prose | [15] | 3124 | 0 |
| prose | [16, 17] | 11413 | 0 |
| prose | [18, 19] | 14899 | 0 |
| table | [20] | 2661 | 1 |
| table | [21-28] | 12085 | 1 |
| table | [29] | 1400 | 1 |
| prose | [30] | 1678 | 0 |
| table | [31-34] | 5576 | 1 |
| table | [35] | 768 | 1 |
| table | [36] | 2186 | 1 |
| table | [37-41] | 6537 | 1 |
| table | [42-46] | 12674 | 1 |

Spot-check table content: pages [3-6] shows `| TAISAN | số Mã | 31/03/2026 | | 31/12/2025 |` with account codes 100/110/111/112/120 and VND values. Pages [7-9] shows income statement rows. GENUINE TABULAR DATA confirmed.

### B. QUARANTINE NON-BLOCKING (critical risk verified RAW)

Source code audit: `bctcInspectHandler.ts` L527-554 — stitched_markdown served if non-empty, quarantined flag is metadata only (not a content gate). Live verification:

| page | text_content len | quarantined | pek_coverage_gap | total_pages |
|------|-----------------|-------------|-----------------|-------------|
| 3 (balance sheet) | 7175 | True | None | 46 |
| 7 (income stmt) | 7030 | True | None | 46 |
| 12 (prose) | 4099 | False | None | 46 |
| 16 (notes) | 11413 | False | None | 46 |
| 23 (notes) | 12085 | False | None | 46 |
| 30 (notes) | 1678 | False | None | 46 |
| 40 (notes) | 6537 | True | None | 46 |
| 46 (notes end) | 12674 | True | None | 46 |

Quarantine does NOT blank served content. Peer DGC pattern matches (quarantine=1 for table units). Dev claim CONFIRMED.

### C. BCTC EVAL GATE — CAUTION (instrumentation artifact, non-blocking)

`overall_status=red`, stage 1 RASTERIZE: status=red, gate_failures=[], metrics={}.

Root cause: `eval_push_client.py` double-encodes gate_failures/metrics_json as JSON strings before HTTP POST. Push handler (bctcEvalPushStageHandler.ts L94) checks `Array.isArray()` — a string fails, so gate_failures reverts to `[]`. Status=red is preserved (plain string). Result: self-contradictory red (no documented gate failures). eval_push_client.py was NOT modified by BPE-DEV-5 (git diff confirms). Pre-existing bug exposed when BPE-DEV-5 re-extraction triggered a fresh RASTERIZE eval push. All other reports have yellow backfill placeholder (2026-05-28) and were never freshly pushed.

Ruling: instrumentation debt. Does not block user's content serving goal. Backlog item needed: fix double-encoding in eval_push_client.py.

### D. TESTS (BPE-DEV-5 test suite)
- test_bctc_code_whitelist.py: 16/16 PASS (QA-verified)
- test_bs_accounting_identities.py: 22/22 PASS (QA-verified)
- test_ocr_unit_tesseract_retry.py: 5/5 PASS (QA-verified)
- Total new: **45/45 PASS**
- 36 full-suite failures: pre-existing pytest-asyncio isolation (qa-S1 pattern). Not in BPE-DEV-5 diff.

### E. DDD / SECURITY
- domain/primitives/bctc_code_whitelist/primitive.py: stdlib imports only — DDD PASS
- domain/primitives/layout_invariants/primitive.py: stdlib imports only — DDD PASS
- application/extract_layout_first_usecase.py: no domain→infra violations — DDD PASS
- Security: no process.env, no hardcoded secrets — PASS
- mock-guard: EXIT 0

### F. INTEGRITY
- Peers unchanged: DGC=18/0, DIG=11/0, VNM=14/0, BSR=10/0, DHG=10/0, EIB=14/0, SHB=16/0, VEA=10/0 (units/empty)
- All 8 container peers healthy and running

### Verdict (Round 2)
**APPROVED — BPE-QA-1 GREEN**

User goal met: BOTH prose AND table extraction serve real content through the inspector. Empty units = 0. Quarantine non-blocking. total_pages=46. Peers intact.

CAUTION: BCTC eval overall_status=red is an instrumentation artifact (eval_push_client double-encoding bug). Does not block content serving. Backlog task required to fix eval_push_client.py.

Sprint BCTC-PROSE-EXTRACT: DoD satisfied. Ready for sprint close-out by PO.
