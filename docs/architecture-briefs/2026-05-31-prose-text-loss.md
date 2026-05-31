# Architecture Brief — PROSE-TEXT-LOSS

**Sprint:** PROSE-DEV-1
**Author:** architect
**Date:** 2026-05-31
**Triggered by:** Operator defect report — "pages without a table lose their text in the Văn bản OCR tab"
**Status:** DESIGN COMPLETE — NEXT: pm → dev-mcp-server

---

## 1. Symptom

In `/api/bctc-inspect`, the "Văn bản OCR" tab shows text only on pages that contain a
financial table. Prose pages (cover letter, signatures, risk-management notes, etc.) show
"No PEK unit for page N (non-table page)." — blank content.

Reported against ACB report `fea19bae-2b7a-4954-b3e0-e09d7bfc7390`
(20260422-ACB-BCTC-Hop-nhat-Quy-1-nam-2026.pdf, 33 pages).

---

## 2. Layer-by-Layer Evidence

### Layer A — Extraction (dev-pdf-extractor): CLEAN

Raw per-page OCR is stored in `pdf_extracted_text` for every page, including prose pages.

Probe: ACB report, pages 1–15:
```
page 1  → text_len=352,  confidence=0.8
page 2  → text_len=1083, confidence=0.8
page 3  → text_len=2099, confidence=0.8
...
page 13 → text_len=2327, confidence=0.8
```
All 27 pages have non-empty `text_content`. No extraction gap.

**Verdict: NOT ROOT CAUSE.**

---

### Layer B — Storage/Refine (dev-mcp-server, bctc_refined_units): CLEAN

The refine pipeline stores prose-typed windows in `bctc_refined_units` with non-empty
markdown content.

Probe: ACB `bctc_refined_units`:
```
unit-0000  page [1]   window_status=DONE  md_len=129  row_count=0
unit-0001  page [2]   window_status=DONE  md_len=372  row_count=0
unit-0007  page [9]   window_status=DONE  md_len=1765 row_count=0
unit-0026  page [33]  window_status=DONE  md_len=1040 row_count=0
```
Total 27 DONE units, all pages covered. Prose markdown contains the transcribed prose text
(e.g. unit-0026 has ACB credit risk section, Vietnamese prose, date/signature line).

**Verdict: NOT ROOT CAUSE.**

---

### Layer C — Display (dev-mcp-server, bctcInspectHandler.ts): ROOT CAUSE

`bctc_layout_units` has 22 units for ACB: **17 `page_type='table'`, 5 `page_type='prose'`**.
Prose units in `bctc_layout_units` have `stitched_markdown=""` (empty — PEK only
writes table markdown, not prose transcription).

The OCR endpoint (`handleBctcInspectOcr`, `GET /api/bctc-inspect/ocr/{doc_id}?page=N`) at
`apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` lines 498–509:

```typescript
const pekUnitRow = db
  .prepare<BctcLayoutUnitRow, [string, number]>(`
    SELECT unit_id, schema_page, page_numbers_json, stitched_markdown, quarantined
    FROM bctc_layout_units
    WHERE report_id = ?
      AND page_type = 'table'           ← THE BUG: prose pages excluded
      AND EXISTS (
        SELECT 1 FROM json_each(page_numbers_json) WHERE value = ?
      )
    LIMIT 1
  `)
  .get(docId, page) as BctcLayoutUnitRow | null;
```

When `hasPekUnits=true` (any PEK unit exists for the report), AND the page is a prose page:
1. The SQL returns `null` (prose page_type filtered out).
2. Code falls into the coverage-gap branch: `text_content: ""`, `pek_coverage_gap: true`.
3. Viewer renders: `"No PEK unit for page N (non-table page)."` — blank text.

The `pek_coverage_gap` branch (lines 537–556) **does not fall back to raw `pdf_extracted_text`**,
even though that table has valid OCR text for every page. Nor does it query `bctc_refined_units`,
which also has prose markdown.

**Verdict: ROOT CAUSE — display layer exclusively. Zone: dev-mcp-server.**

---

## 3. Scope Ruling

The question was posed: "is prose page text even in-scope for the refine pipeline?"

Ruling: The "Văn bản OCR" tab is named for raw OCR text, not for refined table content.
The operator expects to see the OCR text transcription of every page. The prose text IS in the DB
at two layers (`pdf_extracted_text` raw OCR + `bctc_refined_units` prose markdown).
The defect is solely that the viewer suppresses it when a PEK classification touches the report.

Fix scope: **viewer only** — the extraction and storage pipelines are correct as-is.

---

## 4. Fix Spec — PROSE-DEV-1

**Zone:** dev-mcp-server
**File:** `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts`
**DDD layer:** interface (no domain or application changes needed)

### 4.1 Exact Change

In `handleBctcInspectOcr`, after the `pekUnitRow` lookup returns `null` (line 509):

**Current behavior (lines 535–556):** when `pekUnitRow` is null, emit `pek_coverage_gap:true`
with `text_content: ""` and return.

**Required behavior:** before emitting the coverage-gap response, attempt a fallback to
`pdf_extracted_text` for the requested page. If raw OCR text exists, serve it with
`text_content: <raw_ocr_text>`, `has_pek: true`, `pek_coverage_gap: true`
(the gap flag stays true — it correctly indicates no PEK-refined content — but the
raw OCR text is surfaced so the operator can read the page).

#### Diff-level change in handleBctcInspectOcr:

Replace the coverage-gap block (after `pekUnitRow` is null, before `return`):

```typescript
// ── Coverage gap: PEK unit exists for report but not as 'table' for this page.
// Prose pages have a PEK unit with page_type='prose' but stitched_markdown=''.
// Fall back to pdf_extracted_text raw OCR for the page content.
// pek_coverage_gap:true stays — it signals "no refined PEK content here".
let proseFallbackText = "";
if (filename) {
  const rawRow = db
    .prepare<{ text_content: string }, [string, number]>(`
      SELECT text_content
      FROM pdf_extracted_text
      WHERE filename = ?
        AND page_number = ?
      LIMIT 1
    `)
    .get(filename, page) as { text_content: string } | null;
  proseFallbackText = rawRow?.text_content ?? "";
}

const response: OcrPageResponse = {
  doc_id: docId,
  filename,
  total_pages: filename
    ? (db.prepare(`SELECT COUNT(*) as cnt FROM pdf_extracted_text WHERE filename = ?`).get(filename) as { cnt: number } | null)?.cnt ?? 0
    : 0,
  page,
  text_content: proseFallbackText,   // ← was hardcoded ""
  confidence: proseFallbackText ? 0.8 : 0,
  has_more: false,
  has_pek: true,
  pek_coverage_gap: true,
  unit_id: null,
  page_numbers_json: null,
  quarantined: null,
  figures,
};
res.writeHead(200, { "Content-Type": "application/json" });
res.end(JSON.stringify(response));
return;
```

**Note on confidence value:** `pdf_extracted_text.confidence` can be read from the row instead
of hardcoding 0.8 — dev-mcp-server should include `confidence` in the SELECT and use it.
The 0.8 literal above is only illustrative; the real value comes from the DB row.

### 4.2 Viewer HTML — no change required

The viewer `bctc-inspector.html` lines 1402–1413 already handle the case:
```javascript
} else if (data.has_pek === true && data.pek_coverage_gap === true) {
  ocrTextContent.innerHTML = `<div class="missing-msg">No PEK unit for page ${page}...`;
```
This branch renders BEFORE the `text_content` check. The viewer must be updated to check
`text_content` even when `pek_coverage_gap=true`:

```javascript
// AFTER fix: coverage gap but raw OCR text available
if (data.has_pek === true && data.pek_coverage_gap === true) {
  // Show gap banner
  gapBanner.textContent = `PEK: no refined unit for page ${page} — showing raw OCR.`;
  gapBanner.style.display = "";
  // Show raw OCR text if present (prose fallback)
  if (data.text_content) {
    ocrTextContent.textContent = data.text_content;
  } else {
    ocrTextContent.innerHTML = `<div class="missing-msg">No OCR text for page ${page}.</div>`;
  }
}
```

**File:** `apps/mcp-server/src/interface/bctc-inspector.html`
**Location:** ~lines 1390–1413 (the `pek_coverage_gap` render block)

### 4.3 Files to Modify

| File | Change | Layer |
|---|---|---|
| `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` | Add `pdf_extracted_text` fallback in coverage-gap branch of `handleBctcInspectOcr` | interface |
| `apps/mcp-server/src/interface/bctc-inspector.html` | Render `text_content` when `pek_coverage_gap=true` (remove static "No PEK unit" message) | interface |

No domain, application, or infrastructure changes. No schema changes. No new tables.

### 4.4 Verification (DV test — RED before / GREEN after)

**Test file:** `apps/mcp-server/src/__tests__/PROSE-DEV-1-prose-text-display.test.ts`

Scenario: in-memory DB seeded with:
- 1 `financial_reports` row (report_id=`test-report-uuid`)
- 2 `bctc_layout_units` rows: one `page_type='table'` covering page 5, one `page_type='prose'` covering page 1
- 2 `pdf_extracted_text` rows: page 1 (`text_content="Prose page one content"`) and page 5 (`text_content="Table page content"`)

```typescript
// DV-1 (RED→GREEN): prose page returns raw OCR text
// GET /api/bctc-inspect/ocr/{test-report-uuid}?page=1
// BEFORE fix: response.text_content === ""  and  pek_coverage_gap === true
// AFTER fix:  response.text_content === "Prose page one content"
//             and pek_coverage_gap === true  (still true — PEK refined content absent)

// DV-2 (regression): table page still returns PEK stitched_markdown
// GET /api/bctc-inspect/ocr/{test-report-uuid}?page=5
// response.text_content === <table unit stitched_markdown>  (unchanged)

// DV-3 (regression): report with no PEK units still uses pdf_extracted_text fallback
// GET /api/bctc-inspect/ocr/{no-pek-report}?page=1
// response.has_pek === false  and  response.text_content === "raw ocr"
```

DV-1 must fail (empty string returned) before the fix. DV-1 must pass after. DV-2 and DV-3
must remain green throughout (regression guard).

**Manual verification (live):** open `/api/bctc-inspect`, select ACB Q1 2026, navigate to
page 1 (cover), page 2 (signature). "Văn bản OCR" tab must show Vietnamese text instead of
"No PEK unit for page N (non-table page)."

---

## 5. Fix Sequence

Single-zone single-layer defect — no sequencing needed.

1. `bctcInspectHandler.ts` — add fallback query (backend fix)
2. `bctc-inspector.html` — render `text_content` when `pek_coverage_gap=true` (frontend fix)

Both changes are in the same file-domain (interface layer, dev-mcp-server). They must ship
together — the HTML change is a no-op without the backend providing text, and the backend
change is invisible without the HTML rendering it.

---

## 6. Zone

**dev-mcp-server** exclusively.

No dev-pdf-extractor work. No schema migration. No refine pipeline change.

**BUILD-STANDARD: not-applicable** (bug-fix in existing interface handler, no new primitives).
