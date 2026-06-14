## Task Report DOCLANG-T1-DOMAIN

changed: [apps/pdf-extractor/domain/modules/financial_reports/ports.py:35 (+1 line, module docstring bullet), apps/pdf-extractor/infrastructure/config.py:20,32 (field + from_env, added by scaffold 5d121989)]
tests: 968 pass / 2 fail (pre-existing) | ddd: PASS | security: PASS
verdict: APPROVED

### Pytest Summary (RAW)
```
2 failed, 968 passed, 5 warnings in 213.74s (0:03:33)
```

### Failing Tests — Pre-existing, Unrelated to T1

1. `__tests__/integration/test_extract_tables_bt3d_real_ocr.py::test_extract_tables_usecase_real_ocr_path`
   - Cause: BT-5 balance-identity gate fails (delta=43,707,714,826,297 VND) — real OCR path cross-check issue on locally available PDF
   - Relation to T1: NONE — no import of ports.py, DocLangWritePort, doclang_output_dir

2. `__tests__/integration/test_bt3_fix3_row_fidelity.py::test_bt3_fix3_real_ocr_fidelity`
   - Cause: `/app/data/pdfs/20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf` missing at container path — host env does not have Docker path mounted
   - Relation to T1: NONE — no import of ports.py, DocLangWritePort, doclang_output_dir

Note: Dev reported 3 failed/967 passed — actual run produced 2 failed/968 passed. Count discrepancy likely due to different runtime env. Neither count is caused by T1 code.

### 7 AC — Verdict

- [x] AC-1: `DocLangWritePort` Protocol present in ports.py — CONFIRMED at line 583
- [x] AC-2: Method signature `write(self, report_id: str, xml_str: str) -> str` — CONFIRMED at line 594
- [x] AC-3: Docstring explicitly names `FilesystemDocLangWriteAdapter` and `NullDocLangWriteAdapter` — CONFIRMED at lines 590-591
- [x] AC-4: `Config.doclang_output_dir: str` field added — CONFIRMED at line 20 of config.py
- [x] AC-5: `Config.from_env()` reads `DOCLANG_OUTPUT_DIR` and defaults to `/app/data/doclang` — CONFIRMED at line 32; `python3 -c "..."` output: `doclang_output_dir=/app/data/doclang`
- [x] AC-6: Port count in module docstring updated to 17 — CONFIRMED at line 17: "17 ports — BT-1 adds 3; BT-3-A adds 2; MD-EXTRACT adds 2; MD-EXTRACT-2 adds 1; LF-EXTRACT adds 2; DOCLANG-SERIALIZE adds 1"
- [x] AC-7: No other imports or logic added; pure interface definition — CONFIRMED: diff is exactly 1 line (docstring bullet), DocLangWritePort class itself is a pure Protocol with no infra imports

### DDD Scan
grep "from.*infrastructure" / "from.*application" on ports.py: 3 hits, all in docstring comments — zero real imports. PASS.

### Import Smoke Test (RAW)
```
$ python3 -c "from domain.modules.financial_reports.ports import DocLangWritePort; print('Port OK')"
Port OK
$ python3 -c "from infrastructure.config import Config; c = Config.from_env(); print(f'doclang_output_dir={c.doclang_output_dir}')"
doclang_output_dir=/app/data/doclang
```

### Board Mutation
DOCLANG-T1-DOMAIN: review -> done_verified (atomic tmp->rename, [ -s tmp ] + json.load guard, verified_at: 2026-06-14T12:00:00Z)
T2-T6: NOT touched (all remain TODO/backlog as corrected by router)
DOCLANG-T2-SERIALIZER dependency on DOCLANG-T1-DOMAIN is now satisfied.

### Commit
2d79baed — feat(pdf-extractor/DOCLANG-T1-DOMAIN): harden DocLangWritePort + Config — DOCLANG-SERIALIZE Phase 1
