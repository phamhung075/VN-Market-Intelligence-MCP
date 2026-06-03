# Architecture Brief: LF-RETHINK — Tier-0 Fingerprint Structural Rethink

**Sprint:** BCTC-LAYOUT-FIRST  
**Task:** LF-RETHINK (SPIKE)  
**Date:** 2026-06-03  
**Author:** agents-architect  
**Status:** DELIVERED — impl task spec at §5

---

## 1. Context and Scope

LF-DEPLOY (QA cycle-189, commit 39bffdf5) returned CHANGES_REQUESTED on four blocking ACs:

- AC-LFE-1: FPT Q1 pages 3–6 must share one unit. DB shows page 3 in unit `eea7d237` with `page_type=prose`; pages 4–8 in unit `6277fa2a`. FAIL.
- AC-LFE-2: FPT Q1 page 5 must have `schema_inherited_from_page=3`. DB shows 4. FAIL.
- AC-LFE-3: FPT Q1 page 41 classified as `table` (in unit pages 37–44). Brief requires prose. FAIL.
- AC-LFE-11: Zero quarantined units across 14 docs. Quarantine path unexercised. FAIL.

Root of AC-LFE-1/2: `build_document_map()` (Tier 0, `generic_md_table_extractor.py`) assigns `page_type=prose` to FPT Q1 page 3. Since the grouping loop breaks unit on `page_type` mismatch (`if page_type == current_page_type`), page 3 becomes a standalone prose unit. The balance-sheet unit therefore starts at page 4 → `schema_page=4` → page 5 inherits from page 4 instead of page 3. The stitched liability DATA is correct (440 = 300 + 400). Defect is purely unit-grouping / boundary-detection.

This is the **seventh** defect in the same recurrence class across six commits: 06fb1f10, d297f3ba, 08644675, 95b24566, 7e6bff6a, 258f62fd. Each patch tuned one parameter without changing the underlying discriminator model. Per the recurring-bug-escalation policy, no further direct dev-pdf-extractor patch is dispatched until this brief ships.

---

## 2. Prior-Patch Archaeology — What Each Fix Tried and Why the Class Survived

| Commit | Fix | Why class survived |
|---|---|---|
| 258f62fd | `_detect_column_anchors_from_tokens`: fixed-px gap (80px) replaces w_med oracle for column anchor separation in the **table-reconstruction** path. | Tier-0 fingerprint path (`_compute_page_fingerprint_50dpi`) is an entirely separate code path. Not touched. |
| 7e6bff6a | MD-EXTRACT-9: label-row ordinal reconstruction for income-statement label fusion. | Again table-reconstruction (extraction). Tier-0 fingerprint unrelated. |
| 95b24566 | LF-FIX: dropped open gutters at ink-right; `_MIN_TEXT_COL_WIDTH_PX=80` (200 DPI) / `_MIN_TEXT_COL_WIDTH_PX_50DPI=20` (50 DPI); proved pages 3/4/5/6 produced consistent gutters at ~35/47/75% post-fix. | Fix assumed gutter geometry was the discriminator. It was not: `_compute_page_fingerprint_50dpi` computes `page_type` from **money-group density** (next patch), not from gutter presence. The gutter fix made the geometry consistent but `page_type` was still wired to gutter count at that moment. |
| 08644675 | LF-FIX2: `_GUTTER_DARK_FRACTION_50DPI` 0.40→0.15; `_MIN_TEXT_COL_WIDTH_PX_50DPI` 20→30; `_MAX_INTER_GUTTER_GAP_PX=60` (compound gutter merge); **switched `page_type` to money-group density** (drops gutter_count gate). `_GUTTER_DARK_FRACTION_50DPI` comment: "structural column separators contain faint ink at 50 DPI." | This is the critical patch that created the current defect. It replaced gutter-count-based `page_type` with money-group density `page_type`. That switch was correct for most pages — but it broke balance-sheet START pages (page 3 of FPT Q1) that have a full-width title/header section above the first data rows, leaving few or zero money-group tokens in the stored OCR text. |
| d297f3ba | BCTC-TABLE-BOUNDARY: 5-state page stitcher; `_is_title_band` D-5 guard; `_fingerprints_continuous` gains `stored_text_b` param. | The D-5 guard fires `return False` from `_fingerprints_continuous` when page B opens with a standalone title band. But the defect is now in `page_type` classification, not in `_fingerprints_continuous`. A page classified as `prose` never reaches `_fingerprints_continuous` — the grouping loop exits before calling it because `page_type != current_page_type`. |
| 06fb1f10 | BTB-DRIFT-DEV: converged two parallel grouping paths to one canonical SSOT (bctc_page_grouper.py → unit_grouper.py). | Consolidation only. The discriminator inside `_compute_page_fingerprint_50dpi` was not changed. The problem was already baked into the merged canonical path. |

**Summary of why the class survived:** Each fix either touched the extraction pipeline (not the fingerprint), tuned geometry constants, or converged structural paths — but none rethought what signal should drive `page_type`. The `page_type=money-group-density` discriminator introduced in 08644675 is the origin of the surviving defect class.

---

## 3. Root Cause Diagnosis

### 3.1 The Wrong Discriminator

`_compute_page_fingerprint_50dpi` classifies pages with this decision tree (lines ~2875–2880):

```
if stored_text empty → "blank"
elif money_group_count >= 3 → "table"
else → "prose"
```

A page is "table" purely if it has ≥ 3 money-group tokens (`\d{1,3}(?:[.,]\d{3})+`) in its pre-stored OCR text.

This is **correct** for nominal pages — a dense balance sheet or income statement has dozens of money-group tokens. But it produces false-negative (prose) classification for two distinct page shapes that appear in real BCTC documents:

**Shape A — Balance-unit START pages with a title or header block occupying the top half of the page.** FPT Q1 page 3 is the specimen: the balance-sheet section opens with a multi-line Vietnamese heading block (`BẢNG CÂN ĐỐI KẾ TOÁN HỢP NHẤT`), date lines, currency/unit declarations, and possibly a wide column-header row. These elements occupy 30–60% of the page height. The actual table data (rows with money-group values) starts in the lower half. If the stored OCR text for this page happens to have fewer than 3 money-group tokens in the header section — either because the header is text-only or because OCR was run at low quality on a scan — the page is classified as `prose` even though it IS the first page of a table unit.

**Shape B — Continuation pages with a single printed column.** AC-LFE-3 (page 41) shows the inverse: a page that has table-shaped number density but is being classified as `table` when it should be `prose`. This suggests the money-group density discriminator is unreliable in both directions.

### 3.2 Why Single-Column Detection at 50 DPI is the Wrong Discriminator for Unit-START Detection

The QA report notes "the 50-DPI projection-profile detects a single full-width column" on page 3. But as of commit 08644675, the gutter count is no longer used for `page_type`. The `gutter_x_positions` are computed but only stored in the fingerprint dict for `_fingerprints_continuous` (gutter position continuity check). The grouping loop fires a unit break earlier — at the `page_type != current_page_type` guard.

So the single-column detection observation in the QA report is **accurate but downstream of the real cause**: column detection doesn't decide `page_type`; money-group density does. The single-column detection causes a *secondary* failure if we ever relax the page_type guard — the fingerprint would also not match pages 4–8 (which have multiple gutters). But this second problem only matters if we fix the primary one.

### 3.3 Why Financial Statement START Pages Defeat Money-Group Density

On a balance-sheet START page the stored OCR text typically looks like:

```
BẢNG CÂN ĐỐI KẾ TOÁN HỢP NHẤT
Tại ngày 31 tháng 3 năm 2026
(Đơn vị: Triệu đồng)
Chỉ tiêu   Thuyết minh   31/03/2026   31/12/2025
A. TÀI SẢN NGẮN HẠN
  I. Tiền và các khoản tương đương tiền  111
```

The header lines contain no money-group tokens. The first actual value rows (with multi-digit money groups) may appear later in the page or only on subsequent pages. If the stored OCR text was paginated at extraction time and this page's text ends before the first data rows, `money_group_count = 0 → page_type = prose`.

Even when the page does contain some data rows at the bottom, the money-group count is 0–2 (a few cells from one data row visible at the cut), below the threshold of 3.

The **structural signal that should drive unit-start detection** is not "does this page contain money-group values" but rather "does this page open a new table section or continue an existing one." The actual boundary signal is the presence of a section-header declaration line (e.g. a line with a structured balance-sheet or income-statement title pattern) in the top N lines — exactly what `_is_title_band` detects — but `_is_title_band` is only evaluated inside `_fingerprints_continuous`, which is never reached when `page_type` mismatches.

### 3.4 The Quarantine Path Problem (AC-LFE-11)

Zero quarantined units across 14 docs means none of the three invariant checkers in `gate_unit()` (balance identity, codes monotonic, orphan rows) ever fire. The invariants are likely correct in threshold but receive inputs derived from a malformed unit (wrong pages grouped together, missing schema_page). If the Tier-0 grouping is wrong, the units passed to `gate_unit()` are incorrectly composed — the invariants are checking the wrong document slices. Fixing Tier-0 is a prerequisite; only then can quarantine thresholds be calibrated against real unit shapes.

---

## 4. Structural Fix: Multi-Signal Page Classifier

### 4.1 The Core Design

Replace the single `money_group_count >= 3` discriminator in `_compute_page_fingerprint_50dpi` with a **three-signal majority classifier**:

```
signal_A: money_group_count >= _TABLE_PAGE_MIN_MONEY_GROUPS  (existing, unchanged)
signal_B: account_code_count >= _ACCOUNT_CODE_MIN  (NEW)
signal_C: date_header_count >= 1  (NEW)

page_type = "table" if (signal_A OR signal_B OR signal_C)
```

**Signal B — account-code density.** Balance-sheet start pages contain 3-digit account code tokens (`100`, `200`, `300`, `111`, etc.) even when money-group values are absent. A page with ≥ K three-digit standalone codes (matching the existing `_CODE_LIKE_RE = re.compile(r"(?<!\d)\d{3}(?!\d)")`) is a financial-statement page. This re-uses the AC-0-compliant pattern that already exists in the file. Calibration: the same secondary gate already used in `_is_data_table()` requires `_MIN_CODE_HITS = 3` — the same threshold is appropriate here.

**Signal C — date-header presence.** Financial statement pages invariably contain at least one date token in `DD/MM/YYYY` format (`_DATE_HEADER_RE` pattern already exists in the file). A page with ≥ 1 date-header token is almost certainly a financial statement page, not a prose/cover page. This is the cheapest and most reliable signal for balance-unit start pages.

**Why this kills the recurrence class:** The failure mode is specifically a page that has date headers and account codes but few money-group values. Signal C alone would have reclassified FPT page 3 as `table`. Both signals are AC-0 compliant — they use existing generic patterns, no BCTC-specific string constants.

### 4.2 Secondary Fix: Relax the page_type Continuity Guard for Table→Table Transitions

The grouping loop in `build_document_map()` currently enforces:

```python
if page_type == current_page_type and page_type != "blank" and _fingerprints_continuous(...)
```

The `page_type` equality check is too strict: it breaks a unit when consecutive pages differ in type, even if the difference is a consequence of the discriminator noise (a page classified as `prose` inside a table unit due to sparse money-group density). 

**Proposed change:** For the specific case where `current_page_type == "table"` and the new page is `prose` (not blank), do not immediately break the unit. Instead, evaluate `_fingerprints_continuous` as a secondary check. If `_fingerprints_continuous` returns True (gutter positions match and row pitch is stable), treat the page as a continuation (its `page_type` metadata remains `prose` but it is placed in the current unit). If `_fingerprints_continuous` returns False, break the unit.

This change alone would have fixed the FPT page 3 scenario even without the Signal B/C fix, because the gutter geometry of page 3 should be consistent with pages 4–8 (the LF-FIX patches made this true). However it introduces a risk: a genuine prose page embedded between two table pages could be silently swallowed into the wrong unit. The Signal B/C fix (§4.1) is the safer primary fix. This secondary change should be behind a feature flag (`_ALLOW_PROSE_CONTINUATION: bool = True`) so it can be disabled if corpus testing reveals false-positives.

### 4.3 AC-LFE-3 Fix: Page 41 Classified as Table

AC-LFE-3 requires page 41 to be `prose`. Under the current money-group discriminator, if page 41 has ≥ 3 money-group tokens it is classified as `table`. The QA report notes it is in unit `af08a61a` (pages 37–44) with `page_type=table`. This is likely correct — pages 37–44 are the notes tables section, which does contain numerical tables. The brief's requirement that page 41 be prose may be incorrect as stated.

**Recommended action:** Before implementing any fix for AC-LFE-3, the impl owner must verify the actual content of FPT Q1 page 41 (rasterize at 200 DPI and inspect visually). If the page genuinely contains a notes table, AC-LFE-3 should be updated to `PASS` with a corrected requirement (page 41 IS a table — the brief's assumption was wrong). If the page is genuinely prose (narrative text, no financial table), then the discriminator fix in §4.1 should correctly reclassify it.

### 4.4 AC-LFE-11 Fix: Quarantine Path

After the Tier-0 grouping fix is applied and re-extraction is run on the 14-doc corpus, the quarantine path should be re-evaluated against real unit shapes. The likely root cause is that all units currently pass the invariants because:

1. Units are composed of pages that already passed the data-extraction pipeline (the structured path). Data that made it through extraction tends to be well-formed.
2. The balance/monotone/orphan thresholds may be calibrated for ideal inputs.

Recommended: add a **deliberate quarantine test** — a synthetic unit with a known invariant violation (e.g. balance_identity off by > 5%) — to prove the quarantine path is non-dead-code. This is a unit test, not a real-corpus change.

---

## 5. Owner-Split and Implementation Spec

### Owner: dev-pdf-extractor

**File:** `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py`  
**Guiding principle:** ZERO new BCTC-specific string constants. All new patterns must be AC-0 compliant (generic financial patterns). No BCTC keyword strings in branching logic.

#### Task LF-IMPL-1: Signal B and Signal C in `_compute_page_fingerprint_50dpi`

1. Add constant `_ACCOUNT_CODE_MIN_FOR_TABLE: int = 3` (AC-0: reuse `_CODE_LIKE_RE` pattern, generic 3-digit codes).
2. Add constant `_DATE_HEADER_MIN_FOR_TABLE: int = 1` (AC-0: reuse `_DATE_HEADER_RE` pattern, generic DD/MM/YYYY).
3. In `_compute_page_fingerprint_50dpi`, after computing `money_group_count`, add:
   - `account_code_count = len(_CODE_LIKE_RE.findall(stored_text or ""))`
   - `date_header_count = len(_DATE_HEADER_RE.findall(stored_text or ""))`
4. Update the `page_type` assignment:
   - `signal_A = money_group_count >= _TABLE_PAGE_MIN_MONEY_GROUPS`
   - `signal_B = account_code_count >= _ACCOUNT_CODE_MIN_FOR_TABLE`
   - `signal_C = date_header_count >= _DATE_HEADER_MIN_FOR_TABLE`
   - `page_type = "table" if (signal_A or signal_B or signal_C) else "prose"` (blank check unchanged)
5. Log the signal values at DEBUG level for diagnostics.

#### Task LF-IMPL-2: Relaxed Continuity Guard in `build_document_map`

1. Add constant `_ALLOW_PROSE_IN_TABLE_UNIT: bool = True`.
2. In the grouping loop, replace the strict `page_type == current_page_type` condition with:
   ```python
   same_type = (page_type == current_page_type)
   prose_in_table_unit = (
       _ALLOW_PROSE_IN_TABLE_UNIT
       and current_page_type == "table"
       and page_type == "prose"
   )
   if (
       prev_fp is not None
       and page_type != "blank"
       and (same_type or prose_in_table_unit)
       and _fingerprints_continuous(prev_fp, fp, stored_text_b=stored_text)
   ):
   ```
3. When a `prose_in_table_unit` continuation is accepted, log at INFO: `"build_document_map: page %d classified prose, accepted as continuation of table unit %s (gutter-geometry continuous)"`.

#### Task LF-IMPL-3: Quarantine Proof Test

1. In `test_layout_invariants.py`, add a test class `TestQuarantineNonDeadCode` with one test:
   - Construct a synthetic unit with `balance_identity_error = 0.10` (10% balance mismatch).
   - Call `gate_unit()`.
   - Assert `result["quarantined"] == True`.
   - This test is a PROVEN-RED (must fail before the fix if quarantine is broken) / PROVEN-GREEN after.
2. If quarantine is currently dead-code (test fails), fix the threshold or the invariant evaluation path in `extract_layout_first_usecase.py` `gate_unit()` as a separate sub-task.

#### Task LF-IMPL-4: AC-LFE-3 Content Verification

Before any fix for AC-LFE-3:
1. Rasterize FPT Q1 2026 PDF page 41 at 200 DPI.
2. Visually inspect: is it a prose narrative page or a financial table page?
3. If prose: the Signal B/C fix in LF-IMPL-1 should reclassify it. Verify after LF-IMPL-1 is applied.
4. If table: update the acceptance criterion in the LF-DEPLOY brief/task to reflect the correct content (`page 41 is legitimately a table — PASS`). No code change needed.

### Test Corpus

- Primary: FPT Q1 2026 (report_id `e8ea3df5-3f32-413d-a3eb-c71634c0438d`). Pages 3, 5, 41 are the three failing fixtures.
- Breadth: the full 14-doc corpus already in `bctc_layout_units` (14 distinct `report_id` values). After applying LF-IMPL-1/2, re-run `extract_layout_first_usecase` on all 14 docs and verify `COUNT(DISTINCT report_id) = 14` with zero regressions on units that were already correct.
- AC-LFE-5/LFO-7 (corpus breadth 18 docs): deferred — these were already OPEN in the QA report.

### Implementation Order

```
LF-IMPL-1 (Signal B/C) → LF-IMPL-2 (relaxed guard) → LF-IMPL-3 (quarantine proof) → LF-IMPL-4 (page-41 inspect)
→ re-extract FPT Q1 → verify AC-LFE-1/2 in DB → verify AC-LFE-3 → verify AC-LFE-11
→ LF-DEPLOY re-gate
```

LF-IMPL-1 and LF-IMPL-2 are independent and can be implemented in a single pass. LF-IMPL-3 is independent of both. LF-IMPL-4 is a prerequisite for deciding whether AC-LFE-3 needs a code fix.

---

## 6. Acceptance Criteria Mapping

| AC | How this brief's fix addresses it |
|---|---|
| AC-LFE-1 (pages 3–6 same unit) | LF-IMPL-1 (Signal C: date-header on page 3 → `page_type=table`) + LF-IMPL-2 (prose-in-table-unit tolerance if signal fails) → pages 3–8 grouped into one unit. |
| AC-LFE-2 (`schema_inherited_from_page=3` for page 5) | Follows automatically from AC-LFE-1: when page 3 is in the same unit as pages 4–8 and is the first page of that unit, it becomes `schema_page=3`. Page 5 inherits from page 3. |
| AC-LFE-3 (page 41 prose or blank) | LF-IMPL-4 content verification first. If page 41 is genuinely prose → LF-IMPL-1 may reclassify if it lacks date headers and account codes. If it is a table → update AC. |
| AC-LFE-11 (quarantined unit count > 0) | LF-IMPL-3 proves quarantine is non-dead-code. If gate_unit threshold needs calibration, that sub-task is owned by dev-pdf-extractor against `extract_layout_first_usecase.py`. |

---

## 7. What This Does NOT Change

- `_fingerprints_continuous` logic is unchanged.
- `_is_title_band` (D-5) is unchanged.
- `zone_page` (Tier 1) is unchanged.
- `ocr_unit` (Tier 2) is unchanged.
- `text_table_extractor.py` is unchanged (0-byte-diff required for structured-path non-regression).
- No new BCTC semantic string constants in any branching path.
- `_process_page` (MD-EXTRACT-6/9 table extraction path) is unchanged.

---

## 8. Impl Task Signal

The following task spec is ready for PO to scope and dev-pdf-extractor to implement next cycle:

```
Task: LF-DEPLOY-IMPL
Sprint: BCTC-LAYOUT-FIRST
Owner: dev-pdf-extractor
Depends: LF-RETHINK (this brief)
Type: SPRINT-S
Zone: apps/pdf-extractor/

Subtasks:
  LF-IMPL-1: Multi-signal page classifier (Signal B + C) in _compute_page_fingerprint_50dpi
  LF-IMPL-2: Relaxed continuity guard (prose-in-table-unit tolerance) in build_document_map
  LF-IMPL-3: Quarantine proof test (PROVEN-RED/GREEN) in test_layout_invariants.py
  LF-IMPL-4: FPT page 41 content inspection + AC-LFE-3 disposition

DoD:
  - DB: pages 3,4,5,6 in same unit_id (AC-LFE-1)
  - DB: schema_inherited_from_page=3 for page 5 (AC-LFE-2)
  - AC-LFE-3: PASS (either reclassified or AC updated with evidence)
  - AC-LFE-11: PASS (quarantine test green)
  - 0-byte-diff on text_table_extractor.py
  - All existing unit tests pass (no regression)
  - Re-extraction of 14-doc corpus: same unit counts, no regressions

Files:
  - apps/pdf-extractor/infrastructure/generic_md_table_extractor.py
  - apps/pdf-extractor/application/extract_layout_first_usecase.py (if quarantine fix needed)
  - apps/pdf-extractor/__tests__/unit/test_layout_invariants.py
  - apps/pdf-extractor/__tests__/unit/test_document_map.py (new Signal B/C test cases)
```

---

## 9. Signal to agent-father / dev-team Dispatch

Signal file: `docs/signals/lf-rethink-brief-20260603T052148Z.json`

Content: brief complete; LF-DEPLOY-IMPL task spec ready for PO triage → dev-pdf-extractor dispatch next cycle. No code changes required from agent-father. Task scope is dev-pdf-extractor only (`apps/pdf-extractor/` zone). PO to add `LF-DEPLOY-IMPL` task to `BCTC-LAYOUT-FIRST` sprint in orch-state next cron tick.
