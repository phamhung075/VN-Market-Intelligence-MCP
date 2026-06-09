# BPE-SPIKE-1 — BCTC Prose / OCR Coverage Root-Cause Brief

**Task:** BPE-SPIKE-1
**Sprint:** BCTC-PROSE-EXTRACT (extended)
**Author:** architect
**Date:** 2026-06-10T00:00Z
**Status:** COMPLETE — gates BPE-DEV-3, BPE-OPS-1, BPE-DEV-4, BPE-QA-1

---

## 1. BLOCKER-2 VERDICT: OVERRULED

**Prior ruling (BA-spec L304, TASK_BPE-DEV-2 L134):** "Separate defect, char-count skip. Fix scope: NONE needed. FR-1/FR-2 bypass the legacy fallback."

**New evidence contradicting it (GAP-3):** dev-pdf-extractor + PO confirmed that pages 11-15 and 17-22 are ABSENT from `pdf_extracted_text` for FPT Q1-2026. The loop at `pdfOcrWorker.ts` L254 iterates `1..min(totalPages,80)`. Since `totalPages = 46` (from `pdfinfo`), range truncation is definitively excluded. The 11 pages that returned < 10 chars are NOT necessarily blank/image-only — the user screenshot proves page 12 carries dense visible Vietnamese prose. The prior ruling assumed those 11 pages were "blank separators, image-heavy pages, or auditor-signature pages." That assumption is contradicted by the user defect evidence.

**OVERRULE reasoning:**

The prior BLOCKER-2 determination was reached before the page-absence spread (pages 11-15 AND 17-22, not just 1 page) was known and before the user-screenshot evidence was confirmed. The "benign" characterization was based on: (a) 10-char guard is a known pattern, (b) FR-1/FR-2 would bypass the fallback. These two claims are still factually correct in isolation but the inference drawn ("no code change needed") is wrong for a different reason: GAP-1 (COUNT vs MAX) and the completeness threshold conspire to prevent re-OCR from ever running, locking the 35-page dataset in place even if the guard threshold is raised or a re-run is ordered.

**Bottom line:** BLOCKER-2 is OVERRULED. The 35-page dataset is NOT a self-correcting artifact. The gap is active, was never re-triggered after the initial OCR run, and pages 11-22 must be treated as genuine OCR-skip-under-investigation. Additional fixes in GAP-3 and GAP-1 are required.

---

## 2. GAP-1 — total_pages: COUNT vs MAX

### What the code does now

Two call sites in `bctcInspectHandler.ts` compute `total_pages`:

- **L537-539** (PEK path, stitched_markdown non-empty hit):
  ```
  SELECT COUNT(*) as cnt FROM pdf_extracted_text WHERE filename = ?
  ```
- **L584-585** (PEK path, coverage-gap fallback):
  ```
  SELECT COUNT(*) as cnt FROM pdf_extracted_text WHERE filename = ?
  ```
- **L627-630** (non-PEK legacy path): same COUNT pattern, used as `totalPages` for OFFSET pagination.

For FPT Q1-2026: COUNT = 35, MAX(page_number) = 46. These differ because 11 pages were never inserted (< 10 chars).

### Is COUNT→MAX the correct fix?

**YES for the PEK path (L537, L584).** In the PEK path, `total_pages` feeds the HTML inspector's `totalPages` JS variable (bctc-inspector.html L1368), which is then used to set `navBound` (L1432). However — the HTML inspector uses `navBound = pdfNumPages > 0 ? pdfNumPages : totalPages` (L1432). When pdf.js loads the PDF successfully, `pdfNumPages = 46` (from `pdf.numPages`). The navBound therefore becomes 46 regardless of what `total_pages` returns. The "page 12 of 46" label IS driven by pdf.js, not by `total_pages`.

**Conclusion:** In the PEK path, `total_pages` from the OCR endpoint does NOT govern the "N / 46" navigation display when pdf.js renders. The navigation count mismatch between PDF pane (46) and OCR store (35) is surfaced via the "sync note" banner at L1442-1448, not silently. Changing COUNT→MAX in the PEK path would make `total_pages` truthful (= 46), eliminating the misleading 35 value in the JSON response, but it does NOT affect the UI navigation bound when pdf.js is active.

**HOWEVER, the non-PEK legacy path (L650-659) uses OFFSET-based pagination:**
```sql
SELECT page_number, text_content, confidence
FROM pdf_extracted_text
WHERE filename = ?
ORDER BY page_number ASC
LIMIT 1 OFFSET ?
```
Here, `OFFSET = page - 1`. This means "page 12" in the non-PEK path returns the 12th ROW in ascending page_number order, which may NOT be physical page 12 if gaps exist. For FPT, the 12th row by ascending order is `page_number = N` where N is the 12th extant page number — potentially page 14 or 15, not 12.

**The COUNT→MAX change for the non-PEK path is more complex.** If we change `total_pages` to `MAX(page_number)` but keep OFFSET pagination, the UI believes the document has 46 pages but can only address 35 real rows — requesting page 36 onward returns empty. The correct fix for the non-PEK path is to change the query from OFFSET-based to `page_number = ?` (point lookup), matching the PEK path's behavior. This also resolves the page alignment problem.

### Ripple effects

| Scope | Impact |
|---|---|
| PEK path `total_pages` COUNT→MAX | Makes JSON truthful; UI nav bound unchanged when pdf.js active. Low risk. |
| Non-PEK path `total_pages` COUNT→MAX | Truthful count only if pagination also switches to `page_number = ?`. |
| Non-PEK path OFFSET→page_number lookup | Alignment fix; empty result for OCR-absent pages (correct). |
| Completeness guard in pdfOcrWorker.ts L209 | Guard uses `existing.c` (COUNT) vs `threshold = MAX(expectedPages * 0.5, 3)`. If COUNT=35 >= threshold=23, re-extract is skipped. MAX would not help here — the guard already reads pdfinfo for `expectedPages`. |
| No effect on extract-layout-first / pdf-extractor | total_pages is mcp-server only. |

### Exact prescribed change (BPE-DEV-3)

**File:** `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts`

Three sites:

1. L537-539 — PEK hit path: change `SELECT COUNT(*) as cnt` to `SELECT MAX(page_number) as cnt`.
2. L584-585 — PEK coverage-gap path: same change.
3. L627-630 + L650-659 — non-PEK legacy path: change `SELECT COUNT(*)` to `SELECT MAX(page_number)`; AND change the page-fetch query from OFFSET-based (`LIMIT 1 OFFSET ?`) to point-lookup (`WHERE filename = ? AND page_number = ?`). This removes the OFFSET misalignment bug.

**Zone:** `apps/mcp-server/` — dev-mcp-server owns.

---

## 3. GAP-3 — Why pages 11-22 are absent

### Confirmed mechanism (re-verified against source)

`pdfOcrWorker.ts` L254-286:
- Loop: `for (let page = 1; page <= maxPages; page++)` — confirmed NOT range-truncated for 46-page PDF.
- `maxPages = Math.min(46, 80) = 46`.
- Three skip paths: `pageError !== null` → skip; `pageText.length === 0` → skip; `pageText.length < 10` → skip (L270).
- Insert only happens at L282 for `pageText.length >= 10`.

For pages 11-15 and 17-22 (11 pages), Tesseract returned strings of length 0 or 1-9. This can happen for three distinct reasons:

**A. Image-raster pages (genuine no-text):** If the PDF pages 11-22 are embedded bitmaps (scanned), Tesseract with default DPI=200 and default PSM may produce low or zero output. This is plausible for some Vietnamese bank BCTC PDFs.

**B. DPI too low for dense text:** Vietnamese text is denser per pt than Latin. At DPI=200, small-font footnotes or footnote-heavy pages yield char counts near-zero even when the page visually has text. The user screenshot confirms page 12 has visible text — this strongly suggests scenario B or C.

**C. PSM mismatch:** `ocrOnePage` at L135-167 uses Tesseract with default PSM (likely PSM 3 — auto page segmentation). For pages with mixed layouts (text + tables + borders), PSM 3 can fail to segment correctly and return very short strings. The `pdfOcrWorker.ts` L179 comment references "Task 1290 / FR-1: Added optional dpi parameter for high-DPI retry on low-confidence extracts." but the high-DPI retry path is NOT invoked for the initial completeness-guard skip — it only runs if the first-pass confidence is low, but a page never inserted has no confidence record.

**D. Completeness guard locks in the 35-page dataset:** `pdfOcrWorker.ts` L199-213 checks `existing.c` (COUNT = 35) against `threshold = MAX(46 * 0.5, 3) = 23`. Since 35 >= 23, the guard at L210 returns early: "already extracted." This means even if someone triggers a re-OCR, the worker immediately exits. The 35-page snapshot is frozen. The only way to re-OCR is to manually delete the 35 rows (or trigger the incomplete-extraction branch by having `existing.c < threshold`).

### WHY THE PRIOR BLOCKER-2 WAS WRONG

The prior ruling said "11 pages returned < 10 chars (likely blank separators, image-heavy pages, or auditor-signature pages)." That characterization was speculative. The user screenshot of page 12 shows dense Vietnamese prose — not a blank separator, not an image-only page, not an auditor signature. The 10-char skip guard is wrongly dropping a text page. This is a DPI/PSM-undershooting problem, not correct behavior.

### Prescribed remedy (BPE-DEV-3 code + BPE-OPS-1 re-run)

**Code fix (dev-mcp-server, BPE-DEV-3):**
1. Remove the `pagesLowChar++` silent path at L270-278 OR raise the threshold from `< 10` to a documented minimum (e.g., `< 3`), with a `logger.warn` that logs page number, char count, and reason.
2. The more robust fix: instead of a char-count guard, use confidence threshold. Pages that produce a non-empty string should always be inserted. Pages that produce truly empty string (`length === 0`) should be skipped (genuine blank). The `< 10` guard was intended for junk chars from image noise — set it to `< 3` (single stray char is noise; 3+ chars represents genuine text attempt).
3. Add DPI escalation for the initial pass: if `pageText.length < 50` (low output), retry `ocrOnePage` with `dpi=300` before deciding. This is the logical extension of the existing high-DPI retry concept (Task 1290 comment).

**Data re-run (ops, BPE-OPS-1):**
1. Delete the 35 stale rows: `DELETE FROM pdf_extracted_text WHERE filename = '<FPT-Q1-2026-filename>'`.
2. Trigger `/extract` or the OCR worker endpoint for FPT Q1-2026 to reprocess from scratch with the fixed DPI/threshold code.
3. Verify: `SELECT page_number FROM pdf_extracted_text WHERE filename = '<FPT-Q1-2026-filename>' ORDER BY page_number` should include pages 11-22 (or show they are genuinely blank with a log entry explaining why).

**Sequencing requirement:** Code fix (BPE-DEV-3) MUST be deployed before BPE-OPS-1 re-run. Doing the re-run with the old code would re-create the same 35-row dataset.

**Zone:** GAP-3 code = `apps/mcp-server/` (pdfOcrWorker.ts is infra layer in mcp-server). GAP-3 data = ops.

---

## 4. GAP-2 — Stale prose unit (page 16)

### Evidence

- `bctc_layout_units` for FPT Q1-2026, page 16: `page_type='prose'`, `stitched_markdown=''`.
- `pdf_extracted_text` for page 16: 3053 chars present ("THUYẾT MINH BÁO CÁO TÀI CHÍNH HỢP NHẤT...").
- The stale unit was generated by a 2026-06-03 layout run that predates the OCR text insertion.

### Does a fresh /extract-layout-first re-flow self-heal GAP-2?

**YES, but only AFTER GAP-3 is resolved.** The re-flow sequence:

1. `/extract-layout-first` calls `ocr_unit()` (after BPE-DEV-1 prose fix), which reads stored OCR text from `pdf_extracted_text` for each prose page.
2. For page 16: OCR text is NOW present (3053 chars). The prose branch in `ocr_unit()` (as fixed by BPE-DEV-1) will populate `stitched_markdown` with that text.
3. The stale empty unit is overwritten on re-flow.
4. **BUT** — if the re-flow runs BEFORE BPE-OPS-1 (pages 11-22 still absent), pages 11-15 and 17-22 will still produce empty prose units. GAP-2 is resolved for page 16 only; the other 11 pages remain empty.

**Conclusion for GAP-2 → BPE-DEV-4:** No code change needed for the re-flow itself. BPE-DEV-4 = "trigger /extract-layout-first re-flow for FPT Q1-2026 AFTER BPE-OPS-1 completes." This is an ops step, not a dev task.

**Sequencing:**
```
BPE-DEV-3 (code fix) → deploy mcp-server rebuild → BPE-OPS-1 (delete rows + re-OCR) → BPE-DEV-4 (re-flow /extract-layout-first)
```

---

## 5. UI/DB PAGE OFF-BY-N — RESOLVED

### Question

The user reported "page 12 of 46" in the inspector. Is this the same physical page as the empty DB unit?

### Answer: YES — the "12" is the PDF-rendered page number, not a DB offset

**Evidence from inspector HTML:**

1. `pdfNumPages` is set from `pdf.numPages` (pdf.js) at L1232. For FPT Q1-2026 = 46.
2. `navBound = pdfNumPages > 0 ? pdfNumPages : totalPages` (L1432). With pdf.js active, `navBound = 46`.
3. The "page 12 / 46" indicator is `setNavState(12, 46)` (L1437), meaning: user navigated to PDF-rendered page 12 and the PDF has 46 pages total.
4. When the user navigates to page 12 via the PDF pane, `navigateToPage(12)` (L1325) is called, which calls `renderOcr(currentDocId, 12)` (L1334). The OCR endpoint receives `?page=12`.

**What happens in the OCR endpoint for page 12:**

- `hasPekUnits = true` (FPT has PEK units).
- Query: `bctc_layout_units WHERE report_id = ? AND page_type IN ('table','prose') AND EXISTS (SELECT 1 FROM json_each(page_numbers_json) WHERE value = 12)`.
- FPT page 12: this page is absent from `bctc_layout_units` (or classified as blank). No unit covers it.
- Falls through to PEK coverage-gap path (L558-599).
- Fallback: `SELECT text_content FROM pdf_extracted_text WHERE filename = ? AND page_number = 12` — but page 12 has NO row in `pdf_extracted_text` (it was one of the 11 skipped pages).
- `proseFallbackText = ""`, `pek_coverage_gap = true`, `text_content = ""`.
- Inspector displays: gap-banner ("PEK: no unit extracted for page 12") + "No OCR text for page 12 (non-table page)."

**This matches the user defect exactly.** There is NO off-by-N misalignment. The user's "page 12" IS DB page 12 (the `?page=12` request). The empty display is caused by:
- Page 12 was OCR-skipped (< 10 chars returned by Tesseract = GAP-3).
- Page 12 has no bctc_layout_unit (layout-first ran before OCR text existed for this page = GAP-2 variant).

**NOTE on BLOCKER-2's "page 16" hypothesis:** The prior BLOCKER-2 text noted that "the notes text the user pointed at as 'page 12' actually lives on DB page 16." This was speculative. The re-verification confirms: the user clicked on PDF page 12. The OCR endpoint was called with `page=12`. Page 12's content is absent from both `pdf_extracted_text` AND `bctc_layout_units`. The content that corresponds to what the user saw visually on the rendered PDF page 12 does in fact need to be in DB page 12.

---

## 6. PER-GAP OWNER SPLIT + DDD REVIEW

### GAP-1 — total_pages COUNT→MAX + OFFSET→point-lookup

| Item | Owner | Zone | DDD Layer |
|---|---|---|---|
| Change COUNT→MAX at L537, L584, L627 | dev-mcp-server | apps/mcp-server/ | Interface (route handler) |
| Change OFFSET pagination to page_number lookup at L650-659 | dev-mcp-server | apps/mcp-server/ | Interface (route handler) |

DDD risk: NONE. Both changes are in the interface layer (HTTP route handler). No domain logic touched. The change is a SQL query correction inside a route function — no new ports, no new adapters.

### GAP-3 code — skip guard and DPI escalation

| Item | Owner | Zone | DDD Layer |
|---|---|---|---|
| Raise/remove `< 10` char threshold in pdfOcrWorker.ts L270 | dev-mcp-server | apps/mcp-server/ | Infrastructure (fetcher/OCR worker) |
| Add DPI escalation retry for low-output pages | dev-mcp-server | apps/mcp-server/ | Infrastructure (fetcher/OCR worker) |
| Add observability log (page_number, char_count, reason) for skipped pages | dev-mcp-server | apps/mcp-server/ | Infrastructure (fetcher/OCR worker) |

DDD risk: LOW. `pdfOcrWorker.ts` is in `apps/mcp-server/src/infrastructure/fetchers/` — correct layer for I/O and external tool (Tesseract) interaction. No domain boundary crossed.

### GAP-3 data — re-OCR of FPT Q1-2026

| Item | Owner | Zone |
|---|---|---|
| Delete stale 35-row set + trigger re-OCR | ops (BPE-OPS-1) | apps/mcp-server/ (DB + worker trigger) |

Prerequisite: BPE-DEV-3 deployed + mcp-server rebuilt.

### GAP-2 — stale empty prose unit

| Item | Owner | Zone |
|---|---|---|
| Trigger /extract-layout-first re-flow for FPT Q1-2026 post-BPE-OPS-1 | ops/dev-mcp-server (BPE-DEV-4) | apps/mcp-server/ → apps/pdf-extractor/ |

No code change needed. This is a re-run step.

### Execution order

```
1. BPE-DEV-3: dev-mcp-server — total_pages MAX fix + OFFSET fix + skip-guard raise + DPI escalation
2. REBUILD mcp-server (ops)
3. BPE-OPS-1: ops — delete 35 stale rows, trigger re-OCR for FPT Q1-2026
4. BPE-DEV-4: ops/dev-mcp-server — trigger /extract-layout-first re-flow for FPT Q1-2026
5. BPE-QA-1: verify page 12 and all prose pages now serve non-empty text content
```

### What "fix page 12" actually means

1. BPE-DEV-3 (code): pdfOcrWorker no longer skips pages with 3-9 chars; DPI escalation produces output for page 12.
2. BPE-OPS-1 (data): re-OCR produces a row for page 12 in `pdf_extracted_text` with actual prose text.
3. BPE-DEV-4 (re-flow): /extract-layout-first produces a `bctc_layout_units` prose unit for page 12 with populated `stitched_markdown`.
4. Serving: `bctcInspectHandler` PEK path finds the prose unit, returns non-empty `text_content` for page 12. Inspector shows the text.

---

## 7. DDD ZONE SUMMARY

```
GAP-1:  apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts — INTERFACE layer
GAP-3 code: apps/mcp-server/src/infrastructure/fetchers/pdfOcrWorker.ts — INFRA layer
GAP-3 data: ops — no zone
GAP-2:  re-run only — no code zone
```

DDD invariant: domain-never-imports-infra holds. All changes are in interface or infra layers of mcp-server. No cross-service HTTP additions. No new domain service.

BUILD-STANDARD: not-applicable (bug-fix / maintenance, no new primitives, single zone).

---

## 8. OPEN RISK

**RISK-OCR-1 (medium):** DPI escalation retry adds 45s × N retried pages per re-OCR run. For a 46-page PDF with 11 low-output pages, this adds ~8 minutes to the OCR job. The 2-second yield between pages (L293) compounds this. Acceptable for a background async job; no user-facing blocking.

**RISK-OCR-2 (low):** Raising the skip threshold from `< 10` to `< 3` may insert very-low-quality rows (3-9 char junk) for genuinely-image-only pages. These rows will have `confidence=0.5` (since `pageText.length <= 50`). The coverage-gap fallback in the inspector will serve them as low-confidence text. Add `confidence < 0.1` guard in the inspector fallback to suppress truly junk content.

---

*Brief path:* `docs/architecture-briefs/2026-06-09-bctc-prose-ocr-coverage-rootcause.md`
