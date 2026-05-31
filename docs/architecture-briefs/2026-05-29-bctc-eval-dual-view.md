# Architecture Brief — BCTC-EVAL Dual-View Gate Strip

**Sprint:** BCTC-EVAL-INSPECT-MERGE Task #9 extension  
**Author:** Architect  
**Date:** 2026-05-29  
**Implementor:** dev-mcp-server  
**Zone:** `apps/mcp-server/`  
**BUILD-STANDARD:** lean (existing service, additive HTML + endpoint field extension)

---

## §1 Context

The 6-stage gate strip (`eval-strip-section` in `bctc-inspector.html`) renders a
plain-Vietnamese trust surface. User directive: add a second **Agent / Debug** mode
so agents (and the user debugging) can see raw gate internals — metrics, failures,
page-scoped evidence — without touching the user view or any frozen handler.

---

## §2 Brownfield Findings

### 2.1 Handler: `bctcEvalPageHandler.ts`

`getEvalForReport()` returns full `EvalRow[]` which includes all six fields:
`metrics_json`, `gate_failures_json`, `golden_diff_json`, `detector_version`,
`computed_at`. None of these raw fields reach the response; only `metrics_summary`
(a 3-field truncated string produced by `safeParseSummary()`) is emitted per stage.

`ocrAnnotation` (S3): `ocr_confidence`, `text_length_chars`, `has_ocr_row` are
emitted. `filename` (basename of `pdf_path`) is computed internally but NOT emitted.

`tableAnnotation` (S4): only `unit_id`, `page_numbers_json`, `is_multi_page_unit`,
`partial_fragment_warning`, `partial_label` are emitted. The DB query selects only
`unit_id, page_numbers_json` — it does NOT select `row_count`, `quarantined`,
`quarantine_reason` from `bctc_layout_units`.

### 2.2 HTML: `bctc-inspector.html`

- Eval section HTML: lines 578–583. Section-title + content div; no toggle control yet.
- `renderGateStrip(data, container)`: single rendering path at line 1257.
- `renderEvalStrip(docId, pageNum)`: fetches page endpoint; calls `renderGateStrip`.
- Existing toggle precedent: `zone-overlay-toggle` (line 550) — a `<label class="toggle-switch">` + CSS in the `.zone-toggle-wrap` block (line 383). Same CSS pattern reused here.
- `escHtml()` utility at line 1365: available in scope for safe JSON rendering.
- No `eval_view_mode` localStorage key exists yet.

### 2.3 Frozen surfaces (0-diff enforced)

`bctcEvalDetailHandler.ts`, `bctcInspectHandler.ts`, `bctcEvalStore.ts`,  
`GET /api/bctc-eval/{report_id}` (full-report endpoint). PEK subtree pristine.

---

## §3 Endpoint Contract Decision

**Additive extension required** to `bctcEvalPageHandler.ts` only.

All existing fields stay byte-identical. A `debug` sub-object is added to each
`gate_strip` element, populated unconditionally (the UI chooses which view to render).

### 3.1 Extended `gate_strip` element shape

```
{
  // ── Existing (unchanged) ────────────────────────────────────────────
  stage_no:        number,
  stage_name:      string,
  status:          "green" | "yellow" | "red",
  report_level:    boolean,
  label_suffix:    string | null,
  metrics_summary: string,            // still present (user view uses it)
  page_annotation: { ... } | absent,  // stages 3/4 only (unchanged shape)

  // ── NEW: debug sub-object ───────────────────────────────────────────
  debug: {
    metrics_json:       object,   // JSON.parse(row.metrics_json)
    gate_failures_json: unknown[], // JSON.parse(row.gate_failures_json)
    golden_diff_json:   object,   // JSON.parse(row.golden_diff_json)
    detector_version:   string,   // row.detector_version
    computed_at:        string,   // row.computed_at

    // Stage 3 only (OCR page-scope evidence):
    ocr_filename:       string | null,  // basename used for DB lookup

    // Stage 4 only (TABLE page-scope evidence):
    pek_row_count:      number | null,  // bctc_layout_units.row_count
    pek_quarantined:    boolean | null, // bctc_layout_units.quarantined != 0
    pek_quarantine_reason: string | null, // bctc_layout_units.quarantine_reason
  }
}
```

`debug.ocr_filename` is null when no `pdf_path` row found (same condition as current
`has_ocr_row: false` path). `pek_*` fields are null when no layout unit covers this page.

### 3.2 Handler changes required

**File:** `apps/mcp-server/src/interface/mcp/routes/bctcEvalPageHandler.ts`

1. **S3 query**: emit `basename` into `ocrAnnotation` as an internal field that
   gets mapped into `debug.ocr_filename`. No new DB query needed.

2. **S4 query**: extend the SELECT to also fetch `row_count`, `quarantined`,
   `quarantine_reason` from `bctc_layout_units`. The WHERE/JOIN clause is unchanged.
   The `LayoutUnitRow` interface gains these three fields.

3. **`gateStrip` map**: after computing `base`, construct `debug` object per stage
   using raw `row.*` fields (no `JSON.parse` failure possible — wrap in try/catch,
   fallback to `null`). Merge into returned object alongside `base`.

4. **`safeParseSummary`** function stays — user view still uses `metrics_summary`.

Risk: `JSON.parse` on malformed `metrics_json` in DB. Mitigation: wrap in try/catch,
emit `null` for the affected sub-field, never throw.

---

## §4 View Toggle UX

### 4.1 Toggle control placement

Inside the existing `eval-strip-section` section-title row — inline with the
`Kiểm tra chất lượng trích xuất` heading, right-aligned. HTML change at line 579:

```html
<div class="section-title eval-strip-title-row" style="margin-bottom:6px">
  Kiểm tra chất lượng trích xuất
  <span class="eval-view-toggle-wrap">
    <button class="eval-view-btn active" id="eval-view-user" aria-pressed="true">Người dùng</button>
    <button class="eval-view-btn" id="eval-view-agent" aria-pressed="false">Agent (debug)</button>
  </span>
</div>
```

Segmented button pair (not a checkbox toggle) — two buttons, one active at a time.
Clearer semantics than a toggle for a named mode switch; matches existing inspector
button style (dark-theme `button` elements already styled).

### 4.2 Persistence

`localStorage` key: `bctcEvalViewMode`. Values: `"user"` (default) or `"agent"`.
Read once on page load; written on button click. No page reload — purely JS state.

```js
// On init:
let evalViewMode = localStorage.getItem("bctcEvalViewMode") || "user";
// On click:
function setEvalViewMode(mode) {
  evalViewMode = mode;
  localStorage.setItem("bctcEvalViewMode", mode);
  // re-render last fetched data without re-fetching
  if (lastEvalData) renderGateStrip(lastEvalData, content);
}
```

`lastEvalData` is a module-level variable (scoped to the eval section closure) that
holds the last successful fetch result so mode switches are instant (no re-fetch).

### 4.3 CSS additions (additive to existing `#eval-strip-section` block)

```css
.eval-strip-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.eval-view-toggle-wrap { display: flex; gap: 4px; }
.eval-view-btn {
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 3px;
  border: 1px solid #444;
  background: #252525;
  color: #888;
  cursor: pointer;
}
.eval-view-btn.active {
  background: #2d3b2d;
  border-color: #72c870;
  color: #72c870;
}
/* Debug view additions */
.eval-debug-block {
  margin-top: 4px;
  margin-left: 18px;
  background: #151515;
  border: 1px solid #333;
  border-radius: 3px;
  overflow: hidden;
}
.eval-debug-summary {
  font-size: 10px;
  color: #999;
  padding: 3px 8px;
  cursor: pointer;
  user-select: none;
}
.eval-debug-summary:hover { color: #ccc; }
.eval-debug-pre {
  font-family: "SF Mono","Fira Code",monospace;
  font-size: 10px;
  color: #b0c8b0;
  padding: 6px 8px;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow-y: auto;
  border-top: 1px solid #2a2a2a;
}
.eval-debug-label {
  font-size: 9px;
  color: #555;
  text-transform: uppercase;
  padding: 2px 8px;
  border-top: 1px solid #2a2a2a;
}
```

---

## §5 Render Design

### 5.1 `renderGateStrip` branch

The function signature gains the active mode:

```js
function renderGateStrip(data, container, mode /* "user" | "agent" */) {
  // ... existing user-view html-building logic UNCHANGED ...
  // After the existing per-gate html block, when mode === "agent":
  if (mode === "agent") {
    html += renderDebugBlock(gate);
  }
}
```

The existing user-view code path (lines 1258–1306) is NOT modified — only a
conditional append at the end of the per-gate loop body.

### 5.2 `renderDebugBlock(gate)` — new private function

Returns an HTML string. Uses `<details>/<summary>` collapsed by default.

```
renderDebugBlock(gate):
  build a debug payload object:
    d = gate.debug (may be absent for backward compat with old responses)
    if (!d) return ""

  sections = []

  // Core metrics
  sections.push({ label: "metrics_json", json: d.metrics_json })
  sections.push({ label: "gate_failures_json", json: d.gate_failures_json })
  sections.push({ label: "golden_diff_json", json: d.golden_diff_json })

  // Meta
  metaLines = [
    "detector_version: " + (d.detector_version || "—"),
    "computed_at: " + (d.computed_at || "—"),
  ]
  if (gate.stage_no === 3 && d.ocr_filename != null)
    metaLines.push("ocr_filename: " + d.ocr_filename)
  if (gate.stage_no === 4) {
    metaLines.push("pek_row_count: " + (d.pek_row_count ?? "—"))
    metaLines.push("pek_quarantined: " + (d.pek_quarantined ?? "—"))
    if (d.pek_quarantine_reason)
      metaLines.push("pek_quarantine_reason: " + d.pek_quarantine_reason)
  }

  // Honesty: for report_level:true stages, label clearly
  reportTag = gate.report_level
    ? '<span class="eval-debug-label">⚑ toàn báo cáo — không phân tách theo trang</span>'
    : ""

  return `
    <div class="eval-debug-block">
      <details>
        <summary class="eval-debug-summary">▶ raw debug</summary>
        ${reportTag}
        <div class="eval-debug-label">meta</div>
        <pre class="eval-debug-pre">${escHtml(metaLines.join("\n"))}</pre>
        ${sections.map(s =>
          `<div class="eval-debug-label">${s.label}</div>
           <pre class="eval-debug-pre">${escHtml(JSON.stringify(s.json, null, 2))}</pre>`
        ).join("")}
      </details>
    </div>`
```

`<details>/<summary>` is collapsed by default — agent opens only the stages they
need to inspect. No accordion JS needed; native HTML5 behaviour.

### 5.3 Honesty preservation (anti-false-green)

- Stages 1, 2, 5, 6 (`report_level: true`): the `⚑ toàn báo cáo` label appears in
  the debug block header. The raw JSON shows the report-level metrics correctly.
  No page-scoped evidence is fabricated.
- Stages 3, 4 (`report_level: false`): genuine per-page evidence from DB is shown
  (`ocr_filename`, `ocr_confidence`, `text_length_chars` in user `page_annotation`;
  `pek_row_count`, `pek_quarantined`, `pek_quarantine_reason` in `debug`).
- If `gate.debug` is absent (old cached response before server restart), `renderDebugBlock`
  returns `""` — user view is unaffected, debug block is silently absent. No crash.

---

## §6 Work Items

| ID | File | Change type | Description |
|----|------|-------------|-------------|
| M-1 | `bctcEvalPageHandler.ts` | Additive | Extend `LayoutUnitRow` interface: add `row_count`, `quarantined`, `quarantine_reason` |
| M-2 | `bctcEvalPageHandler.ts` | Additive | Extend S4 SQL SELECT to fetch those 3 new fields |
| M-3 | `bctcEvalPageHandler.ts` | Additive | Emit `debug` sub-object per gate_strip element using raw `row.*` fields; emit `ocr_filename` (S3) and pek_* fields (S4) inside `debug` |
| M-4 | `bctc-inspector.html` | Additive CSS | Add `.eval-strip-title-row`, `.eval-view-toggle-wrap`, `.eval-view-btn`, `.eval-debug-block`, `.eval-debug-summary`, `.eval-debug-pre`, `.eval-debug-label` styles inside existing `<style>` block |
| M-5 | `bctc-inspector.html` | Additive HTML | Replace the `<div class="section-title">` line (line 579) with the segmented button pair markup |
| M-6 | `bctc-inspector.html` | Additive JS | Add `evalViewMode` + `lastEvalData` module vars; add `setEvalViewMode()` function; wire button click handlers; update `renderEvalStrip` to pass mode and cache `lastEvalData`; update `renderGateStrip` signature to accept mode; add `renderDebugBlock()` function; keep user-view render body byte-identical |
| M-7 | `bctcEvalPageHandler.test.ts` | Additive | Extend existing test: assert `debug.metrics_json` is parsed object; assert `debug.gate_failures_json` is array; assert stage 4 `debug.pek_row_count` matches fixture; assert stage 3 `debug.ocr_filename` matches fixture basename; assert all existing fields still present (non-regression) |

---

## §7 DDD Layers

| Item | Layer |
|------|-------|
| `bctcEvalPageHandler.ts` extension | Interface (query pass-through; no domain logic added) |
| `debug` sub-object construction | Interface (mapping raw DB strings to parsed objects — no domain invariant) |
| `renderDebugBlock()` | Interface / presentation (pure HTML string builder) |
| `evalViewMode` localStorage | Interface / UI state |

No domain or application layer changes. No new ports. No new infrastructure.

---

## §8 Risk Flags

**R-1 (LOW):** `JSON.parse` on a malformed `metrics_json` string in DB. Mitigation:
wrap each parse in try/catch; emit `null` for that field. Already anticipated in `safeParseSummary` — same pattern extended.

**R-2 (LOW):** Large `metrics_json` or `golden_diff_json` floods the debug `<pre>`.
Mitigation: `max-height: 300px; overflow-y: auto` on `.eval-debug-pre`. Scrollable.

**R-3 (INFO):** `<details>/<summary>` is collapsed by default. An agent scanning many
stages must open each one manually. Acceptable — agents typically target one red stage.
If later a "expand all" button is needed, that is a separate backlog item.

**R-4 (INFO):** `lastEvalData` caches stale response if user navigates away and
back. Acceptable — mode switch without navigation still uses correct last fetch.
Navigation triggers a new `renderEvalStrip` call which updates `lastEvalData`.

---

## §9 Frozen Surfaces (0-diff confirmed)

- `bctcEvalDetailHandler.ts` — no touch
- `bctcInspectHandler.ts` — no touch
- `bctcEvalStore.ts` — no touch (returns all fields; handler already gets them)
- `GET /api/bctc-eval/{report_id}` (bctcEvalDetailHandler) — no touch
- `bctcEvalRecomputeHandler.ts`, `bctcEvalPushStageHandler.ts`, `bctcEvalListHandler.ts` — no touch
- PEK subtree — pristine

---

## §10 Delivery Sequence

```
dev-mcp-server: M-1 → M-2 → M-3 (handler) | M-4 → M-5 → M-6 (HTML) | M-7 (test)
→ ops: REBUILD mcp-server (HTML is embedded in image; restart not sufficient)
→ qa: verify user view unchanged + agent view shows raw JSON + test M-7 green
```

ops_rebuild_required: yes (static HTML is bundled via `readFileSync` at startup).
