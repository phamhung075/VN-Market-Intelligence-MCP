"""
Unit test: interface/handlers.py::_run_pek_extract must not block the event loop.

TC-PEK-HANDLER-1: PekEngineAdapter.extract_layout_and_tables() must run on a
                   worker thread, not the event loop thread.

Regression guard for the /health block bug (PDF-AVAIL-02-FIX, pek-extract path —
one of the paths the 2026-06-08 event-loop-starvation brief mis-classified as
"LOW risk" because the HTTP handler returns 202 immediately; the *background
task body* still ran synchronously on the event loop after the response was sent):

    _run_pek_extract() called pek_adapter.extract_layout_and_tables() directly
    inside an `async def` background task with no asyncio.to_thread() offload.
    That method internally blocks on `future.result(timeout=...)` for up to
    PEK_EXTRACTION_TIMEOUT_SECONDS (default 1800s = 30 min) — pinning the
    asyncio event loop for the full extraction duration and starving /health.

    This test fails if the asyncio.to_thread() wrapper is removed.
"""

from __future__ import annotations

import asyncio
import threading
from typing import Dict
from unittest.mock import MagicMock

from interface.handlers import _run_pek_extract


def test_tc_pek_handler_1_extract_runs_in_worker_thread_not_event_loop():
    """
    TC-PEK-HANDLER-1: _run_pek_extract() must offload
    pek_adapter.extract_layout_and_tables() to a worker thread.
    """
    extract_thread_id = {"id": None}
    event_loop_thread_id = {"id": None}

    fake_pek_adapter = MagicMock()

    def fake_extract(pdf_path: str, report_id: str) -> Dict:
        extract_thread_id["id"] = threading.get_ident()
        return {
            "document_map": {},
            "units": [],
            "page_zones": [],
            "pass_rate_report": {},
        }

    fake_pek_adapter.extract_layout_and_tables.side_effect = fake_extract

    fake_push_client = MagicMock()

    async def fake_push_layout(**kwargs) -> Dict:
        return {"units_stored": 0, "pages_stored": 0}

    fake_push_client.push_layout = fake_push_layout

    async def run():
        event_loop_thread_id["id"] = threading.get_ident()
        await _run_pek_extract(
            pek_adapter=fake_pek_adapter,
            push_client=fake_push_client,
            report_id="tc-pek-handler-1",
            pdf_path="/fake/test.pdf",
        )

    asyncio.run(run())

    assert extract_thread_id["id"] is not None, (
        "extract_layout_and_tables was never called — check _run_pek_extract routing"
    )
    assert event_loop_thread_id["id"] is not None
    assert extract_thread_id["id"] != event_loop_thread_id["id"], (
        "extract_layout_and_tables ran on the event loop thread — asyncio.to_thread() "
        "was not used in _run_pek_extract; this would block /health for up to "
        "PEK_EXTRACTION_TIMEOUT_SECONDS (default 1800s) during each /pek-extract call"
    )
