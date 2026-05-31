# Architecture Brief — BCTC-TABLE-BOUNDARY: Multi-Page Table Stitcher Boundary State Machine

**Sprint:** BCTC-TABLE-BOUNDARY
**Task:** BTB-ARCH
**Zone:** `apps/pdf-extractor/`
**BUILD-STANDARD:** lean (existing service, new feature within `generic_md_table_extractor.py`)
**Created:** 2026-05-29
**Status:** Design complete — NEXT: dev-pdf-extractor (BTB-DEV)

---

## 1. Root-Cause Audit — All Over-Merge Sources (One Pass)

Per `feedback_silent_swallow_serial_bugs`: all four causes are surfaced here so dev does not encounter them one-rebuild-at-a-time.

### Cause A — `_flush_unit` majority-vote typing (L2641–L2658)

**File:** `generic_md_table_extractor.py`, inner function `_flush_unit()` at L2641.

**Current code path:**
```python
type_counts: Dict[str, int] = {}
for pn in current_unit_pages:
    pt = page_fingerprints[pn].get("page_type", "prose")
    type_counts[pt] = type_counts.get(pt, 0) + 1
dominant_type = max(type_counts, key=lambda t: type_counts[t])
```

**Why it over-merges:** When a table unit accumulates its final 1–2 prose pages before a flush is triggered (e.g., by a geometry change on the following page), the majority vote returns `"table"` because the preceding table pages outnumber the trailing prose pages. Those prose pages are then stored in the unit as `page_type="table"` and their `page_numbers_json` contains prose content. The fix is **never** to vote — the unit type is determined exclusively by the schema-page (first non-blank page).

### Cause B — `_fingerprints_continuous` geometry-only test (L3000–L3049), no intervening-prose check

**File:** `generic_md_table_extractor.py`, function `_fingerprints_continuous(fp_a, fp_b)` at L3000.

**Current code path:** The function compares `fp_a` (the last committed `current_fp`) directly against `fp_b` (the next non-blank page's fingerprint). If both are `page_type="table"` with matching gutter and pitch, it returns `True` (continuous).

**Why it over-merges (two sub-causes):**

**B-1 — No intervening-prose tracking:** The loop in `build_document_map` (L2660–L2688) updates `current_fp` only when a non-blank, non-continuous page is seen. A `page_type="prose"` page causes a flush and opens a new unit — BUT ONLY because `_fingerprints_continuous` returns `False` on a `pt_a != pt_b` check (L3021–L3023). This part works. However, the blank-page bridge (Cause D below) can swallow the prose page before `_fingerprints_continuous` ever sees it, so the two flanking table pages then compare directly, return `True`, and merge into one unit. The prose page is silently absorbed.

**B-2 — No title-band check (D-5):** Two structurally identical tables (same column count, same gutter positions, same row pitch — e.g., BẢNG CÂN ĐỐI on p3–6 then THUYẾT MINH BCTC on p8–12 after a gap) will be merged if the blank-bridge absorbs the prose gap. The function has no knowledge of OCR text signals that announce a new table title.

### Cause C — `_fingerprints_continuous` missing title-band predicate (L3000)

**File:** Same function as Cause B. Distinct sub-cause.

Even without a blank bridge, two geometrically identical table pages where the second page opens with a standalone Vietnamese table title (e.g., `"BẢNG KẾT QUẢ HOẠT ĐỘNG KINH DOANH"`) will be merged. The function never reads the stored OCR text — it is purely geometric (AC-0 for grouping, but AC-0 must be extended to include the title-band signal as a D-5 semantic boundary trigger, since D-5 is defined as a structural boundary, not a BCTC-specific keyword).

### Cause D — Unconditional blank-page bridge (L2664–L2669)

**File:** `generic_md_table_extractor.py`, inner loop body at L2664.

**Current code path:**
```python
if page_type == "blank":
    if current_unit_pages:
        current_unit_pages.append(page_num)
    continue
```

**Why it over-merges:** A blank page is appended to the current unit unconditionally and the loop `continue`s without ever checking what type of page follows the blank. When the sequence is `[table, blank, prose]` or `[table, blank, new-table-with-title]`, the blank is absorbed into the table unit and `current_fp` is never updated to the blank page — so the next non-blank page (`prose` or `new-table`) is compared directly against the last table page's `current_fp`. For `[table, blank, prose]`, the `pt_a != pt_b` check in `_fingerprints_continuous` fires and splits correctly. But for `[table, blank, table-same-geometry-with-title]`, the geometric check passes and the title-band check is absent — causing the two distinct tables to merge.

Additionally, for `[table, blank, blank, prose, table]` sequences the blank bridge absorbs both blanks into the table unit, but the intervening prose page still forces a split because the loop processes the prose page normally. This specific sequence is handled adequately by existing code, but the simpler `[table, blank, table-new-title]` is not.

**Summary table — all four root causes:**

| # | Location | Function | Bug | Effect |
|---|---|---|---|---|
| A | L2641–L2658 | `_flush_unit` | Majority-vote type assignment | Prose pages absorbed into table unit's type and pages list |
| B-1 | L2664–L2669 | build loop (blank bridge) + `_fingerprints_continuous` | Blank bridge absorbs intervening content without lookahead | Prose after blank not always split from preceding table |
| B-2 | L3000–L3049 | `_fingerprints_continuous` | No intervening-prose state tracking passed in | Prose page between two table pages invisible to continuity test when both sides are geometrically identical |
| C | L3000–L3049 | `_fingerprints_continuous` | No title-band (D-5) check | Two geometrically identical tables not split when second has a table title |
| D | L2664–L2669 | build loop (blank bridge) | Unconditional bridge, no far-side type lookahead | Blank before a title-bearing table page bridges incorrectly |

---

## 2. Per-Page Boundary State Machine

### States

| State | Meaning |
|---|---|
| `NO_TABLE` | Current page is D-2 (prose) or D-3 (blank). No open table unit. |
| `TABLE_START` | Current page is D-1 (table). Opens a new table unit. First non-blank page is the schema-page. |
| `TABLE_CONTINUE` | Current page is D-1 and ALL five D-4 conditions hold with respect to the open unit's last committed D-1 page. Page appended to current unit. |
| `TABLE_END` | Current page is D-2 (prose). The open table unit is flushed. A new prose unit opens for this page. |
| `TABLE_NEW` | Current page is D-1 but a D-4 condition fails OR a D-5 title-band fires. Flush the current table unit. Open a fresh table unit. |

### Transition Table

```
PREV STATE      CURRENT PAGE TYPE    D-4 CONDITIONS    D-5 TITLE-BAND    → NEXT STATE
-----------     ----------------     --------------    ---------------    ------------
NO_TABLE        table (D-1)          n/a               n/a               → TABLE_START
NO_TABLE        prose (D-2)          n/a               n/a               → NO_TABLE (prose unit)
NO_TABLE        blank (D-3)          n/a               n/a               → NO_TABLE (blank absorbed into prose unit or skipped)
TABLE_START     table (D-1)          ALL PASS          absent            → TABLE_CONTINUE
TABLE_START     table (D-1)          ANY FAIL          —                 → TABLE_NEW
TABLE_START     table (D-1)          —                 PRESENT           → TABLE_NEW
TABLE_START     prose (D-2)          n/a               n/a               → TABLE_END → NO_TABLE
TABLE_START     blank (D-3)          next_non_blank=table AND D-4        absent  → TABLE_CONTINUE (blank bridged)
TABLE_START     blank (D-3)          next_non_blank=prose OR D-4 fails   —       → TABLE_END (blank NOT bridged into table)
TABLE_CONTINUE  table (D-1)          ALL PASS          absent            → TABLE_CONTINUE
TABLE_CONTINUE  table (D-1)          ANY FAIL          —                 → TABLE_NEW
TABLE_CONTINUE  table (D-1)          —                 PRESENT           → TABLE_NEW
TABLE_CONTINUE  prose (D-2)          n/a               n/a               → TABLE_END → NO_TABLE
TABLE_CONTINUE  blank (D-3)          next_non_blank=table AND D-4        absent  → TABLE_CONTINUE (blank bridged)
TABLE_CONTINUE  blank (D-3)          next_non_blank=prose OR D-4 fails   —       → TABLE_END
TABLE_END       table (D-1)          n/a               n/a               → TABLE_START
TABLE_END       prose (D-2)          n/a               n/a               → NO_TABLE (extend prose unit)
TABLE_NEW       (same as TABLE_START after flush)
```

**Key rule in one sentence:** merge only pages that are D-1 (table), pass all five D-4 conditions with respect to the last committed D-1 page, and carry no D-5 title-band; flush to prose on any D-2 page; open a fresh table unit on every structural break or title-band signal.

### D-4 Genuine Continuation Predicate — Operationally Defined

The predicate `is_genuine_continuation(fp_last_d1, fp_current, stored_text_current, intervening_prose_seen)` returns `True` if and only if ALL of the following hold:

1. `fp_current["page_type"] == "table"` (D-1)
2. `fp_current["gutter_count"] == fp_last_d1["gutter_count"]` (column-count match)
3. For each pair `(xa, xb)` in `zip(fp_last_d1["gutter_x_fractions"], fp_current["gutter_x_fractions"])`: `abs(xa - xb) <= _GUTTER_POSITION_TOLERANCE` (gutter-position match)
4. Row-pitch stability: `|fp_last_d1["row_pitch"] - fp_current["row_pitch"]| / max(both) <= _ROW_PITCH_CHANGE_TOLERANCE` when both pitches are non-zero
5. `intervening_prose_seen == False` (no D-2 page between last D-1 and current page in scan order)
6. `_is_title_band(stored_text_current) == False` (no D-5 title-band on current page)

Conditions 1–4 map directly to the current `_fingerprints_continuous` logic. Conditions 5 and 6 are the two missing predicates that must be added.

### Title-Band Detector (D-5)

**New function:** `_is_title_band(stored_text: str) -> bool`

**Algorithm (cheap — reads stored OCR text, no new Tesseract):**

1. Split `stored_text` into lines. Take only the first `N_TITLE_BAND_LINES = 8` lines (top 20% approximation for a typical 30–40 line page).
2. For each line in those first 8 lines:
   a. Strip whitespace.
   b. Skip empty lines and lines shorter than 5 characters.
   c. If the line matches `_MONEY_GROUP_RE` anywhere (contains numeric financial data) — skip (not a title).
   d. If `re.fullmatch(r"[\d.,\s()]+", line.strip())` — skip (purely numeric).
   e. If the line is ONLY non-numeric content AND length is between 5 and 120 characters — candidate title line.
3. A continuation marker check: if a candidate line contains `"tiếp theo"` (case-insensitive) or `"(continued)"` (case-insensitive) — return `False` immediately (confirmed continuation, not a new title).
4. If at least one candidate title line was found in steps 2–3 — return `True` (D-5 fires, page opens a new table).
5. Otherwise return `False`.

**Constant to add:** `_TITLE_BAND_SCAN_LINES: int = 8`

**DDD layer:** infrastructure (pure function, reads stored text string — no I/O).

**AC-0 compliance:** The title-band detector uses no BCTC-specific keyword strings. It detects structural patterns (non-numeric standalone line in top region). The word `"tiếp theo"` is a Vietnamese generic continuation marker, not a BCTC domain term — acceptable under AC-0.

---

## 3. Function-Level Change Contracts

### 3.1 `_flush_unit()` — REPLACE majority vote with schema-page type

**Current contract (broken):** Computes `dominant_type` by counting page types across ALL pages in the unit. A unit with 5 table pages and 1 prose page votes "table", swallowing the prose page.

**New contract:** `page_type` of the emitted unit is determined exclusively from the schema-page (first non-blank page of `current_unit_pages`). The schema-page fingerprint is available in `page_fingerprints[current_unit_pages[0]]`.

```python
# NEW _flush_unit — schema-page-type assignment (FR-1)
def _flush_unit() -> None:
    if not current_unit_pages:
        return
    # Schema-page = first page of unit (build loop ensures this is non-blank)
    schema_page_num = current_unit_pages[0]
    schema_type = page_fingerprints[schema_page_num].get("page_type", "prose")
    unit_id = str(uuid.uuid4())
    units.append({
        "unit_id": unit_id,
        "schema_page": schema_page_num,
        "pages": list(current_unit_pages),
        "page_type": schema_type,
    })
```

**Note:** The unit's `pages` list must ONLY contain pages that belong to this unit's type-contiguous sequence. The build loop (Section 3.2) is responsible for not appending prose pages to a table unit's `current_unit_pages` — `_flush_unit` simply records what it is given.

### 3.2 `build_document_map()` main loop — REPLACE sequential append with state machine

The loop at L2660–L2689 must be rewritten to implement the state machine. Key structural changes:

**New state variables (alongside existing `current_unit_pages`, `current_fp`):**
- `last_committed_d1_fp: Optional[Dict]` — fingerprint of the last D-1 page actually committed to the current table unit (not updated when blank pages are appended). Used as the reference point for D-4 continuity tests.
- `intervening_prose_flag: bool` — set to `True` when a D-2 page is seen while a blank bridge is pending (lookahead).
- `state: str` — one of `"NO_TABLE"`, `"TABLE_OPEN"` (covers START/CONTINUE; distinction is internal).

**Blank-page lookahead pattern:**

The unconditional blank bridge at L2664 must become conditional. When a blank page is encountered, the loop must peek ahead to find the next non-blank page, evaluate D-4 on that page's fingerprint, and only then decide whether to bridge. Implementation options:

- **Option A (pre-scan):** Before the main loop, build a `next_nonblank: Dict[int, int]` mapping `page_num → next_non_blank_page_num`. Then when a blank is encountered, look up `next_nonblank[page_num]` and evaluate D-4 + D-5 on that page's pre-computed fingerprint.

- **Option B (deferred flush):** Accumulate pending blank pages in a `pending_blank_pages: List[int]` buffer. When the next non-blank page arrives, decide: if D-4 + D-5 pass, drain `pending_blank_pages` into `current_unit_pages` and continue; if they fail, flush the current unit (without the pending blanks), then start a new unit from the next non-blank page.

**Recommended:** Option B (deferred flush). It avoids two-pass scanning and keeps the loop single-direction. The pending blanks are absorbed into the current unit only on a CONTINUE/TABLE_START decision; on a break, they are discarded (or optionally attached to the new unit as leading blanks).

**State machine loop pseudocode (for dev implementation reference):**

```
last_committed_d1_fp = None
pending_blanks = []
state = "NO_TABLE"

for page_num in 1..total_pages:
    fp = page_fingerprints[page_num]
    page_type = fp["page_type"]
    stored_text = page_text_by_num.get(page_num, "")

    if page_type == "blank":
        pending_blanks.append(page_num)
        continue

    # Non-blank page: resolve pending blanks first
    # Determine what to do with pending_blanks based on current transition
    if state == "NO_TABLE":
        # Discard pending blanks or open a blank unit (architect decision: discard)
        pending_blanks = []
        if page_type == "table":
            → TABLE_START
            _open_new_unit(page_num, fp)
            last_committed_d1_fp = fp
            state = "TABLE_OPEN"
        else:  # prose
            → NO_TABLE (prose unit)
            _open_new_prose_unit(page_num, fp)

    elif state == "TABLE_OPEN":
        if page_type == "prose":
            → TABLE_END
            _flush_unit()             # flush current table unit (prose pages NOT in it)
            pending_blanks = []       # blanks before the prose page: discard from table
            _open_new_prose_unit(page_num, fp)
            state = "NO_TABLE"
        elif page_type == "table":
            continuation = is_genuine_continuation(
                last_committed_d1_fp, fp, stored_text,
                intervening_prose=False  # no prose intervened (pending_blanks are blank)
            )
            if continuation:
                → TABLE_CONTINUE
                current_unit_pages.extend(pending_blanks)  # bridge blanks
                current_unit_pages.append(page_num)
                last_committed_d1_fp = fp
                pending_blanks = []
            else:
                → TABLE_NEW
                _flush_unit()  # flush without pending_blanks (they go to new unit or discard)
                pending_blanks = []
                _open_new_unit(page_num, fp)
                last_committed_d1_fp = fp
                state = "TABLE_OPEN"

_flush_unit()  # final flush
```

**Critical invariant enforced by this loop:** `current_unit_pages` for a table unit NEVER contains a prose page. A prose page always triggers `_flush_unit` before it is added to any unit.

### 3.3 `_fingerprints_continuous()` — ADD title-band and D-4 conditions 5–6

**New signature:**
```python
def _fingerprints_continuous(
    fp_a: Dict,
    fp_b: Dict,
    stored_text_b: str = "",
) -> bool:
```

The `stored_text_b` parameter carries the stored OCR text of page B (the candidate continuation page). This enables the D-5 title-band check without any I/O (text is already in `page_text_by_num` in `build_document_map`).

**New checks added after existing geometric checks (before `return True`):**

```python
# D-5: title-band check — fires if page B announces a new table
if _is_title_band(stored_text_b):
    return False
```

**The intervening-prose flag (D-4 condition 5)** is NOT passed into `_fingerprints_continuous` — it is handled at the call site in `build_document_map` (see 3.2 above: when a prose page triggers TABLE_END, the state machine never reaches `_fingerprints_continuous` for the next table page; the state starts fresh at TABLE_START).

**Existing callers:** Only `build_document_map` calls `_fingerprints_continuous`. The call site in the build loop is updated to pass `stored_text_b=page_text_by_num.get(page_num, "")`.

**Test-suite callers (`test_document_map.py`):** Existing tests that call `_fingerprints_continuous(fp_a, fp_b)` without the third argument continue to work because `stored_text_b` defaults to `""` (empty string → `_is_title_band` returns `False` → no change in behaviour for existing tests).

### 3.4 New helper: `_is_title_band(stored_text: str) -> bool`

See Section 2 (Title-Band Detector) for the full algorithm. Place this function immediately after `_extract_unit_hints` (~L2926) in the file, within the Tier-0 helper block.

**Constants to add near L2470 (Tier-0 constants block):**
```python
_TITLE_BAND_SCAN_LINES: int = 8
_TITLE_BAND_MIN_LEN: int = 5
_TITLE_BAND_MAX_LEN: int = 120
_CONTINUATION_MARKERS: tuple = ("tiếp theo", "(continued)", "continued")
```

### 3.5 `extract_layout_first_usecase.py` — No changes required

The use case calls `self._build_document_map(pages=ocr_pages, pdf_path=pdf_path)` and receives the `document_map` dict. The shape of the returned dict is unchanged — `{"report_id", "total_pages", "units": [{"unit_id", "schema_page", "pages", "page_type"}]}`. The semantics of `pages` (now guaranteed to be D-1 pages only for table units) and `page_type` (now schema-page-derived) are strictly more correct. No orchestration changes needed.

**Confirmation:** `extract_layout_first_usecase.py` does not inspect individual page types within `units[i]["pages"]` — it iterates `sorted(pages_in_unit)` for rasterization. The new contract (table unit pages = D-1 only) is a correctness improvement that the use case benefits from without code change.

---

## 4. DDD Layer Assignment

| Item | DDD Layer | File |
|---|---|---|
| `_flush_unit` (schema-page type fix) | infrastructure | `generic_md_table_extractor.py` |
| `build_document_map` state machine loop | infrastructure | `generic_md_table_extractor.py` |
| `_fingerprints_continuous` (+ stored_text_b param) | infrastructure | `generic_md_table_extractor.py` |
| `_is_title_band` helper | infrastructure | `generic_md_table_extractor.py` |
| Tier-0 constants (`_TITLE_BAND_*`, `_CONTINUATION_MARKERS`) | infrastructure | `generic_md_table_extractor.py` |
| `extract_layout_first_usecase.py` | application | no changes |
| `text_table_extractor.py` | infrastructure | 0-byte-diff — NOT in scope |
| `PDF-Extract-Kit/` subtree | — | PRISTINE — zero edits |

---

## 5. Test Strategy

### 5.1 Unit Tests — New file `__tests__/unit/test_table_boundary_state_machine.py`

All tests are pure-function unit tests. Zero real PDF. Zero Tesseract. Zero DB. Zero network.

**Test class A — `_is_title_band`:**

| Test | Input | Expected |
|---|---|---|
| A-1 | Text opening with a standalone non-numeric Vietnamese title line | `True` |
| A-2 | Text opening with `"(tiếp theo)"` as first non-empty line | `False` |
| A-3 | Text with only numeric/money-group lines in top 8 | `False` |
| A-4 | Empty string | `False` |
| A-5 | Text with title on line 9 (beyond scan window) | `False` (not detected) |

**Test class B — `_fingerprints_continuous` with `stored_text_b`:**

| Test | fp_a | fp_b | stored_text_b | Expected |
|---|---|---|---|---|
| B-1 | table/3-gutters/matching | table/3-gutters/matching | "" | `True` (regression: existing behaviour) |
| B-2 | table/3-gutters/matching | table/3-gutters/matching | "BẢNG KẾT QUẢ\n1.234..." | `False` (D-5 fires) |
| B-3 | table/3-gutters/matching | table/3-gutters/matching | "(tiếp theo)\n1.234..." | `True` (continuation marker, D-5 does NOT fire) |
| B-4 | table/3 | table/2 (gutter-count mismatch) | "" | `False` (D-4 condition 2 fails) |

**Test class C — state machine (simulate `build_document_map` loop, injected fingerprints):**

These tests subclass the existing `TestFingerprintGroupingLogic._simulate_grouping` pattern from `test_document_map.py`, extended to track prose-page boundaries and title-band signals. The simulation function must be updated to reflect the new loop logic.

| Test | Page sequence | Expected units |
|---|---|---|
| C-1 (FR-1 DV) | [table, table, prose] same geometry | 2 units: table(p1,p2), prose(p3) |
| C-2 (FR-2 DV) | [table, prose, table] same geometry | 3 units: table(p1), prose(p2), table(p3) |
| C-3 (FR-3 DV) | [table-no-title, table-with-title] same geometry | 2 units: table(p1), table(p2) |
| C-4 (FR-4 DV) | [table, blank, table-same-geometry-no-title] | 1 unit: table(p1,p2,p3) |
| C-5 (FR-4 DV) | [table, blank, prose] | 2 units: table(p1), prose(p3). Blank NOT in table unit. |
| C-6 (EC-3) | [table, prose×8, table] different geometry | 3 units: table(p1), prose(p2-p9), table(p10) |
| C-7 (EC-4) | [table, table-tiep-theo, table] same geometry | 1 unit: table(p1,p2,p3) |

**Deliberate-Violation (DV) tests — anti-false-green (per BA spec §DV-1, DV-2):**

DV-1 and DV-2 must be coded as TWO separate tests that are first run AGAINST the pre-fix code (QA verifies RED), then run against the post-fix code (QA verifies GREEN).

- **DV-1** maps to test C-2 above: inject `[table, prose, table]` with matching geometry. Assert 3 units returned from `build_document_map` (via mock that replaces `_compute_page_fingerprint_50dpi`). If only 1 unit returned — test FAILS = fix not in place.
- **DV-2** maps to test C-3 above: call `_fingerprints_continuous(fp_table, fp_table_with_title, stored_text_b="BẢNG...")`. Assert return value is `False`. If `True` — test FAILS = title-band check missing.

### 5.2 Live Done-Bar (direct DB, not balance badge)

**Sentinel A** — FPT Q4 2024 (`report_id = e71f845d-ffa5-48f9-8f09-30ac2cd09c65`, total 46 pages):

```bash
docker compose exec -T mcp-server bun -e "
const db = require('bun:sqlite').Database.open('/app/data/market.db', {readonly: true});
const rows = db.query(\"SELECT unit_id, page_type, page_numbers_json FROM bctc_layout_units WHERE report_id = 'e71f845d-ffa5-48f9-8f09-30ac2cd09c65' ORDER BY json_extract(page_numbers_json, '$[0]')\").all();
console.log(JSON.stringify(rows, null, 2));
"
```

PASS criteria:
1. Pages 7–9 appear in a single table unit (`page_numbers_json` contains 7, 8, 9 without gaps or omissions).
2. At least one `page_type = "prose"` unit exists in the output (prose pages not swallowed).
3. No `page_numbers_json` for a `page_type = "table"` unit contains a page that is actually prose-typed per its fingerprint.
4. Total row count in `bctc_layout_units` >= 3 (not one monolithic merged unit).

**Sentinel B** — Second document (QA selects from ACB, VCB, GAS, HPG — one with notes sections between financial tables):

PASS criteria:
1. At least 3 units emitted (table + prose-notes + table minimum).
2. No prose page appears in a table unit's `page_numbers_json`.
3. Direct DB query (same pattern as Sentinel A) — NOT the viewer, NOT the balance badge.

**FORBIDDEN as sole gate:** balance badge, unit test pass count alone, viewer screenshot (per BCTC-TABLE-3 false-green lesson).

---

## 6. Risk Flags

**R-1 — `_fingerprints_continuous` signature change breaks existing test imports**

The existing `test_document_map.py` imports `_fingerprints_continuous` directly and calls it with two arguments. The new optional `stored_text_b=""` parameter is backward-compatible — existing tests will not break. Dev must verify: run existing test suite after adding the parameter; all existing tests must pass without modification.

**R-2 — Blank-page bridge edge case: blank at document start or end**

If the first page(s) are blank, `pending_blanks` accumulates before any `current_unit_pages` is open. The loop must guard: if `state == "NO_TABLE"` and pending_blanks is non-empty when a non-blank page arrives, discard pending_blanks (they are pre-document blanks, not bridge candidates). Dev must add this guard.

**R-3 — `_simulate_grouping` in existing tests replicates the old loop**

`TestFingerprintGroupingLogic._simulate_grouping` in `test_document_map.py` mirrors the OLD loop logic. After the fix, if dev updates `_simulate_grouping` to mirror the new loop, existing tests may need adjustment (tests C-1–C-7 above SUPERSEDE the old simulate_grouping tests for boundary cases). The old simulate_grouping tests for continuation behaviour (same-fingerprint, blank-bridge within same type) remain valid and must still pass.

**R-4 — `_is_title_band` false-positive on dense table pages**

If a table page has a short non-numeric OCR artifact in its top 8 lines (e.g., a column header like `"TM"` or `"CS"`), it could falsely fire D-5 and split a genuine continuation. Mitigation: the `_TITLE_BAND_MIN_LEN = 5` threshold filters single/dual-char artifacts. Dev should additionally require that a title-band candidate line contains at least one space (typical titles are multi-word). Add: `if len(stripped.split()) < 2: skip`. This reduces false-positive risk on short column header artifacts.

**R-5 — Re-extraction scheduling constraint (NFR-1)**

Sentinel re-extraction after the fix must NOT be scheduled during `02:00–08:59 UTC Mon–Fri`. Ops must schedule off-hours. Never call `run_bctc_batch_sweep`. Single-doc sequential only.

**R-6 — Container rebuild required**

After dev commits, ops must run `docker compose build pdf-extractor && docker compose up -d --no-deps --force-recreate pdf-extractor`. Restart relaunches the stale image (per feedback_rebuild_after_dev_change).

---

## 7. Files to Modify

| File | Change |
|---|---|
| `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` | (1) Replace `_flush_unit` majority-vote with schema-page type; (2) Rewrite `build_document_map` main loop as state machine with deferred blank buffer; (3) Add `stored_text_b: str = ""` param to `_fingerprints_continuous`; (4) Add D-5 check in `_fingerprints_continuous`; (5) Add `_is_title_band` helper; (6) Add Tier-0 constants for title-band |
| `apps/pdf-extractor/__tests__/unit/test_table_boundary_state_machine.py` | NEW — pure-function unit tests for all new predicates + DV-1/DV-2 |
| `apps/pdf-extractor/__tests__/unit/test_document_map.py` | Extend `_simulate_grouping` to pass `stored_text_b` to `_fingerprints_continuous`; add regression guard that prose pages are never in table units |

**NOT modified:**
- `apps/pdf-extractor/application/extract_layout_first_usecase.py` — no changes required
- `apps/pdf-extractor/infrastructure/text_table_extractor.py` — 0-byte-diff, not in scope
- `apps/pdf-extractor/PDF-Extract-Kit/` — PRISTINE

---

## 8. Brownfield Scan Notes

- **Current `_flush_unit` (L2641–L2658):** majority-vote logic is a self-contained closure; replacement is surgical (9 lines → 5 lines).
- **Current main loop (L2660–L2689):** 30 lines. The rewrite replaces this entire block. The outer structure (fingerprint pre-computation, doc_map assembly, logger.info) stays intact.
- **`_fingerprints_continuous` (L3000–L3049):** 50 lines, all pure geometric comparisons. The title-band check is a 2-line addition before `return True`.
- **`_extract_unit_hints` (L2926–L2951):** already extracts top-20-line non-numeric strings as metadata. `_is_title_band` reuses similar logic with different purpose (decision, not metadata) and must remain SEPARATE to preserve AC-0 metadata-only semantics of `unit_hints`.
- **No new imports required** in `generic_md_table_extractor.py` for the title-band detector — `re` and `_MONEY_GROUP_RE` are already imported and available.
- **`test_document_map.py` (L23–L30):** imports `_fingerprints_continuous` directly. New optional param is backward-compatible.
- **Existing test suite passes against the current code.** Dev must confirm all existing tests still pass after the change (regression gate).
