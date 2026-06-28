---
sprint: FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT
branch: task/329-fr7-notes-section-hardstop
size: S
zone: apps/pdf-extractor/
depends_on: [TASK_328]
blocks: [TASK_330]
---

## TLDR
Add hard-stop gate in `_parse_lines_to_rows()` to halt code-row extraction when entering Thuyết minh (notes) section in B02-TCTD documents. Detection: standalone note-item number ≥15 with trailing period (e.g., "26.", "27.") OR "Thuyết minh"/"Ghi chú" header. Prevents note items (codes 26, 27) from being mis-parsed as balance-sheet rows.

## [PM] Planning Context

**FR:** FR-7 — B02-TCTD notes-section boundary hard stop (Architect design §FR-7)

**Zone:** `apps/pdf-extractor/infrastructure/text_table_extractor.py` in `_parse_lines_to_rows()`

**Why this order:** Depends on FR-2 (label stripping establishes clean parsing). Resolves FM-VCB-7 (notes-section items absorbed as balance-sheet rows). Must precede FR-5 (dedup depends on clean row set).

**Acceptance Criteria:**
- [ ] AC-1: New function `_is_notes_section_boundary(stripped: str) → bool` added
- [ ] AC-2: Function detects 3 conditions (any match → boundary):
  - [ ] Standalone number ≥15 with trailing period (`\d{2,}\.` matching "26.", "27.", etc.)
  - [ ] "Thuyết minh" standalone header (normalized match via `_norm()`)
  - [ ] "Ghi chú" standalone header (normalized match via `_norm()`)
- [ ] AC-3: `_parse_lines_to_rows()` includes stop flag:
  - [ ] `_in_notes_section = False` initialized before loop
  - [ ] Check `if _is_notes_section_boundary(stripped): _in_notes_section = True; log_info()`
  - [ ] Check `if _in_notes_section: continue` to skip remaining lines
- [ ] AC-4: Threshold guard: num ≥15 prevents false-positive on low sub-codes (1-14 valid for B02-TCTD)
- [ ] AC-5: New test added to `test_b02_tctd_parser.py`:
  - [ ] Line "26." in page text → subsequent code rows dropped
  - [ ] Line "15 Some note item" → stop triggered (note item 15)
  - [ ] Line "Thuyết minh" as header → stop triggered
  - [ ] FPT golden pages (no "26.", no "Thuyết minh") → unaffected
- [ ] AC-6: Non-regression: FPT balance-sheet inline pages still GREEN (no standalone integers ≥15 + period)
- [ ] AC-7: No per-issuer branches; detection is purely positional/content-based

**Code change site (architect design):**
- `apps/pdf-extractor/infrastructure/text_table_extractor.py` in `_parse_lines_to_rows()` (L1109)
- Add `_is_notes_section_boundary()` function (~20L)
- Modify `_parse_lines_to_rows()` loop to include stop flag (~10L)

**Test files to modify:**
- `apps/pdf-extractor/__tests__/unit/test_b02_tctd_parser.py` — add FR-7 fixture tests (~12L)

**Knowledge needed:**
- Architect design: `docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md` §FR-7
- Current code: `apps/pdf-extractor/infrastructure/text_table_extractor.py` §`_parse_lines_to_rows()` (L1109)
- Existing patterns: `_JUNK_SKIP_KEYS`, `_NORM_THUY`, `_norm()` function for diacritic-insensitive matching

## [Developer] Implementation — FR-7 DONE (2026-06-28)

### Files changed
- `apps/pdf-extractor/infrastructure/text_table_extractor.py`
  - Module-level constants added after `_is_recognized_section_header()`: `_NOTES_BOUNDARY_NUMBER_RE`, `_NORM_THUY`, `_NORM_GHI_CHU`
  - New function `_is_notes_section_boundary(stripped: str) -> bool` (50 L, incl. docstring)
  - `_parse_lines_to_rows()`: `_in_notes_section: bool = False` initialized before loop; FR-7 gate added AFTER all existing skip checks (date-header skip, junk skip, signature-date skip, backslash-fragment skip) and BEFORE `_try_parse_code_row()`
- `apps/pdf-extractor/__tests__/unit/test_b02_tctd_parser.py`
  - Added `_is_notes_section_boundary` to imports
  - Added `TestFR7NotesSectionBoundary` class (TC-B07, 20 test methods)

### Critical design decision: FR-7 gate placement
The gate is placed AFTER all existing skip checks (not at the top of the loop as shown in TASK_329.md sample). Reason: FPT fixture pages contain `"a ch . Thuyết"` and `"Thuyết 31/3/2026 31/12/2025"` column-header OCR fragments. Placing FR-7 before the date-header skip caused the boundary to fire on these fragments → ALL FPT non-current-assets rows (codes 200, 270) were dropped → 3 regressions introduced and caught during testing. Fixed by:
1. Placing FR-7 AFTER all skip checks (date-header "Thuyết 31/3/2026..." filtered upstream)
2. Tightening check 2: requires BOTH `_NORM_THUY in norm_s AND "MINH" in norm_s` (not just `_NORM_THUY in norm_s`) to prevent false-stop on OCR-fragment lines containing "Thuyết" without "minh"

### Threshold ≥15 rationale
B02-TCTD balance-sheet sub-item codes 1–14 are valid data rows. Notes section items start at 15+ (in practice 26+). Threshold guards the valid sub-code range.

### DoD evidence

**AC-1:** `_is_notes_section_boundary` exported and importable ✓
**AC-2:** Three conditions: standalone num ≥15+period, "Thuyết minh" full-phrase (THUY+MINH), "Ghi chú" ✓
**AC-3:** `_in_notes_section` flag initializes False before loop; sets True on boundary; `continue` skips all subsequent lines ✓
**AC-4:** `_is_notes_section_boundary("14.") == False`; `_is_notes_section_boundary("15.") == True` ✓
**AC-5:** Integration tests: "26." stops extraction; FPT pages unaffected ✓
**AC-6:** FPT fixture: codes 100, 270, 440 all present post-FR-7; Stage 6 non-regression ✓
**AC-7:** Zero per-issuer/ticker/form branches anywhere in the implementation ✓
**NFR-4:** Detection is content-structural only (standalone integer+period, THUYET+MINH substring, GHI CHU substring) ✓

**pytest results (full suite):**
```
12 failed (all pre-existing env failures: PIL ABI, missing PDF files, OCR-absent),
1058 passed, 1 skipped
Baseline: ~11-12 pre-existing — within baseline ✓
```

**FR-7 test class alone:**
```
66 passed in 0.32s (TestFR7NotesSectionBoundary: 20 tests all GREEN)
```

**Sandbox G12:**
- Primitive tier: 30 PASS, 6 intentional-fail (5 known_bad + 1 failure_mismatch canary) ✓
- Module tier: 1 PASS (financial_reports/multi_primitive_story.json) ✓
- FPT Stage 6: codes 100/270/440 all present, values correct (88,089,621,779,862) ✓
- Stage 4 dup ≤ 1: FR-7 does not affect inline pages where dedup logic runs ✓

**False-stop safety confirmed:**
- `_is_notes_section_boundary("a ch . Thuyết") == False` (THUY present, MINH absent) ✓
- `_is_notes_section_boundary("Thuyết 31/3/2026 31/12/2025") == False` (filtered upstream by date-header skip AND MINH absent) ✓
- `test_vcb_page5_with_thuyetminh_column_header_not_stopped` PASS ✓
- `test_fpt_inline_page_unaffected` PASS ✓
- FPT code 270 value_current == 88,089,621,779,862.0 (unchanged) ✓

---

## [Developer] Implementation Notes (original design notes)

### Code structure
```python
# Module-level constants
_NOTES_BOUNDARY_NUMBER_RE = re.compile(r"^\d{2,}\.$")  # "26." "27." "28." etc.
_NORM_GHI_CHU = _norm("ghi chú")

# New function
def _is_notes_section_boundary(stripped: str) -> bool:
    """
    Detect entry into the Thuyết minh notes body (B02-TCTD).
    Triggers on:
    1. Standalone note-item number with trailing period (≥15): "26." "27." "28."
       Threshold ≥15 to exclude low single/double codes (1., 2., ..., 14.) which are
       valid B02-TCTD sub-item codes.
    2. "Thuyết minh" standalone header on its own line.
    3. "Ghi chú" standalone header.
    """
    # Check 1: standalone number ≥15 with trailing period ("26." → notes item 26)
    m = _NOTES_BOUNDARY_NUMBER_RE.match(stripped)
    if m:
        num = int(re.match(r"^(\d+)", stripped).group(1))
        if num >= 15:
            return True
    
    # Check 2: Thuyết minh header line
    norm_s = _norm(stripped)
    if _NORM_THUY in norm_s:
        return True
    
    # Check 3: Ghi chú header
    if _NORM_GHI_CHU in norm_s:
        return True
    
    return False

# In _parse_lines_to_rows()
def _parse_lines_to_rows(...):
    _in_notes_section = False  # Initialize before loop
    
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        
        # FR-7: notes-section hard stop (B02-TCTD)
        if _is_notes_section_boundary(stripped):
            _in_notes_section = True
            logger.info(
                "_parse_lines_to_rows: page %d notes-section boundary detected "
                "at %r — halting code-row extraction",
                page_num, stripped,
            )
        
        if _in_notes_section:
            continue  # Skip all remaining lines
        
        # ... rest of existing line processing
```

### Test cases
```python
# In test_b02_tctd_parser.py
def test_fr7_notes_hardstop():
    # Test 1: Line "26." triggers boundary
    assert _is_notes_section_boundary("26.") == True
    assert _is_notes_section_boundary("15.") == True
    assert _is_notes_section_boundary("14.") == False  # Below threshold
    
    # Test 2: "Thuyết minh" header triggers
    assert _is_notes_section_boundary("Thuyết minh") == True
    assert _is_notes_section_boundary("THUYẾT MINH") == True  # Case-insensitive via _norm
    
    # Test 3: "Ghi chú" header triggers
    assert _is_notes_section_boundary("Ghi chú") == True
    
    # Test 4: Normal line doesn't trigger
    assert _is_notes_section_boundary("I Tiền mặt 100.000") == False
    assert _is_notes_section_boundary("II Tiền gửi 500.000") == False
    
    # Test 5: Integration — parse lines with notes section
    lines = [
        "I Tiền mặt 100.000",
        "II Tiền gửi 500.000",
        "26.",  # Boundary
        "6 Lãi cho vay và phí phải thu 10.000",  # Should NOT be parsed
    ]
    rows = _parse_lines_to_rows(lines, page_num=1, section="balance_sheet")
    # Should only have 2 rows (I, II), not the note item line
    assert len(rows) == 2
    assert rows[0]["code"] == "I"
    assert rows[1]["code"] == "II"
```

## [QA] Acceptance Procedure

1. Verify new function: `_is_notes_section_boundary()` detects 3 conditions
2. Verify constants: `_NOTES_BOUNDARY_NUMBER_RE`, `_NORM_GHI_CHU` defined
3. Verify loop flag: `_in_notes_section` initialized and checked in `_parse_lines_to_rows()`
4. Verify threshold: num ≥15 guards against false-positive on codes 1-14
5. Run test: `pytest apps/pdf-extractor/__tests__/unit/test_b02_tctd_parser.py::test_fr7_notes_hardstop -xvs`
6. Run full suite: `pytest apps/pdf-extractor/__tests__/unit/ -xvs` (verify FPT non-regression)
7. Mark TASK_329 DONE; unblock TASK_330

---

**Depends on:** TASK_328  
**Blocks:** TASK_330  
**Estimated:** ~2h (code + test + verify)

---

## [QA] Review Record — 2026-06-28

**verdict:** APPROVED
**commit:** e0e30e83
**report:** reports/TASK_REPORT_329.md

### Gate results

**FPT 3-regression — GENUINELY RESOLVED (not masked):**
- Live code L565: `if _NORM_THUY in norm_s and "MINH" in norm_s:` — dual-token requirement confirmed
- `_is_notes_section_boundary("a ch . Thuyết")` → False (THUY present, MINH absent) — independently verified
- test_vcb_page5_with_thuyetminh_column_header_not_stopped PASS
- FPT codes 100/270/440 all present; code 270 value_current == 88,089,621,779,862.0

**False-stop safety:**
- Gate placement: FR-7 at L1315 confirmed AFTER all existing skip checks (date-header/junk/signature-date/backslash-fragment) and BEFORE _try_parse_code_row
- "Thuyết 31/3/2026 31/12/2025" filtered upstream by date-header check AND lacks MINH — double protection
- "a ch . Thuyết": THUY present, MINH absent → False ✓
- test_fpt_inline_page_unaffected PASS (codes 100/270/440 present with correct values)

**Tests:** 21/21 TestFR7NotesSectionBoundary PASS (independent live run). Covers: positive boundary (26., 15., Thuyết minh, Ghi chú), negative safety (14., roman codes, 3-digit codes, empty, OCR-fragment), integration (boundary halts extraction, boundary line not a row, Thuyết minh header, FPT non-regression, VCB OCR-fragment false-stop).

**NFR-4:** PASS — diff grep for issuer/ticker/form conditionals: zero per-issuer branches in production code. All matches are comment/docstring lines only.

**Full suite:** 11 fail / 1059 pass — 1 fewer failure than dev baseline of 12. All 11 failures are pre-existing env failures (PIL ABI, OCR-absent, rasterizer PDF-absent). Zero new failures.

**TASK_330 unblocked:** dependency 329 DONE → TASK_330 (FR-5 dedup) moved to READY.
