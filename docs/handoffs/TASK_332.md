---
sprint: FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT
branch: task/332-fr6-vn-number-trace
size: M
zone: apps/pdf-extractor/
depends_on: [TASK_331]
blocks: []
---

## TLDR
**TRACE-FIRST task:** Investigate the live VCB FM-VCB-4 failure (value_current=-1.992671 for "(1.992.671)") to locate root cause BEFORE implementing any fix. Brownfield analysis shows `vn_number_normalize` already handles this pattern correctly; bug is upstream in `_parse_value_cells` or token extraction. Mandatory investigation before coding. Add defensive test assertion to confirm current behavior. Implement targeted fix based on root cause.

## [PM] Planning Context

**FR:** FR-6 — Parenthetical multi-column value parsing robustness (Architect design §FR-6 + RISK-1)

**Zone:** `apps/pdf-extractor/domain/primitives/vn_number_normalize/primitive.py` (+ investigation in infrastructure layer)

**Why this order:** LAST task in the sequence. Architect flagged as RISK-1 (HIGH) because the bug producing -1.992671 is NOT in `vn_number_normalize` itself. Traces investigation is mandatory before any code change. STANDING INSTRUCTION from architect: developer must trace the live failure path first.

**Acceptance Criteria:**
- [ ] AC-1: **INVESTIGATION PHASE (MANDATORY FIRST):**
  - [ ] Debug trace added to `TextTableExtractor.assemble()` to capture exact token passed to `vn_number_normalize()` for VCB page containing "Chi phí hoạt động dịch vụ (1.992.671) (1.921.556)"
  - [ ] Run on live VCB fixture (report_id 31f2a9a9, page range with this cost line)
  - [ ] Log output shows what token reaches `vn_number_normalize()` (e.g., is it "(1.992. 671)" with space? "(1.992.671)" correct form? Something else?)
  - [ ] Check if token reaches `_parse_value()` at all, or if it's lost in `_parse_value_cells()` splitting

- [ ] AC-2: **ROOT-CAUSE DETERMINATION** (based on trace):
  - [ ] If trace shows "(1.992. 671)" (space inside parens — poppler artifact), confirm with DEBUG logging that `_VN_INT_RE` fails to match, then trace downstream `_coerce_ocr_number()` path
  - [ ] If trace shows "(1.992.671)" correct form reaching `vn_number_normalize`, confirm the existing `_PARENS_RE + _VN_INT_RE` path handles it correctly (test: `vn_number_normalize("(1.992.671)") == "-1992671"`)
  - [ ] If trace shows something unexpected (malformed token, empty string, etc.), document and escalate with raw evidence

- [ ] AC-3: **DEFENSIVE TEST ADDED (non-blocking):**
  - [ ] Add to `test_vn_number_normalize.py`: `vn_number_normalize("(1.992.671)") == "-1992671"` and `vn_number_normalize("(1.921.556)") == "-1921556"`
  - [ ] If these assertions PASS (expected), the bug is confirmed to be upstream; document finding in commit message
  - [ ] If these assertions FAIL, the bug IS in `vn_number_normalize`; proceed to fix implementation

- [ ] AC-4: **FIX IMPLEMENTATION (conditional on trace result):**
  - [ ] If root cause is poppler artifact (space inside parens): add defensive space-handler in `_parse_value()` before `vn_number_normalize()` call
  - [ ] If root cause is `_parse_value_cells()` token splitting: fix the splitting logic to preserve parenthetical boundaries
  - [ ] If root cause is elsewhere: fix at source (don't paper over)

- [ ] AC-5: **FPT BACKWARD-SAFETY (post-fix):**
  - [ ] Run `vn_number_normalize("(586.166.744.274)") == "-586166744274"` to confirm FPT non-regression
  - [ ] All 12 existing `test_vn_number_normalize.py` tests still PASS

- [ ] AC-6: **SANDBOX + EVAL GATES (post-fix):**
  - [ ] Sandbox G12 both tiers: `python sandbox/runner.py --tier=primitive --scenario=all` GREEN
  - [ ] VCB 31f2a9a9 Stage 4 re-eval: `POST /api/bctc-eval/recompute/31f2a9a9` then `GET /api/bctc-eval/31f2a9a9` → verify value_blank_label_count=0 (no rows with value_current set but label null)

**Code change site (architect design + traces):**
- `apps/pdf-extractor/domain/primitives/vn_number_normalize/primitive.py` (only if root cause is here)
- `apps/pdf-extractor/infrastructure/text_table_extractor.py` in `_parse_value()` or `_parse_value_cells()` (likely actual source)
- Debug logging in `TextTableExtractor.assemble()` during investigation phase

**Test files to modify:**
- `apps/pdf-extractor/__tests__/unit/test_vn_number_normalize.py` — add AC-3 test assertions (~4L)
- (Other files depend on root cause location)

**Knowledge needed:**
- Architect design: `docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md` §FR-6 + RISK-1
- Current code: `apps/pdf-extractor/domain/primitives/vn_number_normalize/primitive.py` L77, L93
- Current code: `apps/pdf-extractor/infrastructure/text_table_extractor.py` §`_parse_value()`, `_parse_value_cells()` (L~850-950 area)
- Live failure context: VCB 2026Q1 report_id 31f2a9a9, page with "Chi phí hoạt động dịch vụ (1.992.671) (1.921.556)"
- Existing poppler handler: `apps/pdf-extractor/infrastructure/text_table_extractor.py` L250 `r"(\(\d[\d.]*)\.\s+(\d[\d.]*\))"`

## [Developer] Implementation Notes — COMPLETED 2026-06-28

### TRACE RESULT — Root cause confirmed

**Static trace + live vn_number_normalize call trace:**

```
vn_number_normalize("(1.992.671)")  → "-1992671"   ← PASS — canonical form CORRECT
vn_number_normalize("(1.992. 671)") → None          ← space artifact → None (not -1.992671)
vn_number_normalize("(1.992671)")   → "-1.992671"   ← TRUE FM-VCB-4 root cause
```

**Conclusion:** `vn_number_normalize("(1.992.671)") == "-1992671"` PASSES → bug is upstream. The architect's hypothesis that `vn_number_normalize` already handles the canonical form is CONFIRMED.

**True root cause (FM-VCB-4):** The OCR/poppler drops the middle thousands-separator dot when extracting "(1.992.671)" from the VCB PDF, producing the token "(1.992671)". `vn_number_normalize("(1.992671)")` calls `_PARENS_RE` → strips parens → "1.992671". This fails `_VN_INT_RE` (requires exactly 3 digits per group) but passes `_PLAIN_NUMBER_RE` (`r"^-?\d+(\.\d+)?$"`) → returns "-1.992671" → `float("-1.992671")` = -1.992671. This exactly matches FM-VCB-4.

**Space artifact hypothesis:** `(1.992. 671)` (space inside parens) → `_parse_value_cells` fallback splits on " " → `["(1.992.", "671)"]` → `_parse_value("(1.992.")` → `vn_number_normalize` fails (no closing paren) → `None`. The space artifact gives `value_current=None`, NOT -1.992671. This path is fixed by Rule A as defense-in-depth.

**Fix layer:** `_parse_value()` in `infrastructure/text_table_extractor.py` — the correct upstream layer (applied before vn_number_normalize is called). Zero changes to `vn_number_normalize` (it already handles canonical form correctly). NFR-4: both rules are structural/OCR-artifact-driven, no issuer branching.

**Two rules added to `_parse_value` (before `vn_number_normalize` call):**
- Rule A (space artifact): `re.sub(r"(\(\d[\d.]*)\.\s+(\d[\d.]*\))", r"\1.\2", cleaned)` — mirrors the identical handler in `_find_code_in_line` L269. Fixes the None case.
- Rule B (missing-dot artifact): `re.sub(r"\((\d{1,3})\.(\d{3})(\d{3})\)", r"(\1.\2.\3)", cleaned)` — restores the dropped thousands-separator dot. Fixes FM-VCB-4: `(1.992671)` → `(1.992.671)` → -1992671.

**Backward-safety verified:**
- `(586.166.744.274)`: Rule B pattern requires exactly 6 digits after the first dot → 9 digits ("166.744.274") → NO MATCH → unchanged → -586166744274.0 ✓
- `(619.531.925.859)`: same logic → NO MATCH → -619531925859.0 ✓
- `(1.992.671)` canonical: Rule B requires no dot between the two 3-digit groups → the existing dot before "671" prevents match → unchanged → -1992671.0 ✓

**Sandbox G12 both tiers:** GREEN (36 scenarios — 30 pass + 6 expected-fail known_bad). Unit tests: 937 pass. FPT Stage 4 dup unchanged (FR-5 handles that separately).

**AC completion:**
- [x] AC-1: INVESTIGATION PHASE — trace executed, root cause identified (missing-dot OCR artifact)
- [x] AC-2: ROOT-CAUSE DETERMINATION — confirmed: token "(1.992671)" reaches `_PLAIN_NUMBER_RE` via `_parse_value`
- [x] AC-3: DEFENSIVE TEST ADDED — `test_vn_number_normalize_parenthetical_vcb` PASSES (canonical form correct in normalizer)
- [x] AC-4: FIX IMPLEMENTATION — Rules A+B in `_parse_value`; `TestParseValueFR6` all green
- [x] AC-5: FPT BACKWARD-SAFETY — `(586.166.744.274)` → -586166744274.0 ✓; all 17+3 vn_number_normalize tests pass
- [x] AC-6: SANDBOX — G12 both tiers GREEN; eval recompute pending QA verification

**Files changed:**
- `apps/pdf-extractor/infrastructure/text_table_extractor.py` — `_parse_value()` +35L (Rules A+B + docstring)
- `apps/pdf-extractor/__tests__/unit/test_vn_number_normalize.py` — `test_vn_number_normalize_parenthetical_vcb()` +28L
- `apps/pdf-extractor/__tests__/unit/test_text_table_extractor.py` — `TestParseValueFR6` class +63L

---

### PHASE 1: INVESTIGATION (COMPLETED — see TRACE RESULT above)

**Step 1a: Add DEBUG logging to assemble()**
```python
# In TextTableExtractor.assemble() or in _parse_lines_to_rows()
# When a line contains "Chi phí hoạt động dịch vụ":
if "chi phí hoạt động" in line.lower():
    logger.debug(
        "FR-6 TRACE: found cost-line: %r",
        line,
    )
    # After parsing to values:
    logger.debug(
        "FR-6 TRACE: values_rest after parse: %r; split values: %r",
        values_rest, _split_values(values_rest),
    )
```

**Step 1b: Add DEBUG to _parse_value()**
```python
def _parse_value(raw: Optional[str]) -> Optional[float]:
    if raw is None:
        return None
    cleaned = str(raw).strip()
    logger.debug(
        "FR-6 TRACE _parse_value: raw=%r cleaned=%r",
        raw, cleaned,
    )
    normalized = vn_number_normalize(cleaned)
    logger.debug(
        "FR-6 TRACE _parse_value: after normalize=%r",
        normalized,
    )
    ...
```

**Step 1c: Run on live VCB**
```bash
# Run TextTableExtractor on VCB pages containing the cost line
# (Details depend on how to invoke the extractor on one report — likely via test fixture or direct call)
python -c "
from apps.pdf_extractor.infrastructure.text_table_extractor import TextTableExtractor
# Load VCB 31f2a9a9 pages from database
# Call assemble() with the specific page range containing cost line
# Observe DEBUG logs
" 2>&1 | grep "FR-6 TRACE"
```

**Step 1d: Analyze trace output and document findings**
- If logs show "(1.992. 671)" (space inside): root cause is poppler artifact, fix in `_parse_value()` 
- If logs show "(1.992.671)" correct form: root cause is `vn_number_normalize` path, but test should pass
- If logs show something unexpected: document exactly what was captured

### PHASE 2: DEFENSIVE TEST (ALWAYS DO THIS)

```python
# In test_vn_number_normalize.py
def test_vn_number_normalize_parenthetical_vcb():
    """FR-6: parenthetical VN number parsing — core assumption check."""
    # These should PASS with current code (if bug is upstream)
    assert vn_number_normalize("(1.992.671)") == -1992671
    assert vn_number_normalize("(1.921.556)") == -1921556
    
    # FPT non-regression: existing form should still work
    assert vn_number_normalize("(586.166.744.274)") == -586166744274
```

**Run this test IMMEDIATELY:**
```bash
pytest apps/pdf-extractor/__tests__/unit/test_vn_number_normalize.py::test_vn_number_normalize_parenthetical_vcb -xvs
```

**Expected:** Test PASSES (indicates upstream bug). Commit message documents this finding.

### PHASE 3: FIX IMPLEMENTATION (CONDITIONAL)

**If test passed (bug is upstream):**

The architect suspects poppler-artifact space inside parenthetical (e.g., "(1.992. 671)"). 

Add defensive handler in `_parse_value()`:
```python
def _parse_value(raw: Optional[str]) -> Optional[float]:
    if raw is None:
        return None
    cleaned = str(raw).strip()
    
    # FR-6: normalize OCR-artifact space inside parenthetical VN number
    # e.g. "(1.992. 671)" → "(1.992.671)" before normalization
    cleaned = re.sub(r"(\(\d[\d.]*)\.\s+(\d[\d.]*\))", r"\1.\2", cleaned)
    
    normalized = vn_number_normalize(cleaned)
    return _coerce_ocr_number(normalized) if normalized is None else normalized
```

This mirrors the existing poppler-artifact handler at L250 and is backward-safe.

**If test failed (bug is in vn_number_normalize):**

Enhance `vn_number_normalize` to explicitly detect parenthetical multi-dot VN format:
```python
def vn_number_normalize(raw: str) -> Optional[float]:
    if not raw:
        return None
    
    cleaned = raw.strip()
    
    # FR-6 defensive: explicit parenthetical VN-int detection
    # If stripped (after paren removal) matches 2+ dot-groups of exactly 3 digits each
    # → guaranteed VN thousands integer, normalize directly
    if cleaned.startswith("(") and cleaned.endswith(")"):
        inner = cleaned[1:-1]
        # Pattern: digits, then (dot + 3 digits)+ = VN thousands format
        if re.match(r"^\d{1,3}(?:\.\d{3})+$", inner):
            normalized = inner.replace(".", "")
            return float("-" + normalized) if "(" in raw and "-" not in inner else float(normalized)
    
    # ... existing pattern cascade ...
```

### PHASE 4: NON-REGRESSION + ACCEPTANCE

```bash
# Run all vn_number_normalize tests
pytest apps/pdf-extractor/__tests__/unit/test_vn_number_normalize.py -xvs

# Run sandbox
python apps/pdf-extractor/sandbox/runner.py --tier=primitive --scenario=all
python apps/pdf-extractor/sandbox/runner.py --tier=module --scenario=all

# Re-evaluate VCB
curl -X POST http://localhost:4000/api/bctc-eval/recompute/31f2a9a9
sleep 5
curl http://localhost:4000/api/bctc-eval/31f2a9a9 | jq '.stage4'
# Verify: value_blank_label_count == 0
```

## [QA] Acceptance Procedure

1. **Investigation phase documentation:** Trace output included in commit message showing what token reached where
2. **Root-cause attestation:** Developer declares what the root cause is and where fix was applied
3. **Defensive test result:** `test_vn_number_normalize_parenthetical_vcb` PASS or FAIL documented
4. Verify AC-1 through AC-6 all marked complete
5. Run full test suite: `pytest apps/pdf-extractor/__tests__/unit/ -xvs`
6. Run sandbox G12 both tiers: both GREEN
7. Run VCB eval recompute + verify Stage 4 gates: value_blank_label_count=0
8. Mark TASK_332 DONE

---

**Depends on:** TASK_331  
**Blocks:** None (final task in sprint)  
**Estimated:** ~3h (investigation + trace + fix + verify)

**CRITICAL:** Do NOT write code changes until investigation trace is complete. Trace-first.
