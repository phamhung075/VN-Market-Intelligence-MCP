# BA Spec — BCTC-PROSE-EXTRACT Sprint

**Task:** BPE-BA-1  
**Sprint:** BCTC-PROSE-EXTRACT  
**BA:** ba  
**Date:** 2026-06-09  
**Status:** SPEC COMPLETE — zero PO blockers. Recurring-bug-escalation flag active (7+ prior commits on producer module family). Architect SPIKE required before any dev implementation.  
**Handoff to:** architect

---

## Context (raw-read, not relayed)

### Bug description
BCTC PDF extractor silently drops prose / non-table pages. FPT Q1-2026 p.12 (Thuyết minh / notes to financial statements) yields `"No OCR text for page 12 (non-table page)"` despite the rendered page being full of analyzable text. Notes pages (thuyết minh) are among the most important for fundamental analysis — accounting policies, consolidation basis, estimates.

### Root cause path (confirmed, source-read)

1. `build_document_map()` in `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` classifies every page as `"table"`, `"prose"`, or `"blank"` via three signals: money-group token count, 3-digit account-code count, date-header token count.

2. `ocr_unit()` in the same file has the defect at lines 3686+:
   ```python
   if unit_page_type != "table":
       prose_lines: List[str] = []
       for page_num in sorted(pages_in_unit):
           page_zones = zones_by_page.get(page_num, {})
           # For prose, we don't need to do any OCR — stored text suffices
           # (the use case already has stored text; we emit an empty result ...)
       return {
           "unit_id": unit_id,
           "page_numbers": pages_in_unit,
           "stitched_markdown": "\n".join(prose_lines),  # prose_lines is ALWAYS empty
           "row_count": 0,
           "page_row_spans": [],
           "rows_for_gate": [],
       }
   ```
   `prose_lines` is declared and immediately looped without ever being appended to. The loop body reads `page_zones` but never reads any text. The return value always has `stitched_markdown: ""`.

3. The comment claims "stored text suffices" but the stored OCR text is never read in this code path. The `ocr_pages` list (fetched at Step 0 of `extract_layout_first_usecase.py`) is never passed into `ocr_unit()` — it is not part of the function signature.

4. `pushBctcLayoutHandler.ts` faithfully stores whatever `stitched_markdown` it receives. With `prose` units always emitting `""`, `bctc_layout_units.stitched_markdown` is always empty for prose pages.

5. `bctcInspectHandler.ts` `handleBctcInspectOcr()` has the PROSE-DEV-1 fallback at L548-588: when `page_type = 'table'` unit not found for the page, it falls back to `pdf_extracted_text`. But this fallback uses `pdf_extracted_text` which has the 46-vs-35 coverage gap — so the fallback may also return empty.

6. `bctc-inspector.html` L1402-1408 (PROSE-DEV-1 branch) renders `data.text_content` when `pek_coverage_gap === true`, but `text_content` arrives empty because (a) prose unit `stitched_markdown` is empty and (b) `pdf_extracted_text` coverage gap.

### Active uncommitted work (do not clobber)
Files with staged or unstaged changes related to table extraction:
- `apps/pdf-extractor/application/dtos.py` (M staged)
- `apps/pdf-extractor/application/extract_layout_first_usecase.py` (M staged)
- `apps/pdf-extractor/domain/primitives/layout_invariants/primitive.py` (M staged)
- `apps/pdf-extractor/domain/primitives/bctc_code_whitelist/` (untracked — new primitive)
- `apps/pdf-extractor/__tests__/unit/test_bctc_code_whitelist.py` (untracked — new test)
- `apps/pdf-extractor/__tests__/unit/test_bs_accounting_identities.py` (untracked — new test)

These are table-path changes. The prose path fix is non-overlapping at the function level (`ocr_unit` prose branch vs table branch, separate schema column), but shares the same DTOs and push handler. Architect must define the coordination boundary explicitly.

### Recurring-bug-escalation
7+ prior commits on `apps/pdf-extractor/` module family for related extraction bugs. Per `docs/policies/` and `CLAUDE.md` recurring-bug-escalation policy: **architect root-cause SPIKE is mandatory before any dev implementation.** Architect must analyse the full extraction module family to find the structural root (not just this symptom) before issuing the design brief to dev-pdf-extractor.

---

## Requirements

### FR-1 — Prose branch extracts and emits text body
**DDD layer:** infrastructure (ocr_unit function in generic_md_table_extractor.py)

When `unit_page_type != "table"`, `ocr_unit()` MUST extract and return the full plain text of every page in the prose unit.

Extraction source: the `ocr_pages` list (stored per-page OCR text, already fetched at Step 0 of `extract_layout_first_usecase.py`) is the primary text source. No new Tesseract call required for prose pages — the stored text already exists in `pdf_extracted_text`.

The `prose_lines` list MUST be populated from the stored OCR text for each page in the unit. The returned `stitched_markdown` MUST be the concatenated text body (plain text, not a pipe-table). `row_count` for prose units = count of non-empty text lines (not table rows).

Pre-condition: `ocr_unit()` must receive the stored OCR pages. Currently it does not — the function signature must be extended OR the stored text must be fetched inside `ocr_unit()`. Architect decides which (FR-1a and FR-1b options — see Architect Blockers section).

**Edge cases:**
- Prose unit with zero stored OCR text for any page: return `stitched_markdown: ""` and emit `_prose_no_text: true` flag in result for observability. Do not quarantine.
- Mixed prose-in-table units (`_ALLOW_PROSE_IN_TABLE_UNIT=True`): prose pages within a table unit use the existing table path. FR-1 only applies to units classified as `page_type="prose"` at the unit level.
- Vietnamese diacritics in stored OCR: no normalization. Pass raw text through to serving layer.

---

### FR-2 — Prose text unit flows through storage to serving
**DDD layer:** application (extract_layout_first_usecase.py push payload) + infrastructure (pushBctcLayoutHandler.ts storage) + interface (bctcInspectHandler.ts serving)

The prose text extracted by FR-1 must flow end-to-end:

**FR-2a — Producer push payload:** `extract_layout_first_usecase.py` Step 5 push to `/api/push-bctc-layout` already includes `units[]` with `stitched_markdown`. When FR-1 is fixed, prose units will naturally carry their text here. No structural change to the push payload needed — the existing `stitched_markdown` field is the carrier.

**FR-2b — Storage:** `pushBctcLayoutHandler.ts` already writes `stitched_markdown` to `bctc_layout_units.stitched_markdown` regardless of `page_type`. No schema change needed if prose text fits in the existing column. Architect must verify: does the existing `stitched_markdown TEXT NOT NULL DEFAULT ''` column handle multi-paragraph prose (potentially 2-3KB per page × N pages per unit) without truncation? SQLite TEXT is unbounded — this is almost certainly fine, but must be confirmed.

**FR-2c — Serving — OCR endpoint:** `bctcInspectHandler.ts` `handleBctcInspectOcr()` currently queries `bctc_layout_units` with `page_type = 'table'` filter (L512-518). This filter MUST be extended (or removed) to also match `page_type = 'prose'` units. Prose units should be served with `pek_coverage_gap: false` and `text_content` set to `stitched_markdown`. The gap banner should NOT appear for prose pages that have content.

**FR-2d — Serving — pek_coverage_gap semantics update:** `pek_coverage_gap: true` currently means "PEK ran but no unit covers this page." After this sprint it must mean "PEK ran but this page has no content of either type (table or prose)." A page with a prose unit that has text MUST return `has_pek: true, pek_coverage_gap: false`.

**Edge cases:**
- Page covered by a prose unit with `stitched_markdown: ""` (no stored OCR text, FR-1 edge case): serve `pek_coverage_gap: true` with the PROSE-DEV-1 fallback to `pdf_extracted_text`. Existing path unchanged.
- Report with mixed table+prose units: table pages use existing path; prose pages use new path. No cross-contamination.

---

### FR-3 — 46-vs-35 OCR coverage gap investigation
**DDD layer:** infrastructure (pdf_extracted_text table vs PDF page count)

The consumer (`bctcInspectHandler.ts` PROSE-DEV-1 fallback) falls back to `pdf_extracted_text` for prose pages, but gets empty text because `pdf_extracted_text` has only 35 pages while the PDF has 46 pages. This is the second layer of the silent-empty defect.

**FR-3a — Root cause investigation required (architect SPIKE):** Determine whether the 46-vs-35 gap is:
- Same root as prose drop: the OCR pipeline (`extract_tables_usecase.py` or `extract_md_tables_usecase.py`) also skips non-table pages when storing to `pdf_extracted_text`, OR
- Separate defect: the OCR pipeline covers all pages but the storage write is partial (e.g. a size guard, an error swallow, or a page-type filter in the legacy OCR path), OR
- Data quality: `pdf_extracted_text` was populated from an older extraction run that processed fewer pages for a different reason (psm drift, timeout, etc.)

**FR-3b — Investigation method:** Architect must specify a grep-auditable query sequence:
1. Which use case / infrastructure path writes to `pdf_extracted_text` (confirm: `apps/mcp-server/src/` server.ts or pdf-extractor OCR adapter?).
2. Whether any page-type filter or size guard exists on the write path.
3. Cross-reference with `bctc_eval_results` stage-1 metrics for the FPT Q1-2026 report to determine if the rasterized_count mismatch was flagged.

**FR-3c — Fix scope:** If same root as FR-1 fix (stored OCR text derived from layout extraction and prose pages were skipped at OCR store time too), the FR-1 fix may close the gap automatically. If separate defect, architect must scope a standalone fix.

**Constraint:** FR-3 investigation must NOT block FR-1/FR-2 implementation. FR-3 fix may be a separate sub-task.

**Edge cases:**
- Multiple reports with different gap sizes: the fix must be generic (not keyed to FPT Q1-2026).
- `pdf_extracted_text` already contains pages that `bctc_layout_units` covers: no deduplication needed; the two stores serve different consumers (legacy fallback vs PEK primary).

---

### FR-4 — AI analysis layer consumes prose text
**DDD layer:** interface (MCP tool layer — getBctcPageTextTool.ts and bctcFullTools.ts)

AI agents (bctc-analyst, chef) must be able to read notes-section (thuyết minh) content as part of BCTC analysis.

**FR-4a — getBctcPageTextTool:** Currently resolves `report_id → pdf_path → filename` and calls `GET /api/page-text` on pdf-extractor. After FR-2 is live, prose pages will be available via `handleBctcInspectOcr`. The tool should be extended (or a new tool added) to query `bctc_layout_units` directly for prose-unit text. Architect decides whether to: (a) extend `getBctcPageTextTool` to check `bctc_layout_units` first (matching the same seam logic as `bctcInspectHandler.ts`), or (b) add a new `get_bctc_prose_page` tool.

**FR-4b — bctcFullTools.ts:** The full-document BCTC analysis tool must be extended to include prose-unit content in the analysis context. Currently it reads structured table rows. After this sprint it must also include prose text sections, at minimum as a separate `prose_sections` array in the tool output. Architect must specify the output schema extension.

**FR-4c — No hallucination guard:** When prose text is empty or unavailable, the tool MUST return `prose_sections: []` or `prose_text: null` — never a fabricated value. Fail-loud: surface `has_prose: false` explicitly.

**Edge cases:**
- Prose pages with low OCR confidence (Tesseract accuracy on dense Vietnamese prose): the `confidence` field from `pdf_extracted_text` should be surfaced in the tool output so consumers can gate on low-quality text.
- Prose pages that are actually letterhead, cover pages, or auditor signature pages (low information density): tool caller's responsibility to filter by content; extractor does not semantically filter prose pages.

---

## Non-Functional Requirements

**NFR-1 — No regression on table path (CRITICAL)**  
The existing table extraction path (`ocr_unit` table branch), invariant gates (check_balance_identity, check_codes_monotonic, check_no_orphan_rows, check_bs_accounting_identities, check_code_whitelist), push handler, and inspector serve path must be unaffected. All existing tests must continue to pass. Active uncommitted table-extraction work (bctc_code_whitelist, layout_invariants) must be rebased cleanly on top of any producer changes.

**NFR-2 — No new Tesseract pass for prose pages**  
Prose-page text must come from stored OCR (`pdf_extracted_text` or the `ocr_pages` list already fetched at Step 0). AC-LFE-6 (one Tesseract pass per page per extraction run) must not be violated. Adding a new Tesseract pass for prose pages is explicitly out of scope.

**NFR-3 — Prose text does not enter invariant gates**  
The five invariant gates (Gates A+B+1+2+3 in Tier 3) are structured-data gates that expect `rows_for_gate` with `code/label/values` schema. Prose units MUST return `rows_for_gate: []` so the gates skip cleanly (all gates already have empty-input early exits). No prose text must be parsed as financial rows.

**NFR-4 — Architect SPIKE is mandatory before dev**  
Due to recurring-bug-escalation (7+ prior commits), architect must produce a root-cause analysis covering the full extraction module family before issuing the dev brief. Dev-pdf-extractor MUST NOT start until the SPIKE is complete. This is a hard sequencing constraint.

**NFR-5 — Schema migration is additive only**  
If any schema change to `bctc_layout_units` or `bctc_page_zones` is needed (e.g. adding a `prose_confidence` column), it must be additive (ALTER TABLE ADD COLUMN with DEFAULT) and must be preceded by a migration guard in `schema-financial-reports.ts` using the existing idempotent `CREATE TABLE IF NOT EXISTS` pattern.

**NFR-6 — Coordination with active uncommitted table-extraction work**  
dev-pdf-extractor must not merge prose changes until the active uncommitted work on `bctc_code_whitelist` / `layout_invariants` / `dtos` is committed first, OR architect explicitly defines a non-conflicting patch order. Architect SPIKE must address this coordination.

---

## DDD Layer Mapping Summary

| Requirement | Layer | File(s) |
|---|---|---|
| FR-1: prose_lines population in ocr_unit | infrastructure | `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` |
| FR-1: ocr_pages passed to ocr_unit (option A) | application | `apps/pdf-extractor/application/extract_layout_first_usecase.py` |
| FR-1: prose text fetch inside ocr_unit (option B) | infrastructure | `apps/pdf-extractor/infrastructure/ocr_text_fetch_client.py` or `ocr_text_source.py` |
| FR-2a: push payload (auto via FR-1 fix) | application | `apps/pdf-extractor/application/extract_layout_first_usecase.py` |
| FR-2b: storage (no schema change needed) | infrastructure | `apps/mcp-server/src/interface/mcp/routes/pushBctcLayoutHandler.ts` |
| FR-2c: serving OCR endpoint page_type filter fix | interface | `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` |
| FR-2d: pek_coverage_gap semantics | interface | `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` |
| FR-3: OCR gap root-cause investigation | infrastructure + spike | `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts`, OCR pipeline |
| FR-4a: AI tool prose access | interface | `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPageTextTool.ts` |
| FR-4b: full-doc analysis tool extension | interface | `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts` |

---

## Blockers (Architect Must Resolve — not PO questions)

**BLOCKER-1 (FR-1a vs FR-1b) — ocr_pages injection path:**  
Option A: extend `ocr_unit()` signature to accept `ocr_pages: List[Dict]` (the per-page stored text list). Caller (`extract_layout_first_usecase.py`) passes the list it already fetched in Step 0.  
Option B: have `ocr_unit()` fetch stored text directly from the infrastructure port, meaning it needs access to the `ocr_pages_client`. This violates the current clean function contract (ocr_unit is a pure callable injected at the composition root).  
**Recommendation (BA): Option A — additive parameter with default `None` for backward compatibility.** But architect must confirm no test fixture breakage and no circular dependency.

**BLOCKER-2 (FR-3) — 46-vs-35 gap root cause:**  
Architect must grep-audit the write path to `pdf_extracted_text`. Key files to check: `apps/mcp-server/src/interface/mcp/routes/` (OCR push endpoints), `apps/pdf-extractor/infrastructure/ocr_text_source.py`, `apps/pdf-extractor/infrastructure/ocr_adapter.py`. Determine if the legacy OCR path has a page-type filter or a size/page-count cap. Emit a written determination before FR-3c is scoped.

**BLOCKER-3 (NFR-6) — Coordination boundary for active uncommitted work:**  
Active unstaged/staged changes: `dtos.py`, `extract_layout_first_usecase.py` (both already modified), `layout_invariants/primitive.py`, `bctc_code_whitelist/` (new). Architect must define whether prose changes merge on top of the table changes OR in a parallel non-conflicting patch. Identify any line-level conflict risk in `extract_layout_first_usecase.py` (both table-gate changes and the proposed prose fix touch the same file). Emit a patch order ruling.

**BLOCKER-4 (FR-4a) — AI tool architecture:**  
Architect must rule on whether to extend `getBctcPageTextTool` or add a new `get_bctc_prose_page` tool. The BCTC-AGENTIC-REFINE sprint (archived in notebook) already established a tool proliferation concern (6 trigger tools, FR-5). A new tool adds to tool surface; extending existing risks regression on the table path. Architect decides.

**BLOCKER-5 (recurring-bug SPIKE scope) — Module family root cause:**  
The recurring-bug-escalation (7+ prior commits) requires architect to analyse the full extraction module family before dev starts. Architect must produce: (a) a structural root-cause statement explaining WHY prose pages have been silently dropped across multiple sprint cycles without being caught; (b) a proposed invariant or test that would have caught this regression; (c) a recommendation on whether a new unit test or integration test fixture is the right prevention mechanism.

---

## Edge Cases

**EC-1 — Blank page at prose unit boundary:**  
`ocr_unit()` prose branch currently iterates pages but does nothing. After FR-1 fix, a blank page (no stored OCR text) within a prose unit must be skipped gracefully, not emit a blank line that disrupts the concatenated text body.

**EC-2 — Very long prose units (10+ pages of notes):**  
Vietnamese BCTC thuyết minh sections can span 10-15 pages. The concatenated `stitched_markdown` may be 15-30KB. `bctc_layout_units.stitched_markdown` is `TEXT NOT NULL` with no declared length cap. SQLite TEXT supports up to 1GB. No truncation risk, but the AI analysis tool (FR-4b) must apply a context-window-aware pagination or summarisation strategy. Architect must spec the tool's handling of oversized prose sections.

**EC-3 — Prose page with only images/charts (zero stored OCR text):**  
Some thuyết minh pages contain only diagrams or signature boxes. Stored OCR text will be empty or near-empty. FR-1 must not quarantine these units. They return `stitched_markdown: ""` with `_prose_no_text: true` flag, serving layer returns `pek_coverage_gap: true`.

**EC-4 — _ALLOW_PROSE_IN_TABLE_UNIT interaction:**  
The `_ALLOW_PROSE_IN_TABLE_UNIT = True` flag allows prose-classified pages to remain in a table unit. These pages already flow through the table path and are NOT affected by FR-1 (which only targets units whose `page_type == "prose"` at the unit level). No interaction risk, but architect must confirm by reading the `build_document_map` unit-break logic.

**EC-5 — pek_coverage_gap true for non-prose, non-table pages (e.g. cover, auditor, blank):**  
`build_document_map` classifies pages as `table/prose/blank`. Blank pages produce blank units. After FR-2c, the OCR endpoint will have logic for all three `page_type` values. Blank units must still return `pek_coverage_gap: true` (no content expected). Architect must extend the serve-path logic to handle all three page types explicitly.

---

## Test Coverage Requirements (for QA brief)

**TC-1:** Unit test: `ocr_unit()` prose branch with mock `ocr_pages` containing text → `stitched_markdown` non-empty. Currently covered by a test that asserts empty output (needs inversion once FR-1 is fixed).

**TC-2:** Integration test: `handleBctcInspectOcr` with a prose-unit report → page covered by prose unit returns `has_pek: true`, `pek_coverage_gap: false`, non-empty `text_content`.

**TC-3:** Regression test: `handleBctcInspectOcr` with a table-unit report → existing behaviour unchanged. All 5 invariant gates pass for table units.

**TC-4:** FR-3 investigation coverage: a test that verifies `pdf_extracted_text` page count matches PDF page count for a given report (or documents a known acceptable gap with a logged reason).

**TC-5:** FR-4 tool test: `getBctcPageTextTool` returns non-empty text for a prose-type page in a PEK-extracted report.

---

## Architectural Flags (for Architect)

**FLAG-1 — `ocr_unit` function signature change:**  
Adding `ocr_pages` parameter is a function-signature change. The function is injected as a callable at the composition root (`main.py`). Any test that constructs a mock `ocr_unit_fn` must be updated. Architect must enumerate affected test fixtures.

**FLAG-2 — bctcInspectHandler prose serving query:**  
The current query at L512-518 filters `WHERE page_type = 'table'`. Removing or extending this filter changes the semantics of what a "PEK unit" is. The inspector currently treats `pek_coverage_gap: true` as "prose or no-content." After FR-2c, prose units with content return `pek_coverage_gap: false`. This changes the inspector's banner logic. Architect must confirm the bctc-inspector.html banner rendering at L1390-1409 is still correct.

**FLAG-3 — AI context window for long prose sections:**  
`bctcFullTools.ts` produces a full-document BCTC analysis. Adding prose sections increases the tool output size. For reports with 15-page thuyết minh, the total context could exceed tool output limits. Architect must spec a pagination or priority-selection strategy (e.g. return first N chars of prose per section, with a `prose_truncated: true` flag).

---

## [Architect] Brownfield Findings

**Task:** BPE-ARCH-1  
**Sprint:** BCTC-PROSE-EXTRACT  
**Date:** 2026-06-09  
**Architect:** architect  
**Recurring-bug-escalation:** active — SPIKE complete, root cause documented below.

---

### Zone

- **Primary zone:** `apps/pdf-extractor/` (producer — ocr_unit prose branch fix)
- **Secondary zone:** `apps/mcp-server/` (serving — bctcInspectHandler + AI tool layer)
- Multi-zone: PM must split into two per-zone subtasks (dev-pdf-extractor + dev-mcp-server).

---

### Verified Paths

**apps/pdf-extractor/**

- `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py:3638-3709` — `ocr_unit()` function. Prose branch at L3695-3709: `prose_lines` declared, loop iterates pages but body only reads `page_zones` (unused). `prose_lines` never appended. Returns `stitched_markdown: ""` always. **DEFECT CONFIRMED.**
- `apps/pdf-extractor/infrastructure/ocr_text_fetch_client.py:56-62` — `_MAX_FETCH_PAGES_LF = 200`. `fetch_ocr_pages()` returns `List[Dict]` where each dict is `{"page_number": int, "text": str}`. The `"text"` key carries OCR text already stripped.
- `apps/pdf-extractor/application/extract_layout_first_usecase.py:149-186` — Composition root wires `OcrTextFetchClient` as `ocr_pages_client`; `ocr_unit_fn` injected as `Callable`. Step 0 fetches `ocr_pages: List[Dict]` at L217-225. The list is available in the `execute()` scope at L420 where `self._ocr_unit()` is called, but `ocr_pages` is NOT passed — confirmed gap.
- `apps/pdf-extractor/application/extract_layout_first_usecase.py:880-882` — `_eval_push_stage3` reads `ocr_pages` via `page_rec.get("page_number") or page_rec.get("page_no")` and `page_rec.get("text_content") or page_rec.get("text")` — dual-key fallback already handled; use same pattern in ocr_unit.
- `apps/pdf-extractor/application/dtos.py:85-86` (active uncommitted) — `ExtractPDFResponse` already has `needs_vision_verify: bool = False` and `vision_verify_markers: List[VisionVerifyMarker]`. Field addition for prose is additive.

**apps/mcp-server/**

- `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts:511-522` — PEK seam query at L514-519 filters `AND page_type = 'table'`. Prose units with text are skipped. Falls to L549-588 fallback which queries `pdf_extracted_text`. **DEFECT CONFIRMED.**
- `apps/mcp-server/src/infrastructure/fetchers/pdfOcrWorker.ts:190-305` — `extractAndStorePdfPages()`. This is the ONLY production INSERT path for `pdf_extracted_text`. Critical findings:
  - L252: `const maxPages = Math.min(totalPages, 80)` — hard cap at 80 pages. FPT Q1-2026 has 46 pages, so the 80-cap does NOT explain the 46-vs-35 gap for this report.
  - L199-213: completeness guard uses `threshold = Math.max(expectedPages * 0.5, 3)`. If a prior partial run stored ≥23 pages for a 46-page PDF, the guard returns early with "already extracted."
  - L267-278: pages with `text.length < 10` increment `pagesLowChar` and are NOT inserted. Blank/near-blank pages silently skip insertion.
  - **ROOT CAUSE OF 46-vs-35 GAP:** The gap is a SEPARATE defect from the prose-drop. `pdfOcrWorker` runs on the mcp-server side (legacy OCR path), completely independent of the pdf-extractor container. The 35-page count means 11 pages returned < 10 chars from Tesseract (blank pages, image-only pages, or low-density pages). This is the `pagesLowChar` skip path. No page-type filter exists — it is a char-count guard, not a prose/table filter. The prose-drop bug (ocr_unit returning `""`) and the 46-vs-35 gap are INDEPENDENT defects with different root causes.
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPageTextTool.ts:1-162` — current tool delegates to `getPageText(filename, page_number)` on pdf-extractor `/api/page-text` endpoint. Does NOT query `bctc_layout_units`. After FR-2 ships, prose units will be in `bctc_layout_units` — this tool would miss them.
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts` — contains `BctcStructuredData` interface and full-report query. Does NOT currently query `bctc_layout_units` at all; operates on `financial_reports` scalar columns and `bctc_table_rows`. Prose sections require a new query JOIN or separate SELECT.

---

### BLOCKER RESOLUTIONS

**BLOCKER-1: ocr_unit() injection path — DECISION: Option A**

Extend `ocr_unit()` signature with an optional `ocr_pages: Optional[List[Dict]] = None` parameter. The caller in `extract_layout_first_usecase.py` L420 already has `ocr_pages` in scope and passes it. This keeps `ocr_unit` a pure injectable callable — no infrastructure port access inside it, no circular dependency.

Backward compatibility: `ocr_pages=None` leaves the prose branch returning `""` with `_prose_no_text: True` — existing tests that mock `ocr_unit_fn` without this arg still pass without change (default None). Tests that want to assert prose text must add the arg.

Option B rejected: having `ocr_unit` fetch stored text internally would require injecting `OcrPagesFetchClientPort` into what is currently a synchronous pure callable. That changes its DDD character (infrastructure port inside a Tier-2 compute function), and breaks the AC-LFE-6 composition root pattern.

Dict key lookup in prose branch: use `page_rec.get("text") or page_rec.get("text_content") or ""` — matches the dual-key fallback already present in `_eval_push_stage3` (L881-882).

**BLOCKER-2: 46-vs-35 gap root cause — DETERMINATION: Separate defect, char-count skip**

Root cause is `pdfOcrWorker.ts` L270-278: pages with OCR output < 10 chars are not inserted into `pdf_extracted_text`. For FPT Q1-2026, 11 pages returned < 10 chars (likely blank separators, image-heavy pages, or auditor-signature pages). This is NOT the same root as the prose-drop — it predates the PEK pipeline entirely. Fix scope: the legacy OCR path is the fallback for the PROSE-DEV-1 path ONLY when FR-1/FR-2 are NOT yet shipped. Once FR-1/FR-2 ship, prose pages that have stored OCR text will be served from `bctc_layout_units.stitched_markdown` directly — the pdf_extracted_text gap becomes irrelevant for those pages. For image-only/blank pages (genuine no-text), the 10-char guard is correct behavior. FR-3 fix scope: NONE needed for the 46-vs-35 gap as a blocking issue. The correct fix is FR-1/FR-2, which bypasses the legacy fallback for pages that have stored OCR text. Document the 10-char guard behavior explicitly and add a page-coverage observability log. No code change to `pdfOcrWorker.ts` required in this sprint.

**BLOCKER-3: Patch order ruling for active uncommitted table-extraction work**

Active staged/unstaged changes (confirmed via `git diff --stat HEAD`):
- `dtos.py` (+34L): adds `VisionVerifyMarker` dataclass and extends `ExtractPDFResponse` with `needs_vision_verify` + `vision_verify_markers` fields.
- `extract_layout_first_usecase.py` (+84L): adds Gate A (check_bs_accounting_identities) + Gate B (check_code_whitelist) into Step 4 loop; adds `vision_verify_markers` output.
- `layout_invariants/primitive.py` (+194L): new `check_bs_accounting_identities` function.
- `bctc_code_whitelist/` (untracked — new primitive): `check_code_whitelist` + whitelist constants.

**Ruling: SERIAL patch order — table changes FIRST, prose changes on top.**

Reason: `extract_layout_first_usecase.py` is the highest-conflict-risk file. The prose fix adds `ocr_pages` parameter to the `self._ocr_unit()` call at L420. The active table changes add Gates A+B into the Step 4 loop starting at L504. These are NON-OVERLAPPING line ranges (L420 = Tier 2 call, L504 = Tier 3 gate). However, merging them in the same working-tree state risks an accidental silent clobber if dev-pdf-extractor uses `git stash` incorrectly. The correct sequence:

1. dev-pdf-extractor commits the active table changes (dtos.py + extract_layout_first_usecase.py + layout_invariants + bctc_code_whitelist) as a single commit — the existing staged+unstaged set.
2. Then implements prose changes on top of that commit.

There is ZERO line-level conflict between the prose fix (modifying `ocr_unit()` at L3638-3709 and the call site at L420 in the use case) and the table changes (modifying the Step 4 gate loop at L504+). The only shared file is `extract_layout_first_usecase.py` — two different non-overlapping regions.

**BLOCKER-4: AI tool architecture — DECISION: Extend getBctcPageTextTool, do NOT add new tool**

Rationale: the BA spec confirms tool-proliferation concern (BCTC-AGENTIC-REFINE sprint already had 6 trigger tools). `getBctcPageTextTool` is the correct seam — it resolves `report_id → filename` and delegates to the pdf-extractor `/api/page-text` endpoint. The existing endpoint already calls `handleBctcInspectOcr` which will, after FR-2c, return prose text for prose pages. The tool therefore gets prose support FOR FREE once FR-2c ships — no code change needed in the tool itself for basic prose retrieval.

For FR-4b (full-document analysis): extend `bctcFullTools.ts` to include a `prose_sections` array. Do NOT create a separate full-prose tool. The query pattern: `SELECT unit_id, page_numbers_json, stitched_markdown FROM bctc_layout_units WHERE report_id = ? AND page_type = 'prose' AND quarantined = 0 ORDER BY json_extract(page_numbers_json, '$[0]')`. Cap: first 4000 chars per prose unit, `prose_truncated: true` flag when truncated. Return `prose_sections: []` when none found — never null, never fabricated.

**BLOCKER-5: Recurring-bug SPIKE — structural root cause statement**

Why prose pages have been silently dropped across 7+ sprint cycles undetected:

1. **No assert on prose path output.** Every test that exercises `ocr_unit()` with `page_type="prose"` asserts that `rows_for_gate` is empty and `stitched_markdown` is a string — but no test ever asserts `stitched_markdown != ""` for a prose unit with actual OCR content. The loop body was introduced as a stub with the comment "stored text suffices" — an aspirational comment that was never backed by an assertion. The test suite confirmed the stub behavior (empty output) without questioning it.

2. **The invariant gates (Gates 1-3) silently skip prose units.** Because `rows_for_gate: []` causes all three gates to return early with "skipped" status, prose units are never quarantined — they look identical to a successfully-processed unit with no financial rows. The "green" gate result masked the empty `stitched_markdown`. No gate checks for `stitched_markdown` content.

3. **The serving layer had a fallback.** `bctcInspectHandler.ts` L549-588 already had a PROSE-DEV-1 fallback to `pdf_extracted_text`. When the prose unit was empty, the system fell back silently. The fallback path itself was broken (46-vs-35 gap) but the comment at L549 acknowledged prose pages as a known gap: "Prose pages have a PEK unit with page_type='prose' but stitched_markdown=''." This was treated as a known limitation rather than a bug to fix. The fallback-with-comment pattern normalized the silent empty behavior across sprint boundaries.

4. **No end-to-end coverage test for prose content.** Integration tests cover table extraction round-trips (push → serve → assert table content). No integration test covers a prose-classified page round-trip (push prose unit with text → serve → assert non-empty `text_content`). The gap was invisible to CI.

**Proposed prevention mechanism (TC-1 inversion):** The existing `test_unit_grouper.py` confirms that prose units are emitted (not discarded) by `build_document_map`. The missing test is: given a `prose` unit and `ocr_pages` with non-empty text for those pages, `ocr_unit()` returns `stitched_markdown` that is non-empty. This is a pure unit test — no PDF required. Invert the existing implicit assertion. Add to `apps/pdf-extractor/__tests__/unit/test_generic_extractor_prose.py` (new file).

---

### Design Decisions — DDD Layer Assignments

| Change | DDD Layer | File | Type |
|---|---|---|---|
| `ocr_unit()` signature + prose_lines populate | infrastructure | `generic_md_table_extractor.py:3638-3709` | modify |
| Caller passes `ocr_pages` to `ocr_unit()` | application | `extract_layout_first_usecase.py:420-425` | modify (3 lines) |
| `bctcInspectHandler` query extend to prose | interface | `bctcInspectHandler.ts:511-522` | modify |
| `pek_coverage_gap` semantics update | interface | `bctcInspectHandler.ts:548-588` | modify |
| `bctcFullTools.ts` prose_sections query | interface | `bctcFullTools.ts` | modify |
| `getBctcPageTextTool` — no change needed | interface | `getBctcPageTextTool.ts` | no-op (FR-2c auto) |
| New unit test: ocr_unit prose non-empty assert | test | `__tests__/unit/test_generic_extractor_prose.py` | create |
| New integration test: prose round-trip | test | mcp-server `__tests__/` | create |

---

### Schema Verification

`bctc_layout_units.stitched_markdown TEXT NOT NULL DEFAULT ''` — SQLite TEXT supports up to 1GB. A 15-page thuyết minh section of 2-3KB/page = ~30-45KB max. No truncation risk. No schema migration needed for prose text storage. Confirmed: no `ALTER TABLE` required.

---

### Risk Flags

**RISK-1 (medium): `ocr_pages` key inconsistency.** `fetch_ocr_pages()` returns dicts with key `"text"` (L207 in ocr_text_fetch_client.py). But `_eval_push_stage3` uses dual-key fallback `page_rec.get("text_content") or page_rec.get("text")`. Dev must use the same dual-key pattern in the prose branch to be safe against any future key rename.

**RISK-2 (low): `_ALLOW_PROSE_IN_TABLE_UNIT=True` interaction.** When a prose-classified page is absorbed into a table unit (L2712-2731 of `build_document_map`), the unit's `page_type` is coerced to `"table"` at L2731. The prose branch in `ocr_unit()` will NOT fire for these pages — they go through the table OCR path. This is correct behavior. EC-4 confirmed: no interaction risk.

**RISK-3 (low): blank/image-only prose pages.** `ocr_pages` will contain `{"page_number": N, "text": ""}` for blank pages (the fetch client marks them blank at L273-274). The prose branch must skip empty strings gracefully and emit `_prose_no_text: True` in the result when ALL pages in the unit have empty text. This prevents a blank `stitched_markdown` result from masquerading as successful extraction.

**RISK-4 (medium): bctcInspectHandler query change semantics.** Removing `AND page_type = 'table'` from the PEK seam query means ANY unit covering the page is returned. For a mixed-unit report, a blank unit (page_type='blank') would also match. Recommended fix: change the filter to `AND page_type IN ('table', 'prose')` rather than removing it entirely. This excludes blank units from the seam path while serving both table and prose content. Blank pages continue to fall through to the PROSE-DEV-1 path (pdf_extracted_text lookup) — which correctly returns empty/pek_coverage_gap.

**RISK-5 (medium): test fixture breakage for ocr_unit_fn mock.** `ocr_unit` is injected as a Callable at the composition root. Tests that construct a mock `ocr_unit_fn` via `MagicMock()` will not break — Python ignores unexpected kwargs when called via positional args IF the mock does not validate the signature. However, tests that explicitly assert the call signature (e.g. `mock_ocr_unit.assert_called_with(unit=..., zones_by_page=..., pdf_path=..., tmp_dir=...)`) will fail when `ocr_pages=[...]` is added to the call. Dev must grep for `assert_called_with.*ocr_unit` or `assert_called_with.*tmp_dir` in test files and update those assertions.

Affected test files to audit: `apps/pdf-extractor/__tests__/test_pek_engine_adapter.py` (confirmed references `ocr_unit` and `stitched_markdown`), `apps/pdf-extractor/__tests__/unit/test_document_map.py`. Check for `assert_called_with` in those files before patching.

**RISK-6 (low): AI tool context-window overflow.** `bctcFullTools.ts` prose_sections must apply a 4000-char cap per unit with `prose_truncated: true` flag. Without this cap, a 30-page thuyết minh (15-page × 2KB) = 30KB added to tool output, potentially hitting MCP tool output limits. Priority selection: sort by `json_extract(page_numbers_json, '$[0]')` ascending — earlier pages first (accounting policies tend to appear before detailed notes).

---

### BUILD-STANDARD

**Classification: lean** — apps/pdf-extractor/ and apps/mcp-server/ both exist. Bug-fix + targeted feature extension. No new microservice.

- BUILD-STANDARD: lean
- BUILD-STANDARD-REF: docs/standards/microservice-build-standard.md
- NOTE: dev-pdf-extractor drives the producer fix; dev-mcp-server drives the serving + AI-tool fix. PM must split into two subtasks.

---

### Test Strategy

| Test | Type | File | What to assert |
|---|---|---|---|
| TC-1 | unit | `apps/pdf-extractor/__tests__/unit/test_generic_extractor_prose.py` (new) | `ocr_unit(unit=prose_unit, zones_by_page={}, pdf_path="", tmp_dir="", ocr_pages=[{"page_number": 12, "text": "Chính sách kế toán..."}])` → `stitched_markdown != ""` |
| TC-1b | unit | same file | `ocr_unit(... ocr_pages=[{"page_number": 12, "text": ""}])` → `stitched_markdown == ""`, `_prose_no_text == True` |
| TC-2 | integration | `apps/mcp-server/src/__tests__/PROSE-UNIT-SERVE.test.ts` (new) | Insert prose unit with stitched_markdown='Chính sách...'; `handleBctcInspectOcr(report_id, page=12)` → `has_pek: true`, `pek_coverage_gap: false`, `text_content` non-empty |
| TC-3 | regression | existing mcp-server table-path tests | All existing table-unit tests pass unchanged |
| TC-4 | unit | existing + new | `pdfOcrWorker` low-char-skip documented; no new assertion needed (behavior correct) |
| TC-5 | integration | `apps/mcp-server/src/__tests__/` | `getBctcPageTextTool` for a prose page returns non-empty text after FR-2c |

---

### Scan Clean

No DDD violations detected in the proposed design. All changes respect existing layer boundaries. No new infrastructure ports created in application layer. No new Tesseract calls added. Prose text flows through the existing `stitched_markdown` column without schema change.

**Scan clean: true**
