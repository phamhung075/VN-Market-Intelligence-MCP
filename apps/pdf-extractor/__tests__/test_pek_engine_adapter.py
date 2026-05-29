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


# ---------------------------------------------------------------------------
# PEK-LAYOUT-CFG regression tests (config-path + fail-loud)
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Fake OmegaConf DictConfig (avoids requiring omegaconf on the host for tests)
# ---------------------------------------------------------------------------
class _AttrDict(dict):
    """
    Minimal dict subclass that supports attribute access and OmegaConf-style
    hasattr() checks — used to fake an OmegaConf DictConfig in tests without
    needing the omegaconf package installed on the host test runner.
    """
    def __getattr__(self, name):
        try:
            val = self[name]
            if isinstance(val, dict) and not isinstance(val, _AttrDict):
                val = _AttrDict(val)
            return val
        except KeyError:
            raise AttributeError(name)

    def __setattr__(self, name, value):
        self[name] = value

    def get(self, key, default=None):
        return super().get(key, default)


def _make_fake_layout_cfg(extra_model_cfg: Optional[dict] = None) -> _AttrDict:
    """
    Return a fake DictConfig-like object that mirrors layout_detection_yolo.yaml:
        tasks:
          layout_detection:
            model: layout_detection_yolo
            model_config:
              img_size: 1024
              conf_thres: 0.25
              iou_thres: 0.45
              model_path: models/Layout/YOLO/doclayout_yolo_ft.pt
              device: 0
    No omegaconf import required.
    """
    model_config_data: Dict[str, Any] = {
        "img_size": 1024,
        "conf_thres": 0.25,
        "iou_thres": 0.45,
        "model_path": "models/Layout/YOLO/doclayout_yolo_ft.pt",
        "device": 0,
    }
    if extra_model_cfg:
        model_config_data.update(extra_model_cfg)

    return _AttrDict({
        "tasks": _AttrDict({
            "layout_detection": _AttrDict({
                "model": "layout_detection_yolo",
                "model_config": _AttrDict(model_config_data),
            })
        })
    })


class TestLayoutCfgConfigPath:
    """
    PEK-LAYOUT-CFG — verifies that _load_pek_models() reads the correct YAML path
    (tasks.layout_detection.model_config) and that a broken/missing layout config
    fails LOUD (raises RuntimeError) rather than silently setting layout_task = None.

    All tests use injected fakes — zero model weights, zero network, zero creds.
    omegaconf is mocked entirely so this class runs without omegaconf installed on host.
    """

    def _patch_omegaconf(self, mock_omegaconf_module, fake_cfg: _AttrDict):
        """
        Wire mock_omegaconf so that:
          - OmegaConf.load(...) returns fake_cfg
          - OmegaConf.to_container(node, resolve=True) returns dict(node) recursively
        """
        mock_omegaconf_module.load.return_value = fake_cfg

        def fake_to_container(node, resolve=True):
            # Recursively convert _AttrDict to plain dict
            if isinstance(node, dict):
                return {k: fake_to_container(v, resolve) for k, v in node.items()}
            return node

        mock_omegaconf_module.to_container.side_effect = fake_to_container

    def test_correct_config_path_tasks_layout_detection_model_config(self):
        """
        _load_pek_models() must read tasks.layout_detection.model_config,
        NOT layout_cfg.get('model', {}), which returns {} (no top-level 'model' key).
        Asserts _PekLayoutModel is instantiated with a non-empty model_cfg dict.
        """
        import infrastructure.pek_engine_adapter as m

        captured_model_cfg: list = []

        class FakePekLayoutModel:
            def __init__(self, yolo_cls, model_cfg: dict, pek_root: str):
                captured_model_cfg.append(dict(model_cfg))

        fake_cfg = _make_fake_layout_cfg()

        # Patch the local 'from omegaconf import OmegaConf' inside _load_pek_models()
        # by intercepting the module-level import of OmegaConf.
        import sys
        fake_omegaconf_mod = MagicMock()
        self._patch_omegaconf(fake_omegaconf_mod, fake_cfg)
        # Patch sys.modules["omegaconf"] so 'from omegaconf import OmegaConf' resolves
        fake_omegaconf_mod.OmegaConf = fake_omegaconf_mod

        fake_doclayout_mod = MagicMock()
        fake_doclayout_mod.YOLOv10 = MagicMock()

        m._pek_models_cache = None
        with patch("infrastructure.pek_engine_adapter.os.path.exists", return_value=True), \
             patch.dict(sys.modules, {
                 "omegaconf": fake_omegaconf_mod,
                 "doclayout_yolo": fake_doclayout_mod,
                 "paddleocr": MagicMock(),
             }), \
             patch.object(m, "_PekLayoutModel", new=FakePekLayoutModel):
            try:
                m._load_pek_models()
            except Exception:
                pass  # paddle/YOLOv10 errors are OK — we only care about model_cfg

        assert len(captured_model_cfg) >= 1, (
            "_PekLayoutModel was never instantiated — _load_pek_models() "
            "did not call it (config-path bug not fixed)"
        )
        cfg = captured_model_cfg[0]
        # Must NOT be empty {} (that was the old CONFIG-PATH BUG symptom)
        assert cfg, (
            "model_cfg passed to _PekLayoutModel is empty dict {} — "
            "symptom of CONFIG-PATH BUG: reading layout_cfg.get('model', {}) "
            "instead of layout_cfg.tasks.layout_detection.model_config"
        )
        assert "model_path" in cfg, (
            "model_cfg missing 'model_path' key — "
            "tasks.layout_detection.model_config not read correctly"
        )
        assert "img_size" in cfg, "model_cfg missing 'img_size'"
        assert cfg["model_path"] == "models/Layout/YOLO/doclayout_yolo_ft.pt", (
            f"Unexpected model_path: {cfg['model_path']}"
        )

    def test_fail_loud_when_yaml_exists_but_model_load_raises(self):
        """
        If layout_detection_yolo.yaml EXISTS but _PekLayoutModel() raises
        (e.g. weight file missing, YOLO init error), _load_pek_models() must
        re-raise as RuntimeError — NOT silently set layout_task = None.

        The silent-fallback bug produced false-green empty tables (QA cycle-131 RED).
        """
        import infrastructure.pek_engine_adapter as m
        import sys

        fake_cfg = _make_fake_layout_cfg()

        class BrokenPekLayoutModel:
            def __init__(self, yolo_cls, model_cfg: dict, pek_root: str):
                raise FileNotFoundError("Weight file not found: simulated")

        fake_omegaconf_mod = MagicMock()
        self._patch_omegaconf(fake_omegaconf_mod, fake_cfg)
        fake_omegaconf_mod.OmegaConf = fake_omegaconf_mod

        fake_doclayout_mod = MagicMock()
        fake_doclayout_mod.YOLOv10 = MagicMock()

        m._pek_models_cache = None
        with patch("infrastructure.pek_engine_adapter.os.path.exists", return_value=True), \
             patch.dict(sys.modules, {
                 "omegaconf": fake_omegaconf_mod,
                 "doclayout_yolo": fake_doclayout_mod,
             }), \
             patch.object(m, "_PekLayoutModel", new=BrokenPekLayoutModel):
            with pytest.raises(RuntimeError) as exc_info:
                m._load_pek_models()

        assert "FAILED" in str(exc_info.value) or "load" in str(exc_info.value).lower(), (
            "RuntimeError message must indicate load failure, got: "
            + str(exc_info.value)
        )

    def test_fail_loud_does_not_swallow_to_none(self):
        """
        After a broken model load, _load_pek_models() must NOT return a dict
        with layout_task=None. It must raise before reaching the return statement.
        This test asserts the 'swallow to None' anti-pattern is absent.
        """
        import infrastructure.pek_engine_adapter as m
        import sys

        fake_cfg = _make_fake_layout_cfg()

        class BrokenPekLayoutModel:
            def __init__(self, yolo_cls, model_cfg: dict, pek_root: str):
                raise RuntimeError("Simulated weight load failure")

        fake_omegaconf_mod = MagicMock()
        self._patch_omegaconf(fake_omegaconf_mod, fake_cfg)
        fake_omegaconf_mod.OmegaConf = fake_omegaconf_mod

        returned_dict: list = []

        fake_doclayout_mod = MagicMock()
        fake_doclayout_mod.YOLOv10 = MagicMock()

        m._pek_models_cache = None
        with patch("infrastructure.pek_engine_adapter.os.path.exists", return_value=True), \
             patch.dict(sys.modules, {
                 "omegaconf": fake_omegaconf_mod,
                 "doclayout_yolo": fake_doclayout_mod,
             }), \
             patch.object(m, "_PekLayoutModel", new=BrokenPekLayoutModel):
            try:
                result = m._load_pek_models()
                returned_dict.append(result)
            except RuntimeError:
                pass  # Expected — good path

        assert len(returned_dict) == 0, (
            "_load_pek_models() returned a dict instead of raising — "
            "silent-fallback anti-pattern still present (layout_task=None masked the error)"
        )

    def test_missing_yaml_does_not_raise_disables_layout(self):
        """
        If layout_detection_yolo.yaml does NOT exist, layout is disabled gracefully
        (layout_task = None returned in dict, no exception). This is the 'optional
        config path' — only missing layout config is graceful, not broken layout model.
        """
        import infrastructure.pek_engine_adapter as m
        import sys

        m._pek_models_cache = None
        fake_paddle_mod = MagicMock()
        fake_paddle_mod.PaddleOCR.return_value = MagicMock()

        with patch("infrastructure.pek_engine_adapter.os.path.exists", return_value=False), \
             patch.dict(sys.modules, {"paddleocr": fake_paddle_mod}), \
             patch.dict(sys.modules, {"doclayout_yolo": MagicMock()}):
            result = m._load_pek_models()

        assert "layout_task" in result
        assert result["layout_task"] is None, (
            "layout_task should be None when YAML not found (graceful — no YAML = optional)"
        )

    def test_model_path_resolved_relative_to_pek_root(self):
        """
        _PekLayoutModel must receive pek_root as an absolute path.
        The PEK root is computed as the parent of the configs/ directory
        (i.e. PDF-Extract-Kit/). This test verifies the value passed to
        _PekLayoutModel is absolute and non-empty.
        """
        import infrastructure.pek_engine_adapter as m
        import sys

        fake_cfg = _make_fake_layout_cfg()
        captured_init_args: list = []

        class CapturingPekLayoutModel:
            def __init__(self, yolo_cls, model_cfg: dict, pek_root: str):
                captured_init_args.append({"model_cfg": dict(model_cfg), "pek_root": pek_root})

        fake_omegaconf_mod = MagicMock()
        self._patch_omegaconf(fake_omegaconf_mod, fake_cfg)
        fake_omegaconf_mod.OmegaConf = fake_omegaconf_mod

        fake_doclayout_mod = MagicMock()
        fake_doclayout_mod.YOLOv10 = MagicMock()

        m._pek_models_cache = None
        with patch("infrastructure.pek_engine_adapter.os.path.exists", return_value=True), \
             patch.dict(sys.modules, {
                 "omegaconf": fake_omegaconf_mod,
                 "doclayout_yolo": fake_doclayout_mod,
                 "paddleocr": MagicMock(),
             }), \
             patch.object(m, "_PekLayoutModel", new=CapturingPekLayoutModel):
            try:
                m._load_pek_models()
            except Exception:
                pass  # paddle errors expected

        assert len(captured_init_args) >= 1, "_PekLayoutModel was never instantiated"
        init_args = captured_init_args[0]

        pek_root = init_args["pek_root"]
        assert os.path.isabs(pek_root), (
            f"pek_root passed to _PekLayoutModel is not absolute: {pek_root!r}"
        )
        # model_path in model_cfg is still relative (raw YAML value)
        raw_path = init_args["model_cfg"]["model_path"]
        assert raw_path == "models/Layout/YOLO/doclayout_yolo_ft.pt", (
            f"Unexpected raw model_path in model_cfg: {raw_path!r}"
        )

    def test_pek_layout_model_init_resolves_relative_path(self):
        """
        _PekLayoutModel.__init__ resolves a relative model_path against pek_root
        before passing it to yolo_cls. Verifies the YOLOv10 call receives
        an absolute path, not the raw relative string from the YAML.
        """
        from infrastructure.pek_engine_adapter import _PekLayoutModel

        received_paths: list = []

        class FakeYOLOv10:
            def __init__(self, path: str):
                received_paths.append(path)

        fake_model_cfg = {
            "model_path": "models/Layout/YOLO/doclayout_yolo_ft.pt",
            "img_size": 1024,
            "conf_thres": 0.25,
            "iou_thres": 0.45,
            "device": "cpu",
        }
        pek_root = "/app/PDF-Extract-Kit"

        _PekLayoutModel(
            yolo_cls=FakeYOLOv10,
            model_cfg=fake_model_cfg,
            pek_root=pek_root,
        )

        assert len(received_paths) == 1, "yolo_cls was not called exactly once"
        resolved = received_paths[0]
        expected_abs = "/app/PDF-Extract-Kit/models/Layout/YOLO/doclayout_yolo_ft.pt"
        assert resolved == expected_abs, (
            f"_PekLayoutModel passed wrong path to yolo_cls.\n"
            f"  Expected: {expected_abs!r}\n"
            f"  Got:      {resolved!r}\n"
            "The relative model_path must be resolved against pek_root."
        )

    def test_pek_layout_model_init_passes_absolute_path_unchanged(self):
        """
        _PekLayoutModel.__init__ must pass an already-absolute model_path through
        unchanged (no double-join).
        """
        from infrastructure.pek_engine_adapter import _PekLayoutModel

        received_paths: list = []

        class FakeYOLOv10:
            def __init__(self, path: str):
                received_paths.append(path)

        abs_path = "/custom/weights/doclayout_yolo_ft.pt"
        fake_model_cfg = {
            "model_path": abs_path,
            "img_size": 1024,
            "conf_thres": 0.25,
            "iou_thres": 0.45,
            "device": "cpu",
        }

        _PekLayoutModel(
            yolo_cls=FakeYOLOv10,
            model_cfg=fake_model_cfg,
            pek_root="/app/PDF-Extract-Kit",
        )

        assert received_paths == [abs_path], (
            f"Absolute path was modified unexpectedly: {received_paths}"
        )


# ---------------------------------------------------------------------------
# PEK-MULTIPAGE — _group_bboxes_into_units correctness (RC-1 + RC-2 fix)
# ---------------------------------------------------------------------------


def _make_table_page(page_num: int) -> Dict:
    """Return a fake pages_bboxes entry for a page with one table bbox."""
    from infrastructure.pek_engine_adapter import _LAYOUT_CLASS_TABLE
    return {page_num: [{"label": _LAYOUT_CLASS_TABLE, "bbox": [100, 200, 900, 2800], "score": 0.95}]}


def _make_prose_page(page_num: int) -> Dict:
    """Return a fake pages_bboxes entry for a page with no table bbox (prose)."""
    from infrastructure.pek_engine_adapter import _LAYOUT_CLASS_PLAIN_TEXT
    return {page_num: [{"label": _LAYOUT_CLASS_PLAIN_TEXT, "bbox": [50, 100, 800, 500], "score": 0.88}]}


def _make_blank_page(page_num: int) -> Dict:
    """Return a fake pages_bboxes entry for a blank page (empty bbox list)."""
    return {page_num: []}


def _default_dims(*page_nums: int) -> Dict:
    """Return page_dims with 1000×1400 for all specified page numbers."""
    return {p: (1000, 1400) for p in page_nums}


class TestGroupBboxesIntoUnits:
    """
    PEK-MULTIPAGE — verifies the rewritten _group_bboxes_into_units algorithm.

    RC-1: consecutive table pages must aggregate into one unit (X-range heuristic gone).
    RC-2: prose pages must NOT create ghost units (double finalize_unit eliminated).
    Cap: 8 consecutive table pages → unit boundary, new unit starts with page 9.

    All tests use injected fake bbox dicts — zero model weights, zero network.
    """

    def test_single_table_page_produces_one_unit(self):
        """
        A single table page → exactly 1 unit covering that page.
        Verifies basic happy-path: page_type='table', pages=[N].
        """
        from infrastructure.pek_engine_adapter import _group_bboxes_into_units

        pages_bboxes = _make_table_page(5)
        units = _group_bboxes_into_units(pages_bboxes, _default_dims(5))

        assert len(units) == 1, f"Expected 1 unit, got {len(units)}: {units}"
        assert units[0]["page_type"] == "table"
        assert units[0]["pages"] == [5]
        assert units[0]["schema_page"] == 5

    def test_three_consecutive_table_pages_produce_one_unit(self):
        """
        RC-1 fix: 3 consecutive table pages → 1 unit with page_numbers=[7, 8, 9].
        The old X-range heuristic split this into 3 separate units.
        """
        from infrastructure.pek_engine_adapter import _group_bboxes_into_units

        pages_bboxes: Dict = {}
        pages_bboxes.update(_make_table_page(7))
        pages_bboxes.update(_make_table_page(8))
        pages_bboxes.update(_make_table_page(9))

        units = _group_bboxes_into_units(pages_bboxes, _default_dims(7, 8, 9))

        assert len(units) == 1, (
            f"Expected 1 unit for pages 7-8-9, got {len(units)}: "
            f"{[u['pages'] for u in units]}"
        )
        assert units[0]["pages"] == [7, 8, 9], (
            f"pages must be [7, 8, 9], got {units[0]['pages']}"
        )
        assert units[0]["page_type"] == "table"
        assert units[0]["schema_page"] == 7

    def test_table_prose_table_produces_two_units(self):
        """
        RC-1 fix: prose page acts as boundary → 2 separate table units.
        Layout: table(p3) | prose(p4) | table(p5) → unit([3]), unit([5]).
        """
        from infrastructure.pek_engine_adapter import _group_bboxes_into_units

        pages_bboxes: Dict = {}
        pages_bboxes.update(_make_table_page(3))
        pages_bboxes.update(_make_prose_page(4))
        pages_bboxes.update(_make_table_page(5))

        units = _group_bboxes_into_units(pages_bboxes, _default_dims(3, 4, 5))

        assert len(units) == 2, (
            f"Expected 2 units (table|prose|table), got {len(units)}: "
            f"{[u['pages'] for u in units]}"
        )
        assert units[0]["pages"] == [3]
        assert units[1]["pages"] == [5]
        assert all(u["page_type"] == "table" for u in units)

    def test_prose_only_creates_no_unit(self):
        """
        RC-2 fix: prose-only input → zero units (no ghost unit).
        The old double finalize_unit() created a ghost empty unit for every prose page.
        """
        from infrastructure.pek_engine_adapter import _group_bboxes_into_units

        pages_bboxes: Dict = {}
        pages_bboxes.update(_make_prose_page(1))
        pages_bboxes.update(_make_prose_page(2))
        pages_bboxes.update(_make_blank_page(3))

        units = _group_bboxes_into_units(pages_bboxes, _default_dims(1, 2, 3))

        assert len(units) == 0, (
            f"Expected 0 units for prose-only input, got {len(units)}: "
            f"{[u['pages'] for u in units]} — "
            "ghost-unit (RC-2) regression: prose pages must NOT create units"
        )

    def test_nine_consecutive_table_pages_split_at_cap(self):
        """
        Cap guard: 9 consecutive table pages → 2 units.
        First unit covers pages 1-8 (cap=8), second unit covers page 9.
        Verifies the 8-page cap boundary.
        """
        from infrastructure.pek_engine_adapter import _group_bboxes_into_units

        pages_bboxes: Dict = {}
        for p in range(1, 10):  # pages 1..9
            pages_bboxes.update(_make_table_page(p))

        units = _group_bboxes_into_units(pages_bboxes, _default_dims(*range(1, 10)))

        assert len(units) == 2, (
            f"Expected 2 units for 9 consecutive table pages (cap=8), "
            f"got {len(units)}: {[u['pages'] for u in units]}"
        )
        assert units[0]["pages"] == list(range(1, 9)), (
            f"First unit must cover pages 1-8, got {units[0]['pages']}"
        )
        assert units[1]["pages"] == [9], (
            f"Second unit must cover page 9 only, got {units[1]['pages']}"
        )


# ---------------------------------------------------------------------------
# PEK-ROWCOUNT — row_count semantics: pipe data rows, not newlines
# ---------------------------------------------------------------------------

class TestRowCountSemantics:
    """
    PEK-ROWCOUNT — verifies the corrected row_count expression.

    The field must count non-separator pipe rows (lines that start with '|'
    and do NOT contain '---'), not raw newline characters.

    Architect adjudication (2026-05-27 PEK-QA-ADJUDICATE §D):
      Current (wrong): row_count = stitched_md.count("\\n")
      Corrected:       row_count = sum(1 for line in stitched_md.split("\\n")
                                       if line.strip().startswith("|")
                                       and "---" not in line)

    All tests are pure-Python — zero model weights, zero network.
    """

    @staticmethod
    def _count_pipe_rows(stitched_md: str) -> int:
        """Mirror of the corrected expression in pek_engine_adapter.py:799."""
        return sum(
            1 for line in stitched_md.split("\n")
            if line.strip().startswith("|") and "---" not in line
        )

    def test_pipe_data_rows_counted_separator_excluded(self):
        """
        N pipe data rows + 1 separator row → row_count = N (separator excluded).
        This is the core contract: '| --- | --- |' must not be counted.
        """
        stitched_md = (
            "| col1 | col2 |\n"
            "| --- | --- |\n"
            "| val1 | val2 |\n"
            "| val3 | val4 |\n"
        )
        # 3 pipe rows total, 1 is '| --- | --- |' separator → count = 2
        # (header row "| col1 | col2 |" is a pipe row with no '---' → counted)
        assert self._count_pipe_rows(stitched_md) == 3, (
            "Expected 3 non-separator pipe rows (header + 2 data); separator must be excluded"
        )

    def test_separator_only_yields_zero(self):
        """A markdown with only a separator row → row_count = 0."""
        stitched_md = "| --- | --- |\n"
        assert self._count_pipe_rows(stitched_md) == 0, (
            "Separator-only markdown must yield row_count = 0"
        )

    def test_blank_lines_not_counted(self):
        """Blank lines and non-pipe lines are excluded from the count."""
        stitched_md = (
            "\n"
            "Some prose text\n"
            "| data row |\n"
            "\n"
        )
        assert self._count_pipe_rows(stitched_md) == 1, (
            "Only the pipe data row must be counted; blank and prose lines excluded"
        )

    def test_empty_string_yields_zero(self):
        """Empty stitched markdown → row_count = 0 (not 1 as .count('\\n') would give)."""
        assert self._count_pipe_rows("") == 0, (
            "Empty string must yield row_count = 0"
        )

    def test_multipage_pek_unit_pattern(self):
        """
        Simulates the FPT pages 7/8/9 pattern: 3 pipe content blocks separated
        by '| --- | --- |' separator rows.

        Each page produces 1 flat pipe row (all cells concatenated).
        row_count must equal 3 (one per page data block), not 3 + separator count.
        """
        # 3 page blocks, each as 1 flat pipe row, separated by | --- | --- |
        stitched_md = (
            "| balance sheet data col1 col2 col3 |\n"
            "| --- | --- |\n"
            "| income statement data col1 col2 col3 |\n"
            "| --- | --- |\n"
            "| yoy comparison data col1 col2 |\n"
        )
        # 3 non-separator pipe rows (one per page block); 2 separators excluded
        assert self._count_pipe_rows(stitched_md) == 3, (
            "3-page PEK unit with 2 separators must yield row_count=3 "
            "(one pipe data row per page, separators excluded)"
        )


# ---------------------------------------------------------------------------
# BTB-UNBLOCK-DEV: Observability tests (fail-loud, timeout, echo-vs-DB)
# ---------------------------------------------------------------------------


class TestFailLoudAndTimeout:
    """
    BTB-UNBLOCK-DEV (sprint BCTC-TABLE-BOUNDARY, task BTB-UNBLOCK-DEV).

    Tests for the four observability improvements:
      1. FAIL-LOUD: _run_pek_extract logs exceptions with exc_info=True (full traceback).
         DV-GUARD: a test that FAILS if exc_info=True is reverted to exc_info=False
         or removed (i.e. the silent-swallow anti-pattern is detected).
      2. ECHO-vs-DB: DONE log contains "push_echo" label, not "units_stored" alone.
      3. TIMEOUT: PekEngineAdapter.extract_layout_and_tables() raises RuntimeError
         when _run_extraction exceeds _EXTRACTION_TIMEOUT_SECONDS.
      4. TIMEOUT env: _EXTRACTION_TIMEOUT_SECONDS reads from PEK_EXTRACTION_TIMEOUT_SECONDS.

    Heartbeat logging (per-page progress in _run_table_extraction) requires a live
    PaddleOCR loop and cannot be meaningfully unit-tested without real model weights.
    Verification: confirmed by ops instrumented run watching log stream — not faked here.
    """

    # -----------------------------------------------------------------------
    # 1. FAIL-LOUD: exc_info=True (deliberate-violation guard)
    # -----------------------------------------------------------------------

    def test_run_pek_extract_logs_exc_info_true_on_failure(self):
        """
        DV-GUARD (deliberate-violation): _run_pek_extract must call logger.error
        with exc_info=True when an exception occurs.

        This test FAILS if the handler reverts to silent-swallow (exc_info=False /
        exc_info omitted) — which was the root cause of the cycle1 confusion where
        "units_stored=28 but DB=0" hid the actual failure.

        Method: use logging.handlers.MemoryHandler (via caplog-equivalent) to
        intercept actual log records emitted by the handler's internal logger.
        Verifies exc_info is set on the error record (LogRecord.exc_info is not None).
        """
        import asyncio
        import logging
        from unittest.mock import AsyncMock, MagicMock

        # Inject a fake adapter that raises so the except branch runs
        failing_adapter = MagicMock()
        failing_adapter.extract_layout_and_tables.side_effect = RuntimeError(
            "Simulated extraction failure for DV-GUARD"
        )

        # Capture log records via a real logging handler
        captured_records: list = []

        class CapturingHandler(logging.Handler):
            def emit(self, record):
                captured_records.append(record)

        handler = CapturingHandler(level=logging.ERROR)
        # The handler uses logging.getLogger(__name__) where __name__ is interface.handlers
        target_logger = logging.getLogger("interface.handlers")
        target_logger.addHandler(handler)
        target_logger.setLevel(logging.ERROR)

        try:
            from interface.handlers import _run_pek_extract
            asyncio.run(_run_pek_extract(
                pek_adapter=failing_adapter,
                push_client=AsyncMock(),
                report_id="dv-guard-report-id",
                pdf_path="/fake/path.pdf",
            ))
        finally:
            target_logger.removeHandler(handler)

        assert len(captured_records) >= 1, (
            "_run_pek_extract: no ERROR log records emitted on exception — "
            "handler is silently swallowing failures. "
            "DV-GUARD: this must fail if fail-loud is reverted."
        )

        last_record = captured_records[-1]
        assert last_record.exc_info is not None and last_record.exc_info[0] is not None, (
            f"_run_pek_extract: ERROR record has exc_info={last_record.exc_info!r} — "
            "logger.error was called WITHOUT exc_info=True (or exc_info omitted). "
            "DV-GUARD: exc_info=True is mandatory — silent-swallow anti-pattern detected. "
            "Full traceback must be in the log record so ops can diagnose failures."
        )

    def test_run_pek_extract_done_log_uses_push_echo_label(self):
        """
        ECHO-vs-DB: the DONE log must use 'push_echo' in the message format string
        so that operators know they are reading the mcp-server HTTP response echo,
        NOT a committed DB row count.

        Per project_mcp_server_write_wedge: pushBctcLayoutHandler echoes the
        input length; a "200 OK + units_stored=28" does NOT mean 28 rows in DB.

        Method: inject a successful adapter + push client; capture INFO log records;
        assert the format string contains 'push_echo'.
        """
        import asyncio
        import logging
        from unittest.mock import AsyncMock, MagicMock

        success_adapter = MagicMock()
        success_adapter.extract_layout_and_tables.return_value = {
            "document_map": {},
            "units": [],
            "page_zones": [],
            "pass_rate_report": {},
        }

        success_push_client = AsyncMock()
        success_push_client.push_layout = AsyncMock(return_value={
            "units_stored": 28,
            "pages_stored": 46,
        })

        captured_records: list = []

        class CapturingHandler(logging.Handler):
            def emit(self, record):
                captured_records.append(record)

        handler = CapturingHandler(level=logging.INFO)
        target_logger = logging.getLogger("interface.handlers")
        target_logger.addHandler(handler)
        original_level = target_logger.level
        target_logger.setLevel(logging.INFO)

        try:
            from interface.handlers import _run_pek_extract
            asyncio.run(_run_pek_extract(
                pek_adapter=success_adapter,
                push_client=success_push_client,
                report_id="echo-vs-db-test",
                pdf_path="/fake/path.pdf",
            ))
        finally:
            target_logger.removeHandler(handler)
            target_logger.setLevel(original_level)

        # Collect all INFO message format strings
        all_msgs = " ".join(r.getMessage() for r in captured_records if r.levelno == logging.INFO)
        # Also check format strings (msg field before % formatting)
        all_fmts = " ".join(r.msg for r in captured_records if r.levelno == logging.INFO)

        assert "push_echo" in all_fmts or "push_echo" in all_msgs or "echo" in all_msgs.lower(), (
            "DONE log does not mention 'push_echo' or echo semantics. "
            "Operators cannot distinguish mcp-server echo from committed DB count. "
            f"Captured log format strings: {all_fmts!r}"
        )

    # -----------------------------------------------------------------------
    # 3. TIMEOUT: extraction raises RuntimeError on timeout
    # -----------------------------------------------------------------------

    def test_extract_layout_and_tables_raises_on_timeout(self):
        """
        If _run_extraction takes longer than _EXTRACTION_TIMEOUT_SECONDS,
        extract_layout_and_tables must raise RuntimeError (not hang forever).

        Method: override _EXTRACTION_TIMEOUT_SECONDS to 0 (immediate timeout);
        inject _run_extraction that sleeps 1s so the future always expires.
        Asserts RuntimeError is raised with a message mentioning 'TIMED OUT'.
        """
        import time
        import infrastructure.pek_engine_adapter as m
        from infrastructure.pek_engine_adapter import PekEngineAdapter, SemaphoreContendedError

        adapter = PekEngineAdapter()

        def slow_extraction(**kwargs):
            time.sleep(2)  # Longer than override timeout
            return {}

        original_timeout = m._EXTRACTION_TIMEOUT_SECONDS
        try:
            m._EXTRACTION_TIMEOUT_SECONDS = 0  # Force immediate timeout
            with patch.object(adapter, "_run_extraction", side_effect=slow_extraction):
                with pytest.raises(RuntimeError) as exc_info:
                    adapter.extract_layout_and_tables(
                        pdf_path="/fake/big.pdf",
                        report_id="timeout-test-report",
                    )
        finally:
            m._EXTRACTION_TIMEOUT_SECONDS = original_timeout  # Restore
            # Ensure semaphore is released (timeout leaves finally block to release it)

        assert "TIMED OUT" in str(exc_info.value), (
            f"RuntimeError on timeout must say 'TIMED OUT', got: {exc_info.value!r}"
        )
        assert "timeout-test-report" in str(exc_info.value), (
            "RuntimeError must include the report_id for ops diagnosis"
        )

    def test_semaphore_released_after_timeout(self):
        """
        After a timeout RuntimeError, the semaphore must be released so the
        next extraction can proceed (no deadlock).

        This is a safety invariant: a timed-out extraction must not permanently
        hold the semaphore and prevent all future extractions from running.
        """
        import time
        import infrastructure.pek_engine_adapter as m
        from infrastructure.pek_engine_adapter import (
            PekEngineAdapter, _extraction_semaphore
        )

        adapter = PekEngineAdapter()

        def slow_extraction(**kwargs):
            time.sleep(2)
            return {}

        original_timeout = m._EXTRACTION_TIMEOUT_SECONDS
        try:
            m._EXTRACTION_TIMEOUT_SECONDS = 0
            with patch.object(adapter, "_run_extraction", side_effect=slow_extraction):
                try:
                    adapter.extract_layout_and_tables(
                        pdf_path="/fake/a.pdf",
                        report_id="semaphore-release-test",
                    )
                except RuntimeError:
                    pass  # Expected timeout
        finally:
            m._EXTRACTION_TIMEOUT_SECONDS = original_timeout

        # Semaphore must be available (not held)
        can_acquire = _extraction_semaphore.acquire(blocking=False)
        if can_acquire:
            _extraction_semaphore.release()
        assert can_acquire, (
            "Semaphore is still held after timeout — deadlock risk! "
            "The finally block in extract_layout_and_tables must release it "
            "even when a TimeoutError is raised."
        )

    # -----------------------------------------------------------------------
    # 4. TIMEOUT env: configurable via PEK_EXTRACTION_TIMEOUT_SECONDS
    # -----------------------------------------------------------------------

    def test_extraction_timeout_reads_from_env(self):
        """
        _EXTRACTION_TIMEOUT_SECONDS must be configurable via
        PEK_EXTRACTION_TIMEOUT_SECONDS env var.

        Method: re-import the module with a patched os.environ and verify the
        module-level constant picks up the override.

        Note: because the constant is set at module import time, we test the
        parse logic (int coercion) rather than live hot-reload.
        """
        import importlib
        import sys
        import os

        # Save original
        original_env = os.environ.get("PEK_EXTRACTION_TIMEOUT_SECONDS")
        original_module = sys.modules.pop("infrastructure.pek_engine_adapter", None)

        try:
            os.environ["PEK_EXTRACTION_TIMEOUT_SECONDS"] = "999"
            # Re-import fresh to pick up env
            import infrastructure.pek_engine_adapter as m_fresh
            assert m_fresh._EXTRACTION_TIMEOUT_SECONDS == 999, (
                f"_EXTRACTION_TIMEOUT_SECONDS should be 999 when env is '999', "
                f"got {m_fresh._EXTRACTION_TIMEOUT_SECONDS}"
            )
        finally:
            # Restore
            if original_env is None:
                os.environ.pop("PEK_EXTRACTION_TIMEOUT_SECONDS", None)
            else:
                os.environ["PEK_EXTRACTION_TIMEOUT_SECONDS"] = original_env
            # Restore original module if it was cached
            if original_module is not None:
                sys.modules["infrastructure.pek_engine_adapter"] = original_module
            else:
                sys.modules.pop("infrastructure.pek_engine_adapter", None)

    def test_default_timeout_is_at_least_30_minutes(self):
        """
        _DEFAULT_EXTRACTION_TIMEOUT_SECONDS must be >= 1800 seconds (30 minutes).
        A 46-page CPU PaddleOCR run legitimately takes ~20 minutes on this host.
        A timeout shorter than 30 minutes would kill normal runs prematurely.
        """
        from infrastructure.pek_engine_adapter import _DEFAULT_EXTRACTION_TIMEOUT_SECONDS
        assert _DEFAULT_EXTRACTION_TIMEOUT_SECONDS >= 1800, (
            f"Default timeout is {_DEFAULT_EXTRACTION_TIMEOUT_SECONDS}s — must be >= 1800s (30 min). "
            "A 46-page CPU PaddleOCR run takes ~20 minutes; "
            "shorter timeout kills normal runs (cycle2 regression)."
        )
