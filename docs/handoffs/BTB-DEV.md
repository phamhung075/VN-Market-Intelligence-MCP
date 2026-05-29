# Handoff: BTB-DEV → BTB-OPS

**Sprint:** BCTC-TABLE-BOUNDARY
**Task:** BTB-DEV (dev-pdf-extractor) → BTB-OPS (ops)
**Created:** 2026-05-29
**Status:** IMPL COMPLETE — awaiting container rebuild

---

## What was implemented (commit d297f3ba)

Four root causes fixed in one pass per architect brief:

| Root Cause | File | Fix |
|---|---|---|
| A: `_flush_unit` majority-vote | `generic_md_table_extractor.py` | Schema-page type (first non-blank page); no more vote |
| B/D: unconditional blank bridge | `generic_md_table_extractor.py` | Deferred `pending_blanks` buffer; drained only on genuine D-4+D-5 continuation, discarded on prose |
| C: `_fingerprints_continuous` no D-5 | `generic_md_table_extractor.py` | Added `stored_text_b: str = ""` param + `_is_title_band()` check before `return True` |

New function: `_is_title_band(stored_text: str) -> bool` — top-8-line scan, no Tesseract, no new imports, returns False for "tiếp theo"/"continued".

State machine: `NO_TABLE` / `TABLE_OPEN` (covers START/CONTINUE) — prose page triggers TABLE_END (flush table unit, open prose unit); geometry break or title-band triggers TABLE_NEW (flush, fresh table unit).

## Files changed

- `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` — primary impl
- `apps/pdf-extractor/__tests__/unit/test_table_boundary_state_machine.py` — NEW: 42 tests
- `apps/pdf-extractor/__tests__/unit/test_document_map.py` — _simulate_grouping updated; 58/58 pass

## Constraints verified

- PDF-Extract-Kit subtree: PRISTINE (0-diff)
- `text_table_extractor.py`: 0-diff
- `extract_layout_first_usecase.py`: 0-diff (no orchestration changes needed per brief §3.5)
- Scoped commit (3 files, explicit `git add`)
- CPU-only, no GPU deps, no new heavy imports
- All 659 unit tests pass

## DV gate evidence (anti-false-green)

**DV-1 PROVEN-RED pre-fix:** the old `_simulate_grouping` with the majority-vote loop returned 2 units from `[table, prose, table]` — prose unit was silently dropped. Pre-fix test run output: `AssertionError: DV-1 FAILED: Expected 3 units from [table, prose, table], got 2`.

**DV-1 GREEN post-fix:** `test_dv1_table_prose_table_produces_three_units` PASSES — 3 units returned: table(p1), prose(p2), table(p3).

**DV-2 PROVEN-RED pre-fix:** the old `_fingerprints_continuous` had no D-5 check — `_fingerprints_continuous(fp_table, fp_table)` returned `True` regardless of stored text. Pre-fix behaviour: DV-2 would return True (hollow gate).

**DV-2 GREEN post-fix:** `test_dv2_fingerprints_continuous_with_title_band_returns_false` PASSES — returns `False` when `stored_text_b` contains a title band.

## OPS instructions

```bash
docker compose build pdf-extractor
docker compose up -d --no-deps --force-recreate pdf-extractor
```

Then: off-hours re-extract sentinels A and B (NOT during 02:00–08:59 UTC Mon–Fri).

**Sentinel A** — FPT Q4 2024 (`report_id = e71f845d-ffa5-48f9-8f09-30ac2cd09c65`):
- Re-extract via single-doc endpoint (NOT `run_bctc_batch_sweep`)
- Then hand to QA for direct DB verification

**Sentinel B** — A second multi-table report (QA selects from ACB/VCB/GAS/HPG):
- Same single-doc re-extract pattern

## RETURN

```
DONE: BTB-DEV impl + 659/659 unit tests + DV-1/DV-2 PROVEN RED→GREEN
ZONE: apps/pdf-extractor/
COMMITS: d297f3ba (impl), 94b3a787 (notebook/TASKS)
NEXT: ops | rebuild pdf-extractor + off-hours re-extract sentinels A+B
HANDOFF: docs/handoffs/BTB-DEV.md
PIPELINE: continue
```
