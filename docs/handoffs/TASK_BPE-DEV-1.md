# TASK_BPE-DEV-1 — BCTC Prose Extract (Producer)

**Sprint:** BCTC-PROSE-EXTRACT  
**Task:** BPE-DEV-1  
**Owner:** dev-pdf-extractor  
**Type:** Feature/Defect Fix  
**Size:** M (4-6h)  
**Estimate:** 4h implementation + 1h testing  
**WIP Slot:** 1 of 2  
**Status:** READY (architecture SPIKE complete, blockers resolved)  
**Date Created:** 2026-06-09  
**Depends On:** None (but commits must respect BLOCKER-3 ordering)

---

## Objective

Fix the silent prose-text drop in `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py:ocr_unit()` prose branch. Prose units (notes pages, non-table BCTC sections) must extract and return full OCR text body instead of empty string.

**Root Cause:** `prose_lines` list declared but never populated from `ocr_pages` list that contains stored OCR text. Function always returns `stitched_markdown: ""` for prose units despite available text.

---

## Acceptance Criteria

1. **AC-1: ocr_unit() prose branch extracts text**  
   - Extend `ocr_unit()` signature: add `ocr_pages: Optional[List[Dict]] = None` parameter
   - Prose branch populates `prose_lines` from `ocr_pages` for each page in the unit
   - Use dual-key fallback: `page_rec.get("text") or page_rec.get("text_content") or ""`
   - Return `stitched_markdown: "\n".join(prose_lines)` (concatenated text body, not formatted table)
   - Edge case: if ALL pages in unit have empty text, return `stitched_markdown: ""` with `_prose_no_text: True` flag in result

2. **AC-2: Caller passes ocr_pages to ocr_unit()**  
   - `extract_layout_first_usecase.py` line ~420: modify `self._ocr_unit()` call to pass `ocr_pages=ocr_pages`
   - `ocr_pages` is already fetched in Step 0 at L217-225 — reuse same variable
   - Verify no circular reference or test fixture breakage (see RISK-5 below)

3. **AC-3: Row count semantics for prose units**  
   - `row_count` for prose units = count of non-empty text lines (not table rows)
   - `rows_for_gate: []` (empty, so invariant gates skip cleanly per NFR-3)
   - `page_row_spans: []` (empty for prose)

4. **AC-4: No regression on table path**  
   - Table branch of `ocr_unit()` unchanged
   - All existing table unit tests pass (gate tests, stitched_markdown assertions on tables)
   - Active uncommitted table work (dtos.py, layout_invariants, bctc_code_whitelist) committed first per BLOCKER-3

5. **AC-5: New regression test for prose branch**  
   - File: `apps/pdf-extractor/__tests__/unit/test_generic_extractor_prose.py` (new)
   - Test prose branch with mock ocr_pages containing text → asserts `stitched_markdown != ""`
   - Test prose branch with empty ocr_pages → asserts `stitched_markdown == ""` and `_prose_no_text == True`
   - Test verifies `row_count` for prose is count of non-empty lines

---

## Files to Modify

**Production:**
- `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` — `ocr_unit()` function (L3638-3709)
  - Signature: add `ocr_pages` parameter with default `None`
  - Prose branch (L3695-3709): replace stub loop with text extraction logic
  - Return signature: add `"_prose_no_text": bool` field

- `apps/pdf-extractor/application/extract_layout_first_usecase.py` — call site (L420-425)
  - Pass `ocr_pages=ocr_pages` to `self._ocr_unit()` call
  - Verify `ocr_pages` is in scope (yes, fetched at L217-225)

**Test:**
- `apps/pdf-extractor/__tests__/unit/test_generic_extractor_prose.py` (new file)
  - Unit tests for prose branch behavior
  - Mock `ocr_pages` with Vietnamese text samples
  - Assert stitched_markdown non-empty and line count correct

**Coordination (do not touch — dev-mcp-server owns):**
- `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` — served by TASK_BPE-DEV-2
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts` — served by TASK_BPE-DEV-2

---

## Commit Ordering — BLOCKER-3 Ruling

**SERIAL: Table changes FIRST, then prose changes on top.**

This task implements prose changes. **Prerequisites (must be committed before this task's prose changes):**

1. Commit the active staged/unstaged table work:
   - `apps/pdf-extractor/application/dtos.py` (VisionVerifyMarker + needs_vision_verify)
   - `apps/pdf-extractor/application/extract_layout_first_usecase.py` (Gates A+B in Step 4)
   - `apps/pdf-extractor/domain/primitives/layout_invariants/primitive.py` (check_bs_accounting_identities)
   - `apps/pdf-extractor/domain/primitives/bctc_code_whitelist/` (new primitive + whitelist)
   - `apps/pdf-extractor/__tests__/unit/test_bctc_code_whitelist.py` (new test)
   - `apps/pdf-extractor/__tests__/unit/test_bs_accounting_identities.py` (new test)

   **Then** implement this prose fix on top.

**Reason:** Non-overlapping line ranges in `extract_layout_first_usecase.py` (L420 vs L504) but serial ordering prevents accidental stash-clobber and ensures clean git history for rollback if needed.

---

## Architect's Key Decisions

**BLOCKER-1 Resolution — Option A (Signature Extension):**  
Extend `ocr_unit()` with `ocr_pages: Optional[List[Dict]] = None`. Caller passes the list it fetches at Step 0. Backward-compatible default `None` leaves old test fixtures working without modification.

**BLOCKER-3 Resolution — Serial Patch Order:**  
Commit active table work first, then apply prose changes. Same file (`extract_layout_first_usecase.py`) but non-overlapping regions, so low conflict risk — but serial order ensures clarity + safe rollback.

**Key Technical Notes:**
- `ocr_pages` returned by `OcrTextFetchClient.fetch_ocr_pages()` is `List[Dict]` where each dict is `{"page_number": int, "text": str}` (already stripped)
- Dual-key fallback: use `page_rec.get("text") or page_rec.get("text_content") or ""` (matches existing pattern in `_eval_push_stage3` L881-882)
- Prose units skip invariant gates (return `rows_for_gate: []`) so gates early-exit — no gating needed on prose text content
- Vietnamese diacritics: pass raw text through without normalization

---

## Edge Cases Handled

**EC-1: Blank page within prose unit**  
If a page in a prose unit has no OCR text (`text: ""`), skip it gracefully (don't append blank lines). Only append non-empty lines.

**EC-2: Very long prose units (10+ pages)**  
`bctc_layout_units.stitched_markdown` is `TEXT NOT NULL` with no declared length cap. SQLite TEXT supports up to 1GB. A 15-page thuyết minh = ~30-45KB max. No truncation risk at storage layer.

**EC-3: Prose page with only images/charts**  
`ocr_pages` will contain `{"page_number": N, "text": ""}`. When ALL pages in a unit have empty text, emit `_prose_no_text: True` flag for observability. Do not quarantine — serving layer handles fallback.

**EC-4: _ALLOW_PROSE_IN_TABLE_UNIT interaction**  
When prose-classified pages are absorbed into a table unit (coerced to `page_type="table"`), they use the table OCR path — not affected by this prose branch fix. Correct behavior, no interaction.

---

## Risk Flags & Mitigations

**RISK-1 (medium): ocr_pages key inconsistency**  
Mitigation: Use dual-key fallback `page_rec.get("text") or page_rec.get("text_content")` matching existing `_eval_push_stage3` pattern. Document in code comment.

**RISK-2 (low): _ALLOW_PROSE_IN_TABLE_UNIT interaction**  
Mitigation: Confirmed via architecture — prose pages in table units are NOT affected. No mitigation needed.

**RISK-3 (low): blank/image-only prose pages**  
Mitigation: Handle empty text gracefully, emit `_prose_no_text: True` flag when all pages empty.

**RISK-4 (medium): test fixture breakage**  
Mitigation: See below — grep-audit `assert_called_with` on `ocr_unit` before patching. Most mocks will not break (Python ignores unexpected kwargs on MagicMock). Update explicit signature assertions if found.

**RISK-5 (medium): ocr_unit_fn mock signature assertions in tests**  
Mitigation: Before committing prose changes, grep for `assert_called_with.*ocr_unit` or `assert_called_with.*tmp_dir` in test files:
   - `apps/pdf-extractor/__tests__/test_pek_engine_adapter.py` — audit for `assert_called_with` on ocr_unit call
   - `apps/pdf-extractor/__tests__/unit/test_document_map.py` — audit for same

   If found, update assertions to include `ocr_pages=[...]` in expected call signature.

---

## Test Coverage

**TC-1: Unit test — ocr_unit() prose branch with text**  
File: `apps/pdf-extractor/__tests__/unit/test_generic_extractor_prose.py`  
Input: prose unit + `ocr_pages=[{"page_number": 12, "text": "Chính sách kế toán..."}]`  
Assert: `stitched_markdown != ""`  
Assert: `_prose_no_text == False`  
Assert: `row_count > 0` (line count)  

**TC-1b: Unit test — ocr_unit() prose branch with empty text**  
Input: prose unit + `ocr_pages=[{"page_number": 12, "text": ""}]`  
Assert: `stitched_markdown == ""`  
Assert: `_prose_no_text == True`  

**TC-3: Regression test — table path unchanged**  
Run existing table-path unit tests: confirm all pass (no new failures on table branch)

---

## Handoff Sequence

1. **Commit active table work first** (dtos.py, layout_invariants, bctc_code_whitelist, tests)
2. **Implement prose branch fix** in ocr_unit() and call site
3. **Create + run unit tests** in test_generic_extractor_prose.py
4. **Audit + update test fixtures** (grep for assert_called_with on ocr_unit)
5. **Run full unit test suite** for apps/pdf-extractor/ — zero new failures
6. **Commit prose changes** (reference BLOCKER-3, serial order enforcement)
7. **Signal READY to TASK_BPE-DEV-2** — prose producer changes now live, ready for consumer

---

## DDD Layer & Architecture

**Layer:** Infrastructure (generic_md_table_extractor.py) + Application (extract_layout_first_usecase.py call site)  
**Related:** docs/architecture-briefs/2026-06-09-spike-ci-c5-contam-safe-restrategy.md § [Architect] Brownfield Findings  
**Build Standard:** Lean (bug fix + targeted feature, no new microservice)  
**Handoff to:** dev-mcp-server (TASK_BPE-DEV-2, consumer/serving layer)

---

## Definition of Done

- [ ] Active table work committed (dtos.py, layout_invariants, whitelist)
- [ ] ocr_unit() signature extended with `ocr_pages` parameter
- [ ] Prose branch extracts and returns non-empty text for pages with OCR content
- [ ] `_prose_no_text: True` flag emitted when all pages blank
- [ ] Call site passes `ocr_pages` to ocr_unit()
- [ ] test_generic_extractor_prose.py created with TC-1, TC-1b coverage
- [ ] All test fixture `assert_called_with` audited and updated
- [ ] Full unit test suite passes (zero new failures)
- [ ] Code review + merge to main
- [ ] TASK_BPE-DEV-1 marked DONE in orch-state.json
- [ ] TASK_BPE-DEV-2 (consumer) notified to proceed

---

## Notes

- Architect SPIKE is complete; all blockers resolved
- This is the producer (pull) task — TASK_BPE-DEV-2 is the consumer (push/serve) task
- FR-3 (46-vs-35 gap) is a SEPARATE defect with different root cause (pdfOcrWorker char-count skip). Record as "resolved-no-action" — fixing FR-1/FR-2 bypasses the legacy fallback entirely
- No Tesseract calls added (uses stored OCR text per NFR-2)
- Prose text does not enter invariant gates (per NFR-3)
