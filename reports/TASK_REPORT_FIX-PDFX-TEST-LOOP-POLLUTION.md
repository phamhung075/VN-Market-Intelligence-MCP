## Task Report FIX-PDFX-TEST-LOOP-POLLUTION

changed: [apps/pdf-extractor/__tests__/ — 10 files (5 integration, 5 unit), all test-only]
tests: 952 pass / 4 fail (pre-existing, out-of-scope) | tsc: N/A (Python project) | ddd: SKIPPED (test-only Smart-Skip) | security: SKIPPED (test-only Smart-Skip)
verdict: APPROVED

### Gate Results

**G1 — grep-zero:** `grep -rn "get_event_loop" apps/pdf-extractor/__tests__` → EXIT 1, ZERO hits. PASS.

**G2 — zone purity:** `git show --name-only 27d09912` → 10 files, all under `apps/pdf-extractor/__tests__/`:
- integration: test_bt3_fix2_full_pipeline.py, test_bt3_fix3_row_fidelity.py, test_extract_md_tables_fpt.py, test_extract_tables_bt3d_real_ocr.py, test_extract_tables_fpt.py
- unit: test_bt7_path_a_section_filter.py, test_eval_detectors.py, test_extract_md_tables_usecase.py, test_extract_tables_cross_check.py, test_extract_tables_usecase.py
Zero production src (`infrastructure/`, `application/`, `domain/`), zero Dockerfile/compose. PASS.

**G3 — order-independence:**
- Ordering 1 (`-p no:randomly`): **4 failed, 952 passed**
- Ordering 2 (`--randomly-seed=12345`): **4 failed, 952 passed**
Same 4 failures in both orderings — confirmed stable, not a moving target. PASS.

**G4 — residual-fail triage:**
1. `test_bt3_fix3_row_fidelity.py::test_bt3_fix3_real_ocr_fidelity` — log: `No such file or directory: '/app/data/pdfs/...'`. `@pytest.mark.slow` real-OCR test requiring container path. Legitimate host-skip. Pre-existing.
2. `test_extract_tables_bt3d_real_ocr.py::test_extract_tables_usecase_real_ocr_path` — log: PDF not found at `/app/data/pdfs/`; `rows_stored=0`. Same class — container-only. Pre-existing.
3. `test_extract_md_tables_fpt.py::TestExtractMdTablesFPT::test_ac3_table_count_ge2` — PASSES in isolation (verified: 2 passed in 79s). Contamination from `test_ocr_backends.py::test_b_tesseract_raises_when_not_importable` which calls `sys.modules.pop("pytesseract")` — leaves state that corrupts subsequent pytesseract imports in certain orderings. SEPARATE class from loop-pollution fix. Pre-existing.
4. `test_extract_md_tables_fpt.py::TestExtractMdTablesFPT::test_ac3_each_table_is_valid_pipe_table` — Same contamination class as #3. Pre-existing.

None of the 4 are caused by or related to the asyncio loop-pollution fix. None block this FIX.

### Follow-up Candidate (do not create — for PO consideration)
`FIX-PDFX-PYTESSERACT-CONTAMINATION`: `test_ocr_backends.py::test_b_tesseract_raises_when_not_importable` uses `sys.modules.pop("pytesseract")` with a finally-restore, but the restore path has a conditional gap (`if saved is not None`) that leaves pytesseract absent from sys.modules when it was never imported before the test. This contaminates `test_ac3_*` in specific orderings. Fix: add `autouse` session-scoped fixture to ensure pytesseract re-registration, or use `importlib.reload` with proper scope.
