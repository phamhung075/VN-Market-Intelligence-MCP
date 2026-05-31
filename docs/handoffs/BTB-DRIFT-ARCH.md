# Handoff: BTB-DRIFT-ARCH → BTB-DRIFT-DEV

**Sprint:** BCTC-TABLE-BOUNDARY
**Task:** BTB-DRIFT-ARCH (architect) → BTB-DRIFT-DEV (dev-pdf-extractor)
**Created:** 2026-05-30
**Status:** DESIGN COMPLETE

---

## [Architect] Brownfield Findings

- **Zone:** `apps/pdf-extractor/`
- **BUILD-STANDARD:** lean (existing service; no new ports, no new use case)

### Path Trace Confirmed

PO's path trace is **fully confirmed** by direct code read:

- **PATH B = LIVE canonical path**: `POST /pek-extract` → `_run_pek_extract` (handlers.py:193) → `pek_adapter.extract_layout_and_tables()` → `_group_bboxes_into_units` (pek_engine_adapter.py:541). This is what the user exercises via `/api/trigger-pek-extract`.
- **PATH A = live route, functionally orphaned from user trigger**: `POST /extract-layout-first` is registered and wired in `main.py:106-112` but is NEVER called by the current user trigger chain. `scenarios/pek_single_doc_extraction.py` explicitly passes `extract_layout_first_usecase=None`, confirming it is not the PEK test path either.
- **Kill-vs-delegate verdict: DELEGATE (not kill).** `/extract-layout-first` route remains registered. Its Tier 0-3 Tesseract pipeline + eval push must be preserved. Strategy: PATH A delegates grouping to the same function PATH B calls — single implementation, two callers.

### Files in Scope

| File | Change |
|------|--------|
| `apps/pdf-extractor/infrastructure/unit_grouper.py` | **NEW** — canonical `group_pages_into_units` function |
| `apps/pdf-extractor/infrastructure/pek_engine_adapter.py` | MODIFY — `_group_bboxes_into_units` replaced with ~15-line adapter |
| `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` | MODIFY — `build_document_map` grouping loop replaced with ~10-line adapter; `_flush_unit` closure + `_is_title_band` + state-machine constants REMOVED |
| `apps/pdf-extractor/__tests__/unit/test_grouping_convergence.py` | **NEW** — CG-1 (source inspection) + CG-2 (behavioral agreement) anti-drift gate |
| `apps/pdf-extractor/__tests__/unit/test_table_boundary_state_machine.py` | MODIFY — update Class C simulation to test `group_pages_into_units` directly; update Class A to test `_has_new_title` from `unit_grouper` |

### Files NOT in Scope (0-diff)

- `apps/pdf-extractor/infrastructure/text_table_extractor.py`
- `apps/pdf-extractor/application/extract_layout_first_usecase.py` — DocumentMap shape unchanged
- `apps/pdf-extractor/PDF-Extract-Kit/` — PRISTINE (AC-PEK-0a)
- `apps/pdf-extractor/application/extract_tables_usecase.py`

### Verified Live Paths

- `pek_engine_adapter.py:541–610` — `_group_bboxes_into_units`: 70-line algorithm; replaced by ~15-line adapter → `unit_grouper.group_pages_into_units`
- `pek_engine_adapter.py:751` — only call site of `_group_bboxes_into_units`; signature unchanged after refactor
- `generic_md_table_extractor.py:2573` — `build_document_map`; grouping loop replaced; fingerprint pre-computation and post-grouping code untouched
- `interface/handlers.py:193,219` — `_run_pek_extract` is the live PATH B trigger; no change
- `interface/handlers.py:158,395` — `_run_extract_layout_first` / `POST /extract-layout-first` is PATH A; no change

### Reuse Patterns

- `_LAYOUT_CLASS_TITLE = 0` (already in `pek_engine_adapter.py`) — reused in PATH B adapter to extract title hints from YOLO bboxes
- `page_fingerprints[pn].get("unit_hints", [])` (already computed in `build_document_map`) — reused in PATH A adapter as `title_hints`
- `uuid.uuid4()` + existing unit dict shape (`unit_id`, `schema_page`, `pages`, `page_type`) — unchanged in `unit_grouper` output

### Scan Clean

true — no DDD violations. All changes stay in infrastructure layer. Application layer untouched. `unit_grouper` → no domain imports, no external I/O, no model dependency.

---

## Design Summary

Full brief: `docs/architecture-briefs/2026-05-30-btb-drift-convergence.md`

### Root Cause of Drift

`build_document_map` (PATH A, `generic_md_table_extractor.py`) and `_group_bboxes_into_units` (PATH B, `pek_engine_adapter.py`) are two independent grouping implementations. The BTB-ARCH state machine was applied to PATH A only. PATH B's existing RC-1/RC-2 fixes (prose-as-boundary, adjacency-only continuity) already produce correct table span boundaries for the BCTC documents tested — but prose units are silently discarded (BLOCKING-2).

### Gaps in PATH B

1. **BLOCKING-2 — prose unit emission**: prose pages trigger `finalize_unit()` (correct) but the prose page itself is thrown away (`current_unit_pages = []`). Must emit a prose unit.
2. **Blank bridge gap**: `[table, blank, table]` produces two table units (blank triggers finalize). Should bridge when next page is a compatible table.
3. **D-5 title-band signal**: two consecutive table pages where the second has a YOLO title bbox should split. Title text is already detected by DocLayout-YOLO (label=0); just needs to be used.

### Solution: `infrastructure/unit_grouper.py` (single canonical function)

`group_pages_into_units(pages: List[Dict], max_consecutive_table_pages: int = 8) -> List[Dict]`

Input page descriptor: `{"page_num": int, "page_type": str, "title_hints": List[str]}`

State machine: `NONE` → `TABLE_OPEN` | `PROSE_OPEN`. Deferred blank buffer (`pending_blanks`). Title-band signal via `_has_new_title(title_hints)`. 8-page cap preserved.

Both PATH A and PATH B become thin adapters that:
1. Convert their native page representation to the `pages` list format.
2. Call `group_pages_into_units(pages)`.
3. Return the result (unit dict shape is identical to both existing return shapes).

### Anti-Drift Gate: `test_grouping_convergence.py`

- **CG-1** (source inspection): asserts both `_group_bboxes_into_units` and `build_document_map` source code contain the string `"group_pages_into_units"`. PROVEN-RED before fix, GREEN after.
- **CG-2** (behavioral agreement): injects same logical page sequence into both PATH A and PATH B adapters; asserts identical unit output. PROVEN-RED before fix (PATH B discards prose, PATH A emits it), GREEN after.

### RC-1 / RC-2 Invariants Preserved

- RC-1 (no X-range threshold): `group_pages_into_units` uses `page_type` + title hints — no geometric threshold.
- RC-2 (no double-finalize): prose pages open a PROSE_OPEN unit; flush only on state transition.
- 8-page cap: `consecutive_table_count >= max_consecutive_table_pages` check preserved.

### BLOCKING-2 Fix

`group_pages_into_units` emits prose units (`page_type="prose"`) for prose pages. PATH B's `_run_extraction` result will now include prose units in `units_in_map`. mcp-server push handler stores them without schema change.

---

## Test Mandate

### New: `test_grouping_convergence.py`

- CG-1: PROVEN-RED → GREEN (source inspection)
- CG-2: PROVEN-RED → GREEN (behavioral agreement, `[table, prose, table]` → 3 units both paths)

### New: `test_unit_grouper.py` (dev to write)

Cover all 7 page sequences from BTB-ARCH brief (C-1 through C-7) plus:
- Prose unit emission: `[table, prose]` → 2 units including 1 prose unit
- Blank bridge: `[table, blank, table]` → 1 table unit (blank bridged)
- 8-page cap split: `[table × 9]` → 2 units (cap at 8)
- Trailing blank: `[table, blank]` → 1 table unit (trailing blank discarded)

### Updated: `test_table_boundary_state_machine.py`

- Class C: update `_simulate_state_machine` to call `group_pages_into_units` directly.
- Class A: adapt to test `_has_new_title` from `unit_grouper` (replaces `_is_title_band`).
- Class B: `_fingerprints_continuous` tests remain valid (function still exists in `generic_md_table_extractor.py`, backward-compat); can be kept as-is.

### Existing: `test_document_map.py`

Must all pass. `build_document_map` output shape is unchanged. `_fingerprints_continuous` (with `stored_text_b` param) remains in file — existing tests unaffected.

---

## Done-Bar

**Unit gates (pre-deploy):**
1. CG-1 PROVEN-RED → GREEN
2. CG-2 PROVEN-RED → GREEN
3. `test_unit_grouper.py` all pass
4. Updated `test_table_boundary_state_machine.py` all pass
5. Existing `test_document_map.py` all pass

**Live gates (post-ops-rebuild — same sentinels as BTB-ARCH):**
- Sentinel A: FPT `e71f845d` — at least one `page_type="prose"` unit in DB + pages 7–9 in one table unit + total units >= 3.
- Sentinel B: ACB — at least 3 units, at least one prose unit, no prose page in table unit's `page_numbers_json`.
- PATH PROOF: extraction log must contain `PekEngineAdapter._run_extraction` for the verified report IDs.
- FORBIDDEN as sole gate: balance badge, unit test count, viewer screenshot.

---

## Constraints

- `text_table_extractor.py`: 0-diff.
- `PDF-Extract-Kit/` subtree: PRISTINE (AC-PEK-0a).
- CPU-only / 8GB Docker cap.
- Main branch only. Scoped commits (explicit-file staging).
- Re-extraction off-hours: never `02:00–08:59 UTC Mon–Fri`.
- ops MUST rebuild after commit: `docker compose build pdf-extractor && docker compose up -d --no-deps --force-recreate pdf-extractor`.

---

## RETURN

```
DONE: Convergence design complete. PATH A caller map confirmed. Shared grouper module designed.
      Anti-drift gate spec with PROVEN-RED protocol ready.
ZONE: apps/pdf-extractor/
NEXT: dev-pdf-extractor | implement BTB-DRIFT-DEV per brief + handoff
HANDOFF: docs/handoffs/BTB-DRIFT-ARCH.md
BRIEF: docs/architecture-briefs/2026-05-30-btb-drift-convergence.md
PIPELINE: continue
```
