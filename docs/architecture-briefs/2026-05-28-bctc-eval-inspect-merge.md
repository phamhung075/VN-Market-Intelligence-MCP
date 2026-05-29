# Architecture Brief — BCTC-EVAL-INSPECT-MERGE

> **SUPERSEDED by 2026-05-29-bctc-eval-inspect-merge.md** — this earlier pass (Option b) predates the PDF-pagination + partial-table + page-master-replay requirements. Do NOT implement from this file.

## Fold the 6-Stage Eval Gate Strip into the Existing /api/bctc-inspect Viewer

**Sprint:** BCTC-EVAL-INSPECT-MERGE
**Date:** 2026-05-29
**Author:** architect
**Status:** SUPERSEDED — see 2026-05-29-bctc-eval-inspect-merge.md

---

## §0 USER DIRECTIVE (verbatim)

> "i want you merge all gate to http://localhost:3000/api/bctc-inspect page by page for see flow
> data change on each gate, do not create another page, we have already page for user can review"

**Interpretation confirmed:**
- Surface the 6 eval gate verdicts inside `/api/bctc-inspect`, not on a new page.
- As the user pages through a PDF, they see how the data representation changes at each extraction stage — RASTERIZE → LAYOUT_DETECT → OCR → TABLE_RECONSTRUCT → MARKDOWN_RENDER → STRUCTURED_EXTRACT.
- The `/dashboard/bctc-eval` Remix page stays unchanged (serves agent consumers + fleet list). This task is ADDITIVE to the inspect viewer only.

---

## §1 KEY DESIGN TENSION — RESOLVED

### The mismatch

Eval results in `bctc_eval_results` are **per-report × 6 stages** (6 rows per report).
The inspect viewer is **per-page** (`?page=N`, `PAGE_SIZE=1`).

### Options considered

**Option (a) — Report-level strip, constant across pages.**
Show a persistent 6-gate strip at the top of the viewer that does NOT change as the user
navigates. Honest: the verdicts ARE report-level. Simplest. Zero false-granularity risk.

**Option (b) — Per-page stage-flow panel.**
For the current page, show the data representation at each of the 6 stages with the report-level
gate verdict badge on each stage header. This is what the user described with "flow data change
on each gate." Stage-to-inspect-data mapping is direct (see §5 below). Report-level badges are
clearly labelled "báo cáo" so we never claim per-page granularity we don't have.

**Option (c) — Hybrid: strip (a) + per-page panel (b).**

### DECISION: Option (b) — per-page stage-flow panel

Rationale:
1. The user said "page by page for see flow data change on each gate." Option (a) satisfies the
   gate-visibility half but not the "flow data change" half. The user already has a report-level
   view at `/dashboard/bctc-eval` — repeating it in the inspector adds no new information.
2. Option (b) can be rendered honestly: the report-level gate badge on each stage header is
   labeled "MỨC ĐỘ TIN CẬY (toàn báo cáo)" — "trust level for the whole report." It is clear
   to a non-technical user that the badge covers the full document, not just this page. The
   per-page content panels (raster thumbnail not shown — expensive; OCR text, table rows,
   markdown, figures) are already in the viewer. Option (b) groups what already exists under
   named stage headers and adds the gate badge.
3. Anti-false-green: we DO NOT fabricate per-page eval metrics. Detectors that are report-level
   stay report-level. The stage badge is the report-level status; the content panel below it is
   the per-page artifact. This distinction is explicit in the UI (label: "Trang N của báo cáo").
4. Option (b) supersedes Option (a): the strip is unnecessary because the badges already appear
   inline in the stage headers.

---

## §2 DESIGN OVERVIEW

### What changes

One new HTML section in `bctc-inspector.html` (the eval gate panel), placed between the doc
selector bar and the existing split-pane layout. The panel:
- Fetches `GET /api/bctc-eval/{doc_id}` when a document is selected.
- Renders 6 collapsible stage cards horizontally (or stacked on narrow widths), each containing:
  - Stage header: "Giai đoạn N — STAGE_NAME" + status badge (color-coded).
  - Below the badge: a brief label describing what artifact is shown in the existing pane that
    corresponds to this stage.
  - Gate failures list (if any).
- Gate verdicts use Vietnamese trust prefixes per user feedback (see §6).
- On eval-not-yet-computed (409) or no eval rows: the panel shows a soft "chưa có dữ liệu kiểm định" banner — DOES NOT break existing inspect behavior.
- No new route. No new page. Additive HTML + JS only.

### What does NOT change

- All existing OCR, PDF, table, markdown, figures, zone-overlay panes: untouched logic.
- `has_pek` flag: always emitted, unchanged.
- `/api/bctc-inspect/docs`, `/pdf/`, `/ocr/`, `/table/` endpoints: no changes.
- The `/dashboard/bctc-eval` Remix routes: untouched (agent consumers read from there).
- Frozen files: `text_table_extractor.py`, `sandbox/runner.py`, `pilot-status-pdf-extractor.json`,
  `generic_md_table_extractor.py`, `apps/pdf-extractor/PDF-Extract-Kit/` subtree.

---

## §3 API CHANGE — NO NEW ENDPOINT

The eval detail endpoint already exists: `GET /api/bctc-eval/{report_id}` → `bctcEvalDetailHandler.ts`.

The inspect viewer **calls it from client-side JS** when a document is selected. There is NO
change to any server-side handler. The `doc_id` from the inspector is the same UUID as
`report_id` in the eval store — direct call.

**No new sub-route. No duplication of the eval query.**

`getEvalForReport` in `bctcEvalStore.ts` is called only by `bctcEvalDetailHandler.ts` which
already exists. The inspector HTML fetches that same endpoint.

**JSON contract reused verbatim** (schema_version: "1" from BCTC-EVAL-SUBSTRATE §4):
```
GET /api/bctc-eval/{report_id}
→ { schema_version, report_id, ticker, period, overall_status, has_pek, stages[], ... }
```

The JS in `bctc-inspector.html` reads `stages[]` and maps them to the UI panel.

---

## §4 DOM / SECTION LAYOUT

### Placement

The eval gate panel is inserted as a new `<div id="eval-gate-panel">` BETWEEN the controls bar
(`<div class="controls">`) and the split pane (`<div class="split">`).

```html
<div class="controls"> ... </div>

<!-- NEW: Eval gate panel — injected here -->
<div id="eval-gate-panel" style="display:none">
  ...
</div>

<div class="split"> ... </div>
```

This placement keeps the eval panel visible at all times while a document is open, without
obscuring either the PDF pane or the right-side text/table panes.

### Panel interior DOM structure

```
#eval-gate-panel
  div.eval-panel-header          ← "Kiểm định trích xuất: <ticker> <period>"
  div.eval-stages-row
    div.eval-stage-card × 6     ← one per stage, side-by-side (flex row, wrap)
      div.eval-stage-header      ← "Giai đoạn N — <STAGE_NAME>"
      span.eval-badge            ← trust badge (color by status)
      div.eval-stage-desc        ← one-line description of what panel shows this data
      ul.eval-gate-failures      ← populated only when gate_failures non-empty
```

### Responsive behavior

`display: flex; flex-wrap: wrap; gap: 8px;` on `.eval-stages-row`.
Each `.eval-stage-card` has `min-width: 160px; flex: 1;`.
On the 1600px dev monitor this renders 6 cards in one row.
On narrow widths they wrap. No media query needed — flex-wrap handles it.

### State management

A module-level variable `let evalData = null;` holds the last fetched eval JSON.
Reset to null on doc deselect. Populated after each doc selection (async fetch from
`/api/bctc-eval/{docId}` in `loadEvalPanel(docId)`).

Eval panel is fetched ONCE per document selection (not per page turn). The badge does not
change per-page because verdicts are report-level — the panel is static until the next doc
selection. The existing OCR/table panes continue to refresh per page turn as before.

---

## §5 STAGE → INSPECT DATA MAPPING

The user wants to "see flow data change on each gate." The mapping below connects each eval
stage to the existing inspect pane that shows its output artifact. This is where "flow data
change" becomes literal — not fabricated.

| Stage | Stage name | Eval metric (report-level) | Existing inspect artifact |
|---|---|---|---|
| 1 | RASTERIZE | `page_count_rasterized`, `sha_stable` | PDF viewer (left pane) — the rasterized pages are what pdf.js renders. Stage 1 = "có PDF" indicator. |
| 2 | LAYOUT_DETECT | `detected_table_count`, `abandon_rate`, `median_conf` | Zone Overlay toggle (LF-OVERLAY). Detected layout zones are what the colored SVG overlay shows. |
| 3 | OCR | `vn_diacritic_ratio`, `anchor_phrases_found` | "OCR Text" pane (right pane, lower section). The text shown is the OCR output evaluated by stage 3. |
| 4 | TABLE_RECONSTRUCT | `label_coverage`, `code_coverage`, `exact_dup_count` | "Structured Table" pane — `bctc_table_rows` rows are the TABLE_RECONSTRUCT output. |
| 5 | MARKDOWN_RENDER | `roundtrip_row_match_ratio` | "Markdown Tables" pane — `bctc_md_tables` is the MARKDOWN_RENDER output. |
| 6 | STRUCTURED_EXTRACT | `golden_row_match_ratio`, `balance_pass` (signal only) | "Parsed Financial Figures" section (top of right pane) — net_revenue, net_profit, etc. are the STRUCTURED_EXTRACT output. |

### Honesty labels in the eval-stage-desc

Each card's description (`div.eval-stage-desc`) carries a one-line label pointing at the pane:

| Stage | desc text |
|---|---|
| 1 | "Xem: bảng PDF bên trái (trang tài liệu đã raster hóa)" |
| 2 | "Xem: bật Zone Overlay để thấy vùng layout được phát hiện" |
| 3 | "Xem: phần OCR Text bên phải (văn bản trên trang này)" |
| 4 | "Xem: phần Structured Table bên phải (bảng đã tái cấu trúc)" |
| 5 | "Xem: phần Markdown Tables bên phải (bảng markdown)" |
| 6 | "Xem: phần Parsed Financial Figures bên phải (số liệu tài chính)" |

This makes the "flow data change" literal: for each stage, the user sees the badge AND knows
exactly which pane shows that stage's output.

---

## §6 TRUST PREFIX — VIETNAMESE NON-TECHNICAL LABELS

Per `feedback_market_report_plain_vietnamese` and user directive: no jargon.

### Badge rendering

| Eval status | Badge text | Badge style |
|---|---|---|
| `green` | "TIN CẬY CAO" | green background (#2d4a2d), green text (#72c870) |
| `yellow` | "ĐỘ TIN CẬY TRUNG BÌNH" | amber background (#4a3a1a), amber text (#d4a017) |
| `red` | "ĐỘ TIN CẬY THẤP" | red background (#4a1a1a), red text (#e06060) |

### Prefixes on gate failure text

When a stage has `gate_failures` (non-empty array), the stage card header prepends:

- Red stage: `[ĐỘ TIN CẬY THẤP — TRÍCH XUẤT ĐỎ giai đoạn N]`
- Yellow stage: `[độ tin cậy thấp]`

The existing stage name is kept on the card header (e.g. "Giai đoạn 4 — TÁI CẤU TRÚC BẢNG").
Gate failure items are listed below the badge as plain Vietnamese text derived from the
`gate_id` + `actual` fields already in the API response.

Gate failure display format (max 3 items, rest truncated to "... và N lỗi khác"):
```
• label_coverage: 0.72 (ngưỡng: 0.90)
• exact_dup_count: 14 (ngưỡng: 0)
```
`threshold` comes from `gate_failures[].threshold`, `actual` from `gate_failures[].actual`.
No hardcoded numbers — read from the API response.

### Overall trust banner

A single-line banner at the top of the eval panel (inside `div.eval-panel-header`):
- `overall_status = green`: not shown (no banner needed — absence = good).
- `overall_status = yellow`: `⚠ Báo cáo này có một số điểm cần chú ý — xem chi tiết bên dưới.`
- `overall_status = red`: `[ĐỘ TIN CẬY THẤP — TRÍCH XUẤT ĐỎ] Báo cáo này có vấn đề ở giai đoạn trích xuất — các số liệu có thể không chính xác.`

---

## §7 EVAL_NOT_COMPUTED (409) — GRACEFUL DEGRADE

When `GET /api/bctc-eval/{report_id}` returns 409 (eval rows not yet computed):

- Show the eval panel with a single soft banner:
  `"Chưa có dữ liệu kiểm định cho báo cáo này. Kết quả trích xuất vẫn hiển thị bên dưới."`
- No stage cards rendered (not a fake "unknown" state — simply absent).
- All existing inspect panes (PDF, OCR, table, etc.) continue to function normally.
- `has_pek` flag and all existing banners (stale, gap) continue to function normally.

When `GET /api/bctc-eval/{report_id}` returns 404 (report not found in eval, rare edge):
- Same soft banner as 409.

When the eval fetch itself throws a network error:
- Silent no-op: eval panel hidden. A console.warn is emitted. Existing panes unaffected.
- No error is surfaced to the user for a supplementary panel that is not load-bearing.

---

## §8 IMPLEMENTATION SCOPE — FILES TO MODIFY

### ONLY file: `apps/mcp-server/src/interface/bctc-inspector.html`

This is the single file to edit. No TypeScript handler changes. No new routes. No new files.

Current: 1391 lines.
Expected addition: ~120-150 lines (CSS styles + HTML section + JS loadEvalPanel function).
Result: ~1510-1540 lines.

Note: `bctc-inspector.html` is NOT a governed file under `docs/data/file-size-caps.json`
(caps apply to docs/ and .claude/ markdown files only — not source code files).
The 120L split policy applies to flow files and skill files, not to HTML source assets.

### Changes within the HTML file

1. **CSS block** (add inside `<style>`): `.eval-gate-panel`, `.eval-stages-row`,
   `.eval-stage-card`, `.eval-stage-header`, `.eval-badge`, `.eval-stage-desc`,
   `.eval-gate-failures`, `.eval-overall-banner` — all scoped, no conflicts with existing rules.

2. **HTML block** (add between `.controls` and `.split`):
   ```html
   <div id="eval-gate-panel" style="display:none">
     <div class="eval-overall-banner" id="eval-overall-banner" style="display:none"></div>
     <div class="eval-stages-row" id="eval-stages-row"></div>
   </div>
   ```

3. **JS block** (add in `<script type="module">`, called from document selection handler):
   ```js
   async function loadEvalPanel(docId) {
     // fetch /api/bctc-eval/{docId}
     // render 6 stage cards into #eval-stages-row
     // set overall banner in #eval-overall-banner
     // show panel
   }
   ```
   Called inside the `select.addEventListener("change", ...)` handler, alongside the existing
   `renderPdf`, `renderOcr`, `renderTable`, `renderMdTables` calls.

   Also add `resetEvalPanel()` called from `resetPanes()` to hide the panel on deselect.

### DDD layer compliance

All changes are in the interface layer (`bctc-inspector.html` is the served HTML surface).
No domain, application, or infrastructure code is touched.
`getEvalForReport` in `bctcEvalStore.ts` is not modified.
`bctcEvalDetailHandler.ts` is not modified.
The JS in the HTML calls the existing `/api/bctc-eval/{docId}` endpoint — no new handler needed.

---

## §9 RISK FLAGS

**R-1 (LOW): eval endpoint returns slowly on first hit.**
Mitigation: fetch is async and non-blocking. The panel renders after the eval fetch resolves,
independently of the PDF/OCR pane rendering. User sees PDF and OCR text immediately; eval
panel appears ~100ms later. No spinner needed — panel slides in on resolve.

**R-2 (LOW): doc_id vs report_id mismatch.**
The inspect viewer uses `doc_id` which equals `financial_reports.id` which equals
`report_id` in `bctc_eval_results`. No translation needed. Confirmed by reading
`bctcEvalDetailHandler.ts` line 53: `WHERE id = ?` on `financial_reports`, and the eval
store FK: `report_id TEXT REFERENCES financial_reports(id)`. Same UUID.

**R-3 (LOW): 84 backfilled rows confirmed.**
Sprint BCTC-EVAL-SUBSTRATE confirmed 14 reports × 6 stages = 84 rows backfilled.
Every document in the inspector dropdown will have eval rows, so the 409 path is the
exception, not the rule.

**R-4 (LOW): HTML file size.**
Adding ~140 lines to a 1391-line file is safe. The file is a static asset served from disk
via `readFileSync`. No compilation step. No split policy applies to HTML source files.

**R-5 (ZERO): No per-page eval row fabrication.**
Design explicitly avoids inventing per-page metrics. Stage badges are report-level, labeled
clearly as "toàn báo cáo." Stage content descriptions point at the existing panes which are
already per-page. No false-granularity is introduced.

**R-6 (ZERO): Frozen surfaces.**
Zero changes to: `text_table_extractor.py`, `sandbox/runner.py`,
`pilot-status-pdf-extractor.json`, `generic_md_table_extractor.py`,
`apps/pdf-extractor/PDF-Extract-Kit/` subtree, `apps/pdf-extractor/dashboard/`,
`apps/pdf-extractor/interface/viewer.html`.

---

## §10 ACCEPTANCE CRITERIA

**AC-1 (HARD):** When a document with 6 eval rows is selected, the eval gate panel appears
with 6 stage cards, each showing a badge (green/yellow/red) and a description pointing to
the corresponding pane.

**AC-2 (HARD):** A `red` stage card shows the prefix `[ĐỘ TIN CẬY THẤP — TRÍCH XUẤT ĐỎ
giai đoạn N]` and lists gate failures with `actual` vs `threshold` values.

**AC-3 (HARD):** When eval is not yet computed (409), the existing OCR/PDF/table panes
continue to function normally. No JS error. No blank page. Soft banner only.

**AC-4 (HARD):** `has_pek` flag and its banners (pek-stale-banner, pek-gap-banner) continue
to work exactly as before. The eval panel is purely additive — zero regression.

**AC-5 (HARD):** No new route, no new page, no new TS file. Diff touches only
`bctc-inspector.html`.

**AC-6 (HARD):** PEK subtree pristine after commit:
`git -C apps/pdf-extractor/PDF-Extract-Kit status --porcelain` = empty.

**AC-7 (HARD):** Vietnamese trust labels used throughout — no English jargon in the eval
panel visible to the user. "TIN CẬY CAO", "ĐỘ TIN CẬY TRUNG BÌNH", "ĐỘ TIN CẬY THẤP."

**AC-8 (HARD):** FPT Q4-2025 sentinel (`e71f845d-ffa5-48f9-8f09-30ac2cd09c65`):
selecting it in the inspector renders all 6 stage cards. `overall_status` is consistent with
`GET /api/bctc-eval/e71f845d-ffa5-48f9-8f09-30ac2cd09c65`.

---

## §11 DDD LAYER TABLE

| File | Zone | Layer | Change |
|---|---|---|---|
| `apps/mcp-server/src/interface/bctc-inspector.html` | mcp-server | interface | MODIFY — add eval panel CSS + HTML + JS (~140 lines) |
| `apps/mcp-server/src/interface/mcp/routes/bctcEvalDetailHandler.ts` | mcp-server | interface | NO CHANGE — existing endpoint consumed as-is |
| `apps/mcp-server/src/infrastructure/db/bctcEvalStore.ts` | mcp-server | infrastructure | NO CHANGE — existing store |
| `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` | mcp-server | interface | NO CHANGE — existing handlers |

**BUILD-STANDARD: lean** — single-file additive change to an existing HTML surface.

---

## §12 HARD CONSTRAINTS CHECKLIST

- NO new page, NO new route, NO new file — additive to `bctc-inspector.html` only.
- `has_pek` semantics unchanged; all existing inspect panes continue to function.
- PEK subtree pristine: `git -C apps/pdf-extractor/PDF-Extract-Kit status --porcelain` = 0.
- Frozen files UNTOUCHED (list in §9 R-6).
- Scoped `git add` — only `bctc-inspector.html`. NEVER `-A`.
- CPU-only, no new dependencies.
- main branch only.
- Eval panel fetch is fire-and-forget (non-blocking). Doc select event handler does NOT
  `await loadEvalPanel` — it calls it concurrently alongside renderOcr/renderTable.
- Off-HOSE only for any extraction (but this change requires NO re-extraction — only reads
  from `bctc_eval_results` which is already populated with 84 rows).
- REBUILD required after merging: `docker compose build --build-arg GIT_SHA=$(git rev-parse HEAD)
  mcp-server && docker compose up -d --no-deps --force-recreate mcp-server`.
  The HTML is served via `readFileSync` at request time (not a build artifact) — so a
  force-recreate picking up the new image is sufficient.

---

## §13 HANDOFF — DEV-MCP-SERVER

One task, one developer, one file.

**Dev work items (in order):**

1. Add CSS styles for `.eval-gate-panel`, `.eval-stages-row`, `.eval-stage-card`,
   `.eval-badge`, `.eval-stage-desc`, `.eval-gate-failures`, `.eval-overall-banner`
   inside the existing `<style>` block in `bctc-inspector.html`. Dark theme matching
   existing palette (#1a1a1a background, pill colors from existing `.pill-*` classes).

2. Add `<div id="eval-gate-panel" style="display:none">` HTML section between
   `.controls` and `.split` (exact placement specified in §4).

3. Add `async function loadEvalPanel(docId)` in the `<script type="module">` block:
   - Fetch `GET /api/bctc-eval/{docId}` (same-origin, port 3000).
   - On 200: render 6 stage cards per §4 DOM structure, §6 trust labels, §5 stage mapping.
   - On 409/404: show soft "chưa có dữ liệu kiểm định" banner, hide stage cards.
   - On network error: `console.warn`, hide panel, continue.
   - After render: `document.getElementById("eval-gate-panel").style.display = "block"`.

4. Add `loadEvalPanel(docId)` call (non-blocking, no `await`) in the
   `select.addEventListener("change", ...)` handler after `currentDocId = docId;`.

5. Add `resetEvalPanel()` function that hides `#eval-gate-panel` and clears
   `#eval-stages-row` innerHTML. Call it from the existing `resetPanes()` function
   (triggered on doc deselect — `select.value === ""`).

6. Gate failure rendering: for each item in `stage.gate_failures`, emit one `<li>` with:
   `• {gate_id}: {actual} (ngưỡng: {threshold})`.
   Cap at 3 items; append `"... và {n} lỗi khác"` if more.

7. Stage descriptions: hardcode the 6 Vietnamese `desc` strings from §5 into a
   `const STAGE_DESCS = { 1: "...", 2: "...", ... }` constant in the JS block.
   No DB query, no API call.

**Verification by QA (after rebuild):**
- Select FPT Q4-2025 (`e71f845d-ffa5-48f9-8f09-30ac2cd09c65`): 6 stage cards appear.
- Check `overall_status` badge matches `GET /api/bctc-eval/e71f845d...` JSON response.
- Deselect doc: panel hides. Reselect: panel reappears. No stale state.
- Force 409: query `DELETE FROM bctc_eval_results WHERE report_id = '{some_other_id}'`
  temporarily (on a non-sentinel report), reload page, select that report → soft banner shown,
  existing OCR/table panes still work. Revert.
- Check Vietnamese labels render correctly (UTF-8 diacritics, no mojibake).
- `git diff --name-only HEAD` after commit = `apps/mcp-server/src/interface/bctc-inspector.html` only.

---

## §14 SIGNAL — DEV-MCP-SERVER DASHBOARD

This brief is complete. Per architect flow step 6, signal dev-mcp-server via DASHBOARD.

**DASHBOARD entry:**
```
SPRINT: BCTC-EVAL-INSPECT-MERGE
TASK: fold eval gate strip into /api/bctc-inspect viewer
ZONE: apps/mcp-server/src/interface/
FILE: bctc-inspector.html (MODIFY only — ~140 lines additive)
BRIEF: docs/architecture-briefs/2026-05-28-bctc-eval-inspect-merge.md
BUILD-STANDARD: lean
NEXT: dev-mcp-server → implement → ops REBUILD mcp-server → qa AC-1..AC-8
PIPELINE: continue
```
