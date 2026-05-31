# REQ-BCTC-TABLE-BOUNDARY — Multi-Page Table Stitcher Boundary State Machine

**Sprint:** BCTC-TABLE-BOUNDARY
**Task:** BTB-BA
**Zone:** `apps/pdf-extractor/`
**Size:** M
**Owner (impl):** dev-pdf-extractor → ops → qa → po
**Created:** 2026-05-29
**Status:** Spec ready — no PO blockers

---

## Context

User-reported bug (verbatim): *"call agent to review pdf page and text extract by page, i see it merge all table not correct, merge only table is continue, if end table need back to extract normal then renew if table if appear new"*

**Translation of user intent into three concrete failure modes the current engine exhibits:**

1. Tables that span multiple pages are sometimes NOT merged (continuation incorrectly split).
2. Prose text that follows the end of a table is swallowed INTO the table unit instead of being emitted as normal text.
3. A new, structurally distinct table that starts after a previous table ends is appended to the prior table unit instead of opening a fresh unit.

**Root-cause location (PO-confirmed, BA-verified against source):**

- `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py`
  - `build_document_map()` (~L2552): the outer grouping loop and its helpers
  - `_flush_unit()` (~L2641): majority-vote `dominant_type` assignment — a page sequence that is mostly table but ends with prose stays typed "table", so the prose tail is never separated
  - `_fingerprints_continuous()` (~L3000): geometric-only continuity test — no check for a table-title band or intervening non-table content that signals a NEW table rather than SAME table continued
  - Blank-page bridging (~L2664): unconditional — blank pages after a table's last real row bridge into the next section regardless of structural change on the far side

- `apps/pdf-extractor/application/extract_layout_first_usecase.py`: orchestrator that drives `build_document_map()` and writes results into `bctc_layout_units.page_numbers_json` — the field the viewer filters on.

---

## Definitions

### D-1 — Table Page
A page whose geometric fingerprint yields `page_type = "table"`: `gutter_count >= _TABLE_MIN_GUTTER_COUNT` (currently 1) AND `money_group_count >= _TABLE_PAGE_MIN_MONEY_GROUPS` (currently 3). This is a PURELY GEOMETRIC classification — no BCTC semantic strings.

### D-2 — Prose Page
A page whose geometric fingerprint yields `page_type = "prose"` (does not satisfy D-1 thresholds) and is not blank.

### D-3 — Blank Page
A page whose geometric fingerprint yields `page_type = "blank"` (insufficient ink/content for geometry detection). Blank pages are page-gap fillers — they do NOT carry page-type semantics.

### D-4 — Genuine Continuation (operationally defined)
Page N+1 is a genuine continuation of page N's table if and only if ALL of the following hold:

1. **Column-count match:** `gutter_count(N) == gutter_count(N+1)` (same structural width)
2. **Gutter-position match:** each `gutter_x_fraction` within `_GUTTER_POSITION_TOLERANCE` (same column layout)
3. **Row-pitch stability:** row pitch change ≤ `_ROW_PITCH_CHANGE_TOLERANCE` (same line density)
4. **No intervening prose page:** no D-2 page appears between page N and page N+1 in the scan order (a non-blank prose page in between breaks the table regardless of geometry matching on either side)
5. **No table-title band on page N+1:** the page N+1 OCR text does NOT contain a standalone title line that introduces a NEW table section. A "title band" is defined as any line in the first 20% of the page's text that:
   - Is the ONLY non-numeric content in that line (no inline values), AND
   - Is followed immediately by a D-1 fingerprint page (i.e. the title introduces a table, not prose)
   - NOTE: "(tiếp theo)" / "(continued)" suffixes are the INVERSE signal — they confirm continuation, not a new table

**All five conditions must hold simultaneously.** Failing any single condition forces a unit break.

### D-5 — Table-Title Signal
A positive title-band signal on the FIRST NON-BLANK page after a table-end page. Used to distinguish state 4 (NEW) from a geometric match that happens to have misaligned column counts.

---

## The Four Boundary States

### STATE 1 — START
**Definition:** A table begins. The current page is D-1 (table) and the preceding non-blank page was D-2 (prose) or no page (document start).

**Required action:** Open a new logical unit. `schema_page = current page`. Record `page_type = "table"`. Begin accumulating `page_numbers_json`.

**Edge cases:**
- Document's very first page is a table page → START immediately (no prior page).
- A blank page immediately preceding a table page: blank is skipped; the table page is still START if the page before the blank was prose or document-start.

**DDD layer:** infrastructure (`build_document_map` / `_flush_unit`)

---

### STATE 2 — CONTINUE
**Definition:** The current page is D-1 (table) AND all five conditions in D-4 hold (genuine continuation of the open table unit).

**Required action:** Append current page to the open table unit's `page_numbers_json`. Do NOT flush.

**A blank page between two table pages does NOT break continuation IF** the page on both sides of the blank satisfies D-4 conditions 1–5. The blank is silently appended as a gap-page and does not appear in the viewer's page list (current behaviour, preserved).

**CRITICAL — this is the ONLY state that merges pages into one unit.** No other state may extend an existing unit's `page_numbers_json`.

**DDD layer:** infrastructure (`_fingerprints_continuous` + blank-page bridge in `build_document_map`)

---

### STATE 3 — END → FALL BACK TO NORMAL TEXT
**Definition:** The open table unit closes. The current page is D-2 (prose) and the previous page was D-1 (table, open unit).

**Required action:**
1. Close the current table unit (`_flush_unit`). The table unit's `page_numbers_json` ENDS at the last D-1 page — it does NOT include any D-2 prose pages.
2. Open a NEW prose unit for the current page. `page_type = "prose"`. `schema_page = current page`.
3. The prose content from this page MUST be emitted as normal text (prose unit), NOT swallowed into the table unit that just closed.

**Failure mode being fixed (from user bug report):** Currently, `_flush_unit` uses majority-vote `dominant_type`. A unit that is mostly table but ends with 1–2 prose pages votes "table" and those prose pages stay in the table unit. Fix: page_type is determined by the FIRST non-blank page of the unit (schema-page type), NOT a majority vote. A unit that opens as table remains table only until its first D-2 (prose) or D-5 (title) page — that page triggers END, not continuation.

**DDD layer:** infrastructure (`_flush_unit` dominant-type voting, `build_document_map` loop logic)

---

### STATE 4 — NEW (fresh table)
**Definition:** A new, structurally distinct table appears. Triggers when:
- The current page is D-1 (table) AND one of:
  - The preceding non-blank page was D-2 (prose) — table after prose = always NEW START
  - The preceding page was D-1 but D-4 conditions 1–3 fail (geometry changed = structurally different table)
  - The preceding page was D-1 and D-4 conditions 1–3 hold but condition 5 fires (a title band appears on the current page, announcing a new table despite matching geometry)
  - The preceding page was D-1 and D-4 condition 4 fires (an intervening prose page was detected between the two table pages)

**Required action:** FLUSH the previous unit if open. Open a FRESH unit. `page_type = "table"`. Assign a new `unit_id`. `page_numbers_json` starts with only the current page. NEVER append to the prior table unit.

**Critical distinction from STATE 2 (CONTINUE):** geometry alone is not enough to declare continuation. The absence of intervening prose AND the absence of a title band are EQUALLY required. Two tables with identical column geometry (e.g., two different balance-sheet sections with the same 4-column layout) MUST still be split into separate units if a prose or title-band page appears between them.

**DDD layer:** infrastructure (`_fingerprints_continuous` missing title-band check, `build_document_map` missing intervening-prose break, blank-page bridge must check far-side page type before bridging)

---

## Functional Requirements

### FR-1 — Schema-page-type assignment (fix STATE 3 over-merge)
**DDD layer:** infrastructure

The `page_type` of a logical unit MUST be assigned from the page_type of its schema-page (first non-blank page), NOT by majority vote over all pages in the unit. The current `_flush_unit` dominant-type voting MUST be replaced.

**Acceptance criteria:**
- AC-FR1-1: A unit whose first page is D-1 and whose last two pages are D-2 is classified `page_type = "table"` in the unit record, AND those two D-2 pages are NOT included in `page_numbers_json` (they trigger END at their boundary, opening a prose unit).
- AC-FR1-2: A unit that starts D-2 and ends D-2 is classified `page_type = "prose"`.
- AC-FR1-3: Deliberate-violation test: inject a 3-page mock where pages=[table, table, prose]. Assert two units are emitted: unit_1 = {pages: [1,2], page_type: "table"}, unit_2 = {pages: [3], page_type: "prose"}. Assert unit_1.page_numbers_json does NOT contain page 3.

### FR-2 — Intervening-prose break in `_fingerprints_continuous` / build loop
**DDD layer:** infrastructure

A D-2 (prose) page between two D-1 (table) pages MUST break the table unit even when the D-1 pages on both sides satisfy geometric conditions 1–3 of D-4. The break fires at the D-2 page (STATE 3), and the next D-1 page opens a NEW unit (STATE 4).

**Acceptance criteria:**
- AC-FR2-1: Pages [table, prose, table] with matching geometry on both table pages → three units emitted: table(p1), prose(p2), table(p3). NOT one table unit.
- AC-FR2-2: Pages [table, blank, prose, table] → the blank bridge terminates when the far side of the blank is D-2. Units: table(p1), blank absorbed into p1 unit OR as own blank unit, prose(p3), table(p4). (Implementation detail for architect: blank bridging must check the next non-blank page type before bridging.)
- AC-FR2-3: Deliberate-violation test: inject the mock above. Assert page 3 (table) has its own unit_id distinct from page 1.

### FR-3 — Table-title break in `_fingerprints_continuous`
**DDD layer:** infrastructure

When the current page is D-1 AND its stored OCR text contains a D-5 title-band signal (standalone title in top 20% of text, non-numeric, followed by table fingerprint), the current page MUST open a NEW unit regardless of geometric match with the previous table page.

**Acceptance criteria:**
- AC-FR3-1: Two geometrically identical table pages where page 2 starts with a standalone title → two separate table units.
- AC-FR3-2: A table page whose first text line is "(tiếp theo)" (continuation marker) → NOT treated as a title band; CONTINUE state applies.
- AC-FR3-3: Deliberate-violation test: inject mock pages [table-no-title, table-with-title] with identical geometry. Assert two units, not one.

### FR-4 — Blank-page bridge gated on far-side type
**DDD layer:** infrastructure

Unconditional blank-page bridging (~L2664) MUST become conditional: blank pages are bridged into the current unit ONLY when the next non-blank page satisfies D-4 with respect to the current unit's last D-1 page. If the next non-blank page is D-2 or D-5, the blank does NOT bridge.

**Acceptance criteria:**
- AC-FR4-1: Pages [table, blank, table-same-geometry] → blank bridged, one unit: pages [1,2,3].
- AC-FR4-2: Pages [table, blank, prose] → blank NOT bridged into the table unit. Units: table(p1), prose(p3). (Blank either forms its own micro-unit or is absorbed into the prose unit — architect decision, but NOT in the table unit.)
- AC-FR4-3: Pages [table, blank, blank, table-new-geometry] → both blanks not bridged (geometry fails on far side). Three units minimum.

### FR-5 — Output contract: `bctc_layout_units.page_numbers_json` correctness
**DDD layer:** application (`extract_layout_first_usecase.py`)

After the fix, each row in `bctc_layout_units` MUST satisfy:
- A `page_type = "table"` unit: ALL pages in `page_numbers_json` are D-1 pages (no prose pages appended).
- A `page_type = "prose"` unit: pages come from a contiguous prose sequence (no D-1 pages mixed in).
- Adjacent units in the same report are disjoint (no page appears in two units).

**This is verified by DIRECT DB READ** — not the viewer, not the balance badge, not unit tests alone.

---

## Non-Functional Requirements

### NFR-1 — Off-hours re-extraction constraint
Re-extraction of any report MUST NOT be scheduled during `02:00–08:59 UTC Monday–Friday` (HOSE active hours). Single-doc sequential extraction only. Never `run_bctc_batch_sweep`.

### NFR-2 — CPU-only, 8GB Docker cap
No GPU deps. No new heavy model loads. Tier-0 stays CHEAP (existing stored OCR text + low-DPI PIL rasters). No new Tesseract calls in `build_document_map`.

### NFR-3 — PDF-Extract-Kit pristine
Zero changes to files under `apps/pdf-extractor/PDF-Extract-Kit/`. git-diff of that subtree must show 0 local changes.

### NFR-4 — text_table_extractor.py not in scope
`apps/pdf-extractor/infrastructure/text_table_extractor.py` is 0-byte-diff. The fix is entirely within `generic_md_table_extractor.py` (build_document_map + _fingerprints_continuous + helpers) and `extract_layout_first_usecase.py` (orchestration logic if needed for unit-type post-processing). No other files modified.

### NFR-5 — Main branch, scoped commits
All work on `main`. No branches. Commits scoped to the specific files in NFR-4. Explicit-file staging only.

---

## Edge Cases

### EC-1 — Single-page table (document with only one table page)
A document with exactly one D-1 page: START fires; no CONTINUE check needed; END fires at document end. One table unit. Verified by direct DB read.

### EC-2 — Table spanning the entire document
All pages are D-1 with matching geometry and no title bands. One table unit covering all pages. `page_numbers_json = [1..N]`.

### EC-3 — Multiple tables with identical geometry separated by prose
Two tables with the same column layout but separated by a prose section (e.g., BẢNG CÂN ĐỐI p3-6, then notes prose p7-15, then THUYẾT MINH table p16-20). Each is a separate unit. The prose pages p7-15 are NOT in either table unit. Verified: 3 units minimum.

### EC-4 — "(tiếp theo)" continuation pages with no column header
These are the pages that triggered the ORIGINAL scramble (FPT Q1 p5 missing-header). They must be classified CONTINUE (STATE 2) because they carry no title band. The fix must NOT accidentally break continuation on these pages. Verified by FPT sentinel (see Acceptance Gate below).

### EC-5 — BCTC documents with table-then-prose-then-table within a single OCR pass
E.g., balance sheet p3-6, narrative p7, cash flow p8-12 on the same document. This is the canonical multi-table case. Must produce: unit_1(p3-6 table), unit_2(p7 prose), unit_3(p8-12 table). NOT a single merged unit.

### EC-6 — Vietnamese BCTC locale: thousand-separator "." as decimal "."
Money-group detection uses regex on stored OCR text (already implemented in `_TABLE_PAGE_MIN_MONEY_GROUPS` logic). The fix must not regress this detection. VN numbers: `1.234.567` (7-digit) or `(1.234)` (negative thousands). No new locale parsing introduced in this sprint.

---

## Acceptance Gate — Done Bar (anti-false-green, BCTC-TABLE-3 lesson)

**FORBIDDEN as sole gate:** balance badge, unit test pass count alone, viewer screenshot.

**REQUIRED — two real-data sentinels, both must pass:**

### Sentinel A — FPT Q4 2024 (report_id = `e71f845d-ffa5-48f9-8f09-30ac2cd09c65`, total_pages = 46)

The known-good sentinel for multi-page continuation. Unit pages 7–9 (verified in previous sprint) are a genuine three-page table. After the fix:

1. **Continuation check:** the three pages 7–9 remain in a SINGLE table unit (page_numbers_json = `[7,8,9]` or superset if more pages belong). CONTINUE fired correctly.
2. **Prose-not-swallowed check:** any prose page in this document that follows a table section appears as its OWN prose unit in `bctc_layout_units`, NOT inside a table unit.
3. **No false-merge:** if the document contains multiple structurally distinct tables, each appears as a separate unit in `bctc_layout_units`.

Verification command (direct DB — NOT the endpoint):
```
docker compose exec -T mcp-server bun -e "
const db = require('bun:sqlite').Database.open('/app/data/market.db', {readonly: true});
const rows = db.query(\"SELECT unit_id, page_type, page_numbers_json FROM bctc_layout_units WHERE report_id = 'e71f845d-ffa5-48f9-8f09-30ac2cd09c65' ORDER BY json_extract(page_numbers_json, '$.0')\").all();
console.log(JSON.stringify(rows, null, 2));
"
```

Expected output structure: multiple unit rows, each with non-overlapping `page_numbers_json`, with a prose unit visible (not everything typed "table").

### Sentinel B — A second multi-table report from the validation corpus

Any SECOND document from the 18-doc validation corpus (`pdf_extracted_text`) that contains at least one table-then-prose-then-table pattern. QA selects and re-extracts one of: ACB, VCB, GAS, HPG (all known to have notes sections separating financial tables).

Assertion: at least 3 units are emitted; prose pages appear as prose units; no prose page appears in a table unit's `page_numbers_json`.

### Deliberate-Violation (DV) Test — anti-false-green (feedback_fence_false_green)

Before the fix is declared done, dev MUST inject a deliberate violation:

**DV-1:** Call `build_document_map` with a mock page list: `[{page_number:1, type:"table"}, {page_number:2, type:"prose"}, {page_number:3, type:"table"}]` with geometrically identical fingerprints on pages 1 and 3. Assert the function returns 3 units (not 1). If only 1 unit is returned, the fix is NOT in place — QA must REJECT.

**DV-2:** Call `_fingerprints_continuous` with two fingerprints that are geometrically identical (same gutter_count, same gutter_x_fractions, same row_pitch) but where the second fingerprint's page has a D-5 title-band signal in its stored text. Assert `_fingerprints_continuous` returns `False`. If it returns `True`, the title-band break is missing — QA must REJECT.

Both DV tests must go RED before the fix, then GREEN after the fix. This proves the gate is real.

---

## DDD Layer Mapping

| Requirement | DDD Layer | File(s) |
|---|---|---|
| FR-1 schema-page-type assignment | infrastructure | `generic_md_table_extractor.py` (`_flush_unit`) |
| FR-2 intervening-prose break | infrastructure | `generic_md_table_extractor.py` (`build_document_map` loop, `_fingerprints_continuous`) |
| FR-3 title-band break | infrastructure | `generic_md_table_extractor.py` (`_fingerprints_continuous`, title-band helper) |
| FR-4 blank-bridge gate | infrastructure | `generic_md_table_extractor.py` (`build_document_map` blank handler ~L2664) |
| FR-5 output contract verification | application | `extract_layout_first_usecase.py` (orchestration, unit post-check) |
| All acceptance sentinels | — | Live `bctc_layout_units` table via direct DB |

---

## Constraints Summary (carry into every handoff)

- Edits confined to: `generic_md_table_extractor.py` (build_document_map + _fingerprints_continuous + helpers) and `extract_layout_first_usecase.py` if orchestration logic requires updates.
- PDF-Extract-Kit subtree PRISTINE — zero edits under `apps/pdf-extractor/PDF-Extract-Kit/`.
- `text_table_extractor.py` NOT in scope — 0-byte-diff.
- Main branch only. No branches.
- Scoped commits (explicit-file staging, never `-A`/`.`).
- Re-extraction OFF-HOURS only — never `02:00–08:59 UTC Mon–Fri`.
- CPU-only, 8GB Docker cap, no GPU deps.
- `sqlite3` NOT in containers — query via `docker compose exec -T mcp-server bun -e` with `require("bun:sqlite")`.
- ops MUST `docker compose build pdf-extractor` then `up -d --no-deps --force-recreate` after dev changes (restart relaunches stale image).

---

## Blockers

None identified. PO has pre-resolved all decisions. Architect may proceed immediately.

---

## Handoff Summary for Architect

The fix is a state-machine replacement for the current sequential page-scan in `build_document_map`. The architect must design:

1. A per-page state transition: `{NONE → START, CONTINUE, END, NEW}` driven by (a) current page_type, (b) previous page_type, (c) geometric continuity (D-4 conditions 1–3), (d) intervening-prose flag, (e) title-band signal on current page.
2. A title-band detector function that reads stored OCR text (cheap — no new Tesseract) and returns a boolean for condition 5 of D-4.
3. A revised `_flush_unit` that uses schema-page type (first non-blank page) not majority vote.
4. A revised blank-page bridge that checks the next non-blank page type before bridging.
5. Confirmation that `extract_layout_first_usecase.py` requires no orchestration changes (or documents what changes are needed if the unit post-processing logic needs updating).

The four-state rule in one sentence: **merge only pages that are table, geometrically continuous, with no intervening prose and no title-band on the joining page; flush to prose when the page type drops to D-2; open a fresh table unit on every structural break or title signal.**
