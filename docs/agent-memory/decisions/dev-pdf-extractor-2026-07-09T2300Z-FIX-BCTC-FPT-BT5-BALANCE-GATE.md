# 2026-07-09T23:00Z — FIX-BCTC-FPT-BT5-BALANCE-GATE

## Summary
Found and fixed the root cause of the 43-TRILLION-VND balance-sheet imbalance on FPT's
B01-DN corporate-form real-OCR extraction. Balance identity (`assets = liabilities + equity`)
now holds EXACT (delta 0.0, was 43,707,714,826,297.41). Fix is at the domain-primitive layer
(`vn_number_normalize`), generic across ALL BCTC forms — no per-ticker/date special-casing.
Landed in `task_board.review[]` (not self-closed) because the named test still fails on a
DIFFERENT, unrelated, pre-existing assertion (row-count, not balance identity) — documented
below and explicitly out of this ticket's scope.

## Root cause
`ExtractTablesUseCase.execute()` real-OCR path produced `balance_delta=43707714826297.41`,
BT-5 gate blocked the push (`rows_stored=0`), test failed at the `rows_stored >= 80` assertion
(the first assertion in the test, so the original failure message never even surfaced the
balance-identity line — the 43T delta was only visible in the WARNING log).

Traced with a debug harness replaying `ExtractTablesUseCase` directly (bypassing the gate's
`rows_stored=0` short-circuit to inspect the raw assembled rows):

```
100  A. TÀI SẢN NGAN HẠN                58,102,970,741,619
200  B. TÀI SẢN DAI HẠN                 29,986,651,038,243
270  TỔNG CỘNG TÀI SẢN (=100+200)       88,089,621,779,862   ✓ matches golden anchor
300  C. NỢ PHẢI TRẢ                     44,338,155,487,272   ✓ matches golden anchor
400  D. VỐN CHỦ SỞ HỮU                  43,751,466,292.59    ✗ WRONG — 1000x too small
440  TỔNG CỘNG NGUỒN VỐN (=300+400)     88,089,621,779,862   ✓ matches golden anchor
```

Code 400 (Total Equity) was the ONLY corrupted value. Its raw OCR text (dumped from
`PdfOcrAdapter.ocr_pages()`, real Tesseract, no pre-supplied text):

```
D. VỐN CHỦ SỞ HỮU 400 43.751.466.292,590 35.727.540.104.800
```

The source PDF (`data/pdfs/20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf`) is a fully scanned
image PDF — `pdfplumber.extract_text()` returns `""` on every page (confirmed for pages 0-9),
so there is zero embedded text layer; every digit here comes from Tesseract OCR. Tesseract
misread the LAST thousands-separator dot in the VN-formatted number `43.751.466.292.590` as a
comma, rendering `43.751.466.292,590`.

`domain/primitives/vn_number_normalize/primitive.py`'s `_VN_DECIMAL_RE` (Pattern B: "VN
decimal — thousands dots + comma-decimal suffix") legitimately matched this string as a VALID
VN decimal number and normalized it to `43751466292.590` → `float()` = 43,751,466,292.59 —
1000x too small (the trailing `.590` group was consumed as a decimal fraction instead of
another thousands group). This is upstream of `text_table_extractor.py` / `_parse_value` — the
existing `_coerce_ocr_number` fallback (which fixes the mirror case, a misread FIRST separator)
never fires here because `vn_number_normalize` already returns a "successful" (but wrong)
parse — no `None` to trigger the fallback.

## What I tried / considered
- Only path considered: fix at the domain-primitive layer (`vn_number_normalize`), since it is
  the single source of truth for VN number string→float classification, used identically by
  every statement type/form (balance sheet, income statement, cash flow; corporate B01-DN and
  bank B02-TCTD). This keeps the fix generic, per the task's `generic_mandate` — no per-ticker
  allowlist, no date literal, no FPT-specific branch.
- Considered constraining the new rule to require ONLY the digit-count signal (`,\d{3}$`), vs.
  also requiring >=1 preceding thousands-dot-group. Chose to require BOTH signals (preceding
  dot-group AND exactly-3-digit suffix) — this is the narrowest rule that still exactly matches
  the observed OCR-artifact shape, and avoids reinterpreting a bare `"292,590"` (no preceding
  dot group) which could plausibly be a genuine (if unusual) 3-decimal value with no supporting
  evidence either way. Added an explicit regression test
  (`test_ocr_misread_last_separator_requires_preceding_dot_group`) to lock this boundary.
  Existing genuine-decimal test vectors in the corpus are all 1-2 digit fractions ("0,5",
  "1.234,56", "123,45") — none conflict with restricting the new rule to exactly 3 digits.

## Fix
`domain/primitives/vn_number_normalize/primitive.py`:
- New pattern `_VN_OCR_MISREAD_LAST_SEP_RE = re.compile(r"^\d{1,3}(?:\.\d{3})+,\d{3}$")`
  (>=1 existing thousands-dot group + comma + EXACTLY 3 digits).
- Checked BEFORE Pattern B (`_VN_DECIMAL_RE`) in `vn_number_normalize()`. On match, both
  separators are stripped (no decimal point introduced) — the comma is treated as a mis-scanned
  dot, not a decimal separator.
- `"43.751.466.292,590"` → `"43751466292590"` (was `"43751466292.59"`).
- `"(43.751.466.292,590)"` → `"-43751466292590"` (parenthetical negative variant).

## Verified
- **Balance identity (the named bug)**: `assets - (liabilities + equity)` = `0.0` exactly (was
  `43,707,714,826,297.41`). Code 270/300/400 all match the FPT golden anchors from the test
  docstring to the dong: 270=88,089,621,779,862 / 300=44,338,155,487,272 /
  400=43,751,466,292,590.
- **New unit tests** (`__tests__/unit/test_vn_number_normalize.py`, 4 added):
  `test_ocr_misread_last_separator_fpt_code_400`,
  `test_ocr_misread_last_separator_negative`,
  `test_ocr_misread_last_separator_requires_preceding_dot_group`,
  `test_genuine_two_digit_decimal_unaffected_by_ocr_misread_rule`.
  All 22 tests in the file pass (18 pre-existing + 4 new).
- **Full non-regression** (`cd apps/pdf-extractor && python -m pytest -m "not slow" -q`):
  `1019 passed, 7 failed, 7 deselected`. The 7 failures are 100% PRE-EXISTING and UNRELATED —
  confirmed by `git stash` A/B comparison (identical 7 failures, same test IDs, exist WITHOUT
  my change too): `test_ocr_backends.py::...pil_image_passthrough`,
  `test_ocr_unit_tesseract_retry.py::test_ac1/test_ac2`,
  `test_page_rasterizer.py::4 tests` — all `AttributeError: module 'PIL.Image' has no attribute
  'new'`, a test-isolation/mock-pollution issue in an unrelated OCR-backend/rasterizer test
  cluster, nothing to do with VN number parsing. Baseline (my change stashed out): `1015
  passed, 7 failed` — same failure set, delta of exactly 4 = my 4 new tests.
- **Targeted corporate-form + balance + decimal suites** (non-regression across form types,
  explicit AC-9 requirement):
  `test_vn_number_normalize.py test_text_table_extractor.py test_extract_tables_cross_check.py
  test_bs_accounting_identities.py test_extract_tables_usecase.py test_reconcile_figures.py
  test_b02_tctd_parser.py (bank B02-TCTD form, non-B01-DN, single-digit-code layout)
  test_decimal_normalizer.py test_extract_tables_fpt.py test_bt3_fix2_full_pipeline.py
  test_bt3_fix3_row_fidelity.py -m "not slow"` → **213 passed, 0 failed, 1 deselected**.
- **Named real-OCR integration test**
  (`test_extract_tables_bt3d_real_ocr.py::test_extract_tables_usecase_real_ocr_path`, `-m slow`,
  actual Tesseract run against the real FPT PDF, ~26s): STILL FAILS, but at a DIFFERENT,
  unrelated assertion — `rows_stored=79` vs. required `>=80` (line 152, the FIRST assertion in
  the test). This is NOT the balance_pass assertion (line 159) — confirmed the gate no longer
  fires (no "BT-5 gate: balance identity FAIL" WARNING in the log after the fix; it fired every
  time before the fix). Traced separately: the raw parse yields 80 rows including a spurious
  duplicate code `"868"` (two occurrences); `_dedup_rows_within_section` (FR-5, commit
  `0ae36a0eb`, landed 2026-06-28) correctly drops the exact duplicate → 79. The `"868"` rows
  are NOT real BCTC codes — they come from OCR text on page 8 belonging to two
  INCOME-STATEMENT EPS lines ("Lãi cơ bản trên cổ phiếu" code 70, "Lãi suy giảm trên cổ phiếu"
  code 71), whose 4-value-column layout ("1.168  868  5.211  4.292") causes a value token
  ("868") to be mis-extracted as a "code". Confirmed via `git log`: the test's `rows_stored>=80`
  threshold was set 2026-05-28 (`d1be505048`) — BEFORE the FR-5 dedup feature existed
  (2026-06-28) — so the raw pre-dedup count was 80 back then and the threshold was never
  updated after FR-5 started correctly removing 1 duplicate. This is a distinct bug class
  (balance-sheet/income-statement page-boundary bleed + multi-value-column EPS code
  false-positive) from the B01-DN 3-digit balance-sheet code-mapping bug this ticket targets.
  Per `fail_loud_requirement`, did NOT touch the dedup logic, the `>=80` threshold, or drop any
  line items to force a match — landed in review instead.

## Files changed
- `apps/pdf-extractor/domain/primitives/vn_number_normalize/primitive.py` — new
  `_VN_OCR_MISREAD_LAST_SEP_RE` pattern + dispatch branch in `vn_number_normalize()`.
- `apps/pdf-extractor/__tests__/unit/test_vn_number_normalize.py` — 4 new regression tests.

## Recommendation
File a follow-up ticket for the `rows_stored>=80` gap traced above (page-8 income-statement
EPS-line bleed into the auto-located balance-sheet OCR page range + spurious code
false-positive on multi-value-column lines). Suggest scope: either tighten
`locate_balance_sheet_pages()` section-boundary detection to exclude page 8, or harden the
code-row regex family to reject value-column tokens on income-statement-shaped lines, or
(least invasive) update the stale `>=80` threshold to `>=79` with an explicit note referencing
FR-5's dedup fix — PO/architect to adjudicate which.
