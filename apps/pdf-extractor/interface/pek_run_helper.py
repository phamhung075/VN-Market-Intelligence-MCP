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


async def _run_pek_extract(
    pek_adapter: Any,
    push_client: Any,
    report_id: str,
    pdf_path: str,
) -> None:
    """
    Background task: run PEK extraction and push results via LayoutFirstPushClient.

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
