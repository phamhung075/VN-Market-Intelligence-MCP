## Task Report: LF-DEPLOY — BCTC-LAYOUT-FIRST Phase 0 Live Verification Gate

**Sprint:** BCTC-LAYOUT-FIRST Phase 0  
**Date:** 2026-06-03T07:00Z  
**Verdict: CHANGES_REQUESTED**  
**QA Agent:** qa cycle-189

---

## [QA] Review Record

### Summary

4 blocking ACs FAIL on direct DB evidence. LF-OVERLAY code passes all unit tests (34/34) and the structured-path 0-regression is confirmed. The failures are in the LF-EXTRACT Tier 0 document-map algorithm misclassifying FPT page 3 as prose, causing schema_page=4 instead of the brief-required schema_page=3.

---

### Test Results

| Suite | Files | Pass | Fail |
|---|---|---|---|
| LF-OVERLAY unit | 1272-push-bctc-layout.test.ts + 1273-bctc-inspect-overlay.test.ts | 34 | 0 |
| BCTC regression battery | 042/043/044/045-bctc-*.test.ts | 69 | 0 |
| LF-EXTRACT unit | test_layout_invariants.py + test_document_map.py + test_schema_inheritance.py | 115 | 0 |
| tsc --noEmit (mcp-server) | | EXIT 0 | — |

**Full suite (mcp-server):** 10380 pass / 401 fail — failures are pre-existing (Task 308 Dynamic Tool Registry, newsHeadlinesRefreshJob E2E); ZERO new failures in BCTC or LF scope.

DDD scan: clean. Security scan: clean. mock-guard: not applicable (no production code change in this gate cycle).

---

### Per-AC Verdict

| AC | Verdict | Raw Evidence |
|---|---|---|
| AC-LFE-0 (no semantic labels in branching logic) | PASS | `grep -rn "BẢNG CÂN ĐỐI\|NGUỒN VỐN..."` → line 747 is in a comment block (whitespace description), not branching logic. |
| **AC-LFE-1 (pages 3,4,5,6 same unit)** | **FAIL** | DB: page 3 is unit `eea7d237` `page_type=prose`, pages 4-8 are unit `6277fa2a`. Pages 3-6 do NOT share one unit_id. Brief requires all 4 in same unit. |
| **AC-LFE-2 (schema_inherited_from_page=3 for page 5)** | **FAIL** | DB: `SELECT schema_inherited_from_page FROM bctc_page_zones WHERE report_id='e8ea3df5...' AND page_number=5` → `4`. Brief requires `3`. Root cause: Tier 0 fingerprinting classifies page 3 as prose (1 column detected, page_type=prose), so schema_page of the balance-sheet unit is page 4, not 3. |
| **AC-LFE-3 (page 41 is prose)** | **FAIL** | DB: `SELECT page_type FROM bctc_page_zones WHERE ... AND page_number=41` → `table`. Page 41 is in unit `af08a61a` with pages 37-44, classified as table. Brief requires prose or blank. |
| AC-LFE-4 (NGUON VON / code-300 present in stitched output) | CONDITIONAL PASS | `SELECT stitched_markdown FROM bctc_layout_units WHERE schema_page=3` → NULL (no such unit). However, unit schema_page=4 stitched_markdown contains `NGUỒN VỐN Mã số`, `C. NỢ PHẢI TRẢ 300 28.464.058.214.856 44.393.950.887.086`, `D. VỐN CHỦ SỞ HỮU 400 24 40.122.036.570.361`, total `440 68.586.094.785.217`. Data present and not scrambled in the actual unit. AC wording targets schema_page=3 which doesn't exist — CONDITIONAL PASS on data quality but FAIL on AC literal (schema_page=3 query). |
| AC-LFE-5 (corpus breadth 18 docs) | OPEN | DB: `SELECT COUNT(DISTINCT report_id) FROM bctc_layout_units` → 14 (not 18). Deferred per task instructions — single-doc FPT proof required first. |
| AC-LFE-6 (one Tesseract pass per page, Tier 0 uses no Tesseract) | PASS | `image_to_data` at line 2241 is in `_process_page` (old path), at line 3646 is in `ocr_unit()` (Tier 2 path). `build_document_map()` uses PIL pixel ops + stored OCR text only — no Tesseract import or call in Tier 0. |
| AC-LFE-7 (structured path non-regression) | PASS | `git diff HEAD -- apps/pdf-extractor/infrastructure/text_table_extractor.py` → empty. DB: `SELECT balance_pass FROM bctc_balance_checks WHERE report_id='e71f845d...'` → `1`. |
| AC-LFE-8 (local tools only) | PASS | `layout_first_push_client.py` uses urllib stdlib. grep on extraction code path: 0 hits for requests/httpx/aiohttp/cloud SDKs. |
| AC-LFE-9 (sequential, no batch sweep) | PASS | `grep run_bctc_batch_sweep apps/pdf-extractor/application/extract_layout_first_usecase.py` → comment only ("NOT invoked anywhere in this path."). |
| AC-LFE-10 (sandbox green) | UNTESTABLE | Container working dir is `/app`, sandbox is at `/app/sandbox/runner.py`. Container runtime reports healthy. Local test not runnable (requires container pip env). Not blocking. |
| **AC-LFE-11 (quarantined unit count > 0)** | **FAIL** | DB: `SELECT quarantined, COUNT(*) FROM bctc_layout_units GROUP BY quarantined` → only `{quarantined:0, cnt:177}`. No quarantined unit across all 14 reports. Quarantine path unexercised on real corpus. |
| AC-LFO-0 (toggle present) | PASS | `id="zone-overlay-toggle" data-zone-toggle="true"` confirmed at bctc-inspector.html line 877. |
| AC-LFO-1 (zones endpoint returns data) | PASS | `GET /api/bctc-inspect/zones/e8ea3df5.../4?page=4` → JSON with `column_gutters:[{col_id:"col_0",...}]`, positional IDs, no semantic labels. |
| AC-LFO-2 (no pdf-extractor import) | PASS | grep returns 0 actual imports; 3 comment-only matches confirmed non-import. |
| AC-LFO-3 (structured path non-regression) | PASS | 69 BCTC regression tests green. `bctc_balance_checks WHERE report_id='e71f845d...'` → `balance_pass=1`. `bctc_table_rows` count 891 unchanged. |
| AC-LFO-4 (zero cross-write) | PASS | Test (f) in 1272: bctc_table_rows=0 after push. DB: bctc_layout_units=177 rows, bctc_table_rows=891 rows (no cross-write). |
| AC-LFO-5 (idempotent push) | PASS | Tests (c)+(h-DV) confirm: double-push with same UUIDs = count 2 not 4. |
| AC-LFO-6 (zone types visually distinct) | PASS | 6 distinct color classes: headerBand/#ffc850, footerBand/#ff8c3c, gutterEven/#50a0ff, gutterOdd/#50dca0, rowBand/#c864dc, unitBoundary/#ff5050 at bctc-inspector.html:2170-2175. |
| AC-LFO-7 (corpus breadth 18 page_zones) | OPEN | DB: `SELECT COUNT(DISTINCT report_id) FROM bctc_page_zones` → 14. Deferred per task instructions. |
| 0-REGRESSION | PASS | get_bctc_full(FPT): financial_reports net_profit=2476789.83, total_assets=68586094.79, refine_status=DONE — correct values, layout push did NOT overwrite. bctc_table_rows=891 (stable). balance_checks FPT Q4 balance_pass=1. 69 BCTC tests green. |

---

### Blocking Issues

**BLOCK-1: AC-LFE-1 + AC-LFE-2 — Tier 0 misclassifies FPT page 3 as prose**

`apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` — `build_document_map()`, Tier 0 fingerprinting.

Root cause: The low-DPI projection-profile fingerprinting on FPT Q1 2026 page 3 detects only 1 column (col_0, x_min=0, x_max=1654 — the full page width). This is a false single-column read of a page that visually is a multi-column balance sheet header. Because `gutter_count < 2` or the density gate fails, page 3 is tagged `page_type=prose` and placed in its own standalone unit. The real balance-sheet unit starts at page 4 (schema_page=4). Consequently, page 5 inherits page 4's schema (`schema_inherited_from_page=4`) not page 3's.

The brief's core claim — schema_inherited_from_page=3 for page 5 — is the root-cause fix for the FPT continuation-page scramble. This criterion is UNMET.

Fix required: The Tier 0 page-3 fingerprint must detect the balance-sheet columns. Likely cause: the 50-DPI low-resolution raster of page 3 has a cover/title layout (e.g. a report header spanning full width), causing the projection profile to produce a single wide column with no gutters, while the actual table structure starts partway down the page. The `build_document_map()` function needs to either: (a) raise the density threshold / adjust gutter detection to correctly group pages 3-8 into one unit, OR (b) if page 3 is genuinely a prose/header page, the architectural assumption that balance_sheet starts at page 3 in the FPT Q1 doc is incorrect and the brief's AC must be updated to reflect the actual document structure.

Owner: dev-pdf-extractor. File: `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py`, function `build_document_map()`.

**BLOCK-2: AC-LFE-3 — page 41 classified as table, not prose**

DB: page 41 has `page_type=table` in unit `af08a61a` (pages 37-44). Brief requires page 41 to be prose or blank to prove geometry is the sole spine. The FPT Q1 document has pages 37-44 in one unit with table fingerprint — page 41 may genuinely have table structure (notes tables) or this is another misclassification.

Owner: dev-pdf-extractor. Same function `build_document_map()`.

**BLOCK-3: AC-LFE-11 — quarantine path dead on real corpus**

All 177 layout units across 14 reports show `quarantined=0`. The three invariant checkers (balance identity, codes monotonic, orphan rows) are not triggering on any real document. This could mean: (a) the invariants are too lenient in threshold, or (b) the invariants are not being exercised at all in the pipeline. The quarantine path must be proven non-dead-code on real documents.

Owner: dev-pdf-extractor. File: `apps/pdf-extractor/application/extract_layout_first_usecase.py`, `gate_unit()` / invariant checkers.

---

### Non-Blocking Notes

- AC-LFE-4: Liabilities data IS present and correct in the actual unit (schema_page=4). The pipeline correctly stitches NGUON VON/code-300 data. The failure is only in the AC literal (which queries schema_page=3 that doesn't exist in the live DB). If BLOCK-1 is fixed and schema_page becomes 3, AC-LFE-4 will pass automatically.
- AC-LFE-5 / AC-LFO-7: Corpus breadth 14 vs 18 — deferred per instructions, honest OPEN.
- Full suite 401 pre-existing failures are NOT regressions from this sprint.

---

### Disposition

LF-DEPLOY: IN_PROGRESS (CHANGES_REQUESTED)  
LF-EXTRACT: IN_PROGRESS (send back to dev-pdf-extractor — BLOCK-1, BLOCK-2, BLOCK-3)  
LF-OVERLAY: DONE (all 7 LFO ACs pass; code correct; 0-regression confirmed)  
Sprint BCTC-LAYOUT-FIRST: IN_PROGRESS (blocked on LF-EXTRACT Tier 0 fix)  
G9-ready: NO — blocked on AC-LFE-1/2/3/11

NEXT: dev-pdf-extractor | fix Tier 0 build_document_map() for FPT page-3 grouping + verify AC-LFE-3 page-41 classification + confirm quarantine path is exercised (BLOCK-1/2/3)
