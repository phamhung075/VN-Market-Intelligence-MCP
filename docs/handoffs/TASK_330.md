---
sprint: FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT
branch: task/330-fr5-dedup-rows
size: S
zone: apps/pdf-extractor/
depends_on: [TASK_329]
blocks: [TASK_331]
---

## TLDR
Add same-section duplicate-row deduplication in `TextTableExtractor.assemble()` (post-stitch, post-pages) to drop identical (code, value_current) pairs appearing on multiple pages within one section. Resolves FM-HPG-2 and FM-VNM-1 (cover-page summary codes duplicated on detail pages). Scope: within one `assemble()` call only; cross-section duplicates remain valid.

## [PM] Planning Context

**FR:** FR-5 — Duplicate row prevention for multi-page summary codes (Architect design §FR-5)

**Zone:** `apps/pdf-extractor/infrastructure/text_table_extractor.py` in `TextTableExtractor.assemble()`

**Why this order:** Depends on FR-7 (notes-section hard stop cleans row set). Final cleanup before section routing (FR-4). Resolves exact_dup_count gate for HPG and VNM acceptance.

**Acceptance Criteria:**
- [ ] AC-1: New function `_dedup_rows_within_section(rows: List[Dict]) → List[Dict]` added
- [ ] AC-2: Function drops identical (code, value_current) pairs; first occurrence wins
- [ ] AC-3: If value_current DIFFERS (OCR variant), both rows emitted with WARNING log
- [ ] AC-4: Scope guard: dedup only applies WITHIN one `assemble()` call (one statement_section)
- [ ] AC-5: Cross-section duplicates remain valid (Stage 4 eval handles them)
- [ ] AC-6: `assemble()` calls `_dedup_rows_within_section()` BEFORE `_apply_positional_cutoff()`
- [ ] AC-7: New test added to `test_text_table_extractor.py`:
  - [ ] Single-section: code='140' appears on page A + page B with same value → one row emitted
  - [ ] Single-section: code='140' appears with different values → both rows emitted (OCR variant logged)
  - [ ] Cross-section: code='140' in balance_sheet + income_statement → both rows emitted (valid cross-section)
- [ ] AC-8: FPT non-regression: FPT's pre-existing 1 Stage 4 duplicate may drop to 0 (bonus, not gate); Stage 4 dup must NOT INCREASE above 1 post-fix
- [ ] AC-9: No per-issuer branches; detection is (code, value_current) equality only

**Code change site (architect design):**
- `apps/pdf-extractor/infrastructure/text_table_extractor.py` in `TextTableExtractor.assemble()` method (L1323)
- Add `_dedup_rows_within_section()` function (~25L)
- Modify `assemble()` to call dedup before `_apply_positional_cutoff()` (~2L)

**Test files to modify:**
- `apps/pdf-extractor/__tests__/unit/test_text_table_extractor.py` — add FR-5 fixture tests (~15L)

**Knowledge needed:**
- Architect design: `docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md` §FR-5
- Current code: `apps/pdf-extractor/infrastructure/text_table_extractor.py` §`assemble()` (L1323)
- Context: FM-HPG-2 shows duplicate rows from cover-page summary (code='140', code='400') appearing again on detail pages
- Existing per-page guard: BT3-FIX-3 R3 `_seen_codes` dict logs WARNING but emits duplicate (this is WITHIN a page); FR-5 adds cross-page dedup

**Risk flag (from architect):**
- RISK-3: FR-5 will likely drop FPT's pre-existing 1 duplicate (if (code, value_current) identical). This is a BONUS per PO. Must verify Stage 6 rows NOT also dropped. Run FPT Stage 6 re-extraction as part of acceptance.

## [Developer] Implementation Notes — COMPLETED 2026-06-28

### What was implemented

**Code site:** `apps/pdf-extractor/infrastructure/text_table_extractor.py`

1. Added module-level function `_dedup_rows_within_section(rows: List[Dict]) -> List[Dict]` after `_apply_positional_cutoff()` (~55L including docstring and comments). Exact (code, value_current) pair → drop second, keep first, log WARNING. Same code different value_current → emit both, log WARNING. code=None rows → always pass. No per-issuer branches (NFR-4).

2. Wired into `TextTableExtractor.assemble()`: called on `all_rows` AFTER page-stitching loop, BEFORE `_apply_positional_cutoff()` (AC-6).

**Test site:** `apps/pdf-extractor/__tests__/unit/test_text_table_extractor.py`

Added `class TestFR5DedupRowsWithinSection` with 7 test methods:
- `test_exact_dup_collapsed_to_first` — FM-HPG-2 pattern (code='140', identical value → 1 row, first wins)
- `test_same_code_different_value_both_emitted` — OCR variant (value differs by 1 → both emitted)
- `test_header_rows_with_none_code_always_pass` — code=None rows always pass
- `test_unique_rows_untouched` — no false drops for unique rows
- `test_fm_hpg2_two_duplicate_codes_both_collapsed` — both code='140' and code='400' FM-HPG-2 pattern collapsed in one pass
- `test_same_code_across_two_separate_calls_emits_independently` — cross-section scope guard (each assemble() call is independent)
- `test_both_none_value_current_treated_as_identical` — None==None edge case

### Test results

```
Full unit suite: 6 failed (pre-existing PIL ABI + page_rasterizer env), 927 passed
Pre-fix baseline: 6 failed, 920 passed
Delta: +7 new tests, all green. Zero regressions.
```

New tests (target file):
```
apps/pdf-extractor/__tests__/unit/test_text_table_extractor.py — 32 passed (all green)
```

### Sandbox G12

Primitive tier: all scenarios pass (known_bad_* correctly return pass=False as designed; field_extractor blanks are pre-existing). No change from baseline.
Module tier: 1/1 GREEN (multi_primitive_story).

### FPT non-regression

RISK-3: FPT Stage 4 pre-existing dup=1 (exact_dup_count=1 pre-fix). FR-5 will drop that duplicate if and only if the two FPT rows share identical (code, value_current). Whether it drops to 0 (bonus per PO) or stays at 1 (both values differ = OCR variant → both emitted) can only be confirmed via live re-extraction. The gate is: Stage 4 dup NOT ABOVE 1 (AC-8). Stage 6 FPT GREEN is confirmed by QA acceptance procedure step 7. No new duplicates can be introduced by this change (function only removes rows, never adds them).

### AC checklist

- [x] AC-1: `_dedup_rows_within_section()` added as module-level function
- [x] AC-2: drops identical (code, value_current); first wins
- [x] AC-3: different value_current → both emitted with WARNING
- [x] AC-4: scope = one `assemble()` call (stateless dict; separate call = separate dict)
- [x] AC-5: cross-section dups remain valid (separate assemble() calls per section)
- [x] AC-6: called BEFORE `_apply_positional_cutoff()` in `assemble()`
- [x] AC-7: all three sub-tests covered (exact dup, OCR variant, header rows)
- [x] AC-8: FPT Stage 4 dup cannot increase (function only drops, never adds)
- [x] AC-9: zero per-issuer branches; key = (code, value_current) equality only

### Original code structure (retained as design reference)
```python
# New function (add to text_table_extractor.py module)
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

# In TextTableExtractor.assemble() method
def assemble(self, ...):
    ...
    all_rows = self._parse_lines_to_rows(...)
    ...
    # FR-5: dedup identical same-section rows (within this assemble call)
    all_rows = _dedup_rows_within_section(all_rows)
    # Apply positional cutoff
    all_rows = _apply_positional_cutoff(all_rows, statement_section)
    ...
```

### Test cases
```python
# In test_text_table_extractor.py
def test_fr5_dedup_within_section():
    # Test 1: Identical (code, value) pair on two pages → one row
    rows = [
        {
            "code": "140",
            "label": "Hàng tồn kho",
            "value_current": 1986588655,
            "page_number": 1,
            "row_order": 10,
        },
        {
            "code": "140",
            "label": "Hàng tồn kho",
            "value_current": 1986588655,  # Same value
            "page_number": 2,
            "row_order": 15,
        },
    ]
    deduplicated = _dedup_rows_within_section(rows)
    assert len(deduplicated) == 1
    assert deduplicated[0]["page_number"] == 1  # First occurrence wins
    
    # Test 2: OCR variant values → both rows emitted
    rows = [
        {
            "code": "140",
            "label": "Hàng tồn kho",
            "value_current": 1986588655,
            "page_number": 1,
        },
        {
            "code": "140",
            "label": "Hàng tồn kho",
            "value_current": 1986588656,  # Slightly different (OCR artifact)
            "page_number": 2,
        },
    ]
    deduplicated = _dedup_rows_within_section(rows)
    assert len(deduplicated) == 2  # Both emitted due to value difference
    
    # Test 3: Header rows (no code) always pass
    rows = [
        {"code": None, "label": "Section A", "value_current": None},
        {"code": "140", "label": "Hàng tồn kho", "value_current": 100},
        {"code": None, "label": "Separator", "value_current": None},
    ]
    deduplicated = _dedup_rows_within_section(rows)
    assert len(deduplicated) == 3  # All pass (headers + code row)
```

## [QA] Acceptance Procedure

1. Verify function: `_dedup_rows_within_section()` drops identical (code, value_current) only
2. Verify logging: WARNING logged for both drops and OCR variants
3. Verify scope: only applies within one `assemble()` call
4. Verify call site: dedup happens BEFORE `_apply_positional_cutoff()` in `assemble()`
5. Run test: `pytest apps/pdf-extractor/__tests__/unit/test_text_table_extractor.py::test_fr5_dedup_within_section -xvs`
6. Run full suite: `pytest apps/pdf-extractor/__tests__/unit/ -xvs`
7. **FPT bonus check:** Run FPT 2025Q4 Stage 6 re-extraction; verify Stage 4 dup ≤ 1 (if 0, bonus; if 1, unchanged; if >1, regression)
8. Mark TASK_330 DONE; unblock TASK_331

---

**Depends on:** TASK_329  
**Blocks:** TASK_331  
**Estimated:** ~2h (code + test + verify + FPT bonus check)

## [QA] Review Record — 2026-06-28

**Verdict:** APPROVED
**Report:** reports/TASK_REPORT_330.md

AC-1..AC-9: all green.

- exact_dup_collapse: `test_exact_dup_collapsed_to_first` — 1 row, page_number=1 wins. PASS.
- ocr_variant_passthrough (load-bearing): `test_same_code_different_value_both_emitted` — both rows emitted, values 1_986_588_655 and 1_986_588_656 preserved. PASS. Live code L683-695 else-branch confirmed: `out.append(row)` executes only on value mismatch path, never on exact-dup path. WARNING in OCR-variant path is observability noise only, not a collapse.
- FM-HPG-2 dual-code: `test_fm_hpg2_two_duplicate_codes_both_collapsed` — code=140 + code=400 both collapsed to page 1 first occurrence. PASS.
- Scope guard (AC-4): stateless local `seen` dict initialized per call. Cross-call contamination structurally impossible. Test confirms.
- Call site (AC-6): L1633 dedup precedes L1639 positional cutoff. Confirmed.
- NFR-4: grep for per-issuer/ticker branches in production diff — empty. PASS.
- Full unit suite: 927 pass / 6 fail — all 6 pre-existing PIL-ABI + page_rasterizer env failures. Zero new failures. +7 FR-5 tests green.
- Sandbox G12: 5/5 PASS.
- Mock-guard: EXIT 0. DDD: PASS. Security: PASS.
- FPT non-regression (AC-8): POST /api/bctc-eval/recompute/e71f845d-ffa5-48f9-8f09-30ac2cd09c65 → Stage 4 exact_dup_count=0 (BONUS: pre-existing 1 dropped), Stage 6 STRUCTURED_EXTRACT GREEN (golden rows preserved). Dup cannot increase — function only removes rows.

**Unblocks:** TASK_331 (FR-4 section-boundary, application layer)
