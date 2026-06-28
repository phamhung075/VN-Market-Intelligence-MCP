# TASK-303-FR2: Trailing note-reference number stripping from label

**From:** pm (FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT sprint decomposition)  
**To:** dev-pdf-extractor  
**Date:** 2026-06-28  
**Sprint:** FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT  
**Sequence:** 3 of 7  
**Depends:** TASK-302-FR1-CODE-RANGE

---

## Requirement (FR-2)

After parsing `(code, label, values_rest)` from any layout, if `label` ends with a trailing 1-3 digit integer preceded by whitespace (e.g., "Chứng khoán kinh doanh 4"), that trailing integer must be stripped to produce clean label "Chứng khoán kinh doanh".

Guard: only strip if the remaining label after stripping is ≥5 characters (prevent stripping valid label-ending digits, e.g., "Quỹ phát triển khoa học 2025" stays intact).

VCB acceptance impact: Fixes FM-VCB-2 (trailing note-ref numbers in label are stripped; labels are clean).

---

## Design (from [Architect] Brownfield Findings)

### Mechanism: regex post-strip in `_parse_lines_to_rows`

In `apps/pdf-extractor/infrastructure/text_table_extractor.py`, locate the `_parse_lines_to_rows()` function (around L1109). After the line:

```python
parsed = _try_parse_code_row(stripped)
```

(which returns `(code, label, values_rest)` tuple), add:

```python
# FR-2: strip trailing Thuyết-minh note-ref from label
_label_clean = re.sub(r'\s+\d{1,3}$', '', label)
if len(_label_clean) >= 5:
    label = _label_clean
# else: leave label unchanged (trailing digit is part of the label content)
```

This strips whitespace + 1-3 trailing digits from the label if the result is ≥5 characters long.

---

## Acceptance Criteria

- [ ] Label-clean regex added after `_try_parse_code_row()` call in `_parse_lines_to_rows()`
- [ ] Pattern: `re.sub(r'\s+\d{1,3}$', '', label)`
- [ ] Length guard: only apply strip if `len(_label_clean) >= 5`
- [ ] Test: 'Chứng khoán kinh doanh 4' → 'Chứng khoán kinh doanh'
- [ ] Test: 'Chứng khoán kinh doanh 10' → 'Chứng khoán kinh doanh'
- [ ] Test: 'Cho vay khách hàng 5' → 'Cho vay khách hàng'
- [ ] Test: 'Quỹ phát triển khoa học 2025' → unchanged (2025 is 4 digits, no match)
- [ ] Test: 'Tiền 2' → unchanged (result would be 5 chars; '2' is 1 digit, so strip to 'Tiền ' = 5 chars, should this happen? Check regex...)
- [ ] Non-regression: labels without trailing digits unchanged
- [ ] Non-regression: labels with 4+ digit trailing numbers unchanged (e.g., year 2025)
- [ ] Test added in `__tests__/unit/test_b02_tctd_parser.py` with VCB fixtures

---

## Files to modify

- `apps/pdf-extractor/infrastructure/text_table_extractor.py` (add post-parse label-clean ~6 LOC)
- `apps/pdf-extractor/__tests__/unit/test_b02_tctd_parser.py` (add tests ~12 LOC)

---

## Non-regression anchors

- FPT 2025Q4 golden tests (no labels end with `\s+\d{1,3}` pattern)
- All existing `test_text_table_extractor.py` tests must pass
- VCB non-specific labels (e.g., numbers, years in labels) must be preserved

---

## Implementation notes

- This is a pure post-processing step on the label string, independent of layout/parsing logic
- Safe to apply to ALL parsed rows, regardless of layout
- DDD layer: infrastructure (pure string processing)

---

## Reference

- Architect design: docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md § [Architect] Brownfield Findings § FR-2
- BA spec: docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md § Section 2 § FR-2
- Live failure: docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md § Section 1.2 § FM-VCB-2
