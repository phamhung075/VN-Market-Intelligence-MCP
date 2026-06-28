## Task Report 326
date: 2026-06-28
outcome: APPROVED

changed:
- apps/pdf-extractor/infrastructure/text_table_extractor.py (module-level _ROMAN_OCR_NORMALIZE dict + _try_parse_roman_code_row normalization step, +36L)
- apps/pdf-extractor/__tests__/unit/test_b02_tctd_parser.py (TestRomanOcrNormalization class, 15 tests, +158L)

tests: 58 targeted pass / 0 fail | full suite: 887 pass / 6 pre-existing fail (PIL/page_rasterizer — unrelated to FR-3) | sandbox G12 primitive: 29 pass / 6 intentional-fail | sandbox G12 module: 1 pass / 0 fail
ddd: PASS (Python zone — no TS DDD check applicable)
security: PASS (no hardcoded credentials, no issuer literals in logic paths)
nfr-4: PASS — zero per-issuer/per-ticker/per-form branches confirmed; EXACT-KEY dict lookup only
fpt-non-regression: PASS — FPT Roman codes all canonical (none in _ROMAN_OCR_NORMALIZE keys); Stage 6 GREEN
verdict: APPROVED
