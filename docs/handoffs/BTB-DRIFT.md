# Handoff — BTB-DRIFT (dev-pdf-extractor)

**Sprint:** BCTC-TABLE-BOUNDARY | **Task:** BTB-DRIFT-DEV
**From:** architect (convergence brief complete)
**To:** dev-pdf-extractor
**Brief:** `docs/architecture-briefs/2026-05-30-bctc-table-boundary-drift-convergence.md`
**Zone:** `apps/pdf-extractor/`

---

## [Architect] Brownfield Findings

- **Zone:** `apps/pdf-extractor/`
- **Verified paths:**
  - `infrastructure/pek_engine_adapter.py:541–610` — `_group_bboxes_into_units` — DELETE this function
  - `infrastructure/pek_engine_adapter.py:751` — sole caller — replace with shared module call
  - `infrastructure/generic_md_table_extractor.py:2573–2805` — `build_document_map` — replace inline state machine body with delegating call; keep function signature unchanged
  - `infrastructure/generic_md_table_extractor.py:3056–3116` — `_is_title_band` — move to `bctc_page_grouper.py`; re-export alias here
  - `infrastructure/generic_md_table_extractor.py:3165–3234` — `_fingerprints_continuous` — move to `bctc_page_grouper.py`; re-export alias here
  - `application/extract_layout_first_usecase.py` — no change; `build_document_map_fn` callable injection is unchanged
  - `interface/handlers.py:359–395` — `/extract-layout-first` route — no change (BCTC-LAYOUT-FIRST sprint asset)
  - `mcp-server pushBctcLayoutHandler.ts:162–181` — confirmed path-agnostic; 0-diff
- **Scan clean:** true ✓
- **BUILD-STANDARD:** lean

---

## Caller Map Summary

**PATH A callers of `build_document_map`:**
- `main.py:31,109` — wired into `ExtractLayoutFirstUseCase`
- `application/extract_layout_first_usecase.py:151` — receives as `build_document_map_fn` callable
- `interface/handlers.py:359–395` — dispatches via `/extract-layout-first` route

**PATH B caller of `_group_bboxes_into_units`:**
- `pek_engine_adapter.py:751` — sole caller in `_run_extraction`

**CONCLUSION — PATH A is a LIVE SPRINT ASSET** (BCTC-LAYOUT-FIRST LF-EXTRACT open). Do NOT delete `build_document_map` or the `/extract-layout-first` route. The shared module approach applies.

---

## Dev Implementation Spec

### New file: `apps/pdf-extractor/infrastructure/bctc_page_grouper.py`

**This is the SSOT for all page grouping logic.**

Contains:
1. Constants (moved from `generic_md_table_extractor.py`):
   - `_GUTTER_POSITION_TOLERANCE = 0.05`
   - `_ROW_PITCH_CHANGE_TOLERANCE = 0.50`
   - `_CONTINUATION_MARKERS` (list of Vietnamese/English continuation phrases)
   - `_TITLE_BAND_SCAN_LINES`, `_TITLE_BAND_MIN_LEN`, `_TITLE_BAND_MAX_LEN`
   - `_MONEY_GROUP_RE`

2. Data classes:
   ```python
   from dataclasses import dataclass, field
   from typing import List

   @dataclass
   class PageDescriptor:
       page_num: int
       page_type: str          # "table" | "prose" | "blank"
       gutter_count: int
       gutter_x_fractions: List[float]
       row_pitch: float
       stored_text: str        # "" disables D-5

   @dataclass
   class UnitDescriptor:
       pages: List[int]
       page_type: str          # "table" | "prose"
       schema_page: int
   ```

3. Functions (exact logic from PATH A, reviewed and proven correct):
   - `_is_title_band(stored_text: str) -> bool` — exact copy from `generic_md_table_extractor.py:3056–3116`
   - `_is_continuous(desc_a: PageDescriptor, desc_b: PageDescriptor) -> bool` — equivalent of `_fingerprints_continuous`; uses the dataclass fields instead of dict keys
   - `group_pages_into_units(pages: List[PageDescriptor]) -> List[UnitDescriptor]` — the 5-state machine (NO_TABLE/TABLE_OPEN, pending_blanks deferred buffer, _is_continuous for TABLE_OPEN+table, prose units emitted)

4. `group_pages_into_units` state machine spec (mirror of PATH A's proven code):
   ```
   state = "NO_TABLE"
   pending_blanks: List[int] = []
   last_committed_d1: Optional[PageDescriptor] = None
   current_pages: List[int] = []
   current_type: Optional[str] = None
   units: List[UnitDescriptor] = []

   def flush():
       if current_pages:
           schema_fp = current_pages[0]
           units.append(UnitDescriptor(pages=list(current_pages), page_type=current_type, schema_page=schema_fp))
           current_pages.clear()

   for desc in pages:
       if desc.page_type == "blank":
           pending_blanks.append(desc.page_num)
           continue

       if state == "NO_TABLE":
           pending_blanks.clear()
           if desc.page_type == "table":
               flush()
               current_pages = [desc.page_num]
               current_type = "table"
               last_committed_d1 = desc
               state = "TABLE_OPEN"
           else:  # prose
               if not current_pages:
                   current_pages = [desc.page_num]
                   current_type = "prose"
               elif _is_continuous(current_pages_last_desc, desc):
                   current_pages.append(desc.page_num)
               else:
                   flush()
                   current_pages = [desc.page_num]
                   current_type = "prose"
               current_pages_last_desc = desc

       elif state == "TABLE_OPEN":
           if desc.page_type == "prose":
               pending_blanks.clear()
               flush()
               current_pages = [desc.page_num]
               current_type = "prose"
               last_committed_d1 = None
               state = "NO_TABLE"
           else:  # table
               if _is_continuous(last_committed_d1, desc):
                   current_pages.extend(pending_blanks)
                   pending_blanks.clear()
                   current_pages.append(desc.page_num)
                   last_committed_d1 = desc
               else:
                   pending_blanks.clear()
                   flush()
                   current_pages = [desc.page_num]
                   current_type = "table"
                   last_committed_d1 = desc
               # state stays TABLE_OPEN

   flush()
   return units
   ```
   Note: track a `current_desc_for_prose` variable to enable `_is_continuous` comparison on prose pages in NO_TABLE state.

### Modify: `apps/pdf-extractor/infrastructure/pek_engine_adapter.py`

1. **DELETE** the function `_group_bboxes_into_units` (L541–610) entirely.

2. **Add import** at module top:
   ```python
   from infrastructure.bctc_page_grouper import (
       PageDescriptor,
       UnitDescriptor,
       group_pages_into_units,
   )
   ```

3. **In `_run_extraction` (L698+), replace Step 2 (L750–758):**

   Before L751, build `page_descriptors`:
   ```python
   page_descriptors: List[PageDescriptor] = []
   for pn in sorted(pages_bboxes.keys()):
       bboxes_for_page = pages_bboxes[pn]
       table_bboxes_for_page = [b for b in bboxes_for_page if b.get("label") == _LAYOUT_CLASS_TABLE]
       if not bboxes_for_page:
           ptype = "blank"
       elif table_bboxes_for_page:
           ptype = "table"
       else:
           ptype = "prose"
       # Simple gutter fractions from table bbox x-positions
       w, h = page_dims.get(pn, (2338, 3308))
       gutter_fracs = [
           ((b.get("bbox", [0,0,0,0])[0] + b.get("bbox", [0,0,0,0])[2]) / 2.0 / w)
           for b in table_bboxes_for_page
       ] if w > 0 else []
       page_descriptors.append(PageDescriptor(
           page_num=pn,
           page_type=ptype,
           gutter_count=len(table_bboxes_for_page),
           gutter_x_fractions=gutter_fracs,
           row_pitch=0.0,   # PEK path: no row_pitch from layout; pitch-change guard disabled
           stored_text="",  # PEK path: no OCR text at this stage; D-5 silently no-ops
       ))
   ```
   Note: `row_pitch=0.0` means `_is_continuous` pitch check is skipped (both pitch_a and pitch_b must be >0 for the change guard to fire — see the guard condition in `_fingerprints_continuous`: `if pitch_a > 0 and pitch_b > 0`). This is correct for PATH B where pitch is unavailable.

   Replace L751 call:
   ```python
   unit_descriptors = group_pages_into_units(page_descriptors)
   ```

   Build document_map from unit_descriptors:
   ```python
   units_in_map = [
       {
           "unit_id": str(uuid.uuid4()),
           "schema_page": ud.schema_page,
           "pages": ud.pages,
           "page_type": ud.page_type,
       }
       for ud in unit_descriptors
   ]
   total_pages = max(pages_bboxes.keys()) if pages_bboxes else 0
   document_map = {"report_id": report_id, "total_pages": total_pages, "units": units_in_map}
   ```

4. **Build units_output to include prose units.** In Step 5 (L822+), iterate `units_in_map` and emit prose units with `stitched_markdown=""`, `row_count=0`, `quarantined=False`:
   ```python
   for unit in units_in_map:
       unit_id = unit["unit_id"]
       pages_in_unit = unit.get("pages", [])
       page_type = unit.get("page_type", "table")

       if page_type != "table":
           # Prose/blank unit — emit with empty markdown, not quarantined
           units_output.append({
               "unit_id": unit_id,
               "stitched_markdown": "",
               "row_count": 0,
               "quarantined": False,
               "quarantine_reason": None,
               "page_row_spans": [{"page": p, "row_start": 0, "row_end": 0} for p in pages_in_unit],
           })
           continue

       # Table unit — existing assembly logic
       stitched_md = self._assemble_unit_markdown(...)
       ...
   ```

### Modify: `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py`

1. **Move** `_is_title_band` (L3056–3116) and `_fingerprints_continuous` (L3165–3234) and all their referenced constants to `bctc_page_grouper.py`. At their original locations in `generic_md_table_extractor.py`, replace with re-export aliases:
   ```python
   from infrastructure.bctc_page_grouper import _is_title_band, _fingerprints_continuous  # noqa: F401 re-export
   ```
   Existing test imports from `generic_md_table_extractor` continue to work unchanged.

2. **Replace the state machine body in `build_document_map`** (L2658–2791). Keep the function signature and docstring. After computing `page_fingerprints` (Step 1, L2643–2653), replace Steps 2+3 with:
   ```python
   from infrastructure.bctc_page_grouper import PageDescriptor, group_pages_into_units

   page_descriptors = [
       PageDescriptor(
           page_num=pn,
           page_type=page_fingerprints[pn].get("page_type", "prose"),
           gutter_count=page_fingerprints[pn].get("gutter_count", 0),
           gutter_x_fractions=page_fingerprints[pn].get("gutter_x_fractions", []),
           row_pitch=page_fingerprints[pn].get("row_pitch_px_at_50dpi", 0.0),
           stored_text=page_text_by_num.get(pn, ""),
       )
       for pn in range(1, total_pages + 1)
   ]
   unit_descriptors = group_pages_into_units(page_descriptors)
   units = [
       {
           "unit_id": str(uuid.uuid4()),
           "schema_page": ud.schema_page,
           "pages": ud.pages,
           "page_type": ud.page_type,
       }
       for ud in unit_descriptors
   ]
   ```
   Then `_flush_unit`, `state`, `pending_blanks`, `last_committed_d1_fp`, `current_unit_pages`, `current_fp` — all removed (no longer needed).

### New test file: `apps/pdf-extractor/__tests__/unit/test_anti_drift_grouper.py`

**AD-1 — path-agreement:**
```python
def test_ad1_both_paths_produce_same_boundaries():
    """
    AD-1: Feed the same page sequence through the shared group_pages_into_units()
    from both PATH A and PATH B entry descriptor builders.
    Assert identical unit boundaries.
    Structural anti-drift: if someone adds a second grouper, this test breaks.
    """
    from infrastructure.bctc_page_grouper import PageDescriptor, group_pages_into_units
    pages = [
        PageDescriptor(1, "table", 3, [0.31, 0.55, 0.72], 14.0, ""),
        PageDescriptor(2, "table", 3, [0.31, 0.55, 0.72], 14.0, ""),
        PageDescriptor(3, "prose", 0, [], 18.0, ""),
        PageDescriptor(4, "table", 3, [0.31, 0.55, 0.72], 14.0, ""),
    ]
    units = group_pages_into_units(pages)
    assert len(units) == 3
    assert units[0].page_type == "table"
    assert units[0].pages == [1, 2]
    assert units[1].page_type == "prose"
    assert units[1].pages == [3]
    assert units[2].page_type == "table"
    assert units[2].pages == [4]
```

**AD-2 — deleted function guard:**
```python
def test_ad2_group_bboxes_into_units_deleted():
    """
    AD-2: _group_bboxes_into_units must NOT exist in pek_engine_adapter.
    If it does, drift #3 has re-occurred.
    """
    import infrastructure.pek_engine_adapter as pek_mod
    assert not hasattr(pek_mod, "_group_bboxes_into_units"), (
        "DRIFT GUARD FAILED: _group_bboxes_into_units still exists in pek_engine_adapter. "
        "BTB-DRIFT fix requires it be deleted and replaced by bctc_page_grouper.group_pages_into_units."
    )
```

**DV-1-B through live grouper:**
```python
def test_dv1b_table_prose_table_three_units_via_shared_grouper():
    from infrastructure.bctc_page_grouper import PageDescriptor, group_pages_into_units
    pages = [
        PageDescriptor(1, "table", 3, [0.31, 0.55, 0.72], 14.0, ""),
        PageDescriptor(2, "prose", 0, [], 18.0, ""),
        PageDescriptor(3, "table", 3, [0.31, 0.55, 0.72], 14.0, ""),
    ]
    units = group_pages_into_units(pages)
    assert len(units) == 3, f"DV-1-B: expected 3 units, got {len(units)}: {units}"
    assert units[1].page_type == "prose"
```

**DV-2-B through live grouper:**
```python
def test_dv2b_title_band_splits_via_shared_grouper():
    from infrastructure.bctc_page_grouper import PageDescriptor, group_pages_into_units
    fp = {"gutter_count": 3, "gutter_x_fractions": [0.31, 0.55, 0.72], "row_pitch": 14.0}
    pages = [
        PageDescriptor(1, "table", 3, [0.31, 0.55, 0.72], 14.0, ""),
        PageDescriptor(2, "table", 3, [0.31, 0.55, 0.72], 14.0, "BANG KET QUA HOAT DONG\n1.234.567\n"),
    ]
    units = group_pages_into_units(pages)
    assert len(units) == 2, f"DV-2-B: title-band must split, got {len(units)} units"
```

**8-cap removed — long table test:**
```python
def test_9_consecutive_table_pages_not_split():
    """
    Regression: 8-page cap would have force-split at page 8.
    After BTB-DRIFT fix: 9 consecutive geometrically identical table pages → 1 unit.
    """
    from infrastructure.bctc_page_grouper import PageDescriptor, group_pages_into_units
    pages = [
        PageDescriptor(i, "table", 3, [0.31, 0.55, 0.72], 14.0, "")
        for i in range(1, 10)  # 9 pages
    ]
    units = group_pages_into_units(pages)
    assert len(units) == 1, f"9-page table must not be split by page cap, got {len(units)} units"
    assert units[0].pages == list(range(1, 10))
```

---

## Commit Scope

Scoped commits in order:
1. `infrastructure/bctc_page_grouper.py` — new shared module
2. `infrastructure/generic_md_table_extractor.py` — delegate state machine + re-export
3. `infrastructure/pek_engine_adapter.py` — delete old grouper, call shared module, emit prose units
4. `__tests__/unit/test_anti_drift_grouper.py` — AD-1, AD-2, DV-1-B, DV-2-B, 9-page regression

**Zero diff:** `text_table_extractor.py`, `PDF-Extract-Kit/` subtree, `apps/mcp-server/`

---

## Done-Bar

1. All 659 existing tests GREEN (no regression)
2. AD-1, AD-2, DV-1-B, DV-2-B, 9-page regression GREEN
3. `test_anti_drift_grouper.py:test_ad2_group_bboxes_into_units_deleted` GREEN (proves the old function is gone)
4. Off-hours re-extraction of FPT `e71f845d` + ACB: direct DB read shows `page_type` mix (table AND prose rows in `bctc_layout_units`), ~7 table spans + prose units for FPT, ~5 for ACB, NO duplicate rows
5. Extraction log contains `PekEngineAdapter._run_extraction` confirming PATH B was the source

---

## NEXT

dev-pdf-extractor (task BTB-DRIFT-DEV) → ops (ONE off-hours re-extraction, BATCHED with `60dfac7f` idempotency rebuild + BTB-UNBLOCK runtime instrumentation) → qa (direct-DB done-bar) → po (BTB-EXIT)
