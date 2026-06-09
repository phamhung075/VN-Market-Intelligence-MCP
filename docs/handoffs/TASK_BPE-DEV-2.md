# TASK_BPE-DEV-2 — BCTC Prose Extract (Consumer/Serving)

**Sprint:** BCTC-PROSE-EXTRACT  
**Task:** BPE-DEV-2  
**Owner:** dev-mcp-server  
**Type:** Feature/Serving Layer  
**Size:** M (4-6h)  
**Estimate:** 3h implementation + 1.5h testing  
**WIP Slot:** 2 of 2 (can start in parallel with BPE-DEV-1 or after, per dependency)  
**Status:** READY (architecture SPIKE complete, blockers resolved)  
**Date Created:** 2026-06-09  
**Depends On:** BPE-DEV-1 (producer prose fix must be live before testing full round-trip, but serving code changes are parallel)  

---

## Objective

Extend the serving layer (MCP routes + AI tools) to consume and surface prose text extracted by the producer (TASK_BPE-DEV-1). Two consumer paths:
1. **bctcInspectHandler.ts** — OCR inspection endpoint: serve prose unit text alongside table units
2. **bctcFullTools.ts** — Full-document analysis: expose prose sections to AI agents

**Root Cause (Serving Gap):** `bctcInspectHandler.ts` L514-519 filters `WHERE page_type = 'table'` only, excluding prose units from the PEK seam. Prose content never reaches serving layer.

---

## Acceptance Criteria

### AC-1: bctcInspectHandler Query Extended to Prose Units

- **File:** `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` L511-522
- **Current:** `AND page_type = 'table'` (line 514-519)
- **Change:** Extend filter to `AND page_type IN ('table', 'prose')` (per RISK-4 ruling to exclude blank units)
- **Behavior:**
  - Query now returns prose units covering the page in addition to table units
  - Prose units with `stitched_markdown: ""` (no stored OCR text) fall through to fallback path
  - Prose units with non-empty `stitched_markdown` are served as-is (no formatting applied)

**Edge Case:** Blank units (page_type='blank') remain excluded; those pages fall through to PROSE-DEV-1 fallback path (pdf_extracted_text query).

### AC-2: pek_coverage_gap Semantics Updated

- **File:** `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` L548-588 (PROSE-DEV-1 fallback path)
- **Current Semantics:** `pek_coverage_gap: true` = "PEK ran but no table unit covers this page"
- **New Semantics:** `pek_coverage_gap: true` = "PEK ran but this page has no content of either type (table or prose)"
- **Implementation:** After AC-1 query extends to prose, update the gap-detection logic:
  - A page with a prose unit that has text → return `has_pek: true, pek_coverage_gap: false, text_content: stitched_markdown`
  - A page with a prose unit that has NO text (EC-1) → return `has_pek: true, pek_coverage_gap: true` (fall through to fallback)
  - A page with no unit at all → return `has_pek: false, pek_coverage_gap: true` (already correct, unchanged)

**Edge Case:** Page with mixed table+prose units — table path takes precedence (first match in sort order).

### AC-3: bctcFullTools Prose Sections Query

- **File:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts`
- **Current:** Queries table rows via `bctc_table_rows` join; does NOT query `bctc_layout_units`
- **Change:** Add `prose_sections` array to `BctcStructuredData` interface
- **Query Logic:**
  ```sql
  SELECT unit_id, page_numbers_json, stitched_markdown 
  FROM bctc_layout_units 
  WHERE report_id = ? AND page_type = 'prose' AND quarantined = 0 
  AND stitched_markdown IS NOT NULL AND stitched_markdown != ''
  ORDER BY json_extract(page_numbers_json, '$[0]') ASC
  ```
- **Output Schema:** Add to `BctcStructuredData`:
  ```typescript
  prose_sections?: Array<{
    unit_id: string;
    page_numbers: number[];
    text_content: string;      // First 4000 chars of stitched_markdown
    prose_truncated: boolean;  // true if stitched_markdown > 4000
  }>;
  ```
- **Behavior:**
  - Return `prose_sections: []` when no prose units found (never null, never fabricated)
  - Cap each unit at 4000 chars (context-window safety, per EC-2)
  - Set `prose_truncated: true` when truncated
  - Order by first page number ascending (accounting policies first)

### AC-4: No Regression on Table Serving Path

- **File:** All bctcInspectHandler + bctcFullTools existing tests
- **Requirement:** Table units served unchanged
- **Verification:** All existing table-path integration tests pass (TC-3)

### AC-5: New Integration Tests

- **File:** `apps/mcp-server/src/__tests__/PROSE-UNIT-SERVE.test.ts` (new)
- **TC-2:** Full round-trip test:
  - Insert prose unit with `stitched_markdown='Chính sách kế toán...'`
  - Call `handleBctcInspectOcr(report_id, page=N)`
  - Assert: `has_pek: true`, `pek_coverage_gap: false`, `text_content` non-empty
- **TC-2b:** Prose unit with empty text (fallback test):
  - Insert prose unit with `stitched_markdown: ""`
  - Call `handleBctcInspectOcr(report_id, page=N)`
  - Assert: `pek_coverage_gap: true`, falls through to fallback

- **File:** `bctcFullTools` test (existing or new)
- **TC-5:** Full-document tool test:
  - Insert report with both table and prose units
  - Call `bctcFullTools` (or equivalent get_bctc_full internal call)
  - Assert: `prose_sections` array contains non-empty text for prose pages
  - Assert: `prose_truncated: true` when > 4000 chars

---

## Files to Modify

**Production:**
- `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts`
  - L514-519: Change filter from `page_type = 'table'` to `page_type IN ('table', 'prose')`
  - L548-588: Update gap-detection logic to reflect new semantics

- `apps/mcp-server/src/interface/mcp/routes/bctcFullTools.ts` (or bctcFullTools.ts in tools directory)
  - Add `prose_sections` array to `BctcStructuredData` interface
  - Add query logic to fetch prose units
  - Apply 4000-char cap + `prose_truncated` flag
  - Return `prose_sections: []` when none found

**Test:**
- `apps/mcp-server/src/__tests__/PROSE-UNIT-SERVE.test.ts` (new file)
  - Integration tests for prose serving: TC-2, TC-2b
  - Verify round-trip from bctc_layout_units to inspector response

- Existing table-path tests (no modification needed, but run to verify regression)

**No Changes (auto-support):**
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPageTextTool.ts` — already supports prose (delegates to handleBctcInspectOcr which now returns prose text)

---

## Architect's Key Decisions

**BLOCKER-2 Resolution — 46-vs-35 Gap is Separate Defect:**  
Root cause is `pdfOcrWorker.ts` L270-278 (10-char skip guard for low-OCR-output pages). This is independent of the prose-drop bug. FR-1/FR-2 fix bypasses the legacy fallback entirely for pages with stored OCR text. Once FR-1/FR-2 ship, pages with prose content are served from `bctc_layout_units.stitched_markdown` directly — the pdf_extracted_text gap becomes irrelevant. **Fix scope: NONE needed for 46-vs-35 gap as a blocking issue.** Document the 10-char guard behavior and mark resolved-no-action.

**BLOCKER-4 Resolution — Extend getBctcPageTextTool, Do NOT Add New Tool:**  
The tool resolves `report_id → filename` and delegates to `GET /api/page-text` on pdf-extractor (which calls `handleBctcInspectOcr`). Once AC-1/AC-2 ship, the endpoint returns prose text for prose pages. The tool gets prose support FOR FREE — no code change needed in the tool itself.

**BLOCKER-4b — bctcFullTools Extension:**  
Extend existing `bctcFullTools.ts` to include `prose_sections` array with 4000-char cap per unit. Do NOT create a separate full-prose tool (avoids tool proliferation).

---

## Risk Flags & Mitigations

**RISK-4 (medium): bctcInspectHandler query change semantics**  
Mitigation: Change filter to `AND page_type IN ('table', 'prose')` rather than removing it entirely. This excludes blank units from the seam path (they correctly fall through to fallback). Ensures blank pages still return `pek_coverage_gap: true`.

**RISK-6 (low): AI tool context-window overflow**  
Mitigation: Cap each prose unit at 4000 chars with `prose_truncated: true` flag. Sort by first page number ascending (accounting policies first). Future AI consumers can prioritize by page order and check `prose_truncated` flag.

---

## Edge Cases Handled

**EC-1: Prose unit with empty text (fallback path)**  
If a prose unit has `stitched_markdown: ""` (no stored OCR text, marked `_prose_no_text: True` by producer), the serving layer:
- Detects empty stitched_markdown
- Returns `pek_coverage_gap: true` (triggers PROSE-DEV-1 fallback to pdf_extracted_text)
- No content served directly, but fallback has a chance to provide legacy OCR text

**EC-2: Very long prose units (10+ pages)**  
A 15-page thuyết minh = ~30-45KB. Cap at 4000 chars per unit in `bctcFullTools` output. Longer sections return `prose_truncated: true` so AI consumers know content is available but truncated for context-window safety.

**EC-5: Blank units (page_type='blank')**  
Query filter `page_type IN ('table', 'prose')` excludes blank units. Pages covered by blank units fall through to PROSE-DEV-1 fallback (pdf_extracted_text lookup), which correctly returns empty or gap. No change to blank-page handling.

---

## Test Coverage

**TC-2: Integration test — prose unit serving (round-trip)**  
File: `apps/mcp-server/src/__tests__/PROSE-UNIT-SERVE.test.ts`  
Steps:
1. Insert financial report + prose layout unit with `stitched_markdown='Chính sách kế toán...'`
2. Call `handleBctcInspectOcr(report_id, page=N)`
3. Assert: response includes prose unit coverage, `has_pek: true`, `pek_coverage_gap: false`
4. Assert: `text_content` non-empty and matches stitched_markdown

**TC-2b: Prose unit with empty text (fallback triggered)**  
Steps:
1. Insert prose unit with `stitched_markdown: ""` (`_prose_no_text: True` from producer)
2. Call `handleBctcInspectOcr(report_id, page=N)`
3. Assert: `pek_coverage_gap: true`, falls through to fallback
4. Fallback returns whatever pdf_extracted_text has (empty or legacy text)

**TC-3: Regression test — table path unchanged**  
Run existing table-unit serving tests: confirm all pass (no new failures on table branch)

**TC-5: Integration test — bctcFullTools prose sections**  
Steps:
1. Insert report with table units + prose units
2. Call `bctcFullTools(report_id)` or equivalent
3. Assert: `prose_sections` array present with non-empty text for prose pages
4. Assert: `prose_truncated: true` for units > 4000 chars
5. Assert: Sort order by page number ascending

---

## Handoff Sequence

1. **Wait for BPE-DEV-1 producer fix to land** (can start serving code changes in parallel, but integration tests depend on producer)
2. **Implement bctcInspectHandler query extension** (L514-519: page_type filter)
3. **Update gap-detection logic** (L548-588: reflect new semantics)
4. **Implement bctcFullTools prose_sections query** (add interface field, SQL query, 4000-char cap)
5. **Create integration tests** (TC-2, TC-2b, TC-5)
6. **Run full integration test suite** for bctcInspectHandler + tools — zero new failures
7. **Commit serving changes**
8. **After BPE-DEV-1 lands, run round-trip integration tests** (TC-2, TC-2b, TC-5 full verification)
9. **Mark TASK_BPE-DEV-2 DONE**

---

## Dependency & Coordination

- **Producer (BPE-DEV-1):** Must land before round-trip integration tests pass (AC-5 tests require non-empty `stitched_markdown` in bctc_layout_units)
- **Serving code (this task):** Can be implemented in parallel (does not depend on BPE-DEV-1 code, only on the schema/data state)
- **getBctcPageTextTool:** No change needed; auto-supported once serving layer ships

---

## DDD Layer & Architecture

**Layer:** Interface (MCP routes + AI tool layer) — pure serving/query logic  
**Related:** docs/architecture-briefs/2026-06-09-spike-ci-c5-contam-safe-restrategy.md § [Architect] Brownfield Findings  
**Build Standard:** Lean (targeted feature extension, no new microservice)  
**Handoff from:** dev-pdf-extractor (TASK_BPE-DEV-1, producer)

---

## Definition of Done

- [ ] bctcInspectHandler query extended to `page_type IN ('table', 'prose')`
- [ ] Gap-detection logic updated for new semantics
- [ ] bctcFullTools prose_sections query implemented
- [ ] 4000-char cap + `prose_truncated` flag applied
- [ ] PROSE-UNIT-SERVE.test.ts created with TC-2, TC-2b, TC-5 coverage
- [ ] All integration tests pass (zero new failures on table path)
- [ ] Code review + merge to main
- [ ] After BPE-DEV-1 lands, round-trip tests (TC-2, TC-2b, TC-5) verified
- [ ] TASK_BPE-DEV-2 marked DONE in orch-state.json

---

## Notes

- Architect SPIKE is complete; all blockers resolved
- This is the consumer (serving) task — TASK_BPE-DEV-1 is the producer (extraction) task
- FR-3 (46-vs-35 gap) is resolved-no-action (separate root cause, bypassed by FR-1/FR-2)
- No new Tesseract calls added (uses stored prose text from producer)
- Schema migration NOT needed (existing `stitched_markdown TEXT` column supports prose text size)
- `getBctcPageTextTool` auto-supported (no code change required)
- Prose sections are served with context-window safety in mind (4000-char cap for AI tools)

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` — L511-591: extend page_type filter to IN('table','prose'); update gap-detection logic for EC-1 (empty prose unit falls through to fallback)
  - `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts` — L134-174: add `ProseSectionEntry` interface + `prose_sections` field to `BctcStructuredData`; L135-151: `ProseLayoutUnitRow` type; L1115-1157: prose_sections query (4000-char cap, quarantine filter, ascending page sort)
- **Tests written:** `apps/mcp-server/src/__tests__/PROSE-UNIT-SERVE.test.ts` — 12 assertions, GREEN
  - TC-2: prose unit with text → has_pek:true, pek_coverage_gap absent, text_content non-empty
  - TC-2b: empty prose unit → pek_coverage_gap:true, fallback activated
  - TC-3: table unit path regression (2 assertions)
  - EC-5: blank unit excluded from PEK seam
  - TC-5: prose_sections array (5 assertions: present, empty-when-no-prose, truncated, sorted, quarantine-excluded)
- **Git commits:** `5cea706a feat(bctc-serve): BPE-DEV-2 prose units served via PEK seam`
- **Type check:** clean (bun tsc --noEmit)
- **bun test:** 12 new pass / 0 fail (PROSE-UNIT-SERVE); 59 pass / 0 fail across 5 affected files; 79 pass / 0 fail across regression suite
- **Tool count:** 157 tools — matches pre-task baseline
- **Scheduler count:** 78 cron.schedule entries (baseline was 76 as of FIX-PROJECT-STATS-GENERATED; delta is pre-existing)
- **Docs updated:** docs/handoffs/TASK_BPE-DEV-2.md — [Developer] section appended | NONE other
- **Graphify:** skipped (no new architecture docs)
- **REBUILD REQUIRED:** Yes — the serving fix in bctcInspectHandler (page_type filter change) and the prose_sections addition in bctcFullTools will not be live until the mcp-server container is rebuilt and restarted. Router must dispatch ops to REBUILD after this commit lands.
