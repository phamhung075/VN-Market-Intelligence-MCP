---
sprint: BCTC-EVAL-INSPECT-MERGE
created: 2026-05-29
author: architect
target: dev-mcp-server
---

## [Architect] Brownfield Findings

- **Zone:** apps/mcp-server/src/interface/ + apps/mcp-server/src/interface/mcp/routes/
- **Verified paths:**
  - `apps/mcp-server/src/interface/bctc-inspector.html:1-1391` — full HTML/CSS/JS viewer, dark theme, served via readFileSync at request time
  - `apps/mcp-server/src/interface/mcp/routes/bctcEvalDetailHandler.ts:1-145` — existing endpoint `GET /api/bctc-eval/{report_id}`, returns schema_version:"1", stages[], 409 for no-eval. UNTOUCHED — agent contract preserved.
  - `apps/mcp-server/src/infrastructure/db/bctcEvalStore.ts:1-235` — `getEvalForReport` returns EvalRow[]|null. UNTOUCHED — reused by new handler.
  - `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts:1-917` — docs, pdf, ocr, table, zones handlers. UNTOUCHED.
  - `apps/mcp-server/src/interface/mcp/server.ts` — switch-block router. MODIFY to add new route.
- **Reuse patterns:**
  - `isValidUuid` in `bctcInspectHandler.ts` — import in new handler (same pattern as `bctcEvalDetailHandler.ts`)
  - `bctcEvalStore.getEvalForReport` — call from new handler for the 6 gate rows
  - Dark theme CSS palette in existing `<style>` block — extend with `.eval-*` scoped rules
  - `resetPanes()` — extend to reset eval strip
- **Scan clean:** true

**BUILD-STANDARD: lean** (additive to existing service + HTML file — no new service, no new container, no new Remix route)

---

## Task Spec

**What:** (1) Add a new `GET /api/bctc-eval/{report_id}/page/{page_no}` endpoint returning the 6-gate report-level eval status plus page-scoped annotations (partial-fragment detection for stage 4, OCR confidence for stage 3). (2) Fix the PDF-pagination bug in `bctc-inspector.html` by introducing a unified `navigateToPage` orchestrator. (3) Add the page-aware eval gate strip to the inspector, calling the new endpoint on every page change. (4) Add partial-fragment banners to the table pane for multi-page PEK units.

**Full design:** docs/architecture-briefs/2026-05-29-bctc-eval-inspect-merge.md

**Prerequisite:** BCTC-EVAL-SUBSTRATE must be deployed (bctc_eval_results table populated; at minimum FPT sentinel `e71f845d-ffa5-48f9-8f09-30ac2cd09c65` has 6 eval rows).

---

## Work Items (M-1 through M-9, implement in dependency order)

### M-1 — New page-scoped eval handler (CREATE)

**File:** `apps/mcp-server/src/interface/mcp/routes/bctcEvalPageHandler.ts`

Implement `GET /api/bctc-eval/{report_id}/page/{page_no}`. Signature mirrors existing handlers: `bctcEvalPageHandler(req, res, db, reportId, pageNo)`.

DB queries (in order):
1. Validate `reportId` as UUID (`isValidUuid` from `bctcInspectHandler.ts`). HTTP 400 `INVALID_UUID` on fail.
2. Validate `pageNo` as integer ≥ 1. HTTP 400 `INVALID_PAGE_NO` on fail.
3. `SELECT * FROM bctc_eval_results WHERE report_id = ? ORDER BY stage_no ASC` — fetch 6 eval rows. HTTP 409 `EVAL_NOT_COMPUTED` if empty.
4. Stage 3 (OCR) page annotation: `SELECT confidence, LENGTH(text_content) AS text_length_chars FROM pdf_extracted_text WHERE filename = (SELECT basename(pdf_path) FROM financial_reports WHERE id = ?) AND page_number = ?`. If no row: `has_ocr_row: false`.
5. Stage 4 (TABLE_RECONSTRUCT) page annotation: `SELECT unit_id, page_numbers_json FROM bctc_layout_units WHERE report_id = ? AND EXISTS (SELECT 1 FROM json_each(page_numbers_json) WHERE value = ?)`. Derive `is_multi_page_unit`, `partial_fragment_warning` (true when `page_numbers_json.length > 1`), `partial_label` (Vietnamese, preformatted server-side).

Response contract (schema_version: "1"):
```json
{
  "schema_version": "1",
  "report_id": "<uuid>",
  "page_no": <N>,
  "overall_status": "green|yellow|red",
  "is_stale": false,
  "gate_strip": [
    {
      "stage_no": 1,
      "stage_name": "RASTERIZE",
      "status": "green|yellow|red",
      "report_level": true,
      "label_suffix": "(toàn báo cáo)",
      "metrics_summary": "<string>"
    },
    {
      "stage_no": 3,
      "stage_name": "OCR",
      "status": "green|yellow|red",
      "report_level": false,
      "label_suffix": null,
      "metrics_summary": "<string>",
      "page_annotation": {
        "page_no": <N>,
        "ocr_confidence": <float|null>,
        "text_length_chars": <int|null>,
        "has_ocr_row": <bool>
      }
    },
    {
      "stage_no": 4,
      "stage_name": "TABLE_RECONSTRUCT",
      "status": "green|yellow|red",
      "report_level": false,
      "label_suffix": null,
      "metrics_summary": "<string>",
      "page_annotation": {
        "page_no": <N>,
        "pek_unit_id": "<string|null>",
        "pek_unit_page_numbers": [<int>],
        "is_multi_page_unit": <bool>,
        "partial_fragment_warning": <bool>,
        "partial_label": "<Vietnamese string|null>"
      }
    }
  ]
}
```

`report_level` per stage:
- Stage 1 RASTERIZE: `true`
- Stage 2 LAYOUT_DETECT: `true`
- Stage 3 OCR: `false` (page_annotation present)
- Stage 4 TABLE_RECONSTRUCT: `false` (page_annotation present)
- Stage 5 MARKDOWN_RENDER: `true`
- Stage 6 STRUCTURED_EXTRACT: `true`

`label_suffix` for all `report_level: true` stages: `"(toàn báo cáo)"`. For `report_level: false`: `null`.

`partial_label` server format: `"Đang xem trang {pageNo} trong đơn vị bảng trải dài trang {minPage}–{maxPage}"`

---

### M-2 — Register new route in server.ts (MODIFY)

**File:** `apps/mcp-server/src/interface/mcp/server.ts`

Add the `/page/` sub-path match BEFORE the UUID-only catch in the bctc-eval routing block:

```typescript
const pageMatch = path.match(/^\/api\/bctc-eval\/([^/]+)\/page\/(\d+)$/);
if (pageMatch) {
  const [, reportId, pageStr] = pageMatch;
  return bctcEvalPageHandler(req, res, db, reportId, parseInt(pageStr, 10));
}
```

Existing routes to remain unchanged and their order preserved:
```
/api/bctc-eval              → bctcEvalListHandler
/api/bctc-eval/recompute/*  → bctcEvalRecomputeHandler
/api/bctc-eval/thresholds   → bctcEvalThresholdsHandler
NEW: /api/bctc-eval/{uuid}/page/{N}  → bctcEvalPageHandler  (before UUID-only catch)
/api/bctc-eval/{uuid}       → bctcEvalDetailHandler
```

---

### M-3 — `navigateToPage` orchestrator in bctc-inspector.html (MODIFY)

**File:** `apps/mcp-server/src/interface/bctc-inspector.html`

Replace the current `btnPrev`/`btnNext` click handlers with a unified orchestrator. The btn handlers now call `navigateToPage`:

```javascript
async function navigateToPage(pageNum) {
  if (!currentDocId) return;
  const bound = pdfNumPages > 0 ? pdfNumPages : totalPages;
  if (bound > 0) pageNum = Math.max(1, Math.min(pageNum, bound));
  currentPage = pageNum;

  await ensurePdfPageRendered(currentDocId, pageNum); // PDF scroll
  await renderOcr(currentDocId, pageNum);             // OCR text pane
  await renderEvalStrip(currentDocId, pageNum);       // eval gate strip
  if (zoneOverlayEnabled) await renderZoneOverlay(currentDocId, pageNum); // zones
}
```

`btnPrev` click: `navigateToPage(currentPage - 1)`
`btnNext` click: `navigateToPage(currentPage + 1)`

---

### M-4 — `ensurePdfPageRendered` + scroll fix (MODIFY)

**File:** `apps/mcp-server/src/interface/bctc-inspector.html`

Add function that fires `scrollIntoView` reliably on every page change (fixing the PDF pane not following navigation):

```javascript
async function ensurePdfPageRendered(docId, pageNum) {
  if (usingIframeFallback || pdfNumPages === 0) return;
  const canvas = document.getElementById(`pdf-page-${pageNum}`);
  if (canvas) {
    canvas.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    console.warn(`[inspector] pdf-page-${pageNum} canvas not found`);
  }
}
```

The full pre-render loop in `renderWithPdfJs` is kept unchanged. The fix is that `scrollIntoView` is now guaranteed via `navigateToPage` on every page change, eliminating the race condition where scroll fired before `pdfNumPages` was populated.

---

### M-5 — `renderEvalStrip` / `renderGateStrip` functions (MODIFY)

**File:** `apps/mcp-server/src/interface/bctc-inspector.html`

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

`renderGateStrip(data, container)` iterates `data.gate_strip` and builds a flex row per gate:
- Status dot color: green `#72c870` / yellow `#d4a017` / red `#e06060`
- Stage label: `Giai đoạn {stage_no} — {stage_name}`
- `label_suffix` rendered in muted color `#555` when present
- `metrics_summary` in monospace
- When `page_annotation.partial_fragment_warning === true` (stage 4): render orange inline badge `[FRAGMENT TRANG — {partial_label}]`

Vietnamese trust prefixes on gate header when `gate_failures` non-empty (sourced from existing `bctcEvalDetailHandler` response structure, carried through the page response):
- Red: `[ĐỘ TIN CẬY THẤP — TRÍCH XUẤT ĐỎ giai đoạn N]`
- Yellow: `[độ tin cậy thấp]`

---

### M-6 — Eval strip DOM section (MODIFY)

**File:** `apps/mcp-server/src/interface/bctc-inspector.html`

Add new right-pane section between the existing figures section and the structured table section:

```html
<!-- EVAL-STRIP: 6-gate eval strip (page-aware) -->
<div id="eval-strip-section" style="display:none">
  <div class="section-title" style="margin-bottom:6px">Kiểm tra chất lượng trích xuất</div>
  <div id="eval-strip-content">
    <div class="missing-msg">Chưa chọn tài liệu.</div>
  </div>
</div>
```

CSS for gate strip rows (add in `<style>` block, scoped `.eval-*`):
- `.eval-strip-row`: `display:flex; align-items:center; gap:8px; padding:4px 0; border-bottom:1px solid #2a2a2a`
- `.eval-dot`: `width:10px; height:10px; border-radius:50%; flex-shrink:0`
- `.eval-report-label`: `color:#555; font-size:0.8em`
- `.eval-fragment-badge`: `background:#5c2800; border:1px solid #ff8c3c; color:#fff; padding:2px 6px; border-radius:3px; font-size:0.8em`

---

### M-7 — Fragment banner in `renderTable` (MODIFY)

**File:** `apps/mcp-server/src/interface/bctc-inspector.html`

Change `renderTable(docId)` signature to `renderTable(docId, pageNum)`. Apply page-aware logic:

**PEK path (`has_pek: true`):**
- Units where `page_numbers_json.includes(pageNum)` AND `page_numbers_json.length > 1`: render with orange fragment banner above stitched_markdown: `[FRAGMENT TRANG — đang xem trang {pageNum} trong đơn vị bảng trải dài trang {minPage}–{maxPage}]`. Banner style: orange background `#5c2800`, border `#ff8c3c`, white text.
- Units where `page_numbers_json.includes(pageNum)` AND `page_numbers_json.length === 1`: render normally, no banner.
- Units NOT covering `pageNum`: render at 40% opacity with label `(trang khác: {pages})`.

**Legacy path (`has_pek: false`):**
- Filter `data.rows` to `row.page_number === pageNum`.
- Show notice: `Trang {N} — {filteredCount} hàng / {totalCount} tổng cộng`.
- If `filteredCount === 0`: show `Không có hàng bảng nào trên trang {N}`.

HARD: fragment banner for multi-page units is MANDATORY — not optional. A unit covering `[5,6,7]` rendered on page 6 without the banner is a false-green.

---

### M-8 — Updated document-select handler (MODIFY)

**File:** `apps/mcp-server/src/interface/bctc-inspector.html`

Update the `select.addEventListener("change", ...)` handler to use the new orchestration sequence:

```javascript
select.addEventListener("change", async () => {
  const docId = select.value;
  if (!docId) { resetPanes(); return; }
  currentDocId = docId;
  currentPage = 1;
  pdfNumPages = 0;
  usingIframeFallback = false;

  const item = ...; // parse from option dataset as before

  // PDF first — populates pdfNumPages, pre-renders all canvases
  await renderPdf(docId, item);
  // Navigate to page 1 — triggers OCR + eval strip + zones
  await navigateToPage(1);
  // Table and MD are report-level: fetched once per doc
  await renderTable(docId, 1); // initial page for fragment highlighting
  await renderMdTables(docId);
});
```

This ordering guarantees `pdfNumPages` is populated before `navigateToPage(1)` runs.

Also add `resetEvalPanel()` to `resetPanes()`:
```javascript
function resetEvalPanel() {
  const section = document.getElementById("eval-strip-section");
  const content = document.getElementById("eval-strip-content");
  if (section) section.style.display = "none";
  if (content) content.innerHTML = '<div class="missing-msg">Chưa chọn tài liệu.</div>';
}
```

---

### M-9 — Unit tests for `bctcEvalPageHandler` (CREATE)

**File:** `apps/mcp-server/src/__tests__/bctcEvalPageHandler.test.ts`

Required test cases:
1. Valid page mid-unit (multi-page PEK unit covering page N) → stage 4 `partial_fragment_warning: true`, `is_multi_page_unit: true`
2. Valid page in single-page unit → stage 4 `partial_fragment_warning: false`, `is_multi_page_unit: false`
3. Valid page not covered by any PEK unit → stage 4 `page_annotation.pek_unit_id: null`
4. Report with no eval rows → HTTP 409 `EVAL_NOT_COMPUTED`
5. Invalid UUID → HTTP 400 `INVALID_UUID`
6. Invalid page_no (0, negative, non-integer) → HTTP 400 `INVALID_PAGE_NO`
7. Stage 1/2/5/6 always carry `report_level: true` and `label_suffix: "(toàn báo cáo)"`
8. Stage 3 with OCR row present → `page_annotation.has_ocr_row: true`, `ocr_confidence` non-null
9. Stage 3 with no OCR row → `page_annotation.has_ocr_row: false`

---

## Trust Prefix Convention (Hard Constraint)

All Vietnamese text in the eval strip visible to the user:
- green → "TIN CẬY CAO" (green pill `#72c870`)
- yellow → "ĐỘ TIN CẬY TRUNG BÌNH" (amber pill `#d4a017`)
- red → "ĐỘ TIN CẬY THẤP" (red pill `#e06060`)

Red stage gate failure prefix: `[ĐỘ TIN CẬY THẤP — TRÍCH XUẤT ĐỎ giai đoạn N]`
Yellow stage gate failure prefix: `[độ tin cậy thấp]`

Report-level suffix rendered in UI: `(toàn báo cáo)` — NOT the French word `rapport`. The JSON field `label_suffix` carries this Vietnamese value from the server.

---

## Hard Constraints Checklist

- NO branches — all work on `main`.
- NO new page, NO new Remix route.
- PEK subtree pristine: `git -C apps/pdf-extractor/PDF-Extract-Kit diff` MUST be EMPTY at every commit.
- Frozen files UNTOUCHED: `text_table_extractor.py`, `sandbox/runner.py`, `pilot-status-pdf-extractor.json`, `generic_md_table_extractor.py`, `apps/pdf-extractor/PDF-Extract-Kit/**`.
- `bctcInspectHandler.ts` UNTOUCHED.
- `bctcEvalDetailHandler.ts` UNTOUCHED — agent contract preserved.
- `bctcEvalStore.ts` UNTOUCHED — `getEvalForReport` reused as-is.
- Scoped `git add` per file. NEVER `-A`.
- REBUILD not restart: `docker compose build --build-arg GIT_SHA=$(git rev-parse HEAD) mcp-server && docker compose up -d --no-deps --force-recreate mcp-server`.
- Partial-fragment banner is MANDATORY (not optional) when `page_numbers_json.length > 1`. QA must deliberate-violate.
- Off-HOSE only for any extraction.

---

## Acceptance Criteria

**AC-1 (HARD):** PDF pane paginates correctly — clicking next/prev scrolls the PDF canvas to the correct page. PDF pane is NOT stuck on page 1 after the user navigates away.

**AC-2 (HARD):** Page nav replays ALL panes for the selected page: OCR text updates, eval strip updates (new API call per page), table pane updates fragment highlighting, zone overlay (if enabled) updates.

**AC-3 (HARD):** Partial-fragment banner fires when inspecting a page that belongs to a multi-page PEK unit. Banner text: `[FRAGMENT TRANG — đang xem trang {N} trong đơn vị bảng trải dài trang {minPage}–{maxPage}]`. Absent when unit is single-page.

**AC-4 (HARD):** Report-level gates (stages 1, 2, 5, 6) are labeled `(toàn báo cáo)` in the eval strip — never presented as per-page values.

**AC-5 (HARD):** FPT sentinel `e71f845d-ffa5-48f9-8f09-30ac2cd09c65`:
- Selecting it renders the eval strip with 6 gate rows.
- `GET /api/bctc-eval/e71f845d-ffa5-48f9-8f09-30ac2cd09c65/page/{N}` returns HTTP 200 with `gate_strip` array of 6 items.
- `overall_status` in the page response is consistent with `GET /api/bctc-eval/e71f845d-ffa5-48f9-8f09-30ac2cd09c65`.

**AC-6 (HARD):** Anti-false-green deliberate-violation test:
- Inject a `bctc_layout_units` row with `page_numbers_json = '[5,6,7]'`. Navigate inspector to page 6. Confirm `[FRAGMENT TRANG]` banner appears. Revert.
- Inject single-page unit (`page_numbers_json = '[3]'`). Navigate to page 3. Confirm NO banner. Revert.

**AC-7 (HARD):** No eval rows case (409): existing OCR/PDF/table panes continue to function. No JS error. Soft banner only in eval strip section.

**AC-8 (HARD):** `has_pek` semantics and existing stale/gap banners untouched — zero regression.

**AC-9 (HARD):** `git diff --name-only HEAD` after commit touches ONLY the expected files: `bctcEvalPageHandler.ts`, `server.ts`, `bctc-inspector.html`, `bctcEvalPageHandler.test.ts`. Nothing else.

**AC-10 (HARD):** PEK subtree clean: `git -C apps/pdf-extractor/PDF-Extract-Kit status --porcelain` = empty.

---

## QA Verification Steps

1. Select FPT sentinel → eval strip renders 6 rows, stages 1/2/5/6 show `(toàn báo cáo)`.
2. Click next to page 2 → PDF canvas scrolls to page 2 (not stuck at page 1).
3. Click to page 7 → PDF scrolls to page 7, eval strip re-fetches `/page/7`, table pane highlights units covering page 7.
4. If page 7 is in a multi-page PEK unit → `[FRAGMENT TRANG]` banner visible in orange.
5. Deselect doc → eval strip hides, panes reset. Reselect → strips repopulate cleanly.
6. Network tab: `GET /api/bctc-eval/{sentinel}/page/{N}` fires on each page nav click.
7. Deliberate-violation injection tests (AC-6).
8. Vietnamese labels render with correct UTF-8 diacritics, no mojibake.

---

## [Developer] Implementation Record — Task #9 (Dual-View Gate Strip M-1..M-7)

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/interface/mcp/routes/bctcEvalPageHandler.ts` — M-1 LayoutUnitRow +3 fields; M-2 S4 SELECT extended; M-3 ocrBasename capture + pek debug vars + safeParseJson() + debug sub-object per gate (additive, existing fields byte-identical)
  - `apps/mcp-server/src/interface/bctc-inspector.html` — M-4 additive CSS; M-5 segmented toggle HTML; M-6 evalViewMode+lastEvalData vars, setEvalViewMode(), button wire, renderDebugBlock(), renderEvalStrip cache+mode, renderGateStrip mode param + conditional agent append
  - `apps/mcp-server/src/__tests__/bctcEvalPageHandler.test.ts` — M-7 TC-D1 + DV-2 + non-regression assertions
- **Tests written:** bctcEvalPageHandler.test.ts — 6 new tests (TC-D1×2 + DV-2), 140 expect() calls total, GREEN
- **Git commits:** 24e9776d (impl) | f1b1b688 (notebook)
- **Type check:** clean (bun tsc --noEmit EXIT 0)
- **bun test:** 15 pass / 0 fail (bctcEvalPageHandler.test.ts)
- **Tool count:** 148 tools — matches pre-task baseline
- **Scheduler count:** 70 cron.schedule entries
- **Frozen surfaces confirmed 0-diff:** bctcEvalDetailHandler.ts, bctcInspectHandler.ts, bctcEvalStore.ts, full-report endpoint, PEK subtree
- **DV-2 deliberate-violation evidence:** debug.metrics_json must be typeof "object" (parsed); if handler emits raw string → typeof "string" ≠ "object" → RED. Gate is non-hollow.
- **Honesty:** stages 1/2/5/6 carry `⚑ toàn báo cáo` label in debug block; stages 3/4 show genuine page-scoped DB evidence only; no per-page fabrication for report_level:true gates.
- **Docs updated:** NONE (additive endpoint extension, no architecture doc change needed)
- **ops_rebuild_required:** true — HTML baked into image; docker compose up -d --build --force-recreate mcp-server
