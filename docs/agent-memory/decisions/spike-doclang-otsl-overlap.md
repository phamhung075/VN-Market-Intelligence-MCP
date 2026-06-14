# Decision Journal — SPIKE-DOCLANG-OTSL-OVERLAP

**task_id:** SPIKE-DOCLANG-OTSL-OVERLAP
**date:** 2026-06-13
**agent:** architect
**zone:** apps/pdf-extractor/
**decision:** CLOSE spike — do NOT build DocLang serializer

---

## What was considered

**Option A (build DocLang serializer as CI/eval gate):** Wire a thin
`ExtractedTableDTO → .dclg.xml` serializer alongside existing 6-stage BCTC
eval gates. Would catch structural table defects via DocLang XSD + Schematron
rectangular rule (every row must have same cell count as header row).

**Option B (close spike, no build):** DocLang adds nothing over the native
flow. Record reason and close.

---

## Measurement procedure

1. Pulled 5 most-recent BCTC reports (9 distinct report_ids total) from live
   pipeline DB (via docker exec on pdf-extractor container). Reports dated
   2026-05-25 through 2026-06-12.

2. Reconstructed `ExtractedTableDTO`-shaped tables from `bctc_table_rows`
   (grouped by page_number + statement_section): 17 pseudo-tables, headers
   derived from schema columns [code?, label, value_current?, value_prior?].

3. Serialized to DocLang `.dclg.xml` (namespace https://www.doclang.ai/ns/v0):
   headers → `<ched/>`, rows → `<fcel/>`, row terminator → `<nl/>`.

4. Ran `doclang.validate()` (XSD + Schematron) from local doclang repo
   (installed into `.venv`). Confirmed validator is live: deliberate rectangular
   violation caught correctly (injected 2-cell row into 3-col table → Schematron
   `table-rectangular-grid` fired).

5. Ran native gates:
   - Stage 4_TABLE_RECONSTRUCT thresholds (bctc-eval-thresholds.json):
     `label_coverage_min=0.90`, `code_coverage_min=0.80`, `exact_dup_max=0`,
     `value_blank_label_max=0`
   - `domain/primitives/layout_invariants/primitive.py`:
     `check_no_orphan_rows()`, `check_codes_monotonic()`,
     `check_balance_identity()`

---

## Results

| Metric | Count |
|---|---|
| Reports processed | 5 |
| Tables measured (structured layer) | 17 |
| DocLang flagged | 0 |
| Native flagged | 7 |
| Both flagged | 0 |
| Only DocLang (NET-NEW) | **0** |
| Only native | 7 |

Also examined `bctc_layout_units` layer (62 table-type units):
- 51/62 appear jagged in markdown col-count parse
- All 51 are OCR-collapsed pages (entire page content in 1 cell) — artifact
  of PEK/layout detector failure, not genuine structural jaggedness
- 4/51 already quarantined by layout detector
- Remaining 47: pass through field_extractor → caught by native code_coverage
  or orphan_rows gates at the bctc_table_rows level

---

## Root cause: why DocLang finds nothing

The DocLang Schematron `table-rectangular-grid` rule checks only:
> "all rows must have the same number of cell-starting tokens before each `<nl/>`"

Our extractor writes `bctc_table_rows` with a FIXED schema
`[code?, label, value_current?, value_prior?]`. When serialized to OTSL,
every row always produces exactly `n_cols` `<fcel/>` cells — orphan rows
(label present, value empty string) are STRUCTURALLY valid XML with the
correct cell count. The defect is semantic (missing value) not structural
(wrong column count). DocLang's validator has no semantic quality checks
for cell emptiness; XSD validates only element ordering/types.

Native `check_no_orphan_rows()` checks semantics:
`has_label AND NOT has_any_value → orphan`. This is the disjoint class
DocLang cannot reach.

---

## Decision

**Option B: CLOSE. DocLang adds nothing over the native flow. Do NOT build.**

Rationale:
- only-DocLang: 0 (0% of tables)
- only-native: 7 (41% of tables)
- DocLang's rectangular rule is made redundant by the fixed-width output
  contract of our bctc_table_rows schema. The remaining structural defects
  (orphan rows, code coverage gaps) are semantic quality gates beyond
  DocLang's scope.
- Building a serializer would add complexity (a new format, XML dependency,
  Schematron runtime) with zero defect coverage gain.

---

## Artifacts

- Measurement script: `scripts/spike-doclang-otsl-overlap.py`
- Input data: `bctc_table_rows` (live DB, 5 reports, 891 rows total)
- DocLang repo: `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/doclang`
  (commit at time of spike: local HEAD)
- orch-state: SPIKE-DOCLANG-OTSL-OVERLAP → DONE
