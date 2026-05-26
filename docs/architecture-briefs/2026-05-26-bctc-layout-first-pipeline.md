# Architecture Brief — Sprint BCTC-LAYOUT-FIRST: Document-Structure-First Extraction + Geometric Zone Review Overlay

**Date:** 2026-05-26 | **Sprint:** BCTC-LAYOUT-FIRST | **Author:** architect
**REQ source:** `docs/REQ_BCTC-LAYOUT-FIRST.md` | **Handoff:** `docs/handoffs/TASK_BCTC-LAYOUT-FIRST.md`
**Build standard:** lean (existing service zones; redesign target = `generic_md_table_extractor.py`)

---

## 1. Brownfield Scan

### 1.1 Redesign Target

`apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` — MD-EXTRACT-9, ~2445 lines.

History: 9 fix commits on the `MD-EXTRACT-*` sequence. The core algorithm (Steps A–G per the docstring) is **per-page only**: it rasterizes one page, runs `image_to_data` (psm 6, 200 DPI), classifies tokens into number/text, derives column anchors by left-edge clustering, assigns tokens to anchors, and emits a markdown pipe-table. Cross-page document context is **absent**. There is no concept of a logical multi-page unit, no schema inheritance, and no continuation-page grouping. This is the structural root cause confirmed by the diagnostic history.

The existing `ExtractMdTablesUseCase` (`application/extract_md_tables_usecase.py`) orchestrates the per-page loop, calls `_extractor.extract_md_tables()` page by page, collects per-page `md_tables`, and pushes the flat list to mcp-server via `MdTablePushClient`. There is no unit grouping at any level of the pipeline.

The push endpoint (`POST /api/push-bctc-md-tables`) stores results in `bctc_md_tables` (see §1.3). The new pipeline replaces the internal algorithm but can reuse the same push endpoint with an extended payload that adds document-map and zone-geometry fields.

### 1.2 Zero-Collision Boundary (0-byte-diff surfaces)

`apps/pdf-extractor/infrastructure/text_table_extractor.py` is the **SSOT for structured `bctc_table_rows`**. It implements `TableAssemblerPort` and is called by `ExtractTablesUseCase` (not `ExtractMdTablesUseCase` — separate use cases, separate triggers, separate ports). The 1954c write chain writes to `bctc_table_rows` and `bctc_balance_checks`. The new Tier 0–3 pipeline writes to **separate new tables only** (see §3). Zero column overlap with any row in `bctc_table_rows` or `bctc_balance_checks`.

Confirmed non-collision points:
- `text_table_extractor.py`: 0-byte-diff throughout this sprint.
- `bctc_table_rows` table: no new rows, no schema modification.
- `bctc_balance_checks` table: not touched.
- `ExtractTablesUseCase`: not touched.

### 1.3 Existing Infra Reused

| Existing surface | Role in new design | Change |
|---|---|---|
| `bctc_md_tables` DDL | OLD flat-list storage; extended for layout-first output (§3.1) | ALTER TABLE + new columns |
| `pushBctcMdTablesHandler.ts` | Extended to accept zone-geometry payload (§3.2) | Extend, not replace |
| `ExtractMdTablesUseCase` | Replaced internal algorithm; orchestration shell reused | Gut + rebuild internals |
| `MdTablePushClient` | Reused; payload shape extended | Add fields |
| `bctcInspectHandler.ts` | Extended to serve zone-geometry + overlay toggle | Extend, not replace |
| `pdf_extracted_text` table | Tier 0 reads stored OCR text from here (CHEAP path) | Read-only |

### 1.4 DDD Layer Assignments

| Component | DDD Layer | File |
|---|---|---|
| Geometric column-fingerprint rules (gutter continuity, row pitch, unit grouping) | Domain | `domain/services.py` (new `DocumentMapService`) OR new `domain/document_map/` |
| Per-page layout invariant rules (schema inheritance, zone classification) | Domain | Same |
| Balance identity, code monotonic, row-completeness invariants | Domain | New `domain/primitives/layout_invariants/` |
| Document-map computation trigger + orchestration | Application | `application/extract_layout_first_usecase.py` (new) |
| Tier 2 OCR into grid + cross-page stitch | Application | Same use case |
| Tier 3 gate + quarantine write | Application | Same use case |
| Tesseract cell OCR, PIL rasterization, low-DPI projection-profile | Infrastructure | Refactored `infrastructure/generic_md_table_extractor.py` |
| Zone-geometry JSON push client | Infrastructure | Extend `infrastructure/md_table_push_client.py` |
| Zone-geometry DB write (mcp-server) | Infrastructure (mcp-server) | Extended `pushBctcMdTablesHandler.ts` |
| Zone-geometry DB read + overlay render | Interface (mcp-server) | Extended `bctcInspectHandler.ts` |

---

## 2. Tier 0–3 Component Contracts

### 2.1 Tier 0 — Document Map (CHEAP)

**Purpose:** Before any heavy OCR, scan all pages and group consecutive pages into logical units using geometric column-fingerprint continuity as the sole spine. Title anchors are hints and tie-breakers only.

**Inputs (all already in memory or DB — no new Tesseract calls):**
- `pdf_extracted_text` rows for the report (stored OCR text, fetched via `OcrTextFetchClientPort`)
- Low-DPI (50 DPI) raster of each page via `pdf2image`, converted to a grayscale numpy array or PIL image (not Tesseract — just pixel data for projection profile). At 50 DPI an A4 page is ~280×396 px, requiring ~110KB RAM. This is the CHEAP raster.

**Algorithm — `build_document_map(pages: List[PageRecord]) -> DocumentMap`:**

1. For each page, compute the **projection-profile fingerprint**: compute the horizontal projection profile (sum of dark pixels by column) on the low-DPI grayscale raster. Identify column-gutter positions as x-positions where the dark-pixel sum drops below a threshold (e.g. < 5% of median column density). Record: `gutter_count`, `gutter_x_positions` (as fractions of page width, resolution-independent), `row_pitch_estimate` (dominant peak-to-peak spacing in the vertical projection profile).

2. For each page, scan the stored OCR text from `pdf_extracted_text` for **title-anchor hints**. A hint fires when the normalized (NFD-stripped) text of any line contains a token from the generic hint vocabulary. These hints are NOT used for grouping — they are attached as metadata to the `unit_hints` field of the document map for display in the overlay only.

3. **Group pages into logical units** using the fingerprint-continuity test. Process pages in page-number order (with gaps tolerated):
   - Start a new unit when: (a) the gutter_count changes, OR (b) any gutter_x_position shifts by more than `GUTTER_POSITION_TOLERANCE` (default: 5% of page width), OR (c) row_pitch_estimate changes by more than 50%.
   - A **page gap** (pages with no stored OCR text and no raster content) does NOT break a unit if the surrounding pages have matching fingerprints. Mark gap pages as `page_type=blank`.
   - The first page of a unit is the **schema-page** (`is_schema_page=True`). All subsequent pages in the unit are **continuation pages** (`is_schema_page=False`).

4. Tag each page: `table` (gutter_count >= 2 AND density gate passes on stored OCR text), `prose` (gutter_count < 2 OR density gate fails), `blank` (no OCR text AND no raster content).

**Output — `DocumentMap` (emitted as JSON, also passed to Tier 1):**
```
{
  "report_id": "<uuid>",
  "total_pages": N,
  "units": [
    {
      "unit_id": "<uuid>",
      "schema_page": 3,
      "pages": [
        {
          "page_number": 3,
          "page_type": "table|prose|blank",
          "is_schema_page": true,
          "column_fingerprint": {
            "gutter_count": 3,
            "gutter_x_fractions": [0.31, 0.55, 0.72],
            "row_pitch_px_at_50dpi": 14.2
          },
          "unit_hints": ["(tiep theo)", "LUU CHUYEN TIEN TE"]
        },
        { "page_number": 4, "is_schema_page": false, ... },
        { "page_number": 5, "is_schema_page": false, ... }
      ]
    }
  ]
}
```

**AC-0 compliance:** `gutter_x_fractions`, `gutter_count`, `row_pitch_px_at_50dpi` are purely geometric descriptors. `unit_hints` contains raw OCR text strings attached as metadata, not used as decision inputs. No Vietnamese statement labels appear in any branching logic.

**Host-safety:** 50 DPI raster for a 46-page BCTC = 46 × ~110KB = ~5MB peak RAM. Rasters are generated sequentially, one page at a time, and released immediately after fingerprint computation. No batch.

### 2.2 Tier 1 — Per-Page Layout Zoning (with Schema Inheritance)

**Purpose:** For each table page in a logical unit, decompose the page into geometric zones. **Continuation pages inherit the schema-page column schema** — this is the direct named fix for the FPT Q1 page-5 scramble.

**Algorithm — `zone_page(page_img: PIL.Image, unit_schema: Optional[ColumnSchema]) -> PageZones`:**

At 200 DPI (the existing rasterization DPI):

1. Compute **horizontal projection profile** on the binarized 200-DPI page image. Identify header band (top zone with dense horizontal text before the first vertical gutter, typically top 15% of page) and footer band (bottom zone, typically bottom 10%).

2. If `unit_schema` is `None` (this IS the schema-page or a standalone page), **detect column gutters** from the 200-DPI horizontal projection: x-positions where the dark-pixel column sum < gutter threshold AND the gap width > `MIN_GUTTER_WIDTH_PX` (= 20px at 200 DPI, ~2.5mm). Produce `ColumnSchema(col_count, gutter_x_positions: List[Tuple[x_min, x_max]])`.

3. If `unit_schema` is provided (continuation page), **skip column detection entirely**: use `unit_schema.gutter_x_positions` directly. This is the schema-inheritance mechanism.

4. Compute **row bands** from the vertical projection profile between the header and footer bands: identify alternating text-dense and text-sparse horizontal strips. Each row band is `{y_min, y_max, row_density}`. Row pitch is the median band-to-band spacing.

5. Produce `PageZones`:
```
{
  "page_number": N,
  "header_band": {"y_min": 0, "y_max": 180},
  "footer_band": {"y_min": 3100, "y_max": 3300},
  "column_gutters": [
    {"col_id": "col_0", "x_min": 520, "x_max": 560},
    {"col_id": "col_1", "x_min": 810, "x_max": 850}
  ],
  "row_bands": [
    {"y_min": 200, "y_max": 230, "row_density": 0.72},
    ...
  ],
  "unit_id": "<uuid>",
  "is_continuation_page": true,
  "schema_inherited_from_page": 3
}
```

**AC-0 compliance:** Column IDs are positional (`col_0`, `col_1`, ...). No semantic labels. `schema_inherited_from_page` is an integer page number. No Vietnamese identifiers in any branching logic.

### 2.3 Tier 2 — OCR Into the Known Grid + Cross-Page Stitch

**Purpose:** OCR each cell region defined by Tier 1's column grid and row bands, then stitch all pages of a unit into a single markdown pipe-table.

**Algorithm — `ocr_unit(unit: LogicalUnit, zones_by_page: Dict[int, PageZones]) -> UnitOcrResult`:**

1. For each page in the unit, in ascending page order:
   - For each row band (excluding header_band and footer_band):
     - For each column gutter gap (the text regions BETWEEN gutters, not the gutters themselves): crop the cell region from the 200-DPI page image as `img[y_min:y_max, x_left_of_gutter:x_right_of_gutter]`.
     - Run `pytesseract.image_to_string(cell_img, lang='vie+eng', config='--psm 6')` on the cropped region. This is the **one heavy OCR pass per page** — not per-cell; the cell-by-cell crop feeds the SAME single Tesseract invocation by calling `image_to_data` on the full page once and then filtering word bboxes by cell boundaries, so OCR is still **one pass per page** total.
     - Map the extracted text into the cell slot `(row_band_idx, col_idx)`.

2. For the **schema-page** of a unit: detect the header row (first row band whose cells contain no numeric tokens — it is the column-name row). Emit the header row once.

3. For **continuation pages**: skip header detection entirely (headers are not expected). Append data rows directly after the schema-page rows.

4. **Stitch**: concatenate all pages' row sequences in reading order `(page_number ASC, row_band_idx ASC)`. Emit one markdown pipe-table: header row first, then the GFM `|---|---|` separator, then all data rows.

5. For **prose units**: concatenate OCR text across page breaks as plain paragraph text (no table structure).

**One Tesseract pass per page constraint:** `image_to_data` is called once per page. Cell text is derived by filtering the resulting word dictionary by bbox intersection with the cell region — NOT by separate per-cell Tesseract invocations. This satisfies Decision C and Decision F's host constraint.

**Output — `UnitOcrResult`:**
```
{
  "unit_id": "<uuid>",
  "page_numbers": [3, 4, 5, 6],
  "stitched_markdown": "| col_0 | col_1 | col_2 | col_3 |\n|---|---|---|---|\n| ... |",
  "row_count": 42,
  "page_row_spans": [{"page": 3, "rows": [0,14]}, {"page": 4, "rows": [15,27]}, ...]
}
```

### 2.4 Tier 3 — Per-Unit Invariant Gate

**Purpose:** After stitching, gate each unit with machine-checkable structural invariants before storage. Failed units are quarantined — not silently emitted, not pipeline-blocking.

**Three invariants (all must pass for a unit to be non-quarantined):**

**Invariant 1 — Balance identity across the stitch.**
Parse numeric values from the stitched markdown rows. For balance-sheet units (detected by a generic heuristic: units where the extracted row set contains ≥3 distinct 3-digit code values AND the maximum code value is >= 400), check: `sum_of_subtotals_at_threshold == total_at_threshold`. This is computed using the existing `reconcile_figures` pattern (pure function, domain layer). Specifically: identify sentinel rows by position pattern (the row with the maximum numeric code value tends to be a total; rows above it are component rows). **AC-0:** this uses code-position geometry, not hardcoded sentinel code values. The heuristic fires only on balance-sheet-shaped units (those with a code range 100–440+). Non-balance-sheet units (income, cash flow, notes) have this invariant skipped (quarantine reason field records `balance_check_skipped=true`).

**Invariant 2 — Codes monotonic across page boundary.**
For any unit where extracted cells in the first (leftmost text) column contain numeric codes: sort all code values across all pages in the unit in document order. A violation is any case where `code[i+1] < code[i]` after accounting for repeating-section subtotals (subtotals are excluded by the rule that a code value equal to an ancestor group sum is not a decrease). Emit the first violation triplet `(code_before, code_after, page_boundary_crossed)` for diagnosis.

**Invariant 3 — Every data row has a label and at least one value.**
A row is an **orphan** if: `label == null OR label == ""` when any value column also has a non-null value present, OR when `all value columns are null/empty` (junk row with no content). Orphan rows trigger quarantine.

**Quarantine:** A unit fails any invariant → the unit is stored with `quarantined = 1` AND `quarantine_reason = "<invariant-name>: <detail>"`. The failed unit is NOT blocked from being stored — it IS stored, but excluded from the pass-rate count. The pipeline continues to the next unit.

**Pass-rate report (per extraction run):**
```
{
  "report_id": "<uuid>",
  "units_total": N,
  "units_passing": P,
  "units_quarantined": Q,
  "quarantine_breakdown": {
    "balance_identity_fail": X,
    "codes_not_monotonic": Y,
    "orphan_rows": Z
  }
}
```

---

## 3. Architect-Open Questions — Resolved

### 3.1 Q1: market.db Schema (Zero Collision with `bctc_table_rows`)

**Decision:** Two new tables, both owned exclusively by mcp-server. No modification to `bctc_table_rows`, `bctc_balance_checks`, or `bctc_md_tables` beyond a backward-compatible extension.

#### Table A — `bctc_layout_units` (replaces the flat `bctc_md_tables` for layout-first output)

The existing `bctc_md_tables` table stores a flat `md_tables_json` array with no unit structure. For layout-first, the stitched output is per-unit, with quarantine status. **Approach:** extend `bctc_md_tables` with new nullable columns (backward compatible — existing rows are unaffected) AND add the new `bctc_layout_units` table for per-unit storage.

```sql
-- NEW TABLE: one row per logical unit per report
-- mcp-server is the sole writer (via pushBctcLayoutHandler POST endpoint)
CREATE TABLE IF NOT EXISTS bctc_layout_units (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id           TEXT    NOT NULL,
  unit_id             TEXT    NOT NULL,          -- UUID, matches DocumentMap.unit_id
  schema_page         INTEGER NOT NULL,          -- page number of the schema-page
  page_numbers_json   TEXT    NOT NULL,          -- JSON array: [3, 4, 5, 6]
  page_type           TEXT    NOT NULL DEFAULT 'table',   -- 'table'|'prose'|'blank'
  stitched_markdown   TEXT    NOT NULL DEFAULT '',        -- the cross-page stitched table
  row_count           INTEGER NOT NULL DEFAULT 0,
  quarantined         INTEGER NOT NULL DEFAULT 0,         -- 0 = passing, 1 = quarantined
  quarantine_reason   TEXT,                               -- e.g. "balance_identity_fail: delta=12"
  document_map_json   TEXT,                               -- full Tier 0 document-map JSON (stored once per report_id; duplicated per unit for direct-query convenience)
  extracted_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(report_id, unit_id)
);
CREATE INDEX IF NOT EXISTS idx_blu_report ON bctc_layout_units(report_id);
CREATE INDEX IF NOT EXISTS idx_blu_quarantine ON bctc_layout_units(report_id, quarantined);
```

**QA direct-query for pass-rate:**
```javascript
// docker compose exec -T mcp-server bun -e '
const db = require("bun:sqlite");
const d = new db.Database("/app/data/market.db");
const rows = d.query("SELECT quarantined, COUNT(*) as cnt FROM bctc_layout_units GROUP BY quarantined").all();
console.log(JSON.stringify(rows));
'
```

**QA direct-query for quarantined units (corpus-wide):**
```javascript
d.query("SELECT report_id, unit_id, quarantine_reason FROM bctc_layout_units WHERE quarantined=1").all()
```

#### Table B — `bctc_page_zones` (zone-geometry per page, serves the overlay)

```sql
-- NEW TABLE: one row per page per report_id
-- mcp-server is the sole writer (via pushBctcLayoutHandler POST endpoint)
CREATE TABLE IF NOT EXISTS bctc_page_zones (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id             TEXT    NOT NULL,
  page_number           INTEGER NOT NULL,
  unit_id               TEXT    NOT NULL,         -- FK → bctc_layout_units.unit_id
  page_type             TEXT    NOT NULL,         -- 'table'|'prose'|'blank'
  is_schema_page        INTEGER NOT NULL DEFAULT 0,
  is_continuation_page  INTEGER NOT NULL DEFAULT 0,
  schema_inherited_from_page INTEGER,            -- null for schema-page; page_number of schema-page for continuation
  zones_json            TEXT    NOT NULL,         -- full PageZones JSON (see §2.2 and §3.2)
  extracted_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(report_id, page_number)
);
CREATE INDEX IF NOT EXISTS idx_bpz_report ON bctc_page_zones(report_id, page_number);
CREATE INDEX IF NOT EXISTS idx_bpz_unit   ON bctc_page_zones(unit_id);
```

**Write owner:** `pushBctcLayoutHandler.ts` (new handler in mcp-server, see §3.2). It is called by pdf-extractor's new `LayoutFirstPushClient` at the end of extraction.

**Collision audit:**
- `bctc_table_rows`: zero overlap. Separate table, no shared write path.
- `bctc_balance_checks`: zero overlap.
- `bctc_md_tables`: zero overlap (separate table; existing `bctc_md_tables` rows are untouched — old push endpoint continues to work for backward compatibility; the new layout-first pipeline pushes to the new endpoint only).

### 3.2 Q2: Exact JSON Contract at the pdf-extractor ↔ mcp-server Service Boundary

This contract is the SSOT for both dev-pdf-extractor (emitter) and dev-mcp-server (consumer). Neither dev agent may deviate from it.

#### New push endpoint: `POST /api/push-bctc-layout`

**Request payload (pdf-extractor → mcp-server):**
```json
{
  "report_id": "e8ea3df5-3f32-413d-a3eb-c71634c0438d",
  "document_map": {
    "total_pages": 46,
    "units": [
      {
        "unit_id": "a1b2c3d4-...",
        "schema_page": 3,
        "pages": [3, 4, 5, 6],
        "page_type": "table"
      }
    ]
  },
  "units": [
    {
      "unit_id": "a1b2c3d4-...",
      "stitched_markdown": "| col_0 | col_1 | col_2 | col_3 |\n|---|---|---|---|\n| A | 100 | 50 | 48 |",
      "row_count": 42,
      "quarantined": false,
      "quarantine_reason": null,
      "page_row_spans": [
        {"page": 3, "row_start": 0, "row_end": 14},
        {"page": 4, "row_start": 15, "row_end": 27},
        {"page": 5, "row_start": 28, "row_end": 35},
        {"page": 6, "row_start": 36, "row_end": 42}
      ]
    }
  ],
  "page_zones": [
    {
      "page_number": 3,
      "unit_id": "a1b2c3d4-...",
      "page_type": "table",
      "is_schema_page": true,
      "is_continuation_page": false,
      "schema_inherited_from_page": null,
      "zones": {
        "image_width_px": 2338,
        "image_height_px": 3308,
        "image_dpi": 200,
        "coordinate_origin": "top-left",
        "coordinate_unit": "px",
        "header_band": {"y_min": 0, "y_max": 185},
        "footer_band": {"y_min": 3100, "y_max": 3308},
        "column_gutters": [
          {"col_id": "col_0", "x_min": 0, "x_max": 460},
          {"col_id": "col_1", "x_min": 461, "x_max": 520},
          {"col_id": "col_2", "x_min": 521, "x_max": 810},
          {"col_id": "col_3", "x_min": 811, "x_max": 855},
          {"col_id": "col_4", "x_min": 856, "x_max": 2338}
        ],
        "row_bands": [
          {"y_min": 186, "y_max": 220, "row_density": 0.71},
          {"y_min": 221, "y_max": 256, "row_density": 0.68}
        ],
        "unit_hints": ["(tiep theo)"],
        "unit_boundary_after_page": false
      }
    },
    {
      "page_number": 5,
      "unit_id": "a1b2c3d4-...",
      "page_type": "table",
      "is_schema_page": false,
      "is_continuation_page": true,
      "schema_inherited_from_page": 3,
      "zones": {
        "image_width_px": 2338,
        "image_height_px": 3308,
        "image_dpi": 200,
        "coordinate_origin": "top-left",
        "coordinate_unit": "px",
        "header_band": {"y_min": 0, "y_max": 140},
        "footer_band": {"y_min": 3100, "y_max": 3308},
        "column_gutters": [
          {"col_id": "col_0", "x_min": 0, "x_max": 460},
          {"col_id": "col_1", "x_min": 461, "x_max": 520},
          {"col_id": "col_2", "x_min": 521, "x_max": 810},
          {"col_id": "col_3", "x_min": 811, "x_max": 855},
          {"col_id": "col_4", "x_min": 856, "x_max": 2338}
        ],
        "row_bands": [
          {"y_min": 141, "y_max": 178, "row_density": 0.65}
        ],
        "unit_hints": [],
        "unit_boundary_after_page": true
      }
    }
  ],
  "pass_rate_report": {
    "units_total": 8,
    "units_passing": 6,
    "units_quarantined": 2,
    "quarantine_breakdown": {
      "balance_identity_fail": 1,
      "codes_not_monotonic": 0,
      "orphan_rows": 1
    }
  }
}
```

**Coordinate system (binding for the overlay renderer):**
- Origin: **top-left corner of the rendered page image** at `image_dpi` (200 DPI).
- Unit: **pixels** (integer).
- `x_min` / `x_max`: horizontal extent. `y_min` / `y_max`: vertical extent.
- All `column_gutters` entries describe the **text columns** (the regions between physical gutter whitespace), not the whitespace gaps themselves. `col_0` is always the leftmost text column. The rendering overlay draws the boundary between adjacent col entries (i.e., the whitespace between `col_N.x_max` and `col_N+1.x_min` is the visible gutter).
- `column_gutters` entries for continuation pages are **identical to the schema-page** (they are inherited — this is the schema-inheritance proof the overlay can verify visually).
- `unit_boundary_after_page = true` means: the page is the LAST page of its logical unit. The overlay renders a distinct unit-boundary line at `y = footer_band.y_min` for that page.

**Zone type vocabulary (binding for overlay color assignments):**
| Field | Overlay color (mcp-server decides exact color) |
|---|---|
| `header_band` | one distinct color |
| `footer_band` | one distinct color |
| `column_gutters[N]` | alternating, positional | 
| `row_bands` | one distinct color per band type |
| `unit_boundary_after_page` | one distinct heavy-border color |

**AC-0 compliance:** `col_0`, `col_1`, etc. are positional. No BCTC semantic labels appear anywhere in the contract. `unit_hints` are raw OCR strings in the metadata field only — never used as overlay decision inputs.

**Response (mcp-server → pdf-extractor):**
```json
{ "ok": true, "units_stored": 8, "pages_stored": 18 }
```

### 3.3 Q3: Quarantined Unit Storage for QA Direct-DB Count

**Resolved:** Quarantined units are stored in `bctc_layout_units` with `quarantined = 1`. They are NOT excluded from the table. QA counts them with the direct query shown in §3.1. The quarantine flag does NOT prevent storage — it enables the pass-rate measurement the done-bar requires.

**QA count query (exact command for QA agent to use):**
```bash
docker compose exec -T mcp-server bun -e '
const { Database } = require("bun:sqlite");
const db = new Database("/app/data/market.db", { readonly: true });
const rows = db.query(
  "SELECT report_id, quarantined, COUNT(*) as cnt FROM bctc_layout_units GROUP BY report_id, quarantined ORDER BY report_id"
).all();
console.log(JSON.stringify(rows, null, 2));
'
```

This directly counts passing vs quarantined units per report, corpus-wide, with no endpoint dependency.

---

## 4. Service-Boundary Work Split

### 4.1 LF-EXTRACT — dev-pdf-extractor (Zone: `apps/pdf-extractor/`)

**What:** Replace the per-page algorithm in `generic_md_table_extractor.py` with the Tier 0–3 pipeline. Add the `LayoutFirstPushClient` to push the new payload to `/api/push-bctc-layout`.

**Files to create/modify:**

| File | Action | DDD Layer |
|---|---|---|
| `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` | REPLACE internal algorithm (keep filename + class name for import compatibility; keep dead-code block for test backward compat per existing docstring rule). Add `build_document_map()`, `zone_page()`, `ocr_unit()`, `gate_unit()` as module-level functions called by the class. | Infrastructure (OCR, PIL, projection profiles) + Domain logic (grouping rules, invariant checks as pure functions) |
| `apps/pdf-extractor/application/extract_layout_first_usecase.py` | NEW. Orchestrates Tier 0 → Tier 1 → Tier 2 → Tier 3 → push. Replaces `ExtractMdTablesUseCase` as the layout-first trigger. Triggered by `POST /extract-layout-first` (new FastAPI route in `main.py`). | Application |
| `apps/pdf-extractor/infrastructure/layout_first_push_client.py` | NEW. `LayoutFirstPushClient` — HTTP push to `POST /api/push-bctc-layout`. Same pattern as `MdTablePushClient` (urllib, no aiohttp). | Infrastructure |
| `apps/pdf-extractor/domain/primitives/layout_invariants/primitive.py` | NEW. Pure functions: `check_balance_identity(rows)`, `check_codes_monotonic(rows)`, `check_no_orphan_rows(rows)` → each returns `(pass: bool, reason: str)`. Zero I/O, zero Tesseract, zero DB. | Domain |
| `apps/pdf-extractor/domain/modules/financial_reports/ports.py` | EXTEND. Add `LayoutFirstPushClientPort`, `DocumentMapBuilderPort`. | Domain (ports) |
| `apps/pdf-extractor/main.py` | EXTEND. Wire new use case + clients at composition root. Add `POST /extract-layout-first` route. DO NOT remove `/extract-md-tables` (backward compat). | Interface |
| `apps/pdf-extractor/__tests__/unit/test_layout_invariants.py` | NEW. Unit tests for all three invariant checkers. Injected fakes — zero Tesseract. | Test |
| `apps/pdf-extractor/__tests__/unit/test_document_map.py` | NEW. Unit tests for `build_document_map()` with injected fingerprint data. | Test |
| `apps/pdf-extractor/__tests__/unit/test_schema_inheritance.py` | NEW. Confirms page 5 uses page 3's column schema when `unit_schema` is injected. | Test |

**FROZEN — 0-byte-diff:**
- `apps/pdf-extractor/infrastructure/text_table_extractor.py`
- `apps/pdf-extractor/sandbox/runner.py`
- `docs/data/pilot-status-pdf-extractor.json`

**Acceptance criteria for LF-EXTRACT (machine-checkable):**

- **AC-LFE-0 (grep-proof):** `grep -rn "BẢNG CÂN ĐỐI\|LƯU CHUYỂN\|NGUỒN VỐN\|Mã số\|Thuyết minh" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` returns ZERO matches in any code path that makes a zone-boundary or column-grid decision. Matches permitted only in docstring comment blocks explaining why anchors are hints.

- **AC-LFE-1 (document-map JSON emitted):** Calling the layout-first endpoint on FPT Q1 2026 (`report_id=e8ea3df5-3f32-413d-a3eb-c71634c0438d`) causes mcp-server to store zone records for pages 3, 4, 5, and 6 in `bctc_page_zones`. Direct-DB: `SELECT page_number, unit_id, is_continuation_page FROM bctc_page_zones WHERE report_id='e8ea3df5-3f32-413d-a3eb-c71634c0438d' AND page_number IN (3,4,5,6)` returns 4 rows with the same `unit_id`.

- **AC-LFE-2 (schema inheritance — the root-cause fix):** For FPT Q1 2026 page 5, `SELECT schema_inherited_from_page FROM bctc_page_zones WHERE report_id='e8ea3df5...' AND page_number=5` returns `3` (inherits from schema-page 3, not self-detected).

- **AC-LFE-3 (page-41 is prose):** For FPT Q1 2026, `SELECT page_type FROM bctc_page_zones WHERE report_id='e8ea3df5...' AND page_number=41` returns `'prose'` or `'blank'` — NOT the same unit as the balance-sheet pages. Proves geometry is the spine.

- **AC-LFE-4 (FPT Q1 NGUỒN VỐN present in stitched output):** `SELECT stitched_markdown FROM bctc_layout_units WHERE report_id='e8ea3df5...' AND schema_page=3` — the result contains numeric values in the expected column positions for the code-300 area (liabilities total). The row is NOT missing or scrambled.

- **AC-LFE-5 (corpus breadth — AC-0b):** After sequential re-extraction of all 18 docs, `SELECT COUNT(*) FROM bctc_layout_units` > 0 AND `SELECT COUNT(DISTINCT report_id) FROM bctc_layout_units` = 18. Pass-rate: `SELECT COUNT(*) FROM bctc_layout_units WHERE quarantined=0` / `SELECT COUNT(*) FROM bctc_layout_units` is the measured corpus pass-rate. This must be a MEASURED value, not assumed 100%.

- **AC-LFE-6 (one Tesseract pass per page):** In `extract_layout_first_usecase.py`, there is exactly one call to `pytesseract.image_to_data` per page per unit (in Tier 2). Tier 0 uses only PIL pixel operations + stored OCR text — no Tesseract call. Audit: `grep -n "image_to_data\|image_to_string\|run_tesseract" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` — all matches occur in functions that are called in the Tier 2 path only, not the Tier 0 fingerprinting path.

- **AC-LFE-7 (structured path non-regression):** `git diff HEAD -- apps/pdf-extractor/infrastructure/text_table_extractor.py` produces zero output. Direct-DB: `SELECT balance_pass FROM bctc_balance_checks WHERE report_id='e71f845d-ffa5-48f9-8f09-30ac2cd09c65'` returns `1` after re-extraction.

- **AC-LFE-8 (local tools only):** `grep -rn "requests.post\|httpx\|aiohttp\|openai\|anthropic\|google\|textract\|document.ai" apps/pdf-extractor/` returns zero matches in any extraction code path.

- **AC-LFE-9 (sequential re-extract):** `POST /extract-layout-first` processes exactly one document per call. No parallel extraction. `run_bctc_batch_sweep` is not invoked anywhere in the new code path.

- **AC-LFE-10 (sandbox green):** `docker compose exec -T pdf-extractor python apps/pdf-extractor/sandbox/runner.py` exits 0. No sandbox modification required.

- **AC-LFE-11 (quarantined unit count queryable):** After corpus re-extraction, `SELECT quarantined, COUNT(*) as cnt FROM bctc_layout_units GROUP BY quarantined` returns at least one row — proving the quarantine path is exercised, not dead code.

### 4.2 LF-OVERLAY — dev-mcp-server (Zone: `apps/mcp-server/`)

**What:** Add the new DB schema, the push handler for layout data, and the ON/OFF toggle overlay to `bctcInspectHandler.ts`. DB is read-only for the overlay — no pdf-extractor Python import.

**Files to create/modify:**

| File | Action | DDD Layer |
|---|---|---|
| `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` | EXTEND. Add `bctc_layout_units` and `bctc_page_zones` DDL (see §3.1). Use `CREATE TABLE IF NOT EXISTS` + additive migration pattern consistent with existing column-add guards. | Infrastructure |
| `apps/mcp-server/src/interface/mcp/routes/pushBctcLayoutHandler.ts` | NEW. `handlePushBctcLayout` — receives the JSON contract from §3.2, validates `report_id` as UUID, writes to `bctc_layout_units` (INSERT OR REPLACE per unit_id) and `bctc_page_zones` (INSERT OR REPLACE per page_number). No write to `bctc_table_rows`, `bctc_balance_checks`, or `bctc_md_tables`. | Interface |
| `apps/mcp-server/src/interface/mcp/server.ts` | EXTEND. Register `POST /api/push-bctc-layout` → `handlePushBctcLayout`. | Interface |
| `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` | EXTEND. Add: (1) new `GET /api/bctc-inspect/zones/{doc_id}?page=N` route that returns `zones_json` from `bctc_page_zones`; (2) ON/OFF toggle control in the HTML viewer (client-side JS only, no server session); (3) overlay rendering using the zone JSON coordinates (draw colored SVG/canvas overlays on the rendered page image). DO NOT touch the `bctc_table_rows` read path or the balance badge. | Interface + Infrastructure (DB read) |
| `apps/mcp-server/src/__tests__/1272-push-bctc-layout.test.ts` | NEW. Tests: (a) valid payload writes correct rows to `bctc_layout_units` + `bctc_page_zones`; (b) quarantined unit stored with `quarantined=1`; (c) duplicate push is idempotent (INSERT OR REPLACE); (d) missing `report_id` returns 400; (e) handler touches ONLY the two new tables (zero cross-table write). Injected in-memory DB, zero credentials, zero network. | Test |
| `apps/mcp-server/src/__tests__/1273-bctc-inspect-overlay.test.ts` | NEW. Tests: (a) `GET /api/bctc-inspect/zones/{doc_id}?page=N` returns zones_json from DB; (b) returns 404 when no zone data found; (c) handler does NOT call pdf-extractor (pure DB read). | Test |

**FROZEN — do NOT touch:**
- `bctc_table_rows` read path in `bctcInspectHandler.ts`
- `bctc_balance_checks` read path
- Balance badge logic
- `bctcInspectMdHandler.ts` (the old md-tables handler)
- `pushBctcMdTablesHandler.ts` (the old md push handler)

**Acceptance criteria for LF-OVERLAY (machine-checkable):**

- **AC-LFO-0 (toggle present):** `curl -s http://localhost:3000/api/bctc-inspect` returns HTML containing a toggle control element (identifiable by a data attribute or id such as `data-zone-toggle` or `id="zone-overlay-toggle"`). Not an endpoint check for correctness — just presence of the toggle in the HTML structure.

- **AC-LFO-1 (zones endpoint returns data):** After LF-EXTRACT has run on FPT Q1 2026, `curl -s "http://localhost:3000/api/bctc-inspect/zones/e8ea3df5-3f32-413d-a3eb-c71634c0438d?page=3"` returns JSON with `column_gutters` containing entries with `col_id` values matching the positional `col_0` / `col_1` pattern. Zero semantic labels.

- **AC-LFO-2 (no pdf-extractor import):** `grep -rn "from.*pdf.extractor\|import.*pdf.extractor\|pdf_extractor" apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` returns zero matches. The overlay renderer reads from DB only.

- **AC-LFO-3 (structured path non-regression):** After overlay is added, `GET /api/bctc-inspect/table/e71f845d-ffa5-48f9-8f09-30ac2cd09c65` still returns the structured table rows with `balance_pass=true`. Direct-DB verification: `SELECT balance_pass FROM bctc_balance_checks WHERE report_id='e71f845d...'` = 1.

- **AC-LFO-4 (new tables, zero cross-write):** In the `1272-push-bctc-layout.test.ts` test, after `handlePushBctcLayout` processes a valid payload, the test confirms: (a) `SELECT COUNT(*) FROM bctc_layout_units` > 0, (b) `SELECT COUNT(*) FROM bctc_page_zones` > 0, (c) `SELECT COUNT(*) FROM bctc_table_rows` = 0 (zero cross-write to structured path).

- **AC-LFO-5 (idempotent push):** Two successive `POST /api/push-bctc-layout` calls with the same `report_id` and `unit_id` result in exactly the same DB state as one call. `SELECT COUNT(*) FROM bctc_layout_units WHERE report_id='...' AND unit_id='...'` = 1 after both pushes.

- **AC-LFO-6 (zone types visually distinct):** The HTML overlay code (in `bctcInspectHandler.ts`) assigns at least two distinct CSS colors or SVG stroke styles to zone types: one for `column_gutters`, one for `row_bands`, one for `header_band` / `footer_band`. Code-inspectable without running the browser.

- **AC-LFO-7 (corpus breadth):** After corpus re-extraction, `SELECT COUNT(DISTINCT report_id) FROM bctc_page_zones` = 18 (all 18 docs have zone data stored). Verified via direct-DB query.

---

## 5. Hard Constraints Carried Into Every Handoff

1. **No third-party API calls for PDFs/page-images.** Local Tesseract / PIL / OpenCV / pdf2image only. grep-auditable. Violation is a blocking defect.

2. **One Tesseract pass per page.** Tier 0 uses stored OCR text + PIL pixel ops (50 DPI projection). Tier 2 uses `image_to_data` once per page (200 DPI). No additional Tesseract invocations.

3. **Sequential single-doc re-extract.** `POST /extract-layout-first` processes one document. `run_bctc_batch_sweep` is never invoked. Host: 16GB Mac, no GPU, Docker 8GB cap.

4. **`text_table_extractor.py` is 0-byte-diff.** Verified by `git diff HEAD -- apps/pdf-extractor/infrastructure/text_table_extractor.py` at LF-QA time.

5. **mcp-server is sole write-owner of market.db.** pdf-extractor pushes via HTTP. Never writes to DB directly.

6. **Direct market.db query is the arbiter, NOT the endpoint.** `docker compose exec -T mcp-server bun -e` + `require("bun:sqlite")`. sqlite3 is not installed in containers.

7. **Done-bar is multi-doc corpus pass-rate + user verbal G9.** Not fixture-green, not one-doc, not endpoint check alone.

---

## 6. Risk Flags

| Risk | Severity | Mitigation |
|---|---|---|
| Tier 0 50-DPI raster fails on low-contrast or rotated pages | HIGH | Fallback: if projection profile produces < 2 distinct gutter positions, mark page as `prose` (conservative — no table extraction) and proceed. Log as WARNING. |
| Continuation-page column count differs from schema-page (e.g. page break mid-table with a new summary column) | HIGH | If inherited `gutter_count` != detected `gutter_count` for a continuation page, do NOT quarantine immediately — instead flag `schema_mismatch=true` in the unit and attempt OCR with the inherited schema. Let Tier 3 gate decide. |
| Balance identity heuristic fires false-positive on non-balance-sheet units (e.g. notes with 3-digit reference codes) | MEDIUM | Invariant 1 is gated on `code_range >= 100 AND max_code >= 400`. Cash-flow codes use a different range (500–650) — they will have this invariant skipped with `balance_check_skipped=true`. |
| `pdfplumber` page-count call fails (already has fallback in existing `_count_pages`) | LOW | Existing fallback to `pdfinfo_from_path` is in place. |
| Zone overlay canvas/SVG coordinate system diverges from the actual rendered page image dimensions | MEDIUM | The `image_width_px` and `image_height_px` in the zone JSON are the 200-DPI dimensions used for OCR. The inspector may render the PDF at a different display scale. The overlay JS MUST scale the zone coordinates by `(display_width / image_width_px)`. This scaling contract must be explicit in the `bctcInspectHandler.ts` implementation. |
| Memory footprint of 46-page Tier 0 (50 DPI rasters) | LOW | 46 pages × ~110KB = ~5MB. Well within the 8GB Docker cap. Pages released immediately after fingerprint computation. |
| DDD violation: new domain logic placed in infrastructure | MEDIUM | `build_document_map()` and the invariant checkers MUST live in `domain/` (pure functions, no I/O). The infrastructure module calls them as adapters. Import linter fence enforces this — the fence was already confirmed passing at the end of the pdf-extractor pilot. |

---

## 7. Files NOT Touched (Frozen Surfaces)

- `apps/pdf-extractor/sandbox/runner.py` — frozen
- `docs/data/pilot-status-pdf-extractor.json` — frozen
- `apps/pdf-extractor/dashboard/` trust-contract spec/png — frozen
- `apps/pdf-extractor/infrastructure/text_table_extractor.py` — 0-byte-diff, frozen
- `apps/mcp-server/src/interface/mcp/routes/pushBctcMdTablesHandler.ts` — unchanged (old endpoint stays live for backward compat)
- `apps/mcp-server/src/interface/mcp/routes/bctcInspectMdHandler.ts` — unchanged

---

## 8. Parallelism Decision

**LF-EXTRACT and LF-OVERLAY CAN be dispatched in parallel**, subject to one condition: this brief provides the full JSON contract (§3.2), the exact DDL (§3.1), and the exact endpoint name (`POST /api/push-bctc-layout`). Both dev agents can implement their side independently against the contract without waiting for the other agent's code to exist. The mcp-server tests (1272, 1273) use an injected in-memory DB and do NOT require pdf-extractor to be running.

**Parallelism gate:** LF-EXTRACT must be DONE (code committed + pdf-extractor image rebuilt) before LF-DEPLOY can run the actual single-doc re-extraction. LF-OVERLAY must be DONE before the overlay can be visually verified. But both LF-EXTRACT and LF-OVERLAY can ship their code + pass their own tests independently.

**Recommended dispatch:** dispatch both in parallel immediately. PM should note that LF-DEPLOY is gated on BOTH being done.
