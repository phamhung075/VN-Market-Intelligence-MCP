<!-- size-justification: ~160L — single-zone two-artifact feature; full design fits here without sub-splitting -->
# Architecture Brief: BCTC-AI-INPUT-TAB

**Sprint:** BCTC-AI-INPUT-TAB
**Date:** 2026-05-30
**Architect scope:** mcp-server only (zone `dev-mcp-server`, serial, one git tree)
**Artifacts touched:** 3 (server.ts dispatch + bctcInspectHandler.ts + bctc-inspector.html) + 1 new test file

---

## 1. Brownfield Summary

| File | Role | Key facts |
|---|---|---|
| `apps/mcp-server/src/interface/bctc-inspector.html` | 2603L embedded HTML+JS viewer | Tab bar L899-904; `switchTab()` L2578; `navigateToPage()` L1249 |
| `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` | All `/api/bctc-inspect/*` GET handlers | UUID-validates docId; `handleBctcInspectPdf` pattern = direct `readFileSync` from DB-resolved path |
| `apps/mcp-server/src/interface/mcp/server.ts` | Dispatch table | Pattern: `if (method==="GET" && pathname.startsWith(prefix)) { handler(req,res,db,docId); return; }` |
| `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPageImageTool.ts` | MCP tool (FR-4) | `getPngPath(reportId, page)` = `process.cwd()/data/bctc-page-images/{id}/page_{0001}.png`; DB resolves reportId→pdf_path |
| `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPageTextTool.ts` | MCP tool (FR-3) | report_id→basename(pdf_path)→pdf-extractor `/api/page-text`; NOT a direct SQLite read |
| `docker-compose.yml` L23 | Volume | Named volume `bctc-page-images` mounted at `/data/bctc-page-images` in BOTH mcp-server AND pdf-extractor |

**Critical volume finding:** The PNG path in the MCP tool uses `process.cwd()/data/bctc-page-images/...` but the docker-compose mount is `bctc-page-images:/data/bctc-page-images` (absolute, not relative to /app). The existing tool resolves this correctly at runtime. The new HTTP route must use the same `getPngPath()` helper (or its inline equivalent: `/data/bctc-page-images/{reportId}/page_{paddedPage}.png`) — NOT `process.cwd()+"/data/..."` which would resolve to `/app/data/bctc-page-images` (wrong mount point). Confirm: use the absolute volume path `/data/bctc-page-images/{reportId}/page_{paddedPage}.png`.

**Existing OCR route:** `GET /api/bctc-inspect/ocr/{docId}?page=N` → `handleBctcInspectOcr()` — already returns `text_content` per page from `pdf_extracted_text` (or PEK layout units). The `aiinput` tab REUSES this endpoint for the OCR text component. No new endpoint needed for text.

**Page-window source:** `bctc_refined_units` table, column `page_numbers_json`. NOT the same as `bctc_layout_units`. The `aiinput` endpoint must query `bctc_refined_units` for units covering the requested page via `json_each(page_numbers_json)` (same pattern as existing PEK query in `handleBctcInspectOcr`).

---

## 2. PNG-Serving Seam Decision (the crux)

**Decision: mcp-server reads the PNG directly from the shared named volume. No proxy to pdf-extractor.**

Rationale:
- The named volume `bctc-page-images` is already mounted in mcp-server at `/data/bctc-page-images`. This is proven by `getBctcPageImageTool.ts` which calls `readFileSync(getPngPath(...))` inside the same container.
- The existing `handleBctcInspectPdf` handler uses `readFileSync(pdfPath)` from a DB-resolved path — the new image handler is structurally identical, only the path formula differs.
- Proxying to pdf-extractor would add a network hop, a container dependency, and a new failure mode for a read-only operation. The file is already accessible locally.
- On-demand rasterization is OUT OF SCOPE for this tab. The tab shows what the agent ALREADY SAW. If the PNG does not exist, that is an honest state — show empty state, never trigger rasterization.

**Absolute PNG path formula inside mcp-server container:**
```
/data/bctc-page-images/{reportId}/page_{String(pageNum).padStart(4,'0')}.png
```

**Empty state rule:** If the file does not exist (`existsSync` returns false), respond HTTP 404 with `{ error: "png_not_found" }`. The tab renders this as the Vietnamese empty state text "chưa có ảnh trang này". NEVER serve a placeholder, never return 200 with empty body.

---

## 3. New HTTP Route

**Route:** `GET /api/bctc-inspect/page-image/{docId}?page=N`

**Handler name:** `handleBctcInspectPageImage`

**File:** `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` (additive export, same file as existing handlers — no new file needed for one small handler)

**DDD layer:** interface (read-only file access, no domain logic, DB used only to validate docId exists)

**Handler contract:**
1. Validate docId with `isValidUuid()` — 400 on failure (existing helper, reuse).
2. Parse `?page=N` (integer, default 1, min 1).
3. Verify docId exists in `financial_reports` — 404 `{ error: "doc_not_found" }` on miss.
4. Compute `pngPath = /data/bctc-page-images/${docId}/page_${String(page).padStart(4,'0')}.png`.
5. `existsSync(pngPath)` — if false, 404 `{ error: "png_not_found", doc_id: docId, page }`.
6. `readFileSync(pngPath)` — respond 200 `Content-Type: image/png`, `Content-Length`, body = raw bytes.
7. Catch block → 500 `{ error: "server_error" }`.

Note: step 3 (validate docId in DB) is a security guard — prevents filesystem probing via fabricated UUIDs. The path is fully server-computed (no user-supplied path component), consistent with how `handleBctcInspectPdf` works.

**server.ts dispatch (additive, after the zones handler):**
```typescript
// AIT-DEV: AI Input Tab — serve agent-input page PNG
if (method === "GET" && pathname.startsWith("/api/bctc-inspect/page-image/")) {
  const docId = pathname.slice("/api/bctc-inspect/page-image/".length);
  handleBctcInspectPageImage(req, res, db, docId);
  return;
}
```

---

## 4. New Endpoint for Page-Window Context

**Route:** `GET /api/bctc-inspect/page-window/{docId}?page=N`

**Handler name:** `handleBctcInspectPageWindow`

**File:** `bctcInspectHandler.ts` (additive export, same file)

**Query:** `bctc_refined_units` for `(report_id=docId, json_each(page_numbers_json) contains page)` — return `{ unit_id, page_numbers_json (parsed array), row_count, confidence }` or `{ unit_id: null, page_numbers: [] }` when no unit covers this page.

This is a thin DB read, no file I/O. Response is JSON, never empty-body. Returns 200 in both hit and miss cases (miss = `{ found: false }`).

---

## 5. OCR Text — Reuse Decision

The existing `GET /api/bctc-inspect/ocr/{docId}?page=N` already returns `text_content` for the selected page. The `aiinput` tab JS fetches this same endpoint (already in flight for the `ocr` tab on every page change). The result can be read from a JS module-level cache variable `lastOcrData` (already populated by `renderOcr()`).

**Decision: no new OCR endpoint.** The `aiinput` tab reads from the same `lastOcrData` object populated by `renderOcr()`, which fires on every `navigateToPage()` call. Zero fetch duplication.

---

## 6. Static Refine Contract (Optional Item 4 from Scope)

Include as a hard-coded collapsed `<details>` block inside the `aiinput` tab panel. The contract text is a static string in the HTML — no server round-trip. Architect recommends including it: it costs zero and adds operator transparency.

---

## 7. HTML/JS Changes (bctc-inspector.html)

### Tab button (L904 area, after `suatay` button):
```html
<button class="rtab-btn" data-tab="aiinput" id="rtab-aiinput">Đầu vào AI</button>
```

### Tab panel (after `suatay` panel, before `#right-tab-panels` close comment):
```html
<!-- TAB: Đầu vào AI (AIT — agent-input bundle per page) -->
<div class="tab-panel" data-tab-panel="aiinput" id="tab-panel-aiinput">
  <div style="padding:12px 14px;flex:1;background:#181e28;display:flex;flex-direction:column;gap:12px;">
    <div class="section-title">Đầu vào AI — trang đang chọn</div>
    <!-- Image sub-section -->
    <div id="aiinput-image-wrap" style="flex-shrink:0;">
      <div style="font-size:11px;color:#888;margin-bottom:4px;">Ảnh trang (PNG agent đã nhận)</div>
      <div id="aiinput-image-content"><div class="missing-msg">Chưa chọn tài liệu.</div></div>
    </div>
    <!-- Page-window sub-section -->
    <div id="aiinput-window-wrap" style="flex-shrink:0;">
      <div style="font-size:11px;color:#888;margin-bottom:4px;">Cửa sổ trang (các trang cùng được nạp)</div>
      <div id="aiinput-window-content"><div class="missing-msg">—</div></div>
    </div>
    <!-- OCR text (reused from lastOcrData) -->
    <div id="aiinput-ocr-wrap" style="flex:1;min-height:0;overflow:auto;">
      <div style="font-size:11px;color:#888;margin-bottom:4px;">Văn bản OCR truyền cho agent</div>
      <pre id="aiinput-ocr-content" style="white-space:pre-wrap;font-size:11px;color:#ccc;">—</pre>
    </div>
    <!-- Static refine contract (collapsed) -->
    <details style="flex-shrink:0;font-size:11px;color:#888;">
      <summary>Hướng dẫn agent (refine contract, chỉ đọc)</summary>
      <pre style="white-space:pre-wrap;color:#aaa;margin-top:4px;">numbers ← text (OCR is authoritative for digits); structure ← image (image is authoritative for row/column layout); disagreement → FLAG, never guess.</pre>
    </details>
  </div>
</div>
```

### JS — `renderAiInputTab(docId, page)` function (new, called from `navigateToPage`):

```javascript
async function renderAiInputTab(docId, page) {
  // Image
  const imgContent = document.getElementById('aiinput-image-content');
  imgContent.innerHTML = '<div class="missing-msg">Caricamento...</div>';
  const imgUrl = `${BASE}/api/bctc-inspect/page-image/${encodeURIComponent(docId)}?page=${page}`;
  const testImg = new Image();
  testImg.onload = () => {
    imgContent.innerHTML = '';
    imgContent.appendChild(testImg);
    testImg.style.maxWidth = '100%';
  };
  testImg.onerror = () => {
    imgContent.innerHTML = '<div class="missing-msg">chưa có ảnh trang này</div>';
  };
  testImg.src = imgUrl;

  // Page-window
  const winContent = document.getElementById('aiinput-window-content');
  try {
    const wr = await fetch(`${BASE}/api/bctc-inspect/page-window/${encodeURIComponent(docId)}?page=${page}`);
    const wd = await wr.json();
    if (wd.found && wd.page_numbers?.length) {
      winContent.textContent = `Unit ${wd.unit_id} — trang: [${wd.page_numbers.join(', ')}]`;
    } else {
      winContent.textContent = 'Trang này không thuộc unit nào trong bctc_refined_units.';
    }
  } catch { winContent.textContent = '(lỗi tải cửa sổ trang)'; }

  // OCR — reuse lastOcrData populated by renderOcr() which already ran this page
  const ocrPre = document.getElementById('aiinput-ocr-content');
  ocrPre.textContent = (typeof lastOcrData !== 'undefined' && lastOcrData?.text_content) ? lastOcrData.text_content : '(chưa có văn bản OCR)';
}
```

### `navigateToPage()` — add one call (step 6, additive):
```javascript
// 6. AIT: render AI input bundle for this page
if (activeTab === 'aiinput') await renderAiInputTab(currentDocId, pageNum);
```

Note: `renderAiInputTab` is only called when the `aiinput` tab is active (lazy, avoids redundant network calls on every page nav when user is not on this tab). On `switchTab('aiinput')`, also call `renderAiInputTab(currentDocId, currentPage)` if `currentDocId` is set — same pattern as the `suatay` tab auto-load.

---

## 8. File Change Summary

| File | Change type | Description |
|---|---|---|
| `bctcInspectHandler.ts` | additive | +`handleBctcInspectPageImage` (PNG bytes, ~40L) + `handleBctcInspectPageWindow` (page-window JSON, ~35L) |
| `server.ts` | additive | +2 dispatch blocks (~8L total) |
| `bctc-inspector.html` | additive | +1 tab button, +1 tab panel (~40L HTML), +`renderAiInputTab` JS function (~30L), +1 line in `navigateToPage`, +1 line in `switchTab` handler |
| `AIT-DEV-1.test.ts` (new) | new | DV tests for page-image route (magic-number + 404 path) + page-window route + HTML structure assertions |

Total net addition: ~150L production + ~100L test. Zero deletions.

---

## 9. Anti-False-Green Gate Spec (QA contract)

Test file: `apps/mcp-server/src/__tests__/AIT-DEV-1.test.ts`

**Tests that must be RED before production code, GREEN after (same commit):**

1. **`handleBctcInspectPageImage` — real bytes gate (the critical one)**
   - Setup: create temp PNG file with valid PNG magic bytes `\x89PNG\r\n\x1a\n` (8 bytes), seed a `financial_reports` row with a known UUID, call `handleBctcInspectPageImage` with that UUID + page.
   - Assert: HTTP 200, `Content-Type: image/png`, response body starts with PNG magic bytes `[0x89, 0x50, 0x4e, 0x47]`. NOT an echo of a JSON body, NOT empty.
   - This test PROVES the route returns real PNG bytes, not a stub.

2. **`handleBctcInspectPageImage` — absent file → 404**
   - Setup: seed `financial_reports` row, but do NOT create the PNG file.
   - Assert: HTTP 404, JSON body contains `error: "png_not_found"`.

3. **`handleBctcInspectPageImage` — invalid UUID → 400**
   - Assert: HTTP 400, `error: "invalid_doc_id"`.

4. **`handleBctcInspectPageWindow` — hit**
   - Setup: seed `bctc_refined_units` row with `page_numbers_json: "[2,3,4]"`, request page=3.
   - Assert: 200, `found: true`, `page_numbers` contains 2, 3, 4.

5. **`handleBctcInspectPageWindow` — miss**
   - Request page=99 (no unit covers it). Assert: 200, `found: false`.

6. **HTML regression — 7th tab button present**
   - Assert `html` contains `data-tab="aiinput"` and `data-tab-panel="aiinput"`.

7. **HTML regression — all 6 existing tabs still present**
   - Re-run the 6 assertions from `HC-DEV-7-layout.test.ts` verbatim (copy, do not modify the original test file).

**In-container verification (ops step, not automated):**
```bash
docker exec mcp-server bun -e "
  import { readFileSync } from 'fs';
  const b = readFileSync('/data/bctc-page-images/<known-id>/page_0001.png');
  console.log(b.slice(0,4)); // must print <Buffer 89 50 4e 47>
"
```
Proves the volume mount is readable at the exact path the handler uses.

---

## 10. DDD Layer Assignment

- `handleBctcInspectPageImage` → **interface** layer (direct file I/O inside the interface handler, same precedent as `handleBctcInspectPdf`; no domain logic, no business rule).
- `handleBctcInspectPageWindow` → **interface** layer (thin DB read, no domain logic).
- No new domain or application layer changes.

---

## 11. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Volume mount path wrong (`/app/data/...` vs `/data/...`) | HIGH | Hard-code absolute path `/data/bctc-page-images/...`; in-container smoke test proves it before QA sign-off |
| `lastOcrData` not yet populated when user opens `aiinput` tab before OCR loads | LOW | `renderOcr` fires before `renderAiInputTab` in `navigateToPage`; guard with null check |
| `bctc_refined_units` table absent in test DB | LOW | Test setup uses `:memory:` DB via setup.ts; create table in test setup block |
| PNG `Content-Length` mismatch on large files | NEGLIGIBLE | `readFileSync` returns exact buffer; `Buffer.length` is correct |

---

## 12. Routing Call: Skip BA/PM

**Direct to `dev-mcp-server`.** This is a single-zone, two-handler, one-tab change. The design is fully specified: exact handler signatures, exact dispatch patterns, exact test assertions. BA decomposition would add a round-trip with no new information. PM task breakdown is trivial (one task: implement this brief). Dispatch to `dev-mcp-server` with this brief as the implementation contract.
