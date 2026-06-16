<!-- size-justification: Architect technical design — brownfield verification + 4 ratification decisions + exact code shape for 4 sites + helper spec + cross-boundary HTTP-contract evidence + test matrix + preserved-invariants checklist. Load-bearing for pm→dev-pdf-extractor→qa chain. -->

# Technical Design — FIX-ERRAUDIT-W1-PEK-P0

**Epic:** ERROR-AUDIT-2026-06-15 · Wave 1 · P0
**Architect:** architect agent
**Created:** 2026-06-16
**Status:** DESIGN COMPLETE — all 4 ARCH-RATIFY items resolved
**Input spec:** `docs/handoffs/FIX-ERRAUDIT-W1-PEK-P0-BA-spec.md`
**Next:** pm → dev-pdf-extractor → qa

---

## Brownfield Verification — Actual Line Numbers

BA spec line numbers are accurate against the live file (`apps/pdf-extractor/infrastructure/pek_engine_adapter.py`, 1078 lines total). Confirmed locations:

| BA reference | Actual line | Code confirmed |
|---|---|---|
| `:303-316` — layout_task load re-raise precedent | **L303-316** | `except Exception as exc: raise RuntimeError(...)` — CONFIRMED. This is the consistency precedent. |
| `:342` — PaddleOCR load catch | **L342** | `except Exception as exc: logger.warning(...)` — NO re-raise. Bug confirmed. `paddle_table` stays `None`. |
| `:668` — outer layout-detection catch in `_run_extraction` | **L668** | `except Exception as exc: logger.error(... "using empty bbox fallback")` — NO re-raise. Bug confirmed. Pipeline continues with `pages_bboxes = {}`. |
| `:717` — paddle guard in `_run_extraction` | **L717** | `if paddle_table is not None:` — Silent else path confirmed. |
| `:729` — runtime table-extraction catch | **L729** | `except Exception as exc: logger.warning(...)` — NO quarantine tag. Bug confirmed. |
| `:872-876` — inner `_run_layout_detection` re-raise | **L872-876** | `except Exception as exc: logger.error(...); raise` — already correct, DO NOT TOUCH. |

**Step 5 (unit assembly, lines 786-823):** Table units are assembled with `quarantined=False` unconditionally. No flag propagates from either the empty-bbox path or the paddle=None path. This is the terminal masking point for both bugs.

---

## ARCH-RATIFY-PEK-3 — HTTP Contract Cross-Boundary Finding (LOAD-BEARING)

This ratification resolves first because it governs PEK-1 and PEK-2.

### The call chain

```
fleet cron / claude agent
  → POST mcp-server:3000/api/trigger-pek-extract
      server.ts:599-679 — fire-and-forget relay
  → POST pdf-extractor:5001/pek-extract   (handlers.py:434)
      → background_tasks.add_task(_run_pek_extract, ...)   (handlers.py:483)
      → HTTP 202 returned immediately to mcp-server
  mcp-server:672 — receives 202, returns 202 to caller. Done.
```

The `/pek-extract` handler (`handlers.py:434`) **always returns HTTP 202 Accepted before the extraction runs**. The extraction executes as a FastAPI `BackgroundTask`. Any exception from `extract_layout_and_tables` is caught in `_run_pek_extract` at `handlers.py:272`:

```python
except Exception as exc:
    _log.error("_run_pek_extract: FAILED report_id=%s — full traceback follows",
               report_id, exc_info=True)
    # No re-raise, no HTTP response change — the 202 was already sent.
```

**mcp-server caller evidence:**
- `server.ts:663-668`: mcp-server only propagates HTTP 503 (market-hours) and generic non-2xx as 502. A 202 back from pdf-extractor is treated as "extraction queued" (`server.ts:671-673`).
- `pdfExtractorClient.ts:72-78`: the `/extract` client (used for text extraction, not layout) returns `null` on non-OK — not relevant to the `/pek-extract` background flow.
- `pushBctcExtraction.ts:179-185`: Tier 1/2/3 caller uses `catch → logger.warn` and falls through. Not relevant to the `/pek-extract` path.

**Consequence:** There is NO HTTP 500 path from the extraction back to the mcp-server orchestrator. The extraction is fire-and-forget. The `/pek-extract` HTTP response is always 202 (unless market-hours=503, or semaphore=429, or adapter not wired=503). An exception inside `_run_extraction` is consumed inside the background task with a log line only.

**This means the "infinite HTTP retry loop" risk cited in ARCH-RATIFY-PEK-3 does NOT exist.** There is no retry-on-500 because the caller never sees a 500 from extraction failure. The HTTP contract concern is moot.

**Decision:** Option A (re-raise inside `_run_extraction`) is safe. The re-raise propagates to `future.result()` at line 618, then up to `extract_layout_and_tables`, then into `_run_pek_extract`, which already catches it and logs it with full traceback. No HTTP contract change. No infinite retry.

---

## ARCH-RATIFY-PEK-1 — Site A: Layout-Detection Crash

**Chosen: Option A — Re-raise.**

**Justification:**
1. HTTP contract is fire-and-forget (see PEK-3 above). A re-raise does not cascade to any caller with harmful retry behavior.
2. The existing `_load_pek_models` layout_task load failure (L303-316) already re-raises. Re-raising here is consistent with that precedent: a crash of the layout model is a deployment/host fault, not a graceful-degrade scenario.
3. The alternative (Option B — tag-degraded) would require assembling a valid-looking degraded dict and continuing through Steps 2-5 with `pages_bboxes = {}`. This means the result would have `document_map.total_pages=0`, `units=[]`, `page_zones=[]`. Even tagged `degraded=True`, this dict is indistinguishable from a blank-PDF result in the DB once the `quarantined` field is set. Re-raise is semantically cleaner: no partial dict reaches the push client.
4. EC-1 invariant is preserved: re-raise fires ONLY because `_run_layout_detection` threw. A genuinely blank PDF (layout succeeds, returns empty bboxes) does NOT enter the catch block, continues through Steps 2-5, and produces `quarantined=False` correctly.
5. EC-2 invariant is preserved: `layout_task is None` path (disabled config) is at L674 in the `else` branch. The fix is inside the `if layout_task is not None:` block. The `else` branch is NOT touched.

**The helper `fail_loud_or_tag_degraded` is NOT called at Site A.** The fix is a single-line re-raise replacement.

---

## ARCH-RATIFY-PEK-2 — Site B: PaddleOCR Load Failure

**Chosen: Option B — Sentinel at load + quarantine at guard (NOT re-raise at load).**

**Justification:**
1. PaddleOCR is architecturally distinct from the layout model. The file header comment (L40-48) explicitly states that layout detection (DocLayout-YOLO) is mandatory for BCTC table extraction — tables come from layout regions. By contrast, PaddleOCR provides the table-grid + OCR step, which is a second-pass enrichment on top of the layout bboxes.
2. The existing L303-316 re-raise is explicitly tagged "Layout detection is MANDATORY for BCTC table extraction — tables come from layout regions. A missing/broken layout model is a deployment error, not a graceful-degradation scenario." No equivalent comment exists for PaddleOCR.
3. The `else` path (layout_task=None, disabled via YAML) already uses a `_get_page_dims_fallback` to produce a partial result. This establishes that partial/degraded output with explicit marking is an accepted pattern in this codebase.
4. Re-raising at `_load_pek_models` for PaddleOCR load failure would make the ENTIRE extraction fail (no layout extraction, no push to DB) even if DocLayout-YOLO works perfectly. The correct behavior when PaddleOCR fails to load is: layout extraction proceeds, table units are marked quarantined. This is the `extract_layout_first_usecase.py:450` pattern cited by the BA.
5. The sentinel approach avoids the `paddle_table is None` ambiguity: today `None` means both "not loaded" (load failure) and "not wired" (future). A distinct sentinel value makes the load-failure state unambiguous.

**Sentinel definition:**

```python
# module-level, in pek_engine_adapter.py (before _load_pek_models)
_PADDLE_LOAD_FAILED = object()  # sentinel — distinct from None (not wired) and a real model
```

At L342 (load catch), instead of leaving `paddle_table = None`, set `paddle_table = _PADDLE_LOAD_FAILED`.

At L717 (guard), the existing `if paddle_table is not None:` becomes a three-branch check:
- `paddle_table is _PADDLE_LOAD_FAILED` → call `fail_loud_or_tag_degraded` helper, set a `_paddle_failed` flag
- `paddle_table is not None` (loaded successfully) → run `_run_table_extraction`
- `paddle_table is None` → this branch should not occur with the sentinel fix in place, but treat same as healthy (no quarantine — "not wired" is not a crash). [EC-2 analogue for the table side]

At L729 (runtime table extraction catch — FR-B3): set a `_table_extraction_failed` flag.

In Step 5 (unit assembly, L786-823): for `page_type == "table"` units, check `_paddle_failed or _table_extraction_failed` and quarantine those units.

**EC-1 is preserved:** the sentinel/flag path fires only on an exception or a sentinel value (which itself only comes from an exception at load time). A healthy extraction that returns zero table bboxes proceeds through Step 5 normally with `quarantined=False`.

---

## ARCH-RATIFY-PEK-4 — Helper Location

**Chosen: Module-level in `pek_engine_adapter.py` (Option B — inline).**

**Justification:**
1. The helper is exclusively called by `pek_engine_adapter.py`. Zero other files in the infrastructure layer need it. A new `pek_helpers.py` module would be a single-consumer split with no reuse benefit.
2. The `extraction_engine.py` split cited by the BA is a different case — that file exports a class used across multiple callers. `fail_loud_or_tag_degraded` would have exactly one call site in this Wave.
3. Wave-3 helpers (`parse_or_raise`, `validate_or_unknown`) will live in their own modules per their own BA specs. If architect decides those should share a helper module with `fail_loud_or_tag_degraded`, that consolidation is deferred to Wave-3. Do NOT pre-split for a hypothetical future use.
4. Inline keeps the module self-contained and avoids a circular-import risk (if `pek_helpers.py` were ever imported by something that `pek_engine_adapter.py` imports).

**Placement:** Define `fail_loud_or_tag_degraded` as a module-level function above `_load_pek_models`, below the sentinel definition.

---

## Exact Code Shape — Site A (line 668 region)

**Before (L658-673):**
```python
if layout_task is not None:
    try:
        pages_bboxes, page_dims = self._run_layout_detection(
            layout_task=layout_task,
            pdf_path=pdf_path,
        )
        logger.info(
            "PekEngineAdapter: layout detection complete — %d pages",
            len(pages_bboxes),
        )
    except Exception as exc:
        logger.error(
            "PekEngineAdapter: layout detection failed: %s — "
            "using empty bbox fallback",
            exc,
        )
```

**After (replace only the except block body — no other changes):**
```python
if layout_task is not None:
    try:
        pages_bboxes, page_dims = self._run_layout_detection(
            layout_task=layout_task,
            pdf_path=pdf_path,
        )
        logger.info(
            "PekEngineAdapter: layout detection complete — %d pages",
            len(pages_bboxes),
        )
    except Exception as exc:
        logger.error(
            "PekEngineAdapter: layout detection FAILED (layout_task is not None) — "
            "raising to prevent silent 0-row extraction: %s",
            exc,
        )
        raise RuntimeError(
            f"PekEngineAdapter: DocLayout-YOLO layout detection failed for "
            f"report_id={report_id} pdf_path={pdf_path}: {exc}"
        ) from exc
```

**Invariant confirmation (EC-1):** The raise fires exclusively when `_run_layout_detection` throws. A PDF that successfully returns `pages_bboxes = {}` (genuinely blank) does NOT enter the except block. EC-1 is preserved.

**Invariant confirmation (EC-2):** The fix is inside `if layout_task is not None:`. The `else:` branch at L674 (fallback when layout_task is disabled via YAML) is not touched.

**Do NOT touch:** `_run_layout_detection` inner re-raise at L872-876. Already correct.

---

## Exact Code Shape — Site B Load Site (line 342 region)

**Before (L331-347):**
```python
paddle_table = None
try:
    from paddleocr import PaddleOCR  # type: ignore
    paddle_table = PaddleOCR(
        use_angle_cls=False,
        lang="vi",
        use_gpu=False,
        show_log=False,
        type="structure",
    )
    logger.info("PekEngineAdapter: PaddleOCR PP-StructureV2 table mode loaded (CPU)")
except Exception as exc:
    logger.warning(
        "PekEngineAdapter: PaddleOCR table mode load failed: %s — "
        "table structure extraction disabled",
        exc,
    )
```

**After (replace only the except block body and `paddle_table = None` initial assignment):**
```python
paddle_table: Any = None  # None = not wired; _PADDLE_LOAD_FAILED = load failure
try:
    from paddleocr import PaddleOCR  # type: ignore
    paddle_table = PaddleOCR(
        use_angle_cls=False,
        lang="vi",
        use_gpu=False,
        show_log=False,
        type="structure",
    )
    logger.info("PekEngineAdapter: PaddleOCR PP-StructureV2 table mode loaded (CPU)")
except Exception as exc:
    logger.warning(
        "PekEngineAdapter: PaddleOCR table mode load FAILED: %s — "
        "table units will be quarantined (paddle_table=_PADDLE_LOAD_FAILED sentinel)",
        exc,
    )
    paddle_table = _PADDLE_LOAD_FAILED  # sentinel — guards in _run_extraction check this
```

---

## Exact Code Shape — Site B Guard Site (line 717 region) + Runtime Catch (line 729)

**Before (L716-732):**
```python
table_cells_by_page: Dict[int, Dict[int, List[Dict]]] = {}
if paddle_table is not None:
    try:
        table_cells_by_page = self._run_table_extraction(
            paddle_table=paddle_table,
            pdf_path=pdf_path,
            pages_bboxes=pages_bboxes,
            page_dims=page_dims,
        )
        logger.info(
            "PekEngineAdapter: table extraction complete — %d pages with tables",
            len(table_cells_by_page),
        )
    except Exception as exc:
        logger.warning(
            "PekEngineAdapter: table extraction failed: %s", exc
        )
```

**After:**
```python
table_cells_by_page: Dict[int, Dict[int, List[Dict]]] = {}
_table_units_degraded: bool = False  # flag propagated into Step 5 unit assembly
_table_degraded_reason: str = ""

if paddle_table is _PADDLE_LOAD_FAILED:
    # FR-B2: load-failure path — quarantine all table units in Step 5
    logger.warning(
        "PekEngineAdapter: paddle_table is _PADDLE_LOAD_FAILED sentinel — "
        "table structure extraction unavailable; table units will be quarantined"
    )
    _table_units_degraded = True
    _table_degraded_reason = "paddle-load-failure"
elif paddle_table is not None:
    try:
        table_cells_by_page = self._run_table_extraction(
            paddle_table=paddle_table,
            pdf_path=pdf_path,
            pages_bboxes=pages_bboxes,
            page_dims=page_dims,
        )
        logger.info(
            "PekEngineAdapter: table extraction complete — %d pages with tables",
            len(table_cells_by_page),
        )
    except Exception as exc:
        # FR-B3: runtime table extraction failure — quarantine all table units in Step 5
        logger.warning(
            "PekEngineAdapter: table extraction FAILED at runtime: %s — "
            "table units will be quarantined",
            exc,
        )
        _table_units_degraded = True
        _table_degraded_reason = "table-extraction-failure"
# else: paddle_table is None — not wired (no PaddleOCR configured), not a crash.
# No quarantine on the None path (EC-2 analogue for the table side).
```

---

## Exact Code Shape — Step 5 Unit Assembly (line 806 region, table unit branch)

The table unit branch in Step 5 (L806-823) must be updated to propagate the degradation flag:

**Before (L806-823, table unit branch only):**
```python
# Table unit — assemble stitched markdown from PaddleOCR table cells.
stitched_md = self._assemble_unit_markdown(
    pages_in_unit=pages_in_unit,
    table_cells_by_page=table_cells_by_page,
    page_zones_output=page_zones_output,
)
row_count = sum(1 for line in stitched_md.split("\n") if line.strip().startswith("|") and "---" not in line)
units_output.append({
    "unit_id": unit_id,
    "stitched_markdown": stitched_md,
    "row_count": row_count,
    "quarantined": False,
    "quarantine_reason": None,
    "page_row_spans": [
        {"page": p, "row_start": 0, "row_end": 0}
        for p in pages_in_unit
    ],
})
```

**After:**
```python
# Table unit — assemble stitched markdown from PaddleOCR table cells.
if _table_units_degraded:
    # FR-B2/B3: paddle load failure or runtime crash — quarantine this table unit.
    # Do NOT assemble stitched_markdown from empty table_cells_by_page — that would
    # produce a clean 0-row pass (the exact masking bug we are fixing).
    units_output.append({
        "unit_id": unit_id,
        "stitched_markdown": "",
        "row_count": 0,
        "quarantined": True,
        "quarantine_reason": _table_degraded_reason,
        "page_row_spans": [
            {"page": p, "row_start": 0, "row_end": 0}
            for p in pages_in_unit
        ],
    })
else:
    stitched_md = self._assemble_unit_markdown(
        pages_in_unit=pages_in_unit,
        table_cells_by_page=table_cells_by_page,
        page_zones_output=page_zones_output,
    )
    row_count = sum(1 for line in stitched_md.split("\n") if line.strip().startswith("|") and "---" not in line)
    units_output.append({
        "unit_id": unit_id,
        "stitched_markdown": stitched_md,
        "row_count": row_count,
        "quarantined": False,
        "quarantine_reason": None,
        "page_row_spans": [
            {"page": p, "row_start": 0, "row_end": 0}
            for p in pages_in_unit
        ],
    })
```

---

## Helper `fail_loud_or_tag_degraded` — Specification and Location

**Decision:** Inline module-level in `pek_engine_adapter.py` (ARCH-RATIFY-PEK-4, Option B).

**Placement:** Below the `_PADDLE_LOAD_FAILED = object()` sentinel definition, above `_load_pek_models`.

**Note:** With the chosen Options A+B above, `fail_loud_or_tag_degraded` is NOT directly called in this Wave's four sites. The design uses re-raise (Site A) and a flag propagation pattern (Site B). The helper is still shipped as mandated by FR-C1 for correctness — it is the canonical degradation-stamper for future Wave-1 consumers and for any caller that receives an already-built result dict and needs to stamp it. The helper must exist and be generically correct.

**Exact signature and body:**

```python
def fail_loud_or_tag_degraded(result: dict, status: str) -> dict:
    """
    Stamp a partial result dict as degraded.

    Sets result["extraction_status"] = status
         result["degraded"] = True
         result["degraded_reason"] = status
         for each unit in result.get("units", []):
             unit["quarantined"] = True
             unit["quarantine_reason"] = status

    Returns the mutated result dict.

    GENERIC: zero ticker / entity / date / allowlist hardcode.
    The `status` label is chosen by the call site
    (e.g. "layout-crash", "paddle-load-failure", "table-extraction-failure").
    """
    result["extraction_status"] = status
    result["degraded"] = True
    result["degraded_reason"] = status
    for unit in result.get("units", []):
        unit["quarantined"] = True
        unit["quarantine_reason"] = status
    return result
```

**Sentinel definition** (placed immediately above the helper):

```python
# Sentinel for PaddleOCR load failure — distinct from None (not wired).
# Cached in _pek_models_cache["paddle_table"] when paddleocr fails to import/init.
# Guards in _run_extraction check `is _PADDLE_LOAD_FAILED` to quarantine table units.
_PADDLE_LOAD_FAILED: object = object()
```

---

## Preserved Invariants Checklist

| Invariant | How the design preserves it |
|---|---|
| **EC-1 FALSE-POSITIVE GUARD** — quarantine fires ONLY on a thrown exception, never on successful return of empty results. A genuinely table-less PDF (layout succeeds, no table bboxes) MUST land `quarantined=False`. | Site A: re-raise fires only when `_run_layout_detection` throws. A PDF that returns `pages_bboxes={}` does NOT enter the except block; proceeds to Step 5 with `quarantined=False`. Site B: `_table_units_degraded` is set only when `paddle_table is _PADDLE_LOAD_FAILED` OR `_run_table_extraction` raises. A healthy model run with no table bboxes in any page proceeds with `_table_units_degraded=False`; Step 5 emits `quarantined=False`. |
| **EC-2 — layout_task=None (disabled config, not a crash)** | Site A fix is inside `if layout_task is not None:` block. The `else:` branch (L674, `_get_page_dims_fallback`) is untouched. |
| **EC-2 analogue for paddle — paddle_table=None (not wired, not a crash)** | The guard uses `elif paddle_table is not None:` after the sentinel check. `None` falls through to the implicit else (no-op, no quarantine). |
| **PEK subtree untouched** | No change touches `apps/pdf-extractor/PDF-Extract-Kit/`. All edits are in `pek_engine_adapter.py`. `git -C apps/pdf-extractor/PDF-Extract-Kit diff` stays empty. |
| **`_run_layout_detection` inner re-raise unchanged** | L872-876 is not modified. The inner re-raise already propagates the exception; the outer catch at L668 is the only change. |
| **GENERIC helper** | `fail_loud_or_tag_degraded` has zero ticker / entity / date / allowlist. `status` is a free string chosen by the call site. |
| **Wave-3 helpers out of scope** | `parse_or_raise` and `validate_or_unknown` are not implemented here. Gated to Wave-3. |
| **No domain/application/interface layer changes** | All changes in `pek_engine_adapter.py` (infrastructure layer). `interface/handlers.py` is NOT modified (HTTP contract is unchanged — fire-and-forget 202 stays as-is). |

---

## File Change Scope

| File | Change type | Description |
|---|---|---|
| `apps/pdf-extractor/infrastructure/pek_engine_adapter.py` | Modify | 5 targeted edits: (1) add `_PADDLE_LOAD_FAILED` sentinel + `fail_loud_or_tag_degraded` helper above `_load_pek_models`; (2) Site B load catch → set sentinel; (3) Site A outer catch → re-raise; (4) Site B guard+runtime catch → flag propagation; (5) Step 5 table-unit branch → quarantine on flag. |
| `apps/pdf-extractor/__tests__/test_pek_engine_adapter.py` | Modify | Add 4 forced-failure test cases (AC-1, AC-2, AC-3 false-positive guard, AC-5 helper generic). |

**No new files.** `pek_helpers.py` is NOT created (ARCH-RATIFY-PEK-4 decision).

**`interface/handlers.py` NOT modified** (ARCH-RATIFY-PEK-3: HTTP contract is fire-and-forget, no HTTP response change needed).

---

## Test Matrix — Dev Must Add

All tests in `apps/pdf-extractor/__tests__/test_pek_engine_adapter.py`. All use injected fakes (MagicMock). No real model weights, no real HTTP.

### AC-1 — Site A: layout-detection crash → exception propagates (not silent 0-row)

**Setup:** Mock `_get_pek_models` to return `{"layout_task": mock_layout, "paddle_table": None}`. Mock `mock_layout.predict_pdfs` to raise `RuntimeError("forced OOM")`.

**Assert:** `PekEngineAdapter.extract_layout_and_tables()` raises `RuntimeError` (not returns silently). Do NOT assert on the exact message — only that an exception is raised.

**Anti-regression:** Confirm the exception is NOT the inner `_run_layout_detection` re-raise (that would be a no-op fix). The outer `extract_layout_and_tables` must propagate it.

### AC-2 — Site B: PaddleOCR load failure → table units quarantined

**Setup:** Patch `_load_pek_models` to return `{"layout_task": mock_layout, "paddle_table": _PADDLE_LOAD_FAILED}` (import `_PADDLE_LOAD_FAILED` from module). `mock_layout.predict_pdfs` returns a normal 1-page result with a table bbox.

**Assert:**
- `extract_layout_and_tables` returns normally (no exception).
- All units in result with `page_type="table"` have `quarantined=True`.
- `quarantine_reason` equals `"paddle-load-failure"`.
- `pass_rate_report.units_quarantined > 0`.
- `pass_rate_report.units_passing < pass_rate_report.units_total`.

### AC-2b — Site B FR-B3: runtime `_run_table_extraction` exception → table units quarantined

**Setup:** Models loaded successfully (layout=mock, paddle=mock, NOT sentinel). `mock_paddle.ocr()` raises `RuntimeError("CUDA OOM")` (triggering the runtime catch path). Layout returns 1 page with table bbox.

**Assert:** Same assertions as AC-2 but `quarantine_reason == "table-extraction-failure"`.

### AC-3 — False-positive guard: genuinely table-less PDF → quarantined=False

**Setup:** Models loaded successfully. `mock_layout.predict_pdfs` returns 2 pages with ONLY prose bboxes (label != `_LAYOUT_CLASS_TABLE`). `_run_table_extraction` is NOT called (no table bboxes on any page).

**Assert:**
- All units have `quarantined=False`.
- `page_type` values are `"prose"` or `"blank"`, never `"table"`.
- `pass_rate_report.units_quarantined == 0`.

### AC-4 — Happy path with table PDF and healthy models (regression guard)

**Setup:** Models loaded successfully. `mock_layout.predict_pdfs` returns 2 pages, page 1 has table bbox, page 2 has prose bbox. `_run_table_extraction` returns mock table cells for page 1.

**Assert:**
- Table unit: `quarantined=False`, `row_count >= 0`.
- Prose unit: `quarantined=False`, `row_count=0`.
- No exception raised.

### AC-5 — Helper generic contract

**Direct unit test** (not via adapter):

```python
from infrastructure.pek_engine_adapter import fail_loud_or_tag_degraded

def test_helper_stamps_degraded():
    result = {"units": [{"quarantined": False, "quarantine_reason": None}]}
    out = fail_loud_or_tag_degraded(result, "test-status")
    assert out["degraded"] is True
    assert out["degraded_reason"] == "test-status"
    assert out["extraction_status"] == "test-status"
    assert out["units"][0]["quarantined"] is True
    assert out["units"][0]["quarantine_reason"] == "test-status"

def test_helper_no_hardcode():
    """Confirm helper body has no ticker/entity/date/allowlist."""
    import inspect
    from infrastructure.pek_engine_adapter import fail_loud_or_tag_degraded
    src = inspect.getsource(fail_loud_or_tag_degraded)
    for forbidden in ["VNM", "bctc", "BCTC", "2025", "2026", "allowlist", "ticker"]:
        assert forbidden not in src, f"Forbidden literal found in helper: {forbidden}"
```

---

## QA Forced-Failure DoD Steps (propagate to qa flow)

1. **Container rebuild** before any QA step. Verify: `docker inspect vn-market-intelligence-mcp-pdf-extractor-1 --format '{{.Created}}'` timestamp is after the commit timestamp. Restart without rebuild does NOT satisfy AC-6.

2. **AC-1 forced layout crash:** Inside the container, patch `_run_layout_detection` to raise `RuntimeError("forced OOM")` (or corrupt the YOLO model weights file). POST `/pek-extract`. Check container logs — MUST show full traceback with `RuntimeError`. Result dict MUST NOT appear in `bctc_layout_units` with `quarantined=False` and `units_total=0`.

3. **AC-2 forced PaddleOCR load failure:** Remove or break `paddleocr` package inside the container. Clear `_pek_models_cache` (restart container or set `_pek_models_cache = None` via debug endpoint). POST `/pek-extract`. Check logs — table units in `bctc_layout_units` MUST have `quarantined=1`. Verify via: `docker run --rm -v vn-market-intelligence-mcp_market_data:/data keinos/sqlite3 /data/market.db "SELECT quarantined, quarantine_reason, COUNT(*) FROM bctc_layout_units WHERE page_type='table' GROUP BY quarantined, quarantine_reason"`.

4. **AC-3 false-positive guard:** With healthy models, run extraction on a text-only PDF. Verify `SELECT quarantined FROM bctc_layout_units WHERE report_id=?` returns all 0.

5. **AC-7 named-volume DB:** All QA verification queries use the named-volume sidecar (`keinos/sqlite3`). Never use `./data/market.db` on host.

---

## Risk Flags

**RISK-1 — Singleton cache with sentinel persists across requests.** After PaddleOCR load failure at container start, `_pek_models_cache["paddle_table"] = _PADDLE_LOAD_FAILED` is permanent for the container's lifetime. Every subsequent extraction will quarantine table units. This is the CORRECT behavior (ops must redeploy to fix a load failure), but QA must be aware that testing AC-2 requires a fresh container start (or forced cache clear) to observe the transition.

**RISK-2 — `_PADDLE_LOAD_FAILED` identity after module reload.** If `_load_pek_models` is called after a Python module reload (unlikely in production but possible in tests), `_PADDLE_LOAD_FAILED` identity (`is` check) would break. Dev must ensure tests that check `_PADDLE_LOAD_FAILED` import it from the SAME module instance, not a reloaded copy.

**RISK-3 — `paddle_table=None` in legacy code paths.** The `set_paddle_table` call at L642-644 in `_run_extraction` already guards `if paddle_table is not None`. The sentinel `_PADDLE_LOAD_FAILED` is not None, so `hasattr(self._ocr_backend, "set_paddle_table")` would be called with a sentinel value. Dev must add a `paddle_table is not _PADDLE_LOAD_FAILED` check at L642 guard, OR change the injection condition to explicitly check for a real model instance. **Exact fix for L642:**

```python
# Before:
if self._ocr_backend is not None and paddle_table is not None:
    if hasattr(self._ocr_backend, "set_paddle_table"):
        self._ocr_backend.set_paddle_table(paddle_table)

# After:
if self._ocr_backend is not None and paddle_table is not None and paddle_table is not _PADDLE_LOAD_FAILED:
    if hasattr(self._ocr_backend, "set_paddle_table"):
        self._ocr_backend.set_paddle_table(paddle_table)
```

This is a required edit — not optional. Dev must include it.

---

## DDD Compliance

All changes are in `infrastructure/pek_engine_adapter.py`. DDD layer: Infrastructure. No domain, application, or interface layer files are modified. The helper `fail_loud_or_tag_degraded` is infrastructure-utility with zero domain concepts. Wave-3 helpers are gated.

---

## Summary of Ratification Decisions

| Item | Decision | Option |
|---|---|---|
| ARCH-RATIFY-PEK-1 (Site A) | Re-raise | A |
| ARCH-RATIFY-PEK-2 (Site B) | Sentinel at load + flag propagation in Step 5 | B |
| ARCH-RATIFY-PEK-3 (HTTP contract) | Fire-and-forget 202 — no HTTP contract change needed | N/A (moot) |
| ARCH-RATIFY-PEK-4 (helper location) | Inline in `pek_engine_adapter.py` | B |
