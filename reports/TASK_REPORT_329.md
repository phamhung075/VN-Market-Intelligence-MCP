## Task Report 329
date: 2026-06-28
sprint: FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT
zone: apps/pdf-extractor/
changed:
  - apps/pdf-extractor/infrastructure/text_table_extractor.py (L498-572 constants+function, L1268-1336 gate)
  - apps/pdf-extractor/__tests__/unit/test_b02_tctd_parser.py (L740-969 TestFR7NotesSectionBoundary 21 tests)
commit: e0e30e83

tests: 21/21 TestFR7NotesSectionBoundary PASS | full suite: 11 fail (all pre-existing PIL-ABI/OCR/rasterizer) / 1059 pass
nfr4: PASS — zero per-issuer/ticker/form branches in production diff
fpt-regression: RESOLVED — codes 100/270/440 all present; code 270 value_current == 88,089,621,779,862.0 confirmed
false-stop-safety: CONFIRMED — "a ch . Thuyết" → False (THUY present, MINH absent); dual-token requirement at L565
verdict: APPROVED
