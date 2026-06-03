# Architecture Brief: LF-GROUP-RETHINK — Unit-Grouping Stage Root Cause

**Sprint:** BCTC-LAYOUT-FIRST
**Task:** LF-GROUP-RETHINK (SPIKE — plan-only)
**Date:** 2026-06-03T10:19Z
**Author:** agents-architect
**Status:** DELIVERED — impl task spec at §5
**Prior brief:** `docs/architecture-briefs/2026-06-03-lf-tier0-fingerprint-rethink.md`
  (scope: page_type classifier only; grouping assumed working — that assumption is the gap
  this brief corrects)

---

## 1. Confirmed Context

The prior brief (LF-TIER0-FINGERPRINT-RETHINK) recommended and the dev team implemented:

- **LF-IMPL-1**: three-signal OR classifier (`signal_A|signal_B|signal_C`) in
  `_compute_page_fingerprint_50dpi`. Live in container (mtime Jun-3 06:23). Confirmed by
  fresh extract: 32/46 pages now `page_type=table` — the all-prose misclassification is gone.
- **LF-IMPL-2**: `_ALLOW_PROSE_IN_TABLE_UNIT=True` guard + `fp_for_continuity` coercion in
  `build_document_map`. Also live in container.

Both fixes are PRESENT and RUNNING in the live container. "Fix not live" is explicitly refuted.

**Yet AC-LFE-2 still fails.** Live census: 46 pages → 46 DISTINCT `unit_id`, 46 `is_schema_page=1`,
zero `schema_inherited_from_page` set. Every page is a singleton unit. The grouping/inheritance
stage produces ZERO grouping on real corpus documents.

This brief root-causes why.

---

## 2. Root Cause: D-5 `_is_title_band` Obliterates Every Page Boundary

### 2.1 The D-5 Guard in `_fingerprints_continuous`

`_fingerprints_continuous` (line 3169, `generic_md_table_extractor.py`) is the sole gate for
accepting a page as a continuation of the current unit. Its last check is:

```python
if _is_title_band(stored_text_b):
    return False
```

`_is_title_band` (line 3061) returns `True` for any page whose stored OCR text contains, in
the first `_TITLE_BAND_SCAN_LINES=8` lines, **any non-empty, non-purely-numeric,
non-too-long line with 2+ words** that does NOT contain a continuation marker
(`"tiếp theo"`, `"(continued)"`, `"continued"`).

### 2.2 Why D-5 Fires on Every Financial Statement Page

A BCTC balance-sheet page's stored OCR text invariably begins with:
- Account-label lines: `"I. Tiền và các khoản tương đương tiền"` — 2+ words, non-numeric → D-5 FIRES
- Section heading lines: `"A. TÀI SẢN NGẮN HẠN"` — 2+ words, non-numeric → D-5 FIRES
- Column-header lines: `"Chỉ tiêu  Thuyết minh  31/03/2026"` — 2+ words → D-5 FIRES
- The title page itself: `"BẢNG CÂN ĐỐI KẾ TOÁN HỢP NHẤT"` → D-5 FIRES

**Container-verified (raw):**
```
"BANG CAN DOI KE TOAN"     -> is_title_band: True
"A. TAI SAN NGAN HAN"      -> is_title_band: True
"Tong cong ty FPT"          -> is_title_band: True
"I. Tien va cac khoan..."   -> is_title_band: True
"100    200    300    400"   -> is_title_band: False  (purely numeric — correctly excluded)
```

Every pair of consecutive financial-statement pages with real stored OCR text produces
`_fingerprints_continuous = False` via D-5. The multi-signal classifier (LF-IMPL-1) is
irrelevant at this point: even when page_type is correctly `"table"`, the unit grouping loop
still calls `_fingerprints_continuous(prev_fp, fp_for_continuity, stored_text_b=stored_text)`
and D-5 vetoes every continuation. Result: one singleton unit per page = 46 units.

**Container-verified (raw):**
```python
fp = {"page_type": "table", "gutter_count": 2, "gutter_x_fractions": [0.3, 0.6], "row_pitch_px_at_50dpi": 8.0}
_fingerprints_continuous(fp, fp, stored_text_b="I. Phai tra ngan han\n111\n200")  -> False
_fingerprints_continuous(fp, fp, stored_text_b="")                                  -> True
```

### 2.3 D-5 Was Designed for a Different Input

`_is_title_band` was originally designed to detect **section START pages** — pages that OPEN
a NEW table section (e.g. the first page of the balance sheet) — and fire a unit break. Its
intent was: if page B opens with a table-title band (like "BẢNG CÂN ĐỐI KẾ TOÁN"), start a
new unit.

The structural error is that D-5's `return True` logic is far too broad: it triggers on
**any page whose first non-numeric line has 2+ words**, which is effectively **every**
financial statement content page. The function was designed to detect one specific pattern
(a standalone section title block at the top of a page) but its implementation matches almost
all text in a financial statement.

The only escape hatch is `_CONTINUATION_MARKERS = ("tiếp theo", "(continued)", "continued")`.
In a real BCTC corpus, continuation-marked pages are a tiny minority (notes pages only).
The vast majority of BCTC pages have no continuation marker in their first 8 lines, so D-5
fires unconditionally on every page.

---

## 3. Test-vs-Live Path Gap — Why the Unit Tests Pass

### 3.1 `test_fpt_q1_page5_in_same_unit_as_page3` (test_document_map.py line 401)

This test calls:
```python
self._simulate_grouping([fp_balance_sheet, fp_balance_sheet, fp_balance_sheet, fp_balance_sheet])
```
with **no `stored_texts` argument**. The `_simulate_grouping` helper defaults:
```python
if stored_texts is None:
    stored_texts = [""] * len(fingerprints)
```

Empty string `""` passes directly through `_is_title_band`:
```python
def _is_title_band(stored_text: str) -> bool:
    if not stored_text:       # ← True for "" → return False immediately
        return False
```

So D-5 **never fires** in the test. `_fingerprints_continuous` returns `True` for all
consecutive pairs → all 4 pages group into one unit → test PASSES.

In the live path, `build_document_map` calls:
```python
_fingerprints_continuous(prev_fp, fp_for_continuity, stored_text_b=stored_text)
```
where `stored_text = page_text_by_num.get(page_num, "")` — the real OCR text fetched from
`pdf_extracted_text` via `OcrPagesFetchClientPort`. Every real page has non-empty OCR text
→ D-5 fires on every page → zero grouping.

### 3.2 `test_fpt_q1_scenario_page5_inherits_page3_schema` (test_schema_inheritance.py line 353)

This test calls `zone_page()` **directly**, injecting a pre-built `page3_schema` dict as
`unit_schema`. It never calls `build_document_map`. The test proves that `zone_page()`
correctly uses inherited schema when given one — but it has ZERO bearing on whether
`build_document_map` will ever produce a multi-page unit that could trigger schema
inheritance. The grouping stage (Tier 0) and the zone stage (Tier 1) are orthogonal;
the test covers only Tier 1.

**Summary of the test-vs-live gap:** Both key tests pass because they bypass the broken
component. `test_document_map.py` uses empty stored_texts; `test_schema_inheritance.py`
skips Tier 0 entirely. Neither test exercises the D-5 path with real OCR text.

---

## 4. Secondary Finding: Page 3 `page_type=prose` (AC-LFE-1 secondary)

Live extract: FPT Q1 page 3 is still `page_type=prose`. The prior brief (LF-TIER0) correctly
identified that the multi-signal classifier (LF-IMPL-1) should reclassify it. If the fix is
live, why is page 3 still prose?

Two possibilities, both independent of the D-5 grouping bug:

**Possibility A (likely):** The stored OCR text for page 3 lacks the signal triggers.
Signal C (date-header `DD/MM/YYYY`) should fire if the date column header appears in the
stored text. If the OCR pipeline stored the page 3 text *without* the `31/03/2026` column
header (e.g. OCR ran before the date column was added, or the OCR for page 3 was stored
pre-fix), Signal C would not fire.

**Possibility B (less likely):** The container image was built with LF-IMPL-1 but the
OCR text stored in `pdf_extracted_text` for FPT Q1 predates the fix. The stored text
is immutable — it was stored by the pre-fix extraction run. If page 3's stored OCR text
has no date tokens and fewer than 3 account-code tokens, Signal B/C don't fire even with
the new classifier.

**Recommended action:** The page-3 prose classification is a secondary issue. Even if page 3
were reclassified as `table`, the grouping WOULD STILL produce singletons because D-5 breaks
every consecutive pair. Fix D-5 first (§5 below); then recheck page-3 classification.

---

## 5. Structural Fix Specification

### 5.1 Root Fix: Narrow `_is_title_band` to Detect Only Standalone Section-Header Pages

The D-5 guard was designed to detect ONE pattern: a page that STARTS a new table section
with a full standalone title block (e.g. the cover page of a balance sheet chapter). The
current implementation is too broad — it fires on any page with readable text.

The fix must make `_is_title_band` return `True` ONLY for pages that genuinely open a new
section, not for continuation pages with financial row content.

**Proposed fix — Require ALL of the following for `True`:**
1. The first qualifying line must appear in lines 1-4 of the page (not just any of the
   first 8). A genuine section-title page has the title at the very top.
2. The qualifying line must be LONGER than a typical account label (suggest minimum 20
   chars — short enough for "BẢNG CÂN ĐỐI KẾ TOÁN", too long for "Tổng tài sản").
3. At least 3 consecutive non-data lines at the top (multi-line title block). A single
   non-numeric line in the first 8 is NOT a title band; a genuine title block occupies 3+
   consecutive lines.
4. The page must have NO money-group tokens in the first 4 lines. A page whose first
   4 lines contain money-group values is a continuation page, not a section-start.

**Alternative fix (simpler, lower risk):** Remove D-5 entirely from `_fingerprints_continuous`.
The gutter-position geometry check (count + fraction tolerance) already provides the primary
continuity gate. D-5 was added as a secondary guard to prevent continuation pages from
being incorrectly merged into a preceding unit when there is a genuine section break. But:
- The multi-signal classifier (LF-IMPL-1) now correctly produces `page_type=table` vs `prose`
  for most genuine section boundaries.
- The `page_type` equality check at the top of the grouping loop already breaks units on
  `prose→table` transitions (which is the dominant section-break signal).
- D-5 was effective before LF-IMPL-1: when START pages were classified as `prose`, D-5
  was needed to prevent `prose` pages from being merged with the preceding table unit.
  Now that LF-IMPL-1 correctly classifies START pages as `table`, D-5 in `_fingerprints_continuous`
  is redundant on the table→table path AND catastrophically over-fires.

**Recommended approach (lower risk, verifiable):**

**Option A — Remove D-5 from `_fingerprints_continuous`, keep as standalone function**

```python
def _fingerprints_continuous(fp_a, fp_b, stored_text_b="") -> bool:
    if fp_a.get("page_type") == "blank" or fp_b.get("page_type") == "blank":
        return False
    pt_a = fp_a.get("page_type", "prose")
    pt_b = fp_b.get("page_type", "prose")
    if pt_a != pt_b:
        return False
    gc_a = fp_a.get("gutter_count", 0)
    gc_b = fp_b.get("gutter_count", 0)
    if gc_a != gc_b:
        return False
    gx_a = fp_a.get("gutter_x_fractions", [])
    gx_b = fp_b.get("gutter_x_fractions", [])
    if len(gx_a) != len(gx_b):
        return False
    for xa, xb in zip(gx_a, gx_b):
        if abs(xa - xb) > _GUTTER_POSITION_TOLERANCE:
            return False
    pitch_a = fp_a.get("row_pitch_px_at_50dpi", 0.0)
    pitch_b = fp_b.get("row_pitch_px_at_50dpi", 0.0)
    if pitch_a > 0 and pitch_b > 0:
        change = abs(pitch_a - pitch_b) / max(pitch_a, pitch_b)
        if change > _ROW_PITCH_CHANGE_TOLERANCE:
            return False
    # D-5 REMOVED: _is_title_band fires on ALL financial text, blocking every continuation.
    # Section breaks are now correctly handled by the page_type equality check above
    # (LF-IMPL-1 classifies genuine section-start pages as "table", transitioning
    # prose→table = new unit, or table→table with different gutter = new unit).
    return True
```

**Option B — Narrow D-5 scope: only fire on page_type changes, not table→table paths**

In `_fingerprints_continuous`, move the D-5 check inside the `pt_a != pt_b` branch, or
only apply it when `pt_b == "table"` and `pt_a == "prose"`. This prevents D-5 from
firing on table→table continuation checks where it is over-broad.

**Recommendation: Option A (remove D-5 from `_fingerprints_continuous`).**
Rationale: D-5 is the sole cause of the 46-singleton behavior. LF-IMPL-1 already handles
the page_type boundary at the point where D-5 was helpful. Removing D-5 eliminates
the recurrence class with zero secondary risk. The `_is_title_band` function is retained
as a standalone utility (it may have other callers or test coverage) but is removed from
the continuity gate.

### 5.2 Test Fix: Add `stored_texts` with Real Content to Grouping Tests

The `_simulate_grouping` helper in `test_document_map.py` and all `_fingerprints_continuous`
tests must be upgraded to test with realistic financial OCR text (not just empty strings).

**Required new test cases:**
1. `test_d5_not_firing_on_account_label_pages`: Two consecutive `table` pages with
   realistic account-label stored text → `_fingerprints_continuous` must return `True`
   after Option A fix.
2. `test_fpt_q1_page5_in_same_unit_as_page3_with_real_text`: Update the existing test to
   pass `stored_texts=[""] + [typical_account_label_text] * 3` and assert grouping still
   produces one unit.
3. `test_genuine_section_start_breaks_unit` (regression: Option A does NOT re-break real
   section boundaries): verify that two pages with different `gutter_count` or
   `gutter_x_fractions` beyond tolerance still break units, even without D-5.

### 5.3 Schema Inheritance Wiring (Already Correct — No Change Needed)

The `zone_page` function in Tier 1 and the inheritance wiring in
`extract_layout_first_usecase.py` (lines 316-359) are correct. When `build_document_map`
produces a unit with pages `[3, 4, 5, 6]` and `schema_page=3`, the use case loop will:
- Call `zone_page(is_schema_page=True, unit_schema=None)` for page 3 → detects column gutters.
- Call `zone_page(is_schema_page=False, unit_schema={...}, schema_inherited_from_page=3)` for
  pages 4, 5, 6 → inherits schema.

This produces `schema_inherited_from_page=3` for page 5 in `bctc_page_zones`, satisfying AC-LFE-2.
No change needed to Tier 1 or Tier 2 code once Tier 0 grouping is fixed.

---

## 6. Owner-Split

### Owner A: dev-pdf-extractor

**File:** `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py`

**Task LF-GRP-1: Remove D-5 from `_fingerprints_continuous` (Option A)**
- In `_fingerprints_continuous` (line ~3169), remove the `if _is_title_band(stored_text_b): return False` block (lines ~3216-3218).
- Add a comment: `# D-5 removed: fires on all financial text; page_type equality check (above) is the structural boundary gate.`
- Keep `_is_title_band` as a standalone function in the module (preserve the function body and its existing tests in test_unit_grouper.py).
- The `stored_text_b` parameter of `_fingerprints_continuous` becomes effectively unused (but keep the signature for backward compatibility with existing callers — no caller will break if D-5 is removed, they just get correct grouping).

**Task LF-GRP-2: Fix `test_document_map.py` grouping tests to use real stored_text**
- In `TestFingerprintGroupingLogic._simulate_grouping`, add an `assert` that warns when
  `stored_texts` defaults to all-empty (to prevent future regressions of the empty-text bypass).
  OR: change the default from `[""] * N` to `["Page text line one is a label"] * N` so D-5
  would have fired before the fix, making the test non-trivially protected.
- Add `TestFingerprintGroupingLogic.test_fpt_q1_page5_in_same_unit_as_page3_with_real_text`
  using realistic stored OCR text per the spec in §5.2.
- Add `test_d5_not_firing_after_fix_real_text` in `TestFingerprintsContinuous`.
- Add `test_genuine_section_start_still_breaks_unit` using different `gutter_count` fingerprints.

### Owner B: qa (verification)

**Task LF-GRP-3: Re-extract FPT Q1 + DB census**
After LF-GRP-1 is deployed (container rebuilt):
1. Trigger fresh extraction for FPT Q1 report_id `e8ea3df5-3f32-413d-a3eb-c71634c0438d`.
2. Verify `bctc_page_zones`: `COUNT(DISTINCT unit_id) << 46` — pages 3, 4, 5, 6 must share one `unit_id`.
3. Verify `schema_inherited_from_page = 3` for pages 4, 5, 6 in that unit.
4. Confirm AC-LFE-2: `SELECT schema_inherited_from_page FROM bctc_page_zones WHERE page_number=5 AND report_id=...` returns `3`.
5. Run full unit test suite: `pytest __tests__/unit/ -x` → all passing.

---

## 7. What This Does NOT Change

- `_compute_page_fingerprint_50dpi` (LF-IMPL-1 multi-signal classifier) — unchanged.
- `_ALLOW_PROSE_IN_TABLE_UNIT` (LF-IMPL-2 continuity guard) — unchanged.
- `zone_page` (Tier 1 schema inheritance) — unchanged.
- `ocr_unit` (Tier 2) — unchanged.
- `extract_layout_first_usecase.py` orchestration — unchanged.
- `text_table_extractor.py` — 0-byte diff required (non-regression).
- `_is_title_band` function body — kept as standalone utility.
- `unit_grouper.py` shim and its tests — unchanged.

---

## 8. AC Mapping

| AC | How this brief's fix addresses it |
|---|---|
| AC-LFE-1 (pages 3–6 same unit) | D-5 removal → `_fingerprints_continuous` returns True for consecutive same-type same-geometry pages → grouping produces multi-page unit. |
| AC-LFE-2 (`schema_inherited_from_page=3` for page 5) | Follows automatically from AC-LFE-1: once pages 3–6 share a unit with `schema_page=3`, the use case wiring (already correct) sets `schema_inherited_from_page=3` for pages 4, 5, 6. |
| AC-LFE-11 (quarantine path exercised) | When units contain multiple pages, the invariant checkers receive real multi-row inputs. Quarantine thresholds can now be calibrated. LF-IMPL-3 (quarantine proof test) from prior brief remains a prerequisite for honest AC-LFE-11 green. |

---

## 9. Implementation Order

```
LF-GRP-1 (remove D-5 from _fingerprints_continuous)
  → container rebuild
  → LF-GRP-3 (re-extract FPT Q1, verify AC-LFE-1/2 in DB)
  → LF-GRP-2 (test suite update with real stored_text)
  → run full unit test suite
  → LF-DEPLOY re-gate
```

LF-GRP-1 and LF-GRP-2 are independent (can be coded in same pass, test suite updated
in same commit). LF-GRP-3 requires container rebuild after LF-GRP-1.

---

## 10. Signal to agent-father

Signal row written to `docs/data/orch/orch-state.json` `.signal_queue`:
`lf-group-rethink-brief-20260603T101925Z` → agent-father (type: `brief_complete`)

Task spec for PO:
```
Task: LF-GRP-IMPL
Sprint: BCTC-LAYOUT-FIRST
Owner: dev-pdf-extractor (LF-GRP-1/2) + qa (LF-GRP-3)
Depends: LF-GROUP-RETHINK (this brief) + container rebuild
Type: SPRINT-S
Zone: apps/pdf-extractor/

Subtasks:
  LF-GRP-1: Remove _is_title_band call from _fingerprints_continuous
             (generic_md_table_extractor.py ~line 3216)
  LF-GRP-2: Update test_document_map.py grouping tests to use real stored_text
  LF-GRP-3: Re-extract FPT Q1 → DB census confirms AC-LFE-1/2 (qa)

DoD:
  - _fingerprints_continuous returns True for consecutive table pages with real text
  - DB: pages 3/4/5/6 in same unit_id (AC-LFE-1)
  - DB: schema_inherited_from_page=3 for pages 4/5/6 (AC-LFE-2)
  - All unit tests pass (no regression)
  - 0-byte diff on text_table_extractor.py

Files:
  - apps/pdf-extractor/infrastructure/generic_md_table_extractor.py (LF-GRP-1)
  - apps/pdf-extractor/__tests__/unit/test_document_map.py (LF-GRP-2)
```
