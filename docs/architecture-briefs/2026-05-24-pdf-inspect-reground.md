# PDF-INSPECT Re-ground Architecture Brief

**Date:** 2026-05-24 | **Author:** Architect | **Status:** FINAL — replaces PI-1 design
**Trigger:** Recurring-bug-escalation — 2nd "verified-against-assumed-reality-not-real-data" defect this session.

---

## 1. The Defect — What PI-1 Got Wrong

PI-1 ruled: "SINGLE ZONE — right pane = this service's own extraction data."

This ruling was false. PI-1 never verified what data actually exists in the prod volume.
Ground-truth docker exec revealed:

| Data source PI-1 designed to | Reality |
|------------------------------|---------|
| `pdf_extractor.db` table `pdf_documents` | 15,570 rows, ALL `status=failed`, 0 with `pdf_path`, URLs almost entirely `https://example.com/x.pdf`, `error-page`, `missing.pdf`. Schema: `id, url, source_type, status, extracted_at, pdf_path` only. No text, no ticker, no tables. This is a polluted test/pilot status table. NOT a document registry. |
| `/app/data/extractions/{doc_id}.json` | 0 files exist. Production never writes here. |
| Dropdown shows | 15,552 junk entries, nothing renders in either pane. |

The viewer was empty on real data because it was reading junk tables that production never writes.

---

## 2. Real Data — Ground Truth (design to this)

All real data lives in `market.db` at `/app/data/market.db` — mcp-server's DB.
Both containers mount `market_data:/app/data` so the volume is shared.

### `financial_reports` — 14 real rows (the document registry + parsed figures)

Relevant columns (from `apps/mcp-server/bctc-schema.ts` SQLITE_DDL, verified):

```
id                    TEXT PRIMARY KEY
action_code           TEXT NOT NULL          -- ticker e.g. "VCB"
company_name          TEXT NOT NULL
exchange              TEXT NOT NULL          -- HOSE | HNX | UPCOM
period_year           INTEGER NOT NULL
period_quarter        INTEGER                -- NULL = annual
period_type           TEXT NOT NULL          -- Q1 | Q2 | Q3 | Q4 | ANNUAL
period_start          TEXT NOT NULL          -- ISO date
period_end            TEXT NOT NULL          -- ISO date
sort_key              TEXT NOT NULL          -- "2024-Q1"
ssc_url               TEXT                  -- SSC portal URL (may be null)
pdf_path              TEXT                  -- LOCAL FILE PATH on disk (key column)
parsed_at             TEXT NOT NULL
extraction_confidence REAL
net_revenue           REAL                  -- million VND
gross_profit          REAL
net_profit            REAL                  -- often wrong (decimal-shift bug target)
eps                   REAL
net_margin_pct        REAL
net_profit_api_bridge REAL                  -- vnstock bridge (more reliable)
ocr_confidence        REAL
confidence_financial  REAL
ai_summary            TEXT
```

`pdf_path` is populated by `fetchParseAndStoreBctc.ts` line 404:
`report.source.pdfPath = join(process.cwd(), "data", "pdfs", normFilename)`

`normaliseFilename()` preserves the actual VPS-origin filename if it contains the action_code,
otherwise falls back to `{TICKER}_{YEAR}_{QUARTER}.pdf`. This means `pdf_path` contains
the REAL messy path, e.g.:
- `/app/data/pdfs/20250429-VCB-Bao-cao-tai-chinh-hop-nhat-Quy-1-nam-2025_signed.pdf`
- `/app/data/pdfs/BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf`
- `/app/data/pdfs/VCB_2025_Q1.pdf` (canonical form, the minority)

`financial_reports.pdf_path` is the authoritative join key from doc → disk file.
No heuristic scan needed. The column IS populated for real rows.

### `pdf_extracted_text` — 819 real rows (page-by-page OCR text)

Schema (from `schema-financial-reports.ts` DDL, verified):

```
id            INTEGER PRIMARY KEY AUTOINCREMENT
filename      TEXT NOT NULL                -- messy real filename e.g. "VCB_2025_Q1.pdf"
page_number   INTEGER NOT NULL
text_content  TEXT NOT NULL DEFAULT ''
confidence    REAL NOT NULL DEFAULT 0
extracted_at  TEXT NOT NULL DEFAULT (datetime('now'))
action_code   TEXT NOT NULL DEFAULT ''    -- ticker, Task 1002 column
UNIQUE(filename, page_number)
```

Join key: `basename(financial_reports.pdf_path) = pdf_extracted_text.filename`
(mcp-server writes `filename = basename(filePath)` when storing OCR pages)

### On-disk PDFs

17 real PDFs at `/app/data/pdfs/` with MESSY filenames. `financial_reports.pdf_path`
already contains the correct absolute path for each real document.

---

## 3. Cross-Zone Ownership Ruling — Option B: Move Inspector to mcp-server

### Options evaluated

**Option A — pdf-extractor opens `market.db` READ-ONLY from the shared volume**
- Pragmatic (one container, no new HTTP route).
- Smell: pdf-extractor has ZERO business ownership of `financial_reports`. It does not
  own that table, does not know its schema evolution, and opens another service's primary
  write DB from a different process. SQLite WAL on Docker named volume under concurrent
  write (mcp-server) + read (pdf-extractor inspector) = risk of lock timeout and
  transaction serialization failure at read time. Non-negligible on active reporting cycles.
- VERDICT: rejected. The layering violation is real, not cosmetic.

**Option B — Inspector belongs in mcp-server**
- `financial_reports` + `pdf_extracted_text` are mcp-server's own tables.
- PDFs at `/app/data/pdfs/` are written by `bctcPdfPullJob` (mcp-server scheduler).
- `pdf_path` in `financial_reports` is set by `fetchParseAndStoreBctc` (mcp-server).
- `pdf_extracted_text` is written by `pdfOcrWorker` / `server-startup.ts` (mcp-server).
- The viewer IS a read-only UI over mcp-server's own BCTC data store.
- Pattern precedent: `newsFetchLiveHandler.ts` added a GET read-only route to mcp-server
  to view live news data. Same architectural pattern applies here.
- VERDICT: CHOSEN. Implementation owner = dev-mcp-server.

**Option C — mcp-server HTTP endpoint feeds pdf-extractor viewer**
- Three-tier HTTP chain: browser → pdf-extractor → mcp-server → browser.
- Over-engineered cross-service plumbing for a dev-only inspection tool.
- VERDICT: rejected.

### PI-1 ruling error diagnosis

PI-1 assumed "data is pdf-extractor's own" because the SPRINT_GOAL.md task spec
stated "Zone: apps/pdf-extractor/ ONLY". That constraint was written BEFORE anyone
verified whether real extraction data lives in pdf-extractor's DB — it does not.
The zone constraint was based on an incorrect assumption about where data lives.

Correct stance: zone follows data ownership, not the other way around. The data
lives in mcp-server. The inspector lives in mcp-server.

---

## 4. Correct Data Wiring — Which Tables Feed Which Pane

### Document list (dropdown)

```sql
SELECT
  id,
  action_code,
  company_name,
  period_year,
  period_quarter,
  period_type,
  sort_key,
  pdf_path,
  ssc_url,
  net_revenue,
  net_profit,
  net_profit_api_bridge,
  gross_profit,
  net_margin_pct,
  extraction_confidence,
  ocr_confidence,
  confidence_financial,
  parsed_at
FROM financial_reports
WHERE pdf_path IS NOT NULL
  AND pdf_path != ''
  AND action_code NOT LIKE '%example%'
  AND action_code NOT LIKE '%error%'
  AND action_code NOT LIKE '%missing%'
ORDER BY parsed_at DESC
```

Filter `WHERE pdf_path IS NOT NULL` ensures only real docs with a known local path
appear. This yields the 14 real documents, not 15,552 junk entries.

Human label: `"{action_code} {period_type} {period_year}"` e.g. `"VCB Q1 2025"`.

### Left pane — PDF render

Source: `financial_reports.pdf_path` for the selected doc id.
Route: `GET /api/bctc-inspect/pdf/{doc_id}` — reads file at `financial_reports.pdf_path`
and streams `application/pdf` bytes.

The path stored in `pdf_path` is the ABSOLUTE path as written by `fetchParseAndStoreBctc`
(e.g. `/app/data/pdfs/20250429-VCB-...pdf`). No heuristic scan needed. Direct `open()`.

Honest-degrade: if `pdf_path` file does not exist on disk (stale path from pre-migration
era), return HTTP 404 with `{"error": "pdf_not_on_disk", "pdf_path": "<stored path>"}`.
The left pane shows "PDF not available at stored path" with the stored path visible for ops.

### Right pane — Extraction quality view

Two sub-sources, both from `market.db`:

**Sub-source 1 — Parsed financial figures from `financial_reports`:**
Display the key scalar columns side-by-side so the user can spot anomalies:

| Field | Column | Note |
|-------|---------|------|
| Net Revenue | `net_revenue` | million VND |
| Gross Profit | `gross_profit` | million VND |
| Net Profit (OCR) | `net_profit` | often wrong — decimal-shift target |
| Net Profit (API) | `net_profit_api_bridge` | more reliable vnstock bridge |
| Net Margin | `net_margin_pct` | percentage |
| OCR Confidence | `ocr_confidence` | 0–1 |
| Financial Confidence | `confidence_financial` | 0–1 |
| Extraction Confidence | `extraction_confidence` | 0–1 |
| Parsed At | `parsed_at` | ISO timestamp |

Visual alert: if `abs(net_profit - net_profit_api_bridge) / max(net_profit_api_bridge, 1) > 10`
(10x delta), flag row in amber — likely decimal-shift or unit error. This is the exact
`VNM net_profit=0.000051` case the user wants to catch.

**Sub-source 2 — Raw OCR text from `pdf_extracted_text`:**
```sql
SELECT page_number, text_content, confidence
FROM pdf_extracted_text
WHERE filename = ?       -- basename(financial_reports.pdf_path)
ORDER BY page_number ASC
LIMIT 50                 -- first 50 pages, paginated
```

The `filename` join key = `os.path.basename(financial_reports.pdf_path)`.
This is reliable: mcp-server writes `pdf_extracted_text.filename = basename(filePath)`
in `pdfOcrWorker.ts` and `server-startup.ts`.

Display: paginated text pane (page N of M). Each page shows `confidence` score.

Honest-degrade if no `pdf_extracted_text` rows for this filename: display
"No OCR text found for this document." alongside the figures section.

---

## 5. PDF-Filename → Doc Matching Strategy

**Primary strategy (preferred):** `financial_reports.pdf_path` IS the authoritative
path. No matching needed. Read it directly.

```
doc_id → SELECT pdf_path FROM financial_reports WHERE id = ?
       → open(pdf_path)  ← exact path, no guessing
```

**Honest-degrade tiers when pdf_path is stale:**

1. `pdf_path IS NULL or ''` → doc excluded from list (WHERE filter above).
2. `pdf_path` file not found on disk → `has_pdf: false` in list item; left pane shows
   "PDF not available at stored path: {path}" — surface the stored path for ops.
3. No `pdf_extracted_text` rows for `basename(pdf_path)` → right pane figures-only mode;
   OCR section shows "OCR text not available for this document."

No fuzzy filesystem scan is needed. PI-1's heuristic ticker-from-URL approach was
necessary only because PI-1 read `pdf_documents.url` (VPS URLs). The correct join
is `financial_reports.pdf_path` → exact path, already stored.

---

## 6. What to Do About `pdf_extractor.db pdf_documents` Junk Table

**The inspector MUST stop reading `pdf_documents`.** Full stop.

**Separately flagged (not in inspector scope):**
The production `pdf_extractor.db` is polluted with 15,570 `status=failed` rows,
URLs almost entirely `https://example.com/x.pdf`, `error-page`, `missing.pdf`.
This is test/pilot data that leaked into the prod Docker volume during the Phase-1
and Phase-2 SCALE pilot testing cycles (the pdf-extractor pilot used the same
volume as production during factory runs).

This is an ops/dev follow-up item:
- Impact: zero on production BCTC extraction (mcp-server reads `market.db`, not `pdf_extractor.db`).
- Impact: the inspector was the only reader of `pdf_documents`, and it is now re-homed.
- Recommended action: ops to truncate `pdf_documents` table in `pdf_extractor.db`,
  or mark the whole table as deprecated since the inspector no longer uses it.
- Action owner: ops-or-dev follow-up, NOT part of PI-3-redo.

---

## 7. DDD Placement in mcp-server

```
apps/mcp-server/src/interface/mcp/routes/
  bctcInspectHandler.ts          (NEW) — 4 GET routes (list + pdf-bytes + ocr-text + metadata)
                                         Pattern: identical to newsFetchLiveHandler.ts

apps/mcp-server/src/interface/mcp/server.ts
  (MODIFY) — wire 4 new GET /api/bctc-inspect/* routes to bctcInspectHandler
              same pattern as GET /api/news-fetch/live at line 295

apps/mcp-server/src/interface/
  bctc-inspector.html            (NEW) — viewer HTML page (served from a GET /api/bctc-inspect route)
                                         SI-2 boundary comment baked in
```

All new code stays in the `interface` layer. No new domain service, no new application
use case, no new infrastructure. The `market.db` handle is injected by server.ts
(the same `db` instance already shared across all handlers — established by Task 1839a Phase 2
"single DB handle for all HTTP route handlers").

**Import-fence impact:** NONE. mcp-server is TypeScript (not Python import-linter scope).
ESLint eslint-plugin-boundaries (kinh-dich fence) does not apply here. The new
interface/mcp/routes/*.ts file is inside the permitted interface layer.

### Routes (new surface, mcp-server port 3000)

```
GET /api/bctc-inspect           — serve the viewer HTML page (text/html)
GET /api/bctc-inspect/docs      — list real docs from financial_reports
                                   Response: { items: [{ doc_id, label, action_code,
                                     period_type, period_year, has_pdf, has_ocr,
                                     net_profit, net_profit_api_bridge,
                                     ocr_confidence, confidence_financial }] }
GET /api/bctc-inspect/pdf/{doc_id}
                                — stream PDF bytes from financial_reports.pdf_path
                                   doc_id is financial_reports.id (UUID text)
                                   Response: application/pdf or 404
GET /api/bctc-inspect/ocr/{doc_id}?page=1
                                — return OCR text pages from pdf_extracted_text
                                   Response: { filename, total_pages, page, text_content,
                                     confidence, has_more }
```

### SI-2 boundary comment

Every new file in `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts`
and the HTML template must carry:

```typescript
// SI-2 BOUNDARY: BCTC inspection viewer surface.
// This file is part of the served /api/bctc-inspect viewer (Sprint PDF-INSPECT redo).
// It is SEPARATE from the pdf-extractor /inspect viewer (to be deprecated).
// Do NOT touch apps/pdf-extractor/dashboard/ or apps/pdf-extractor/interface/viewer.html.
```

---

## 8. What Happens to the Existing pdf-extractor /inspect Routes

The PI-2 implementation (`GET /inspect`, `GET /inspect/pdfs`, `GET /inspect/pdf/{doc_id}`,
`GET /inspect/extraction/{doc_id}`) in `apps/pdf-extractor/interface/handlers.py` +
`apps/pdf-extractor/infrastructure/inspection_store.py` + `apps/pdf-extractor/interface/viewer.html`
remains in place — do NOT delete it in PI-3-redo. It is dead (reads junk data) but
deleting it risks breaking the 186 QA-authored tests that cover it. Mark it deprecated:

```python
# DEPRECATED (PDF-INSPECT-REDO): This /inspect surface reads pdf_documents (junk table).
# Real inspection viewer moved to mcp-server GET /api/bctc-inspect.
# DO NOT extend. Safe to delete once PI-3-redo QA confirms mcp-server viewer works.
```

The deprecated routes stay so the PI-2 pytest suite passes unchanged (186 tests =
164 unit + integration + 25 PI-3 acceptance tests, all with fixture data not real prod data).
They do not affect production.

---

## 9. QA Mandate for PI-3-redo

**Binding rule from this escalation:**

PI-3-redo MUST verify against:
1. The REAL `market.db` with its 14 real `financial_reports` rows.
2. The 17 real PDFs at `/app/data/pdfs/` (at least 3 must render in the left pane).
3. The real `pdf_extracted_text` rows (819 rows — at least 1 doc must show real OCR text).
4. The financial figures table must show real `net_profit` vs `net_profit_api_bridge`
   and flag any anomalies (the decimal-shift case must be visible if present).

Fixtures MAY supplement edge-case testing (honest-degrade paths) but CANNOT be the
primary acceptance. QA must docker exec into the running mcp-server container and
confirm the list endpoint returns ≥10 real docs from `financial_reports`.

The specific acceptance check that failed in QA PI-3 (fixture `DOC_FULL` with
seeded `VNM net_profit=0.000051`) must be reproduced against REAL data — not a
seeded fixture that happens to match the expected format.

---

## 10. Risk Flags

| Risk | Severity | Note |
|------|----------|------|
| R-1: pdf_path stale / pre-migration rows | LOW | Some older `financial_reports` rows may have `pdf_path` set to a canonical path (`/app/data/pdfs/VCB_2025_Q4.pdf`) that doesn't match the actual messy file. WHERE filter excludes NULL paths; honest-degrade handles missing file gracefully. |
| R-2: SQLite shared handle (market.db) | LOW | The single DB handle pattern (Task 1839a) already covers concurrent route access. The new inspect routes use the same injected `db` — no new connection, no new risk. |
| R-3: Path traversal in pdf/{doc_id} | MEDIUM | `doc_id` in mcp-server is a UUID TEXT. Validate UUID pattern before constructing path from `financial_reports.pdf_path`. The path itself comes from the DB (not user input), but the `doc_id` parameter must be validated before the SELECT. |
| R-4: pdf_path absolute path validity | LOW | Path stored as absolute (`/app/data/pdfs/...`) — valid inside the container. Dev must NOT expose the raw path in the list API response (privacy: internal container paths). Only stream bytes; don't leak the path. |
| R-5: WAL conflict on `market.db` | LOW | mcp-server uses its own sqlite handle; new bctcInspectHandler uses the same injected `db` — no second connection opened. Zero additional WAL risk. |

---

## 11. Implementation Owner Change

**PI-1 owner (wrong):** dev-pdf-extractor
**PI-3-redo owner (correct):** dev-mcp-server

Rationale: all data is in mcp-server's `market.db`. All infrastructure (PDF save path,
OCR write) is in mcp-server. The viewer is a read-only HTTP interface over mcp-server
data. Implementation pattern is `newsFetchLiveHandler.ts` (already present, proven).

The pdf-extractor PI-2 implementation remains as deprecated dead code (do not delete;
do not extend).
