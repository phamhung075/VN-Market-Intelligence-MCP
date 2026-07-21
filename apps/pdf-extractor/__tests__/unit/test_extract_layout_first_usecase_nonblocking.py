"""
Unit test: ExtractLayoutFirstUseCase.execute() must not block the event loop.

TC-LF-1: Tier 1 (rasterize + zone_page_fn) must run on a worker thread.
TC-LF-2: Tier 2 (Tesseract OCR via ocr_unit_fn) must run on a worker thread.

Regression guard for the /health block bug (PDF-AVAIL-02-FIX, extract-layout-first
path — one of the paths the 2026-06-08 event-loop-starvation brief mis-classified
as "LOW risk" because the HTTP handler returns 202 immediately; the *background
task body* still ran synchronously on the event loop after the response was sent):

    ExtractLayoutFirstUseCase.execute() called self._tier1_zone_pages() (sync,
    pdf2image rasterization + column-gutter detection) directly with no
    `await`, and self._tier2_ocr_and_stitch() — although declared `async def` —
    called self._ocr_unit() (sync, Tesseract image_to_data) in a loop with no
    `await` inside. Both are long-running for multi-page BCTC PDFs and starved
    /health for the full extraction duration.

    This test fails if either asyncio.to_thread() offload is removed.
"""

from __future__ import annotations

import asyncio
import threading
from typing import Dict, List
from unittest.mock import patch

from application.extract_layout_first_usecase import ExtractLayoutFirstUseCase


class _FakeOcrPagesClient:
    async def fetch_ocr_pages(self, report_id: str) -> List[Dict]:
        return []


class _FakePushClient:
    async def push_layout(self, **kwargs) -> Dict:
        return {"ok": True, "units_stored": 0, "pages_stored": 0}


def _fake_build_document_map(pages, pdf_path) -> Dict:
    return {
        "total_pages": 1,
        "units": [
            {"unit_id": "u1", "schema_page": 1, "pages": [1], "page_type": "table"},
        ],
    }


class _DummyImage:
    """Stand-in for a PIL Image — only .save()/.close() are exercised."""

    def save(self, *args, **kwargs) -> None:
        pass

    def close(self) -> None:
        pass


def _blank_page_zones(**kwargs) -> Dict:
    return {
        "page_number": kwargs.get("page_num"),
        "unit_id": kwargs.get("unit_id"),
        "page_type": "table",
        "is_schema_page": kwargs.get("is_schema_page", True),
        "is_continuation_page": False,
        "schema_inherited_from_page": None,
        "zones": {
            "image_width_px": 100,
            "image_height_px": 100,
            "image_dpi": 200,
            "coordinate_origin": "top-left",
            "coordinate_unit": "px",
            "header_band": {"y_min": 0, "y_max": 10},
            "footer_band": {"y_min": 90, "y_max": 100},
            "column_gutters": [],
            "row_bands": [],
            "unit_hints": [],
            "unit_boundary_after_page": False,
        },
    }


def _blank_ocr_result(**kwargs) -> Dict:
    unit = kwargs["unit"]
    return {
        "unit_id": unit.get("unit_id"),
        "page_numbers": unit.get("pages", []),
        "stitched_markdown": "",
        "row_count": 0,
        "page_row_spans": [],
        "rows_for_gate": [],
    }


def _make_use_case(zone_page_fn, ocr_unit_fn) -> ExtractLayoutFirstUseCase:
    return ExtractLayoutFirstUseCase(
        push_client=_FakePushClient(),
        ocr_pages_client=_FakeOcrPagesClient(),
        build_document_map_fn=_fake_build_document_map,
        zone_page_fn=zone_page_fn,
        ocr_unit_fn=ocr_unit_fn,
    )


def _run_with_fake_rasterize(uc: ExtractLayoutFirstUseCase, report_id: str) -> None:
    with patch.object(
        ExtractLayoutFirstUseCase,
        "_rasterize_page_200dpi",
        lambda self, pdf_path, page_num, tmp_dir, convert_from_path: _DummyImage(),
    ):
        asyncio.run(uc.execute(report_id=report_id, pdf_path="/fake/test.pdf"))


def test_tc_lf_1_zone_page_runs_in_worker_thread_not_event_loop():
    """TC-LF-1: Tier 1 zone_page_fn must run off the event loop thread."""
    zone_thread_id = {"id": None}
    event_loop_thread_id = {"id": None}

    def fake_zone_page(**kwargs) -> Dict:
        zone_thread_id["id"] = threading.get_ident()
        return _blank_page_zones(**kwargs)

    uc = _make_use_case(fake_zone_page, _blank_ocr_result)

    async def run():
        event_loop_thread_id["id"] = threading.get_ident()
        with patch.object(
            ExtractLayoutFirstUseCase,
            "_rasterize_page_200dpi",
            lambda self, pdf_path, page_num, tmp_dir, convert_from_path: _DummyImage(),
        ):
            await uc.execute(report_id="tc-lf-1", pdf_path="/fake/test.pdf")

    asyncio.run(run())

    assert zone_thread_id["id"] is not None, "zone_page_fn was never called"
    assert event_loop_thread_id["id"] is not None
    assert zone_thread_id["id"] != event_loop_thread_id["id"], (
        "Tier 1 zone_page_fn ran on the event loop thread — asyncio.to_thread() "
        "offload missing from _tier1_zone_pages; this blocks /health during "
        "rasterization + zoning"
    )


def test_tc_lf_2_ocr_unit_runs_in_worker_thread_not_event_loop():
    """TC-LF-2: Tier 2 ocr_unit_fn must run off the event loop thread."""
    ocr_thread_id = {"id": None}
    event_loop_thread_id = {"id": None}

    def fake_ocr_unit(**kwargs) -> Dict:
        ocr_thread_id["id"] = threading.get_ident()
        return _blank_ocr_result(**kwargs)

    uc = _make_use_case(_blank_page_zones, fake_ocr_unit)

    async def run():
        event_loop_thread_id["id"] = threading.get_ident()
        with patch.object(
            ExtractLayoutFirstUseCase,
            "_rasterize_page_200dpi",
            lambda self, pdf_path, page_num, tmp_dir, convert_from_path: _DummyImage(),
        ):
            await uc.execute(report_id="tc-lf-2", pdf_path="/fake/test.pdf")

    asyncio.run(run())

    assert ocr_thread_id["id"] is not None, "ocr_unit_fn was never called"
    assert event_loop_thread_id["id"] is not None
    assert ocr_thread_id["id"] != event_loop_thread_id["id"], (
        "Tier 2 ocr_unit_fn ran on the event loop thread — asyncio.to_thread() "
        "offload missing from _tier2_ocr_and_stitch; this blocks /health during OCR"
    )
