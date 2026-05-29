# Architecture Brief — BCTC-EVAL-INSPECT-MERGE
## Merge Eval Gate Strip into Inspector; Page-Master Navigation

**Sprint:** BCTC-EVAL-INSPECT-MERGE
**Date:** 2026-05-29
**Author:** architect
**Status:** DESIGN COMPLETE — pending G1 review
**Depends on:** BCTC-EVAL-SUBSTRATE (brief `2026-05-28-bctc-eval-shared-substrate.md` — table, endpoints, thresholds must be deployed first)

---

## §1 PROBLEM STATEMENT

### Bug: PDF pane shows only page 1 on initial load

The current `bctc-inspector.html` renders ALL PDF pages stacked vertically via pdf.js on document selection. The page navigation arrows drive only the right-pane OCR text re-fetch — the PDF pane does NOT paginate or jump to the selected page on initial load for the first document selection. The intent was `scrollIntoView` to synchronise, but on initial load `currentPage = 1` is set before `renderPdf` completes, so the scroll fires against an already-complete full render. The result: the user always sees page 1 of the PDF regardless of OCR nav position. The fix must make the PDF pane navigate in lockstep with the page-master control.

### Missing: page-scoped per-stage eval gate strip

The `/api/bctc-inspect` viewer currently shows:
- Left pane: full PDF stacked render
- Right pane: figures (report-level), structured table (report-level), markdown tables (report-level), OCR text (page-by-page)

A financial table in the BCTC PDF can span multiple pages. A single page may contain only a fragment of a multi-page PEK layout unit. There is no mechanism to signal "this table row is a partial fragment of a cross-page unit" — the viewer may render it as if complete. This is a false-green surface for a developer debugging extraction quality.

The BCTC-EVAL-SUBSTRATE sprint adds a 6-gate eval table (`bctc_eval_results`) and `GET /api/bctc-eval/{report_id}` endpoint. That data is currently only surfaced in the Remix dashboard (`/dashboard/bctc-eval`), not in the inspector where a developer is actually debugging a specific PDF. The inspector needs a per-page gate flow strip — but several eval metrics are report-level (computed once for the whole document) and must not be fabricated as per-page. This brief specifies the exact boundary.

---

## §2 DESIGN DECISION — UI APPROACH

Three options were considered:

**(a) Per-page endpoint overlay** — add `?page=N` to the eval endpoints, returning page-scoped metrics. Requires server changes to every eval handler and forces artificial fragmentation of report-level metrics.

**(b) Page-master client-side replay** — the server retains the existing eval endpoint (`GET /api/bctc-eval/{report_id}` returns the full 6-stage report-level payload once per doc load). The client reads `bctc_layout_units.page_numbers_json` to determine which unit covers the current page, and filters/highlights gate strip rows accordingly. Report-level gates are always shown as report-level; per-page gates are highlighted against the current page context. No new server endpoint needed for the strip.

**(c) New per-page eval endpoint** — a new `GET /api/bctc-eval/{report_id}?page=N` that returns a merged payload of (a) all 6 gate statuses + report-level metrics + (b) page-scoped contextual annotations (which PEK unit is in view, partial/complete flag, OCR confidence for this page's text rows). This is the cleanest contract for the client.

**Decision: Option (c) with a new `GET /api/bctc-eval/{report_id}/page/{page_no}` endpoint.**

Rationale:
- Option (b) silently conflates report-level and page-level at the client, making it easy to accidentally display a report-level metric as if it applies to this page. A server-side split is the explicit, auditable boundary.
- Option (a) requires fabricating per-page splits for genuinely report-level metrics — anti-false-green violation.
- Option (c) keeps the existing `GET /api/bctc-eval/{report_id}` intact (agents use it unchanged). The new page-scoped endpoint is inspector-only: it returns the report-level gate statuses + stage-level SSOT pointers, PLUS page-scoped annotations that are marked `report_level: true` or `report_level: false`. The client MUST render `report_level: true` fields with a `(rapport)` label — never as per-page values.
- This supports the page-master replay model: on every page change, the client calls the new endpoint and replaces the entire gate strip.

**PDF render approach — selected: pdf.js canvas with lazy per-page render + scrollIntoView scroll-sync.**

Current code renders all pages upfront in a loop. The fix is:
1. On initial doc load, render only the first page immediately (so the user sees something fast).
2. On each page-nav event, ensure the target page canvas exists (lazy-render if not yet rendered) and `scrollIntoView` to it.
3. The existing `renderWithPdfJs` already builds per-page canvases with `id="pdf-page-{N}"` — the scroll logic already works. The bug is that page 1 is pre-rendered but no scroll happens for it (it is already at the top). For pages > 1, `scrollIntoView` is correct. The actual reported bug is "only shows page 1 on initial load" — which means the OCR nav arrives at page 1, the PDF is already showing page 1, and navigation does not advance both panes together when the user clicks next. **Root cause:** `currentPage` is set to 1 on doc load, but `renderOcr` is called with `page=1` and the PDF is simultaneously loading all pages. If the PDF finishes rendering after OCR, `pdfNumPages` is set correctly. The scroll sync call in `renderOcr` fires while `pdfNumPages=0` (PDF still loading), so `scrollIntoView` is skipped. Fix: await `renderPdf` before `renderOcr` in the doc-select handler — which is already done in the current code (`await renderPdf(docId, item); await renderOcr(docId, 1)`). The real bug is that on next-page click, `renderOcr` re-fetches OCR but does NOT call any PDF-side function — the PDF pane does not jump. The `scrollIntoView` call at line ~814 is inside `renderOcr` but `usingIframeFallback` check and `pdfNumPages > 0` check gate it. This is correct for non-iframe case. **The actual bug**: scroll fires against `pdf-page-${currentPage}` canvas AFTER `currentPage` is incremented, which should work. Live test needed, but the design fix is: ensure the page-nav buttons call a unified `navigateToPage(N)` function that (1) sets `currentPage`, (2) ensures PDF canvas for page N exists (lazy-render if needed), (3) scrolls PDF, (4) fetches OCR, (5) fetches page-scoped eval strip, (6) fetches zones. This removes race conditions from sequential awaits.

---

## §3 NEW ENDPOINT — `GET /api/bctc-eval/{report_id}/page/{page_no}`

### Purpose

Returns the 6-gate eval status for the report (report-level SSOT, identical to `/api/bctc-eval/{report_id}`) PLUS page-scoped contextual annotations. Intended for the inspector page-strip only. Agents continue to use `GET /api/bctc-eval/{report_id}` unchanged.

### Response contract

```json
{
  "schema_version": "1",
  "report_id": "e71f845d-ffa5-48f9-8f09-30ac2cd09c65",
  "page_no": 7,
  "overall_status": "green",
  "is_stale": false,
  "gate_strip": [
    {
      "stage_no": 1,
      "stage_name": "RASTERIZE",
      "status": "green",
      "report_level": true,
      "label_suffix": "(rapport)",
      "metrics_summary": "46/46 pages rasterized"
    },
    {
      "stage_no": 2,
      "stage_name": "LAYOUT_DETECT",
      "status": "green",
      "report_level": true,
      "label_suffix": "(rapport)",
      "metrics_summary": "23/23 tables detected, conf=0.91"
    },
    {
      "stage_no": 3,
      "stage_name": "OCR",
      "status": "green",
      "report_level": false,
      "label_suffix": null,
      "metrics_summary": "diacritic_ratio=0.38, anchors=2/2",
      "page_annotation": {
        "page_no": 7,
        "ocr_confidence": 0.92,
        "text_length_chars": 1843,
        "has_ocr_row": true
      }
    },
    {
      "stage_no": 4,
      "stage_name": "TABLE_RECONSTRUCT",
      "status": "green",
      "report_level": false,
      "label_suffix": null,
      "metrics_summary": "label_cov=0.97, dup=0, blank_label=0",
      "page_annotation": {
        "page_no": 7,
        "pek_unit_id": "unit_abc123",
        "pek_unit_page_numbers": [6, 7, 8],
        "is_multi_page_unit": true,
        "current_page_in_unit": 7,
        "partial_fragment_warning": true,
        "unit_row_count": 48,
        "partial_label": "Trang 7/3 (trang trong đơn vị trang 6–8)"
      }
    },
    {
      "stage_no": 5,
      "stage_name": "MARKDOWN_RENDER",
      "status": "green",
      "report_level": true,
      "label_suffix": "(rapport)",
      "metrics_summary": "roundtrip_match=0.99"
    },
    {
      "stage_no": 6,
      "stage_name": "STRUCTURED_EXTRACT",
      "status": "yellow",
      "report_level": true,
      "label_suffix": "(rapport)",
      "metrics_summary": "balance_pass=true [signal only], golden_match=0.95"
    }
  ]
}
```

### Field semantics

| Field | Contract |
|---|---|
| `report_level: true` | This metric is computed once for the whole report. The page selection does not affect it. Client MUST render with a `(rapport)` or `[rapport]` label. |
| `report_level: false` | This metric has genuine page-scoped meaning. Client renders without the `(rapport)` label. |
| `page_annotation` | Present only when `report_level: false`. Contains page-specific data fetched from the DB for `page_no`. Absent (null) when `report_level: true`. |
| `partial_fragment_warning: true` | Stage 4 only. Set when the PEK unit covering this page has `page_numbers_json` with more than one page — meaning the current page is a fragment of a multi-page unit. Client MUST render a visible `[FRAGMENT — trang N/M trong đơn vị]` badge. |
| `is_multi_page_unit` | Stage 4 only. True when `len(page_numbers_json) > 1`. |
| `partial_label` | Vietnamese label for the partial-fragment badge. Preformatted by server — client renders verbatim. |

### Which stages are report-level vs page-scoped

| Stage | report_level | Rationale |
|---|---|---|
| 1 RASTERIZE | `true` | Rasterization is a whole-document operation. No meaningful per-page metric beyond "this page was rasterized" (binary, trivially true for all pages). |
| 2 LAYOUT_DETECT | `true` | Table detection counts are computed across the whole PDF. Showing per-page "table detected on this page" would require per-page layout data not stored in `bctc_page_zones` in a count-form suitable for eval. Labelled report-level to avoid fabrication. |
| 3 OCR | `false` | `pdf_extracted_text` has one row per page with `confidence` and `text_content`. Page-scoped confidence and text length are real, non-fabricated per-page data. |
| 4 TABLE_RECONSTRUCT | `false` | `bctc_layout_units.page_numbers_json` tells exactly which pages a unit covers. Partial-fragment detection is inherently per-page. |
| 5 MARKDOWN_RENDER | `true` | Round-trip drift is computed across all MD tables for the report. No per-page MD table round-trip is stored. Labelled report-level. |
| 6 STRUCTURED_EXTRACT | `true` | Golden-row match ratio and balance_pass are report-level extractions stored in `financial_reports`. No per-page structured-extract metric is stored. Labelled report-level. |

### Server implementation

**File:** `apps/mcp-server/src/interface/mcp/routes/bctcEvalPageHandler.ts` (NEW)

**Route:** `GET /api/bctc-eval/{report_id}/page/{page_no}` — registered in `server.ts` switch block after existing `/api/bctc-eval/{report_id}` route.

**Route disambiguation note:** The path `/api/bctc-eval/{report_id}/page/{page_no}` must be disambiguated from `/api/bctc-eval/recompute/{report_id}` at the routing layer. Current `server.ts` uses string prefix matching. Add the `/page/` sub-path check BEFORE the catch-all UUID check for `bctc-eval`.

**DI:** `db` injected by caller. Same pattern as all other `bctcEval*Handler.ts` files.

**DB queries (in order):**

1. Validate `report_id` as UUID (`isValidUuid` imported from `bctcInspectHandler.ts`).
2. Validate `page_no` as integer ≥ 1.
3. `SELECT * FROM bctc_eval_results WHERE report_id = ? ORDER BY stage_no ASC` — fetch all 6 eval rows.
4. If no rows: HTTP 409 `EVAL_NOT_COMPUTED`.
5. For stage 3 (OCR): `SELECT confidence, LENGTH(text_content) as text_length_chars FROM pdf_extracted_text WHERE filename = (SELECT basename(pdf_path) FROM financial_reports WHERE id = ?) AND page_number = ?` — page-scoped OCR confidence and text length.
6. For stage 4 (TABLE_RECONSTRUCT): `SELECT unit_id, page_numbers_json FROM bctc_layout_units WHERE report_id = ? AND EXISTS (SELECT 1 FROM json_each(page_numbers_json) WHERE value = ?)` — find PEK unit covering this page.
7. Assemble `gate_strip` array per the contract above.

**Error codes:** Same pattern as `bctcEvalDetailHandler.ts`. `INVALID_UUID`, `INVALID_PAGE_NO`, `REPORT_NOT_FOUND`, `EVAL_NOT_COMPUTED`.

---

## §4 BCTC-INSPECTOR HTML CHANGES — Page-Master Navigation

### Changes to `apps/mcp-server/src/interface/bctc-inspector.html`

This is an **additive edit** to the existing HTML file. No new page. No structural rewrite. The SI-2 boundary comment at line 1 is preserved. The sandbox boundary is preserved.

#### 4.1 — Unified `navigateToPage(N)` function (NEW)

Replace the current `btnPrev`/`btnNext` click handlers (and the inline scroll call at the end of `renderOcr`) with a single orchestrator:

```javascript
async function navigateToPage(pageNum) {
  if (!currentDocId) return;
  // Clamp to valid range
  const bound = pdfNumPages > 0 ? pdfNumPages : totalPages;
  if (bound > 0) pageNum = Math.max(1, Math.min(pageNum, bound));
  currentPage = pageNum;

  // 1. Ensure PDF canvas for this page exists and scroll to it
  await ensurePdfPageRendered(currentDocId, pageNum);

  // 2. Fetch OCR (stage 3 text) for this page
  await renderOcr(currentDocId, pageNum);

  // 3. Fetch page-scoped eval gate strip for this page
  await renderEvalStrip(currentDocId, pageNum);

  // 4. Fetch zone overlay if enabled
  if (zoneOverlayEnabled) await renderZoneOverlay(currentDocId, pageNum);
}
```

`btnPrev` click: `navigateToPage(currentPage - 1)`
`btnNext` click: `navigateToPage(currentPage + 1)`

#### 4.2 — `ensurePdfPageRendered(docId, pageNum)` (NEW)

The current code renders ALL pages in a loop inside `renderWithPdfJs`. Keep this behaviour (full pre-render) but add `scrollIntoView` as a guaranteed post-step:

```javascript
async function ensurePdfPageRendered(docId, pageNum) {
  if (usingIframeFallback || pdfNumPages === 0) return;
  const canvas = document.getElementById(`pdf-page-${pageNum}`);
  if (canvas) {
    canvas.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  // If canvas does not exist (page beyond rendered set — should not happen with full pre-render),
  // this is a no-op with a console.warn.
}
```

The full pre-render loop is kept unchanged. The fix is that `scrollIntoView` is now called via `navigateToPage` on EVERY page change, including transitions from page 1 forward (previously the nav buttons only called `renderOcr` which had the scroll inline but gated on conditions that could silently skip it).

#### 4.3 — Table pane becomes page-aware (stage 4 partial-fragment)

The current `renderTable(docId)` fetches once per document. Change it to `renderTable(docId, pageNum)` called from `navigateToPage`. The server call remains `GET /api/bctc-inspect/table/{doc_id}` (unchanged — returns all PEK units or all bctc_table_rows). The client-side rendering change:

For the **PEK path** (`has_pek: true`): the current code renders ALL units in a scrollable list. Add page-highlighting:
- Units whose `page_numbers_json` INCLUDES `pageNum` are rendered with a visible highlight border (`border: 2px solid #4a9eff`).
- Units that are single-page (`page_numbers_json.length === 1`) and match `pageNum`: no partial warning.
- Units that are multi-page (`page_numbers_json.length > 1`) and match `pageNum`: render a `[FRAGMENT — trang N trong đơn vị trang X–Z]` badge in orange (`#ff8c3c`) above the unit's pre block. This is the anti-false-green requirement.
- Units not covering the current page: rendered at 40% opacity to indicate they are from other pages.

For the **legacy path** (`has_pek: false`): `bctc_table_rows` has a `page_number` column per row. Filter visible rows to those where `row.page_number === pageNum`. Rows from other pages are collapsed. Show a notice: `Affichage des lignes de la page N uniquement. Table complète: M lignes.` → Vietnamese: `Hiển thị các hàng của trang N. Tổng bảng: M hàng.`

**Partial-fragment label rule (HARD):** A fragment rendered without the partial badge is a false-green. The partial badge is mandatory when `page_numbers_json.length > 1` and the current page is within the unit's page set.

#### 4.4 — Eval gate strip pane (NEW DOM section)

Add a new right-pane section between the existing figures section and the structured table section:

```html
<!-- EVAL-STRIP: 6-gate eval strip (page-aware) -->
<div id="eval-strip-section" style="display:none">
  <div class="section-title" style="margin-bottom:6px">Kiểm tra chất lượng trích xuất</div>
  <div id="eval-strip-content">
    <div class="missing-msg">Chưa chọn tài liệu.</div>
  </div>
</div>
```

Styling: each gate row is a flex row with a colored status dot (green `#72c870` / yellow `#d4a017` / red `#e06060`), a stage label, a `(rapport)` suffix when `report_level: true` in a muted color (`#555`), and a metrics summary in monospace. Partial-fragment badge (stage 4 when `partial_fragment_warning: true`) renders as an inline orange badge below the stage 4 row.

On report-level gates: render the `label_suffix` value in the muted color directly after the stage name. The user can see at a glance which gates are report-level vs page-scoped.

```javascript
async function renderEvalStrip(docId, pageNum) {
  const section = document.getElementById("eval-strip-section");
  const content = document.getElementById("eval-strip-content");
  if (!section || !content) return;
  section.style.display = "block";
  content.innerHTML = '<div class="loading">Đang tải...</div>';

  try {
    const resp = await fetch(
      `${BASE}/api/bctc-eval/${encodeURIComponent(docId)}/page/${pageNum}`
    );
    if (!resp.ok) {
      if (resp.status === 409) {
        content.innerHTML = '<div class="missing-msg">Chưa có dữ liệu đánh giá (chạy backfill trước).</div>';
        return;
      }
      content.innerHTML = `<div class="missing-msg">Lỗi tải strip (${resp.status}).</div>`;
      return;
    }
    const data = await resp.json();
    renderGateStrip(data, content);
  } catch (err) {
    content.innerHTML = `<div class="missing-msg">Lỗi: ${escHtml(err.message)}</div>`;
  }
}
```

`renderGateStrip(data, container)` iterates `data.gate_strip` and builds the row HTML. It reads `report_level`, `status`, `metrics_summary`, `label_suffix`, and `page_annotation.partial_fragment_warning`.

#### 4.5 — Markdown tables pane (stage 5) — remains report-level

`renderMdTables(docId)` is called once per document selection (not per page). `GET /api/bctc-inspect/md/{doc_id}` is report-level. No change to that call. The eval strip shows stage 5 as `report_level: true` with `(rapport)` label. No fabricated per-page markdown metric.

#### 4.6 — Initial load sequence (document selection)

```javascript
select.addEventListener("change", async () => {
  const docId = select.value;
  if (!docId) { resetPanes(); return; }
  currentDocId = docId;
  currentPage = 1;
  pdfNumPages = 0;
  usingIframeFallback = false;

  const item = ...; // parse from option dataset

  // Render PDF first — populates pdfNumPages, renders all canvases
  await renderPdf(docId, item);
  // Then navigate to page 1 — triggers OCR, eval strip, zones
  await navigateToPage(1);
  // Table and MD are report-level, fetched once per doc
  await renderTable(docId, 1); // pass initial page for fragment highlighting
  await renderMdTables(docId);
});
```

This ordering guarantees `pdfNumPages` is populated before `navigateToPage(1)` runs, so the scroll and nav button logic sees the correct bound from the start.

---

## §5 PARTIAL TABLE HANDLING — SPEC FOR STAGE 4

### Problem statement

A financial statement table (balance sheet, income statement, cash flow) in a BCTC PDF regularly spans 2–4 pages. PEK extracts each multi-page table as a SINGLE `bctc_layout_units` row whose `page_numbers_json` contains all pages that table spans (e.g., `[5, 6, 7]`).

When the user is viewing page 6, the table section in the inspector currently renders the FULL stitched_markdown for that unit (because the endpoint returns all units, not a per-page slice). The user sees what appears to be a complete table but is actually looking at pages 5–7 stitched together. There is no indication that page 6 is a fragment within a 3-page span.

### Fix

The server response for `GET /api/bctc-inspect/table/{doc_id}` does NOT change (still returns all units — that is needed for the full report view). The client-side `renderTable(docId, pageNum)` applies the fragment logic:

1. For each unit in `data.units`:
   - Parse `unit.page_numbers_json` (already done in current code).
   - If `page_numbers_json.includes(pageNum)` AND `page_numbers_json.length > 1`:
     - This is a multi-page unit that covers the current page.
     - Mark it as partial: render the full `stitched_markdown` (do NOT truncate — it is already stitched correctly by PEK) but prefix with a prominent partial banner:
       ```
       [FRAGMENT TRANG — trang {pageNum} trong đơn vị {minPage}–{maxPage}]
       ```
       Rendered as a banner with orange background (`#5c2800`), orange border, white text.
     - The full stitched content below the banner is correct (PEK stitches across pages). The banner communicates that the user is currently viewing page N of a cross-page unit, not that the data itself is partial.
   - If `page_numbers_json.includes(pageNum)` AND `page_numbers_json.length === 1`:
     - Single-page unit covering current page: render normally, no banner.
   - If NOT `page_numbers_json.includes(pageNum)`:
     - Unit does not cover current page: render at 40% opacity with label `(autres pages: {pages})`.

2. For the legacy path (`has_pek: false`):
   - Filter `data.rows` to those with `row.page_number === pageNum`.
   - If filtered count < total count: show notice `Trang {N} — {filteredCount} hàng / {totalCount} tổng cộng`.
   - Render only the filtered rows in the table HTML.
   - If `filteredCount === 0`: show `Không có hàng bảng nào trên trang {N}`.

### Anti-false-green invariant

**A table fragment MUST be visibly labeled.** A unit covering pages [5,6,7] rendered on page 6 without the `[FRAGMENT TRANG]` banner is a false-green. The banner is not optional. QA must inject a multi-page unit and confirm the banner appears on intermediate pages and is absent on non-covered pages.

---

## §6 DDD LAYER ASSIGNMENT

### New files

| File | Zone | Layer | Responsibility |
|---|---|---|---|
| `apps/mcp-server/src/interface/mcp/routes/bctcEvalPageHandler.ts` | mcp-server | interface | `GET /api/bctc-eval/{report_id}/page/{page_no}` — page-scoped eval strip |
| `apps/mcp-server/src/interface/bctc-inspector.html` | mcp-server | interface | Modified (additive): `navigateToPage`, `ensurePdfPageRendered`, `renderEvalStrip`, `renderGateStrip`, fragment banners, eval-strip DOM section |

### Modified files

| File | Modification | Scope |
|---|---|---|
| `apps/mcp-server/src/interface/bctc-inspector.html` | Additive: new `navigateToPage` function, eval strip DOM section, partial-fragment banner logic in `renderTable`, `renderEvalStrip`/`renderGateStrip` | interface layer |
| `apps/mcp-server/src/interface/mcp/server.ts` | Add `bctcEvalPageHandler` route registration: `GET /api/bctc-eval/{report_id}/page/{page_no}` in the `handleRequest` switch block | interface layer |

### Untouched (frozen) files — confirmed

| File | Status |
|---|---|
| `apps/pdf-extractor/PDF-Extract-Kit/**` | FROZEN — PEK subtree pristine |
| `apps/pdf-extractor/application/text_table_extractor.py` | FROZEN |
| `apps/pdf-extractor/sandbox/runner.py` | FROZEN |
| `apps/pdf-extractor/generic_md_table_extractor.py` | FROZEN |
| `pilot-status-pdf-extractor.json` | FROZEN |
| `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` | UNTOUCHED — no changes |
| `apps/mcp-server/src/interface/mcp/routes/bctcEvalDetailHandler.ts` | UNTOUCHED — agents use this |
| `apps/mcp-server/src/infrastructure/db/bctcEvalStore.ts` | UNTOUCHED — reuses `getEvalForReport` |

---

## §7 ROUTE REGISTRATION DETAIL

Existing eval routes in `server.ts` switch block (post BCTC-EVAL-SUBSTRATE):
```
/api/bctc-eval              → bctcEvalListHandler
/api/bctc-eval/recompute/*  → bctcEvalRecomputeHandler
/api/bctc-eval/thresholds   → bctcEvalThresholdsHandler
/api/bctc-eval/{uuid}       → bctcEvalDetailHandler
```

New route added (must be checked BEFORE the UUID-only catch):
```
/api/bctc-eval/{uuid}/page/{N}  → bctcEvalPageHandler
```

Routing code in `server.ts` (pseudocode for the new case):
```typescript
// Inside bctc-eval routing block — add BEFORE the UUID-only catch:
const pageMatch = path.match(/^\/api\/bctc-eval\/([^/]+)\/page\/(\d+)$/);
if (pageMatch) {
  const [, reportId, pageStr] = pageMatch;
  return bctcEvalPageHandler(req, res, db, reportId, parseInt(pageStr, 10));
}
```

---

## §8 EVAL STRIP IN THE INSPECTOR — TRUST PREFIX

All Vietnamese text in the eval strip must follow the plain-Vietnamese trust prefix convention. The `partial_label` field is preformatted on the server in Vietnamese — client renders verbatim. The `[FRAGMENT TRANG]` banner text is:

```
[FRAGMENT TRANG — đang xem trang {N} trong đơn vị bảng trải dài trang {minPage}–{maxPage}]
```

The `(rapport)` suffix for report-level gates is rendered as `(toàn báo cáo)` in Vietnamese — not the French term. The server `label_suffix` field value is `"(toàn báo cáo)"`.

---

## §9 GATES G1/G2/G3

### G1 — Brief approved, dev-mcp-server unblocked

Criteria:
- This brief reviewed by dev-mcp-server acknowledging §3 endpoint contract, §6 DDD layer table, §7 routing.
- No open questions.
- BCTC-EVAL-SUBSTRATE deployed first (bctc_eval_results table exists in live container with at least the FPT sentinel's 6 rows).

### G2 — Shipped

Criteria:
- `GET /api/bctc-eval/{report_id}/page/{page_no}` returns correct JSON for FPT sentinel page 7 (a known multi-page unit page):
  - Stage 4 `report_level: false`, `partial_fragment_warning: true`, `pek_unit_page_numbers` contains 7 and at least one other page.
  - Stage 1, 2, 5, 6: `report_level: true`, `label_suffix: "(toàn báo cáo)"`.
  - Stage 3: `report_level: false`, `page_annotation.has_ocr_row: true` if OCR row exists for page 7.
- Inspector: selecting FPT sentinel, clicking to page 7:
  - PDF pane scrolls to canvas `pdf-page-7` (visible — not stuck at page 1).
  - Eval strip renders 6 gate rows. Stage 1/2/5/6 show `(toàn báo cáo)`. Stage 4 shows orange `[FRAGMENT TRANG]` banner.
  - Table section shows the multi-page PEK unit for page 7 with the fragment banner and the full stitched_markdown below it.
- **Anti-false-green deliberate-violation test:**
  - Inject a `bctc_layout_units` row with `page_numbers_json = '[5,6,7]'`. Navigate inspector to page 6. Confirm `[FRAGMENT TRANG — đang xem trang 6 trong đơn vị bảng trải dài trang 5–7]` banner appears in the table section. Confirm eval strip stage 4 shows `partial_fragment_warning: true`. Revert injection.
  - Inject a single-page unit (`page_numbers_json = '[3]'`). Navigate to page 3. Confirm NO fragment banner. Revert.
- PDF pagination bug: select FPT sentinel, click next (page 2), confirm PDF pane scrolls to page 2 canvas. Click to page 7, confirm scroll to page 7 canvas. No regression on page 1 initial view.

### G3 — Live production verification

Criteria:
- Live inspector at `GET /api/bctc-inspect` opens FPT Q4-2025 sentinel.
- Navigating to a page known to be part of a multi-page PEK unit shows the `[FRAGMENT TRANG]` banner.
- Eval strip loads on every page change (network tab shows `GET /api/bctc-eval/{sentinel_id}/page/{N}` on each click).
- Navigating back to page 1 after page 7: PDF scrolls back to top, eval strip updates, table section de-highlights previous page units.
- `has_pek: true` confirmed for FPT sentinel (bctc_layout_units count > 0) — no regression from BCTC-EVAL-SUBSTRATE backfill.

---

## §10 DEV-MCP-SERVER WORK ITEM LIST (UPDATED)

This section enumerates exactly what dev-mcp-server must implement in this sprint. Items are ordered by dependency.

| # | Item | File(s) | Notes |
|---|---|---|---|
| M-1 | New page-scoped eval handler | `apps/mcp-server/src/interface/mcp/routes/bctcEvalPageHandler.ts` (CREATE) | §3 contract. Reuse `getEvalForReport` from `bctcEvalStore`. Add 3 DB queries (eval rows, OCR page row, PEK unit for page). |
| M-2 | Register new route in server.ts | `apps/mcp-server/src/interface/mcp/server.ts` (MODIFY) | §7 routing pattern. Must come before UUID-only catch. |
| M-3 | `navigateToPage` orchestrator | `apps/mcp-server/src/interface/bctc-inspector.html` (MODIFY) | §4.1. Replaces current split btn click → renderOcr pattern. |
| M-4 | `ensurePdfPageRendered` + scroll fix | `apps/mcp-server/src/interface/bctc-inspector.html` (MODIFY) | §4.2. Fixes the page-1-only bug. |
| M-5 | `renderEvalStrip` / `renderGateStrip` | `apps/mcp-server/src/interface/bctc-inspector.html` (MODIFY) | §4.4. New eval-strip DOM section + fetch + render. |
| M-6 | Eval strip DOM section in HTML | `apps/mcp-server/src/interface/bctc-inspector.html` (MODIFY) | §4.4. Add `<div id="eval-strip-section">` between figures and table sections. |
| M-7 | Fragment banner in `renderTable` | `apps/mcp-server/src/interface/bctc-inspector.html` (MODIFY) | §4.3 + §5. Multi-page unit detection + `[FRAGMENT TRANG]` banner. Legacy path page-filter. |
| M-8 | Updated doc-select handler | `apps/mcp-server/src/interface/bctc-inspector.html` (MODIFY) | §4.6. Call `navigateToPage(1)` after `renderPdf`; call `renderTable(docId, 1)` + `renderMdTables(docId)` once per doc. |
| M-9 | Unit tests for `bctcEvalPageHandler` | `apps/mcp-server/src/__tests__/bctcEvalPageHandler.test.ts` (CREATE) | Test: valid page mid-unit → `partial_fragment_warning: true`; single-page unit → false; page not in any unit → stage 4 annotation absent; 409 when no eval rows; 400 on invalid UUID; 400 on invalid page_no. |

---

## §11 HARD CONSTRAINTS CHECKLIST

- NO branches — all work on `main`.
- Scoped `git add` per file. NEVER `-A`.
- PEK subtree pristine: `git -C apps/pdf-extractor/PDF-Extract-Kit diff` MUST be EMPTY at every commit.
- Frozen files UNTOUCHED: `text_table_extractor.py`, `sandbox/runner.py`, `pilot-status-pdf-extractor.html`, `generic_md_table_extractor.py`.
- `bctcInspectHandler.ts` UNTOUCHED — route handlers unchanged.
- `bctcEvalDetailHandler.ts` UNTOUCHED — agent contract unchanged.
- BCTC-EVAL-SUBSTRATE must be deployed before this sprint (eval rows must exist for the FPT sentinel to test against).
- All Vietnamese UI text in the inspector follows plain-Vietnamese convention (no jargon). Partial-fragment banner uses `[FRAGMENT TRANG — ...]` in Vietnamese as specified in §8.
- `(toàn báo cáo)` suffix (not the French word `rapport`) for report-level gates in the UI. The JSON field name `report_level` and `label_suffix` are English (server contract) — only the rendered UI text is Vietnamese.
- Partial-fragment banner is MANDATORY (not optional) for multi-page units: `partial_fragment_warning: true` → banner always shown. QA must deliberate-violate to confirm.
- REBUILD not restart after code changes: `docker compose build --build-arg GIT_SHA=$(git rev-parse HEAD) mcp-server && docker compose up -d --no-deps --force-recreate mcp-server`.
- QA verifies via DIRECT market.db COUNT in-container (bun:sqlite, no sqlite3).
- No new pages in Remix frontend for this sprint — the inspector changes are entirely within `bctc-inspector.html` and the new `bctcEvalPageHandler.ts`.

---

## §12 BROWNFIELD SCAN SUMMARY

- `GET /api/bctc-eval/{report_id}/page/{page_no}` — ABSENT. Greenfield addition.
- `bctcEvalPageHandler.ts` — ABSENT. Greenfield addition.
- `bctc-inspector.html` — EXISTS and is actively maintained. Additive changes only. The SI-2 boundary comment is preserved.
- `navigateToPage` function — ABSENT in current JS. Replaces split btn click handlers (additive refactor — btn handlers now call `navigateToPage`).
- `eval-strip-section` DOM — ABSENT. Added between figures and table sections.
- Fragment-banner logic in `renderTable` — ABSENT. Added to existing function (additive branch).
- `bctcEvalStore.getEvalForReport` — EXISTS (from BCTC-EVAL-SUBSTRATE). Reused by new handler.
- `isValidUuid` — EXISTS in `bctcInspectHandler.ts`. Imported by new handler (same pattern as `bctcEvalDetailHandler.ts`).
- pdf.js all-pages pre-render loop — EXISTS. NOT changed. The fix is ensuring `scrollIntoView` is called reliably via `navigateToPage`.

**BUILD-STANDARD: lean** (additive to existing service + HTML file — no new service, no new container, no new Remix route).
