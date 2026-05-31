# Handoff: BTB-ARCH → BTB-DEV

**Sprint:** BCTC-TABLE-BOUNDARY
**Task:** BTB-ARCH (architect) → BTB-DEV (dev-pdf-extractor)
**Created:** 2026-05-29
**Status:** DESIGN COMPLETE

---

## [Architect] Brownfield Findings

- **Zone:** `apps/pdf-extractor/`
- **BUILD-STANDARD:** lean (existing service; no new ports, no new use case)
- **Files in scope:**
  - `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` — primary change target (L2641–L2689 loop + L3000–L3049 continuity + new helper)
  - `apps/pdf-extractor/__tests__/unit/test_table_boundary_state_machine.py` — NEW test file (DV-1/DV-2 + all transition predicates)
  - `apps/pdf-extractor/__tests__/unit/test_document_map.py` — minor extension (add stored_text_b to `_simulate_grouping`)
- **Files NOT in scope (0-byte-diff):**
  - `apps/pdf-extractor/application/extract_layout_first_usecase.py`
  - `apps/pdf-extractor/infrastructure/text_table_extractor.py`
  - `apps/pdf-extractor/PDF-Extract-Kit/` (PRISTINE)

- **Verified paths:**
  - `generic_md_table_extractor.py:2641` — `_flush_unit` majority-vote (ROOT CAUSE A)
  - `generic_md_table_extractor.py:2664` — unconditional blank bridge (ROOT CAUSE D)
  - `generic_md_table_extractor.py:2660–2689` — main loop to be replaced with state machine
  - `generic_md_table_extractor.py:3000–3049` — `_fingerprints_continuous` missing D-5 check (ROOT CAUSE C)
  - `__tests__/unit/test_document_map.py` — existing pure-function tests; backward-compatible with new `stored_text_b` param

- **Reuse patterns:**
  - `_MONEY_GROUP_RE` (L139) — already compiled; reuse in `_is_title_band`
  - `re` module — already imported; no new imports needed
  - `_extract_unit_hints` pattern (L2926) — similar top-line scan; `_is_title_band` must be a SEPARATE function (different purpose: decision vs metadata)

- **Scan clean:** true — no DDD violations in proposed design; all changes stay in infrastructure layer; application layer untouched.

---

## Design Summary

Full brief: `docs/architecture-briefs/2026-05-29-bctc-table-boundary.md`

### Four root causes (all in one pass):

| # | Location | Bug |
|---|---|---|
| A | `_flush_unit` L2641–L2658 | Majority-vote page_type swallows prose pages into table unit |
| B-1 | blank bridge L2664 | Blank bridge can absorb prose page before `_fingerprints_continuous` sees it |
| B-2 | `_fingerprints_continuous` L3000 | No intervening-prose state tracking |
| C | `_fingerprints_continuous` L3000 | No D-5 title-band check |
| D | blank bridge L2664 | Unconditional bridge — no far-side page-type lookahead |

### Three code changes + one new function:

1. **`_flush_unit`:** Replace majority-vote with schema-page-type lookup (5-line replacement).
2. **`build_document_map` main loop (L2660–L2689):** Replace 30-line sequential loop with state-machine loop using `pending_blanks` deferred buffer.
3. **`_fingerprints_continuous`:** Add `stored_text_b: str = ""` optional param; add `_is_title_band(stored_text_b)` check before `return True`.
4. **`_is_title_band(stored_text: str) -> bool`:** New helper. Top-8-line scan for non-numeric standalone title; returns `False` for `"tiếp theo"`/continuation markers.

### Test mandate:

- New `test_table_boundary_state_machine.py`: 3 test classes (A: `_is_title_band`, B: `_fingerprints_continuous` with text, C: state-machine simulation).
- DV-1 (`[table, prose, table]` → 3 units): must be RED pre-fix, GREEN post-fix.
- DV-2 (`_fingerprints_continuous` with title-band text → `False`): must be RED pre-fix, GREEN post-fix.
- Existing `test_document_map.py` must all still pass (backward-compat check).

### Done-bar (direct DB, anti-false-green):

- Sentinel A: FPT `e71f845d-ffa5-48f9-8f09-30ac2cd09c65` — pages 7–9 in one table unit; at least one prose unit visible; total units >= 3.
- Sentinel B: second document (ACB/VCB/GAS/HPG) — at least 3 units; no prose page in any table unit's `page_numbers_json`.
- FORBIDDEN as sole gate: balance badge, unit test count, viewer screenshot.

### Constraints:

- Main branch only. Scoped commits (explicit-file staging).
- Re-extraction OFF-HOURS: never `02:00–08:59 UTC Mon–Fri`.
- CPU-only / 8GB Docker cap / no GPU deps.
- ops MUST rebuild: `docker compose build pdf-extractor && up -d --no-deps --force-recreate`.

---

## RETURN

```
DONE: Technical design complete, brownfield findings and state-machine blueprint written.
ZONE: apps/pdf-extractor/
NEXT: dev-pdf-extractor | implement BTB-DEV per brief + spec
HANDOFF: docs/handoffs/BTB-ARCH.md
BRIEF: docs/architecture-briefs/2026-05-29-bctc-table-boundary.md
PIPELINE: continue
```
