# Handoff: LF-EXTRACT

**Task ID:** LF-EXTRACT  
**Owner:** dev-pdf-extractor  
**Zone:** apps/pdf-extractor/  
**Size:** M  
**Sprint:** BCTC-LAYOUT-FIRST Phase 0  
**Architect Brief:** docs/architecture-briefs/2026-05-26-bctc-layout-first-pipeline.md (§3.2 frozen JSON contract, §4.1 AC-LFE-0..11)

---

## Scope

Replace the per-page algorithm in `generic_md_table_extractor.py` with the Tier 0–3 layout-first pipeline. The new pipeline groups consecutive pages into logical units using geometric column-fingerprint continuity (Tier 0), decomposes each table page into header/footer/column/row zones (Tier 1), OCRs the grid and stitches pages together (Tier 2), and gates each unit with structural invariants (Tier 3). Add the `LayoutFirstPushClient` to push results to `/api/push-bctc-layout` on mcp-server.

**CRITICAL CONSTRAINT:** All domain logic and invariant checkers must live in `domain/` (pure functions, zero I/O). Infrastructure calls them. Import linter fence enforces this. Tier 0 uses stored OCR text + PIL pixel ops only—**no Tesseract call**. Tier 2 uses **exactly one** `pytesseract.image_to_data` per page.

---

## Files to Create/Modify

| File | Action | DDD Layer |
|---|---|---|
| `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` | REPLACE internal algorithm (keep class/filename for import compat; add `build_document_map()`, `zone_page()`, `ocr_unit()`, `gate_unit()` as module-level pure functions). | Infrastructure (OCR, PIL, projection) + Domain logic (grouping rules, invariant checks) |
| `apps/pdf-extractor/application/extract_layout_first_usecase.py` | NEW. Orchestrates Tier 0 → Tier 1 → Tier 2 → Tier 3 → push. Triggered by `POST /extract-layout-first`. | Application |
| `apps/pdf-extractor/infrastructure/layout_first_push_client.py` | NEW. `LayoutFirstPushClient` — HTTP push to `POST /api/push-bctc-layout`. Same pattern as `MdTablePushClient`. | Infrastructure |
| `apps/pdf-extractor/domain/primitives/layout_invariants/primitive.py` | NEW. Pure functions: `check_balance_identity(rows)`, `check_codes_monotonic(rows)`, `check_no_orphan_rows(rows)` → each returns `(pass: bool, reason: str)`. | Domain |
| `apps/pdf-extractor/domain/modules/financial_reports/ports.py` | EXTEND. Add `LayoutFirstPushClientPort`, `DocumentMapBuilderPort`. | Domain (ports) |
| `apps/pdf-extractor/main.py` | EXTEND. Wire new use case + clients at composition root. Add `POST /extract-layout-first` route. **Keep** `/extract-md-tables` (backward compat). | Interface |
| `apps/pdf-extractor/__tests__/unit/test_layout_invariants.py` | NEW. Unit tests for invariant checkers. Injected fakes—zero Tesseract. | Test |
| `apps/pdf-extractor/__tests__/unit/test_document_map.py` | NEW. Unit tests for `build_document_map()` with injected fingerprint data. | Test |
| `apps/pdf-extractor/__tests__/unit/test_schema_inheritance.py` | NEW. Confirms page 5 uses page 3's column schema when `unit_schema` is injected. | Test |

**FROZEN — 0-byte-diff:**
- `apps/pdf-extractor/infrastructure/text_table_extractor.py`
- `apps/pdf-extractor/sandbox/runner.py`
- `docs/data/pilot-status-pdf-extractor.json`

---

## Frozen Service Boundary Contract (§3.2)

**New endpoint: `POST /api/push-bctc-layout`**

Request payload (pdf-extractor → mcp-server) — **exact JSON structure mandatory:**

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

**Response (mcp-server → pdf-extractor):** `{ "ok": true, "units_stored": 8, "pages_stored": 18 }`

**Key invariants in contract:**
- `col_0`, `col_1`, etc. are positional only—NO semantic labels
- `unit_hints` is metadata only—never used for grid decisions
- `column_gutters` describe text columns (regions between gutters), not the gutters themselves
- Continuation pages' `column_gutters` are **identical to schema-page** (inherited—overlay can verify this)
- All coordinates in pixels at 200 DPI, origin top-left, binding for overlay rendering
- `unit_boundary_after_page=true` marks the last page of a unit (overlay draws distinct line)

---

## Acceptance Criteria (AC-LFE)

**AC-LFE-0 (grep-proof):** No Vietnamese semantic labels in code paths that make zone-boundary or column-grid decisions.

```bash
grep -rn "BẢNG CÂN ĐỐI\|LƯU CHUYỂN\|NGUỒN VỐN\|Mã số\|Thuyết minh" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py
```

Must return ZERO matches in any branching logic. Matches permitted only in docstring comment blocks explaining why anchors are hints.

**AC-LFE-1 (document-map JSON emitted):** Calling the layout-first endpoint on FPT Q1 2026 (`report_id=e8ea3df5-3f32-413d-a3eb-c71634c0438d`) causes mcp-server to store zone records for pages 3, 4, 5, and 6 in `bctc_page_zones`. Direct-DB:

```sql
SELECT page_number, unit_id, is_continuation_page FROM bctc_page_zones 
WHERE report_id='e8ea3df5-3f32-413d-a3eb-c71634c0438d' AND page_number IN (3,4,5,6)
```

Must return 4 rows with the same `unit_id`.

**AC-LFE-2 (schema inheritance — the root-cause fix):** For FPT Q1 2026 page 5:

```sql
SELECT schema_inherited_from_page FROM bctc_page_zones 
WHERE report_id='e8ea3df5...' AND page_number=5
```

Must return `3` (inherits from schema-page 3, not self-detected).

**AC-LFE-3 (page-41 is prose):** For FPT Q1 2026:

```sql
SELECT page_type FROM bctc_page_zones 
WHERE report_id='e8ea3df5...' AND page_number=41
```

Must return `'prose'` or `'blank'`—NOT the same unit as the balance-sheet pages. Proves geometry is the spine.

**AC-LFE-4 (FPT Q1 NGUỒN VỐN present in stitched output):**

```sql
SELECT stitched_markdown FROM bctc_layout_units 
WHERE report_id='e8ea3df5...' AND schema_page=3
```

Result contains numeric values in the expected column positions for the code-300 area (liabilities total). The row is NOT missing or scrambled.

**AC-LFE-5 (corpus breadth):** After sequential re-extraction of all 18 docs:

```sql
SELECT COUNT(*) FROM bctc_layout_units
```

Must be > 0 AND 

```sql
SELECT COUNT(DISTINCT report_id) FROM bctc_layout_units
```

Must = 18. Pass-rate:

```sql
SELECT COUNT(*) FROM bctc_layout_units WHERE quarantined=0 
/ SELECT COUNT(*) FROM bctc_layout_units
```

This must be a MEASURED value, not assumed 100%.

**AC-LFE-6 (one Tesseract pass per page):** In `extract_layout_first_usecase.py`, there is exactly one call to `pytesseract.image_to_data` per page per unit (in Tier 2). Tier 0 uses only PIL pixel operations + stored OCR text—no Tesseract call. Audit:

```bash
grep -n "image_to_data\|image_to_string\|run_tesseract" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py
```

All matches must occur in functions called in the Tier 2 path only, not Tier 0.

**AC-LFE-7 (structured path non-regression):**

```bash
git diff HEAD -- apps/pdf-extractor/infrastructure/text_table_extractor.py
```

Must produce zero output. Direct-DB after re-extraction:

```sql
SELECT balance_pass FROM bctc_balance_checks WHERE report_id='e71f845d-ffa5-48f9-8f09-30ac2cd09c65'
```

Must return `1`.

**AC-LFE-8 (local tools only):** No external API calls for PDFs or text extraction.

```bash
grep -rn "requests.post\|httpx\|aiohttp\|openai\|anthropic\|google\|textract\|document.ai" apps/pdf-extractor/
```

Must return zero matches in any extraction code path.

**AC-LFE-9 (sequential re-extract):** `POST /extract-layout-first` processes exactly one document per call. No parallel extraction. `run_bctc_batch_sweep` is never invoked.

**AC-LFE-10 (sandbox green):**

```bash
docker compose exec -T pdf-extractor python apps/pdf-extractor/sandbox/runner.py
```

Must exit 0. No sandbox modification required.

**AC-LFE-11 (quarantined unit count queryable):** After corpus re-extraction:

```sql
SELECT quarantined, COUNT(*) as cnt FROM bctc_layout_units GROUP BY quarantined
```

Must return at least one row with `quarantined=1`—proving the quarantine path is exercised, not dead code.

---

## Baseline Pass Conditions

- `POST /extract-layout-first` endpoint exists and accepts the frozen JSON contract
- Sandbox runner exits 0 (no modifications to runner.py or test structure)
- `text_table_extractor.py` unchanged (0-byte-diff verified via git)
- All new unit tests pass (layout invariants, document map, schema inheritance)

---

## Definition of Done

1. Code committed to main (scoped commit, no git add -A; no --force)
2. All 11 AC-LFE criteria verified
3. Sandbox exits 0
4. `git diff HEAD -- apps/pdf-extractor/infrastructure/text_table_extractor.py` produces zero output
5. Corpus breadth measured (18 reports, pass-rate recorded in AC-LFE-5)
6. Handoff passed to LF-OVERLAY (dependent task)

---

## CRITICAL SERIALIZATION NOTE

**LF-EXTRACT and LF-OVERLAY are CODE-independent** (frozen contract decouples them), but **they share this session's single git index**. They MUST be implemented with **SERIALIZED commits** (not concurrent). The router will dispatch **dev-pdf-extractor first**, then **dev-mcp-server second**. Do NOT commit concurrently.

Each agent will:
1. Read this handoff + frozen contract
2. Implement their side independently
3. Create a scoped commit (only their zone files)
4. Signal DONE to PM

PM will verify both are DONE before dispatching LF-DEPLOY.

---

## Fence & Import Rules

The import linter fence is already passing for pdf-extractor. Maintain the constraint:
- `domain/` layer: pure functions (no I/O, no Tesseract, no network)
- `application/` layer: orchestration (calls domain and infrastructure ports)
- `infrastructure/` layer: I/O (Tesseract, PIL, HTTP clients)

Tier 0 computation (`build_document_map()`) must live in `domain/`, not infrastructure.

---

## Reference

- **Full brief:** docs/architecture-briefs/2026-05-26-bctc-layout-first-pipeline.md
- **DB schema (§3.1):** docs/architecture-briefs/2026-05-26-bctc-layout-first-pipeline.md §3.1
- **Risk flags (§6):** docs/architecture-briefs/2026-05-26-bctc-layout-first-pipeline.md §6
- **Parallelism decision (§8):** docs/architecture-briefs/2026-05-26-bctc-layout-first-pipeline.md §8

---

**Handed off by:** PM  
**Date:** 2026-06-03  
**Expected completion:** Within current sprint (BCTC-LAYOUT-FIRST Phase 0)
