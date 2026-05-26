# Task Report: BT3-QA2 — Formal Acceptance Sign-off, BCTC Table Fix BT3-FIX5

date: 2026-05-26
task: BT3-QA2
commit_under_review: 81970243
deployed_by: BT3-DEPLOY2 (image rebuilt, container recreated, 3 markers verified live)
report_id: e71f845d-ffa5-48f9-8f09-30ac2cd09c65 (FPT Q4 2025 consolidated balance sheet)
outcome: APPROVED
round: 1

---

## Verification Method

All checks run independently by QA. No reliance on developer/ops claims.

- Live endpoint: `GET http://localhost:3000/api/bctc-inspect/table/e71f845d-ffa5-48f9-8f09-30ac2cd09c65`
- In-container direct DB: `docker exec vn-market-intelligence-mcp-mcp-server-1 bun -e '...'` with `bun:sqlite`, `readonly: true`
- Unit test suite: `python3 -m pytest __tests__/unit/ -v` (285 tests)
- Import-linter fence: `lint-imports --config pyproject.toml`

---

## Test Results

### pdf-extractor unit suite
- Tests: 285 passed / 0 failed
- New BT3-RETHINK diacritics tests: 32/32 PASS (`test_bt3rethink_diacritics.py`)
- Regression: `test_financial_validation.py` 12/12 PASS, `test_text_table_extractor.py` 20/20 PASS
- `test_vn_number_normalize.py` 17/17 PASS

### TypeScript / tsc
Not applicable — zero TS files changed in commit 81970243. Pre-existing tsc state unchanged (EXIT:0 from cycle-118).

---

## DDD Compliance: PASS

`apps/pdf-extractor/infrastructure/text_table_extractor.py` imports:
- `re`, `logging`, `unicodedata` — Python stdlib, infrastructure layer
- `domain.primitives.vn_number_normalize.primitive` — correct direction (infra imports domain primitives)
- `domain.primitives.select_period_column.primitive` — correct direction

Zero infrastructure-from-domain violations. Import-linter: Fence-A KEPT, Fence-B KEPT (73 files, 132 deps, 2 contracts kept, 0 broken).

---

## Security: PASS

- Zero `process.env` usage in modified file
- Zero hardcoded credentials, passwords, secrets, or API keys
- No new external I/O paths

---

## Acceptance Criteria — Live Endpoint Verification

Endpoint: `GET /api/bctc-inspect/table/e71f845d-ffa5-48f9-8f09-30ac2cd09c65`
Total rows: 79 | In-container DB count: 79 rows (exact match)

| AC | Criterion | Target | Observed | Verdict |
|---|---|---|---|---|
| AC-1 | Orphans (code IS NULL) | <= 2 | 0 | PASS |
| AC-2 | Zero junk rows (headers/date/signature/garbled-null) | 0 | 0 | PASS |
| AC-3a | code 222 value_current | 29,148,692,599,137 | 29,148,692,599,137 | PASS |
| AC-3a | code 222 value_prior | 24,457,733,666,511 | 24,457,733,666,511 | PASS |
| AC-3b | code 223 value_current | -13,762,875,752,850 | -13,762,875,752,850 | PASS |
| AC-3b | code 223 value_prior | -11,683,165,704,793 | -11,683,165,704,793 | PASS |
| AC-3c | code 226 value_current | -4,593,793,590 | -4,593,793,590 | PASS |
| AC-3d | code 131 value_current | 12,733,504,688,522 | 12,733,504,688,522 | PASS |
| AC-3d | code 131 value_prior | 10,537,019,113,380 | 10,537,019,113,380 | PASS |
| AC-3e | code 319 value_current | 1,014,673,786,632 | 1,014,673,786,632 | PASS |
| AC-3e | code 319 value_prior | 874,015,837,328 | 874,015,837,328 | PASS |
| AC-3f | code 421b value_current | 6,924,484,515,123 | 6,924,484,515,123 | PASS |
| AC-3f | code 421b value_prior | 5,572,300,562,297 | 5,572,300,562,297 | PASS |
| AC-4 | sentinel 100 value_current | 58,102,970,741,619 | 58,102,970,741,619 | PASS |
| AC-4 | sentinel 270 value_current | 88,089,621,779,862 | 88,089,621,779,862 | PASS |
| AC-4 | sentinel 300 value_current | 44,338,155,487,272 | 44,338,155,487,272 | PASS |
| AC-4 | sentinel 400 value_current | 43,751,466,292,590 | 43,751,466,292,590 | PASS |
| AC-4 | sentinel 440 value_current | 88,089,621,779,862 | 88,089,621,779,862 | PASS |
| AC-5 | value_prior populated for all coded rows | 0 NULL priors on coded rows | 0 | PASS |
| AC-6 | No duplicate codes | 0 dups | 0 dups | PASS |
| AC-7 | balance_delta = 0 | 0 | 0 | PASS |
| AC-8 | Diacritics robustness unit tests | 32/32 | 32/32 | PASS |
| AC-9 | Positional cutoff unit test | included in AC-8 suite | 5/5 cutoff tests | PASS |
| AC-10 | Import-linter fence exit 0 | exit 0, 0 broken | exit 0, 0 broken | PASS |
| AC-11 | Non-regression: total code rows >= 72 | >= 72 | 79 coded rows | PASS |

### Ruling D (Fixture): PASS

`__tests__/fixtures/fpt_q4_2025_pages_4-7.txt` line 1 header comment:
```
# Fixture: poppler OCR, e71f845d, FPT Q4 2025 balance sheet pages 4-7
# Generated: 2026-05-26 via docker exec + PdfOcrAdapter.ocr_pages() (pdf2image 200DPI, pytesseract vie+eng --psm 6)
# DO NOT replace with PyMuPDF/spike text — substrate mismatch causes false-green
```
Substrate mismatch (root cause of 6 prior false-greens) confirmed eliminated.

---

## Code-Label Structural Alignment: PASS

All 10 spot-checked structural code-label pairs aligned correctly. Codes ascend 100 to 440. Two OCR-garbled rows accepted per brief:
- `code=134`: label garbled by poppler ("Sabb lại thee ten đ©ÌEể hoạch") — correct code + correct values (curr=200,405,269,967 / prior=136,097,256,629). Accepted: OCR character-quality blemish, NOT structural fault.
- `code=317`: label garbled ("6. LH RE" aD GED USUTEETO") — correct code + correct values (curr=85,650,109,236 / prior=92,738,882,375). Accepted per brief.

One note on `code=418`: `value_current=None`, `value_prior=2,033,289,141,535`. This is an accounting reality — the development investment fund (Quỹ đầu tư phát triển) had zero balance in Q4 2025 but non-zero in prior period. Not a structural fault; AC-5 tests only `value_prior` nulls on coded rows.

---

## Forbidden-Gate Compliance

- balance_pass=True NOT used as sole gate. All 11 ACs independently verified.
- Fixture test green alone: NOT used as gate. Live endpoint verified row-by-row.
- rows_stored echo: NOT used. In-container `bun:sqlite` SELECT verified actual DB count (79).

---

## Files Changed in 81970243

```
apps/pdf-extractor/__tests__/fixtures/fpt_q4_2025_pages_4-7.txt  (replaced — poppler substrate)
apps/pdf-extractor/__tests__/unit/test_bt3rethink_diacritics.py   (new — 32 tests)
apps/pdf-extractor/__tests__/unit/test_text_table_extractor.py    (updated)
apps/pdf-extractor/infrastructure/text_table_extractor.py         (modified — Rulings A/B/C/D)
```

Zero mcp-server files. Zero schema files. Frozen surfaces untouched.

---

## Blocking Issues: NONE

---

## Verdict: APPROVED

BT3-FIX5 (commit 81970243) passes all acceptance criteria. The BCTC table for report `e71f845d` is structurally correct: 79 rows, 0 orphans, 0 junk rows, 0 dup codes, all 6 embedded codes recovered, all 5 sentinels exact, balance_delta=0.

The six prior false-greens are explained and resolved: substrate mismatch (PyMuPDF fixture vs live poppler) eliminated by Ruling D fixture regeneration; diacritic-insensitive matching (Ruling C) makes parser immune to rasterizer variation; positional cutoff (Ruling A) eliminates post-table signature noise; Layout 5 scan-and-extract (Ruling B) recovers embedded codes regardless of label diacritic fidelity.

---

## Merge Status

No branch to merge (no-branch policy — all work on main). Commit 81970243 is already on main. No merge action required.
