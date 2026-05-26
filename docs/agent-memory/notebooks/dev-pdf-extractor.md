# dev-pdf-extractor — Notebook

Zone: `apps/pdf-extractor/` | Stack: Python/FastAPI | DB: pdf_extractor.db (write)

## Working Memory

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
