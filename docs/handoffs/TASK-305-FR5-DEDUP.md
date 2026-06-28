# TASK-305-FR5: Duplicate row prevention for multi-page summary codes

**From:** pm (FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT sprint decomposition)  
**To:** dev-pdf-extractor  
**Date:** 2026-06-28  
**Sprint:** FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT  
**Sequence:** 5 of 7  
**Depends:** TASK-304-FR7-NOTES-STOP

---

## Requirement (FR-5)

The `_seen_codes` dict in `_parse_lines_to_rows()` logs a WARNING for duplicate codes but emits the row anyway (BT3-FIX-3 R3 "never silently drop"). This results in same-section (code, value_current) duplicates at Stage 4 eval.

Summary codes (e.g., Hàng tồn kho, Vốn chủ sở hữu) appear on multiple pages (cover-page summary + detail page). The current per-page `_seen_codes` dict only detects same-page duplicates, not cross-page duplicates.

**Required behavior:** Move dedup to `assemble()` level (post-stitch, after all pages stitched). When `(code, value_current)` pair is identical to first occurrence, mark as duplicate and do NOT emit. If values differ (OCR variant), emit both. Guard: dedup only applies WITHIN a single `assemble()` call (one statement_section). Cross-section duplicates remain valid.

VCB acceptance impact: Fixes HPG FM-HPG-2 (codes 140, 400 appearing on multiple pages) and VNM FM-VNM-1 (same-section duplicates).

---

## Design (from [Architect] Brownfield Findings)

### Mechanism: post-stitch dedup in `assemble()`

In `apps/pdf-extractor/infrastructure/text_table_extractor.py`, add a new helper function:

```python
def _dedup_rows_within_section(rows: List[Dict]) -> List[Dict]:
    """
    Drop identical same-section duplicate rows (first occurrence wins).

    Guard: only drops when (code, value_current) pair is IDENTICAL to first occurrence.
    If value_current DIFFERS (OCR variant), both rows are emitted (log WARNING).
    Scope: ONE assemble() call = one statement_section.
    Cross-section duplicates remain valid (handled by Stage 4 eval).
    """
    seen: dict[str, Optional[float]] = {}  # code → first value_current
    out: List[Dict] = []
    for row in rows:
        code = row.get("code")
        if code is None:
            out.append(row)  # header/separator rows always pass
            continue
        vc = row.get("value_current")
        if code not in seen:
            seen[code] = vc
            out.append(row)
        else:
            first_vc = seen[code]
            if first_vc == vc:
                logger.warning(
                    "_dedup_rows_within_section: dropping identical dup "
                    "code=%r value_current=%r (page=%r row_order=%r)",
                    code, vc, row.get("page_number"), row.get("row_order"),
                )
                # is_duplicate=True: do NOT append
            else:
                logger.warning(
                    "_dedup_rows_within_section: code=%r OCR variant values "
                    "%r vs %r — emitting both",
                    code, first_vc, vc,
                )
                out.append(row)  # emit OCR variant
    return out
```

In `assemble()`, insert the dedup call BEFORE `_apply_positional_cutoff`:

```python
all_rows = _dedup_rows_within_section(all_rows)
all_rows = _apply_positional_cutoff(all_rows, statement_section)
```

---

## Acceptance Criteria

- [ ] `_dedup_rows_within_section(rows)` function added
- [ ] Dedup logic: same (code, value_current) pair → drop, log WARNING
- [ ] OCR variant logic: different values → emit both, log WARNING
- [ ] Function called in `assemble()` before `_apply_positional_cutoff`
- [ ] Test: code 140 with value 1,986,588,655 on page A and B → one row in output
- [ ] Test: code 400 with value 94,430,926,468,210 on page A and B → one row in output
- [ ] Test: same code with different values (OCR variant) → both rows emitted
- [ ] Header/separator rows (code=None) always pass through
- [ ] Cross-section duplicates remain valid (e.g., same code in balance_sheet + income_statement)
- [ ] Per-page `_seen_codes` dict (BT3-FIX-3 R3) kept as-is (defensive warning)
- [ ] Test added in `__tests__/unit/test_text_table_extractor.py` with HPG/VNM fixtures

---

## Files to modify

- `apps/pdf-extractor/infrastructure/text_table_extractor.py` (add function ~25 LOC + 1 call in assemble)
- `apps/pdf-extractor/__tests__/unit/test_text_table_extractor.py` (add tests ~15 LOC)

---

## Non-regression anchors

- FPT 2025Q4 golden tests (FPT has 1 pre-existing Stage 4 duplicate; FR-5 may drop it if identical, bonus per PO)
- All existing `test_text_table_extractor.py` tests must pass
- HPG/VNM exact_dup_count must drop to 0

---

## FPT special case

FPT 2025Q4 pre-existing Stage 4 duplicate: if the two FPT rows have identical (code, value_current), FR-5 will drop the duplicate → dup count drops to 0 (bonus, per PO resolution B2). If different values, both emit → dup count unchanged. Either outcome stays within the gate: FPT Stage 4 dup must NOT INCREASE above pre-fix value (1).

---

## Reference

- Architect design: docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md § [Architect] Brownfield Findings § FR-5
- BA spec: docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md § Section 2 § FR-5
- Live failure: docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md § Section 1.3 § FM-HPG-2, § 1.4 § FM-VNM-1
- PO resolution: docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md § PO RESOLUTION § B2
