## Task Report 328
date: 2026-06-28
outcome: APPROVED
sprint: FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT
commit: 774cfd69

changed:
- apps/pdf-extractor/infrastructure/text_table_extractor.py:1231-1240 — FR-2 post-parse label clean (10 lines, additive)
- apps/pdf-extractor/__tests__/unit/test_b02_tctd_parser.py:572-701 — TestFR2TrailingNoterefStrip class (7 tests, 129 lines)

tests: 899 pass / 6 fail (all 6 pre-existing PIL-ABI/OCR env) | targeted 7/7 TestFR2 + 122/122 3-file suite | ddd: PASS | security: PASS | nfr-4: PASS

### Guard correctness (independent verification)
- "Chứng khoán kinh doanh 4" → _label_clean="Chứng khoán kinh doanh" len=22 ≥ 5 → STRIP — PASS
- "Nợ 1" → _label_clean="Nợ" len=2 < 5 → guard fires → NO STRIP — PASS
- "Quỹ phát triển khoa học 2025" → regex \d{1,3}$ no match (4-digit) → unchanged — PASS
- Guard is on REMAINING length (len(_label_clean)), not original label — CONFIRMED at L1238

### AC verification
- AC-1: post-parse label-clean step in _parse_lines_to_rows() after _try_parse_code_row() — PASS (L1232)
- AC-2: regex re.sub(r'\s+\d{1,3}$', '', label) applied — PASS (L1237)
- AC-3: guard if len(_label_clean) >= 5 present — PASS (L1238)
- AC-4: 7 tests cover strip-1digit, guard-short-label, 4-digit-year, strip-2digit, strip-3digit, unchanged, e2e-assemble — PASS (7/7)
- AC-5: FPT non-regression — 122/122 including FPT Stage-6 paths — PASS
- AC-6: zero per-issuer branches — diff grep clean (only comment matches) — PASS (NFR-4)

### Full suite failure reconcile
6 failures all pre-existing: test_page_rasterizer.py (4, PDF rasterizer unavailable on host Mac), test_ocr_unit_tesseract_retry.py (2, PIL ABI issue). None touch text_table_extractor.py or test_b02_tctd_parser.py. Baseline identical to TASK_327 QA (cycle-333).

verdict: APPROVED
