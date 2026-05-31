# Architecture Brief — BTB-DRIFT: Convergence Design for Dual-Path Grouping

**Sprint:** BCTC-TABLE-BOUNDARY
**Task:** BTB-DRIFT-ARCH
**Zone:** `apps/pdf-extractor/`
**BUILD-STANDARD:** lean (in-zone, no new ports, no new use case)
**Created:** 2026-05-30
**Status:** Design complete — NEXT: dev-pdf-extractor (BTB-DRIFT-DEV)

---

## 1. Path-Trace Confirmation (Mandate Item i)

PO's trace is **fully confirmed** by direct code read. No assumptions.

### Caller map — `build_document_map` / `ExtractLayoutFirstUseCase`

| Caller | File | Role | Verdict |
|--------|------|------|---------|
| `ExtractLayoutFirstUseCase.__init__` receives `build_document_map_fn=build_document_map` | `main.py:109` | Composition-root wiring | PATH A only |
| `_run_extract_layout_first` background task | `interface/handlers.py:158` | Route handler background task | PATH A — triggered only by `POST /extract-layout-first` |
| `scenarios/pek_single_doc_extraction.py:209,584` | Scenario/test harness | Passes `extract_layout_first_usecase=None` — explicitly disables PATH A | Confirms PATH A is NOT exercised in PEK scenario |
| `__tests__/unit/test_document_map.py` | Unit tests | Tests `build_document_map` pure functions | PATH A test surface only |
| `__tests__/unit/test_table_boundary_state_machine.py` | Unit tests | Tests state machine via `_simulate_state_machine` (mirrors `build_document_map` loop) | PATH A test surface only |

**Conclusion: `/extract-layout-first` is LIVE code (route registered, use case wired in `main.py`) but is NEVER called by the current user-exercised trigger chain.** The user trigger is `/api/trigger-pek-extract` (mcp-server `server.ts:421,464`) → pdf-extractor `POST /pek-extract` → `_run_pek_extract` → `pek_adapter.extract_layout_and_tables()` → `_group_bboxes_into_units`. PATH A is NOT dead in the "deleted code" sense — it is a live, registered, wired route — but it is functionally orphaned from the user's trigger.

**Kill-vs-delegate verdict: DELEGATE, not kill.** The `/extract-layout-first` route must remain registered. Reason: it represents a distinct pipeline (Tier 0-3 Tesseract-based orchestration with eval push) that a future sprint or testing harness may invoke directly. Removing it now would delete the eval push pipeline, which is still architecturally correct. The strategy is NOT to kill PATH A but to make PATH B the canonical grouping implementation and ensure PATH A delegates to the same grouping logic.

### Caller map — `_group_bboxes_into_units`

| Caller | File | Role |
|--------|------|------|
| `PekEngineAdapter._run_extraction` | `pek_engine_adapter.py:751` | LIVE path — called on every user-triggered extraction |
| No other callers in-repo | — | Confirmed single site |

`_group_bboxes_into_units` is a module-level function defined at `pek_engine_adapter.py:541` and called exclusively by `_run_extraction` at L751. It is not imported anywhere else.

---

## 2. Gap Analysis — What PATH B (`_group_bboxes_into_units`) Currently Lacks

Comparing the current PATH B implementation against the full BTB-ARCH spec:

| Feature | PATH B current state | Required |
|---------|---------------------|----------|
| Prose pages finalize current table unit | YES (L593-597) | Required — present |
| 8-page consecutive cap | YES (L566, L601) | Required — present |
| Blank pages handled (discarded as boundary, no unit) | YES (L593 `not table_bboxes` branch catches blank too) | Required — present |
| Prose unit emission | **MISSING** — finalize_unit never called for prose pages; `page_type` always `"table"` | **BLOCKING-2** — prose pages must be emitted as units for downstream inspection/eval |
| Title-band check (D-5) | **MISSING** — `_group_bboxes_into_units` never reads OCR text; uses only bbox label class | Not yet present |
| Schema-page-type `_flush_unit` (fix ROOT CAUSE A) | **NOT APPLICABLE** — PATH B `finalize_unit` always emits `"table"` (L582); no majority-vote | N/A — PATH B has no per-page type vote; the issue does not apply directly |
| Deferred blank buffer (pending_blanks) | **PARTIAL** — blank pages hit the `not table_bboxes` finalize branch, closing the current unit; a sequence `[table, blank, table]` creates TWO units instead of ONE | Gap: blank pages between two geometrically compatible table pages should bridge (not break) |
| Geometric continuity check (D-4 gutter match) | **MISSING** — adjacency is the sole signal; no gutter/pitch check | The current RC-1 fix replaced the old 10%-X-range threshold with simple adjacency; no gutter test exists |

**Summary of gaps in PATH B:**

1. **BLOCKING-2: Prose unit emission** — prose pages finalize the current table unit but the prose page itself is silently discarded. It must become a prose unit in the output (required for inspection viewer + eval).
2. **Blank bridge gap** — `[table, blank, table]` currently splits into two units (blank triggers finalize). Per BTB-ARCH brief Option B (deferred flush), blanks should be buffered and bridged when the next non-blank page is a compatible table page.
3. **Title-band check (D-5)** — two geometrically identical table pages where the second page opens with a title-announcing the start of a new BCTC statement will be merged. However, PATH B's input is DocLayout-YOLO bboxes (not raw OCR text), and the title-band signal is available from the YOLO output: title bboxes (label=0) on a page are already extracted and their `text` fields are populated by PaddleOCR in the `unit_hints` collection. The D-5 check can use the existing title-bbox detection rather than raw OCR text.
4. **D-4 geometric continuity** — PATH B uses pure adjacency (no gutter/pitch comparison). For BCTC documents with multiple distinct financial tables of similar layout, this is not yet a confirmed over-merge source (RC-1 was the confirmed issue; D-4 adds defense-in-depth). This is a **lower-priority gap** — defer unless DV tests prove it required.

---

## 3. Convergence Design

### 3.1 Strategy: In-Place Enhancement of PATH B + Shared `_is_title_band` Helper

**Rejected alternative: shared DRY module.** A shared module (option c in PO decision) would require:
- A new file in `infrastructure/` or `domain/`
- Both `build_document_map` AND `_group_bboxes_into_units` importing it
- `_group_bboxes_into_units` receiving OCR text as input (it currently only takes `pages_bboxes` + `page_dims`)
- Interface change to `extract_layout_and_tables()` public contract

This creates more coupling, more DDD-layer questions (module-level function in infra importing from another infra module), and more test surface. Given that PATH B is the canonical path and PATH A should delegate to it (not vice versa), the cleanest design is: **enhance PATH B directly with the missing features, then make PATH A reuse PATH B's grouping output rather than its own.**

**Chosen design: Option A — in-place enhancement of `_group_bboxes_into_units` + PATH A delegates grouping to PATH B.**

This means:
1. `_group_bboxes_into_units` gains prose unit emission + deferred blank buffer + title-band signal.
2. `build_document_map` in `generic_md_table_extractor.py` continues to exist but is **retired as the grouping authority** — its grouping output is replaced by a call to a shared grouping function.
3. The shared grouping function lives in `pek_engine_adapter.py` (infrastructure), exposed as a module-level function.
4. The anti-drift gate (see Section 4) ensures the two paths cannot diverge again.

However, there is a DDD concern: `build_document_map` lives in `generic_md_table_extractor.py` (infrastructure), and `_group_bboxes_into_units` lives in `pek_engine_adapter.py` (also infrastructure). Cross-import within the same DDD layer (infra → infra) is permitted. But importing from `pek_engine_adapter` into `generic_md_table_extractor` creates a coupling that makes `generic_md_table_extractor` dependent on the PEK adapter — undesirable.

**Revised design: Extract a shared grouping module.**

The grouping logic is pure algorithmic code with no I/O, no model dependency, and no PEK-specific import. It belongs in its own module. The correct layer is **infrastructure** (algorithmic, no domain rules, no external I/O). A new file `infrastructure/unit_grouper.py` contains the single canonical grouping function.

Both `pek_engine_adapter.py` and `generic_md_table_extractor.py` import from `unit_grouper.py`. This is a one-way dependency:

```
pek_engine_adapter.py  ──imports──▶  unit_grouper.py
generic_md_table_extractor.py  ──imports──▶  unit_grouper.py
```

No circular dependency. `unit_grouper.py` imports only stdlib.

### 3.2 `infrastructure/unit_grouper.py` — The Single Canonical Grouping Function

**New file.** Pure function. Zero I/O. Zero model dependency. Zero PEK import.

**Function signature:**

```python
def group_pages_into_units(
    pages: List[Dict],
    max_consecutive_table_pages: int = 8,
) -> List[Dict]:
```

**Input contract:**

`pages` is a list of page-descriptor dicts in page-number order:

```python
{
    "page_num": int,             # 1-indexed
    "page_type": str,            # "table" | "prose" | "blank"
    "title_hints": List[str],    # optional: title strings from layout detection
                                 # (empty list when not available)
}
```

**Output contract:** List of unit dicts identical to the existing DocumentMap unit shape:

```python
{
    "unit_id": str,              # UUID
    "schema_page": int,          # first non-blank page of the unit
    "pages": List[int],          # all page nums belonging to this unit (ordered)
    "page_type": str,            # "table" | "prose" — from schema page
}
```

**Algorithm (state machine — absorbs all logic from both PATH A and PATH B):**

State: `"NO_TABLE"` or `"TABLE_OPEN"`.

Variables:
- `current_unit_pages: List[int]` — pages in the open unit
- `current_unit_type: str` — "table" or "prose"
- `pending_blanks: List[int]` — buffered blank pages between non-blank pages
- `consecutive_table_count: int` — tracks 8-page cap
- `last_title_hints: List[str]` — title hints from the last non-blank page committed to the current unit

Rules:

```
FOR each page in pages:

  IF page_type == "blank":
      pending_blanks.append(page_num)
      continue

  # Non-blank — resolve pending blanks

  IF state == "NO_TABLE":
      pending_blanks = []            # discard leading blanks
      open_new_unit(page_num, page_type)
      state = "TABLE_OPEN" if page_type == "table" else "PROSE_OPEN"

  ELIF state == "TABLE_OPEN":
      IF page_type == "prose":
          flush_unit()               # flush table unit (pending_blanks discarded)
          pending_blanks = []
          open_new_unit(page_num, "prose")
          state = "PROSE_OPEN"

      ELIF page_type == "table":
          d5_fires = _has_new_title(page.title_hints)
          cap_reached = consecutive_table_count >= max_consecutive_table_pages

          IF d5_fires OR cap_reached:
              flush_unit()           # flush table unit (pending_blanks discarded)
              pending_blanks = []
              open_new_unit(page_num, "table")
              # state stays TABLE_OPEN
          ELSE:
              # CONTINUE: bridge pending_blanks into unit
              current_unit_pages.extend(pending_blanks)
              pending_blanks = []
              current_unit_pages.append(page_num)
              consecutive_table_count += 1

  ELIF state == "PROSE_OPEN":
      IF page_type == "table":
          flush_unit()               # flush prose unit (pending_blanks discarded)
          pending_blanks = []
          open_new_unit(page_num, "table")
          state = "TABLE_OPEN"
      ELSE:
          # PROSE continues — extend
          current_unit_pages.extend(pending_blanks)
          pending_blanks = []
          current_unit_pages.append(page_num)

# End of loop
flush_unit()  # final flush
```

**`_has_new_title(title_hints: List[str]) -> bool`:**

Used only when caller provides title hints (from YOLO label=0 bboxes). Returns `True` if any hint string is non-empty AND does not contain a continuation marker (`"tiếp theo"`, `"continued"` case-insensitive). When `title_hints` is empty or all strings are empty — returns `False` (no title signal).

This is a simplified version of `_is_title_band` from `generic_md_table_extractor.py`. It does not scan raw OCR text — it uses the pre-extracted title strings that YOLO already detected. This means:
- PATH B (PEK): `title_hints` comes from label=0 bboxes in `pages_bboxes` — already computed by DocLayout-YOLO.
- PATH A (generic): `title_hints` comes from `unit_hints` already extracted by `_extract_unit_hints` — available in `page_fingerprints[page_num]`.

**Neither path requires new OCR work.** The title signal is already extracted in both paths.

**Constants:**
```python
_CONTINUATION_MARKERS: Tuple[str, ...] = ("tiếp theo", "(continued)", "continued")
_MAX_CONSECUTIVE_TABLE_PAGES: int = 8
```

### 3.3 Adapter for PATH B — Update `_group_bboxes_into_units`

`_group_bboxes_into_units` in `pek_engine_adapter.py` becomes a thin adapter that:
1. Converts `pages_bboxes: Dict[int, List[Dict]]` into the `pages: List[Dict]` format for `group_pages_into_units`.
2. Extracts `title_hints` from each page's label=0 bboxes.
3. Calls `group_pages_into_units(pages, max_consecutive_table_pages=8)`.
4. Returns the output directly (shape is identical to the current return shape — no consumer change).

**Title hint extraction from PEK bboxes:**
```python
title_bboxes = [b for b in bboxes if b.get("label") == _LAYOUT_CLASS_TITLE]
title_hints = [b.get("text", "") for b in title_bboxes if b.get("text")]
```

Note: `_LAYOUT_CLASS_TITLE = 0` is already defined in `pek_engine_adapter.py`. PaddleOCR cell recognition may or may not populate `text` on title bboxes depending on the extraction path. When `text` is absent, `title_hints` is `[]` — safe fallback (no D-5 fires, conservative behavior).

### 3.4 Adapter for PATH A — Update `build_document_map`

`build_document_map` in `generic_md_table_extractor.py` retains its existing input/output contract (it is injected into `ExtractLayoutFirstUseCase` and must preserve the `DocumentMap` shape). Its internal grouping loop is replaced with a call to `group_pages_into_units`.

The existing `build_document_map` already computes `page_fingerprints[page_num]` which contains `page_type` and `unit_hints` (from `_extract_unit_hints`). The adapter:
1. Iterates `page_fingerprints` in page order.
2. For each page, constructs the `pages` entry with `title_hints` from `page_fingerprints[pn].get("unit_hints", [])`.
3. Calls `group_pages_into_units(pages)`.
4. The existing post-grouping code (eval push, zone detection, etc.) consumes the result unchanged — unit shape is identical.

**The 30-line state-machine loop added by d297f3ba (L2660-L2784) is REPLACED** by this single-function call. The `_is_title_band` function, `_flush_unit` closure, `pending_blanks`, and state variables in `build_document_map` are ALL removed — they are replaced by `group_pages_into_units` which implements the same semantics more cleanly.

**`_fingerprints_continuous` in `generic_md_table_extractor.py`** becomes an internal helper for geometric continuity only (D-4). It is NOT called by `group_pages_into_units` (which uses page adjacency as the continuity signal, same as PATH B). If geometric continuity is needed in a future sprint, `_fingerprints_continuous` remains available. For this convergence, it stays in file but is no longer in the grouping hot path. The `stored_text_b` parameter added by d297f3ba remains (backward-compatible, zero-breakage).

### 3.5 Prose Unit Emission — BLOCKING-2 Fix

Both paths now emit prose units because `group_pages_into_units` opens a prose unit on every `page_type == "prose"` page (PROSE_OPEN state). This is the BLOCKING-2 fix — prose pages are no longer silently discarded.

For PATH B: previously, prose pages triggered `finalize_unit()` and then `current_unit_pages = []` — the prose page itself was thrown away. After the change, the prose page opens a prose unit. The mcp-server push handler receives prose units with `page_type="prose"` and stores them in `bctc_layout_units`. Inspection viewer and eval can see them.

**Constraint check:** `push_layout` in mcp-server stores whatever `page_type` the unit carries. No schema constraint prevents prose units from being stored. No existing consumer filters on `page_type="table"` at the push level. This is safe.

---

## 4. Anti-Drift Gate (Mandate Item iii)

Per `feedback_fence_false_green`: the gate must PROVE-RED before the fix, GREEN after. A lint/type check that never actually tests the behavior is not sufficient.

### Gate Design: `test_grouping_convergence.py`

**New test file:** `apps/pdf-extractor/__tests__/unit/test_grouping_convergence.py`

This file contains ONE test class with tests that will be PROVEN-RED against the pre-fix code (where PATH A and PATH B use different implementations) and PROVEN-GREEN after the fix (where both paths call `group_pages_into_units`).

**Test CG-1 — Single-source-of-truth import assertion:**

```python
def test_cg1_both_paths_import_same_grouping_function():
    """
    Anti-drift gate: verify that both callers use the SAME grouping function.
    Fails if either path has its own internal grouping logic that bypasses unit_grouper.
    """
    import inspect
    from infrastructure.unit_grouper import group_pages_into_units
    from infrastructure import pek_engine_adapter
    from infrastructure import generic_md_table_extractor

    # PATH B: _group_bboxes_into_units source must contain a call to group_pages_into_units
    src_b = inspect.getsource(pek_engine_adapter._group_bboxes_into_units)
    assert "group_pages_into_units" in src_b, (
        "PATH B (_group_bboxes_into_units) does not delegate to group_pages_into_units — "
        "dual-path drift detected"
    )

    # PATH A: build_document_map source must contain a call to group_pages_into_units
    src_a = inspect.getsource(generic_md_table_extractor.build_document_map)
    assert "group_pages_into_units" in src_a, (
        "PATH A (build_document_map) does not delegate to group_pages_into_units — "
        "dual-path drift detected"
    )
```

This test is PROVEN-RED against the current code (neither function calls `group_pages_into_units` yet) and PROVEN-GREEN after the change.

**Test CG-2 — Behavioral agreement: same input → same output:**

```python
def test_cg2_path_a_and_path_b_adapters_agree_on_standard_sequence():
    """
    Anti-drift gate: inject the SAME logical page sequence into both adapter
    entry-points and verify identical unit shapes are returned.
    Uses a synthetic 6-page sequence: [table, table, prose, blank, table, blank].
    Expected: 3 units — table(p1,p2), prose(p3), table(p5).
    p4 blank goes to pending_blanks and is discarded (no continuation after blank→next=blank).
    p6 blank is trailing — discarded.
    """
    # Build PATH A input (page_fingerprints-style)
    ...
    # Call _simulate_build_document_map_grouping(fingerprints) — new thin wrapper
    units_a = ...

    # Build PATH B input (pages_bboxes-style — use label integers)
    ...
    # Call _group_bboxes_into_units(pages_bboxes, page_dims)
    units_b = ...

    # Compare structural shapes (page membership, unit types)
    assert _units_to_comparable(units_a) == _units_to_comparable(units_b), (
        "PATH A and PATH B grouping outputs diverged on the same logical input — "
        "dual-path drift detected"
    )
```

This test PROVES AGREEMENT, not just import. A future change that correctly updates both paths passes both CG-1 and CG-2. A change that updates only one path fails CG-2 loudly.

**PROVEN-RED protocol for QA:**
- CG-1 PROVEN-RED: run against current code. Both `assert` statements must FAIL (neither calls `group_pages_into_units`).
- CG-2 PROVEN-RED: run against current code. `_group_bboxes_into_units` and `build_document_map` use different logic → different outputs for `[table, prose, table]` sequence (PATH B discards prose, PATH A emits it as unit).
- PROVEN-GREEN: run after the fix. Both pass.

---

## 5. DDD Layer Assignment

| Item | DDD Layer | File |
|------|-----------|------|
| `group_pages_into_units(pages, max_consecutive_table_pages)` | infrastructure | `infrastructure/unit_grouper.py` (NEW) |
| `_has_new_title(title_hints)` helper | infrastructure | `infrastructure/unit_grouper.py` (NEW, private) |
| `_CONTINUATION_MARKERS`, `_MAX_CONSECUTIVE_TABLE_PAGES` | infrastructure | `infrastructure/unit_grouper.py` (NEW) |
| `_group_bboxes_into_units` (thin adapter, delegates to `unit_grouper`) | infrastructure | `pek_engine_adapter.py` (modify) |
| `build_document_map` grouping loop (replace with `unit_grouper` call) | infrastructure | `generic_md_table_extractor.py` (modify) |
| `test_grouping_convergence.py` | — | `__tests__/unit/test_grouping_convergence.py` (NEW) |
| `extract_layout_first_usecase.py` | application | **0-diff** — receives same DocumentMap shape |
| `pek_engine_adapter.py` `_run_extraction` | infrastructure | **0-diff** — `_group_bboxes_into_units` signature unchanged |
| `text_table_extractor.py` | infrastructure | **0-diff** — explicitly out of scope |
| `PDF-Extract-Kit/` subtree | — | **PRISTINE** |

---

## 6. Files to Create / Modify

| File | Change |
|------|--------|
| `apps/pdf-extractor/infrastructure/unit_grouper.py` | NEW — `group_pages_into_units`, `_has_new_title`, constants |
| `apps/pdf-extractor/infrastructure/pek_engine_adapter.py` | `_group_bboxes_into_units`: replace 70-line algorithm with adapter (~15 lines) that converts `pages_bboxes` → `pages` list and calls `group_pages_into_units` |
| `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` | `build_document_map`: replace 30-line state-machine grouping loop (L2660-L2784 in d297f3ba version) with adapter (~10 lines) that converts `page_fingerprints` → `pages` list and calls `group_pages_into_units`. REMOVE: `_flush_unit` closure, `pending_blanks`, state vars, `_is_title_band`. KEEP: fingerprint pre-computation, `_fingerprints_continuous` (unused in hot path; available for future use). |
| `apps/pdf-extractor/__tests__/unit/test_grouping_convergence.py` | NEW — CG-1 (source-inspection gate) + CG-2 (behavioral agreement) |

**NOT modified (0-diff):**
- `apps/pdf-extractor/infrastructure/text_table_extractor.py`
- `apps/pdf-extractor/application/extract_layout_first_usecase.py`
- `apps/pdf-extractor/PDF-Extract-Kit/` subtree (PRISTINE — AC-PEK-0a)
- `apps/pdf-extractor/application/extract_tables_usecase.py`

---

## 7. Risk Flags

**R-1 — `_is_title_band` and d297f3ba tests become orphaned**

The test file `test_table_boundary_state_machine.py` (659 tests per TASKS.md) tests `_is_title_band` and the state machine that was added by d297f3ba. After this refactor:
- `_is_title_band` is removed from `generic_md_table_extractor.py` (replaced by `_has_new_title` in `unit_grouper.py` which operates on pre-extracted title strings rather than raw OCR text).
- Class C simulation tests (`_simulate_state_machine`) simulate the old PATH A loop which no longer exists verbatim.

Dev must decide: (a) delete `test_table_boundary_state_machine.py` entirely (it now tests removed code) and replace with `test_grouping_convergence.py` + `test_unit_grouper.py`; OR (b) update the simulations to delegate to `group_pages_into_units` directly.

**Architect recommendation: option (b) — update `test_table_boundary_state_machine.py` to test `group_pages_into_units` directly.** Class A and B tests (`_is_title_band`, `_fingerprints_continuous`) can be adapted to test `_has_new_title` + the equivalent in `unit_grouper`. This preserves the test investment while aligning tests with the new canonical implementation.

**R-2 — Blank-bridge semantics difference between old d297f3ba and new design**

The d297f3ba implementation bridged blanks only when the next non-blank page passed D-4 continuity (via `_fingerprints_continuous`). The new `group_pages_into_units` bridges blanks when the next non-blank page is also `"table"` type AND no title fires AND the 8-page cap is not hit. This is a semantic shift: adjacency-only bridging (no D-4 geometric check). This aligns with PATH B's existing behavior (which already used pure adjacency for PAGE-B comparison), is simpler, and removes the D-4 geometric check from PATH A. If geometric continuity is required in a future sprint, it can be added as an optional parameter to `group_pages_into_units` without breaking the current callers.

**R-3 — `generic_md_table_extractor.py` line-count after removal**

Removing the 124-line state machine added by d297f3ba (L2660-L2784 equivalent) reduces `generic_md_table_extractor.py` by ~80 lines (the `_is_title_band` helper, the closures, constants, and loop). This should bring it under the file-size cap. Dev must verify `wc -l` after the edit and confirm compliance with `docs/data/file-size-caps.json`.

**R-4 — `pek_engine_adapter.py` import of `unit_grouper`**

`pek_engine_adapter.py` will gain `from infrastructure.unit_grouper import group_pages_into_units`. This import must be verified at Docker build time (smoke gate). The existing Dockerfile smoke gate tests `import infrastructure.pek_engine_adapter` — because `unit_grouper.py` is a new file, dev must ensure it is included in the container image (it lives in the same `infrastructure/` directory that is already copied).

**R-5 — RC-1 and RC-2 invariants preserved**

The new `group_pages_into_units` preserves both RC invariants:
- RC-1 (no X-range threshold): the new function uses `page_type` from the page descriptor (derived from YOLO label or fingerprint) — no geometric threshold applied.
- RC-2 (no double-finalize on prose): prose pages open a prose unit (PROSE_OPEN state); `flush_unit` is only called when transitioning OUT of a state, not on entering a prose page from NO_TABLE.

---

## 8. Prototype Sketch — `unit_grouper.py`

For dev reference (NOT production code — dev implements from this spec):

```python
"""infrastructure/unit_grouper.py — Single canonical page grouping function."""
import uuid
from typing import Dict, List, Tuple

_CONTINUATION_MARKERS: Tuple[str, ...] = ("tiếp theo", "(continued)", "continued")
_MAX_CONSECUTIVE_TABLE_PAGES: int = 8


def _has_new_title(title_hints: List[str]) -> bool:
    for hint in title_hints:
        h = hint.strip()
        if not h:
            continue
        lower = h.lower()
        if any(m in lower for m in _CONTINUATION_MARKERS):
            continue
        return True
    return False


def group_pages_into_units(
    pages: List[Dict],
    max_consecutive_table_pages: int = _MAX_CONSECUTIVE_TABLE_PAGES,
) -> List[Dict]:
    """
    Group a list of page descriptors into logical units.

    Input page descriptor shape:
        {"page_num": int, "page_type": str, "title_hints": List[str]}
        page_type: "table" | "prose" | "blank"
        title_hints: pre-extracted title strings (empty list = no title signal)

    Returns list of unit dicts:
        {"unit_id": str, "schema_page": int, "pages": List[int], "page_type": str}
    """
    units: List[Dict] = []
    current_pages: List[int] = []
    current_type: str = "prose"
    pending_blanks: List[int] = []
    consecutive_table_count: int = 0
    state: str = "NONE"

    def flush() -> None:
        nonlocal current_pages, consecutive_table_count
        if not current_pages:
            return
        units.append({
            "unit_id": str(uuid.uuid4()),
            "schema_page": current_pages[0],
            "pages": list(current_pages),
            "page_type": current_type,
        })
        current_pages = []
        consecutive_table_count = 0

    for page in pages:
        pn = page["page_num"]
        pt = page.get("page_type", "prose")
        hints = page.get("title_hints", [])

        if pt == "blank":
            pending_blanks.append(pn)
            continue

        if state == "NONE":
            pending_blanks = []
            current_pages = [pn]
            current_type = pt
            state = "TABLE_OPEN" if pt == "table" else "PROSE_OPEN"
            if pt == "table":
                consecutive_table_count = 1

        elif state == "TABLE_OPEN":
            if pt == "prose":
                flush()
                pending_blanks = []
                current_pages = [pn]
                current_type = "prose"
                state = "PROSE_OPEN"
            else:  # table
                d5 = _has_new_title(hints)
                cap = consecutive_table_count >= max_consecutive_table_pages
                if d5 or cap:
                    flush()
                    pending_blanks = []
                    current_pages = [pn]
                    current_type = "table"
                    consecutive_table_count = 1
                    # state stays TABLE_OPEN
                else:
                    current_pages.extend(pending_blanks)
                    pending_blanks = []
                    current_pages.append(pn)
                    consecutive_table_count += 1

        elif state == "PROSE_OPEN":
            if pt == "table":
                flush()
                pending_blanks = []
                current_pages = [pn]
                current_type = "table"
                consecutive_table_count = 1
                state = "TABLE_OPEN"
            else:  # prose continues
                current_pages.extend(pending_blanks)
                pending_blanks = []
                current_pages.append(pn)

    flush()
    return units
```

---

## 9. Done-Bar (Anti-False-Green)

**Unit test gates (pre-production):**

1. CG-1 PROVEN-RED → PROVEN-GREEN: source-inspection assertions pass.
2. CG-2 PROVEN-RED → PROVEN-GREEN: behavioral agreement on `[table, prose, table]` — 3 units, both paths agree.
3. New `test_unit_grouper.py` (dev to write): covers all 7 page sequences from original BTB-ARCH brief (C-1 through C-7), plus the new prose-unit cases.
4. Existing `test_table_boundary_state_machine.py` tests updated to test `group_pages_into_units` directly: all must pass.
5. Existing `test_document_map.py` must all pass (fingerprint pre-computation path unchanged).

**Live done-bar (post-deploy — identical to BTB-ARCH brief § 5.2):**

- Sentinel A: FPT `e71f845d-ffa5-48f9-8f09-30ac2cd09c65` — direct DB query on `bctc_layout_units` confirms: at least one `page_type="prose"` unit exists, pages 7–9 in one table unit, total units >= 3.
- Sentinel B: ACB (or VCB/GAS/HPG) — at least 3 units, at least one prose unit, no prose page in any table unit's `page_numbers_json`.
- **PATH PROOF required**: log line `PekEngineAdapter._run_extraction` in the extraction log for the verified sentinels — confirms data came from PATH B, not PATH A.
- FORBIDDEN as sole gate: balance badge, unit test count, viewer screenshot.

---

## 10. Brownfield Scan Notes

- `pek_engine_adapter.py:541–610` — `_group_bboxes_into_units` is 70 lines. After the change it becomes ~15 lines (adapter only). Net reduction: ~55 lines.
- `generic_md_table_extractor.py` — the state machine added by d297f3ba runs from approximately L2660 to L2784 (124 lines including `_flush_unit`, `_is_title_band`, constants). After removal: ~80-line reduction. Line-count cap compliance must be verified post-edit.
- `unit_grouper.py` — estimated 60-70 lines (function + helper + constants). New file, no cap risk.
- `test_grouping_convergence.py` — estimated 80-100 lines. New file.
- No new Python package dependencies. No new Docker RUN instructions.

**Scan clean:** true. No DDD violations. All changes stay in infrastructure layer. Application layer (`extract_layout_first_usecase.py`) receives the same DocumentMap shape — zero interface change.
