"""
Unit tests: PdfplumberExtractionEngine must not block the event loop.

TC-EE-1: extract_tables() offloads pdfplumber sync work via asyncio.to_thread().
         The event loop thread must NOT be the thread executing _extract_tables_sync.

TC-EE-2: extract_text_ocr() offloads pdfplumber+pytesseract sync work via asyncio.to_thread().
         The event loop thread must NOT be the thread executing _extract_text_ocr_sync.

Regression guard for A20-EVENTLOOP-ASYNC-TO-THREAD:
    Both methods were declared `async def` but contained NO await — pdfplumber page
    iteration and pytesseract.image_to_string() ran synchronously on the single uvicorn
    event loop, blocking /health for the duration of each extraction.
    These tests fail if the asyncio.to_thread() wrappers are removed.

Pattern mirrors TC11 in test_extract_tables_usecase.py (thread-isolation assertion).
"""

from __future__ import annotations

import asyncio
import threading
from typing import Optional
from unittest.mock import MagicMock, patch

import pytest

from infrastructure.extraction_engine import PdfplumberExtractionEngine


# ---------------------------------------------------------------------------
# TC-EE-1: extract_tables() runs on a worker thread, not the event loop thread
# ---------------------------------------------------------------------------


def test_tc_ee_1_extract_tables_runs_in_worker_thread_not_event_loop():
    """
    TC-EE-1: _extract_tables_sync must be called from a worker thread when
    extract_tables() is awaited. Regression guard for event-loop starvation.

    If asyncio.to_thread() is removed, _extract_tables_sync will run on the
    event loop thread and pdfplumber page iteration will block /health for
    the entire duration of extraction.
    """
    sync_body_thread_id: Optional[int] = None
    event_loop_thread_id: Optional[int] = None

    def fake_extract_tables_sync(self_arg, pdf_bytes: bytes):
        nonlocal sync_body_thread_id
        sync_body_thread_id = threading.get_ident()
        return []

    async def run():
        nonlocal event_loop_thread_id
        event_loop_thread_id = threading.get_ident()

        engine = PdfplumberExtractionEngine()
        with patch.object(
            PdfplumberExtractionEngine,
            "_extract_tables_sync",
            side_effect=fake_extract_tables_sync,
            autospec=True,
        ):
            await engine.extract_tables(b"%PDF-fake")

    asyncio.run(run())

    assert sync_body_thread_id is not None, (
        "_extract_tables_sync was never called — extract_tables() may not be delegating"
    )
    assert event_loop_thread_id is not None
    assert sync_body_thread_id != event_loop_thread_id, (
        "_extract_tables_sync ran on the event loop thread — "
        "asyncio.to_thread() was not used; this blocks /health during pdfplumber extraction"
    )


# ---------------------------------------------------------------------------
# TC-EE-2: extract_text_ocr() runs on a worker thread, not the event loop thread
# ---------------------------------------------------------------------------


def test_tc_ee_2_extract_text_ocr_runs_in_worker_thread_not_event_loop():
    """
    TC-EE-2: _extract_text_ocr_sync must be called from a worker thread when
    extract_text_ocr() is awaited. Regression guard for event-loop starvation.

    If asyncio.to_thread() is removed, _extract_text_ocr_sync will run on the
    event loop thread and pytesseract.image_to_string() will block /health for
    10-30+ seconds per page during OCR fallback.
    """
    sync_body_thread_id: Optional[int] = None
    event_loop_thread_id: Optional[int] = None

    def fake_extract_text_ocr_sync(self_arg, pdf_bytes: bytes):
        nonlocal sync_body_thread_id
        sync_body_thread_id = threading.get_ident()
        return ("", 0.0)

    async def run():
        nonlocal event_loop_thread_id
        event_loop_thread_id = threading.get_ident()

        engine = PdfplumberExtractionEngine()
        with patch.object(
            PdfplumberExtractionEngine,
            "_extract_text_ocr_sync",
            side_effect=fake_extract_text_ocr_sync,
            autospec=True,
        ):
            await engine.extract_text_ocr(b"%PDF-fake")

    asyncio.run(run())

    assert sync_body_thread_id is not None, (
        "_extract_text_ocr_sync was never called — extract_text_ocr() may not be delegating"
    )
    assert event_loop_thread_id is not None
    assert sync_body_thread_id != event_loop_thread_id, (
        "_extract_text_ocr_sync ran on the event loop thread — "
        "asyncio.to_thread() was not used; this blocks /health during OCR processing"
    )
