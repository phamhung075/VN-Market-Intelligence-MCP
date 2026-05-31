# Architecture Brief — BCTC-TABLE-BOUNDARY Dual-Path Drift Convergence (BTB-DRIFT)

**Date:** 2026-05-30 | **Sprint:** BCTC-TABLE-BOUNDARY | **Task:** BTB-DRIFT
**Author:** architect
**Build standard:** lean (existing zone; no new service)
**Zone:** `apps/pdf-extractor/`

---

## 1. Brownfield Verification — Caller Map (Fail-Loud One-Pass)

### 1.1 PATH A — build_document_map / ExtractLayoutFirstUseCase

Every caller of `build_document_map` and `ExtractLayoutFirstUseCase` across the codebase:

| File | Lines | Role | Live? |
|---|---|---|---|
| `infrastructure/generic_md_table_extractor.py` | L2573 | definition | — |
| `main.py` | L31, L109 | imports + wires into `ExtractLayoutFirstUseCase` at composition root | WIRED |
| `application/extract_layout_first_usecase.py` | L151 | receives as `build_document_map_fn` callable | WIRED |
| `interface/handlers.py` | L359–395 | registers `POST /extract-layout-first` route; dispatches `_run_extract_layout_first` | WIRED |
| `__tests__/unit/test_document_map.py` | L23 | unit-tests `_fingerprints_continuous`, helper functions | TEST ONLY |
| `__tests__/unit/test_table_boundary_state_machine.py` | L23–26 | unit-tests `_is_title_band`, `_fingerprints_continuous`, simulates state machine loop | TEST ONLY |
| `infrastructure/eval_push_client.py` | L39 | doc-comment reference only — no import | DEAD REF |
| `scenarios/pek_single_doc_extraction.py` | L209, L584 | passes `extract_layout_first_usecase=None` in test app | TEST ONLY |

**The `/extract-layout-first` route is wired and reachable** — it is NOT dead. However, its ONLY live callers are historical ops signals:
- `docs/signals/processed/2026-05-26T210000Z-lf-extract-done-replay.json` (ops ran it once post-LF-DEPLOY)
- `docs/signals/processed/2026-05-26T19-36-19Z-lf-fix-done-replay.json` (ops ran a fix re-extraction)

The Sprint BCTC-LAYOUT-FIRST has `LF-EXTRACT` still open (`🔄` status, never closed). This means **PATH A / `/extract-layout-first` is a LIVE SPRINT ASSET, not dead code**. It cannot be deleted without closing or superseding BCTC-LAYOUT-FIRST. It is however **not user-reachable in the current BCTC extraction flow** — the live user path is exclusively PATH B via `/api/trigger-pek-extract`.

**Conclusion — PATH A status: LIVE SPRINT ASSET, NOT user-canonical.** `build_document_map` must NOT be deleted. It must be converged (shared core) so both paths remain consistent.

### 1.2 PATH B — _group_bboxes_into_units

| File | Lines | Role |
|---|---|---|
| `infrastructure/pek_engine_adapter.py` | L541–610 | definition (module-level function, not a method) |
| `pek_engine_adapter.py` `_run_extraction` | L751 | only caller in production: `units_in_map = _group_bboxes_into_units(pages_bboxes, page_dims)` |

PATH B has exactly ONE caller. It is the live user-facing grouper.

### 1.3 PO Trace Verified

PO code-trace confirmed correct on all points:
- PATH B calls `_group_bboxes_into_units` (L751), never `build_document_map`
- PATH A (handlers.py L388) dispatches `_run_extract_layout_first` → `extract_layout_first_usecase.execute()` → `build_document_map_fn(pages, pdf_path)` → the 5-state machine in `generic_md_table_extractor.py`
- The two paths share zero code at the grouping layer today

---

## 2. Root Cause Analysis — What PATH B Lacks

### 2.1 The 8-page Cap Problem

PATH B's `_MAX_CONSECUTIVE_TABLE_PAGES = 8` (L566) implements a blunt hard split:

```python
if len(current_unit_pages) >= _MAX_CONSECUTIVE_TABLE_PAGES:
    finalize_unit()
    current_unit_pages = [page_num]
```

**The cap fires on page-count alone, blind to content.** A real BCTC financial statement running 9 or 12 consecutive table pages is force-split at page 8. Conversely, two distinct tables each ≤8 pages are fused if no prose boundary separates them (no D-4 geometric continuity check, no D-5 title-band check).

This is the dual failure: over-split on long tables, under-split on same-layout adjacent tables.

### 2.2 Prose Units Never Emitted

PATH B's `finalize_unit` (L576–587) always appends `page_type: "table"`. The prose/blank branch (L593–597) calls `finalize_unit()` then `continue` — it discards the prose boundary rather than emitting a prose unit. This is RC-2 (correct for eliminating ghost units) but RC-2 also prevents prose-unit emission entirely.

### 2.3 Genuine-Continuation Predicate Missing

PATH B has no equivalent of `_fingerprints_continuous`. The geometry of adjacent table pages is never compared. The only split triggers are: prose/blank boundary OR page-count cap. Two geometrically distinct tables (different column layout, different gutter count) will be merged if they are consecutive and the total count is < 8.

---

## 3. Convergence Design — Option (a): Single Canonical Path

### 3.1 Shared Core Function — Extract

**Decision: extract a shared pure grouping function that BOTH paths call.**

Rationale: PATH A cannot be deleted (BCTC-LAYOUT-FIRST sprint open). Rewriting PATH B to call `build_document_map` is infeasible (PATH B operates on `pages_bboxes: Dict[int, List[Dict]]` from DocLayout-YOLO, not on OCR page-text dicts). A shared pure function that accepts a common page-descriptor interface is the only structurally sound option.

**New function:** `group_pages_into_units(page_sequence: List[PageDescriptor]) -> List[UnitDescriptor]`

**Location:** `apps/pdf-extractor/infrastructure/bctc_page_grouper.py` — new file, infrastructure layer (no domain imports; both callers are infrastructure).

**DDD layer:** infrastructure helper. No domain import, no infra-to-domain leak.

### 3.2 PageDescriptor Contract

```python
from dataclasses import dataclass
from typing import List, Optional

@dataclass
class PageDescriptor:
    page_num: int           # 1-indexed
    page_type: str          # "table" | "prose" | "blank"
    gutter_count: int       # 0 for prose/blank
    gutter_x_fractions: List[float]  # [] for prose/blank
    row_pitch: float        # 0.0 for prose/blank
    stored_text: str        # stored OCR text for D-5 title-band check

@dataclass
class UnitDescriptor:
    pages: List[int]
    page_type: str          # "table" | "prose"
    schema_page: int        # first page of the unit
```

### 3.3 State Machine — The 5-State Machine from PATH A, 8-Cap Replaced

The grouper implements PATH A's proven state machine exactly, replacing the 8-page cap:

```
States: NO_TABLE | TABLE_OPEN

Transitions:
  NO_TABLE + blank               → buffer pending_blanks; stay NO_TABLE
  NO_TABLE + prose               → open prose unit (or extend if _is_continuous); stay NO_TABLE
  NO_TABLE + table               → flush any open prose unit; open table unit; → TABLE_OPEN
  TABLE_OPEN + blank             → buffer pending_blanks; stay TABLE_OPEN
  TABLE_OPEN + prose             → discard pending_blanks; flush table unit; open prose unit; → NO_TABLE
  TABLE_OPEN + table (CONTINUE)  → drain pending_blanks into unit; extend; stay TABLE_OPEN
  TABLE_OPEN + table (NEW)       → discard pending_blanks; flush; open fresh table unit; stay TABLE_OPEN

CONTINUE predicate (_is_continuous):
  - gutter_count equal
  - each gutter_x_fraction within GUTTER_POSITION_TOLERANCE (5%)
  - row_pitch change ≤ ROW_PITCH_CHANGE_TOLERANCE (50%)
  - D-5: _is_title_band(stored_text) is False

8-PAGE CAP REPLACEMENT:
  The cap is replaced entirely by the CONTINUE predicate.
  A real >8-page table has identical geometry page-to-page → _is_continuous stays True → unit stays open → no force-split.
  Two distinct ≤8-page tables differ geometrically (gutter layout, column count) → _is_continuous returns False → TABLE_NEW transition → they split correctly.
```

**Why this is strictly better than the cap:** the cap is a proxy for "different table" that fails both ways (too aggressive on long tables, blind to same-size adjacent tables). The geometric predicate is the direct test for what the cap was approximating.

**Existing RC-1 wins preserved:** RC-1 eliminated the old X-range threshold (column-x shift threshold that fired on natural continuation variance). The new `_is_continuous` uses `GUTTER_POSITION_TOLERANCE=0.05` (5%) which must be calibrated to the same tolerance that RC-1 proved correct on real BCTC continuation pages. Dev must preserve this constant from the existing `_GUTTER_POSITION_TOLERANCE` in `generic_md_table_extractor.py` (currently 0.05 per the D-4 test fixtures). RC-2 (no ghost units from prose pages) is preserved by the NO_TABLE/TABLE_OPEN state design — prose pages NEVER create ghost double-finalize.

### 3.4 Prose Unit Emission

PATH B currently discards prose pages. The new grouper emits a `UnitDescriptor(page_type="prose")` for every prose boundary. Caller (PATH B) must translate this into the push payload:

```python
# For each UnitDescriptor from group_pages_into_units():
if desc.page_type == "prose":
    units_output.append({
        "unit_id": str(uuid.uuid4()),
        "stitched_markdown": "",
        "row_count": 0,
        "quarantined": False,
        "quarantine_reason": None,
        "page_row_spans": [{"page": p, "row_start": 0, "row_end": 0} for p in desc.pages],
    })
    # document_map unit:
    doc_map_units.append({
        "unit_id": unit_id,
        "schema_page": desc.schema_page,
        "pages": desc.pages,
        "page_type": "prose",
    })
```

The push handler (`pushBctcLayoutHandler.ts`) reads `page_type` from `document_map.units[*].page_type` (L168), not from the units array — it correctly persists whatever type is sent. Prose units with `page_type="prose"`, `row_count=0`, `stitched_markdown=""`, `quarantined=False` are written to `bctc_layout_units` as-is. No handler change required.

### 3.5 PATH B Adapter Wiring — What Changes in pek_engine_adapter.py

In `_run_extraction` (L698+):

1. After Step 1 (layout detection) produces `pages_bboxes: Dict[int, List[Dict]]`, build a `List[PageDescriptor]` by iterating `sorted(pages_bboxes.keys())`:
   - `page_type = "table"` if `any(b.get("label") == _LAYOUT_CLASS_TABLE for b in bboxes)`, `"blank"` if no bboxes, else `"prose"`
   - `gutter_count`, `gutter_x_fractions`, `row_pitch` are computed from the bboxes geometry (can reuse the simple fraction-of-width approach already in the column_gutters loop at L454–460)
   - `stored_text = ""` — PATH B does not fetch OCR text; D-5 is disabled for PATH B (pass empty string; `_is_title_band("")` returns False; D-5 silently no-ops). This is a deliberate PATH B limitation; D-5 can be enabled later if PATH B gains OCR text access.

2. Replace the `_group_bboxes_into_units(pages_bboxes, page_dims)` call (L751) with `group_pages_into_units(page_descriptors)` from the shared module.

3. Translate `List[UnitDescriptor]` → `List[Dict]` in the DocumentMap format (same keys as today: `unit_id`, `schema_page`, `pages`, `page_type`).

4. **Delete `_group_bboxes_into_units`** from `pek_engine_adapter.py` (the function at L541–610). It is replaced by the shared module call.

### 3.6 PATH A Adapter Wiring — What Changes in generic_md_table_extractor.py

PATH A (`build_document_map`) currently runs its own inline state machine at L2658–2791. Replace the state-machine body with a call to `group_pages_into_units()`:

1. After computing `page_fingerprints` (Step 1), build `List[PageDescriptor]` from the fingerprints:
   - `page_type` from `fp.get("page_type")`
   - `gutter_count`, `gutter_x_fractions`, `row_pitch` from fingerprint fields
   - `stored_text` from `page_text_by_num.get(page_num, "")` — PATH A HAS the OCR text, so D-5 IS active for PATH A

2. Call `group_pages_into_units(page_descriptors)` → `List[UnitDescriptor]`

3. Translate into the existing DocumentMap `units` list format (same keys as today).

4. `_flush_unit` (L2662–2685) is removed. The inline state variables (`state`, `pending_blanks`, `last_committed_d1_fp`, `current_unit_pages`, `current_fp`) are removed from `build_document_map`. The loop at L2711–2791 is replaced.

5. `_fingerprints_continuous` and `_is_title_band` remain in `generic_md_table_extractor.py` — they are still unit-tested directly from the test files that import them by name. The shared grouper imports them from there (or they are co-located in `bctc_page_grouper.py`).

**Recommendation on _fingerprints_continuous + _is_title_band location:** move them to `bctc_page_grouper.py` as the SSOT; re-export from `generic_md_table_extractor.py` via `from infrastructure.bctc_page_grouper import _fingerprints_continuous, _is_title_band` for backward import compatibility with the existing test imports. This keeps the test imports unchanged (zero test file edits) while making the grouper the SSOT.

---

## 4. Single Source of Truth — Structural Drift Prevention

### 4.1 One Grouping Implementation

After this change:
- `group_pages_into_units()` in `bctc_page_grouper.py` is the ONLY grouping implementation
- `_fingerprints_continuous` and `_is_title_band` live in `bctc_page_grouper.py`
- `_group_bboxes_into_units` in `pek_engine_adapter.py` is DELETED
- `build_document_map`'s inline state machine is REPLACED by a delegating call

It is **structurally impossible** for the two paths to diverge again: there is one function to change. Adding a third extraction path would require importing from `bctc_page_grouper.py` — the module name makes the dependency explicit.

### 4.2 Anti-Drift Guard Test

New test file: `apps/pdf-extractor/__tests__/unit/test_anti_drift_grouper.py`

**Test AD-1 — path-agreement (primary anti-drift guard):**
Build the SAME synthetic page sequence (e.g. `[table, prose, table, table]` with injected fingerprints). Feed it through:
- PATH A's `build_document_map` entry point via `_build_page_descriptors_from_fingerprints()` + `group_pages_into_units()`
- PATH B's descriptor builder + `group_pages_into_units()`

Assert that the resulting unit boundaries (pages list per unit, page_type per unit) are IDENTICAL. This test structurally proves single-implementation (both call the same function) and will catch any divergence if someone ever adds a second grouper.

**Test AD-2 — deleted function guard:**
Assert that `pek_engine_adapter` does NOT have `_group_bboxes_into_units` as an attribute:
```python
import infrastructure.pek_engine_adapter as pek_mod
assert not hasattr(pek_mod, "_group_bboxes_into_units"), (
    "Drift guard: _group_bboxes_into_units must be deleted after BTB-DRIFT. "
    "If this fails, someone re-introduced a second grouper."
)
```

**DV-1 and DV-2 must be ported to run through PATH B:**

**Test DV-1-B:** Feed `[table, prose, table]` descriptor sequence into `group_pages_into_units()`. Assert 3 units including a prose unit (same assertion as existing DV-1, now via the shared function that PATH B calls).

**Test DV-2-B:** Feed two table-type descriptors with a title-band text in descriptor[1].stored_text. Assert `_is_title_band` fires → 2 units. (PATH B has `stored_text=""` in production, so D-5 is silent; this test proves the mechanism works IF text is supplied, and is insurance for when PATH B gains OCR text.)

---

## 5. Prose Persistence End-to-End

Push handler (`pushBctcLayoutHandler.ts`) is confirmed path-agnostic and correct (idempotency fix `60dfac7f`):
- Reads `page_type` from `document_map.units[*]` (L168) — any string is accepted
- Inserts into `bctc_layout_units` with `page_type` column set to whatever was sent
- `row_count = 0`, `stitched_markdown = ""`, `quarantined = 0` for prose units are valid schema values
- DB-verified COUNT returned (`units_stored` = actual COUNT(*), not echo)

**No mcp-server changes required.** Prose units flow through the existing push contract unchanged.

---

## 6. Runtime Instrumentation — Preserved

Commit `b1e826c2` instrumentation (FAIL-LOUD `exc_info=True`, per-page heartbeat, 30-min timeout) lives in:
- `_run_pek_extract` (handlers.py L245–254) — FAIL-LOUD exc_info=True
- `extract_layout_and_tables` (pek_engine_adapter.py L678–696) — ThreadPoolExecutor + FuturesTimeoutError
- Heartbeat logs inside `_run_extraction`

None of these are touched by the convergence. The grouper replacement is internal to `_run_extraction` step 2 — the surrounding instrumentation is unchanged.

---

## 7. Done-Bar (Anti-False-Green)

Balance badge FORBIDDEN as sole gate per `project_bctc_table_sprint`.

**Single clean off-hours re-extraction** after this change deploys:
1. FPT sentinel `e71f845d`: expect ~7 table units + visible prose units in `bctc_layout_units` (page_type mix confirmed)
2. ACB sentinel: expect ~5 table units + prose units

**Verification must be:**
- DIRECT in-container market.db read: `bun -e "const db=new Database('/app/data/market.db'); console.log(db.query(\"SELECT page_type, COUNT(*) as n FROM bctc_layout_units WHERE report_id='e71f845d' GROUP BY page_type\").all())"`
- Content cross-check: boundary page numbers against the actual PDF page content (ops: compare `page_numbers_json` to known table ranges from prior manual review)
- PATH B proof: log line `PekEngineAdapter._run_extraction` must appear in the extraction logs for the verified rows — proving the rows came from the live path, not `build_document_map`

**No duplicate rows** (idempotency via DELETE-before-INSERT per `60dfac7f` — confirmed in handler L150–151).

---

## 8. Files to Create / Modify

### Create
| File | DDD Layer | Purpose |
|---|---|---|
| `apps/pdf-extractor/infrastructure/bctc_page_grouper.py` | infrastructure | SSOT: `PageDescriptor`, `UnitDescriptor`, `group_pages_into_units()`, `_is_title_band()`, `_fingerprints_continuous()` |
| `apps/pdf-extractor/__tests__/unit/test_anti_drift_grouper.py` | test | AD-1, AD-2, DV-1-B, DV-2-B |

### Modify
| File | Change |
|---|---|
| `apps/pdf-extractor/infrastructure/pek_engine_adapter.py` | Delete `_group_bboxes_into_units` (L541–610); replace L751 call with `group_pages_into_units()`; add PageDescriptor builder from bboxes |
| `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` | Replace state machine body in `build_document_map` with `group_pages_into_units()` delegating call; re-export `_fingerprints_continuous`, `_is_title_band` from `bctc_page_grouper` |
| `apps/pdf-extractor/__tests__/unit/test_table_boundary_state_machine.py` | DV-1 and DV-2 assertions already GREEN via `_simulate_state_machine` — ADD DV-1-B and DV-2-B via `group_pages_into_units()` directly (can be in new file) |

### Zero-diff (constraints)
| File | Reason |
|---|---|
| `apps/pdf-extractor/infrastructure/text_table_extractor.py` | 0-diff — constraint |
| `apps/pdf-extractor/PDF-Extract-Kit/` subtree | PRISTINE — constraint |
| `apps/mcp-server/` | No changes required |

---

## 9. Risk Flags

**R-1 — D-5 silent in PATH B production (by design):** PATH B does not fetch OCR text; `stored_text=""` disables D-5. Two geometrically identical consecutive tables without a prose boundary will NOT be split by D-5 in PATH B. Mitigation: the geometry predicate (D-4) handles this case when tables differ in column layout; same-geometry adjacent tables without prose remain a known limitation. Flag this in the dev handoff as a deferred improvement (PATH B OCR text access).

**R-2 — GUTTER_POSITION_TOLERANCE calibration:** PATH A uses `_GUTTER_POSITION_TOLERANCE = 0.05` (verified in test fixtures). PATH B's old cap had no threshold. Dev must use the same 0.05 constant in `bctc_page_grouper.py` and validate on the FPT + ACB sentinels during the done-bar extraction.

**R-3 — _is_title_band + _fingerprints_continuous re-export from generic_md_table_extractor.py:** Test files `test_document_map.py` and `test_table_boundary_state_machine.py` import these by name from `generic_md_table_extractor`. If moved to `bctc_page_grouper.py`, the re-export aliases must be present at the old import location. Dev must run all 659 existing tests before declaring GREEN.

**R-4 — prose pages in pages_bboxes:** DocLayout-YOLO returns a result dict for every page, including prose pages (non-table bboxes). The new PageDescriptor builder for PATH B must handle pages with bboxes but no table label (`_LAYOUT_CLASS_TABLE = 5`) — these are `page_type="prose"`, `gutter_count=0`, `gutter_x_fractions=[]`. The existing PATH B logic at L591–597 already classifies these correctly; the builder mirrors this logic.

**R-5 — 8-cap removal creates longer units on edge cases:** If a real BCTC document has 15+ consecutive pages that are all geometrically identical tables (same gutter layout, same pitch), they will now aggregate into one unit. This is CORRECT behavior — that IS one table. No regression risk; the old cap was the bug.

---

## 10. Build Standard

**BUILD-STANDARD: lean** (existing service, no new primitives beyond shared helper module)

---

## [Architect] Brownfield Findings

- **Zone:** `apps/pdf-extractor/`
- **Verified paths:**
  - `apps/pdf-extractor/infrastructure/pek_engine_adapter.py:541–610` — `_group_bboxes_into_units` (DELETE)
  - `apps/pdf-extractor/infrastructure/pek_engine_adapter.py:751` — only caller to replace
  - `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py:2573–2805` — `build_document_map` (replace state machine body with delegating call)
  - `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py:3056–3116` — `_is_title_band` (move to bctc_page_grouper.py, re-export)
  - `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py:3165–3234` — `_fingerprints_continuous` (move to bctc_page_grouper.py, re-export)
  - `apps/pdf-extractor/application/extract_layout_first_usecase.py` — no change; `build_document_map_fn` injection contract unchanged
  - `apps/pdf-extractor/interface/handlers.py:359–395` — `/extract-layout-first` route: no change (BCTC-LAYOUT-FIRST sprint asset, must stay wired)
  - `apps/mcp-server/src/interface/mcp/routes/pushBctcLayoutHandler.ts:162–181` — prose persistence: confirmed path-agnostic, no changes
- **Reuse patterns:**
  - `_GUTTER_POSITION_TOLERANCE`, `_ROW_PITCH_CHANGE_TOLERANCE`, `_CONTINUATION_MARKERS`, `_TITLE_BAND_SCAN_LINES`, `_TITLE_BAND_MIN_LEN`, `_TITLE_BAND_MAX_LEN`, `_MONEY_GROUP_RE` — all defined in `generic_md_table_extractor.py`; move to `bctc_page_grouper.py` as SSOT; re-import in `generic_md_table_extractor.py`
- **Design decisions:**
  - Shared infra module `bctc_page_grouper.py` (NOT domain — both callers are infra; avoids domain→infra coupling violation)
  - `_group_bboxes_into_units` DELETED from PATH B — single implementation enforced structurally
  - 8-page cap REPLACED by geometric `_is_continuous` predicate — structurally correct split criterion
  - prose units emitted in PATH B — push handler already accepts them (0-diff handler)
  - D-5 (`_is_title_band`) active in PATH A (has OCR text), silent in PATH B (no text, empty string passed; can be enabled later)
- **Scan clean:** true ✓
- **BUILD-STANDARD:** lean
