# TASK-301-FR3: Roman numeral OCR misread normalization

**From:** pm (FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT sprint decomposition)  
**To:** dev-pdf-extractor  
**Date:** 2026-06-28  
**Sprint:** FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT  
**Sequence:** 1 of 7 (foundation task)

---

## Requirement (FR-3)

Roman numeral OCR frequently misreads canonical forms (I, II, III, ..., XIII) as mixed-case variants:
- 'Il' → 'II' (lowercase-l misread as uppercase-I)
- 'Ill' → 'III', 'IIl' → 'III' (lowercase-l variants)
- 'lV' → 'IV' (lowercase-l at start)
- 'VlI' → 'VII', 'VIl' → 'VII', 'VIll' → 'VIII', 'VlII' → 'VIII'

**Required behavior:** Before matching `_ROMAN_CODE_RE` in `_try_parse_roman_code_row()`, apply a normalization table that maps OCR misread forms to canonical Roman numerals. The normalized form is stored as the `code` value.

VCB acceptance impact: Fixes FM-VCB-5 (missing Roman section II and III rows). In live VCB 2026Q1, OCR renders 'II'→'Il', 'III'→'Ill'; without normalization, these lines fall through all layouts and are silently dropped.

---

## Design (from [Architect] Brownfield Findings)

### Mechanism: OCR normalization table applied before regex match

Add module-level constant in `infrastructure/text_table_extractor.py`:
```python
_ROMAN_OCR_NORMALIZE: dict[str, str] = {
    "Il": "II",    # lowercase-l misread as uppercase-I
    "Ill": "III",  # two lowercase-l misread
    "IIl": "III",  # one lowercase-l in third position
    "lV": "IV",    # lowercase-l at start
    "VlI": "VII",  # lowercase-l in second position
    "VIl": "VII",  # lowercase-l at end
    "VIll": "VIII",
    "VlII": "VIII",
}
```

In `_try_parse_roman_code_row()`, BEFORE `_ROMAN_CODE_RE.match(stripped)`:
```python
# FR-3: apply OCR normalization to the first whitespace-separated token
parts = stripped.split(None, 1)
if parts:
    first_token = parts[0]
    normalized_token = _ROMAN_OCR_NORMALIZE.get(first_token, first_token)
    if normalized_token != first_token:
        stripped = normalized_token + (" " + parts[1] if len(parts) > 1 else "")
```

The normalized form is used both for the regex match AND as the stored `code` value.

---

## Acceptance Criteria

- [ ] `_ROMAN_OCR_NORMALIZE` dict added at module level with all 8 mappings
- [ ] Normalization applied in `_try_parse_roman_code_row()` to first whitespace token
- [ ] Normalized form used for both regex match and stored code value
- [ ] Test: 'Il Tiền gửi 17.957.497' → code='II'
- [ ] Test: 'Ill X 10.000' → code='III'
- [ ] Test: 'IIl X 10.000' → code='III'
- [ ] Test: 'lV X 10.000' → code='IV'
- [ ] Non-regression: 'I Tiền mặt' (correct form) unchanged → code='I'
- [ ] Non-regression: 'II Thu nhập' (correct form) unchanged → code='II'
- [ ] Non-regression: 'VIII Tài sản' (correct form) unchanged → code='VIII'
- [ ] Period guard remains active after normalization (e.g., 'I.' section header still rejected)
- [ ] 'I' embedded in Vietnamese words does not reach normalization (Layout 6 `^I\s+` anchor guards)
- [ ] Test added in `__tests__/unit/test_b02_tctd_parser.py` with VCB fixtures

---

## Files to modify

- `apps/pdf-extractor/infrastructure/text_table_extractor.py` (add constant + logic ~10 LOC)
- `apps/pdf-extractor/__tests__/unit/test_b02_tctd_parser.py` (add tests ~15 LOC)

---

## Non-regression anchors

- FPT 2025Q4 golden tests (all FPT Layout 6 Roman codes are canonical forms 'I', 'II', 'III')
- All existing `test_text_table_extractor.py` tests must pass

---

## Risk flags (from architect)

- None specific to FR-3. Normalization table is OCR-artifact-driven, not issuer-specific (NFR-4 compliance).

---

## Reference

- Architect design: docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md § [Architect] Brownfield Findings § FR-3
- BA spec: docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md § Section 2 § FR-3
- Live failure: docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md § Section 1.2 § FM-VCB-5
