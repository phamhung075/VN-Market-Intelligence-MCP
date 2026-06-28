## Task Report 327
date: 2026-06-28
outcome: APPROVED
sprint: FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT
commit: e939a422

changed:
- apps/pdf-extractor/infrastructure/text_table_extractor.py:590 — _CODE_VALUE_COL_RE \d{2,3}→\d{3} + FR-1 comment
- apps/pdf-extractor/__tests__/unit/test_text_table_extractor.py:342 — TestFR1CodeRangeGate class (5 tests)

tests: 1030 pass / 12 fail (all 12 pre-existing) | targeted FR-1: 5/5 | tsc: N/A (Python) | ddd: PASS | security: PASS | mock-guard: EXIT 0
sandbox: 5/5 sandbox_runner PASS

### Failure-count reconcile (6→12)
SCOPE EXPANSION, not regressions. TASK_326 QA ran unit-only scope (893 = 887+6). Current full suite = 1043.
Proof: unit-only now = 898; 898 - 5 (new TestFR1CodeRangeGate tests) = 893 = exact TASK_326 baseline.
6 extra failures = integration/ + top-level (PIL ABI, OCR/Tesseract unavailable on host, randomized-order flake).
e939a422 touched 0 of the 12 failing test files (git verified). 2 integration tests import TextTableExtractor class
(not _CODE_VALUE_COL_RE) — fail with rows_stored=0 = OCR pipeline unavailable on host Mac. FR-1 ZERO regressions.

### AC verification
- AC-1: \d{3} confirmed at L590 — PASS
- AC-2: FR-1 comment added explaining 2-digit codes never appear in code-only-column — PASS
- AC-3: FPT golden codes 270/221/300 all match \d{3}, group(1) correct — PASS
- AC-4: test_two_digit_note_ref_does_not_match + test_three_digit_code_270_matches_fpt_golden — PASS
- AC-5: NFR-4 PASS — zero per-issuer branches; diff grep found only sprint-name comment, no code branch
- AC-6: Existing FPT test suite GREEN — PASS

verdict: APPROVED
