# dev-pdf-extractor — Notebook

Zone: `apps/pdf-extractor/` | Stack: Python/FastAPI | DB: pdf_extractor.db (write)

## Working Memory

### 2026-05-28 — PDF-SINGLE-SOURCE DONE (§7 + §7.7 path consolidation)

**Task:** PDF-SINGLE-SOURCE | Sprint: PDF-SINGLE-SOURCE | Status: DONE — 5 commits
**Scope:** Code-only (§7 + §7.7). No docker-compose, no PDF file moves, no ops steps.

**Changes:**
- `apps/pdf-extractor/spike/eval/harness.py:42` — `data/pdfs-local` → `data/pdfs` (PDFS_LOCAL constant, name kept per §7.1 note)
- `apps/pdf-extractor/spike/fpt_balance_sheet_eval.py:38` — PDF_PATH `data/pdfs-local/...` → `data/pdfs/...`
- `apps/pdf-extractor/__tests__/integration/test_extract_md_tables_fpt.py:47` — path string `pdfs-local/` → `pdfs/`
- `apps/pdf-extractor/__tests__/integration/test_extract_tables_bt3d_real_ocr.py:44` — path string `pdfs-local/` → `pdfs/`
- `.gitignore` — added `data/pdfs/*.pdf` + `data/pdfs-local/`

**Commits (all scoped, no contamination):**
- `2e6154ee` chore(pdf-extractor/spike): PDF-SINGLE-SOURCE — eval harness path → data/pdfs
- `b9b135a4` chore(pdf-extractor/spike): PDF-SINGLE-SOURCE — fpt_balance_sheet_eval path → data/pdfs
- `7fc2048b` chore(pdf-extractor/tests): PDF-SINGLE-SOURCE — integration test md-tables-fpt path
- `d1be5050` chore(pdf-extractor/tests): PDF-SINGLE-SOURCE — integration test bt3d-real-ocr path
- `6802e0c7` chore(repo): PDF-SINGLE-SOURCE — .gitignore data/pdfs/*.pdf + data/pdfs-local/

**G1 verification:**
- `grep -r pdfs-local spike/ __tests__/` → empty (PASS)
- `grep data/pdfs .gitignore` → 2 lines (PASS)
- `git -C PDF-Extract-Kit diff --quiet` → exit 0 (PEK pristine, PASS)
- Frozen files (text_table_extractor.py, sandbox/runner.py, pilot-status-pdf-extractor.json, generic_md_table_extractor.py): 0-diff (PASS)
- Pre-existing dirty files (notebooks, dashboards, traces): NOT staged

**NEXT:** ops executes §5 (migration: delete 2 orphans, copy 15 PDFs from volume, delete pdfs-local/) + §6 (compose change: replace pdfs-local bind with pdfs bind, add pdfs bind to mcp-server) + force-recreate. Then qa runs §10 G3 (FPT sentinel e71f845d-ffa5-48f9-8f09-30ac2cd09c65 page 5 has_pek=true).

---

### 2026-05-27 — PEK-RENDER-PDFX DONE (zero-change verify-only)

**Task:** PEK-RENDER-PDFX | Sprint: PEK-INTEGRATE Round 6 | Status: DONE — read-only pass
**Verdict:** PASS. No gaps found. No code changes made.

**Four checks, all confirmed:**
1. `PekExtractRequestSchema` (`handlers.py:142-155`): `report_id: str` + `pdf_path: str`, both mandatory (no Optional, no default). 422 cause confirmed. Schema stays unchanged — architect's fix (new mcp-server trigger endpoint) is the correct owner.
2. Market-hours 503 guard: `is_vn_market_open_utc()` at `handlers.py:403` — first check in `pek_extract` route, before any model call. Import at line 33. Intact.
3. `page_numbers_json` 1-indexed end-to-end: `enumerate(doc, start=1)` → `pages_bboxes` keys → `_group_bboxes_into_units` `pages` list → `document_map.units[].pages` → `pushBctcLayoutHandler.ts` `JSON.stringify(pageNums)` → stored. No conversion at any stage. `json_each(page_numbers_json) WHERE value = ?` requires no coordinate conversion in the new mcp-server handler.
4. Frozen surfaces + PEK subtree: `git status --short` on `text_table_extractor.py`, `sandbox/runner.py`, `generic_md_table_extractor.py`, `pilot-status-pdf-extractor.json` → empty. `git -C PDF-Extract-Kit status --short` → empty.

**Files written:** `docs/handoffs/TASK_PEK-INTEGRATE.md` (PEK-RENDER-PDFX section), this notebook.
**Code files touched:** NONE.

**NEXT: ops** (PEK-RENDER-DEPLOY — rebuild mcp-server after dev-mcp-server lands PEK-RENDER-MCP).

---

### 2026-05-27 — PEK-LAYOUT-CFG DONE (parity audit fix for 6c124745)

**Task:** PEK-LAYOUT-CFG | Sprint: PEK-INTEGRATE | Status: DONE — commit SHA `e6b84ca5`

**Root cause (QA cycle-131 RED):** Three divergences from original `LayoutDetectionTask`:
1. CONFIG-PATH: `layout_cfg.get("model", {})` → `{}`. YAML has no top-level `model` key. Fix: `layout_cfg.tasks.layout_detection.model_config`.
2. RELATIVE model_path: `models/Layout/YOLO/doclayout_yolo_ft.pt` was passed raw to `YOLOv10()`. Fix: `_PekLayoutModel.__init__` accepts `pek_root` arg, resolves relative path to absolute. `_load_pek_models()` computes `_pek_root = normpath(join(_PEK_CONFIG_DIR, ".."))`.
3. SILENT-FALLBACK: `except → logger.warning → layout_task = None` hid all failures. Fix: RuntimeError raised when YAML exists but model load fails (fail-loud per protocol).

**SMOKE-GATE FINDING:** Cannot extend gate to `_PekLayoutModel` instantiation — weights runtime-only (named volume, excluded from image). Import-level gate kept. fail-loud surfaces at first extraction with clear traceback.

**Verification:**
- `pytest __tests__/test_pek_engine_adapter.py -v` → 22/22 PASS (+7 new `TestLayoutCfgConfigPath`)
- `pytest --ignore=__tests__/integration -q` → 636 passed, 0 failed
- `git -C PDF-Extract-Kit diff` = EMPTY (pristine)
- `git show --stat e6b84ca5` = 3 files only (pek_engine_adapter.py + test_pek_engine_adapter.py + TASK_PEK-INTEGRATE.md)
- Frozen surfaces: text_table_extractor.py, sandbox/runner.py, pilot-status-pdf-extractor.json — 0-diff

**NEXT:** ops REBUILD (--no-cache) + force-recreate pdf-extractor → qa two-stage live verification after market close 09:00 UTC.

---

### 2026-05-27 — PEK-IMPORT-CHAIN DONE (bypass pdf_extract_kit.tasks)

**Task:** PEK-IMPORT-CHAIN | Sprint: PEK-INTEGRATE | Status: DONE — commit SHA `6c124745`

**Root cause (architect, verified):** `from pdf_extract_kit.tasks.layout_detection import LayoutDetectionTask` unconditionally executes `pdf_extract_kit/tasks/__init__.py` → eagerly imports `FormulaRecognitionTask` → `unimernet` → `ModuleNotFoundError`. There is no safe sub-path under `pdf_extract_kit.tasks`.

**Fix (Option B — bypass entirely):**
- Added `_PekLayoutModel` class in `pek_engine_adapter.py` that calls `doclayout_yolo.YOLOv10` + `fitz` (PyMuPDF) directly — zero PEK tasks import.
- Replaced the two `pdf_extract_kit.tasks.*` imports with `from doclayout_yolo import YOLOv10`.
- Removed dead `OCRTask` block (was never called in `_run_extraction()`); set `ocr_task = None` with comment.
- Removed `ocr_cfg_path` variable.
- Updated return dict (removed `ocr_task` key).
- Updated `_run_extraction()` (removed dead `ocr_task` reference).
- Updated module-level CRITICAL comment (§3.8 constraint language).
- Dockerfile smoke gate corrected: now imports `from infrastructure.pek_engine_adapter import _PekLayoutModel, _load_pek_models` — any import regression in the adapter fails the BUILD.

**Verification:**
- `grep -rn executable pdf_extract_kit.tasks` in our code: ZERO hits.
- `docker compose build --no-cache pdf-extractor` → smoke gate reached and PASSED.
- Smoke gate stdout: `--- pek-import-chain: ALL OK ---`
- `pytest __tests__/test_pek_engine_adapter.py -v` → 15/15 PASS.
- `pytest scenarios/pek_single_doc_extraction.py -v` → 10/10 PASS.
- `pytest --ignore=__tests__/integration -q` → 629 passed, 0 failed.
- `git -C PDF-Extract-Kit diff` = EMPTY (pristine).
- `git show --stat 6c124745` = 2 files only (Dockerfile + pek_engine_adapter.py).
- Frozen surfaces: text_table_extractor.py, sandbox/runner.py, pilot-status-pdf-extractor.json — 0-diff.

**NEXT:** ops force-recreate pdf-extractor container (--no-cache build done here) → qa re-runs FPT Q4 2025 sentinel + direct bun:sqlite row check.

---

### 2026-05-26 — PEK-DEPLOY-FIX DONE (Docker build unblocked)

**Task:** PEK-DEPLOY-FIX | Status: DONE — commit SHA `efd23447`

**Two build blockers fixed (Dockerfile + requirements-pek.txt only):**

**Blocker 1 — doclayout-yolo==0.0.2 does not exist on PyPI:**
- `0.0.2` is a ghost pin. Actual releases: `0.0.2b1`, `0.0.3`, `0.0.4`.
- Fix: pinned to `==0.0.3` — first stable release after intended `0.0.2`; same `YOLOv10` API; pure Python wheel (`py3-none-any`); Python 3.12 compatible.
- Root cause: PEK upstream `requirements-cpu.txt` always carried the ghost pin; when the pip cache was cold inside Docker, the resolution failed.

**Blocker 2 — pip install -e ./PDF-Extract-Kit fails on pyproject.toml TOML error:**
- PEK's `pyproject.toml` line 21: `opencv-python = "^4.6.0"` written as TOML key=value inside a PEP 508 `dependencies` array — invalid TOML.
- Python 3.12's pip parses this strictly and raises `TOMLDecodeError: Invalid value`.
- Fix: removed the `RUN pip3 install -e ./PDF-Extract-Kit` step; extended `PYTHONPATH=/app:/app/PDF-Extract-Kit`.
  An editable install only adds the source dir to sys.path — PYTHONPATH is a direct equivalent.
- PEK subtree NOT edited (constraint preserved). `pyproject.toml` left as-is.

**Base image stays ubuntu:24.04 (Python 3.12):**
- Task description claimed ultralytics requires Python <=3.11 — this was incorrect.
- Actual build output: `ultralytics>=8.2.85` resolves to 8.4.55 (requires Python >=3.8, no upper bound). Python 3.12 is fine.
- The only fatal error was the doclayout-yolo ghost pin. No base image change needed.

**Verification:**
- `docker compose build pdf-extractor` → `pdf-extractor Built` (exit 0, image `vn-market-intelligence-mcp-pdf-extractor:latest`)
- Test suite: 689 passed, 4 pre-existing integration failures (require real OCR/PDF files — unchanged)
- PEK subtree: `git -C PDF-Extract-Kit diff` = empty (CONFIRMED)
- Frozen surfaces: `text_table_extractor.py`, `sandbox/runner.py`, `pilot-status-pdf-extractor.json` — 0-diff (CONFIRMED)
- Staged files: `Dockerfile` + `requirements-pek.txt` only (C2 protocol: no wildcard add)

**NEXT:** ops force-recreate pdf-extractor container (cache hit on built image) → qa PEK-QA → user verbal G9.

---

### 2026-05-26 — PEK-ORPHAN-RECONCILE DONE (pre-deploy adjudication)

**Task:** PEK-ORPHAN-RECONCILE | Status: DONE, 3 commits

**Provenance verdict:** All four uncommitted file groups were established in-progress work from the BCTC-LAYOUT-FIRST sprint — coherent, tested, documented in notebook entries. None abandoned or experimental.

**Group A — LF-FIX2 improvements (COMMITTED, SHA `08644675`):**
- `infrastructure/generic_md_table_extractor.py` — 5 targeted refinements:
  - `_MAX_INTER_GUTTER_GAP_PX=60`: compound gutter merging for OCR artifact noise
  - `_MIN_TEXT_COL_WIDTH_PX_50DPI: 20→30`: tighter noise suppression at 50 DPI
  - `_GUTTER_DARK_FRACTION_50DPI: 0.40→0.15`: correct threshold for dense BCTC pages
  - `page_type` via money-group density (drops gutter_count gate) — stable signal
  - `is_gutter` flag on column dicts + gutter-skip in `ocr_unit` rows_for_gate
- `__tests__/unit/test_document_map.py` — +143 lines: `TestIsGutterFlagAndCompoundGutterMerging` (4 tests) + 3 `page_type` continuity tests in `TestFingerprintsContinuous`

**Group B — DDD import fix (COMMITTED, SHA `0879cb33`):**
- `domain/services.py` — comment clarifies external callers must import from `domain.primitives` directly; noqa removed
- `__tests__/unit/test_financial_validation.py` — import moved from `domain.services` to `domain.primitives.validate_financial_figures` (correct DDD path)

**Group C — mock_echo deletion (COMMITTED, SHA `7acdef90`):**
- `domain/primitive/mock_echo/mock_echo.py` — zero references outside `_deprecated/`; 629 tests pass without it; safe removal

**Restored (dashboard PNG):** `dashboard/g9-trust-contract.png` — binary, undocumented change, restored to committed state.

**Final gate check:**
- Suite: 629 passed, 1 warning (asyncio deprecation — pre-existing, not introduced here)
- PEK subtree: `git -C PDF-Extract-Kit diff` = empty (CONFIRMED)
- Frozen surfaces: text_table_extractor.py, sandbox/runner.py, pilot-status-pdf-extractor.json — 0-diff (CONFIRMED)
- Working tree `apps/pdf-extractor/`: only `??` untracked (PDF-Extract-Kit/, _deprecated/, spike/, dashboard/*.json, .DS_Store) — all excluded by HARD CONSTRAINTS

**NEXT:** Deploy is unblocked. ops PEK-DEPLOY (REBUILD pdf-extractor container, not restart).

---

### 2026-05-26 — PEK-IMPL DONE (PEK-INTEGRATE sprint)

**Task:** PEK-IMPL | Sprint: PEK-INTEGRATE | Status: DONE — files UNSTAGED, ops notified

**Deliverables (all tests pass, frozen surfaces zero-diff, PEK pristine):**

New files:
- `domain/primitives/market_hours/primitive.py` — `is_vn_market_open_utc()` pure domain fn
- `domain/primitives/market_hours/__init__.py`
- `infrastructure/pek_engine_adapter.py` — PekEngineAdapter (lazy singleton, semaphore guard)
- `requirements-pek.txt` — CPU-only trimmed deps (no unimernet/struct-eqtable/paddlepaddle-gpu)
- `__tests__/test_market_hours_guard.py` — 12 boundary tests (all pass)
- `__tests__/test_pek_engine_adapter.py` — 15 unit tests (all pass)
- `scenarios/pek_single_doc_extraction.py` — 7 scenario tests (all pass, zero creds)

Modified files:
- `domain/repositories.py` — PekEngineAdapterPort protocol added
- `Dockerfile` — requirements-pek.txt + pip install -e ./PDF-Extract-Kit + GIT_SHA label + libgl1
- `.dockerignore` — PDF-Extract-Kit/.git/, PDF-Extract-Kit/models/, pek_models/ excluded
- `.gitignore` — pek_models/, PDF-Extract-Kit/models/, PDF-Extract-Kit/outputs/ excluded
- `interface/handlers.py` — POST /pek-extract + HTTP 503 market-hours guard
- `main.py` — PekEngineAdapter + pek_push_client wired at composition root
- `docker-compose.yml` — pek_model_cache volume + model cache env vars + CRON_BCTC_REPARSE_JOB

Frozen surfaces confirmed zero-diff: text_table_extractor.py, sandbox/runner.py, pilot-status-pdf-extractor.json.
PDF-Extract-Kit pristine: `git -C apps/pdf-extractor/PDF-Extract-Kit diff` = empty.

Test results: 608 unit tests PASS (12 market-hours + 15 PEK adapter + 7 scenario + all existing).
Import-linter: 2/2 contracts KEPT. Fence-A + Fence-B both green.

Hard constraints verified:
- NEVER imports TableParsingTask or FormulaDetectionTask (CPU crash guard)
- paddlepaddle_gpu not in sys.modules after import
- Market-hours guard: POST /pek-extract returns 503 during market hours (no model load)
- CRON_BCTC_REPARSE_JOB=0 21 * * * in docker-compose.yml mcp-server env

**NEXT:** ops PEK-DEPLOY (REBUILD, not restart) → qa PEK-QA → po PEK-EXIT → user verbal G9.

---

### 2026-05-26 — LF-FIX DONE (zone_page() gutter-detection edge-sliver fix)

**Task:** LF-FIX | Sprint: BCTC-LAYOUT-FIRST | Status: DONE, committed SHA `95b24566`

**Root cause confirmed (per qa-lf-2026-05-26T191152Z.json):** `_detect_column_gutters_200dpi()` accepted 20-30px edge slivers as column boundaries. Trailing content whitespace (open gutter at ink-right) was flushed as a real gutter. This produced one vast pseudo-column (~97%) and mutually inconsistent fingerprints for pages 3/4/5/6 (gutters at 97-99% vs 2-3%), preventing Tier-0 grouping and cascading into schema-inheritance never firing (AC-LFE-2 FAIL).

**Fix 1 — _detect_column_gutters_200dpi() (Tier 1, 200 DPI):**
- Removed `if in_gutter: flush at ink-right` — trailing whitespace is NOT a column separator.
- Added minimum column width filter: gutter accepted only when text column on BOTH sides >= `_MIN_TEXT_COL_WIDTH_PX=80px`.
- New constants: `_MIN_TEXT_COL_WIDTH_PX=80`, `_MIN_TEXT_COL_WIDTH_PX_50DPI=20`.

**Fix 2 — _compute_page_fingerprint_50dpi() (Tier 0, 50 DPI):**
- Same two fixes applied proportionally. Post-fix: pages 3/4/5/6 all produce consistent gutter fractions (e.g. [0.35, 0.47, 0.75]) → fingerprints continuous → Tier-0 grouping fires → schema-inheritance for p5 triggers.

**Fix 3 — Invariant 3 leniency gap:**
- `_has_label()` in `primitive.py` now rejects purely-numeric strings (regex `[\d.,\(\)\-\s]+`) as genuine labels. Closes the gate-leniency gap that let page-4 (all content in one wide column) pass as false-green.
- `check_no_orphan_rows()` elif-branch: value-without-label → orphan.

**Tests:** 574 passed (was 566 baseline before LF-FIX session, +8 new tests in TestGutterDetectionEdgeSliverFix + TestInvariant3DistinctLabelValueRequirement).
**text_table_extractor.py 0-byte-diff confirmed.**
**AC-LFE-0 (grep-proof):** 1 match in docstring comment only (line 747).

**NEXT:** ops rebuilds pdf-extractor container + re-extracts FPT Q1 2026. qa re-runs LF-QA. No rebuild done here.

---

### 2026-05-26 — LF-EXTRACT DONE (4-Tier Layout-First Pipeline)

**Task:** LF-EXTRACT | Sprint: BCTC-LAYOUT-FIRST | Status: DONE, committed SHA `5d753970`

**Root cause fixed:** Structural per-page column-guessing algorithm (no cross-page context). 9 MD-EXTRACT + 7 BT fix commits exhausted. Root cause = no logical unit grouping, no schema inheritance. Fix = Tier 0 document map (geometric grouping) + Tier 1 schema inheritance (continuation pages inherit schema-page's column gutters).

**FPT Q1 page-5 scramble fix (AC-LFE-2):** `zone_page()` checks `unit_schema is not None and not is_schema_page` → uses `unit_schema["column_gutters"]` directly, skips column detection entirely. `schema_inherited_from_page=3` recorded in PageZones output.

**New Tier 0-3 functions in `generic_md_table_extractor.py` (+1124L):**
- `build_document_map(pages, pdf_path)` — 50 DPI PIL projection profiles, geometric fingerprint grouping, page gap tolerance, no Tesseract.
- `zone_page(page_img, unit_schema, ...)` — schema inheritance for continuation pages, positional col IDs.
- `ocr_unit(unit, zones_by_page, pdf_path, tmp_dir)` — ONE image_to_data per page, stitch to one markdown table per unit.
- `_fingerprints_continuous(fp_a, fp_b)` — pure geometric continuity test.
- `_compute_page_fingerprint_50dpi` — 50 DPI raster, projection profile, gutter x-fractions.

**New primitives:** `domain/primitives/layout_invariants/primitive.py` — check_balance_identity, check_codes_monotonic, check_no_orphan_rows (pure functions, zero I/O).

**Application use case:** `application/extract_layout_first_usecase.py` — Tier 0→1→2→3→push orchestrator. Injects infra callables (DDD: no infra imports in application layer).

**Push client:** `infrastructure/layout_first_push_client.py` — urllib POST to `/api/push-bctc-layout` per brief §3.2.

**Route:** `POST /extract-layout-first` wired in `interface/handlers.py` + `main.py`.

**Tests:** 549 passed (was 501). New: test_document_map.py (17), test_layout_invariants.py (17), test_schema_inheritance.py (17 — uses MockImage, no Pillow required in venv). Key: `test_fpt_q1_scenario_page5_inherits_page3_schema` confirms AC-LFE-2.

**AC-LFE-0 (grep-proof):** 1 match in generic_md_table_extractor.py, in docstring comment at line 747 only.
**AC-LFE-7:** `text_table_extractor.py` 0-byte-diff confirmed.
**AC-LFE-8:** No external API calls. All local tools.
**Frozen surfaces:** text_table_extractor.py, sandbox/runner.py, pilot-status-pdf-extractor.json — untouched.

**NEXT:** ops LF-DEPLOY (gated on LF-OVERLAY also DONE — it is). ops: `docker compose build pdf-extractor && docker compose up -d --no-deps --force-recreate pdf-extractor`, then single-doc re-extraction. LF-QA verifies AC-LFE-4/5/10/11 via direct market.db query.

---

### 2026-05-26 — MD-EXTRACT-9 DONE (Label-Row Ordinal Reconstruction)

**Task:** MD-EXTRACT-9 | Sprint: BCTC-MD-TABLE | Status: DONE, ALL FILES UNSTAGED

**Root cause fixed:** `_attach_labels_ordinal` band (27px = 1.5×h_med=18) spanned 1.5× the label pitch (36px). Two adjacent label lines' tokens fell inside the same band → merged into one cell → ordinal drift cascade. Zero count mismatch (24 label lines = 24 value ranks).

**Fix (FLAG-A binding):** Added NEW `_attach_labels_by_rank(grid, data_label_lines, code_note_tokens, h_med)` — no y-comparison at all. Left `_attach_labels_ordinal` 100% untouched (12 TestOrdinalReconstruction tests still pass).

**New constants:** `_LABEL_LINE_GAP_PX=15` (200-DPI intra-line gap), `_LABEL_HEADER_MARGIN_PX=20` (200-DPI header-zone margin). Both AC-0 compliant: zero BCTC string semantics.

**New pure functions:**
- `_cluster_text_into_label_lines(text_tokens, label_line_gap_px)` — Step C10.5: greedy sort-by-(top,left) + running-min-top anchor (FLAG-D robustness), returns List[List[Dict]].
- `_exclude_pre_data_label_lines(label_lines, ymeds, first_value_top, margin_px)` — Step C10.6: drops lines with y_med < first_value_top - 20px.
- `_attach_labels_by_rank(grid, data_label_lines, code_note_tokens, h_med)` — Step C10.7: direct index pairing, code_note_tokens re-attached per-rank within 30px.

**`_process_page` C11 call site:** Replaced `label_pool + _attach_labels_ordinal` with C10.5→C10.6→`_attach_labels_by_rank`. `first_value_top` (already in scope from C5) passed to C10.6.

**Fixture (FLAG-B live-substrate, verbatim):** 15 tokens from FPT e71f845d income page (brief §9.7/§9.8). Line-1: 10 tokens tops 488-496. Line-2: 5 tokens tops 522-524. Boundary gap 26px > 15px → split.

**pytest results:** 466 passed / 0 failed (full unit/ suite) | 149 passed (target file) | 12 TestOrdinalReconstruction PASS (FLAG-A intact) | 8 TestLabelLineClustering + 5 TestExcludePreDataLabelLines + 9 TestAttachLabelsByRank = 22 new tests.

**AC fences:** AC-0 PASS (all BCTC matches in comments only) | Fence-A PASS (zero from application/interface) | Privacy PASS (zero creds) | AC-3F PASS (text_table_extractor.py 0-byte diff) | Sandbox primitive 29/29 PASS (6 known_bad by design) | Module tier 1/1 PASS.

**Files modified (UNSTAGED):**
- `infrastructure/generic_md_table_extractor.py` — +2 constants, +3 pure functions, modified `_process_page` (C11 site → C10.5+C10.6+C10.7), docstring updated.
- `__tests__/unit/test_generic_md_table_extractor.py` — +5 MD-EXTRACT-9 imports, +3 test classes (TestLabelLineClustering, TestExcludePreDataLabelLines, TestAttachLabelsByRank) + live fixture module-level constants.

**NEXT:** ops MD-DEPLOY-9 (rebuild pdf-extractor container, single doc e71f845d re-extract, NEVER batch) → main-terminal live-verify AC-9-LABEL + AC-9-PAIR via direct market.db query.

---

### 2026-05-26 — MD-EXTRACT-7-REV DONE (Dense Income Statement Reconstruction)

**Task:** MD-EXTRACT-7-REV | Sprint: BCTC-MD-TABLE | Status: DONE, ALL FILES UNSTAGED

**Three root causes fixed (income statement still broken after MD-EXTRACT-6):**
1. REV-3: Header/date tokens at top=200 contaminated anchor detection. `_find_first_value_row_top` + `_exclude_header_tokens` (Step C5) strips them before anchor detection.
2. REV-4: Presence-based pure-code-column detector (`_identify_pure_code_columns`, Step C7.5) separates code columns [0,1] from value columns [2,3,4,5] after C7 assignment. Replaces the dead count-gate `> N_EXPECTED_MAX_VALUE_COLS`.
3. REV-5: `min(cluster)` replaces centroid in `_detect_column_anchors_from_tokens` — anchors align to true left-edge of each column cluster.

**New constants:** `PURE_CODE_COL_THRESHOLD=0.90` (also `DENSE_COL_THRESHOLD=6` from §MD-EXTRACT-7 §5 — kept)

**New pure functions:** `_find_first_value_row_top`, `_exclude_header_tokens`, `_identify_pure_code_columns`

**Fixture (FIXTURE_TOKENS_REV):** 29 tokens (25 number + 4 text) — 6 anchors (2 pure-code + 4 value), 3 header tokens, 35px pitch, unequal density 4/4/3/3, 2 absent cells.

**pytest results:** 122 passed / 0 failed (target file) | 439 passed (unit/ suite)

**Non-regression proof:** Segment report → all buckets value_count>0 → `code_col_indices=[]` → ELSE branch → pipeline identical to MD-EXTRACT-6. Covered by `test_all_value_cols_returns_empty_code_list`.

**Files modified (UNSTAGED):**
- `infrastructure/generic_md_table_extractor.py` — +1 constant, +3 pure functions, modified _process_page (Step C5 + C7.5), min(cluster) metric
- `__tests__/unit/test_generic_md_table_extractor.py` — +imports (5 new symbols), +TestHeaderCutoff (3 tests), +TestPureCodeColumnDetector (4 tests), +TestDenseIncomeStatement (1 test / 10 assertions), +TestMinClusterAnchor (1 test)

**NEXT:** ops MD-DEPLOY-7 (rebuild pdf-extractor, single-doc re-extract FPT e71f845d). Main-terminal live-verify AC-7-REV-INC + AC-7-REV-SEG-NOREGRESS via direct DB query.

---

### 2026-05-26 — MD-EXTRACT-6 DONE (Column-Anchor-First Ordinal Reconstruction)

**Task:** MD-EXTRACT-6 | Sprint: BCTC-MD-TABLE | Status: DONE, ALL FILES UNSTAGED

**Root cause fixed (scalar-y-tolerance family EXHAUSTED — 5 prior attempts):**
All MD-EXTRACT-1/2/3/4/5 compared token top-values across columns to assign rows.
On wide BCTC tables, OCR skew causes baseline drift ~4px/column → ~28px across 7 columns.
Inter-row pitch is ~16px. Drift (28px) > gap (16px) → diagonal cascade structurally inevitable.
No y-threshold can fix this — eliminated the comparison entirely.

**AC-6-DIAG hard numbers (run before implementation):**
- Page 8 (income statement): row_pitch=4.0px, drift/gap=15.11 → VIOLATED
- Page 22 (segment report): row_pitch=8.0px, drift/gap=1.61 → VIOLATED
- Both pages: tops monotonically increase with lefts → confirms ordinal approach correct

**D4b live-substrate fixture (FPT page 4):**
- code "100": left=793, top=504, width=34, height=15, conf=96
- value "58.102.970.741.619": left=1015, top=503, width=202, height=16, conf=91

**Algorithm (replaces Steps C-F in `_process_page`):**
- C6: `_detect_column_anchors_from_tokens` (unchanged)
- C7: `_assign_tokens_to_columns` — each token → nearest x-anchor by argmin, NO y-comparison
- C8+C8.5+C9+C10: `_build_ordinal_grid` — sort per-col by top, insert skip slots for mid/trailing empties, rank-align across columns
- C11: `_attach_labels_ordinal` — per-row label via y_median band (LABEL_BAND_FACTOR=1.5×h_med), greedy removal

**New constants:** `_COL_ASSIGN_MAX_DIST_FACTOR=3.0`, `SKIP_GAP_FACTOR=1.5`, `_MIN_WORD_CONF_ORDINAL=30`, `LABEL_BAND_FACTOR=1.5`

**New pure functions:** `_assign_tokens_to_columns`, `_insert_skip_slots`, `_build_ordinal_grid`, `_attach_labels_ordinal`

**Retired (DEAD in MD-EXTRACT-6, kept for test compat):** `_cluster_number_rows_adaptive`, `_attach_labels`, `_build_grid_from_number_rows`

**AC-6-LOG:** `logger.debug` → `logger.info` for row_pitch/adaptive_tol in `_cluster_number_rows_adaptive` (2 lines, single-line format for grep)

**Files modified (UNSTAGED):**
- `infrastructure/generic_md_table_extractor.py` — +math import, +constants, +4 pure functions, modified _process_page, retired 3 functions, promoted 2 logger.debug→info
- `__tests__/unit/test_generic_md_table_extractor.py` — +imports, +class TestOrdinalReconstruction (12 new tests)

**Suite evidence:** 430 passed (unit-only), 12 new tests in TestOrdinalReconstruction
**All AC fences:** PASS (AC-0, AC-6-LOG, Fence-A, Privacy, AC-3F, import-linter, sandbox)

**NEXT:** ops MD-DEPLOY-6 (rebuild pdf-extractor, single-doc re-extract FPT e71f845d-ffa5-48f9-8f09-30ac2cd09c65). Then main-terminal live-verify AC-6-SEG/AC-6-INC/AC-6-D4b-LIVE.

---

### History pointer

Prior entries (MD-EXTRACT-1..5, MD-EXTRACT-2, MD-EXTRACT-3, BT3-FIX4, etc.) were in the previous notebook cycle. Truncated at 200L per notebook cap. See `docs/handoffs/TASK_BCTC-MD-TABLE.md` for full history of all implementation cycles.
