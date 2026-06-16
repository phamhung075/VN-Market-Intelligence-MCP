---
task_id: FIX-ERRAUDIT-W1-PEK-P0
qa_cycle: 274
qa_date: 2026-06-16
verdict: APPROVED
---

# QA Report — FIX-ERRAUDIT-W1-PEK-P0

## [QA] Review Record

**Verdict: APPROVED**

**Container:** vn-market-intelligence-mcp-pdf-extractor-1 — `.Created` 2026-06-16T01:15:49Z > commit b52f5593 01:12:10Z — rebuild confirmed (AC-6).
**Status:** running healthy.

---

## Forced-Failure Gate (DoD)

| Gate | Test | Result | Evidence |
|---|---|---|---|
| AC-1: layout crash → RuntimeError, no silent 0-row | `test_ac1_layout_crash_propagates_exception` | PASS | `pytest.raises(RuntimeError)` satisfied; outer re-raise at L711-714 fires; no dict returned |
| AC-2: paddle load failure → quarantined=True, reason="paddle-load-failure" | `test_ac2_paddle_load_failure_quarantines_table_units` | PASS | sentinel `_PADDLE_LOAD_FAILED` → Step 3 L761 sets flag → Step 5 L866 quarantines; `units_quarantined > 0` |
| AC-2b: paddle runtime crash → reason="table-extraction-failure" | `test_ac2b_runtime_table_extraction_failure_quarantines_units` | PASS | runtime except L781-789 sets `_table_degraded_reason="table-extraction-failure"` → Step 5 quarantines |
| EC-1: table-less PDF → quarantined=False (false-positive guard) | `test_ac3_table_less_pdf_not_quarantined` | PASS | prose-only layout → no table units → `units_quarantined == 0`; `quarantined=False` on all units |
| AC-4: happy-path regression | `test_ac4_happy_path_table_pdf_no_quarantine` | PASS | healthy models + table PDF → `quarantined=False`, `row_count >= 0`, no exception |

---

## AC-5 Helper Generic Contract

| Sub-test | Result |
|---|---|
| `test_helper_stamps_degraded_fields` | PASS |
| `test_helper_empty_units_list` | PASS |
| `test_helper_mutates_and_returns_same_dict` | PASS |
| `test_helper_no_hardcode` (AST-verified, non-docstring lines) | PASS |

---

## Full Test Suite

42 passed / 0 failed in 4.59s
`python3 -m pytest __tests__/test_pek_engine_adapter.py -v`

`test_extract_layout_and_tables_raises_on_timeout`: PASSED (not flaky in this run — classified N/A as pre-existing flaky note from pm-brief per memory; result is green).

---

## Implementation Verification (Code Audit)

All 6 required edits confirmed present in `apps/pdf-extractor/infrastructure/pek_engine_adapter.py`:

1. **Sentinel L219:** `_PADDLE_LOAD_FAILED: object = object()` — CONFIRMED
2. **Helper L222-245:** `fail_loud_or_tag_degraded(result, status)` — CONFIRMED, generic, zero hardcode
3. **Site B load L367-384:** `paddle_table: Any = None` init; except sets `paddle_table = _PADDLE_LOAD_FAILED` — CONFIRMED
4. **Site A outer catch L705-714:** `raise RuntimeError(f"...DocLayout-YOLO...") from exc` — CONFIRMED (replaces silent `logger.error` + fallback)
5. **Site B guard+runtime L757-791:** three-branch (`is _PADDLE_LOAD_FAILED` / `is not None` / else) + runtime catch sets flags — CONFIRMED
6. **Step 5 table branch L865-880:** `if _table_units_degraded:` quarantine path — CONFIRMED
7. **RISK-3 guard L679:** `paddle_table is not _PADDLE_LOAD_FAILED` added to `set_paddle_table` injection condition — CONFIRMED

**Inner `_run_layout_detection` re-raise L951:** bare `raise` UNTOUCHED — CONFIRMED.

---

## DDD / Security / Mock-Guard

- **DDD:** PASS — no domain/, application/ layer imports in modified file; all changes in infrastructure layer
- **Security:** PASS — no process.env, no hardcoded secrets; SQL not touched; helper contains no ticker/entity/date literals
- **Mock-guard:** EXIT 0 PASS — no fabricated-data patterns in production source
- **PEK subtree:** `git -C apps/pdf-extractor/PDF-Extract-Kit diff` EMPTY — CONFIRMED

---

## Named-Volume DB Evidence (AC-7)

```sql
SELECT quarantined, quarantine_reason, COUNT(*) FROM bctc_layout_units
WHERE page_type='table' GROUP BY quarantined, quarantine_reason;
```

Result (live, named-volume keinos/sqlite3):
- `quarantined=0, reason=NULL`: 161 rows (passing)
- `quarantined=1, reason=orphan_rows:*`: 14 rows (pre-fix quarantine, varied real reason strings — NOT constants)

The `paddle-load-failure` and `table-extraction-failure` strings are not yet in the live DB: PaddleOCR loads successfully in production, so no broken-path extraction has run since the rebuild. Forced-failure paths are verified exclusively via pytest mock injection (the correct DoD approach — live model breakage is not required by the ac-brief; mock injection with `_PADDLE_LOAD_FAILED` sentinel IS the contracted test method per pm-brief AC-2/architect test matrix).

Total: 175 table units, 14 quarantined — real, varied, non-constant values confirmed.

---

## Report

Full report: `reports/TASK_REPORT_FIX-ERRAUDIT-W1-PEK-P0.md`
