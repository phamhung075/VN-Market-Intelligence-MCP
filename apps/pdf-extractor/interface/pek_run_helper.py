# size-justification: 159L — FIX-PDFX-PEK-EXTRACT-202-ACCEPTED-THEN-SILENTLY-DROPPED-SEMAPHORE-1800S
# 2026-08-26 (135L -> 159L, +24L): added status_repo param + mark_done()/
# mark_failed() call sites in the existing try/except — the except branch
# used to ONLY log.error(), now also writes the durable record AC-1 requires.
# Stays in this file (not a new split) because the writes sit inline in the
# same try/except this file already owns; a split would need to re-thread
# result/exc across a file boundary for two one-line calls.
# 2026-08-15 (93L -> 135L, +42L): added _malloc_trim_or_noop() + its
# finally-block call site inside _run_pek_extract. Same allocator-hygiene
# concern this file already owns at the request-lifecycle boundary
# (PDF-AVAIL-02-FIX already lives here) — not new scope, and per architect
# brief docs/architecture-briefs/2026-08-07-fix-pdfx-parent-process-memory-
# burst-headroom.md §10, this is where the fix belongs (interface layer,
# not PekEngineAdapter).
"""
Interface — background-task runner for POST /pek-extract.

FACTORY-PDF-split-handlers: extracted from interface/handlers.py. Kept in its
own file (separate from interface/routes_pek.py) because this one function's
contract docstring alone is long enough to push a combined file past the
project's ~120L/file convention.

NOTE: this module's dotted path (interface.pek_run_helper) is load-bearing —
_run_pek_extract logs via logging.getLogger(__name__), and
__tests__/test_pek_engine_adapter.py asserts against that exact logger name.
"""

import asyncio
from typing import Any


def _malloc_trim_or_noop() -> None:
    """
    Best-effort glibc malloc_trim(0) — returns freed native-allocator arena
    pages back to the OS. FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM §3/§6:
    isolated repro measured this recovering ~70-99% of each PEK job's per-job
    RSS growth (gc.collect() recovers 0 bytes — native/glibc-arena memory,
    invisible to Python's own GC). Same ctypes.CDLL("libc.so.6") shape as the
    sibling rag-service fix (app_factory._malloc_trim_or_noop), which in turn
    cites THIS row as its own precedent.

    Guarded: "libc.so.6" only resolves on glibc-based Linux (the production
    container's actual runtime) — macOS dev/test host, musl/Alpine, etc.
    raise OSError/AttributeError here, caught and treated as a silent no-op.
    """
    try:
        import ctypes

        libc = ctypes.CDLL("libc.so.6")
        libc.malloc_trim(0)
    except (OSError, AttributeError):
        pass  # non-glibc platform (e.g. macOS dev/test host) — nothing to trim


async def _run_pek_extract(
    pek_adapter: Any,
    push_client: Any,
    report_id: str,
    pdf_path: str,
    status_repo: Any = None,
) -> None:
    """
    Background task: run PEK extraction and push results via LayoutFirstPushClient.

    FIX-PDFX-PEK-EXTRACT-202-ACCEPTED-THEN-SILENTLY-DROPPED-SEMAPHORE-1800S
    (AC-1): status_repo (infrastructure.pek_extraction_status_repository.
    PekExtractionStatusRepository, optional — None in callers/tests that
    don't inject it) is written on BOTH terminal paths below: mark_done() on
    a successful push, mark_failed(error=str(exc)) in the except branch. That
    except branch used to ONLY call logger.error() — a SemaphoreContendedError
    (queue wait exhausted) or any other extraction failure was a traceback in
    stdout and nothing else. GET /pek-extract/{report_id}
    (interface/routes_pek_status.py) reads this record back.

    PEK-INTEGRATE: calls PekEngineAdapter.extract_layout_and_tables(), then
    pushes the result payload to mcp-server POST /api/push-bctc-layout
    via the existing LayoutFirstPushClient (unchanged contract).

    BTB-UNBLOCK-DEV observability contract:
      - FAIL-LOUD: exceptions are logged with full traceback (exc_info=True).
        A failed extraction is never silently invisible — ops/QA can search
        for "FAILED" in logs and get the full cause without digging further.
      - ECHO-vs-DB: the DONE log distinguishes between the push-client return
        value (mcp-server echo / input echo — NOT a DB commit count per
        project_mcp_server_write_wedge) and the persisted DB count (which this
        handler cannot observe directly — ops must verify via in-container
        market.db COUNT query).

    PDF-AVAIL-02-FIX (event-loop isolation):
        pek_adapter.extract_layout_and_tables() is a synchronous method that
        internally blocks on `future.result(timeout=PEK_EXTRACTION_TIMEOUT_SECONDS)`
        (default 30 min). Because this coroutine is scheduled as a FastAPI
        BackgroundTask, Starlette awaits it directly ON THE MAIN EVENT LOOP —
        calling the sync method inline would pin that loop for the full
        extraction, starving GET /health (which is also served by the same
        loop) for up to 30 minutes. asyncio.to_thread() moves the entire
        call (including its internal blocking wait) onto a worker thread so
        the event loop stays free. Mirrors the asyncio.to_thread() pattern
        already used in infrastructure/extraction_engine.py,
        table_push_client.py, alert_adapter.py, layout_first_push_client.py.
    """
    import logging as _logging
    _log = _logging.getLogger(__name__)
    try:
        result = await asyncio.to_thread(
            pek_adapter.extract_layout_and_tables,
            pdf_path=pdf_path,
            report_id=report_id,
        )
        push_result = await push_client.push_layout(
            report_id=report_id,
            document_map=result.get("document_map", {}),
            units=result.get("units", []),
            page_zones=result.get("page_zones", []),
            pass_rate_report=result.get("pass_rate_report", {}),
        )
        # BTB-UNBLOCK-DEV ECHO-vs-DB: push_result values come from the mcp-server
        # HTTP response body (input echo) — NOT a committed DB row count.
        # Per project_mcp_server_write_wedge: pushBctcLayoutHandler echoes the
        # input length, not the rows actually stored in SQLite.
        # "push_echo" = what mcp-server returned; "db_count" = UNKNOWN from here.
        # Ops MUST verify persistence directly: bun -e "SELECT COUNT(*) ..." in-container.
        _log.info(
            "_run_pek_extract: DONE report_id=%s "
            "push_echo_units=%s push_echo_pages=%s "
            "(NOTE: these are mcp-server echo values, NOT committed DB row counts — "
            "verify db_count via in-container market.db COUNT query)",
            report_id,
            push_result.get("units_stored"),
            push_result.get("pages_stored"),
        )
        if status_repo is not None:
            status_repo.mark_done(report_id)
    except Exception as exc:
        # BTB-UNBLOCK-DEV FAIL-LOUD: log full traceback (exc_info=True).
        # A silent "error=%s" with no traceback was the root cause of the
        # "cycle1 units_stored=28 but DB=0" confusion — the real error was invisible.
        # exc_info=True guarantees the full stack is in the log for ops diagnosis.
        _log.error(
            "_run_pek_extract: FAILED report_id=%s — full traceback follows",
            report_id,
            exc_info=True,
        )
        # FIX-PDFX-PEK-EXTRACT-202-ACCEPTED-THEN-SILENTLY-DROPPED-SEMAPHORE-1800S
        # AC-1: the durable record. Covers SemaphoreContendedError (queue wait
        # exhausted) and every other exception this try-block can raise.
        if status_repo is not None:
            status_repo.mark_failed(report_id, str(exc))
    finally:
        # FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM: return freed
        # native-allocator memory (torch/PaddlePaddle layout+table buffers)
        # to the OS on BOTH the success and exception path — a failed job
        # still pays the full layout-detection allocation cost (brief §2's
        # retry-storm observation). Never lets a trim failure escape this
        # function — memory hygiene must not turn into a new failure mode.
        try:
            await asyncio.to_thread(_malloc_trim_or_noop)
        except Exception:
            _log.exception("_run_pek_extract: malloc_trim sweep failed (non-fatal)")
