---
sprint: FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT
branch: task/326-fr3-roman-ocr-normalize
size: S
zone: apps/pdf-extractor/
depends_on: []
blocks: [TASK_327, TASK_328, TASK_329, TASK_330]
---

## TLDR
Add OCR normalization dict to handle misread Roman numerals (Il→II, Ill→III, etc.) in BCTC code detection. Foundational for Layout 6 (Roman code parsing). Single-point change in `_try_parse_roman_code_row()` before regex match.

## [PM] Planning Context

**FR:** FR-3 — Roman numeral OCR misread normalization (Architect design §FR-3)

**Zone:** `apps/pdf-extractor/infrastructure/text_table_extractor.py`

**Why this order:** Roman normalization unblocks all downstream text_table_extractor changes (FR-1, FR-2, FR-7, FR-5 all depend on stable Layout 6 foundation). Architect recommends FR-3 first in the sequence.

**Acceptance Criteria:**
- [ ] AC-1: Module-level constant `_ROMAN_OCR_NORMALIZE` dict added with 8 exact pairs (Il→II, Ill→III, IIl→III, lV→IV, VlI→VII, VIl→VII, VIll→VIII, VlII→VIII)
- [ ] AC-2: `_try_parse_roman_code_row()` applies normalization to first whitespace token BEFORE `_ROMAN_CODE_RE.match()`
- [ ] AC-3: Normalized form used as stored `code` value (not original misread form)
- [ ] AC-4: Non-regression: existing FPT golden tests stay GREEN (test_text_table_extractor.py)
- [ ] AC-5: Period guard and VN number guard remain active after normalization
- [ ] AC-6: New tests added to `test_b02_tctd_parser.py`:
  - [ ] "Il Tiền gửi 17.957.497" → code="II" (normalized from Il)
  - [ ] "Ill X 10.000" → code="III" (normalized from Ill)
  - [ ] "IIl X 10.000" → code="III" (normalized from IIl)
  - [ ] "lV X 10.000" → code="IV" (normalized from lV)
- [ ] AC-7: No per-issuer branches introduced; detection is OCR-artifact table only (NFR-4)

**Code change site (architect design):**
- `apps/pdf-extractor/infrastructure/text_table_extractor.py` Line 170 (`_ROMAN_CODE_RE`) + Line 281 (`_try_parse_roman_code_row()`)
- Add `_ROMAN_OCR_NORMALIZE` dict (module-level constant, ~10L)
- Modify `_try_parse_roman_code_row()` to apply normalization before regex match (~8L)

**Test files to modify:**
- `apps/pdf-extractor/__tests__/unit/test_b02_tctd_parser.py` — add FR-3 fixture tests (~12L)
- `apps/pdf-extractor/__tests__/unit/test_text_table_extractor.py` — verify non-regression on FPT Roman codes

**Knowledge needed:**
- Architect design: `docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md` §[Architect] FR-3
- Current code: `apps/pdf-extractor/infrastructure/text_table_extractor.py` L170, L281
- Non-regression anchor: existing B02-TCTC test fixture (if any; else create minimal VCB-like fixture with Roman codes)

**Risk flag (from architect):**
- RISK-2: FR-1 depends on FR-3; if FR-3 changes Layout 6 behavior unexpectedly, FR-1 might regress. Verify all Layout 6 tests stay GREEN.

## [Developer] Implementation Record (2026-06-28)

### Status: REVIEW — commit cdc8b93f

### Files changed
- `apps/pdf-extractor/infrastructure/text_table_extractor.py` — added `_ROMAN_OCR_NORMALIZE` dict (8 pairs, module-level constant after `_ROMAN_CODE_RE` at L170); modified `_try_parse_roman_code_row()` to apply normalization before `_ROMAN_CODE_RE.match()` (EXACT-KEY match on first whitespace token only)
- `apps/pdf-extractor/__tests__/unit/test_b02_tctd_parser.py` — added import of `_try_parse_roman_code_row`; added class `TestRomanOcrNormalization` with 15 tests (8 normalization pairs, 5 canonical pass-through, period-guard, non-roman token, end-to-end VCB page5 assemble)

### AC checklist
- [x] AC-1: `_ROMAN_OCR_NORMALIZE` dict added with all 8 exact pairs
- [x] AC-2: normalization applied to first whitespace token BEFORE `_ROMAN_CODE_RE.match()`
- [x] AC-3: normalized form used as stored `code` value (not original misread)
- [x] AC-4: FPT golden tests GREEN — 887 pass, 0 new failures (6 pre-existing page_rasterizer/PIL ordering-flaky tests unchanged)
- [x] AC-5: period guard (`rest.startswith(".")`) and VN number guard remain active after normalization — confirmed by `test_period_guard_still_active_after_normalization`
- [x] AC-6: all 4 required normalized tests pass plus 4 additional architect-specified pairs
  - [x] "Il Tiền gửi 17.957.497" → code="II"
  - [x] "Ill X 10.000" → code="III"
  - [x] "IIl X 10.000" → code="III"
  - [x] "lV X 10.000" → code="IV"
- [x] AC-7: zero per-issuer branches — EXACT-KEY dict lookup only

### Test results
- `pytest __tests__/unit/test_b02_tctd_parser.py __tests__/unit/test_text_table_extractor.py` — **58/58 PASS**
- Full suite `pytest __tests__/unit/ -p no:randomly` — **887 pass, 6 pre-existing fail** (all 6 are PIL/page_rasterizer, same count as baseline before changes)
- Sandbox primitive tier: 27 pass / 8 intentional-fail (identical to baseline)
- Sandbox module tier: 1 pass / 0 fail

### NFR-4 attestation
ZERO per-issuer/per-ticker branches. The `_ROMAN_OCR_NORMALIZE` dict is keyed on OCR character misread patterns (structural/optical), not on issuer identity. No `if issuer == 'VCB'` or `if ticker == ...` anywhere. Normalization is issuer-invariant.

### FPT non-regression
- Stage 6 GREEN: FPT fixtures all pass
- Stage 4 dup count: pre-fix=1 (pre-existing); my change is a no-op for FPT since FPT's Roman codes ('I', 'II', etc.) are already canonical — none are in `_ROMAN_OCR_NORMALIZE` keys, so pass-through unchanged

---

## [Developer] Implementation Notes (original PM spec)

### Code structure
```python
# Module-level constant (after imports, before functions)
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

# In _try_parse_roman_code_row() function
def _try_parse_roman_code_row(...):
    ...
    stripped = line.strip()
    
    # FR-3: apply OCR normalization to the first whitespace-separated token
    parts = stripped.split(None, 1)
    if parts:
        first_token = parts[0]
        normalized_token = _ROMAN_OCR_NORMALIZE.get(first_token, first_token)
        if normalized_token != first_token:
            stripped = normalized_token + (" " + parts[1] if len(parts) > 1 else "")
    
    # Now proceed with the existing regex match
    m = _ROMAN_CODE_RE.match(stripped)
    ...
```

### Test fixture (minimal VCB-like, Roman codes)
```python
# In test_b02_tctd_parser.py
def test_fr3_roman_ocr_normalize():
    # Test case: OCR renders II as Il
    lines = ["Il Tiền gửi và vay các tô chức tín dụng khác 17.957.497"]
    row = _try_parse_roman_code_row(lines[0], page_num=1)
    assert row is not None
    assert row["code"] == "II"  # Normalized, not "Il"
    
    # Test case: OCR renders III as Ill
    lines = ["Ill Hàng tồn kho 10.000"]
    row = _try_parse_roman_code_row(lines[0], page_num=1)
    assert row is not None
    assert row["code"] == "III"
    
    # Test case: OCR renders IV as lV
    lines = ["lV Tài sản cố định 100.000.000"]
    row = _try_parse_roman_code_row(lines[0], page_num=1)
    assert row is not None
    assert row["code"] == "IV"
```

### Backward-safety verification
- Run existing FPT tests: `pytest apps/pdf-extractor/__tests__/unit/test_text_table_extractor.py -xvs`
- Confirm all Layout 6 calls on FPT pages still return correct code values (should all be exact Roman forms: "I", "II", "III", etc. — none in the OCR misread table, so no-op pass-through)

## [QA] Acceptance Procedure

1. Verify code change site matches architect design (Line 170 + Line 281 in text_table_extractor.py)
2. Check AC-1 through AC-7 all marked complete
3. Run full suite: `pytest apps/pdf-extractor/__tests__/unit/ -xvs`
4. Verify no new failures in test_text_table_extractor.py (FPT non-regression)
5. Verify new tests in test_b02_tctd_parser.py all PASS
6. Mark TASK_326 DONE; unblock TASK_327

---

**Depends on:** None (first in sequence)  
**Blocks:** TASK_327, TASK_328, TASK_329, TASK_330 (all downstream text_table_extractor changes)  
**Estimated:** ~2h (code + test + verify)
