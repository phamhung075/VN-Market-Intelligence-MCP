# TASK-302-FR1: Layout-adaptive column-boundary detection (code-range gate)

**From:** pm (FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT sprint decomposition)  
**To:** dev-pdf-extractor  
**Date:** 2026-06-28  
**Sprint:** FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT  
**Sequence:** 2 of 7  
**Depends:** TASK-301-FR3-ROMAN-NORM (foundation)

---

## Requirement (FR-1)

Layout 3 (`_CODE_VALUE_COL_RE`) matches 2-digit codes (`\d{2,3}`), which causes note-reference numbers (1-2 digits) to be captured as BCTC codes when they appear in code-only-column OCR blocks.

BCTC structural codes in code-only-column format are always 3-digit (100-999). 2-digit codes (income-statement sub-items like 10, 50, 60) never appear in code-only-column layouts; they appear in inline layouts (L1/L2/L4) where they have label context.

**Required behavior:** Change `_CODE_VALUE_COL_RE` pattern from `\d{2,3}` to `\d{3}` (exactly 3 digits). This eliminates the false-positive where note-ref "10" in "Il 10 198.629.540" is captured as code.

VCB acceptance impact: Fixes FM-VCB-1 (Thuyết minh note-ref 10 no longer mis-parsed as a BCTC code).

---

## Design (from [Architect] Brownfield Findings)

### Mechanism: regex narrowing in `_CODE_VALUE_COL_RE`

In `apps/pdf-extractor/infrastructure/text_table_extractor.py`, locate the `_CODE_VALUE_COL_RE` pattern (around L554):

**BEFORE:**
```python
_CODE_VALUE_COL_RE = re.compile(
    r"^\s*(\d{2,3})\s+(?:[-—\w\s]*?)(\d[\d.,]+(?:\.\d+)?|\(\d[\d.,]+\))\s*$"
)
```

**AFTER:**
```python
_CODE_VALUE_COL_RE = re.compile(
    r"^\s*(\d{3})\s+(?:[-—\w\s]*?)(\d[\d.,]+(?:\.\d+)?|\(\d[\d.,]+\))\s*$"
)
```

That's the only code change: `\d{2,3}` → `\d{3}` (one character).

---

## Acceptance Criteria

- [ ] `_CODE_VALUE_COL_RE` pattern changed from `(\d{2,3})` to `(\d{3})`
- [ ] Change is a single-character regex modification (2,3} → 3})
- [ ] Test: Layout 3 rejects '10 198.629.540' (does NOT capture code='10')
- [ ] Test: Layout 3 still accepts '270 88.089.621.779.862' (captures code='270')
- [ ] Test: Layout 3 still accepts '221 — 11 15.385.816.846.287' (captures code='221')
- [ ] FPT golden test suite passes (all FPT Layout 3 codes 270, 221, 300 are 3-digit)
- [ ] No regression on income/cash-flow sections (2-digit codes handled by Layout 1/2/4)
- [ ] Test added in `__tests__/unit/test_text_table_extractor.py`

---

## Files to modify

- `apps/pdf-extractor/infrastructure/text_table_extractor.py` (1-line regex change)
- `apps/pdf-extractor/__tests__/unit/test_text_table_extractor.py` (add tests ~10 LOC)

---

## Non-regression anchors

- FPT 2025Q4 Layout 3 golden tests (code=270, code=300, code=221)
- All existing `test_text_table_extractor.py` tests must pass
- Income-statement/cash-flow fixtures (verify 2-digit codes still parse via Layout 1/2/4)

---

## Risk flags (from architect)

**RISK-2 (MEDIUM):** Changing `_CODE_VALUE_COL_RE` to `\d{3}` only means 2-digit income-statement codes (50, 60, 70) can no longer match Layout 3. For income/cash-flow sections, Layout 3 was never the right match anyway (inline format handles 2-digit codes via Layout 1/2/4). Verify no test fails for income/cash-flow fixtures. If any test regresses on 2-digit codes in Layout 3 position, investigate — it signals a test fixture that accidentally depended on the FPT-overfit behavior.

**Mitigation:** Run ALL existing tests after FR-1 change. If any test regresses on 2-digit codes in Layout 3 position, investigate.

---

## Reference

- Architect design: docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md § [Architect] Brownfield Findings § FR-1
- BA spec: docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md § Section 2 § FR-1
- Live failure: docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md § Section 1.2 § FM-VCB-1
