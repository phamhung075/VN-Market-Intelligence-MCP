# PO Handoff → BA: FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT-GENERALIZE

**From:** po · **To:** ba (cascade: ba → architect → pm → dev-pdf-extractor)
**Date:** 2026-06-28
**Type:** SPRINT-M · **Zone:** `apps/pdf-extractor/` (single zone — dev-pdf-extractor sole committer)
**Origin:** User BUG report — "BCTC table/column extraction only works correctly with FPT documents; for all other tickers the table + column extraction does NOT work correctly."

---

## Problem statement (user-facing)

BCTC table + column extraction produces correct code→label→period-value mapping for FPT
statements but is wrong (mis-mapped columns and/or dropped rows) for every other issuer.

## Root cause (PO-validated at code level — confirm + deepen in BA/architect on REAL docs)

The line/column-split layer in `apps/pdf-extractor/infrastructure/text_table_extractor.py`
is **overfit to FPT's OCR rendering**. The splitting regexes were built from, and commented
with, FPT's specific page layouts:

- `_CODE_VALUE_COL_RE` (~L554) — comment: "FPT pages 4-5 render codes in a separate OCR column"; example strings are FPT's actual rows.
- `_CODE_ROW_SINGLE_SPACE_RE` (~L588) — comment: "FPT page 7 layout"; built from FPT equity/CF lines.
- `_parse_three_block_layout()` / "Mã số" three-block detection — tuned to FPT's OCR block split.
- Value-token splitter (`_split_value_*`) — assumes FPT's right-aligned 2+-space column geometry.
- The entire `BT3-FIX-2/3/4/5` change history is FPT-driven; FPT page-7/8/9 patterns are baked into test fixtures (`__tests__/test_pek_engine_adapter.py`, `test_b02_tctd_parser.py`, `test_layout_invariants.py`).

"Works for exactly one issuer, fails for all others" = non-generalized parser. The fix must
**generalize column/table detection across issuers** (coordinate/gutter-based or
layout-adaptive column resolution), **NOT add per-ticker special-cases**.

## Standing knowledge to honor

- **Contract-from-live-payload, not schema-comment** — BA/architect must probe REAL non-FPT
  extracted rows (`bctc_table_rows` / `GET /api/bctc-eval/{report_id}`) to characterize HOW each
  issuer is wrong before designing. Do not design off the FPT-shaped fixtures.
- **Bank-aware BCTC** — bank (B02-TCTD) and non-bank statement layouts genuinely differ;
  both layout families must be handled. A bank MUST be in the acceptance set.
- **bctc-gate-vision is escalation-only**, not a blanket fallback — generalize the deterministic
  parser; do not paper over with vision-on-everything.
- **Table sprint false-green reopen** (`project_bctc_table_sprint`) — verify this is not a
  regression of prior table work; check whether earlier "done" was FPT-only green.

## Acceptance criteria (PO — non-negotiable)

Correct table/column extraction (code → label → per-period value mapping) verified on
**MULTIPLE distinct issuers**, against REAL extracted rows (live `bctc_table_rows` /
`bctc-eval`), not synthetic fixtures only:

1. **Bank:** VCB — B02-TCTD bank layout. Column mapping correct, no dropped/blank-label rows.
2. **Non-bank non-FPT industrial:** HPG (steel) — and at least one more non-bank if a second
   issuer's real BCTC is available (e.g. VNM). Column mapping correct.
3. **FPT non-regression:** all existing FPT golden tests + eval gates stay GREEN.
4. Per-issuer eval gates pass — e.g. `value_blank_label_max = 0`, and the named
   `gate_failures` detector gates from `GET /api/bctc-eval/{report_id}` for each test report
   become regression-set acceptance criteria (list them explicitly before coding).
5. pdf-extractor sandbox runner GREEN both tiers (G12, blocking):
   `python sandbox_runner.py --tier=primitive --scenario=all` and `--tier=module --scenario=all`.
6. Generalization proof: the fix path must be layout-adaptive, not a new `if issuer == ...`
   branch. Architect design must state the generalization mechanism explicitly.

## Cascade

ba (decompose + lock per-issuer acceptance from live eval gates) → po (spec review) →
architect (design generalized column/table detection) → pm (decompose into pdf-extractor
tasks) → dev-pdf-extractor (implement; pytest + sandbox G12; RAW-verify on real docs).

---

## BA Spec — FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT

**BA task ID:** BA-FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT
**Date:** 2026-06-28
**Status:** COMPLETE → NEXT: architect

---

### Section 1 — Live data probe results (contract-from-live-payload)

Probed live `bctc_table_rows` from `market.db` named volume for VCB 2026Q1, HPG 2025Q4, VNM 2025Q4, and FPT 2025Q4 (non-regression anchor). Eval results from `bctc_eval_results`. OCR text source from `pdf_extracted_text`.

#### 1.1 FPT 2025Q4 — non-regression anchor

`report_id: e71f845d` | 127 rows | sections: general(88) + income_statement(23) + cash_flow(34) (interleaved by row_order across pages)

Eval: Stage 1-3 yellow, Stage 4 **RED** (exact_dup_count=1), Stage 5 **RED** (roundtrip_row_match_ratio=0), Stage 6 **GREEN** (structured extract passes).

**Finding**: FPT already fails Stage 4 pre-fix (1 same-section duplicate). Non-regression anchor for this sprint = **Stage 6 GREEN** (structured extract), NOT Stage 4 GREEN. See Blocker B2.

#### 1.2 VCB 2026Q1 — primary bank (B02-TCTD) target

`report_id: 31f2a9a9` | 55 rows | all in `statement_section='balance_sheet'` | eval: NOT YET COMPUTED (no rows in `bctc_eval_results` for this report)

**Concrete failure modes:**

| ID | Failure | Live evidence | Overfit site |
|---|---|---|---|
| FM-VCB-1 | Section-boundary failure: income-statement and off-balance-sheet items land in `balance_sheet` | code='I' label='Thu nhập lãi thuần' in balance_sheet; code='VI' label='Lãi thuần từ hoạt động khác'; off-balance-sheet "Bảo lãnh vay vốn" rows | No section-transition detector in `_parse_page_lines()`; all pages passed under single section label |
| FM-VCB-2 | Thuyết minh note refs contaminate labels (trailing position) | label='Chứng khoán kinh doanh 4', label='Cho vay khach hang 5', label='Dự phòng rủi ro cho vay khách hàng 6' | `_CODE_ROW_SINGLE_SPACE_RE` Layout 4 strips note refs in CODE position only; trailing-label position not stripped |
| FM-VCB-3 | Roman numeral OCR misread → wrong code assignment | code='10', label='u Tiền gửi và vay các tô chức tín dụng khác' (leading 'u' is OCR residue of 'III'); code='12' with label='VI Phát hành giấy tờ có giá' (Roman numeral in label instead of code) | `_ROMAN_CODE_RE` requires exact Roman tokens; OCR 'Il' for 'II', 'Ill' for 'III' not matched → falls to Layout 3 `_CODE_VALUE_COL_RE` which captures note-ref number as code |
| FM-VCB-4 | Catastrophic value parsing of inline double-parenthetical | label='Chi phí hoạt động dịch vụ (1.992.671) (1.921.556)' → value_current=-1.992671 (stored -1.99 instead of -1,992,671) | `_parse_value_cells()` / `_coerce_ocr_number()` treats VN dot-thousands as decimal inside parens |
| FM-VCB-5 | Missing rows for Roman sections II and III | Sections I→IV skipped (no row with code='II' or code='III' in output) | OCR renders 'II'→'Il', 'III'→'Ill'; Layout 6 `_ROMAN_CODE_RE` does not normalize; lines fall through all layouts → silently dropped by Ruling A |
| FM-VCB-6 | Code 'VI' collision: 3 distinct assets items share code 'VI' in same section | code='VI' for Cho vay khách hàng, Chứng khoán đầu tư, Góp vốn — all in 'balance_sheet' | OCR misread: 'VII'→'VI', 'VIII'→'VI'; without section sub-grouping (assets vs liabilities), duplicates appear same-section |
| FM-VCB-7 | Notes-section items (codes 26, 27, 8) absorbed as balance-sheet rows | code='26' label='6 Lãi cho vay và phí phải thu', code='27' label='7 Nợ khó đòi đã xử lý' — note item numbers read as 2-digit codes | No notes-section boundary guard; numbered note items (26., 27.) pass `_find_code_in_line()` scan |

**Stage 4 prediction post-fix** (gates to pass): exact_dup_count=0, value_blank_label_count=0, label_coverage≥0.90, code_coverage≥0.80.

#### 1.3 HPG 2025Q4 — primary non-bank non-FPT target

`report_id: 918a7abd` | 85 rows | sections: general(57) + cash_flow(28) | NO income_statement section

Eval: Stage 4 **RED** (exact_dup_count=2), Stage 5 yellow, Stage 6 yellow.

**Concrete failure modes:**

| ID | Failure | Live evidence | Overfit site |
|---|---|---|---|
| FM-HPG-1 | Income statement (P&L) completely absent | 0 income_statement rows; HPG has revenue/profit as a B01-DN corporate | Page-range or section-routing logic in calling pipeline does not identify income-statement pages for HPG; OR pages produce 0 rows (code format on HPG P&L pages differs from what Layout 1-5 handles) |
| FM-HPG-2 | Exact duplicate rows — Stage 4 RED | code='140' label='Hàng tồn kho' value=1,986,588,655 appears twice; code='400' label='Vốn chủ sở hữu' value=94,430,926,468,210 appears twice | Same-section same-page summary rows extracted from both a cover-page summary and the detail page (or from two pages in different statement pages that both show these codes); `_parse_lines_to_rows()` dedup guard (BT3-FIX-3 R3) warns but does NOT drop |
| FM-HPG-3 | Missing income statement rows | Same as FM-HPG-1 | Pipeline-level section routing issue |

**Stage 4 target post-fix**: exact_dup_count=0, value_blank_label_count=0.

#### 1.4 VNM 2025Q4 — secondary non-bank target

`report_id: 4316f6d1` | 94 rows | sections: balance_sheet(46) + income_statement(22) + cash_flow(26) | Sections interleaved by row_order (same pattern as FPT)

Eval: Stage 4 **RED** (exact_dup_count=2). Stage 6 yellow.

**FM-VNM-1**: 2 same-section duplicate rows. Pattern matches HPG (summary codes appearing on multiple pages). Stage 4 must be GREEN after fix.

#### 1.5 Complete-0-row failures — SEPARATE CLASS (not column-split)

MWG 2025Q4 (0 rows), VHM 2026Q1 (0 rows), HPG 2026Q1 (0 rows), VNM 2026Q1 (0 rows): all have `text_status=COMPLETE` but `refine_status=PENDING` and `bctc_layout_units=0`. These are **pipeline-level failures** (table assembly step not triggered), NOT TextTableExtractor bugs. See Blocker B1.

---

### Section 2 — Requirements (DDD layer mapping)

#### FR-1: Layout-adaptive column-boundary detection — DDD: infrastructure/text_table_extractor.py

Current state: Layouts 1-5 for B01-DN and Layouts 6-7 for B02-TCTD are hard-coded to spatial patterns from FPT pages 4-5/7.

Required behavior: The column-split layer must detect column geometry PER PAGE from structural signals in the OCR text (token positions, whitespace distribution), not from patterns calibrated to one issuer.

Specifically for Layout 3 (`_CODE_VALUE_COL_RE` "code-only column"): the false-positive where a Thuyết minh note-ref number (e.g., the '10' in "Il 10 198.629.540") is captured as the BCTC code must be eliminated. The constraint is: a number matched as a code in Layout 3 must be ≥100 (BCTC structural code range) OR be a known Roman numeral. 1-2 digit numbers without prior Roman-context on the line must be rejected as note refs.

Non-regression: Layout 3 must continue to correctly parse FPT's "270 88.089.621.779.862" (code=270, label='', value=88,089,621,779,862).

#### FR-2: Trailing note-reference number stripping from label — DDD: infrastructure/text_table_extractor.py

Current state: The optional note-ref pattern `(?:\d{1,3}\s+)?` in Layout 4 (`_CODE_ROW_SINGLE_SPACE_RE`) strips note refs that appear BETWEEN the code and the first value. Note refs that appear at the END of the label text (before the value separator) are NOT stripped.

Required behavior: After parsing `(code, label, values_rest)` from any layout, if `label` ends with a trailing 1-3 digit integer preceded by whitespace (e.g., "Chứng khoán kinh doanh 4"), that trailing integer must be stripped to produce clean label "Chứng khoán kinh doanh".

Guard: only strip if the trailing integer is 1-3 digits AND the remaining label after stripping is ≥5 characters (prevent stripping valid label-ending digits, e.g., "Quỹ phát triển khoa học 2025").

DDD layer: pure text processing on the (code, label, values_rest) tuple — can live in `_parse_lines_to_rows` as a post-parse label-clean step.

#### FR-3: Roman numeral OCR misread normalization — DDD: infrastructure/text_table_extractor.py

Current state: `_ROMAN_CODE_RE` matches exact Roman tokens I, II, III, IV, V, VI, VII, VIII, IX, X, XI, XII, XIII. OCR frequently renders these as mixed-case variants ('Il' for 'II', 'Ill' for 'III', 'IIl' for 'III', 'lV' for 'IV').

Required behavior: Before `_ROMAN_CODE_RE.match()`, apply a normalization table that maps common OCR misread forms to canonical Roman numerals:
- 'Il' → 'II', 'Ill' → 'III', 'IIl' → 'III', 'lV' → 'IV', 'VlI' → 'VII', 'VIl' → 'VII', 'VIll' → 'VIII', 'VlII' → 'VIII'
- After normalization, the canonical form is used as the `code` value stored in the row.

Non-regression: Must not normalize 'I' in positions where it is not a standalone Roman numeral (e.g., 'I.' section header, or 'I' embedded in a Vietnamese word). The anchored `^` in `_ROMAN_CODE_RE` and the existing false-positive guards (period check, VN number guard) remain.

#### FR-4: Section-boundary content-signal detection — DDD: application/extract_layout_first_usecase.py (pipeline caller)

Current state: `TextTableExtractor.assemble()` receives `statement_section` as a caller-supplied parameter. For B02-TCTD (VCB), the pipeline supplies ALL pages under 'balance_sheet' because the PEK engine did not provide income-statement page ranges. For HPG, the income-statement pages are not routed to the extractor.

Required behavior: The calling pipeline must detect section boundaries from page content signals BEFORE calling `assemble()`. Detection is diacritic-insensitive:
- Income statement start: line containing "báo cáo kết quả hoạt động kinh doanh" or "kết quả hoạt động sản xuất kinh doanh" or "báo cáo thu nhập"
- Cash flow start: "lưu chuyển tiền tệ"
- Balance sheet start: "bảng cân đối kế toán" or "báo cáo tình hình tài chính"

This function must live in the application/use-case layer, NOT inside TextTableExtractor (which is infrastructure-pure). It must not branch on issuer identity — it reads page text content.

Note: For B02-TCTD bank forms, the income statement section is titled "báo cáo kết quả hoạt động kinh doanh" (same keyword). The content-signal detection naturally handles both form types without branching.

#### FR-5: Duplicate row prevention for multi-page summary codes — DDD: infrastructure/text_table_extractor.py

Current state: The `_seen_codes` dict in `_parse_lines_to_rows()` logs a WARNING for duplicate codes but emits the row anyway (BT3-FIX-3 R3 "never silently drop"). This results in same-section (code, value_current) duplicates at Stage 4.

Required behavior: When `_seen_codes[code] > 1` AND the (code, value_current) pair is identical to the first occurrence, mark the row as `is_duplicate=True` and do NOT emit it to the output list. Log at WARNING level with full provenance. If the value_current DIFFERS (OCR variant), emit both and log.

Guard: De-duplication must only apply WITHIN a single `assemble()` call (one page range, one statement section). Cross-section duplicates remain valid — Stage 4 cross_section_dup logic already handles them.

This fix resolves FM-HPG-2 (Hàng tồn kho, Vốn chủ sở hữu appearing twice) and FM-VNM-1.

#### FR-6: Parenthetical multi-column value parsing robustness — DDD: domain/primitives/vn_number_normalize

Current state: "Chi phí hoạt động dịch vụ (1.992.671) (1.921.556)" is parsed as value_current=-1.992671. The VN dot-thousands separator (1.992.671 = 1,992,671) is not recognized inside parenthetical brackets during `_parse_value_cells()` splitting.

Required behavior: `vn_number_normalize` must correctly parse parenthetical VN numbers where dots are thousands separators: "(1.992.671)" → -1992671. The distinguishing rule: if the number inside parens has 2+ dot-groups each of exactly 3 digits, it is VN-dot-thousands format.

Current behavior for FPT: FPT's parenthetical values like "(586.166.744.274)" → -586166744274 (correct). The failure is specifically for numbers with ≤4 total digits that look like decimals ("(1.992.671)" could be misread as -1.992671). The fix must standardize the parsing to always treat dot-groups of 3 digits as thousands separators within parens.

#### FR-7: B02-TCTD notes-section boundary hard stop — DDD: infrastructure/text_table_extractor.py

Current state: After the balance sheet body, B02-TCTD documents include a numbered notes section ("Thuyết minh") with items numbered 26, 27, 28, etc. These pass Layout 5 scan-and-extract (`_find_code_in_line()`) and appear as balance-sheet rows with codes "26", "27".

Required behavior: `_parse_lines_to_rows()` must detect the entry into the Thuyết minh notes body (a line containing only a standalone number ≥15, which is the note item number format, or a line containing "Ghi chú" / "Thuyết minh" as a standalone header followed by numbered sub-items) and halt further code-row extraction for that page.

Note: The `_JUNK_SKIP_KEYS` already includes "mã số" and "mẫu số". The notes hard-stop is a new gate. Non-regression: normal `_NORM_THUY` detection in `_parse_three_block_layout()` already handles this for three-block pages.

---

### Section 3 — Non-functional requirements

| ID | Requirement | DDD layer |
|---|---|---|
| NFR-1 | NO per-issuer/per-ticker branches in any fix. Detection is purely structural (code format, content signals, spatial geometry). | All layers |
| NFR-2 | Sandbox G12 green both tiers: `python sandbox/runner.py --tier=primitive --scenario=all` AND `--tier=module --scenario=all` | CI gate |
| NFR-3 | FPT 2025Q4 Stage 6 stays GREEN (structured extract). Stage 4 status for FPT is pre-existing RED — see Blocker B2. | eval gate |
| NFR-4 | Architect must explicitly state the generalization mechanism (no new `if issuer == 'X'` patterns). | design constraint |

---

### Section 4 — Per-issuer acceptance gates (locked from live eval framework)

The following gates are locked from `bctc-eval-thresholds.json` Stage 4 settings and apply to each test report after the fix is deployed:

```
Stage 4 — TABLE_RECONSTRUCT gates (for EACH acceptance report):
  label_coverage      ≥ 0.90   (fraction of rows with non-null/non-empty label)
  code_coverage       ≥ 0.80   (fraction of rows with non-null/non-empty code)
  exact_dup_count    == 0      (zero same-section (label, value_current) duplicates)
  value_blank_label  == 0      (zero rows where value_current set but label null/empty)
```

**Acceptance target reports:**

| Ticker | Report ID | Form | Period | Pre-fix Stage 4 | Required post-fix |
|---|---|---|---|---|---|
| VCB | 31f2a9a9 | B02-TCTD | 2026Q1 | NOT COMPUTED | Stage 4 GREEN |
| HPG | 918a7abd | B01-DN | 2025Q4 | RED (dup=2) | Stage 4 GREEN |
| VNM | 4316f6d1 | B01-DN | 2025Q4 | RED (dup=2) | Stage 4 GREEN |
| FPT | e71f845d | B01-DN | 2025Q4 | RED (dup=1) | Stage 6 GREEN (Stage 4 pre-existing RED is out of this sprint scope per Blocker B2) |

Additional VCB-specific acceptance criteria (beyond Stage 4 gate):
- VCB balance-sheet section: all Roman numeral section codes I through X present with correct labels
- VCB income-statement rows classified in `statement_section='income_statement'` (not 'balance_sheet')
- VCB labels free of trailing note-ref numbers (regex check: no label ends with `\s+\d{1,3}$`)

---

### Section 5 — Edge cases

| ID | Edge case | Constraint |
|---|---|---|
| EC-1 | Roman 'I' as first letter of Vietnamese word | Layout 6 anchored at `^`, and requires VN number guard — no change needed |
| EC-2 | Corporate B01-DN sub-section headers "I. Tiền và các khoản..." (WITH period) | Period guard in `_try_parse_roman_code_row()` already rejects these — must not be broken by FR-3 normalization |
| EC-3 | VCB/B02-TCTD off-balance-sheet section (Cam kết ngoại bảng) uses same Roman scheme | FR-4 section detection must map these pages to a distinct section or exclude from balance_sheet |
| EC-4 | HPG P&L pages with 2-digit codes (01, 02, 10, 11) that might be on the same page as balance-sheet codes | Section-boundary detection (FR-4) must separate by PAGE, not by code range |
| EC-5 | Thuyết minh notes section uses standalone numbers (26., 27.) as note item headers — must not match Layout 5/7 | FR-7 notes-section hard stop |
| EC-6 | Same (code, value_current) pair valid across DIFFERENT statement sections | FR-5 dedup scoped to within one `assemble()` call; cross-section dups remain valid |
| EC-7 | `vn_number_normalize` change to parenthetical parsing (FR-6) must not break FPT's existing "(586.166.744.274)" format | Dot-groups of 3 digits = thousands rule is backward-compatible |

---

### Section 6 — Blockers (PO must resolve before architect can finalize design)

| ID | Blocker | Impact | PO action needed |
|---|---|---|---|
| B1 | 0-row failures for HPG 2026Q1, VNM 2026Q1, MWG 2025Q4, VHM 2026Q1 are PIPELINE gaps (`refine_status=PENDING`, `bctc_layout_units=0`), NOT column-split bugs | These cannot serve as acceptance test targets | Confirm HPG 2025Q4 + VNM 2025Q4 as the primary non-bank acceptance targets; confirm 0-row reports are tracked separately (HPG-REPARSE-POST-REBUILD backlog task) |
| B2 | FPT 2025Q4 already fails Stage 4 (exact_dup_count=1) before any fix | "FPT non-regression" criterion is ambiguous | PO must clarify: non-regression = Stage 6 GREEN (current state: yes) OR Stage 4 GREEN (current state: no). BA recommends Stage 6 as the non-regression gate; Stage 4 FPT fix is a separate scope item |
| B3 | Eval gates NOT yet computed for VCB 2026Q1 | Cannot confirm pre-fix Stage 4 state for VCB | Confirm `GET /api/bctc-eval/{report_id}` can be triggered on-demand for VCB 31f2a9a9 after the fix; OR confirm the eval runs automatically on re-extraction |
| B4 | FACTORY-DOMAIN-extract-bctc-parsing-lib (backlog) overlaps with generalization effort | Risk of parallel conflicting refactors | PO must decide: absorb into this sprint OR block this sprint on FACTORY-DOMAIN completion |
| B5 | FR-4 (section-boundary detection) requires changes in application layer, not just infrastructure | Scope may be larger than "column-split" alone | Architect must confirm whether FR-4 is in scope or is a separate sprint. BA flags this as load-bearing for VCB acceptance |

---

### Section 7 — Decision journal

**Task ID:** BA-FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT

what-considered:
- "(A) VCB 2026Q1 as sole bank test target — ACCEPTED (3 reports in DB, newest has complete OCR text in pdf_extracted_text 241 pages/4 files)."
- "(B) HPG 2026Q1 as non-bank test target — REJECTED: 0 rows, refine_status=PENDING; HPG 2025Q4 chosen instead (85 rows, Stage 4 RED, real extraction available)."
- "(C) Define non-regression as Stage 4 GREEN for FPT — REJECTED: FPT already RED pre-fix; recommend Stage 6 GREEN as non-regression anchor."
- "(D) Include FR-4 section-boundary detection in this sprint — RECOMMENDED (VCB income-stmt items currently in balance_sheet section is the worst failure; without FR-4, VCB acceptance cannot pass). Flagged as Blocker B5 for architect confirmation on scope."
- "(E) Scope duplicate-row fix (FR-5) to this sprint — ACCEPTED: exact_dup_count=0 is a PO non-negotiable gate; HPG and VNM both currently fail it."

why-change: "live data probe revealed FM-VCB-1 (section failure) is as severe as the column-split issues; treating it as out-of-scope would leave VCB acceptance impossible. BA recommends FR-4 be in sprint scope, with architect confirming placement."

---

## PO RESOLUTION (2026-06-28) — Blockers B1-B5 decided. Cascade → architect.

BA spec ACCEPTED. All 5 blockers resolved below. Targets, gates, and scope are now LOCKED.
Architect: design FR-1..FR-7, state the generalization mechanism explicitly (NFR-4), honor scope boundary below.

### B1 — Acceptance targets: CONFIRMED. 0-row class OUT of scope.
- LOCKED acceptance reports: **VCB 2026Q1 (31f2a9a9, bank B02-TCTD)** + **HPG 2025Q4 (918a7abd, non-bank B01-DN)** + **VNM 2025Q4 (4316f6d1, non-bank B01-DN)** + **FPT 2025Q4 (e71f845d, non-regression)**.
- The 0-row failures (HPG 2026Q1, VNM 2026Q1, MWG 2025Q4, VHM 2026Q1: `refine_status=PENDING`, `bctc_layout_units=0`) are a DISTINCT failure class (pipeline table-assembly not triggered), NOT TextTableExtractor column-split bugs. They are **OUT of this sprint** and ALREADY TRACKED on the board by `HPG-REPARSE-POST-REBUILD` (TODO, apps/mcp-server/) + the root `FIX-PENDING-REFINE-OUTPUT-235K-OVERFLOW` (BACKLOG). Do not conflate. No new tracking task needed.

### B2 — FPT non-regression = Stage 6 GREEN. CONFIRMED.
- FPT 2025Q4 already fails Stage 4 (exact_dup_count=1) PRE-FIX, so Stage 4 GREEN cannot be the non-regression bar.
- **Non-regression gate (HARD): FPT 2025Q4 Stage 6 stays GREEN** (structured extract). PLUS FPT Stage 4 dup count **must not increase above its pre-fix value (1)** — no new regressions introduced.
- FR-5 (same-section identical (code,value) dedup) MAY incidentally drop FPT's Stage 4 dup to 0 — if so, capture it as a bonus, but it is NOT a gate. The residual FPT Stage 4 dup is a SEPARATE pre-existing defect, tracked as follow-up `FU-FPT-2025Q4-STAGE4-DUP` (minted to backlog, OUT of this sprint).

### B3 — VCB eval measurable on-demand. CONFIRMED (real mechanism verified).
- Endpoint exists: **`POST /api/bctc-eval/recompute/:id`** (`apps/mcp-server/src/interface/mcp/server.ts:1982`, `handleBctcEvalRecompute` — recomputes stages 4-6 for one report).
- VCB acceptance procedure: after fix + VCB re-extraction, call `POST /api/bctc-eval/recompute/31f2a9a9`, then `GET /api/bctc-eval/31f2a9a9` to read the Stage 4 gates. VCB acceptance is therefore measurable. No new endpoint needed.

### B4 — FACTORY-DOMAIN-extract-bctc-parsing-lib: SEQUENCE SEPARATELY, AFTER this sprint.
- DECISION: do **NOT** absorb. This is a BEHAVIORAL bug-fix sprint (fix-in-place in `apps/pdf-extractor/infrastructure/text_table_extractor.py`); FACTORY-DOMAIN is a STRUCTURAL extract-to-lib refactor in a different zone (`mcp-server-domain`). Merging them conflates behavior + structure (harder to review/verify) and creates the exact parallel-conflicting-refactor risk B4 flags.
- `FACTORY-DOMAIN-extract-bctc-parsing-lib` is re-sequenced to **depend on this sprint** (it must extract the GENERALIZED logic, not the overfit version) and **must NOT run concurrently** with it (same parsing surface). Board annotation added.

### B5 — FR-4 (section-boundary detection, application layer): CONFIRMED IN-SCOPE.
- FR-4 is LOAD-BEARING for VCB acceptance (FM-VCB-1: income-statement + off-balance-sheet items mis-filed under `balance_sheet`; VCB acceptance requires income-statement rows correctly classified). Without FR-4, VCB acceptance cannot pass → in scope.
- Placement: application/use-case layer (`extract_layout_first_usecase.py`), content-signal driven, NO issuer branching (NFR-1). The DEEPER mechanism is the architect's call.

### Scope boundary (architect must honor)
- IN: FR-1..FR-7 + NFR-1..NFR-4, all in `apps/pdf-extractor/` (infrastructure + application + domain/primitives), generalized/layout-adaptive, ZERO per-issuer branches.
- OUT: 0-row pipeline-assembly failures (→ HPG-REPARSE-POST-REBUILD); FACTORY-DOMAIN refactor (→ sequenced after); FPT Stage 4 residual dup (→ FU-FPT-2025Q4-STAGE4-DUP).
- DoD: VCB+HPG+VNM Stage 4 GREEN (label_coverage≥0.90, code_coverage≥0.80, exact_dup_count=0, value_blank_label=0) RAW-verified via recompute; FPT Stage 6 GREEN + Stage 4 dup not increased; sandbox G12 both tiers GREEN; architect's design doc states the generalization mechanism (NFR-4).

---

## [Architect] Brownfield Findings

**Sprint:** FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT  
**Date:** 2026-06-28  
**Architect task:** ARCH-FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT  
**BUILD-STANDARD:** not-applicable (bug-fix/refactor in existing zone, no new primitives beyond additive helpers)

---

### Zone

`apps/pdf-extractor/` — single zone, dev-pdf-extractor sole committer.

DDD layers touched (all within this zone):

| Layer | Path | FRs |
|---|---|---|
| infrastructure | `infrastructure/text_table_extractor.py` | FR-1, FR-2, FR-3, FR-5, FR-7 |
| application | `application/extract_tables_usecase.py` | FR-4 |
| domain/primitives | `domain/primitives/vn_number_normalize/primitive.py` | FR-6 |

---

### Verified paths

- `apps/pdf-extractor/infrastructure/text_table_extractor.py` — 1430L. Key sites:
  - `_CODE_VALUE_COL_RE` (L554): Layout 3 pattern — **FR-1 change site**
  - `_ROMAN_CODE_RE` (L170) + `_try_parse_roman_code_row()` (L281): Layout 6 — **FR-3 change site**
  - `_parse_lines_to_rows()` (L1109): per-page row emitter — **FR-2, FR-7 change site**; dedup guard at L1226-1236
  - `TextTableExtractor.assemble()` (L1323): stitches pages — **FR-5 change site** (dedup post-stitch)
- `apps/pdf-extractor/application/extract_tables_usecase.py` — 602L. Key site:
  - Path A (L384-408): `select_balance_sheet_section(raw_pages)` call — **FR-4 change site**
- `apps/pdf-extractor/domain/primitives/vn_number_normalize/primitive.py` — 154L. Patterns:
  - `_VN_INT_RE` (L77), `_PARENS_RE` (L93) — **FR-6 investigation site**
- `apps/pdf-extractor/domain/primitives/select_balance_sheet_section/primitive.py` — 186L. Existing BS-only section filter. FR-4 keeps this intact and adds application-layer generalization above it.
- `apps/pdf-extractor/__tests__/unit/test_vn_number_normalize.py` — 12 existing tests (all FR-6 regression anchors)
- `apps/pdf-extractor/__tests__/unit/test_b02_tctd_parser.py` — VCB fixture tests (FR-3/FR-7 additions here)
- `apps/pdf-extractor/__tests__/unit/test_text_table_extractor.py` — FPT anchor tests (FR-1/FR-5 additions here)

---

### Reuse patterns

- `select_balance_sheet_section()` — kept intact; FR-4 wraps it rather than replacing it.
- `_norm()` (BT3-FIX5 Ruling C) — used by all new detection functions for diacritic-insensitive matching.
- `_VN_NUMBER_GUARD_RE` — already gates Roman/digit layouts; FR-7 notes-stop reuses the same principle.
- `_is_recognized_section_header()` — unchanged; FR-7 is a separate positional gate that fires AFTER section-header recognition.

---

### Design decisions

#### FR-1 — Layout-adaptive column-boundary detection: code-range gate in `_CODE_VALUE_COL_RE`

**Mechanism chosen: structural code-range constraint on Layout 3 (regex narrowing).**

Root cause: `_CODE_VALUE_COL_RE` (L554) pattern `(\d{2,3})` matches 2-digit numbers. When OCR renders "Il 10 198.629.540" (Roman II misread, note-ref 10, value 198.629.540), Layout 3 strips "Il" as label-noise and captures "10" as the code — a 2-digit note-ref.

Fix: change the code group from `\d{2,3}` to `\d{3}` (exactly 3 digits). BCTC structural codes are always 3-digit (100-999) in the code-value-column layout (which is the separate-OCR-column pattern). 2-digit codes (income-statement sub-items like 10, 50, 60) appear in INLINE layouts (L1/L2/L4) where they have label context — they never appear in the code-only-column pattern that L3 targets.

**Why this choice over whitespace-distribution or spatial geometry:**
- The OCR text field is already linearized; spatial coordinates from the original PDF are not preserved in the `pages[n]["text"]` string.
- The layout-token-count heuristic (counting tokens before the code to determine if it's a code-only column) is fragile with OCR artifacts.
- The structural rule is genuinely invariant: ALL B01-DN corporate balance-sheet code-value-column codes are 3-digit. B02-TCTD uses Roman codes (already handled by Layout 6/7). There is no issuer where a 2-digit code appears in a code-only-column OCR block.

**Code site:** `_CODE_VALUE_COL_RE` (L554):
```python
# BEFORE (FR-1 failing):
_CODE_VALUE_COL_RE = re.compile(
    r"^\s*(\d{2,3})\s+(?:[-—\w\s]*?)(\d[\d.,]+(?:\.\d+)?|\(\d[\d.,]+\))\s*$"
)
# AFTER (FR-1 fix):
_CODE_VALUE_COL_RE = re.compile(
    r"^\s*(\d{3})\s+(?:[-—\w\s]*?)(\d[\d.,]+(?:\.\d+)?|\(\d[\d.,]+\))\s*$"
)
```

**Non-regression proof (FPT):** "270 88.089.621.779.862" → code="270" (3 digits ≥ 100). "221 — 11 15.385.816.846.287" → code="221" (3 digits). All existing FPT Layout 3 golden codes (270, 300, 221, etc.) are 3-digit. The change has ZERO effect on FPT.

**NFR-4:** Detection is purely structural (code-token digit count), no issuer/ticker reference.

---

#### FR-2 — Trailing note-ref strip: post-parse label clean in `_parse_lines_to_rows`

**Mechanism: regex post-strip of `\s+\d{1,3}$` on label, with length guard.**

After `parsed = _try_parse_code_row(stripped)` returns `(code, label, values_rest)`, add:
```python
# FR-2: strip trailing Thuyết-minh note-ref from label
_label_clean = re.sub(r'\s+\d{1,3}$', '', label)
if len(_label_clean) >= 5:
    label = _label_clean
# else: leave label unchanged (trailing digit is part of the label content)
```

Guard: remaining label ≥ 5 characters prevents stripping when the label is short. The specific risk case "Quỹ phát triển khoa học 2025" is safe: "2025" is 4 digits → `\d{1,3}` does not match → no strip.

**DDD:** Pure string operation inside infrastructure `_parse_lines_to_rows`. No issuer context.

**NFR-4:** The strip predicate is purely text-structural (trailing 1-3 digit integer with leading whitespace). No issuer branching.

---

#### FR-3 — Roman numeral OCR normalization: pre-match translation table in `_try_parse_roman_code_row`

**Mechanism: module-level OCR normalization dict applied to line-start token before regex match.**

Add module-level constant and normalization step to `_try_parse_roman_code_row()`:
```python
_ROMAN_OCR_NORMALIZE: dict[str, str] = {
    "Il": "II",    # lowercase-l misread as uppercase-I
    "Ill": "III",  # two lowercase-l misread
    "IIl": "III",  # one lowercase-l in third position
    "lV": "IV",    # lowercase-l at start
    "VlI": "VII",  # lowercase-l in second position
    "VIl": "VII",  # lowercase-l at end
    "VIll": "VIII",
    "VlII": "VIII",
}
```

In `_try_parse_roman_code_row()`, BEFORE `_ROMAN_CODE_RE.match(stripped)`:
```python
# FR-3: apply OCR normalization to the first whitespace-separated token
parts = stripped.split(None, 1)
if parts:
    first_token = parts[0]
    normalized_token = _ROMAN_OCR_NORMALIZE.get(first_token, first_token)
    if normalized_token != first_token:
        stripped = normalized_token + (" " + parts[1] if len(parts) > 1 else "")
```

The normalized form is used both for the regex match AND as the stored `code` value.

**Non-regression guards:**
- The normalization dict is EXACT-KEY match on the first whitespace token. "I" (single letter), "II" (exact canonical), "VIII" (correct) — none of these are in the dict keys, so they pass through unchanged.
- The period guard (`rest.startswith(".")`) remains active after normalization.
- "I" embedded in Vietnamese words: can't reach `_try_parse_roman_code_row` because Layout 6 is only tried after Layouts 1-5 fail, and `_ROMAN_CODE_RE` requires `^` anchor + following whitespace + content. "I" in a word does not meet the `^I\s+` pattern.

**NFR-4:** Normalization table is OCR-artifact-driven (specific OCR character misread patterns), not issuer-specific.

---

#### FR-4 — Section-boundary content-signal detection: application-layer page filter in `extract_tables_usecase.py`

**Mechanism: `_detect_section_start(page_text)` + `_filter_pages_to_section(pages, section)` as pure private helpers in `extract_tables_usecase.py`. TextTableExtractor stays pure (zero change to infra layer).**

**Placement rationale:** The BA spec and PO both mandate application/use-case layer. `select_balance_sheet_section` is a domain primitive; FR-4 extends the filtering above that level, composing it with new section-signal detection. Application layer is the orchestration point — correct per DDD.

**Two new private functions in `application/extract_tables_usecase.py`:**

```python
# FR-4: Section-start keywords (diacritic-insensitive via .lower(); _norm not needed here
# since these are searched as substrings of already-lower text)
_INCOME_STMT_START_KEYWORDS = [
    "báo cáo kết quả hoạt động kinh doanh",
    "bao cao ket qua hoat dong kinh doanh",
    "kết quả hoạt động sản xuất kinh doanh",
    "ket qua hoat dong san xuat kinh doanh",
    "báo cáo thu nhập",
    "bao cao thu nhap",
    "kết quả hoạt động kinh doanh",  # B02-TCTD banking income stmt title
]
_CASH_FLOW_START_KEYWORDS = [
    "lưu chuyển tiền tệ",
    "luu chuyen tien te",
    "báo cáo lưu chuyển tiền tệ",
    "bao cao luu chuyen tien te",
]

def _detect_section_start(page_text: str) -> Optional[str]:
    """
    Detect whether a page STARTS a new BCTC statement section.
    Returns 'income_statement', 'cash_flow', or None (= balance_sheet / continuation).
    Pure: no I/O, no issuer context.
    """
    lower = page_text.lower()
    if any(kw in lower for kw in _INCOME_STMT_START_KEYWORDS):
        return "income_statement"
    if any(kw in lower for kw in _CASH_FLOW_START_KEYWORDS):
        return "cash_flow"
    return None

def _filter_pages_to_section(
    pages: List[Dict], target_section: str
) -> List[Dict]:
    """
    Filter pre-supplied pages to those belonging to target_section.
    - balance_sheet: calls existing select_balance_sheet_section(), then excludes
      pages that detectably START a different section (income_statement/cash_flow).
    - income_statement: includes pages where _detect_section_start == 'income_statement'
      (contiguous run starting from first detected page).
    - cash_flow: same pattern for cash_flow.
    Pure: no I/O.
    """
    if target_section == "balance_sheet":
        # Phase 1: existing BS filter (keeps backward compat with FPT OCR-variant markers)
        bs_pages = select_balance_sheet_section(pages)
        # Phase 2: FR-4 — exclude pages that start a conflicting section
        return [
            p for p in bs_pages
            if _detect_section_start(p.get("text", "")) is None
        ]
    else:
        # income_statement / cash_flow: select contiguous run of target pages
        result: List[Dict] = []
        in_section = False
        for p in pages:
            sig = _detect_section_start(p.get("text", ""))
            if sig == target_section:
                in_section = True
                result.append(p)
            elif in_section and sig is None:
                # Continuation page (no section header) — include if we're in the section
                result.append(p)
            elif in_section and sig != target_section:
                # Next section started — stop
                break
        return result
```

In `execute()` Path A, replace the current call:
```python
# BEFORE:
if statement_section == "balance_sheet":
    pages = select_balance_sheet_section(raw_pages)
else:
    pages = raw_pages

# AFTER (FR-4):
pages = _filter_pages_to_section(raw_pages, statement_section)
```

**DDD compliance:** Both functions are pure (no I/O, no HTTP, no DB). They import `select_balance_sheet_section` from `domain.primitives.select_balance_sheet_section.primitive` (domain import from application — allowed). TextTableExtractor (infrastructure) is unchanged.

**NFR-1 (no issuer branching):** Detection uses Vietnamese keyword substrings. No `if issuer == ...` anywhere. B02-TCTD income statement uses "báo cáo kết quả hoạt động kinh doanh" — same keyword as B01-DN. The detection is FORM-STRUCTURE-based, not form-ID or ticker based.

**EC-3 guard (VCB off-balance-sheet):** The off-balance-sheet section ("Cam kết ngoại bảng") uses no income_statement or cash_flow keywords → not mis-detected. These pages pass `_detect_section_start → None` → remain in balance_sheet pages. The existing `select_balance_sheet_section` gap-tolerance handles them.

**EC-4 (HPG P&L pages separate from BS by page):** FR-4 separates by PAGE content signal, not by code range. If HPG P&L pages contain income_statement keywords, they're excluded from the balance_sheet call. If the mcp-server also makes an income_statement call, FR-4 routes them correctly. The HPG 0-income_statement-row issue (FM-HPG-1, pipeline not making the income_statement call) is OUT of scope for this sprint.

---

#### FR-5 — Same-section duplicate-row prevention: `_dedup_rows_within_section()` in `assemble()`

**Mechanism: post-stitch dedup pass in `assemble()` (one pass after all pages are stitched, before positional cutoff). Scope: within one `assemble()` call.**

**Why post-stitch (not per-page):** FM-HPG-2 duplicates arise from the SAME code appearing on DIFFERENT pages (cover-page summary + detail page). Per-page `_seen_codes` dict (current BT3-FIX-3 guard) cannot catch cross-page duplicates. The fix moves dedup to `assemble()` level after all pages are stitched.

New function in `text_table_extractor.py`:
```python
def _dedup_rows_within_section(rows: List[Dict]) -> List[Dict]:
    """
    Drop identical same-section duplicate rows (first occurrence wins).

    Guard: only drops when (code, value_current) pair is IDENTICAL to first occurrence.
    If value_current DIFFERS (OCR variant), both rows are emitted (log WARNING).
    Scope: ONE assemble() call = one statement_section.
    Cross-section duplicates remain valid (handled by Stage 4 eval).
    """
    seen: dict[str, Optional[float]] = {}  # code → first value_current
    out: List[Dict] = []
    for row in rows:
        code = row.get("code")
        if code is None:
            out.append(row)  # header/separator rows always pass
            continue
        vc = row.get("value_current")
        if code not in seen:
            seen[code] = vc
            out.append(row)
        else:
            first_vc = seen[code]
            if first_vc == vc:
                logger.warning(
                    "_dedup_rows_within_section: dropping identical dup "
                    "code=%r value_current=%r (page=%r row_order=%r)",
                    code, vc, row.get("page_number"), row.get("row_order"),
                )
                # is_duplicate=True: do NOT append
            else:
                logger.warning(
                    "_dedup_rows_within_section: code=%r OCR variant values "
                    "%r vs %r — emitting both",
                    code, first_vc, vc,
                )
                out.append(row)  # emit OCR variant
    return out
```

In `assemble()`, insert BEFORE `_apply_positional_cutoff`:
```python
all_rows = _dedup_rows_within_section(all_rows)
all_rows = _apply_positional_cutoff(all_rows, statement_section)
```

**FPT non-regression impact:** FPT's pre-existing Stage 4 duplicate (exact_dup_count=1) — if the two FPT rows have identical (code, value_current), FR-5 will drop the duplicate → dup count drops to 0 (bonus, per PO: "capture as bonus, not a gate"). If different values, both emit → dup count unchanged. Either outcome stays within the gate (FPT Stage 4 dup must NOT INCREASE above 1).

**Per-page `_seen_codes` dict (BT3-FIX-3 R3):** Keep as-is (defensive warning for same-page duplicates). The new cross-page dedup in `assemble()` handles the HPG/VNM cases that were missed.

**NFR-4:** Detection is (code, value_current) equality — structural identity check, no issuer branching.

---

#### FR-6 — VN-number parenthetical parse robustness: `vn_number_normalize` defensive enhancement

**Mechanism: mandatory trace-first investigation before any code change.**

Brownfield analysis shows the CURRENT `vn_number_normalize` code ALREADY handles "(1.992.671)" correctly through the existing `_PARENS_RE + _VN_INT_RE` path:
- `_PARENS_RE.match("(1.992.671)")` → `stripped = "1.992.671"`, `negative = True`
- `_VN_INT_RE = r"^\d{1,3}(?:\.\d{3})+$"` → matches "1.992.671" (groups: "1" + ".992" + ".671") → "1992671"
- Return "-1992671" ✓

**The FM-VCB-4 bug (`value_current=-1.992671`) is therefore NOT originating in `vn_number_normalize` itself.** The failure must be upstream: either in the value-cell splitting (`_parse_value_cells`) or in how the token reaches `_parse_value`.

**Developer's mandatory investigation before FR-6 implementation:**
1. Run `TextTableExtractor.assemble()` on a VCB page fixture containing "Chi phí hoạt động dịch vụ (1.992.671) (1.921.556)" and add DEBUG logging to trace the exact token passed to `vn_number_normalize`.
2. Check if OCR produces "(1.992. 671)" (space inside parens — poppler artifact). If so, the token "1.992. 671" (after paren strip) has a space → `_VN_INT_RE` fails → returns None → value_current=None (not -1.992671). This contradicts FM-VCB-4.
3. Check if the value token might be "(1,992.671)" (comma for first thousands sep) → `_EN_US_RE` matches → returns None → `_coerce_ocr_number` then re-parses.
4. Check if Layout 5 `_find_code_in_line` is extracting the wrong substring.

**FR-6 design (defensive additive, safe regardless of where the bug is):**

Enhance `vn_number_normalize` with an explicit parenthetical multi-dot VN-int shortcut:
```python
# FR-6 enhancement: explicit parenthetical VN-int detection (defense-in-depth)
# Before the existing pattern matching, add:
# If stripped (after paren removal) matches 2+ dot-groups of exactly 3 digits each
# → guaranteed VN thousands integer, normalize directly.
# This is what _VN_INT_RE already covers, but made explicit for parenthetical form.
# No change to existing pattern cascade — this is a no-op if _VN_INT_RE already fires.
```

The code change: add an explicit test assertion `vn_number_normalize("(1.992.671)") == "-1992671"` to the test suite. If this assertion PASSES in the current code (confirming the existing path works), the developer knows to look UPSTREAM for the VCB bug.

**If upstream bug found:** fix in `_parse_value_cells` (most likely: OCR space inside parenthetical splits the token incorrectly). The poppler artifact handler in `_find_code_in_line` (L250) already handles "(\d[\d.]*)\.\s+(\d[\d.]*\))" — this same pattern should be applied to raw value strings in `_parse_value` or `_parse_value_cells`.

**Proposed defensive addition to `_parse_value`:**
```python
def _parse_value(raw: Optional[str]) -> Optional[float]:
    if raw is None:
        return None
    cleaned = str(raw).strip()
    # FR-6: normalize OCR-artifact space inside parenthetical VN number
    # e.g. "(1.992. 671)" → "(1.992.671)" before normalization
    cleaned = re.sub(r"(\(\d[\d.]*)\.\s+(\d[\d.]*\))", r"\1.\2", cleaned)
    normalized = vn_number_normalize(cleaned)
    ...
```

This mirrors the poppler-artifact handler already in `_find_code_in_line` (L250) and is backward-safe (only fires on patterns with parenthetical + space after dot).

**FPT backward-safety:** "(586.166.744.274)" → no space inside → regex sub is a no-op → behavior unchanged. All 12 existing `test_vn_number_normalize.py` tests remain green.

**NFR-4:** Fix is OCR-artifact structural, no issuer branching.

---

#### FR-7 — B02-TCTD notes-section hard stop: positional gate in `_parse_lines_to_rows`

**Mechanism: `_is_notes_section_boundary()` flag gate in `_parse_lines_to_rows`. Sets a stop flag when entering Thuyết minh numbered body.**

New function:
```python
_NOTES_BOUNDARY_NUMBER_RE = re.compile(r"^\d{2,}\.$")  # "26." "27." "28." etc.
_NORM_GHI_CHU = _norm("ghi chú")

def _is_notes_section_boundary(stripped: str) -> bool:
    """
    Detect entry into the Thuyết minh notes body (B02-TCTD).
    Triggers on:
    1. Standalone note-item number with trailing period (≥15): "26." "27." "28."
       Threshold ≥15 to exclude low single/double codes (1., 2., ..., 14.) which are
       valid B02-TCTD sub-item codes.
    2. "Thuyết minh" standalone header on its own line.
    3. "Ghi chú" standalone header.
    """
    # Check 1: standalone number ≥15 with trailing period ("26." → notes item 26)
    m = _NOTES_BOUNDARY_NUMBER_RE.match(stripped)
    if m:
        num = int(re.match(r"^(\d+)", stripped).group(1))
        if num >= 15:
            return True
    # Check 2: Thuyết minh header line
    norm_s = _norm(stripped)
    if _NORM_THUY in norm_s:
        return True
    # Check 3: Ghi chú header
    if _NORM_GHI_CHU in norm_s:
        return True
    return False
```

In `_parse_lines_to_rows`, add a stop flag:
```python
_in_notes_section = False

for line in lines:
    stripped = line.strip()
    if not stripped:
        continue
    # FR-7: notes-section hard stop (B02-TCTD)
    if _is_notes_section_boundary(stripped):
        _in_notes_section = True
        logger.info(
            "_parse_lines_to_rows: page %d notes-section boundary detected "
            "at %r — halting code-row extraction",
            page_num, stripped,
        )
    if _in_notes_section:
        continue
    # ... rest of existing line processing
```

**Non-regression guard:** FPT balance-sheet inline pages do not contain standalone integers ≥15 followed by a period as a sole line element. The "Thuyết minh" check duplicates the existing `_NORM_THUY` check inside `_parse_three_block_layout` — this is defense-in-depth for the inline-layout path.

**Interaction with `_JUNK_SKIP_KEYS`:** "Thuyết minh" is NOT in `_JUNK_SKIP_KEYS` (only "mã số" and "mẫu số" are there). FR-7 adds the boundary detection as a positional STOP (sets flag), not a line skip. This distinction matters: after the stop, ALL lines are skipped (not just the boundary line).

**NFR-4:** Detection is content/structure based (standalone note-item number ≥15 with period), no issuer reference.

---

### Test strategy

**Files to modify (additive only — no deletion of existing tests):**

| File | What to add | FRs covered |
|---|---|---|
| `__tests__/unit/test_text_table_extractor.py` | FR-1: assert "10 198.629.540" → Layout 3 does NOT return code="10"; "270 88.089.621.779.862" still returns code="270". FR-5: single-section dedup fixture (code 140 on page A and page B → one row). | FR-1, FR-5 |
| `__tests__/unit/test_b02_tctd_parser.py` | FR-3: "Il Tiền gửi 17.957.497" → code="II" (normalized from Il); "Ill X 10.000" → code="III"; "IIl X 10.000" → code="III"; "lV X 10.000" → code="IV". FR-2: label="Chứng khoán kinh doanh 4" → stripped to "Chứng khoán kinh doanh". FR-7: line "26." in B02-TCTD fixture → subsequent code rows dropped. | FR-2, FR-3, FR-7 |
| `__tests__/unit/test_vn_number_normalize.py` | FR-6: explicit test `vn_number_normalize("(1.992.671)") == "-1992671"`; `vn_number_normalize("(1.921.556)") == "-1921556"`. FPT non-regression: `vn_number_normalize("(586.166.744.274)") == "-586166744274"`. | FR-6 |
| `__tests__/unit/test_extract_tables_usecase.py` | FR-4: page with income_statement keyword → `_detect_section_start` returns "income_statement"; balance_sheet call with mixed pages (BS + IS pages) → IS pages excluded; income_statement call → IS pages selected. | FR-4 |

**Sandbox G12 (NFR-2):** After implementation, run `python sandbox/runner.py --tier=primitive --scenario=all` AND `--tier=module --scenario=all` — both must be GREEN. Do not skip.

**Acceptance procedure (NFR-3 + locked gates):**
1. Re-extract VCB 2026Q1 (31f2a9a9) → `POST /api/bctc-eval/recompute/31f2a9a9` → `GET /api/bctc-eval/31f2a9a9` → confirm Stage 4 GREEN (exact_dup_count=0, label_coverage≥0.90).
2. Same for HPG 2025Q4 (918a7abd) and VNM 2025Q4 (4316f6d1).
3. FPT 2025Q4 (e71f845d): confirm Stage 6 GREEN; confirm Stage 4 exact_dup_count ≤ 1 (must NOT increase above pre-fix value of 1).

---

### Risk flags

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| RISK-1 | **FR-6 upstream bug location**: the bug producing -1.992671 is NOT in `vn_number_normalize` (current code already handles "(1.992.671)" correctly). Developer MUST trace the actual failure path in live VCB OCR before writing any fix. Wrong fix target = wasted sprint. | HIGH | Mandatory: add `vn_number_normalize("(1.992.671)") == "-1992671"` test FIRST. If it passes (expected), the bug is in `_parse_value_cells` or the token extraction layer. Fix the poppler-artifact space handler in `_parse_value` (design above). |
| RISK-2 | **FR-1 income/cash-flow 2-digit codes**: changing `_CODE_VALUE_COL_RE` to `\d{3}` only means 2-digit income-statement codes (50, 60, 70) can no longer match Layout 3. For income/cash-flow sections, Layout 3 was never the right match anyway (inline format handles 2-digit codes via Layout 1/2/4). Verify no test fails for income/cash-flow fixtures. | MEDIUM | Run ALL existing tests after FR-1 change. If any test regresses on 2-digit codes in Layout 3 position, investigate — it signals a test fixture that accidentally depended on the FPT-overfit behavior. |
| RISK-3 | **FR-5 FPT Stage 4 dup drop-to-0**: FR-5 will likely drop FPT's pre-existing 1 duplicate (if the two rows have identical (code, value_current)). This is a BONUS per PO. But it MUST be verified that no Stage 6 rows are also dropped. Run FPT Stage 6 re-extraction as part of the acceptance check. | LOW | PO explicitly allows this. Capture in test assertion: FPT Stage 4 dup ≤ 1 post-fix (not "exactly 1"). |
| RISK-4 | **FR-4 over-filter for pages with dual section content**: a page that contains both a BS summary row AND an income-statement page header (e.g., "Báo cáo kết quả hoạt động kinh doanh" in a page-header footer) would be incorrectly excluded from the BS call. | MEDIUM | Detection is substring match on `.lower()` — make keywords specific enough (use full title strings, not fragments). "kết quả hoạt động kinh doanh" in a footer is a real risk for some issuers. Mitigation: search only in the FIRST 30 lines of the page text (where section headers appear), not the full page. |
| RISK-5 | **FR-7 false-positive note stop on legitimate items**: B01-DN income-statement items use codes like "01", "02" which would produce "01." as a line only if OCR drops the label. These would not trigger FR-7 (`\d{2,}\.` requires ≥2 digits but "01." is 2 digits + period — wait, `\d{2,}` does match "01"). Threshold guard `num >= 15` means 01-14 pass through. Safe for B02-TCTD note items 1-14 (valid sub-codes). | LOW | Test: line "14 Some label 10.000" → code="14" row emitted (not stopped). Line "15." → stop triggered. Line "26." → stop triggered. |
| RISK-6 | **FR-4 interaction with Path B (OCR auto-locate)**: `_filter_pages_to_section` is only applied to Path A (pre-supplied pages). Path B (auto-locate via ocr_port) uses `locate_balance_sheet_pages()` from `PdfOcrAdapter` which does its own section detection using pdfplumber. FR-4 does NOT touch Path B. If VCB hits Path B, the fix doesn't apply. Developer must verify VCB re-extraction uses Path A. | MEDIUM | VCB re-extraction is triggered via `POST /api/bctc-eval/recompute/:id` which calls the stored OCR text path (Path A). Confirm at dev time. |

---

### Scan clean: true ✓

Zero DDD violations in the design:
- Infrastructure (`text_table_extractor.py`) imports only from `domain/primitives/` — unchanged.
- Application (`extract_tables_usecase.py`) imports from `domain/primitives/` (allowed) + standard lib — new helpers are pure functions.
- Domain primitive (`vn_number_normalize`) imports only `re` from stdlib — unchanged structure.
- No cross-layer upward imports introduced.

---

### Generalization proof (NFR-4 attestation)

Every fix is layout-adaptive from content/geometry signals. Zero per-issuer branches:

| FR | What drives detection | No issuer branch? |
|---|---|---|
| FR-1 | BCTC code range (3 digits ≥ 100 for code-only-column layouts) | YES — structural |
| FR-2 | Trailing `\s+\d{1,3}$` regex + length guard on label string | YES — structural |
| FR-3 | OCR character misread table (Il→II, etc.) applied to line-start token | YES — OCR-artifact structural |
| FR-4 | Vietnamese section-title keyword substrings in page text | YES — form-structure (same keywords work for B01-DN and B02-TCTD) |
| FR-5 | (code, value_current) equality within one assemble() call | YES — structural identity |
| FR-6 | Parenthetical VN thousands-dot pattern (2+ groups of 3 digits) | YES — format structural |
| FR-7 | Standalone number ≥15 with trailing period OR "Thuyết minh"/"Ghi chú" keyword | YES — positional content signal |

No `if issuer == 'X'`, no `if form_id == 'B02-TCTD'`, no `if ticker == 'VCB'` anywhere in the design.

---

**NEXT:** pm — decompose FR-1..FR-7 into atomic dev-pdf-extractor tasks. Recommended sequencing: FR-3 (unblocks Roman code parsing foundation) → FR-1 (Layout 3 gate, 1-line change) → FR-2 (label clean, additive) → FR-7 (notes stop, additive) → FR-5 (dedup, additive in assemble()) → FR-4 (application-layer section filter, most isolated) → FR-6 (trace-first investigation + defensive fix). Each FR is independently testable. All in single zone (no worktree split needed). Sequential dispatch (shared file: text_table_extractor.py).
