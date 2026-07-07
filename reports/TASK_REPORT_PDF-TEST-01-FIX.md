# Task Report: PDF-TEST-01-FIX

Audit task (not a code fix): are pdf-extractor's extraction paths — PEK-INTEGRATE adapter,
layout-first extraction, OCR fallback — covered by tests, and do those tests currently pass?

Verdict: **coverage adequate, suite NOT currently reliably green** — held in `review` (status
`BLOCKED`), did NOT close DONE_VERIFIED. Filed follow-up gap task
`FIX-PDF-EXTRACTOR-TEST-SYS-MODULES-LEAK` for dev-pdf-extractor.

## 1. Test execution (real pytest run, not file-count)

`.venv/bin/python -m pytest` at repo root is stale (missing `PIL`, `pandas`, `pytesseract` —
dev venv not kept current with `requirements.txt`). Real authoritative run: inside the live
`vn-market-intelligence-mcp-pdf-extractor-1` container (python3.12, real deps installed).

Targeted 5 files named in task scope (PEK-INTEGRATE + layout-first + OCR):
```
docker exec vn-market-intelligence-mcp-pdf-extractor-1 python3 -m pytest \
  __tests__/test_pek_engine_adapter.py __tests__/unit/test_layout_invariants.py \
  __tests__/test_ocr_backends.py __tests__/unit/test_ocr_unit_tesseract_retry.py \
  __tests__/unit/test_ocr_text_source.py -v
=> 138 passed, 0 failed
```

Full non-slow suite (`-m "not slow"`, 3 real-OCR integration files deselected — multi-minute
Tesseract runs, out of scope for a routine gate):
```
docker exec vn-market-intelligence-mcp-pdf-extractor-1 python3 -m pytest __tests__/ -q -m "not slow"
=> 1079 passed, 7 failed, 5 skipped, 7 deselected in 247.58s
```

## 2. Coverage verdict per named area (file:function citations, not file existence)

**PEK-INTEGRATE** (`__tests__/test_pek_engine_adapter.py`, 39 tests) — imports and exercises
real `infrastructure.pek_engine_adapter`: `TestGpuAbsenceInvariant` asserts real module import
leaves no GPU package in `sys.modules`; `TestSemaphoreGuard` drives the real semaphore
(`test_semaphore_contention_raises_error`, `test_semaphore_released_after_extraction`);
`TestLazyLoadSingleton` exercises the real cache/load-once path; `TestLayoutCfgConfigPath` (7
tests) resolves real config paths incl. `test_fail_loud_when_yaml_exists_but_model_load_raises`;
`TestFailLoudAndTimeout` (6 tests) drives real timeout/env-read logic;
`TestFailLoudAndQuarantine` (5 tests, AC1-AC5) exercises real quarantine-on-failure behavior for
layout crash / paddle load failure / runtime table-extraction failure. Real functions called
directly (`_map_bboxes_to_zones`), not mocked at the function-under-test level. **Adequate.**

**layout-first** (`__tests__/unit/test_layout_invariants.py`, 33 tests) — imports real
`domain.primitives.layout_invariants.primitive` (`check_balance_identity`,
`check_codes_monotonic`, `check_no_orphan_rows`, plus 4 private helpers) and asserts against
pure in-memory data: balance-identity tolerance/rounding, monotonic-code violation detection
incl. page-boundary + group-subtotal edge cases, orphan-row ratio tolerance (5%/51%/1-in-19
edge), quarantine trigger on 10% balance mismatch. Zero mocking needed (pure functions) — real
domain logic exercised directly. **Adequate.**

**OCR** (`test_ocr_backends.py` + `test_ocr_unit_tesseract_retry.py` +
`unit/test_ocr_text_source.py`, 66 tests) — imports real `infrastructure.ocr_backends`:
`TestSelectOcrBackend` (5 tests) drives real backend-selection env-var logic;
`TestAutoFallbackPolicy` (3 tests) exercises real confidence-comparison fallback logic;
`TestToPilAndFailLoud` (5 tests) calls the real `_to_pil()` converter with a real numpy ndarray
and a real `PIL.Image` object (not a mock) plus asserts `RuntimeError` on unsupported input;
`TestOcrBackendPortDomainCompliance` enforces the DDD domain/infrastructure boundary for the
port. `test_ocr_unit_tesseract_retry.py` (5 tests, AC1-AC4b) drives the real retry loop in
`infrastructure.generic_md_table_extractor.ocr_unit` via `sys.modules` injection of a fake
`pytesseract`, not by mocking the function under test. `test_ocr_text_source.py` (12 tests)
covers the real `SqliteOcrTextSource` + `MistralOcrSource` (`NotImplementedError` contract) +
backend-selection factory. **Adequate — real code paths, not stubs-only.**

## 3. Real gap found: test-suite isolation bug (why NOT closing DONE_VERIFIED)

Full-suite run is not currently green. All 7 failures trace to **one root cause**:
`__tests__/unit/test_low_text_density_ocr_rasterize.py:91,102,110,123-124` unconditionally
overwrites `sys.modules["pdfplumber"|"fitz"|"paddleocr"|"PIL"|"PIL.Image"]` with stub modules
at **import time**, with no restore (no `conftest.py` in this suite → single pytest process,
zero cross-file isolation). This poisons the shared module cache for every test file collected
after it. (The same file's `_ensure_stub()` helper for `pdf2image`/`pytesseract`/`numpy` is
correctly conditional — only the PIL/fitz/pdfplumber/paddleocr lines are the unconditional bug.)

Reproduced deterministically in isolation:
```
docker exec ... pytest __tests__/unit/test_low_text_density_ocr_rasterize.py __tests__/test_ocr_backends.py -q
=> 1 failed, 46 passed
   FAILED test_ocr_backends.py::TestToPilAndFailLoud::test_d_tesseract_backend_pil_image_passthrough
   AttributeError: module 'PIL.Image' has no attribute 'new'

docker exec ... pytest __tests__/unit/test_low_text_density_ocr_rasterize.py __tests__/unit/test_page_rasterizer.py -q
=> 4 failed, 28 passed
   AssertionError: 4 != 2   (the stub's hardcoded fake fitz page_count=4 leaks into a real
                             2-page-PDF rasterizer assertion)
```
Same root cause explains the other 2 full-suite failures (`test_ocr_unit_tesseract_retry.py`
AC1/AC2, identical `PIL.Image.new` AttributeError). Each of the 5 in-scope files passes 100%
alone (138/138) — confirms this is a pure test-hygiene defect, not a production regression
(the stub code path never executes outside pytest).

This directly falls inside the audited OCR-fallback area (the polluting file's own docstring:
"AC-RASTERIZE-3: ocr_pages rasterize fallback"), so it cannot be waved off as unrelated.

## 4. Disposition

- `PDF-TEST-01-FIX`: `task_board.in_progress` → `task_board.review`, `status: BLOCKED`,
  `status_note` cites full evidence, `blocked_on: FIX-PDF-EXTRACTOR-TEST-SYS-MODULES-LEAK`.
  NOT flipped to DONE_VERIFIED.
- New backlog row `FIX-PDF-EXTRACTOR-TEST-SYS-MODULES-LEAK` (owner `dev-pdf-extractor`, zone
  `pdf-extractor`, priority medium, size S) — fix: replace the unconditional `sys.modules[...] =`
  stomp with `monkeypatch.setattr` (auto-restoring) or an explicit-teardown fixture, or extend
  the file's own `_ensure_stub()` conditional pattern to all 5 modules. DoD: full non-slow suite
  green in one run, order-independent.
- `.head` reset to `idle`.

DJ: `docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-qa.md` STEP `qa-S5`.
