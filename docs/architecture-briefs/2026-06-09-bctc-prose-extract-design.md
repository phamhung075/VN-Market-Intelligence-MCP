# BPE-ARCH-1 — BCTC Prose Extract Design Brief

**Task:** BPE-ARCH-1
**Sprint:** BCTC-PROSE-EXTRACT
**Author:** architect
**Date:** 2026-06-09T22:10Z (retroactively formalized 2026-06-19)
**Status:** COMPLETE — sprint DONE (PO sign-off 2026-06-10, BPE-QA-1 green)
**Recurring-bug-escalation:** active — 7+ prior commits on module family, SPIKE mandatory before dev

---

## Zone

- **Primary:** `apps/pdf-extractor/` (producer — ocr_unit prose branch)
- **Secondary:** `apps/mcp-server/` (serving — bctcInspectHandler + AI tool layer)
- Multi-zone: PM split into dev-pdf-extractor (BPE-DEV-1) + dev-mcp-server (BPE-DEV-2, BPE-DEV-3)

---

## Brownfield Summary

Full `[Architect] Brownfield Findings` embedded in spec: `docs/handoffs/BCTC-PROSE-EXTRACT-BA-spec.md` §§ Brownfield Findings (L251-414).

Source-verified paths (code-read confirmed at time of brief + re-verified 2026-06-19):

- `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` — `ocr_unit()` starts at L3715. Prose branch now at L3783-3816. Parameter `ocr_pages: Optional[List[Dict]] = None` at L3720. Defect FIXED in commit `6e518935`.
- `apps/pdf-extractor/application/extract_layout_first_usecase.py` — `ocr_pages` fetched at L242-247 (Step 0). Passed to `self._ocr_unit()` at L447. Call site FIXED in same commit.
- `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` — prose filter extension + total_pages COUNT→MAX FIXED in commit `5ea9f121` (BPE-DEV-3).
- `apps/mcp-server/src/infrastructure/fetchers/pdfOcrWorker.ts` — skip-guard raised `<10`→`<3` + DPI escalation FIXED in commit `5ea9f121`.

---

## Blocker Resolutions (all 5)

**BLOCKER-1 — ocr_unit injection path:**
Option A chosen: extend `ocr_unit()` with `ocr_pages: Optional[List[Dict]] = None`. Caller (`extract_layout_first_usecase.py`) passes list already in scope at Step 0. Keeps ocr_unit a pure synchronous callable — no infrastructure port inside it, no circular dependency. Backward compatible: `None` default causes prose branch to return `""` with `_prose_no_text=True` — existing mocks without this arg pass unchanged.

**BLOCKER-2 — 46-vs-35 OCR coverage gap root cause:**
Initial determination (L304 BA spec): separate defect, char-count skip, no action needed. OVERRULED by BPE-SPIKE-1 (`docs/architecture-briefs/2026-06-09-bctc-prose-ocr-coverage-rootcause.md`). Real root: `pdfOcrWorker.ts` `<10`-char skip guard was wrongly dropping text pages (DPI 200 too low for Vietnamese dense prose — user screenshot proved page 12 has visible text). Completeness guard (L199-213) locked the 35-row dataset: `COUNT=35 >= threshold=23` caused re-OCR to exit early. Fix scope: raise guard `<10`→`<3` + DPI 300 escalation retry + BPE-OPS-1 delete stale rows then re-OCR.

**BLOCKER-3 — Patch order for active uncommitted table-extraction work:**
Serial order ruled: (1) commit active table changes (`dtos.py` + `extract_layout_first_usecase.py` Gates A+B + `layout_invariants/primitive.py` + `bctc_code_whitelist/`) as single commit — shipped as `1588a591`. (2) Prose changes on top — shipped as `6e518935`. Non-overlapping line ranges: table gates at L504+ in the use case; prose fix at L420 call site and L3715 in generic_md_table_extractor. Zero line-level conflict confirmed.

**BLOCKER-4 — AI tool architecture:**
Extend `getBctcPageTextTool`, do NOT add a new tool. The tool delegates to `/api/page-text` → `handleBctcInspectOcr` which, after BPE-DEV-2 (FR-2c), serves prose units automatically. No tool-code change needed for basic prose retrieval (FR-2c auto-closes it). For full-document analysis (`bctcFullTools.ts`): add `prose_sections` array — query `bctc_layout_units WHERE page_type='prose'`, cap 4000 chars/unit with `prose_truncated:true`, return `prose_sections:[]` when none found (never null, never fabricated).

**BLOCKER-5 — Structural root cause (recurring-bug-escalation):**
Three interlocking failure modes caused prose pages to be silently dropped across 7+ sprint cycles:
1. No non-empty assertion on `stitched_markdown` for prose units. Tests asserted `stitched_markdown` is a string but never asserted it is non-empty when OCR text exists. The stub comment "stored text suffices" was aspirational, never enforced.
2. Invariant gates (1-3) silently skip prose units (empty `rows_for_gate` → early exit). A "green" gate result was indistinguishable from a successfully-processed unit with no financial rows. Prose empty output was invisible to CI.
3. PROSE-DEV-1 fallback in `bctcInspectHandler.ts` (L549-588) normalized the bad behavior — the comment "Prose pages have a PEK unit with page_type='prose' but stitched_markdown=''" treated the defect as a known limitation, not a bug to fix.

Prevention: invert the implicit test assertion. New unit test in `apps/pdf-extractor/__tests__/unit/test_generic_extractor_prose.py` (TC-1): given a prose unit and `ocr_pages` with non-empty text, `ocr_unit()` returns `stitched_markdown != ""`. Added in BPE-DEV-1 (16 prose tests + 45 table regression tests — all green, QA-approved).

---

## DDD Layer Assignments

| Change | Layer | File | Status |
|---|---|---|---|
| `ocr_unit()` signature + prose_lines populate | infrastructure | `generic_md_table_extractor.py:3715-3816` | SHIPPED 6e518935 |
| Caller passes `ocr_pages` | application | `extract_layout_first_usecase.py:447` | SHIPPED 6e518935 |
| `bctcInspectHandler` query extend to prose | interface | `bctcInspectHandler.ts` | SHIPPED 5ea9f121 |
| `pek_coverage_gap` semantics update | interface | `bctcInspectHandler.ts` | SHIPPED 5ea9f121 |
| total_pages COUNT→MAX + OFFSET→point-lookup | interface | `bctcInspectHandler.ts` | SHIPPED 5ea9f121 |
| OCR skip guard `<10`→`<3` + DPI 300 retry | infrastructure | `pdfOcrWorker.ts` | SHIPPED 5ea9f121 |
| `bctcFullTools.ts` prose_sections | interface | `bctcFullTools.ts` | SHIPPED BPE-DEV-2 |
| New unit tests prose non-empty assertion | test | `test_generic_extractor_prose.py` (new) | SHIPPED 6e518935 |

---

## Risk Flags (at design time — all mitigated)

- RISK-1: `ocr_pages` key inconsistency (`"text"` vs `"text_content"`) → dual-key fallback pattern from `_eval_push_stage3` L881. Implemented.
- RISK-2: `_ALLOW_PROSE_IN_TABLE_UNIT=True` absorbs prose pages into table units (coerces `page_type="table"` at L2731) → prose branch does not fire for these. Confirmed correct behavior (EC-4).
- RISK-3: blank/image-only prose pages return `{"text": ""}` from ocr_pages → skip in loop, emit `_prose_no_text:True`. Implemented.
- RISK-4: `bctcInspectHandler` filter `WHERE page_type = 'table'` → changed to `IN ('table','prose')` (not `remove`) to exclude blank units from seam path. Implemented.
- RISK-5: `assert_called_with` breakage for tests that assert ocr_unit signature → grepped `test_pek_engine_adapter.py` and `test_document_map.py`; updated in BPE-DEV-1.
- RISK-6: AI context-window overflow for 30-page thuyết minh → 4000-char cap per unit + `prose_truncated:true`. Implemented in BPE-DEV-2.

---

## Schema Verification

`bctc_layout_units.stitched_markdown TEXT NOT NULL DEFAULT ''` — SQLite TEXT supports up to 1GB. 15-page thuyết minh at 2-3KB/page = max ~45KB. No truncation risk. No ALTER TABLE needed.

---

## BUILD-STANDARD

- BUILD-STANDARD: lean (both zones exist, bug-fix + targeted extension, no new microservice)
- BUILD-STANDARD-REF: docs/standards/microservice-build-standard.md

---

## Outcome (sprint-close verification)

BPE-QA-1 raw-verified 2026-06-10:
- Page 12 prose = 4099 chars (original defect RESOLVED)
- Table page 3 balance sheet = 7175 chars (table path regression-free)
- 0 empty layout units (was 13)
- total_pages = 46 (GAP-1 COUNT→MAX fixed)
- All 46 OCR pages present in pdf_extracted_text (GAP-3 re-OCR complete)
- 8 peer reports unchanged

---

*Related brief (BLOCKER-2 SPIKE):* `docs/architecture-briefs/2026-06-09-bctc-prose-ocr-coverage-rootcause.md`
*Brownfield findings (full):* `docs/handoffs/BCTC-PROSE-EXTRACT-BA-spec.md` §§ [Architect] Brownfield Findings (L251-414)
*Decision journal:* `docs/agent-memory/decisions/sprint-BCTC-PROSE-EXTRACT-architect.md`
