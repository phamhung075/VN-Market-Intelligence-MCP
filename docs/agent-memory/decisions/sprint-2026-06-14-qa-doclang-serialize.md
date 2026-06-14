<!-- decision-journal: qa | 2026-06-14 | DOCLANG-SERIALIZE Phase 1 -->

## Entry: DOCLANG-SERIALIZE Phase 1 QA Gate

**task-id:** DOCLANG-T1 through DOCLANG-T6
**date:** 2026-06-14
**agent:** qa
**sprint:** DOCLANG-SERIALIZE

### What was considered

- 13 unit tests in test_doclang_serializer.py: all pass (13/13)
- Full suite (967 tests): 3 failures, all pre-existing before DOCLANG commits
  - test_extract_tables_bt3d_real_ocr: real-OCR integration, missing PDF on host, pre-existing (stash-verified on HEAD~)
  - test_bt3_fix3_real_ocr_fidelity: same class (real-OCR, missing /app/data/pdfs), pre-existing
  - test_pek_engine_adapter::TestFailLoudAndTimeout::test_extract_layout_and_tables_raises_on_timeout: pek timeout, pre-existing (file unchanged in sprint)
- DDD: domain/modules/financial_reports/ports.py is pure Protocol — zero infra/app/interface imports. DocLangWritePort correctly placed in domain layer.
- Fence false-green: probe confirmed doclang.validate() raises ValidationError on malformed XML. Fixtures A/B/C call _validate_and_assert() which would fail on bad output.
- EC-3 deliberate skip of validate: documented in test docstring — surplus rows violate Schematron rectangular rule by design; not a hidden skip.
- Validation observability-only: _validate_output() never gates return path; ImportError silently skipped; exceptions logged, not re-raised.
- AC-6 bctc_table_rows isolation: doclang_serializer.py + doclang_serialize_usecase.py contain zero sqlite3/TablePushClient/DB calls. Only I/O is os.makedirs + open() in FilesystemDocLangWriteAdapter. NullDocLangWriteAdapter used in all 13 tests — no filesystem pollution.
- AC-7: doclang==0.6.0 pinned in requirements.txt; `pip check` warning is tokenizers vs transformers (pre-existing PEK conflict, unrelated to DOCLANG).
- mypy: 18 pre-existing errors in dtos/ports/module (List/Dict type-arg, float arg-type). 0 new errors in doclang_serializer.py or doclang_serialize_usecase.py.
- Security: no process.env, no hardcoded secrets, no SQL in DOCLANG files.

### Why APPROVED (not CHANGES_REQUESTED)

All AC pass:
- AC-1: doclang.validate() called on real output, 0 XSD + 0 Schematron errors (Fixtures A, B, C, EC-2, EC-4)
- AC-2: 3 failures all pre-existing on HEAD~ (stash-verified); 967 total / 964 pass
- AC-3: 3 golden fixtures pass with validate assertions
- AC-4: DocLangWritePort in domain/ports.py; NullDocLangWriteAdapter used in all tests
- AC-6: serializer path shares no writer with bctc_table_rows push path; no DB mutation possible
- AC-7: doclang==0.6.0 pinned; pip check warning pre-existing/unrelated
- DoD/G12 mypy: 0 NEW errors (18 pre-existing in dtos/ports/module, acceptable)

**verdict:** APPROVED
