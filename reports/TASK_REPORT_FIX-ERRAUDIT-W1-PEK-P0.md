## Task Report — FIX-ERRAUDIT-W1-PEK-P0

**changed:**
- `apps/pdf-extractor/infrastructure/pek_engine_adapter.py` (L216-219: sentinel; L222-245: helper; L367-384: Site B load; L705-714: Site A re-raise; L757-791: Site B guard+runtime; L866-880: Step 5 quarantine branch; L679: RISK-3 guard)
- `apps/pdf-extractor/__tests__/test_pek_engine_adapter.py` (AC-1..AC-5 class + helpers added)

**tests:** 42 passed / 0 failed (python3 -m pytest __tests__/test_pek_engine_adapter.py -v, container vn-market-intelligence-mcp-pdf-extractor-1)

**tsc:** N/A (Python project — no TypeScript files modified)

**ddd:** PASS — all changes in `infrastructure/pek_engine_adapter.py`; no domain/, application/, or interface/ layer files modified; mock-guard EXIT 0 PASS

**security:** PASS — no process.env, no hardcoded secrets/tokens/passwords in modified file; helper `fail_loud_or_tag_degraded` contains zero ticker/entity/date/allowlist literals (AC-5 `test_helper_no_hardcode` confirms via AST inspection)

**verdict: APPROVED**

---

### Forced-Failure Gate Results

**AC-1 — Site A layout crash → RuntimeError propagates:**
`test_ac1_layout_crash_propagates_exception` PASS. Mock `_run_layout_detection` raises `RuntimeError("forced OOM")`. `_run_extraction` now re-raises via `raise RuntimeError(...) from exc` at L711-714. Test confirms `pytest.raises(RuntimeError)` is satisfied — no silent 0-row return. EC-1 confirmed: the raise is inside `except Exception as exc:` which only fires when `_run_layout_detection` throws.

**AC-2 — Site B paddle load failure → table units quarantined with reason="paddle-load-failure":**
`test_ac2_paddle_load_failure_quarantines_table_units` PASS. `fake_models["paddle_table"] = _PADDLE_LOAD_FAILED` sentinel injected. Step 3 guard at L761 (`if paddle_table is _PADDLE_LOAD_FAILED:`) sets `_table_units_degraded=True`, `_table_degraded_reason="paddle-load-failure"`. Step 5 at L866 emits `quarantined=True, quarantine_reason="paddle-load-failure"` for each table unit. `pass_rate_report.units_quarantined > 0` and `units_passing < units_total` confirmed. Result returns normally (no exception).

**AC-2b — Site B runtime table extraction failure → reason="table-extraction-failure":**
`test_ac2b_runtime_table_extraction_failure_quarantines_units` PASS. `paddle_table` is a healthy mock (NOT sentinel); `_run_table_extraction` patched to raise `RuntimeError("CUDA OOM")`. Runtime catch at L781-789 sets `_table_units_degraded=True`, `_table_degraded_reason="table-extraction-failure"`. Step 5 quarantines all table units with the correct reason string.

**EC-1 false-positive guard (AC-3) — table-less PDF stays quarantined=False:**
`test_ac3_table_less_pdf_not_quarantined` PASS. Layout returns 2 pages of prose-only bboxes (label=`_LAYOUT_CLASS_PLAIN_TEXT`). No table units exist in `units_in_map`; `_table_units_degraded` is never set. All emitted units have `quarantined=False`; `pass_rate_report.units_quarantined == 0`; page_zones confirm `page_type in ("prose", "blank")`. EC-1 invariant confirmed — no false quarantine on a genuinely table-less PDF.

**AC-4 — Happy-path regression guard:**
`test_ac4_happy_path_table_pdf_no_quarantine` PASS. Healthy models + table PDF. `_run_table_extraction` returns mock cells. All units `quarantined=False`, `row_count >= 0`, `units_quarantined == 0`. No regression.

**AC-5 — Helper generic contract:**
4 sub-tests PASS: stamps degraded fields correctly; handles empty units list; returns same dict object (mutate in-place); zero forbidden literals in executable code (VNM, bctc, BCTC, 2025, 2026, allowlist, ticker — AST-verified excluding docstring).

---

### Container Rebuild Verification (AC-6)

Container `vn-market-intelligence-mcp-pdf-extractor-1`:
- Image `.Created`: `2026-06-16T01:15:49Z`
- Fix commit `b52f5593` timestamp: `2026-06-16T01:12:10Z`
- Delta: +3min 39s — rebuild confirmed post-commit.
- Container state: `running healthy`

---

### Named-Volume DB Evidence (AC-7)

Query: `SELECT quarantined, quarantine_reason, COUNT(*) FROM bctc_layout_units WHERE page_type='table' GROUP BY quarantined, quarantine_reason ORDER BY cnt DESC`

Result: `175 total table units | 161 quarantined=0 (passing) | 14 quarantined=1 (orphan_rows from pre-fix runs)`

The `paddle-load-failure` and `table-extraction-failure` reason strings are not yet in the live DB because no PaddleOCR-broken extraction run has been triggered against the rebuilt container (PaddleOCR loads successfully in production). The forced-failure paths are exercised exclusively via the pytest forced-mock injection suite — this is the correct and mandated approach (mock-injected unit tests, not live model breakage). The DB confirms quarantine infrastructure is live (14 pre-existing quarantined rows are real, non-constant, varied orphan_rows reasons).

---

### DDD Compliance

- All changes in `infrastructure/pek_engine_adapter.py` (infrastructure layer).
- `interface/handlers.py` NOT modified (HTTP fire-and-forget 202 contract unchanged, ARCH-RATIFY-PEK-3).
- `grep -n "^from domain|^from application"` returns 0 matches.
- `fail_loud_or_tag_degraded` helper: infrastructure-utility, zero domain concepts.
- PEK subtree: `git -C apps/pdf-extractor/PDF-Extract-Kit diff` empty — CONFIRMED.
- Inner re-raise at `_run_layout_detection` L951: UNTOUCHED (`raise` bare re-raise confirmed).
- RISK-3 guard at L679: `paddle_table is not _PADDLE_LOAD_FAILED` added to `set_paddle_table` injection condition — confirmed present.

---

### Pre-existing Flaky Test

`test_extract_layout_and_tables_raises_on_timeout` — classified PASS (not flaky in this run). All 42 tests passed cleanly in 4.59s.

---

### Issues

None. All gate checks pass.
