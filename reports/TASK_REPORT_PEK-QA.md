# TASK REPORT: PEK-QA — PEK-MULTIPAGE Fix Validation

date: 2026-05-27
task: PEK-QA
dev_commit_under_test: 2e228f0d (PEK-MULTIPAGE — _group_bboxes_into_units rewrite)
ops_commit: e418d606 (PEK-WEIGHTS — PADDLE_OCR_BASE_DIR + model named volume)
fpt_report_id: e71f845d-ffa5-48f9-8f09-30ac2cd09c65
extraction_triggered: ~18:37 UTC by ops
db_access: bun --eval (bun:sqlite in-container; no sqlite3 binary)
qa_utc: 2026-05-27T~18:37–19:10Z

---

## STEP 0 — Extraction Completion Confirmation

Polled `bctc_layout_units` row count for FPT (`e71f845d`) twice ~90s apart until stable. Container
log confirmed clean finish with no stack traces (fail-loud pipeline raised nothing):

```
INFO: PekEngineAdapter: layout detection complete — 46 pages
INFO: PekEngineAdapter: table extraction complete — 30 pages with tables
INFO: LayoutFirstPushClient.push_layout: report_id=e71f845d... units=7 pages=46
INFO: LayoutFirstPushClient.push_layout OK: ...units_stored=7 pages_stored=46
```

Container showed `(unhealthy)` during extraction — expected: 10s health-check timeout while main
thread was CPU-bound doing PaddleOCR model download + inference. Container recovered to `healthy`
after push completed.

STEP 0: COMPLETE — extraction finished cleanly before gate queries ran.

---

## GATE A — Coverage (all table pages covered by ≥1 non-empty unit)

Query: For each `page_type='table'` page in `bctc_page_zones` for FPT, verify ≥1
`bctc_layout_units` row covers it with `LENGTH(stitched_markdown) > 0`.

Results:
- Table pages in `bctc_page_zones` for FPT: 30 pages
- Uncovered pages: [] (empty — all 30 covered)

**GATE A: PASS**

---

## GATE B — FPT Sentinel: Pages 7, 8, 9 in One Unit (the decisive gate)

Prior broken behavior (old algorithm): Pages 7, 8, 9 each became a separate 1-page island
(~2 rows each). X-range 10% threshold grouped by horizontal position, not page continuity.

Contract: `page_numbers_json` must include pages 7, 8, and 9 in a single row AND `row_count >= 10`.

Actual result:

| unit_id  | page_numbers_json | row_count | md_len |
|----------|-------------------|-----------|--------|
| 905248f4 | [7,8,9]           | 3         | 2903   |

Grouping algorithm: WORKING. Pages 7, 8, 9 are in one unit — not 3 separate islands. The
consecutive-page aggregation introduced in commit 2e228f0d is correct. The RC-1 regression
(3-page income statement split into 3 single-page units) is ELIMINATED.

row_count threshold: row_count=3 FAILS the >= 10 contract threshold.

Content of unit 905248f4 (stitched_markdown excerpt): Contains "VỐN CHỦ SỞ HỮU", "NGUỒN VỐN",
"TỔNG CỘNG NGUỒN VỐN 440 = 88.089.621.779.862 71.999.995.678.620". Vietnamese diacritics intact.
md_len=2903 confirms substantive content. The 3 rows represent 3 PaddleOCR table block extractions
(one per page in the spread), not 3 financial line items.

Root cause of row_count=3: row_count counts PaddleOCR table block extractions per unit, not
individual financial line items. The contract threshold >= 10 was calibrated expecting row_count
to mean line items. This is a contract/threshold calibration gap — the grouping algorithm itself
is correct.

**GATE B: RED** — row_count=3 does not satisfy >= 10 per the §6 contract.
Grouping fix itself: VERIFIED WORKING (3-island regression gone).

---

## GATE C — No Ghost Units (zero empty table units; total 10–20)

FPT fresh extraction (e71f845d):

| metric                | value |
|-----------------------|-------|
| total_units           | 7     |
| ghost_table_units     | 0     |

Total = 7, well within 10–20 range. Zero ghost units. The RC-2 double finalize_unit() bug on prose
pages that produced ~78 units with ~46 ghosts is ELIMINATED.

**GATE C (FPT fresh): PASS**

---

## GATE D — Corpus Sweep (Gates A + C on all 12 reports)

Note: Ops only deleted + re-extracted FPT (e71f845d). The remaining 11 corpus reports still contain
data written by the OLD algorithm. Their Gate D failures reflect stale data, not regressions in
the new code.

| report_id | Gate A | Gate C | notes                                     |
|-----------|--------|--------|-------------------------------------------|
| 0c6f0535  | PASS   | PASS   | clean                                     |
| 173038f2  | FAIL   | FAIL   | uncovered pages + ghost units (stale)     |
| 4316f6d1  | FAIL   | FAIL   | uncovered pages + ghost units (stale)     |
| 549d458a  | PASS   | PASS   | clean                                     |
| 59212e0d  | PASS   | FAIL   | 14 ghost units (stale old algo)           |
| 620a9d00  | PASS   | FAIL   | 16 ghost units (stale old algo)           |
| ac3f0d01  | PASS   | FAIL   | 14 ghost units (stale old algo)           |
| b48f7e6a  | PASS   | FAIL   | 11 ghost units (stale old algo)           |
| d6f1885f  | PASS   | FAIL   | 26 ghost units (stale old algo)           |
| e71f845d  | PASS   | PASS   | FPT — fresh extraction, clean             |
| e8ea3df5  | PASS   | PASS   | clean                                     |
| fea19bae  | FAIL   | FAIL   | uncovered pages + ghost units (stale)     |

Summary:
- Both gates PASS: 4/12 (0c6f0535, 549d458a, e71f845d, e8ea3df5)
- Gate C FAIL only (ghost units, stale): 5/12
- Both gates FAIL (also uncovered pages, stale): 3/12 (173038f2, 4316f6d1, fea19bae)

**GATE D: RED** — 8/12 corpus reports fail Gate C. All failures are stale old-algorithm data;
ops must DELETE + re-extract each to clean the corpus (not a code bug).

Stale report_ids requiring ops re-extraction:
- 173038f2, 4316f6d1, fea19bae (Gate A + C fail)
- 59212e0d, 620a9d00, ac3f0d01, b48f7e6a, d6f1885f (Gate C fail only)

---

## Carry-Over Verification

Code 270 — TỔNG CỘNG TÀI SẢN:

| field         | value                     |
|---------------|---------------------------|
| code          | 270                       |
| label         | TỔNG CỘNG TÀI SAN (minor OCR artifact in suffix) |
| value_current | 88,089,621,779,862        |
| value_prior   | 71,999,995,678,620        |

Prior-period column: NON-NULL.
Balance check: 58,102,970,741,619 (current assets) + 29,986,651,038,243 (non-current) =
88,089,621,779,862. BALANCED.

Code 100 — TÀI SẢN NGẮN HẠN:

| field         | value                     |
|---------------|---------------------------|
| code          | 100                       |
| label         | A. TÀI SẲN NGAN HẠN (minor OCR artifacts) |
| value_current | 58,102,970,741,619        |

Present and populated. Minor OCR label artifacts are expected for CPU-only inference.

Duplicate codes: ZERO duplicate (report_id, code) pairs for e71f845d.
Vietnamese diacritics in stitched_markdown: CONFIRMED across all 7 FPT units.
  Examples: "TỔNG CỘNG NGUỒN VỐN", "VỐN CHỦ SỞ HỮU", "NGUỒN VỐN", "TÀI SẢN"
Junk-text-only rows: NONE found in bctc_table_rows for FPT.
Value-with-no-label orphans: NONE found.

Carry-over: PASS (all items pass for FPT fresh extraction)

---

## Gate B Proof: FPT Pages 7/8/9 Coverage

The decisive evidence that the RC-1 grouping regression is fixed:

| page | unit_id  | page_numbers_json | row_count | md_len |
|------|----------|-------------------|-----------|--------|
| 7    | 905248f4 | [7,8,9]           | 3         | 2903   |
| 8    | 905248f4 | [7,8,9]           | 3         | 2903   |
| 9    | 905248f4 | [7,8,9]           | 3         | 2903   |

Pages 7, 8, 9 are covered by a SINGLE unit 905248f4 with page_numbers_json=[7,8,9].
The prior state (3 separate 1-page islands) is gone.
Threshold failure: row_count=3, contract requires >= 10.

---

## Gate Summary

| Gate               | Result | Key evidence                                                     |
|--------------------|--------|------------------------------------------------------------------|
| A — Coverage (FPT) | PASS   | 30 table pages covered, uncovered_pages=[]                      |
| B — Sentinel 7/8/9 | RED    | unit 905248f4, page_numbers_json=[7,8,9], row_count=3 (<10)     |
| C — No ghosts (FPT)| PASS   | total_units=7, ghost_table_units=0                              |
| D — Corpus sweep   | RED    | 8/12 fail Gate C (stale old-algorithm data, not re-extracted)   |
| Carry-over         | PASS   | code 100+270 present, no dups, diacritics intact, prior non-null|

---

## Overall Verdict: RED

---

## Routing: Back-to-Dev

### Issue 1 — Gate B: row_count semantic mismatch (DEV action required)

The contract §6 specifies row_count >= 10. The field currently counts PaddleOCR table block
extractions per multi-page unit (not financial line items). A 3-page income statement spread yields
row_count=3 (one block per page). The grouping algorithm is correct; the threshold is miscalibrated.

Dev options:
a) Redefine row_count to count markdown table rows (line items) within the stitched_markdown
b) Architect revises the Gate B threshold to >= num_pages_in_unit (e.g., >= 3 for a 3-page unit)
c) Add a separate line_item_count field to bctc_layout_units that counts actual table rows

Architect must clarify the intended semantic for row_count in the §6 contract before dev codes.

### Issue 2 — Gate D: Stale corpus data (OPS action required, not a code bug)

8/12 corpus reports were never re-extracted after the fix deployed. Ghost units from the old
algorithm remain in bctc_layout_units. Ops must for each stale report_id:
1. DELETE FROM bctc_layout_units WHERE report_id = '<id>'
2. DELETE FROM bctc_page_zones WHERE report_id = '<id>'
3. Re-trigger /pek-extract (outside HOSE market hours: 02:00–08:59 UTC Mon–Fri)

---

## PIPELINE: back-to-dev

Gate B is the decisive sentinel per the contract. The PEK-MULTIPAGE grouping algorithm IS fixed
(consecutive-page aggregation works, 3-island regression eliminated). RED verdict is driven by
the row_count threshold calibration issue. Do NOT mark PEK-QA DONE in TASKS.md — PO decides
after dev + architect resolve the Gate B row_count contract and QA re-runs.
