# TASK-304-FR7: B02-TCTC notes-section boundary hard stop

**From:** pm (FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT sprint decomposition)  
**To:** dev-pdf-extractor  
**Date:** 2026-06-28  
**Sprint:** FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT  
**Sequence:** 4 of 7  
**Depends:** TASK-303-FR2-LABEL-CLEAN

---

## Requirement (FR-7)

After the balance sheet body, B02-TCTD (bank) documents include a numbered notes section ("Thuyết minh") with items numbered 26, 27, 28, etc. These pass the Layout 5 scan-and-extract (`_find_code_in_line()`) and appear as balance-sheet rows with codes "26", "27".

**Required behavior:** `_parse_lines_to_rows()` must detect entry into the Thuyết minh notes body and halt further code-row extraction for that page. Detection triggers on:
1. Standalone number ≥15 with trailing period (26., 27., 28., etc. — note item numbers)
2. Standalone "Thuyết minh" or "Ghi chú" header line

Non-regression: normal `_NORM_THUY` detection in `_parse_three_block_layout()` already handles this for three-block pages. FR-7 is a defense-in-depth gate for the inline-layout path.

VCB acceptance impact: Fixes FM-VCB-7 (note items 26, 27, 8 no longer absorbed as balance-sheet rows).

---

## Design (from [Architect] Brownfield Findings)

### Mechanism: positional gate in `_parse_lines_to_rows`

In `apps/pdf-extractor/infrastructure/text_table_extractor.py`, add a new helper function:

```python
_NOTES_BOUNDARY_NUMBER_RE = re.compile(r"^\d{2,}\.$")  # "26." "27." "28." etc.
_NORM_GHI_CHU = _norm("ghi chú")

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
```

In `_parse_lines_to_rows`, add a stop flag at the start of the loop:

```python
_in_notes_section = False

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
        continue
    # ... rest of existing line processing
```

---

## Acceptance Criteria

- [ ] `_NOTES_BOUNDARY_NUMBER_RE` pattern added: `r"^\d{2,}\.$"`
- [ ] `_NORM_GHI_CHU` constant added
- [ ] `_is_notes_section_boundary(stripped)` function added with 3 detection checks
- [ ] Check 1: standalone number ≥15 with period (26., 27., ...) triggers boundary
- [ ] Check 2: "Thuyết minh" header triggers boundary (diacritic-insensitive via _norm)
- [ ] Check 3: "Ghi chú" header triggers boundary
- [ ] `_in_notes_section` flag set in `_parse_lines_to_rows` loop
- [ ] All lines after boundary are skipped (halt extraction)
- [ ] Test: line "26." on page triggers boundary stop
- [ ] Test: line "Thuyết minh" triggers boundary stop
- [ ] Test: line "Ghi chú" triggers boundary stop
- [ ] Non-regression: FPT balance-sheet pages (no note items ≥15) unaffected
- [ ] Non-regression: B01-DN income-statement codes 01-14 pass through (threshold ≥15)
- [ ] Test added in `__tests__/unit/test_b02_tctd_parser.py` with VCB fixtures

---

## Files to modify

- `apps/pdf-extractor/infrastructure/text_table_extractor.py` (add function + loop logic ~20 LOC)
- `apps/pdf-extractor/__tests__/unit/test_b02_tctd_parser.py` (add tests ~15 LOC)

---

## Non-regression anchors

- FPT 2025Q4 golden tests (no notes section)
- All existing `test_text_table_extractor.py` tests must pass
- B01-DN income-statement fixtures (codes 01-14 must pass through)

---

## Implementation notes

- Interaction with `_JUNK_SKIP_KEYS`: "Thuyết minh" is NOT in `_JUNK_SKIP_KEYS` (only "mã số" and "mẫu số"). FR-7 is a positional STOP (sets flag), not a line skip. After stop, ALL lines are skipped.
- Defense-in-depth: duplicates existing `_NORM_THUY` check in `_parse_three_block_layout()` — no harm, just extra safety.
- DDD layer: infrastructure (positional logic in _parse_lines_to_rows)

---

## Reference

- Architect design: docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md § [Architect] Brownfield Findings § FR-7
- BA spec: docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md § Section 2 § FR-7
- Live failure: docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md § Section 1.2 § FM-VCB-7
- Risk flags: docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md § [Architect] § Risk § RISK-5
