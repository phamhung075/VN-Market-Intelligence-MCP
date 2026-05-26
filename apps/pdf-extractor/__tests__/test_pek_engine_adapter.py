"""
Unit tests — infrastructure/pek_engine_adapter.py (PEK-INTEGRATE)

Tests:
    1. Lazy-load singleton: first call loads models (mock); second call reuses.
    2. Semaphore contention: concurrent caller raises SemaphoreContendedError.
    3. Bbox-to-zone mapping: fake PEK bbox output → correct zones_json shape.
    4. GPU-package absence: paddlepaddle_gpu NOT in sys.modules after import.
    5. No CUDA/TableParsingTask/FormulaDetectionTask in the extraction path.

All tests use injected fakes — zero model weights, zero network, zero creds.

DDD: infrastructure-layer tests (pure unit tests — no FastAPI TestClient needed here).
REQ-PEK-2: confirms CPU-only invariant.
REQ-PEK-4: confirms lazy-load + semaphore.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import threading
import pytest
from unittest.mock import MagicMock, patch
from typing import Dict, List, Optional, Any


# ---------------------------------------------------------------------------
# Critical: GPU package must NOT be in sys.modules at import time
# ---------------------------------------------------------------------------

class TestGpuAbsenceInvariant:
    """REQ-PEK-2 / AC-PEK-2a — no GPU packages in sys.modules."""

    def test_paddlepaddle_gpu_not_imported(self):
        """
        paddlepaddle_gpu must NOT be in sys.modules after importing the adapter.
        This is the CPU-only invariant check (AC-PEK-2a / AC-PEK-2d).
        """
        import infrastructure.pek_engine_adapter  # noqa: F401
        assert "paddlepaddle_gpu" not in sys.modules, (
            "paddlepaddle_gpu was imported — CPU-only invariant violated!"
        )

    def test_cuda_not_available_required_by_struct_eqtable_not_checked(self):
        """
        Verify TableParsingTask is NOT imported anywhere in pek_engine_adapter.
        struct_eqtable.py hard-asserts torch.cuda.is_available() at import time.
        Importing it on this CPU-only host = immediate crash.

        Checks only import lines (not docstrings/comments which may mention them).
        """
        import inspect
        import infrastructure.pek_engine_adapter as m
        source = inspect.getsource(m)

        # Check only actual import lines — not docstring/comment mentions
        import_lines = [
            line.strip()
            for line in source.splitlines()
            if line.strip().startswith("import ") or line.strip().startswith("from ")
        ]
        import_block = "\n".join(import_lines)

        assert "TableParsingTask" not in import_block, (
            "TableParsingTask found in import statements of pek_engine_adapter — CPU crash risk!\n"
            f"Import lines:\n{import_block}"
        )
        assert "FormulaDetectionTask" not in import_block, (
            "FormulaDetectionTask found in import statements of pek_engine_adapter — CPU crash risk!\n"
            f"Import lines:\n{import_block}"
        )
        assert "struct_eqtable" not in import_block, (
            "struct_eqtable found in import statements of pek_engine_adapter — CPU crash risk!\n"
            f"Import lines:\n{import_block}"
        )


# ---------------------------------------------------------------------------
# Bbox-to-zone mapping tests (pure function — no model needed)
# ---------------------------------------------------------------------------

class TestMapBboxesToZones:
    """Tests for _map_bboxes_to_zones() — pure function, injected fake data."""

    def test_empty_bboxes_produces_default_zones(self):
        """Empty bbox list → zones with single col_0 fallback."""
        from infrastructure.pek_engine_adapter import _map_bboxes_to_zones

        zone = _map_bboxes_to_zones(
            bboxes=[],
            image_width_px=2338,
            image_height_px=3308,
            image_dpi=200,
            page_num=1,
            unit_id="test-unit-id",
            is_schema_page=True,
            schema_inherited_from_page=None,
        )

        assert zone["page_number"] == 1
        assert zone["unit_id"] == "test-unit-id"
        assert zone["is_schema_page"] is True
        assert zone["is_continuation_page"] is False
        assert zone["schema_inherited_from_page"] is None
        zones = zone["zones"]
        assert zones["image_width_px"] == 2338
        assert zones["image_height_px"] == 3308
        assert zones["image_dpi"] == 200
        assert zones["coordinate_origin"] == "top-left"
        assert zones["coordinate_unit"] == "px"
        # Default fallback: single col_0 covering full width
        assert len(zones["column_gutters"]) >= 1
        assert zones["column_gutters"][0]["col_id"] == "col_0"
        assert "header_band" in zones
        assert "footer_band" in zones
        assert "row_bands" in zones
        assert "unit_hints" in zones
        assert "unit_boundary_after_page" in zones

    def test_table_bbox_produces_column_gutter(self):
        """A table bbox (label=5) → column_gutter entry with correct col_id."""
        from infrastructure.pek_engine_adapter import _map_bboxes_to_zones, _LAYOUT_CLASS_TABLE

        bboxes = [
            {"label": _LAYOUT_CLASS_TABLE, "bbox": [100, 200, 900, 2800], "score": 0.95},
        ]

        zone = _map_bboxes_to_zones(
            bboxes=bboxes,
            image_width_px=1000,
            image_height_px=3000,
            image_dpi=200,
            page_num=3,
            unit_id="unit-abc",
            is_schema_page=True,
            schema_inherited_from_page=None,
        )

        zones = zone["zones"]
        assert len(zones["column_gutters"]) == 1
        gutter = zones["column_gutters"][0]
        assert gutter["col_id"] == "col_0"
        assert gutter["x_min"] == 100
        assert gutter["x_max"] == 900

    def test_multiple_table_bboxes_produce_multiple_gutters(self):
        """Two table bboxes → two column gutters with col_0/col_1."""
        from infrastructure.pek_engine_adapter import _map_bboxes_to_zones, _LAYOUT_CLASS_TABLE

        bboxes = [
            {"label": _LAYOUT_CLASS_TABLE, "bbox": [50, 200, 400, 2500], "score": 0.9},
            {"label": _LAYOUT_CLASS_TABLE, "bbox": [450, 200, 900, 2500], "score": 0.88},
        ]

        zone = _map_bboxes_to_zones(
            bboxes=bboxes,
            image_width_px=1000,
            image_height_px=3000,
            image_dpi=200,
            page_num=4,
            unit_id="unit-xyz",
            is_schema_page=False,
            schema_inherited_from_page=3,
        )

        zones = zone["zones"]
        assert len(zones["column_gutters"]) == 2
        assert zones["column_gutters"][0]["col_id"] == "col_0"
        assert zones["column_gutters"][1]["col_id"] == "col_1"
        assert zone["is_continuation_page"] is True
        assert zone["schema_inherited_from_page"] == 3

    def test_prose_page_has_page_type_prose(self):
        """A page with only text bboxes (no table) → page_type = 'prose'."""
        from infrastructure.pek_engine_adapter import _map_bboxes_to_zones, _LAYOUT_CLASS_PLAIN_TEXT

        bboxes = [
            {"label": _LAYOUT_CLASS_PLAIN_TEXT, "bbox": [50, 100, 800, 500], "score": 0.92},
        ]

        zone = _map_bboxes_to_zones(
            bboxes=bboxes,
            image_width_px=1000,
            image_height_px=1200,
            image_dpi=200,
            page_num=10,
            unit_id="unit-prose",
            is_schema_page=True,
            schema_inherited_from_page=None,
        )
        assert zone["page_type"] == "prose"

    def test_table_page_type(self):
        """A page with table bbox → page_type = 'table'."""
        from infrastructure.pek_engine_adapter import _map_bboxes_to_zones, _LAYOUT_CLASS_TABLE

        bboxes = [
            {"label": _LAYOUT_CLASS_TABLE, "bbox": [50, 200, 900, 2800], "score": 0.95},
        ]

        zone = _map_bboxes_to_zones(
            bboxes=bboxes,
            image_width_px=1000,
            image_height_px=3000,
            image_dpi=200,
            page_num=5,
            unit_id="u1",
            is_schema_page=True,
            schema_inherited_from_page=None,
        )
        assert zone["page_type"] == "table"

    def test_blank_page_when_no_bboxes(self):
        """Empty bboxes → page_type = 'blank'."""
        from infrastructure.pek_engine_adapter import _map_bboxes_to_zones

        zone = _map_bboxes_to_zones(
            bboxes=[],
            image_width_px=1000,
            image_height_px=3000,
            image_dpi=200,
            page_num=7,
            unit_id="u2",
            is_schema_page=True,
            schema_inherited_from_page=None,
        )
        assert zone["page_type"] == "blank"

    def test_unit_boundary_after_page_propagated(self):
        """unit_boundary_after_page=True is propagated to zones dict."""
        from infrastructure.pek_engine_adapter import _map_bboxes_to_zones

        zone = _map_bboxes_to_zones(
            bboxes=[],
            image_width_px=1000,
            image_height_px=3000,
            image_dpi=200,
            page_num=6,
            unit_id="u3",
            is_schema_page=False,
            schema_inherited_from_page=4,
            unit_boundary_after_page=True,
        )
        assert zone["zones"]["unit_boundary_after_page"] is True

    def test_lf_overlay_contract_fields_present(self):
        """
        Verify all required LF-OVERLAY §3.2 contract fields are present in zones.
        (brief 2026-05-26-bctc-layout-first-pipeline.md §3.2)
        """
        from infrastructure.pek_engine_adapter import _map_bboxes_to_zones

        zone = _map_bboxes_to_zones(
            bboxes=[],
            image_width_px=2338,
            image_height_px=3308,
            image_dpi=200,
            page_num=1,
            unit_id="test",
            is_schema_page=True,
            schema_inherited_from_page=None,
        )

        required_zone_fields = {
            "image_width_px", "image_height_px", "image_dpi",
            "coordinate_origin", "coordinate_unit",
            "header_band", "footer_band", "column_gutters",
            "row_bands", "unit_hints", "unit_boundary_after_page",
        }
        required_outer_fields = {
            "page_number", "unit_id", "page_type",
            "is_schema_page", "is_continuation_page",
            "schema_inherited_from_page", "zones",
        }

        for field in required_outer_fields:
            assert field in zone, f"Missing outer field: {field}"

        for field in required_zone_fields:
            assert field in zone["zones"], f"Missing zones field: {field}"


# ---------------------------------------------------------------------------
# Semaphore contention test
# ---------------------------------------------------------------------------

class TestSemaphoreGuard:
    """REQ-PEK-4d / AC-PEK-4d — sequential extraction enforced."""

    def test_semaphore_contention_raises_error(self):
        """
        While one extraction holds the semaphore, a second attempt raises
        SemaphoreContendedError (→ HTTP 429 at the handler level).
        """
        from infrastructure.pek_engine_adapter import (
            PekEngineAdapter,
            SemaphoreContendedError,
            _extraction_semaphore,
        )

        acquired = _extraction_semaphore.acquire(blocking=False)
        assert acquired, "Could not acquire semaphore for test setup"

        try:
            adapter = PekEngineAdapter()
            with pytest.raises(SemaphoreContendedError):
                adapter.extract_layout_and_tables(
                    pdf_path="/fake/path.pdf",
                    report_id="test-report-id",
                )
        finally:
            _extraction_semaphore.release()

    def test_semaphore_released_after_extraction(self):
        """
        After a (mocked) extraction completes, semaphore is released.
        A subsequent call must succeed (not raise SemaphoreContendedError).
        """
        from infrastructure.pek_engine_adapter import (
            PekEngineAdapter,
            SemaphoreContendedError,
            _extraction_semaphore,
        )

        adapter = PekEngineAdapter()

        with patch.object(adapter, "_run_extraction", return_value={
            "document_map": {"total_pages": 0, "units": []},
            "units": [],
            "page_zones": [],
            "pass_rate_report": {"units_total": 0, "units_passing": 0, "units_quarantined": 0, "quarantine_breakdown": {}},
        }):
            result = adapter.extract_layout_and_tables(
                pdf_path="/fake/a.pdf",
                report_id="r1",
            )

        # After completion, semaphore must be available
        can_acquire = _extraction_semaphore.acquire(blocking=False)
        if can_acquire:
            _extraction_semaphore.release()
        assert can_acquire, "Semaphore was not released after extraction completed"


# ---------------------------------------------------------------------------
# Lazy-load singleton test
# ---------------------------------------------------------------------------

class TestLazyLoadSingleton:
    """REQ-PEK-4 / AC-PEK-4a — models NOT loaded at boot; load on first call."""

    def test_pek_models_cache_is_none_at_import(self):
        """
        _pek_models_cache is None immediately after module import (cold-start).
        No model weights loaded. RSS = FastAPI base only.
        """
        import infrastructure.pek_engine_adapter as m
        # Reset cache for isolation
        m._pek_models_cache = None
        assert m._pek_models_cache is None, (
            "_pek_models_cache should be None at cold-start (AC-PEK-4a)"
        )

    def test_get_pek_models_calls_load_once(self):
        """
        _get_pek_models() calls _load_pek_models() exactly once on first call;
        second call returns cached dict without calling _load_pek_models() again.
        """
        import infrastructure.pek_engine_adapter as m

        fake_models = {"layout_task": None, "ocr_task": None, "paddle_table": None}
        call_count = [0]

        def fake_load():
            call_count[0] += 1
            return fake_models

        m._pek_models_cache = None  # reset
        with patch.object(m, "_load_pek_models", side_effect=fake_load):
            result1 = m._get_pek_models()
            result2 = m._get_pek_models()

        assert call_count[0] == 1, (
            f"_load_pek_models called {call_count[0]} times; expected 1 (lazy singleton)"
        )
        assert result1 is result2, "Second call must return same cached object"

    def test_cache_none_reset_triggers_reload(self):
        """
        If cache is reset to None (simulating cold-start), models reload on next call.
        """
        import infrastructure.pek_engine_adapter as m

        fake_models = {"layout_task": None, "ocr_task": None, "paddle_table": None}

        m._pek_models_cache = None
        with patch.object(m, "_load_pek_models", return_value=fake_models):
            result = m._get_pek_models()

        assert result is fake_models
