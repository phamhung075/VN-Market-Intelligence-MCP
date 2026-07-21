"""
Unit test: ExtractMdTablesUseCase.execute() must not block the event loop.

TC-MD-1: page rasterization + Tesseract OCR (via GenericMdTableExtractorPort)
         must run on a worker thread, not the event loop thread.

Regression guard for the /health block bug (PDF-AVAIL-02-FIX, extract-md-tables
path — one of the paths the 2026-06-08 event-loop-starvation brief mis-classified
as "LOW risk" because the HTTP handler returns 202 immediately; the *background
task body* still ran synchronously on the event loop after the response was sent):

    ExtractMdTablesUseCase.execute() is an `async def` that, in Step 2, called
    self._rasterize_page() (pdf2image subprocess) and
    self._extractor.extract_md_tables() (pytesseract subprocess) directly in a
    loop with no `await` inside — a fully synchronous body wearing an `async`
    costume. Per the docstring, up to MAX_PAGES=20 pages at ~3-5s/page can run
    60-100s, starving /health for the full duration.

    This test fails if the asyncio.to_thread() offload around Step 2 (and the
    Step 3 doc_ocr_text→markdown call) is removed.
"""

from __future__ import annotations

import asyncio
import sys
import threading
from typing import Dict, List, Optional
from unittest.mock import MagicMock, patch

from application.extract_md_tables_usecase import ExtractMdTablesUseCase


def _patch_pdf2image():
    """Patch the pdf2image import inside execute() to avoid ImportError."""
    mock_module = MagicMock()
    mock_module.convert_from_path = MagicMock(return_value=[])
    return patch.dict(
        sys.modules, {"pdf2image": mock_module, "pdf2image.exceptions": mock_module}
    )


class _RecordingExtractor:
    """Fake GenericMdTableExtractorPort — records the thread it runs on."""

    def __init__(self) -> None:
        self.call_thread_ids: List[int] = []

    def extract_md_tables(
        self, page_image_paths: List[str], doc_ocr_text: Optional[str] = None
    ) -> Dict:
        self.call_thread_ids.append(threading.get_ident())
        if not page_image_paths:
            return {
                "md_tables": [],
                "ocr_as_markdown": "## fake" if doc_ocr_text else "",
                "table_count": 0,
            }
        return {
            "md_tables": ["| a | b |\n|---|---|\n| 1 | 2 |"],
            "ocr_as_markdown": "",
            "table_count": 1,
        }


class _FakePushClient:
    async def push_md_tables(self, **kwargs) -> Dict:
        return {"ok": True, "tables_stored": kwargs.get("md_tables") and 1 or 0}


def test_tc_md_1_rasterize_and_ocr_run_in_worker_thread_not_event_loop():
    """
    TC-MD-1: ExtractMdTablesUseCase.execute() must offload page rasterization +
    Tesseract OCR to a worker thread. Regression guard for the HEALTH-BLOCK bug.
    """
    event_loop_thread_id = {"id": None}

    extractor = _RecordingExtractor()
    uc = ExtractMdTablesUseCase(md_extractor=extractor, md_push_client=_FakePushClient())

    async def run():
        event_loop_thread_id["id"] = threading.get_ident()
        with patch.object(ExtractMdTablesUseCase, "_count_pages", return_value=1), \
            patch.object(
                ExtractMdTablesUseCase,
                "_rasterize_page",
                lambda self, pdf_path, page_num, tmp_dir, convert_from_path: "/fake/page.png",
            ), \
            _patch_pdf2image():
            await uc.execute(
                report_id="tc-md-1",
                pdf_path="/fake/test.pdf",
                doc_ocr_text="some raw ocr text",
            )

    asyncio.run(run())

    assert extractor.call_thread_ids, "extract_md_tables was never called"
    assert event_loop_thread_id["id"] is not None
    for worker_id in extractor.call_thread_ids:
        assert worker_id != event_loop_thread_id["id"], (
            "extract_md_tables ran on the event loop thread — asyncio.to_thread() "
            "offload missing from ExtractMdTablesUseCase.execute(); this blocks "
            "/health for the duration of the extraction"
        )
