---
sprint: FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT
branch: task/327-fr1-code-range-gate
size: S
zone: apps/pdf-extractor/
depends_on: [TASK_326]
blocks: [TASK_328, TASK_329, TASK_330]
---

## TLDR
Narrow `_CODE_VALUE_COL_RE` regex pattern from `\d{2,3}` to `\d{3}` to enforce BCTC structural code range (3-digit codes ≥100) in code-only-column Layout 3. Eliminates false-positive 2-digit note-ref numbers being captured as codes. Single-line change.

## [PM] Planning Context

**FR:** FR-1 — Layout-adaptive column-boundary detection: code-range gate in `_CODE_VALUE_COL_RE` (Architect design §FR-1)

**Zone:** `apps/pdf-extractor/infrastructure/text_table_extractor.py` Line 554

**Why this order:** Depends on FR-3 (Roman normalization foundation). Must be done before FR-2, FR-7, FR-5 (all depend on stable Layout 3 behavior).

**Acceptance Criteria:**
- [ ] AC-1: `_CODE_VALUE_COL_RE` pattern changed from `\d{2,3}` to `\d{3}` (3 digits only, enforcing ≥100 code range)
- [ ] AC-2: Comment added: "3-digit structural BCTC code range; 2-digit codes appear in inline layouts (L1/L2/L4), never in code-only-column"
- [ ] AC-3: Non-regression on FPT: golden test codes (270, 300, 221, etc.) still match (all 3-digit, ≥100)
- [ ] AC-4: New test added to `test_text_table_extractor.py`:
  - [ ] "10 198.629.540" (2-digit note-ref + value) → Layout 3 does NOT match (code capture fails as expected)
  - [ ] "270 88.089.621.779.862" (3-digit + value) → Layout 3 matches, code="270" (FPT golden, non-regression)
- [ ] AC-5: No per-issuer branches; detection is purely structural (code digit count, BCTC standard)
- [ ] AC-6: Existing FPT test suite still GREEN (test_text_table_extractor.py)

**Code change site (architect design):**
- `apps/pdf-extractor/infrastructure/text_table_extractor.py` Line 554
- Change: `_CODE_VALUE_COL_RE = re.compile(r"^\s*(\d{3})\s+(?:[-—\w\s]*?)...")`

**Test files to modify:**
- `apps/pdf-extractor/__tests__/unit/test_text_table_extractor.py` — add AC-4 test cases (~8L)

**Knowledge needed:**
- Architect design: `docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md` §[Architect] FR-1
- Current code: `apps/pdf-extractor/infrastructure/text_table_extractor.py` L554
- Context: 2-digit codes (income-statement sub-items 50, 60, 70) only appear in Layouts 1/2/4 (inline), never in Layout 3 (code-only-column)

## [Developer] Implementation Notes

**Status:** DONE — commit e939a422 on main, 2026-06-28.

### Code change (1-line regex)
```python
# BEFORE:
_CODE_VALUE_COL_RE = re.compile(
    r"^\s*(\d{2,3})\s+(?:[-—\w\s]*?)(\d[\d.,]+(?:\.\d+)?|\(\d[\d.,]+\))\s*$"
)

# AFTER:
_CODE_VALUE_COL_RE = re.compile(
    r"^\s*(\d{3})\s+(?:[-—\w\s]*?)(\d[\d.,]+(?:\.\d+)?|\(\d[\d.,]+\))\s*$"
)
```

### Test cases
```python
# In test_text_table_extractor.py
def test_fr1_code_range_gate():
    # Test 1: 2-digit note-ref should NOT match Layout 3
    line = "10 198.629.540"
    m = _CODE_VALUE_COL_RE.match(line)
    assert m is None, "Layout 3 should reject 2-digit codes (note-refs)"
    
    # Test 2: 3-digit code should still match (FPT non-regression)
    line = "270 88.089.621.779.862"
    m = _CODE_VALUE_COL_RE.match(line)
    assert m is not None, "Layout 3 should match 3-digit BCTC codes"
    assert m.group(1) == "270"
    assert m.group(2) == "88.089.621.779.862"
```

### Rationale
- BCTC structure: balance-sheet codes are always 3-digit (100-999) in the code-value-column layout (separate OCR column)
- 2-digit codes (50, 60, 70 for income-statement sub-items) appear only in INLINE layouts where they have label context
- The false-positive case (FM-VCB-3: "Il 10 198.629.540") shows OCR rendering "Il" (Roman II misread) + note-ref "10" + value. Layout 3's `\d{2,3}` was capturing "10" as the code. The fix prevents this.

### Actual implementation (as-shipped)
- File changed: `apps/pdf-extractor/infrastructure/text_table_extractor.py` (was L554, now L590 after FR-3 insertions by TASK_326).
- Comment updated: added FR-1 attribution and explains why 2-digit codes never appear in code-only-column.
- Tests added: `TestFR1CodeRangeGate` class in `__tests__/unit/test_text_table_extractor.py` (5 tests):
  - `test_two_digit_note_ref_does_not_match` — "10 198.629.540" → None (2-digit rejected)
  - `test_one_digit_number_does_not_match` — "5 198.629.540" → None (1-digit rejected)
  - `test_three_digit_code_270_matches_fpt_golden` — "270 88.089.621.779.862" → code="270" (FPT non-regression)
  - `test_three_digit_code_221_with_note_ref_matches_fpt_golden` — "221 — 11 15.385.816.846.287" → code="221" (FPT non-regression)
  - `test_three_digit_code_300_matches` — "300 44.338.155.487.272" → code="300" (FPT non-regression)
- Import: `_CODE_VALUE_COL_RE` added to import in test file for direct regex testing.

### Verification results
- Target test class: 5/5 GREEN (zero warnings after docstring escape fix).
- Full unit suite (`__tests__/unit/`): 25/25 GREEN.
- Full pdf-extractor suite (1043 collected): 1030 pass, 12 fail, 1 skip.
  - Pre-existing baseline (before this change): IDENTICAL 12 failures, same test names.
  - Zero regressions introduced.
  - Known 12 pre-existing failures: 4 page_rasterizer (PIL.Image ABI), 2 ocr_tesseract_retry (PIL), 1 ocr_backends (PIL), 2 extract_md_tables_fpt (PIL), 2 slow-container tests (Tesseract + PDF at /app/data/pdfs/ unavailable on host), 1 pek_engine_adapter (randomized-order flake, PASSES in isolation).
- Sandbox G12 primitive tier: 29/30 pass (1 intentional failure_mismatch meta-test — designed to fail, pre-existing).
- Sandbox G12 module tier: 1/1 GREEN.
- FPT non-regression: all 3-digit FPT Layout-3 codes (270, 221, 300, etc.) confirmed matching. ZERO FPT codes dropped.

### NFR-4 compliance
Zero per-issuer branches. Change is purely structural: digit-count constraint on code-only-column OCR layout. The 3-digit rule is invariant across all B01-DN issuers.

### Commit
`e939a422` on `main` — `feat(pdf-extractor/TASK_327): FR-1 code-range gate — _CODE_VALUE_COL_RE \d{2,3} → \d{3}`

## [QA] Acceptance Procedure

1. Verify code change: `apps/pdf-extractor/infrastructure/text_table_extractor.py` L590, `_CODE_VALUE_COL_RE` pattern is `\d{3}` (3 digits only)
2. Check FR-1 comment added explaining the structural constraint
3. Run test class: `pytest apps/pdf-extractor/__tests__/unit/test_text_table_extractor.py::TestFR1CodeRangeGate -xvs`
4. Run full unit suite: `pytest apps/pdf-extractor/__tests__/unit/ -xvs` (verify no FPT regressions)
5. Mark TASK_327 DONE; unblock TASK_328

---

**Depends on:** TASK_326  
**Blocks:** TASK_328, TASK_329, TASK_330  
**Estimated:** ~2h (code + test + verify)

## [QA] Review Record

**Date:** 2026-06-28 | **Cycle:** 333 | **Verdict:** APPROVED

**Code change verified:** `apps/pdf-extractor/infrastructure/text_table_extractor.py` L590 — `\d{3}` confirmed (not `\d{2,3}`). FR-1 comment present.

**Targeted tests:** TestFR1CodeRangeGate 5/5 PASS (all AC-3/AC-4 cases green including FPT golden codes 270, 221, 300).

**Full suite:** 1030 pass / 12 fail / 1 skip.

**Failure-count reconcile (6→12) — SCOPE EXPANSION, not regressions:**
TASK_326 QA ran unit-only scope (893 tests = 887+6). Current full suite = 1043 tests. Mathematical proof: current unit-only = 898; 898 - 5 new TestFR1CodeRangeGate tests = 893 = exact TASK_326 count. The 6 extra failures are integration/ + top-level tests (PIL ABI mismatch, Tesseract+PDF unavailable on host Mac, randomized-order flake). Commit e939a422 touched 0 of the 12 failing test files (git confirmed). The 2 integration tests that import TextTableExtractor import the class (not `_CODE_VALUE_COL_RE`); they fail with `rows_stored=0` = OCR pipeline unavailable. FR-1 introduced ZERO regressions.

**NFR-4:** PASS — diff grep returned only the sprint-name comment "FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT"; zero per-issuer/ticker/form code branches.

**FPT non-regression:** codes 270 (group(1)="270"), 221, 300 all match `\d{3}`. Zero FPT codes dropped.

**DDD:** PASS. **Security:** PASS (no secrets, no process.env). **mock-guard:** EXIT 0.

**Status set:** TASK_327 → DONE. TASK_328 unblocked → READY.
