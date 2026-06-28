---
sprint: FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT
branch: task/328-fr2-trailing-noteref-strip
size: S
zone: apps/pdf-extractor/
depends_on: [TASK_327]
blocks: [TASK_329, TASK_330]
---

## TLDR
Add post-parse label cleaning to strip trailing 1-3 digit note-ref numbers from label text (e.g., "Chứng khoán kinh doanh 4" → "Chứng khoán kinh doanh"). Guard: remaining label ≥5 chars (prevent stripping valid label-ending digits). Additive change in `_parse_lines_to_rows()`.

## [PM] Planning Context

**FR:** FR-2 — Trailing note-reference number stripping from label (Architect design §FR-2)

**Zone:** `apps/pdf-extractor/infrastructure/text_table_extractor.py` (in `_parse_lines_to_rows()`)

**Why this order:** Depends on FR-1 (stable Layout 3). Foundational for FM-VCB-2 (label contamination). Must precede FR-7 (notes-section hard stop uses similar boundary logic).

**Acceptance Criteria:**
- [ ] AC-1: `_parse_lines_to_rows()` includes post-parse label-clean step after `_try_parse_code_row()` returns `(code, label, values_rest)`
- [ ] AC-2: Label clean regex: `re.sub(r'\s+\d{1,3}$', '', label)` (strip trailing whitespace + 1-3 digits from end)
- [ ] AC-3: Guard: only strip if remaining label ≥5 characters (prevent breaking "Quỹ phát triển khoa học 2025" where "2025" is part of the label)
- [ ] AC-4: New test added to `test_b02_tctd_parser.py`:
  - [ ] "Chứng khoán kinh doanh 4" → stripped to "Chứng khoán kinh doanh" (label ≥5 after strip)
  - [ ] "Quỹ phát triển khoa học 2025" → NOT stripped (remaining after strip would be <5 chars if "2025" were stripped, but "2025" is 4 digits, so `\d{1,3}` doesn't match; label unchanged)
- [ ] AC-5: Non-regression: FPT golden tests still GREEN (no FPT labels end with trailing note-refs)
- [ ] AC-6: No per-issuer branches; detection is purely text-structural (regex on label string)

**Code change site (architect design):**
- `apps/pdf-extractor/infrastructure/text_table_extractor.py` in `_parse_lines_to_rows()` function (~1120s area)
- Additive: ~8L after line that returns `(code, label, values_rest)` from `_try_parse_code_row()`

**Test files to modify:**
- `apps/pdf-extractor/__tests__/unit/test_b02_tctd_parser.py` — add FR-2 fixture tests (~10L)

**Knowledge needed:**
- Architect design: `docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md` §FR-2
- Current code: `apps/pdf-extractor/infrastructure/text_table_extractor.py` §`_parse_lines_to_rows()` (L1109)
- Context: FM-VCB-2 failure case shows labels like "Chứng khoán kinh doanh 4" where "4" is a Thuyết minh note-ref number appended by OCR

## [Developer] Implementation Notes

**Date:** 2026-06-28 | **Commit:** `774cfd69` | **Status:** REVIEW

### Code change site

`apps/pdf-extractor/infrastructure/text_table_extractor.py` — inserted 10 lines after
`code, label, values_rest = parsed` at L1231 in `_parse_lines_to_rows()`:

```python
# FR-2: strip trailing Thuyết-minh note-ref number from label.
# Example: "Chứng khoán kinh doanh 4" → "Chứng khoán kinh doanh"
# Guard: only strip if the remaining label is still ≥5 characters
# (prevents stripping valid label-ending digits from short labels).
# Purely text-structural — no issuer/ticker context used (NFR-4).
_label_clean = re.sub(r'\s+\d{1,3}$', '', label)
if len(_label_clean) >= 5:
    label = _label_clean
# else: leave label unchanged (trailing digit is part of the label content)
```

`re` was already imported at module top-level — no new import needed.

### Tests added

`apps/pdf-extractor/__tests__/unit/test_b02_tctd_parser.py` — new class `TestFR2TrailingNoterefStrip` (TC-B06), 7 test methods:

1. `test_strip_trailing_1digit_noteref` — "Chứng khoán kinh doanh 4" → "Chứng khoán kinh doanh"
2. `test_guard_protects_short_remaining_label` — "Nợ 1" → "Nợ 1" (remaining "Nợ" = 2 chars < 5)
3. `test_4digit_year_not_matched_by_regex` — "Quỹ phát triển khoa học 2025" → unchanged (4-digit, no match)
4. `test_strip_trailing_2digit_noteref` — strips 2-digit suffix when ≥5 chars remain
5. `test_strip_trailing_3digit_noteref` — strips 3-digit suffix when ≥5 chars remain
6. `test_label_without_trailing_digit_unchanged` — no-op when no trailing digit
7. `test_end_to_end_vcb_label_strip_in_assembled_row` — full assemble() confirms label clean

All 7 PASS.

### AC checklist

- [x] AC-1: post-parse label-clean step in `_parse_lines_to_rows()` after `_try_parse_code_row()` returns
- [x] AC-2: regex `re.sub(r'\s+\d{1,3}$', '', label)` applied
- [x] AC-3: guard `if len(_label_clean) >= 5` present and tested
- [x] AC-4: tests cover strip case + guard-protects-short-label + 4-digit year (no match)
- [x] AC-5: FPT non-regression — all FPT golden tests GREEN; FPT Stage 6 unaffected (no FPT labels end with 1-3 digit trailing note-refs)
- [x] AC-6: zero per-issuer branches; purely text-structural

### Guard verification

| Label | After regex | Remaining len | Action |
|---|---|---|---|
| "Chứng khoán kinh doanh 4" | "Chứng khoán kinh doanh" | 24 ≥ 5 | STRIP |
| "Nợ 1" | "Nợ" | 2 < 5 | NO STRIP (guard fires) |
| "Quỹ phát triển khoa học 2025" | unchanged (4-digit, no match) | — | NO STRIP |

### Test run results

Full unit suite: **899 pass / 6 pre-existing PIL-ABI/OCR env failures** (same baseline as TASK_327).
Targeted (test_b02_tctd_parser.py + test_text_table_extractor.py + test_layout_invariants.py): **122/122 pass**.

### G12 Sandbox results

```
Primitive tier: 29 pass, 6 intentional-fail (known_bad/failure_mismatch meta-tests), 0 unexpected fail
Module tier:    1 pass, 0 fail
```

Matches TASK_327 baseline exactly. Zero regression.

### NFR-4 compliance

Zero per-issuer branches. The strip predicate is `\s+\d{1,3}$` on the label string — no `if issuer == ...`, no `if ticker == ...`, no form-type branching anywhere in the change.

### Edge cases
- "Vay 5" → remaining = "Vay" = 3 chars < 5 → NO strip (guard fires)
- "Dự phòng 6" → remaining = "Dự phòng" = 8 chars ≥ 5 → strip
- "Quỹ 2" → remaining = "Quỹ" = 3 chars < 5 → NO strip (guard fires)

## [QA] Acceptance Procedure

1. Verify code site: `_parse_lines_to_rows()` at line ~1120-1135 area
2. Check AC-1 through AC-6 all marked complete
3. Verify regex: `r'\s+\d{1,3}$'` (trailing whitespace + 1-3 digits at end)
4. Verify length guard: `if len(_label_clean) >= 5`
5. Run test: `pytest apps/pdf-extractor/__tests__/unit/test_b02_tctd_parser.py::test_fr2_trailing_noteref_strip -xvs`
6. Run full suite: `pytest apps/pdf-extractor/__tests__/unit/ -xvs` (verify FPT non-regression)
7. Mark TASK_328 DONE; unblock TASK_329

---

## [QA] Review Record

**Date:** 2026-06-28 | **Cycle:** 334 | **Verdict:** APPROVED

### Pipeline results

| Gate | Result |
|---|---|
| FR-2 targeted (7/7 TestFR2TrailingNoterefStrip) | PASS |
| FPT 3-file targeted (122/122) | PASS |
| Full unit suite | 899 pass / 6 fail (all pre-existing PIL-ABI/OCR env) |
| DDD scan | PASS |
| Security scan | PASS |
| NFR-4 scan | PASS — zero per-issuer branches in diff |
| mock-guard | N/A (Python zone) |

### Guard correctness (independent)

| Label | Regex match | len(cleaned) | Action |
|---|---|---|---|
| "Chứng khoán kinh doanh 4" | `\s+\d{1,3}$` matches " 4" | 22 ≥ 5 | STRIP |
| "Nợ 1" | `\s+\d{1,3}$` matches " 1" | 2 < 5 | NO STRIP (guard) |
| "Quỹ phát triển khoa học 2025" | no match (4-digit) | 28 (unchanged) | NO STRIP |

Guard is on REMAINING `len(_label_clean)`, not original label length — confirmed at L1238.

### AC checklist (QA verified)
- [x] AC-1: post-parse label-clean step in `_parse_lines_to_rows()` after `_try_parse_code_row()` — L1231-1240
- [x] AC-2: `re.sub(r'\s+\d{1,3}$', '', label)` applied — L1237
- [x] AC-3: guard `if len(_label_clean) >= 5` — L1238
- [x] AC-4: 7 tests cover all required cases — 7/7 PASS (live run)
- [x] AC-5: FPT non-regression — 122/122 targeted suite PASS
- [x] AC-6: NFR-4 — zero per-issuer branches in production diff

**DJ:** `docs/agent-memory/decisions/sprint-FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT-qa.md` § qa-S3
**Report:** `reports/TASK_REPORT_328.md`
**Unblocks:** TASK_329 (FR-7 notes-section hard stop) — status BACKLOG→READY

---

**Depends on:** TASK_327  
**Blocks:** TASK_329, TASK_330  
**Estimated:** ~2h (code + test + verify)
