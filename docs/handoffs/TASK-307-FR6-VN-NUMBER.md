# TASK-307-FR6: VN-number parenthetical parsing robustness (trace-first investigation)

**From:** pm (FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT sprint decomposition)  
**To:** dev-pdf-extractor  
**Date:** 2026-06-28  
**Sprint:** FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT  
**Sequence:** 7 of 7 (final task)  
**Depends:** TASK-306-FR4-SECTION-DETECT

---

## Requirement (FR-6)

VCB live data shows: label='Chi phí hoạt động dịch vụ' with values "(1.992.671) (1.921.556)" is parsed as value_current=-1.992671 instead of -1992671. This is a VN number format error: parenthetical value contains VN dot-thousands separator (1.992.671 = 1,992,671), not a decimal.

**CRITICAL NOTE:** Architect's analysis shows the current `vn_number_normalize` code ALREADY handles "(1.992.671)" correctly through the existing `_PARENS_RE + _VN_INT_RE` path. The FM-VCB-4 bug producing -1.992671 is therefore NOT originating in `vn_number_normalize` itself. The bug is upstream in `_parse_value_cells` or token extraction layer.

**Required behavior:** This is a TRACE-FIRST investigation task. Add test case `vn_number_normalize("(1.992.671)") == "-1992671"` to verify current behavior. If test PASSES (expected): investigation is complete, confirming upstream bug. If test FAILS: bug is indeed in vn_number_normalize, add defensive poppler-artifact space handler in `_parse_value` to normalize "(1.992. 671)" → "(1.992.671)" before normalization.

VCB acceptance impact: Fixes FM-VCB-4 (if upstream bug found and fixed) OR confirms root cause (if test passes).

---

## Design (from [Architect] Brownfield Findings)

### Phase 1: Verification (trace-first mandatory)

Add test to `apps/pdf-extractor/__tests__/unit/test_vn_number_normalize.py`:

```python
def test_vn_number_normalize_parenthetical_vcb():
    """
    FR-6 verification: existing code should already handle VN-format parenthetical.
    If this test PASSES: bug is upstream in _parse_value_cells or token extraction.
    If this test FAILS: add defensive space-handler in _parse_value.
    """
    # These are the actual VCB values from FM-VCB-4
    assert vn_number_normalize("(1.992.671)") == -1992671.0
    assert vn_number_normalize("(1.921.556)") == -1921556.0
    
    # FPT non-regression (existing behavior)
    assert vn_number_normalize("(586.166.744.274)") == -586166744274.0
```

**STOP after adding the test. Run the test.**

If test PASSES: Investigation complete. The bug is upstream in `_parse_value_cells` or the token passed to `vn_number_normalize`. Trace the actual token in live VCB OCR and document the finding in a comment. The rest of FR-6 is OUT of scope for this sprint (upstream fix is separate).

If test FAILS: Proceed to Phase 2.

### Phase 2: Defensive fix (if trace reveals upstream token issue)

If trace reveals OCR produces "(1.992. 671)" (space inside parens — poppler artifact), add defensive handler in `_parse_value`:

```python
def _parse_value(raw: Optional[str]) -> Optional[float]:
    if raw is None:
        return None
    cleaned = str(raw).strip()
    # FR-6: normalize OCR-artifact space inside parenthetical VN number
    # e.g. "(1.992. 671)" → "(1.992.671)" before normalization
    cleaned = re.sub(r"(\(\d[\d.]*)\.\s+(\d[\d.]*\))", r"\1.\2", cleaned)
    normalized = vn_number_normalize(cleaned)
    ...
```

This mirrors the poppler-artifact handler already in `_find_code_in_line` (L250) and is backward-safe (only fires on patterns with parenthetical + space after dot).

---

## Acceptance Criteria

**Phase 1 (mandatory):**
- [ ] Test `test_vn_number_normalize_parenthetical_vcb` added to `test_vn_number_normalize.py`
- [ ] Test cases: `("(1.992.671)", -1992671.0)`, `("(1.921.556)", -1921556.0)`, `("(586.166.744.274)", -586166744274.0)`
- [ ] Test executed and result documented
- [ ] If PASSES: investigation complete, upstream bug confirmed, document finding
- [ ] If FAILS: proceed to Phase 2

**Phase 2 (conditional on Phase 1 failure):**
- [ ] Defensive poppler-artifact space handler added in `_parse_value` (if needed)
- [ ] Regex pattern: `r"(\(\d[\d.]*)\.\s+(\d[\d.]*\))"` → `r"\1.\2"`
- [ ] Added BEFORE `vn_number_normalize` call in `_parse_value`
- [ ] Test: `_parse_value("(1.992. 671)")` → `-1992671` (space inside parens)
- [ ] Non-regression: all 12 existing `test_vn_number_normalize.py` tests remain GREEN
- [ ] FPT non-regression: `("(586.166.744.274)", -586166744274.0)` unchanged

---

## Files to modify

- `apps/pdf-extractor/__tests__/unit/test_vn_number_normalize.py` (add test ~8 LOC)
- `apps/pdf-extractor/domain/primitives/vn_number_normalize/primitive.py` (add defensive handler ~3 LOC, IF Phase 2 needed)

---

## Non-regression anchors

- All 12 existing `test_vn_number_normalize.py` tests must pass
- FPT 2025Q4 golden tests (existing parenthetical format "(586.166.744.274)")
- All existing `test_text_table_extractor.py` tests must pass

---

## Critical notes

- This is a TRACE-FIRST task. Do NOT write code until verification test is added and run.
- The trace reveals WHERE the bug is: in `vn_number_normalize` itself (Phase 2 needed), or upstream in token extraction (downstream task, out of scope).
- If test PASSES (expected per architect), the investigation is complete. Document the finding and close the task.
- The upstream bug (if it exists) is a separate follow-up task, not part of FR-6.

---

## Reference

- Architect design: docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md § [Architect] Brownfield Findings § FR-6
- BA spec: docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md § Section 2 § FR-6
- Live failure: docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md § Section 1.2 § FM-VCB-4
- Risk flags: docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md § [Architect] § Risk § RISK-1
