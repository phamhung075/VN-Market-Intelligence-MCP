<!-- size-justification: P0 fix spec — single file, two adjacent sites + one helper, DDD mapping, acceptance criteria, false-positive guard, forced-failure DoD. Structural load-bearing for architect+pm+dev-pdf-extractor+qa chain. -->

# BA Spec — FIX-ERRAUDIT-W1-PEK-P0

**Epic:** ERROR-AUDIT-2026-06-15 · Wave 1 · P0
**Zone:** `apps/pdf-extractor/`
**Chain:** ba → architect → pm → dev-pdf-extractor → qa
**BA task_id:** FIX-ERRAUDIT-W1-PEK-P0
**Created:** 2026-06-16T00:00:00Z
**Status:** SPEC COMPLETE — ZERO PO BLOCKERS

---

## Summary

Two live data-masking bugs in `pek_engine_adapter.py`. Both share the same antipattern: a CRASHED model (OOM / native-lib fault / package load failure) is silently swallowed and the pipeline continues, assembling a fully-formed result dict that is indistinguishable from a successful extraction on a PDF with no tables. The recurrence class is **BCTC silent-0-rows** — the same class as `FIX-BCTC-ENRICH-SILENT-0ROWS` and the sibling Wave-1 MCP P0 fix.

Fix philosophy (mirror the sibling W1 MCP spec): smallest correct change — pure crash→tagged-marker. Ship the generic Python helper `fail_loud_or_tag_degraded` as a by-product. No caller contract changes at the HTTP boundary.

---

## Site A — `pek_engine_adapter.py:668` — Layout-detection crash swallowed

**File:** `apps/pdf-extractor/infrastructure/pek_engine_adapter.py`
**Method:** `PekEngineAdapter._run_extraction` (called within semaphore guard)
**DDD Layer:** Infrastructure (owns ML model lifecycle, zero domain logic)

### What exists today

Lines 658-673 inside `_run_extraction`:

```python
if layout_task is not None:
    try:
        pages_bboxes, page_dims = self._run_layout_detection(
            layout_task=layout_task,
            pdf_path=pdf_path,
        )
        ...
    except Exception as exc:
        logger.error(
            "PekEngineAdapter: layout detection failed: %s — "
            "using empty bbox fallback",
            exc,
        )
        # FALLS THROUGH — pages_bboxes stays {}
```

After the swallowed exception:
- `pages_bboxes` is `{}` (empty dict, same as a genuinely blank PDF)
- Line 687: `total_pages = max(pages_bboxes.keys()) if pages_bboxes else 0` → `total_pages = 0`
- Line 700: `units_in_map = []` (empty loop body, nothing to iterate)
- The `return` at line 832 emits: `document_map.total_pages=0`, `units=[]`, `pass_rate_report.units_total=0`, `units_passing=0`

The caller (`extract_layout_and_tables`) receives this and treats it as a successful extraction. A layout-detection OOM crash on the 8GB host produces output identical to "this PDF has no pages".

**Note on `_run_layout_detection` internals:** The private helper already re-raises (lines 872-876 inside `_run_layout_detection`). The swallow happens at the OUTER try/catch in `_run_extraction:668`. The fix must target the outer catch, not the inner helper.

### Required behavioral change (FR-A1)

When `layout_task is not None` AND `_run_layout_detection` raises, `_run_extraction` MUST NOT continue with empty `pages_bboxes`. It must mark the result as degraded. Two acceptable mechanisms — architect ratifies the final choice (ARCH-RATIFY-PEK-1):

**Option A — Re-raise:** Propagate the exception out of `_run_extraction`. The `ThreadPoolExecutor.future.result()` path at line 618 already propagates exceptions to the caller (`extract_layout_and_tables`), which will raise to the HTTP handler. The handler logs and returns HTTP 500. Consistent with how load failures already work at `_load_pek_models` (lines 303-316, which already re-raise).

**Option B — Tag degraded via helper:** Call `fail_loud_or_tag_degraded(result_stub, status="layout-crash")` which stamps the result dict with `extraction_status="degraded"`, `degraded=True`, `degraded_reason="layout-detection-crash"`, `quarantined=True` on all units. Continue building a minimal result dict (no pages, no units), but mark it unambiguously as degraded. Caller receives the dict at HTTP 200, but the degraded flag is set.

**BA recommendation:** Option A (re-raise) is cleaner — a layout crash on a non-None layout_task is a deployment/host fault (OOM, native-lib), not a graceful-degrade scenario. The existing `_load_pek_models` already takes this position (lines 303-316). Option B is acceptable if architect determines that HTTP-200-with-degraded-flag is preferable for the refine orchestrator's error handling. Either option eliminates the silent-0-rows masking.

**What is prohibited in either case:** The pipeline MUST NOT continue assembling `units_in_map` from empty `pages_bboxes` and return a result with `quarantined=False`, `units_passing==units_total` when `units_total==0`. That is the current broken behavior.

### NFR-A1 — Single site, no touch of `_run_layout_detection`

The inner helper `_run_layout_detection` already re-raises correctly (lines 872-876). Do NOT touch it. The outer try/catch at line 668 is the ONLY change target.

### NFR-A2 — layout_task=None path unchanged

The existing `else` branch at line 674 (`layout_task unavailable — using pdf2image page count fallback`) is a deliberate design choice for when the YAML config is absent (disabled layout detection). This branch MUST NOT be touched — it is not a crash scenario.

---

## Site B — `pek_engine_adapter.py:342` + `:717` — PaddleOCR load failure swallowed

**File:** `apps/pdf-extractor/infrastructure/pek_engine_adapter.py`
**Functions:** `_load_pek_models` (load site :342) + `PekEngineAdapter._run_extraction` (guard site :717)
**DDD Layer:** Infrastructure

### What exists today

**Load site (line 342)** inside `_load_pek_models`:

```python
paddle_table = None
try:
    from paddleocr import PaddleOCR
    paddle_table = PaddleOCR(...)
    logger.info("PekEngineAdapter: PaddleOCR PP-StructureV2 table mode loaded (CPU)")
except Exception as exc:
    logger.warning(
        "PekEngineAdapter: PaddleOCR table mode load failed: %s — "
        "table structure extraction disabled",
        exc,
    )
    # paddle_table stays None — no re-raise
```

`_load_pek_models` returns `{"layout_task": ..., "paddle_table": None}`. The None is cached in `_pek_models_cache` indefinitely (singleton).

**Guard site (line 717)** inside `_run_extraction`:

```python
table_cells_by_page: Dict[int, Dict[int, List[Dict]]] = {}
if paddle_table is not None:
    try:
        table_cells_by_page = self._run_table_extraction(...)
        ...
    except Exception as exc:
        logger.warning("PekEngineAdapter: table extraction failed: %s", exc)
# else: silently skipped — table_cells_by_page stays {}
```

When `paddle_table is None`, the guard silently skips table extraction. `table_cells_by_page` stays empty. Step 5 then assembles units with `row_count=0`, `quarantined=False`. The `pass_rate_report` shows `units_passing==units_total` — a clean-looking pass.

**The masking chain:**
- PaddleOCR fails to load (package error / native-lib crash) at container start
- `paddle_table = None` cached as the permanent model state
- Every subsequent extraction silently has no table extraction
- All table units assemble with `row_count=0`, `quarantined=False`
- Result looks identical to a PDF with no tables

**Contrast — correct pattern:**
`extract_layout_first_usecase.py:450` already quarantines on exception during `_ocr_unit`:

```python
except Exception as exc:
    logger.warning("ExtractLayoutFirstUseCase: ocr_unit failed ... storing as quarantined", ...)
    unit_ocr_results.append({
        "unit_id": unit_id,
        ...
        "row_count": 0,
        "_ocr_error": str(exc),
    })
```

The fix for Site B must align to this behavior: when `paddle_table is None` (load failure), table units must be tagged quarantined, not assembled as clean 0-row passes.

### Required behavioral change (FR-B1) — Load site

When `_load_pek_models` catches a PaddleOCR load exception, it must NOT silently continue with `paddle_table = None`. Two acceptable options — architect ratifies (ARCH-RATIFY-PEK-2):

**Option A — Re-raise at load time:** Mirror the layout_task load failure at lines 303-316 which already re-raise. If PaddleOCR cannot be loaded, the whole model-load fails loudly. Container startup or first extraction request fails with a clear error. Ops sees it in logs.

**Option B — Tag at load time, propagate sentinel:** `_load_pek_models` stores a special sentinel (e.g. `paddle_table = PADDLE_LOAD_FAILED_SENTINEL`, a distinct object) instead of `None`. The guard at line 717 checks for this sentinel and calls `fail_loud_or_tag_degraded` to stamp all units as quarantined rather than silently skipping.

**BA recommendation:** Option A (re-raise) aligns with the existing layout_task load-failure behavior (lines 303-316) and is the simplest. Option B is acceptable if architect determines that a PaddleOCR load failure is a graceful-degrade scenario (distinct from a layout crash). Either option closes the masking.

### Required behavioral change (FR-B2) — Guard site

Regardless of which option is chosen for FR-B1: the `if paddle_table is not None:` guard at line 717 MUST NOT silently skip table extraction without tagging the result. The current `else: # nothing` branch is the masking site. Either:
- (if FR-B1 Option A) The load failure already raised before we get here — this branch is unreachable on a load failure
- (if FR-B1 Option B) The `else:` branch calls `fail_loud_or_tag_degraded` to mark all table-type units as quarantined

A third scenario is a runtime `_run_table_extraction` exception when `paddle_table is not None` (line 729 catch). This must also tag units as quarantined (not just `logger.warning`). This is FR-B3.

### Required behavioral change (FR-B3) — Runtime table extraction failure

Line 729 catch currently only logs a warning. When `_run_table_extraction` raises, `table_cells_by_page` stays empty but units assemble as clean 0-row passes (same masking). The fix: the catch at line 729 must also call `fail_loud_or_tag_degraded` (or set a local flag checked in Step 5 to quarantine all table units).

---

## The `fail_loud_or_tag_degraded` Helper (FR-C1)

**New file:** `apps/pdf-extractor/infrastructure/pek_helpers.py` (or inline at top of `pek_engine_adapter.py` — architect decides location per DDD layer rules)
**DDD Layer:** Infrastructure

### Contract (from audit brief §EASY-HANDLE / Python section)

```python
def fail_loud_or_tag_degraded(result: dict, status: str) -> dict:
    """
    Stamp a partial result dict as degraded.

    Sets:
        result["extraction_status"] = status   # e.g. "layout-crash", "paddle-load-failure"
        result["degraded"] = True
        result["degraded_reason"] = status
        for each unit in result.get("units", []):
            unit["quarantined"] = True
            unit["quarantine_reason"] = status

    Returns the mutated result dict.

    Usage: called when a model crash must be distinguished from a genuine 0-row extraction.
    The caller may choose to re-raise instead of calling this helper — in that case the HTTP
    handler does the logging. This helper is for the Option B (tag-and-continue) path.
    """
```

### Generic mandate (FR-C2)

The helper is GENERIC — no ticker, no report_id, no date, no allowlist, no per-instance logic. It stamps whatever dict is passed. The `status` parameter is a string label chosen by the call site (e.g. `"layout-crash"`, `"paddle-load-failure"`, `"table-extraction-failure"`). The helper knows nothing about BCTC or any specific entity.

### Scope boundary (FR-C3)

This is the Wave-1 helper. `parse_or_raise` and `validate_or_unknown` (audit brief Wave-3 / pdf-extractor-04 and pdf-extractor-01) are NOT in scope for this task. Architect must gate those to Wave-3.

---

## Edge Cases

**EC-1 — Genuinely table-less PDF (critical false-positive guard)**
A PDF that has no tables (e.g. a purely textual disclosure notice) must NOT be quarantined. The distinction:
- Genuine table-less: layout detection SUCCEEDS, returns pages with no `label==5` bboxes → `page_type="prose"` or `page_type="blank"` for all units → `row_count=0`, `quarantined=False`. This is correct behavior; do NOT change it.
- Crash scenario: `_run_layout_detection` RAISES → pages_bboxes is never populated → fix kicks in.

The guard is the exception boundary: `quarantined=True` fires ONLY on a thrown exception, never on a successful return of empty results. Architect must confirm this invariant is preserved in the design.

**EC-2 — layout_task=None (disabled layout detection, not a crash)**
When the YAML config file is absent, `_load_pek_models` sets `layout_task = None` and logs a warning (lines 317-322). The fallback at line 679 (`_get_page_dims_fallback`) runs. This is an intentional config path, NOT a crash. `fail_loud_or_tag_degraded` must NOT be called on this path. The fix scope is exclusively: `layout_task is not None AND _run_layout_detection raises`.

**EC-3 — Singleton cache with a loaded model that crashes at runtime**
`_pek_models_cache` is set once at first call. If `paddle_table` loaded successfully but crashes during `_run_table_extraction` (line 729), that is FR-B3 (runtime failure, not load failure). The fix for FR-B3 handles this case independently of FR-B1/B2.

**EC-4 — Semaphore / timeout interaction**
The extraction runs inside `ThreadPoolExecutor` with `_EXTRACTION_TIMEOUT_SECONDS` (default 30min). If `_run_extraction` re-raises on layout crash (Option A), the future propagates the exception, the `future.result()` call at line 618 raises, and the `finally:` at line 628 releases the semaphore. This path is already correctly handled by the existing timeout/semaphore machinery. No change needed to the outer `extract_layout_and_tables` method.

**EC-5 — Test suite — model-mocked tests must still pass**
Existing tests in `__tests__/test_pek_engine_adapter.py` use injected fakes (MagicMock for `layout_task`/`paddle_table`). The happy-path tests (models succeed, return normal result) must continue to pass. Dev must add:
- A test where `layout_task.predict_pdfs` raises → result is degraded/exception (not silent 0-row)
- A test where `paddle_table` is None (simulating load failure) → units quarantined
- A test where `_run_table_extraction` raises → units quarantined
- A test with a table-less PDF (layout succeeds, no table bboxes) → `quarantined=False` (false-positive guard)

**EC-6 — Caller HTTP contract**
The HTTP handler in `interface/handlers.py` receives the dict from `extract_layout_and_tables`. If Option A (re-raise) is chosen, the handler must catch the exception and return HTTP 500 (standard FastAPI behavior). If Option B (tag-degraded), the handler returns HTTP 200 with the degraded dict. Architect must specify which HTTP response code maps to the degraded case, and whether the refine orchestrator in mcp-server expects 200 or 500 on a model crash. This is the key DDD-boundary concern (see Blockers).

---

## DDD Layer Map

| Requirement | File | DDD Layer | Reason |
|---|---|---|---|
| FR-A1, NFR-A1/A2 | `pek_engine_adapter.py` line 668 outer catch | Infrastructure | ML model lifecycle; no domain business logic |
| FR-B1 | `pek_engine_adapter.py` line 342 `_load_pek_models` | Infrastructure | ML model load; package initialization |
| FR-B2, FR-B3 | `pek_engine_adapter.py` lines 717, 729 | Infrastructure | Same method, same layer |
| FR-C1/C2/C3 | `pek_helpers.py` (new) or inline in `pek_engine_adapter.py` | Infrastructure | Utility within the infra layer; no domain concepts |

No domain, application, or interface layer files change for this P0. The HTTP handler in `interface/handlers.py` is in scope ONLY if architect chooses Option B (tag-degraded) AND the HTTP response contract needs updating.

---

## Acceptance Criteria (Forced-Failure DoD)

DONE bar: QA-green LIVE RAW on named-volume DB `vn-market-intelligence-mcp_market_data`. Container REBUILT after code change. Host `./data/market.db` is a stale 0-row decoy — do NOT use.

**AC-1 (Site A — layout-crash degraded path)**
Force a DocLayout-YOLO crash: drop or corrupt the model weights file, OR patch `_run_layout_detection` to raise a synthetic `RuntimeError("forced OOM")`. Run a full extraction via `POST /api/push-bctc-layout` (or the equivalent trigger endpoint). The response MUST NOT have `quarantined=False` with `units_total=0`. Either:
- HTTP 500 is returned with a clear error message (Option A), OR
- HTTP 200 is returned with `extraction_status="degraded"` / `degraded=true` / all units `quarantined=true`

**AC-2 (Site B — PaddleOCR load failure degraded path)**
Force a PaddleOCR load failure: remove or break the `paddleocr` package, OR patch `_load_pek_models` to raise on the `from paddleocr import PaddleOCR` line. Clear `_pek_models_cache` (or restart container). Run a full extraction. Table units in the result MUST be quarantined (or HTTP 500 raised). Result MUST NOT show `units_passing==units_total` with `quarantined=False` on table-type units.

**AC-3 (False-positive guard — table-less PDF)**
With models healthy, run extraction on a PDF that has no tables (a text-only page). The result MUST show `quarantined=False` for all units. No false-quarantine. Units show `page_type="prose"` or `"blank"`, `row_count=0`, `quarantined=False`. This is unchanged behavior and must remain so.

**AC-4 (False-positive guard — table PDF with healthy models)**
With models healthy and a real BCTC PDF, extraction produces `quarantined=False` units with real `row_count>0` on table pages. The fix must not regress any currently-working extraction.

**AC-5 (Helper — generic, no per-instance hardcode)**
`fail_loud_or_tag_degraded` (if chosen as Option B path) must accept any dict with any `status` string. No ticker, no report_id, no date in the helper body. QA verifies by reading the helper source — any hardcode = FAIL.

**AC-6 (Container rebuild)**
QA must confirm the pdf-extractor container image `.Created` timestamp (via `docker inspect`) is after the commit timestamp. Restart without rebuild does NOT satisfy this criterion (per MEMORY: rebuild-recreate lesson).

**AC-7 (Named-volume DB)**
QA verifies via `docker run --rm -v vn-market-intelligence-mcp_market_data:/data keinos/sqlite3 /data/market.db "SELECT COUNT(*) FROM bctc_layout_units"` (or equivalent). The verification probes the real named volume, not the host decoy.

---

## Blockers

ZERO PO blockers. All design decisions are within the architect's authority.

**ARCH-RATIFY-PEK-1 (Site A — re-raise vs tag-degraded):**
Choose Option A (re-raise) or Option B (tag-degraded) for the layout-detection crash at line 668. BA recommends Option A (mirrors existing `_load_pek_models` re-raise at lines 303-316). Architect makes the final call based on the refine orchestrator's HTTP error handling requirements.

**ARCH-RATIFY-PEK-2 (Site B — re-raise vs sentinel at load time):**
Choose Option A (re-raise at `_load_pek_models`) or Option B (sentinel `paddle_table`) for the PaddleOCR load failure. BA recommends Option A (consistency with layout_task load-failure behavior). If PaddleOCR is intended to be "graceful-degrade" while layout is not, Option B is valid — architect must document the design intent.

**ARCH-RATIFY-PEK-3 (HTTP contract for refine orchestrator):**
The refine orchestrator in `mcp-server` calls `POST /api/push-bctc-layout` (or `POST /api/trigger-pek-extract`). Architect must confirm: does the orchestrator already handle HTTP 500 from the pdf-extractor as a distinct error from a 200-with-degraded-payload? If the orchestrator silently treats HTTP 500 as a transient retry case and re-queues, Option B (HTTP 200 degraded) may be preferable to avoid infinite retries. If the orchestrator correctly surfaces HTTP 500 as a permanent extraction failure, Option A is cleaner. This is a DDD cross-boundary concern.

**ARCH-RATIFY-PEK-4 (`fail_loud_or_tag_degraded` file location):**
Architect decides: (A) new `infrastructure/pek_helpers.py` (keeps adapter focused, consistent with `extraction_engine.py` helper split), OR (B) inline module-level function at top of `pek_engine_adapter.py`. Both are infrastructure layer. BA has no preference — just needs DRY placement.

---

## Hard Constraints (propagate to architect → pm → dev → qa)

1. SMALLEST CORRECT CHANGE — two sites in one file + one helper. Do NOT touch domain, application, or interface layers unless EC-6 HTTP contract requires it.
2. GENERIC — `fail_loud_or_tag_degraded` has ZERO ticker / entity / date / allowlist hardcode.
3. FORCED-FAILURE DoD is mandatory — not optional. QA must perform the model-drop probe AND the table-less-PDF false-positive check.
4. Named-volume DB only (`vn-market-intelligence-mcp_market_data`) for QA verification.
5. Container MUST be rebuilt (not restarted) after code change before QA runs.
6. `AC-PEK-0a` invariant: `git -C apps/pdf-extractor/PDF-Extract-Kit diff` MUST return empty. Dev must not touch the PEK subtree.
7. `paddle_table is None` via disabled YAML config (EC-2) is NOT the same as a load failure — do NOT quarantine on the config-absent path.
8. `parse_or_raise` and `validate_or_unknown` (Wave-3 helpers) are OUT OF SCOPE for this task.
9. `_run_layout_detection` inner re-raise (lines 872-876) must NOT be changed — already correct.

---

## Files Modified (scope for architect/dev)

Primary:
- `apps/pdf-extractor/infrastructure/pek_engine_adapter.py` — lines 668 (Site A outer catch), 342 (Site B load catch), 717-729 (Site B guard + runtime catch)

New (helper):
- `apps/pdf-extractor/infrastructure/pek_helpers.py` (if architect chooses separate file) OR module-level addition to `pek_engine_adapter.py`

Tests (mandatory):
- `apps/pdf-extractor/__tests__/test_pek_engine_adapter.py` — add forced-failure test cases for AC-1, AC-2, AC-3, AC-4

No domain or application layer files change. `interface/handlers.py` is in scope only if HTTP contract change is needed (ARCH-RATIFY-PEK-3).

---

## Handoff to Architect

ZONE: `apps/pdf-extractor/`
SPEC: this file (`docs/handoffs/FIX-ERRAUDIT-W1-PEK-P0-BA-spec.md`)
BLOCKERS: zero PO blockers; four architect ratification items (ARCH-RATIFY-PEK-1 through PEK-4)
NEXT: architect — produce technical design, resolve ARCH-RATIFY-PEK-1/2/3/4, specify exact code shape for `fail_loud_or_tag_degraded` and the option chosen for each site. Pay special attention to EC-6 (HTTP contract) and EC-1 (false-positive guard invariant).
