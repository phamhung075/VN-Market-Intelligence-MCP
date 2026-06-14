# Task Report — DOCLANG-SERIALIZE Phase 1 (T1–T6)

**Sprint:** DOCLANG-SERIALIZE Phase 1
**Tasks:** DOCLANG-T1 → DOCLANG-T6
**Zone:** apps/pdf-extractor/
**Commits:** 5d121989, 2d79baed, 01ce9431, ccaf937f
**QA date:** 2026-06-14
**Verdict:** APPROVED

---

## Changed files

- `apps/pdf-extractor/infrastructure/doclang_serializer.py` (new, 343L)
- `apps/pdf-extractor/application/doclang_serialize_usecase.py` (new, 153L)
- `apps/pdf-extractor/__tests__/unit/test_doclang_serializer.py` (new, 448L)
- `apps/pdf-extractor/domain/modules/financial_reports/ports.py` (additive: DocLangWritePort added)
- `apps/pdf-extractor/infrastructure/config.py` (additive: doclang_output_dir field)
- `apps/pdf-extractor/main.py` (additive: wiring block lines 49-53, 193-201, 261)
- `apps/pdf-extractor/interface/handlers.py` (additive: doclang_serialize_usecase Optional param line 297)
- `apps/pdf-extractor/requirements.txt` (additive: doclang==0.6.0)

---

## Test results

**DOCLANG suite:** 13 / 13 pass
**Full suite:** 964 pass / 3 fail / 967 total

3 failures are **pre-existing** (verified on HEAD~ via git stash):
- `test_extract_tables_usecase_real_ocr_path` — real-OCR integration, requires `/app/data/pdfs/` PDF on host (not present)
- `test_bt3_fix3_real_ocr_fidelity` — same class, same cause
- `TestFailLoudAndTimeout::test_extract_layout_and_tables_raises_on_timeout` — PEK timeout test, file unchanged in sprint

None of the 3 failures touch DOCLANG zone files.

**tsc:** N/A (Python project)
**DDD:** PASS — domain/modules/financial_reports/ports.py zero infra/app/interface imports
**Security:** PASS — no process.env, no hardcoded secrets, no SQL

---

## AC verification

| AC | Result | Evidence |
|---|---|---|
| AC-1 doclang.validate() 0 errors | PASS | `_validate_and_assert()` called in Fixtures A/B/C, EC-2, EC-4; all pass live |
| AC-2 existing suite green | PASS | 3 failures pre-existing on HEAD~; unrelated to zone |
| AC-3 golden fixtures A/B/C | PASS | All 3 pass with validate assertions |
| AC-4 port+adapters wired, null in tests | PASS | DocLangWritePort in domain; NullDocLangWriteAdapter in all 13 tests; no filesystem writes |
| AC-6 bctc_table_rows byte-for-byte regression-clean | PASS | doclang_serializer.py / doclang_serialize_usecase.py contain zero sqlite3/DB calls; separated from TablePushClient path |
| AC-7 doclang==0.6.0 pinned + pip check | PASS | pinned in requirements.txt; pip check warning is pre-existing PEK tokenizers/transformers conflict |
| DoD/G12 mypy 0 NEW errors | PASS | 0 errors in doclang_serializer.py + doclang_serialize_usecase.py; 18 pre-existing in dtos/ports/module |

---

## Fence false-green check

Manually probed `doclang.validate()` with malformed XML (`<bad_element/>`). Result:
`ValidationError` raised correctly with XSD error. Tests calling `_validate_and_assert()` would FAIL on malformed output. No vacuous pass.

EC-3 deliberate skip of validate: documented in test docstring — surplus rows violate Schematron rectangular rule by design. Not a hidden skip.

Validation is observability-only: `_validate_output()` wraps in `except ImportError` (container skip) and `except Exception` (log-only). Never gates the `execute()` return path.

---

## Decision journal

`docs/agent-memory/decisions/sprint-2026-06-14-qa-doclang-serialize.md`

---

## BCTC Eval Gate

Sprint is additive serializer output only — no report_id in task scope to eval. BCTC-EVAL: not applicable (no bctc_table_rows mutation path active).

---

## Issues

None — APPROVED.
