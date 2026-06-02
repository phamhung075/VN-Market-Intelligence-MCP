# Handoff: LF-OVERLAY

**Task ID:** LF-OVERLAY  
**Owner:** dev-mcp-server  
**Zone:** apps/mcp-server/  
**Size:** M  
**Sprint:** BCTC-LAYOUT-FIRST Phase 0  
**Depends on:** LF-EXTRACT (code must exist before this ships, but testing is independent via contract)  
**Architect Brief:** docs/architecture-briefs/2026-05-26-bctc-layout-first-pipeline.md (§3.2 frozen JSON contract, §4.2 AC-LFO-0..7)

---

## Scope

Add the new DB schema (`bctc_layout_units` and `bctc_page_zones` DDL), the push handler for layout data (`handlePushBctcLayout`), and the ON/OFF toggle overlay to `bctcInspectHandler.ts`. The overlay reads zone geometry from the DB and renders colored SVG overlays on rendered pages. **The DB is read-only for the overlay—zero writes to `bctc_table_rows` or `bctc_balance_checks`.**

---

## Files to Create/Modify

| File | Action | DDD Layer |
|---|---|---|
| `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` | EXTEND. Add `bctc_layout_units` and `bctc_page_zones` DDL (see brief §3.1). Use `CREATE TABLE IF NOT EXISTS` + additive migration pattern consistent with existing column-add guards. | Infrastructure |
| `apps/mcp-server/src/interface/mcp/routes/pushBctcLayoutHandler.ts` | NEW. `handlePushBctcLayout` — receives the JSON contract (§3.2), validates `report_id` as UUID, writes to `bctc_layout_units` (INSERT OR REPLACE per unit_id) and `bctc_page_zones` (INSERT OR REPLACE per page_number). **Zero writes** to `bctc_table_rows`, `bctc_balance_checks`, or `bctc_md_tables`. | Interface |
| `apps/mcp-server/src/interface/mcp/server.ts` | EXTEND. Register `POST /api/push-bctc-layout` → `handlePushBctcLayout`. | Interface |
| `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` | EXTEND. Add: (1) new `GET /api/bctc-inspect/zones/{doc_id}?page=N` route that returns `zones_json` from `bctc_page_zones`; (2) ON/OFF toggle control in the HTML viewer (client-side JS only); (3) overlay rendering using zone JSON coordinates (draw colored SVG/canvas overlays on rendered page image). **Do NOT touch** the `bctc_table_rows` read path, the balance badge, or any structured-data logic. | Interface + Infrastructure (DB read) |
| `apps/mcp-server/src/__tests__/1272-push-bctc-layout.test.ts` | NEW. Tests: (a) valid payload writes correct rows to `bctc_layout_units` + `bctc_page_zones`; (b) quarantined unit stored with `quarantined=1`; (c) duplicate push is idempotent (INSERT OR REPLACE); (d) missing `report_id` returns 400; (e) handler touches ONLY the two new tables (zero cross-table write). Injected in-memory DB, zero credentials, zero network. | Test |
| `apps/mcp-server/src/__tests__/1273-bctc-inspect-overlay.test.ts` | NEW. Tests: (a) `GET /api/bctc-inspect/zones/{doc_id}?page=N` returns zones_json from DB; (b) returns 404 when no zone data found; (c) handler does NOT call pdf-extractor (pure DB read). | Test |

**FROZEN — Do NOT touch:**
- `bctc_table_rows` read path in `bctcInspectHandler.ts`
- `bctc_balance_checks` read path
- Balance badge logic
- `bctcInspectMdHandler.ts` (the old md-tables handler)
- `pushBctcMdTablesHandler.ts` (the old md push handler)

---

## Frozen Service Boundary Contract (§3.2)

**Incoming request payload (pdf-extractor → mcp-server):**  
See LF-EXTRACT.md for the exact frozen JSON structure sent to `POST /api/push-bctc-layout`.

**Key contract points:**
- `col_0`, `col_1`, etc. are positional—NO semantic labels
- `unit_hints` is metadata only—never used for overlay decisions
- `column_gutters` describe text columns (regions between gutters), not the whitespace
- Continuation pages' `column_gutters` are **identical to schema-page** (inherited)
- All coordinates in pixels at 200 DPI, origin top-left
- `unit_boundary_after_page=true` marks the last page of a unit

**Outgoing response:** `{ "ok": true, "units_stored": 8, "pages_stored": 18 }`

---

## DB Schema (§3.1)

### `bctc_layout_units` table

```sql
CREATE TABLE IF NOT EXISTS bctc_layout_units (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id           TEXT    NOT NULL,
  unit_id             TEXT    NOT NULL,
  schema_page         INTEGER NOT NULL,
  page_numbers_json   TEXT    NOT NULL,
  page_type           TEXT    NOT NULL DEFAULT 'table',
  stitched_markdown   TEXT    NOT NULL DEFAULT '',
  row_count           INTEGER NOT NULL DEFAULT 0,
  quarantined         INTEGER NOT NULL DEFAULT 0,
  quarantine_reason   TEXT,
  document_map_json   TEXT,
  extracted_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(report_id, unit_id)
);
CREATE INDEX IF NOT EXISTS idx_blu_report ON bctc_layout_units(report_id);
CREATE INDEX IF NOT EXISTS idx_blu_quarantine ON bctc_layout_units(report_id, quarantined);
```

### `bctc_page_zones` table

```sql
CREATE TABLE IF NOT EXISTS bctc_page_zones (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id             TEXT    NOT NULL,
  page_number           INTEGER NOT NULL,
  unit_id               TEXT    NOT NULL,
  page_type             TEXT    NOT NULL,
  is_schema_page        INTEGER NOT NULL DEFAULT 0,
  is_continuation_page  INTEGER NOT NULL DEFAULT 0,
  schema_inherited_from_page INTEGER,
  zones_json            TEXT    NOT NULL,
  extracted_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(report_id, page_number)
);
CREATE INDEX IF NOT EXISTS idx_bpz_report ON bctc_page_zones(report_id, page_number);
CREATE INDEX IF NOT EXISTS idx_bpz_unit   ON bctc_page_zones(unit_id);
```

**QA direct-query for pass-rate (corpus-wide):**

```javascript
docker compose exec -T mcp-server bun -e '
const { Database } = require("bun:sqlite");
const db = new Database("/app/data/market.db", { readonly: true });
const rows = db.query(
  "SELECT report_id, quarantined, COUNT(*) as cnt FROM bctc_layout_units GROUP BY report_id, quarantined ORDER BY report_id"
).all();
console.log(JSON.stringify(rows, null, 2));
'
```

---

## Acceptance Criteria (AC-LFO)

**AC-LFO-0 (toggle present):**

```bash
curl -s http://localhost:3000/api/bctc-inspect
```

Must return HTML containing a toggle control element (identifiable by a data attribute or id such as `data-zone-toggle` or `id="zone-overlay-toggle"`).

**AC-LFO-1 (zones endpoint returns data):** After LF-EXTRACT has run on FPT Q1 2026:

```bash
curl -s "http://localhost:3000/api/bctc-inspect/zones/e8ea3df5-3f32-413d-a3eb-c71634c0438d?page=3"
```

Must return JSON with `column_gutters` containing entries with `col_id` values matching the positional `col_0` / `col_1` pattern. Zero semantic labels.

**AC-LFO-2 (no pdf-extractor import):**

```bash
grep -rn "from.*pdf.extractor\|import.*pdf.extractor\|pdf_extractor" apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts
```

Must return zero matches. The overlay renderer reads from DB only.

**AC-LFO-3 (structured path non-regression):** After overlay is added:

```bash
curl -s http://localhost:3000/api/bctc-inspect/table/e71f845d-ffa5-48f9-8f09-30ac2cd09c65
```

Must still return the structured table rows with `balance_pass=true`. Direct-DB verification:

```sql
SELECT balance_pass FROM bctc_balance_checks WHERE report_id='e71f845d...'
```

Must return `1`.

**AC-LFO-4 (new tables, zero cross-write):** In the `1272-push-bctc-layout.test.ts` test, after `handlePushBctcLayout` processes a valid payload:
- `SELECT COUNT(*) FROM bctc_layout_units` > 0
- `SELECT COUNT(*) FROM bctc_page_zones` > 0
- `SELECT COUNT(*) FROM bctc_table_rows` = 0 (zero cross-write to structured path)

**AC-LFO-5 (idempotent push):** Two successive `POST /api/push-bctc-layout` calls with the same `report_id` and `unit_id` result in exactly the same DB state as one call:

```sql
SELECT COUNT(*) FROM bctc_layout_units WHERE report_id='...' AND unit_id='...'
```

Must return `1` after both pushes.

**AC-LFO-6 (zone types visually distinct):** The HTML overlay code (in `bctcInspectHandler.ts`) assigns at least two distinct CSS colors or SVG stroke styles to zone types: one for `column_gutters`, one for `row_bands`, one for `header_band` / `footer_band`. Code-inspectable without running the browser.

**AC-LFO-7 (corpus breadth):** After corpus re-extraction:

```sql
SELECT COUNT(DISTINCT report_id) FROM bctc_page_zones
```

Must = 18 (all 18 docs have zone data stored).

---

## Baseline Pass Conditions

- `POST /api/push-bctc-layout` endpoint exists and accepts the frozen JSON contract
- `GET /api/bctc-inspect/zones/{doc_id}?page=N` endpoint exists and returns zones_json
- Toggle control present in bctcInspectHandler HTML
- All new unit tests pass (1272, 1273)
- Zero writes to `bctc_table_rows` or `bctc_balance_checks`

---

## Definition of Done

1. Code committed to main (scoped commit, no git add -A; no --force)
2. All 7 AC-LFO criteria verified
3. `GET /api/bctc-inspect/table/{doc_id}` still returns structured rows (AC-LFO-3 verified)
4. All new tests pass (1272-push-bctc-layout, 1273-bctc-inspect-overlay)
5. Handoff signals DONE to PM

---

## CRITICAL SERIALIZATION NOTE

**LF-EXTRACT and LF-OVERLAY are CODE-independent** (frozen contract decouples them), but **they share this session's single git index**. They MUST be implemented with **SERIALIZED commits** (not concurrent). The router will dispatch **dev-pdf-extractor first**, then **dev-mcp-server second**. Do NOT commit concurrently.

**Testing note:** `1272-push-bctc-layout.test.ts` and `1273-bctc-inspect-overlay.test.ts` use injected in-memory databases and do NOT require pdf-extractor to be running. You can test LF-OVERLAY independently, but pdf-extractor's code must be committed first before you commit LF-OVERLAY (git order).

---

## Integration with Structured Path

The overlay is a **read-only visualization layer** on top of the new tables. The structured path (`bctc_table_rows`, `bctc_balance_checks`, `bctcInspectHandler.ts` table route) is **completely untouched**. Tests must prove zero cross-write (AC-LFO-4).

---

## Overlay Rendering Coordinate System (Binding for visual correctness)

- **Origin:** top-left corner of the rendered page image at `image_dpi` (200 DPI)
- **Unit:** pixels (integer)
- **Coordinate form:** `x_min`, `x_max`, `y_min`, `y_max`
- **Column gutters:** describe text columns (regions BETWEEN gutters), not whitespace
- **Rendering scaling:** if the display renders the PDF at a different scale than 200 DPI, the overlay JS MUST scale zone coordinates by `(display_width / image_width_px)`. This scaling contract must be explicit in the implementation

---

## Reference

- **Full brief:** docs/architecture-briefs/2026-05-26-bctc-layout-first-pipeline.md
- **DB schema (§3.1):** docs/architecture-briefs/2026-05-26-bctc-layout-first-pipeline.md §3.1
- **JSON contract (§3.2):** docs/architecture-briefs/2026-05-26-bctc-layout-first-pipeline.md §3.2
- **Risk flags (§6):** docs/architecture-briefs/2026-05-26-bctc-layout-first-pipeline.md §6
- **Parallelism decision (§8):** docs/architecture-briefs/2026-05-26-bctc-layout-first-pipeline.md §8

---

**Handed off by:** PM  
**Date:** 2026-06-03  
**Expected completion:** Within current sprint (BCTC-LAYOUT-FIRST Phase 0)  
**Blocked by:** LF-EXTRACT must be DONE before code pushes

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts:157-197` — Added `bctc_layout_units` + `bctc_page_zones` DDL with indices per §3.1
  - `apps/mcp-server/src/interface/mcp/routes/pushBctcLayoutHandler.ts` — NEW: POST /api/push-bctc-layout handler with DELETE-before-INSERT idempotency, UUID validation, zero cross-write
  - `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts:845-925` — EXTENDED: GET /api/bctc-inspect/zones/{doc_id}?page=N pure DB read handler
  - `apps/mcp-server/src/interface/mcp/server.ts:426-517` — EXTENDED: registered POST /api/push-bctc-layout + GET /api/bctc-inspect/zones/ routes
  - `apps/mcp-server/src/interface/bctc-inspector.html:457-464,874-877,2167-2340` — EXTENDED: zone-overlay toggle (id="zone-overlay-toggle") + SVG overlay renderer with 5 distinct color classes
- **Tests written:**
  - `apps/mcp-server/src/__tests__/1272-push-bctc-layout.test.ts` — 25 assertions, GREEN (AC-LFO-4, AC-LFO-5, idempotency, cross-write guard, prose persistence, write-wedge detection)
  - `apps/mcp-server/src/__tests__/1273-bctc-inspect-overlay.test.ts` — 9 assertions, GREEN (AC-LFO-1, AC-LFO-2, positional col_id, 404 handling)
  - **Total: 34 tests, 62 expect() calls, 0 fail**
- **Git commits:** `2326ebb6 feat(mcp-server): LF-OVERLAY — bctc_layout_units+bctc_page_zones DDL, POST /api/push-bctc-layout, on/off geometric-zone overlay on /api/bctc-inspect (29 tests green)` + subsequent BTB-PERSIST-FIX additions
- **Type check:** clean (bun tsc --noEmit, exit 0)
- **bun test (BCTC regression battery):** 128 pass / 0 fail (9 test files: 042/043/044/045 BCTC + 1270/1271 MD-INSPECT + 1272/1273 LF-OVERLAY + PI3-bctc-inspect)
- **Tool count:** 158 tools — pre-task baseline unchanged (LF-OVERLAY adds 0 tools, only HTTP routes)
- **Scheduler count:** 70 cron.schedule entries — unchanged
- **Docs updated:** NONE (no mcp-server architecture doc changes needed; additive routes)
- **Graphify:** skipped (no docs impacted)
- **Ops rebuild required:** YES — container must be rebuilt for POST /api/push-bctc-layout and GET /api/bctc-inspect/zones/ to be live

## AC-LFO Checklist (0-7)

| AC | Status | Evidence |
|---|---|---|
| AC-LFO-0 (toggle present) | MET | `id="zone-overlay-toggle" data-zone-toggle="true"` in bctc-inspector.html:877 |
| AC-LFO-1 (zones endpoint returns data) | MET (code) | handleBctcInspectZones registered at GET /api/bctc-inspect/zones/; 1273 test confirms zones_json + col_id pattern; live verify requires LF-EXTRACT run + container rebuild |
| AC-LFO-2 (no pdf-extractor import) | MET | grep returns 0 actual import lines; 3 comment-only matches; confirmed by import audit |
| AC-LFO-3 (structured path non-regression) | MET | 128 BCTC regression tests pass 0 fail; bctc_table_rows read path + bctc_balance_checks untouched (frozen files 0-diff confirmed) |
| AC-LFO-4 (zero cross-write) | MET | Test (f) in 1272: bctc_table_rows=0, bctc_balance_checks=0 after push; DELETE in handler only touches bctc_layout_units/bctc_page_zones |
| AC-LFO-5 (idempotent push) | MET | Tests (c) + (h-DV): double-push with same UUIDs = count 2 not 4; re-push with new UUIDs = old rows removed, new rows present |
| AC-LFO-6 (zone types visually distinct) | MET | 5 distinct color classes: headerBand/#ffc850, footerBand/#ff8c3c, gutterEven/#50a0ff, gutterOdd/#50dca0, rowBand/#c864dc, unitBoundary/red. Code-inspectable at bctc-inspector.html:2170-2174 |
| AC-LFO-7 (corpus breadth = 18 report_ids) | OPEN | Requires LF-EXTRACT corpus re-extraction (18 docs); blocked on LF-EXTRACT image rebuild + LF-DEPLOY |

**Status: DONE-PENDING-REBUILD** (ops must rebuild mcp-server image; LF-DEPLOY gates AC-LFO-1 live verify + AC-LFO-7)
