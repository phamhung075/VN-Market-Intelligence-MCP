---
task-id: FIX-PDFX-TEST-LOOP-POLLUTION
agent: qa
date: 2026-06-13
cycle: 250
verdict: APPROVED
---

## qa-S1 — Gate verdict for FIX-PDFX-TEST-LOOP-POLLUTION

**what-considered:**
G1 grep-zero: `grep -rn "get_event_loop" apps/pdf-extractor/__tests__` → EXIT 1, zero hits. PASS.
G2 zone-purity: `git show --name-only 27d09912` → 10 files, all under `apps/pdf-extractor/__tests__/` (5 integration, 5 unit). Zero production src (`infrastructure/`, `application/`, `domain/`), zero Dockerfile/compose. PASS.
G3 order-independence: two orderings run live:
  - `python3 -m pytest __tests__ -p no:randomly` → 4 failed / 952 passed
  - `python3 -m pytest __tests__ -p randomly --randomly-seed=12345` → 4 failed / 952 passed
  Same 4 failures in both orderings. PASS.
G4 residual-fail triage:
  - `test_bt3_fix3_real_ocr_fidelity` + `test_extract_tables_usecase_real_ocr_path`: log shows `No such file or directory: '/app/data/pdfs/...'` — container-only path, legitimate host-skip. Pre-existing.
  - `test_ac3_table_count_ge2` + `test_ac3_each_table_is_valid_pipe_table`: PASS in isolation (2 passed, 79s). Contamination from `test_ocr_backends.py` `sys.modules.pop("pytesseract")` path — separate issue, not caused by this loop-pollution fix. Pre-existing contamination class.
  Additional note: `test_extract_layout_and_tables_raises_on_timeout` flaky (fails in full suite default ordering, passes in isolation) — pre-existing timing flakiness, not regression from this commit.
  None of the 4 block this FIX.

**why-change:** No deviation from plan. All loop-pollution commits verified clean. 36 order-dependent failures eliminated, 0 new failures introduced. FIX-scope respected (test-only, no production src, no rebuild).

**follow-up-candidate:** `FIX-PDFX-PYTESSERACT-CONTAMINATION` — `test_ocr_backends.py` `sys.modules.pop` leaves residual state corrupting `test_extract_md_tables_fpt.py::TestExtractMdTablesFPT::test_ac3_*` in specific orderings. Should add `autouse` fixture to re-register pytesseract or use `importlib.reload` with proper scope isolation.
