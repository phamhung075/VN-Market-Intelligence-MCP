# PEK-MULTIPAGE — Root-Cause Brief

**Date:** 2026-05-27T17:41Z
**Escalation:** G9 REJECTED — recurring-bug escalation (4 fix commits on pdf-extractor: 9ab93889, 6c124745, e6b84ca5, 8535b175). This is a different class of defect from OCR text quality. Design only; dev implements.
**Report sentinel:** FPT Q4 2025 — `e71f845d-ffa5-48f9-8f09-30ac2cd09c65`
**Zone:** `apps/pdf-extractor/` (single zone)
**BUILD-STANDARD:** not-applicable (bug-fix)

---

## §1 — Escalation Context

User observation (verbatim): "i see zone is display but if you see page 3 4 5 on bctc fpt, you see only 1 page is export table, need review for fix this issue"

Interpretation: DocLayout-YOLO layout detection IS working — zone overlay is visible across multiple pages in the dashboard. But only ONE page's table content is shown in the exported/persisted output per financial-statement unit. Multi-page financial statements collapse to a single-page table.

This is a PAGE-COVERAGE defect — a different class from the OCR text quality fixes (9ab93889/6c124745/e6b84ca5/8535b175). Those fixes confirmed non-empty Vietnamese text per cell. This defect is about how many pages contribute table rows.

---

## §2 — BACKEND vs FRONTEND Verdict

**VERDICT: BACKEND. The defect is fully in the extraction pipeline before data reaches the DB.**

### Evidence (live DB query, 2026-05-27T17:41Z)

Query: `bctc_layout_units` grouped by schema_page for FPT `e71f845d`:

```
schema_page | page_numbers_json  | page_type | row_count | md_len
-----------   ------------------   ---------   ---------   ------
5           | [5]                | table     | 2         | 1906
7           | [7]                | table     | 2         | 1164
8           | [8]                | table     | 2         | 1670
9           | [9]                | table     | 2         | 122
16          | [16]               | table     | 2         | 50
22          | [22,23]            | table     | 2         | 2803
27          | [27,28]            | table     | 2         | 2822
30          | [30,31]            | table     | 3         | 2297
42          | [42,43,44,45,46]   | table     | 7         | 14638
... (23 units with non-zero md_len)
```

`bctc_page_zones` table: 30 pages classified as `page_type=table` across pages 5, 7, 8, 9, 16, 22-46. Zone detection is correct and persisted correctly — the overlay works because zone data IS in the DB.

`bctc_table_rows` table: rows only on pages 4, 5, 6, 7 (populated by the legacy `text_table_extractor.py` path, unrelated to PEK).

**Conclusion:** The DB holds layout data for all 30 table pages. The overlay is correct. The "only 1 page exported table" is NOT a frontend display bug. The problem is that `bctc_layout_units.stitched_markdown` for table units contains content from only a small slice of a financial statement — each PEK unit covers at most 1-5 pages, producing 2-7 rows. A real BCTC balance sheet spans 3-5 consecutive pages and should contribute 30-80 structured rows. The multi-page stitching in `_assemble_unit_markdown` is executing correctly on the data it receives, but the data it receives is structurally broken.

---

## §3 — Root Cause: Precise Location

### §3.1 — Primary: Unit grouping ignores financial-statement continuity

**File:** `apps/pdf-extractor/infrastructure/pek_engine_adapter.py`
**Function:** `_group_bboxes_into_units` (lines 521–603)

The grouping algorithm uses table-bbox X-range overlap as the SOLE continuity signal:

```python
shift_left = abs(cur_x_range[0] - prev_table_x_range[0]) / max(width_px, 1)
shift_right = abs(cur_x_range[1] - prev_table_x_range[1]) / max(width_px, 1)
if shift_left > 0.10 or shift_right > 0.10:
    # New unit — finalize and start fresh
```

FPT BCTC table pages: the balance sheet, income statement, and cash-flow statement each span 2-5 consecutive pages. On each page, DocLayout-YOLO detects the same table region at approximately the same X range. However, BCTC pages frequently have:
- Header rows repeated on continuation pages (shifts column header bbox position slightly)
- Footer/signature area added to last page of each statement (shifts table's X_max)
- Indented sub-item rows (shifts X_min by glyph-level amount)

Any of these changes exceeds the 10% threshold → the algorithm starts a NEW unit even when the table is the SAME financial statement continuing across the page boundary. Result: a 3-page balance sheet becomes 3 single-page units, each with 2 markdown rows instead of one combined unit with 30+ rows.

**Additional defect in the same function (lines 562-569):**

```python
if not table_bboxes:
    # Prose or blank page — finalize current unit, start new prose unit
    finalize_unit()
    current_unit_pages = [page_num]
    prev_table_x_range = None
    finalize_unit()             # ← double finalize: creates empty "prose" unit
    current_unit_pages = []
    prev_table_x_range = None
    continue
```

Each prose page triggers `finalize_unit()` TWICE. On the first call, `current_unit_pages = [page_num]` (the prose page), so an extra unit is created for the prose page itself. On the second call, `current_unit_pages = []`, so `finalize_unit()` skips (the guard `if current_unit_pages` stops it). But the first call already created an unwanted unit. This is the **ghost-unit accumulation** defect. Evidence: the DB has 78 total `bctc_layout_units` rows for FPT (2 per schema_page for every page — one "populated" unit from the PEK engine output, one "ghost" empty unit from the prose-page double-finalize), and each schema_page appears exactly twice with one having zero `md_len` and one with content.

### §3.2 — Secondary: Single-page extraction loop in `_run_table_extraction`

**File:** `apps/pdf-extractor/infrastructure/pek_engine_adapter.py`
**Function:** `_run_table_extraction` (lines 902–1032)

This function loops over `pages_bboxes` and processes each page independently:

```python
for page_num in sorted(pages_bboxes.keys()):
    ...
    result[page_num] = region_cells
```

The output is `{page_num: {region_idx: [cells]}}`. This is correct per-page data. The problem is consumed downstream in `_assemble_unit_markdown`.

**File:** `apps/pdf-extractor/infrastructure/pek_engine_adapter.py`
**Function:** `_assemble_unit_markdown` (lines 1034–1061)

```python
for page_num in sorted(pages_in_unit):
    cells_by_region = table_cells_by_page.get(page_num, {})
    ...
```

This correctly iterates over all pages in a unit. But because `_group_bboxes_into_units` produces single-page units, `pages_in_unit` is always `[N]` for a single page. There is no bug here — it correctly assembles all pages in the unit. The defect upstream means units never contain multiple consecutive table pages.

### §3.3 — Tertiary: False-green QA metric

The prior QA check ("23/23 non-empty units") is page-blind. It counts `bctc_layout_units` rows where `length(stitched_markdown) > 0` and confirms each is non-empty. This passes even when each unit covers only 1 page. A real 46-page BCTC with 30 table pages should produce 4-6 multi-page units (one per financial statement section), not 23 single-page units. The 23/23 metric never caught the coverage gap.

---

## §4 — Root Cause Classification

| # | Location | Type | Severity |
|---|----------|------|----------|
| RC-1 | `_group_bboxes_into_units` X-range threshold logic | STRUCTURAL — algorithm incapable of grouping multi-page financial tables | CRITICAL |
| RC-2 | `_group_bboxes_into_units` double `finalize_unit()` on prose pages | LOGIC BUG — creates ghost empty units, doubles unit count | HIGH |
| RC-3 | QA metric "non-empty units" is page-blind | TEST GAP — never validates per-page row coverage | HIGH |

---

## §5 — Fix Design

### §5.1 — Rewrite `_group_bboxes_into_units`

The X-range heuristic is not fit for financial documents. BCTC statements have consistent table structure across continuation pages with natural variance that exceeds 10%. Replace with a vertical-continuity heuristic:

**New algorithm:**

```
For each page N (ascending):
  If page N has table bboxes:
    If current_unit is empty OR previous page was also a table page:
      → Extend current unit (append page N)
    Else (gap — previous page was prose/blank):
      → Finalize current unit, start new unit with page N
  Else (prose/blank):
    → Finalize current unit if non-empty
    → Mark prev_was_table = False
    → Do NOT create a unit for prose pages (drop the double-finalize)
```

The key insight: financial statement continuation is signalled by consecutive table pages. A prose page (notes, signatures, cover) acts as a statement boundary. This replaces the fragile X-range comparison with page-adjacency logic that is resistant to column-header shifts, indentation variance, and footer-bbox drift.

**Additional guard — maximum unit depth:** A single financial statement rarely exceeds 8 pages. Cap at 8 consecutive table pages before forcing a unit boundary, to prevent runaway grouping on edge-case documents.

**Result for FPT Q4 2025:** pages 5, 7-9 become individual units (separated by page 6 prose); pages 22-46 become correctly grouped multi-page units separated by prose boundaries. Balance sheet (pages 5-6 with prose separator → pages 5 standalone), income statement (pages 7-9 → one 3-page unit), and notes (pages 22-46 → grouped by prose separators) all gain correct coverage.

### §5.2 — Fix double `finalize_unit()` on prose pages

In the rewritten function, prose pages never create units. The double-finalize is eliminated entirely by the new algorithm. No separate fix needed — it is structurally eliminated.

### §5.3 — Exact change-list (ONE commit, ONE file)

**`apps/pdf-extractor/infrastructure/pek_engine_adapter.py`** — replace `_group_bboxes_into_units` function body only. Function signature UNCHANGED (same parameters, same return type). Internal logic rewritten.

No other files.

---

## §6 — Acceptance Contract (QA — page-blind false-green prevention)

The prior "23/23 non-empty units" check is INSUFFICIENT and must be replaced by the following contract. QA MUST run ALL three checks. Any individual check failure = overall FAIL.

### Gate A — Per-page row-count assertion (replaces "non-empty units" check)

```sql
SELECT pz.page_number, pz.page_type, lu.unit_id,
       lu.row_count, LENGTH(lu.stitched_markdown) AS md_len,
       lu.page_numbers_json
FROM bctc_page_zones pz
JOIN bctc_layout_units lu
  ON lu.report_id = pz.report_id
  AND lu.page_numbers_json LIKE '%' || pz.page_number || '%'
WHERE pz.report_id = 'e71f845d-ffa5-48f9-8f09-30ac2cd09c65'
  AND pz.page_type = 'table'
ORDER BY pz.page_number;
```

**Pass condition:** Every `page_type='table'` page in `bctc_page_zones` MUST appear in at least one `bctc_layout_units` row where `LENGTH(stitched_markdown) > 0`. A table page with zero md_len in all its units = FAIL.

### Gate B — Multi-page unit coverage for consecutive table runs

**REVISED 2026-05-27 by Architect (PEK-QA-ADJUDICATE):** The original `row_count >= 10` threshold is INCORRECT for this markdown structure. `row_count = stitched_md.count("\n")` counts newline boundaries between top-level pipe-table blocks (one per page), not financial line items. A 3-page unit has `row_count=3` regardless of how many financial items it contains. The correct gate asserts on `LENGTH(stitched_markdown)` — a 3-page FPT income statement with ~36 financial items produces ~2000-3000 bytes; an empty or broken stitch collapses to < 200 bytes.

For FPT sentinel specifically: pages 7, 8, 9 are three consecutive table pages (separated by prose page 6 and prose page 10). After the fix, these three pages MUST appear together in a SINGLE `bctc_layout_units` row. Content must be substantively present (`md_len >= 1000` for a 3-page financial statement).

```sql
SELECT unit_id, page_numbers_json, row_count, LENGTH(stitched_markdown) AS md_len
FROM bctc_layout_units
WHERE report_id = 'e71f845d-ffa5-48f9-8f09-30ac2cd09c65'
  AND page_type = 'table'
  AND page_numbers_json LIKE '%"7"%'
  AND page_numbers_json LIKE '%"8"%'
  AND page_numbers_json LIKE '%"9"%'
  AND LENGTH(stitched_markdown) >= 1000;
```

**Pass condition:** At least 1 row returned.

**LIKE clause note (R-HIGH from §9):** Use `'%"7"%'` (JSON quoted element), NOT `'%7%'` — the latter matches pages 17, 27, 37. The stored format is `[7,8,9]` as a text JSON array; the double-quote form is safe.

**Adjudication evidence (2026-05-27):** Unit `905248f4` (FPT pages 7/8/9) has `row_count=3`, `md_len=2903`. The markdown contains ~36 identified financial line items by mã số code (16 balance-sheet codes 400-440 series from page 7; 20 P&L codes 01-71 series from pages 8-9). Content is fully present. The grouping fix works correctly. `row_count=3` is a count of newline boundaries, not a content deficiency. See handoff `TASK_PEK-INTEGRATE.md § [Architect] PEK-QA-ADJUDICATE` for full dumped markdown and evidence.

### Gate C — Ghost-unit elimination

After the fix, the total `bctc_layout_units` count for a 46-page document should be substantially less than 78. Expected: 10-20 logical units (4-6 financial statement sections + prose separators if stored).

```sql
SELECT COUNT(*) AS total_units,
       SUM(CASE WHEN page_type='table' AND LENGTH(stitched_markdown)=0 THEN 1 ELSE 0 END) AS ghost_table_units
FROM bctc_layout_units
WHERE report_id = 'e71f845d-ffa5-48f9-8f09-30ac2cd09c65';
```

**Pass condition:** `ghost_table_units = 0`. No `page_type='table'` unit with empty markdown.

### Gate D — Corpus sweep (multi-doc, not just sentinel)

Run all three gates above for EVERY report_id in `bctc_layout_units`. Report per-doc results. A document-level pass requires Gates A+C both pass for that document (Gate B is sentinel-specific).

---

## §7 — Frozen Surfaces (dev must not touch)

- `apps/pdf-extractor/infrastructure/text_table_extractor.py` — FROZEN
- `apps/pdf-extractor/sandbox/runner.py` — FROZEN
- `docs/data/pilot-status-pdf-extractor.json` — FROZEN
- `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` — FROZEN
- `apps/pdf-extractor/PDF-Extract-Kit/` (entire subtree) — PRISTINE, zero diff

---

## §8 — Constraints for Implementation

All PEK-INTEGRATE hard constraints remain in force:

1. **CPU-only.** No CUDA, no Metal.
2. **8GB Docker cap** — `_group_bboxes_into_units` is a pure Python dict operation on already-loaded bbox data. Zero memory impact.
3. **`POST /api/push-bctc-layout` contract unchanged** — same push payload shape. mcp-server handler unchanged.
4. **`bctc_table_rows` unregressed** — zero write path overlap. This fix touches only the PEK engine, not `text_table_extractor.py`.
5. **503 market-hours guard not weakened** — no change to `handlers.py` or `is_vn_market_open_utc()`.
6. **Scoped per-file git add** — never `-A`.
7. **PEK subtree pristine** — `git -C apps/pdf-extractor/PDF-Extract-Kit diff` must return EMPTY after commit.

---

## §9 — Brownfield Risk Flags

**R-HIGH — page_numbers_json LIKE query:** Gate B uses `LIKE '%7%'` which could match page 17, 27, 37. QA must use `'%"7"%'` (JSON array element match) or parse the JSON in the query. Instruct dev to use exact array notation in verification.

**R-MED — single consecutive table pages:** Some financial statements (e.g. a 1-page income statement) are correctly 1-page units. The new algorithm must not merge them into adjacent units. The prose-page gap guard handles this correctly — a 1-page statement surrounded by prose pages stays as a 1-page unit.

**R-MED — re-extraction required:** Existing DB data for FPT and corpus will have old single-page units in `bctc_layout_units`. After the fix, a fresh `POST /pek-extract` call for the FPT sentinel is required. The `INSERT OR REPLACE` idempotency in `pushBctcLayoutHandler.ts` on `(report_id, unit_id)` means old ghost units with different `unit_id` values will NOT be replaced — they will accumulate. Ops must DELETE old units for tested report_ids before the fresh extraction, or QA must filter to the most recent `extracted_at`.

Ops step: before QA runs Gates A-C, run:
```sql
DELETE FROM bctc_layout_units WHERE report_id = 'e71f845d-ffa5-48f9-8f09-30ac2cd09c65';
DELETE FROM bctc_page_zones WHERE report_id = 'e71f845d-ffa5-48f9-8f09-30ac2cd09c65';
```
Then trigger `POST /pek-extract` for FPT. Then run QA gates.

**R-LOW — ghost-unit UNIQUE constraint:** `bctc_layout_units` has `UNIQUE(report_id, unit_id)`. After the rewrite, `_group_bboxes_into_units` generates new `unit_id` UUIDs on each call. The `INSERT OR REPLACE` on the same `unit_id` will not conflict. Old rows with different UUIDs from prior runs accumulate (see R-MED above — the DELETE step is mandatory).

---

## §10 — DDD Layer Assignment

| Component | Layer | Rationale |
|-----------|-------|-----------|
| `_group_bboxes_into_units` | infrastructure | Pure Python dict + bbox computation inside `pek_engine_adapter.py` |
| No new ports needed | — | Grouping algorithm is internal to the adapter; no port boundary crossed |
| No new domain objects | — | Multi-page unit is already the `DocumentMapUnit` shape from the existing contract |

---

## §11 — Verification Sequence (for dev + ops + qa)

1. **Dev** rewrites `_group_bboxes_into_units` in `pek_engine_adapter.py` per §5.1. Unit tests: add `TestGroupBboxesIntoUnits` class in `__tests__/test_pek_engine_adapter.py` — cases: (a) single table page → 1 unit, (b) 3 consecutive table pages → 1 unit with `pages=[N,N+1,N+2]`, (c) table-prose-table → 2 separate units, (d) prose page → no unit created, (e) max-depth cap at 8 pages. All 5 new tests plus all 22 existing tests must pass.
2. **Ops** — after dev commits: `docker compose build --no-cache pdf-extractor` → smoke gate must pass. Then DELETE old bctc_layout_units/bctc_page_zones rows for FPT (see R-MED). Then `docker compose up -d --no-deps --force-recreate pdf-extractor`. Then trigger re-extraction for FPT sentinel via `bctcReparseJob` or direct API call.
3. **QA** — run all four gates (A, B, C, D) per §6. All must PASS. Report per-page row counts for all table-bearing pages of FPT. Report corpus pass-rate.

---

## §12 — Handoff

**Next actor:** dev-pdf-extractor implements §5.3 (one file, one function). Then ops (--no-cache build + DELETE + force-recreate + re-extract sentinel). Then qa (four gates per §6). Then po PEK-MULTIPAGE-EXIT. Then USER verbal G9.
