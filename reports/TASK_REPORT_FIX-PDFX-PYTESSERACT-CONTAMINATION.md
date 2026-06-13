## Task Report FIX-PDFX-PYTESSERACT-CONTAMINATION
date: 2026-06-13
changed: [apps/pdf-extractor/__tests__/test_ocr_backends.py, apps/pdf-extractor/__tests__/unit/test_ocr_adapter_psm6_guard.py]
tests: 955 pass / 2 fail (container-only real-OCR, host-skipped) | ddd: SKIP (test-only) | security: SKIP (test-only)
verdict: APPROVED

### Evidence

AC1: test_ac3_table_count_ge2 + test_ac3_each_table_is_valid_pipe_table — 2 passed, 955 deselected in 78.56s
AC2: grep -n "sys.modules.pop" __tests__/test_ocr_backends.py → EXIT 1 (zero matches)
AC3: default order (-p no:randomly) → 2 failed, 955 passed — FAILED: test_bt3_fix3_real_ocr_fidelity + test_extract_tables_usecase_real_ocr_path (both fail on missing /app/data/pdfs/ path, not regressions)
AC4: seed=12345 → 2 failed, 955 passed (identical set); seed=99999 → 2 failed, 955 passed (identical set)
AC5: git show --name-only 8f92f465 → apps/pdf-extractor/__tests__/test_ocr_backends.py + apps/pdf-extractor/__tests__/unit/test_ocr_adapter_psm6_guard.py (2 files, all under __tests__/)
