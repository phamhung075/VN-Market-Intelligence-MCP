# dev-pdf-extractor — Notebook

## Working Memory

### 2026-06-07 — FEAT-PDF-EXTRACTOR-LOCAL-INPUT DONE (7aa18020)

**Task:** FEAT-PDF-EXTRACTOR-LOCAL-INPUT | Priority: M/P2 | Status: DONE

**Root cause fixed:** POST /extract only accepted HTTP/HTTPS URLs (HTTPPDFStorageRepository.fetch_pdf did plain aiohttp GET). VPS-hosted PDFs returned 401. Scanned PDFs fell back to Bun pdf-parse → text-layer-only garbage. mcp-server and pdf-extractor already share volume ./data/pdfs:/app/data/pdfs — local-path input mode makes the full OCR pipeline reachable for every already-downloaded PDF.

**Files changed (commit 7aa18020):**
- `infrastructure/repositories.py` — NEW `LocalPDFStorageRepository`: implements `PDFStorageRepository.fetch_pdf` from disk; path-traversal guard (Path.resolve + prefix check), file-existence check, size cap (`PDF_LOCAL_SIZE_CAP_MB` env, default 200 MB)
- `interface/serializers.py` — `ExtractPDFRequestSchema`: url now Optional; `model_validator` requires url OR pdf_path; `to_dto` carries pdf_path through
- `application/dtos.py` — `ExtractPDFRequest`: add `Optional[str] pdf_path` field
- `application/usecases.py` — `ExtractPDFUseCase.execute`: use `pdf_path` as `effective_url` when set → zero domain-layer changes
- `interface/handlers.py` — `register_routes`: add `local_extract_usecase` param; `/extract` branches on pdf_path → local use case; HTTP 503 graceful degrade when local mode not wired
- `main.py` — wire `LocalPDFStorageRepository` + `local_extract_service` + `local_extract_usecase`; inject into `register_routes`
- `__tests__/unit/test_local_pdf_input.py` — NEW: 21 tests (happy path, traversal, missing file, size cap, schema validation, url regression, handler routing)

**Test results:** 842 passed (baseline 821 + 21 new). 40 pre-existing failures unchanged. Zero regressions.

**Consumer-side request shape (dev-mcp-server follow-up):**
```json
POST /extract
{"pdf_path": "/app/data/pdfs/<filename>.pdf", "source_type": "bctc"}
```
pdf_path must be an absolute container path under /app/data/pdfs (shared volume).

**NEXT:** ops rebuild pdf-extractor container. dev-mcp-server: update extractViaMicroservice / triggerPushBctcExtraction to pass pdf_path for locally-stored PDFs (OUT-OF-SCOPE for this task — dev-mcp-server zone).

Zone: `apps/pdf-extractor/` | Stack: Python/FastAPI | DB: pdf_extractor.db (write)

## Working Memory

### 2026-05-31 — FU-TRUST-REFRESH/FU-1 COMPLETE (af50d67a)

**Task:** FU-1 | Sprint: FU-TRUST-REFRESH | Status: DONE — NEXT: ops FU-2 (rebuild + rasterize)

**Root cause fixed:** `/page-text` endpoint returned `{"text":"","source":"sqlite_ocr"}` permanently because `main.py create_app()` never constructed/passed `ocr_text_source` to `register_routes()`. Real OCR text (FPT 35 pages, ACB 27 pages) existed in `pdf_extracted_text` but never reached the Haiku refine agent — which fabricated digit-run placeholders instead.

**Files changed (commit af50d67a):**
- `infrastructure/config.py` — added `market_db_path: str` + `MARKET_DB_PATH` env var (default `/app/data/market.db`)
- `main.py` — import `select_ocr_text_source`; call `_probe_ocr_source` startup self-check; pass `ocr_text_source + ocr_source_ok` to `register_routes()`
- `interface/serializers.py` — `HealthResponse` gets `ocr_source_ok: bool` field (RISK-1 surface)
- `interface/handlers.py` — `register_routes()` accepts `ocr_source_ok`; `/health` exposes it; `/page-text` returns `source_reachable:false` on exception (NOT silent empty string)
- `infrastructure/ocr_text_source.py` — `SqliteOcrTextSource.get_page_text` uses read-only URI (`file:...?mode=ro`); raises on unreachable DB
- `docker-compose.yml` — added `MARKET_DB_PATH: /app/data/market.db` to pdf-extractor env block
- `__tests__/unit/test_fu1_fail_loud.py` — NEW: 10 deliberate-violation tests (RED-before/GREEN-after)
- `__tests__/unit/test_ocr_text_source.py` — updated: `test_raises_on_bad_db_path` confirms new raises contract

**DoD evidence (live container):**
- `GET /page-text?filename=20260424-FPT-BCTC-hop-nhat-Quy-1-nam-2026.pdf&page_number=7` → `source_reachable:true`, 2764 chars real Vietnamese text including "Doanh thu bán hàng và cung cấp dịch vụ", "Lợi nhuận gộp về bán hàng"
- `/health` → `{"status":"ok","ocr_source_ok":true}`
- DV test: `MARKET_DB_PATH=/nonexistent` → probe returns False + `/health ocr_source_ok:false` + `/page-text source_reachable:false`
- 23/23 unit tests PASS (10 fail-loud DV + 13 ocr_text_source). text_table_extractor.py 0-diff. PEK PRISTINE.

**REBUILD REQUIRED before FU-3 re-refine:** Container was already rebuilt prior to this session (af50d67a is on main and the running container reflects current HEAD). Confirm with ops (FU-2) before triggering refine cron.

---

### 2026-05-30 — BTB-DRIFT-DEV COMPLETE (06fb1f10 + test_anti_drift_grouper)

**Task:** BTB-DRIFT-DEV | Sprint: BCTC-TABLE-BOUNDARY | Status: DONE — NEXT: ops (rebuild + off-hours re-extract)

**Additional file (this cycle):** `__tests__/unit/test_anti_drift_grouper.py` — NEW 9 tests per architect spec (AD-1, AD-2, DV-1-B, DV-2-B, 9-page regression, 12-page, two-distinct-adjacent). All 718/718 unit tests pass. AD-2 PROVEN-RED evidence documented in test docstrings. 9-page regression PROVEN-RED evidence documented. text_table_extractor.py 0-diff. PEK PRISTINE.

**Exactly ONE grouping implementation:** `bctc_page_grouper.group_pages_into_units()` is the SOLE grouper. PATH A (`build_document_map`) delegates via `bctc_page_grouper.PageDescriptor` adapter. PATH B (`_run_extraction` Step 2) builds `PageDescriptor` from bboxes and calls directly. `_group_bboxes_into_units` DELETED — `hasattr(pek_engine_adapter, "_group_bboxes_into_units")` returns False (AD-2 GREEN).

---

### 2026-05-30 — BTB-DRIFT-DEV COMMITTED (06fb1f10)

**Task:** BTB-DRIFT-DEV | Sprint: BCTC-TABLE-BOUNDARY | Status: DONE — NEXT: ops (rebuild + off-hours re-extract)

**Root cause fixed:** PATH A (build_document_map) and PATH B (_group_bboxes_into_units) were two independent grouping implementations. BTB-ARCH state-machine fix landed on PATH A only; PATH B (live user path via /api/trigger-pek-extract) still discarded prose units (BLOCKING-2) and had no D-5 title-band signal.

**Files changed (commit 06fb1f10):**
- `infrastructure/bctc_page_grouper.py` — NEW canonical SSOT (PageDescriptor dataclasses, _is_continuous, prose-unit emission, blank-bridge, D-5)
- `infrastructure/unit_grouper.py` — NEW dict-based shim + _has_new_title; delegates to bctc_page_grouper
- `infrastructure/pek_engine_adapter.py` — DELETED _group_bboxes_into_units; _run_extraction Step 2 now uses bctc_page_grouper.group_pages_into_units directly
- `infrastructure/generic_md_table_extractor.py` — build_document_map inline state-machine replaced with unit_grouper.group_pages_into_units call
- `__tests__/unit/test_grouping_convergence.py` — NEW anti-drift gate CG-1+CG-2
- `__tests__/unit/test_unit_grouper.py` — NEW 38 tests
- `__tests__/unit/test_table_boundary_state_machine.py` — Class C delegates to canonical grouper; Class A2 for _has_new_title

**DoD evidence:**
- CG-1 PROVEN-RED (neither path called group_pages_into_units before fix) → PROVEN-GREEN
- CG-2 PROVEN-RED (PATH B discarded prose, PATH A emitted) → PROVEN-GREEN
- DV-1 GREEN (table-prose-table → 3 units), DV-2 GREEN (title-band fires)
- 709/709 tests (659 baseline + 50 new), 1 warning (unrelated asyncio)
- text_table_extractor.py 0-diff. PDF-Extract-Kit PRISTINE.

**Concurrent agent note:** bctc_page_grouper.py was created by a concurrent session. Adapted unit_grouper.py to be a shim over it. Both agree on grouping semantics.

### 2026-05-30 — BTB-UNBLOCK-DEV COMMITTED (b1e826c2)

**Task:** BTB-UNBLOCK-DEV | Sprint: BCTC-TABLE-BOUNDARY | Status: DONE — NEXT: ops (rebuild + patient instrumented run)

**Files changed (commit b1e826c2):**
- `apps/pdf-extractor/interface/handlers.py` — FAIL-LOUD exc_info=True + ECHO-vs-DB log wording in `_run_pek_extract`
- `apps/pdf-extractor/infrastructure/pek_engine_adapter.py` — per-page heartbeat in `_run_table_extraction` + hard timeout (ThreadPoolExecutor, PEK_EXTRACTION_TIMEOUT_SECONDS env, default 30min) in `extract_layout_and_tables`
- `apps/pdf-extractor/__tests__/test_pek_engine_adapter.py` — +6 new tests (TestFailLoudAndTimeout), DV-GUARD PROVEN-RED
- `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` — boundary comment only, state machine UNCHANGED

**Test results:** 38/38 in test_pek_engine_adapter.py PASS. DV-GUARD: test_run_pek_extract_logs_exc_info_true_on_failure PROVEN-RED on reverted handler (exc_info=None), GREEN on current code.

**Constraints verified:** text_table_extractor.py 0-diff. PDF-Extract-Kit PRISTINE. No GPU deps. No new heavy imports (stdlib only: time, concurrent.futures). Scoped commit (4 files, no contamination).

**NEXT: ops** — rebuild pdf-extractor container (no-cache), then ONE patient instrumented off-hours re-extraction of FPT e71f845d to completion (NO premature kill). Watch per-page heartbeat logs. After completion: verify DIRECT in-container market.db COUNT. If push 200-OK but COUNT=0 → real write-wedge → NEXT dev-mcp-server BTB-UNBLOCK-MCP.

---

### 2026-05-29 — BTB-DEV COMMITTED (d297f3ba)

**Task:** BTB-DEV | Sprint: BCTC-TABLE-BOUNDARY | Status: DONE — NEXT: ops (rebuild)

**Files changed (commit d297f3ba):**
- `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` — all 4 root causes fixed in one pass
- `apps/pdf-extractor/__tests__/unit/test_table_boundary_state_machine.py` — NEW: 42 pure-function tests
- `apps/pdf-extractor/__tests__/unit/test_document_map.py` — _simulate_grouping updated to new state machine; 58/58 pass

**Test results:** 659/659 unit tests PASS. DV-1 PROVEN-RED pre-fix, GREEN post-fix. DV-2 PROVEN-RED pre-fix, GREEN post-fix.

**Constraints verified:** PDF-Extract-Kit PRISTINE (0-diff). text_table_extractor.py 0-diff. Scoped commit (3 files). No GPU deps. No new imports.

---

### 2026-05-28 — BCTC-EVAL-PDFX READY (unstaged)

**Task:** BCTC-EVAL-PDFX | Sprint: BCTC-EVAL-SUBSTRATE | Status: READY (files unstaged — main terminal commits)

**Test results:** 36/36 PASS. DDD compliance verified. PEK subtree CLEAN.

**NEXT:** ops BCTC-EVAL-PDFX deploy.

---

### 2026-06-03 — LF-DEPLOY-IMPL DONE-CODE (awaiting ops rebuild)

**Task:** LF-DEPLOY-IMPL | Sprint: BCTC-LAYOUT-FIRST | Status: DONE-CODE / awaiting ops rebuild

**Root cause fixed:** `_compute_page_fingerprint_50dpi` used money-group-density as sole `page_type` discriminator. Balance-unit START pages (FPT Q1 page 3) have sparse money tokens in stored OCR when the heading block dominates → misclassified `prose` → `build_document_map` group-break → schema_page=4 not 3 → AC-LFE-1/2 FAIL.

**Changes:**
- `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py`:
  - LF-IMPL-1: added `_ACCOUNT_CODE_MIN_FOR_TABLE=3` + `_DATE_HEADER_MIN_FOR_TABLE=1` constants; 3-signal OR classifier in `_compute_page_fingerprint_50dpi` (Signal A=money, B=codes, C=dates); DEBUG log for diagnostics
  - LF-IMPL-2: added `_ALLOW_PROSE_IN_TABLE_UNIT=True` flag; relaxed continuity guard in `build_document_map` grouping loop — prose page inside table unit accepted if gutter geometry continuous (fp coerced to "table" type for `_fingerprints_continuous` call)
- `apps/pdf-extractor/__tests__/unit/test_layout_invariants.py`: added `TestQuarantineNonDeadCode` (3 tests — LF-IMPL-3 AC-LFE-11 proof)
- `apps/pdf-extractor/__tests__/unit/test_document_map.py`: added `TestMultiSignalPageClassifier` (14 tests — Signal B/C classification) + `TestProseInTableUnitGuard` (3 tests — LF-IMPL-2)

**Test results:** 707/707 PASS (+30 new tests). Zero regression.

**LF-IMPL-4 / AC-LFE-3 verdict:** FPT Q1 page 41 IS a financial table page (sections 31/32 notes tables with money values). AC-LFE-3 requirement was wrong — code is correct. AC-LFE-3 should be updated to PASS with note "page 41 legitimately contains notes tables — table classification is correct."

**Reclassification proof:** sparse page-3 OCR (header-only: 0 money, 2 codes, 2 dates) → old=`prose`, new=`table` via Signal C. Full OCR (40 money, 176 codes, 2 dates) → all signals fire.

**NEXT:** ops rebuild pdf-extractor container → QA re-run LF-DEPLOY gate → verify AC-LFE-1/2 in DB (schema_page=3, pages 3-6 one unit).

---

### 2026-06-03 — FU-LF-ORPHAN-ROWS DIAGNOSIS (cross-zone handoff — no code change)

**Task:** FU-LF-ORPHAN-ROWS | Sprint: BCTC-LAYOUT-FIRST | Status: CROSS-ZONE HANDOFF — no in-zone fix

**Root cause (serving bug):** `operating_profit=0, ebitda=0, cash=0.000001, eps=1, financing_cf≈0` are legacy pdf-parse values from 2026-05-24. `finalize_bctc_refine` ran on 2026-05-31 14:51 (before BEQ-3 commit `c1f3c328` on 2026-06-02 added code-30/110/40 mappings to `aggregateScalars`). At that time these codes returned null → Case 2 skip → legacy values preserved. `bctc_table_rows` (145 rows, `extracted_at=2026-05-31 14:51`) already contains the correct data for ALL missing scalars. Fix = re-call `finalize_bctc_refine(report_id=e8ea3df5-3f32-413d-a3eb-c71634c0438d, report_status=DONE)`.

**OUT-OF-ZONE:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts`. No pdf-extractor code to fix.

**Orphan-rows quarantine (in-zone, not blocking current serve):** 4/14 `bctc_layout_units` quarantined. Units `33f03d3a`/`13249073`/`5b828836` have 100% orphan (column detection found ≤1 gutter → no value columns → all rows `has_val=False`). Unit `d8613f7c` has 8/92 (8.7%) orphans (column col_0=x:0-746 captures mixed OCR text, 8 rows where col_0 is empty but col_2/4 have values). Gate `check_no_orphan_rows` fires on ANY orphan — correct behavior for 100% cases; potentially over-strict for 8.7% case. Layout-first serves `bctc_layout_units`, NOT `bctc_refined_units` — quarantine does NOT affect `financial_reports` derivation (which reads `bctc_refined_units` → `bctc_table_rows`).

**Zone health:** layout-first OCR quality poor for FPT Q1 scrambled PDFs (column detection failing pages 7-9, 1 gutter only). Core pipeline structurally sound. Orphan gate working as designed.

---

### History pointer

Prior entries (PDF-SINGLE-SOURCE, PEK-RENDER-PDFX, PEK-LAYOUT-CFG, PEK-IMPORT-CHAIN, PEK-DEPLOY-FIX, PEK-ORPHAN-RECONCILE, PEK-IMPL, LF-FIX, LF-EXTRACT, MD-EXTRACT-1..9) truncated at 200L per notebook cap. See `docs/handoffs/TASK_BCTC-MD-TABLE.md` + `docs/handoffs/TASK_PEK-INTEGRATE.md` for full history.
