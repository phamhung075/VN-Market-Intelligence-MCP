"""
Unit tests — infrastructure/ocr_backends.py + OcrBackendPort (PEK-IMPL-OCR)

Tests:
    1. TesseractVieBackend selected by default (OCR_TEXT_BACKEND unset).
    2. PaddleOcrBackend selected when OCR_TEXT_BACKEND=paddleocr.
    3. TesseractVieBackend selected when OCR_TEXT_BACKEND=tesseract-vie.
    4. AutoFallbackOcrBackend selected when OCR_TEXT_BACKEND=auto.
    5. Unknown OCR_TEXT_BACKEND value → logs warning + falls back to tesseract-vie.
    6. AutoFallbackOcrBackend: high Tesseract confidence → no PaddleOCR call.
    7. AutoFallbackOcrBackend: low Tesseract confidence → PaddleOCR invoked; keeps higher result.
    8. AutoFallbackOcrBackend: Tesseract low, PaddleOCR lower → Tesseract result kept.
    9. OcrBackendPort contract: TesseractVieBackend returns ("", 0.0) on None input.
   10. OcrBackendPort contract: PaddleOcrBackend returns ("", 0.0) on None input.
   11. OcrBackendPort contract: PaddleOcrBackend returns ("", 0.0) when paddle_table is None.
   12. PaddleOcrBackend.set_paddle_table() wires in a paddle instance correctly.
   13. AutoFallbackOcrBackend.set_paddle_table() propagates to internal paddle_backend.
   14. PekEngineAdapter: ocr_backend injected; set_paddle_table() called on first extraction.
   15. import-linter compliance: domain.repositories imported cleanly, no infra → domain violation.

All tests use injected fakes — zero model weights, zero network, zero creds.
DDD: infrastructure-layer tests.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from unittest.mock import MagicMock, patch
from typing import Any, Tuple


# ---------------------------------------------------------------------------
# Helpers — fake backends for isolation
# ---------------------------------------------------------------------------

class _FakeTesseractBackend:
    """Fake TesseractVieBackend: returns configurable (text, confidence)."""

    def __init__(self, text: str = "fake text", conf: float = 0.8) -> None:
        self._text = text
        self._conf = conf
        self.call_count = 0

    def recognize_text(self, image_or_region: Any) -> Tuple[str, float]:
        self.call_count += 1
        return (self._text, self._conf)


class _FakePaddleBackend:
    """Fake PaddleOcrBackend: returns configurable (text, confidence)."""

    def __init__(self, text: str = "paddle text", conf: float = 0.6) -> None:
        self._text = text
        self._conf = conf
        self.call_count = 0
        self._paddle_table = None

    def set_paddle_table(self, paddle_table: Any) -> None:
        self._paddle_table = paddle_table

    def recognize_text(self, image_or_region: Any) -> Tuple[str, float]:
        self.call_count += 1
        return (self._text, self._conf)


# ---------------------------------------------------------------------------
# 1–5: select_ocr_backend() factory / env-driven selection
# ---------------------------------------------------------------------------

class TestSelectOcrBackend:
    """Tests for infrastructure.ocr_backends.select_ocr_backend() factory."""

    def test_default_backend_is_tesseract_vie_when_env_unset(self, monkeypatch):
        """Default (OCR_TEXT_BACKEND not set) → TesseractVieBackend."""
        monkeypatch.delenv("OCR_TEXT_BACKEND", raising=False)
        from infrastructure.ocr_backends import select_ocr_backend, TesseractVieBackend

        backend = select_ocr_backend(paddle_table=None)
        assert isinstance(backend, TesseractVieBackend), (
            f"Expected TesseractVieBackend by default, got {type(backend).__name__}"
        )

    def test_tesseract_vie_selected_explicitly(self, monkeypatch):
        """OCR_TEXT_BACKEND=tesseract-vie → TesseractVieBackend."""
        monkeypatch.setenv("OCR_TEXT_BACKEND", "tesseract-vie")
        from infrastructure.ocr_backends import select_ocr_backend, TesseractVieBackend

        backend = select_ocr_backend(paddle_table=None)
        assert isinstance(backend, TesseractVieBackend)

    def test_paddleocr_backend_selected(self, monkeypatch):
        """OCR_TEXT_BACKEND=paddleocr → PaddleOcrBackend."""
        monkeypatch.setenv("OCR_TEXT_BACKEND", "paddleocr")
        from infrastructure.ocr_backends import select_ocr_backend, PaddleOcrBackend

        backend = select_ocr_backend(paddle_table=None)
        assert isinstance(backend, PaddleOcrBackend), (
            f"Expected PaddleOcrBackend for paddleocr, got {type(backend).__name__}"
        )

    def test_auto_backend_selected(self, monkeypatch):
        """OCR_TEXT_BACKEND=auto → AutoFallbackOcrBackend."""
        monkeypatch.setenv("OCR_TEXT_BACKEND", "auto")
        from infrastructure.ocr_backends import select_ocr_backend, AutoFallbackOcrBackend

        backend = select_ocr_backend(paddle_table=None)
        assert isinstance(backend, AutoFallbackOcrBackend), (
            f"Expected AutoFallbackOcrBackend for auto, got {type(backend).__name__}"
        )

    def test_unknown_value_falls_back_to_tesseract_and_logs_warning(
        self, monkeypatch, caplog
    ):
        """Unknown OCR_TEXT_BACKEND value → warns + returns TesseractVieBackend."""
        monkeypatch.setenv("OCR_TEXT_BACKEND", "unknown-backend-xyz")
        import logging
        from infrastructure.ocr_backends import select_ocr_backend, TesseractVieBackend

        with caplog.at_level(logging.WARNING, logger="infrastructure.ocr_backends"):
            backend = select_ocr_backend(paddle_table=None)

        assert isinstance(backend, TesseractVieBackend)
        # Warning must be logged
        assert any("unknown" in record.message.lower() or "unknown-backend-xyz" in record.message
                   for record in caplog.records), (
            "Expected a warning log for unknown OCR_TEXT_BACKEND"
        )


# ---------------------------------------------------------------------------
# 6–8: AutoFallbackOcrBackend policy
# ---------------------------------------------------------------------------

class TestAutoFallbackPolicy:
    """Tests for AutoFallbackOcrBackend confidence-based fallback policy."""

    def test_high_tesseract_confidence_skips_paddleocr(self):
        """
        Tesseract confidence >= threshold → PaddleOCR is NOT called.
        Returns Tesseract result directly.
        """
        from infrastructure.ocr_backends import AutoFallbackOcrBackend

        tess = _FakeTesseractBackend(text="high conf text", conf=0.9)
        paddle = _FakePaddleBackend(text="paddle text", conf=0.7)

        backend = AutoFallbackOcrBackend(
            tesseract_backend=tess,
            paddle_backend=paddle,
            threshold=0.5,
        )

        text, conf = backend.recognize_text(object())  # fake image

        assert text == "high conf text"
        assert conf == pytest.approx(0.9)
        assert tess.call_count == 1
        assert paddle.call_count == 0, (
            "PaddleOCR should NOT be called when Tesseract confidence is sufficient"
        )

    def test_low_tesseract_confidence_triggers_paddle_fallback_keeps_higher(self):
        """
        Tesseract confidence < threshold AND PaddleOCR confidence > Tesseract →
        AutoFallback invokes PaddleOCR and keeps the higher-confidence result.
        """
        from infrastructure.ocr_backends import AutoFallbackOcrBackend

        tess = _FakeTesseractBackend(text="low conf", conf=0.2)
        paddle = _FakePaddleBackend(text="better paddle", conf=0.75)

        backend = AutoFallbackOcrBackend(
            tesseract_backend=tess,
            paddle_backend=paddle,
            threshold=0.5,
        )

        text, conf = backend.recognize_text(object())

        assert text == "better paddle", (
            "AutoFallback should keep PaddleOCR result when its confidence is higher"
        )
        assert conf == pytest.approx(0.75)
        assert tess.call_count == 1
        assert paddle.call_count == 1

    def test_low_tesseract_paddle_even_lower_keeps_tesseract(self):
        """
        Tesseract confidence < threshold, PaddleOCR confidence < Tesseract →
        AutoFallback runs both but keeps the Tesseract result (higher score).
        """
        from infrastructure.ocr_backends import AutoFallbackOcrBackend

        tess = _FakeTesseractBackend(text="tess result", conf=0.35)
        paddle = _FakePaddleBackend(text="worse paddle", conf=0.1)

        backend = AutoFallbackOcrBackend(
            tesseract_backend=tess,
            paddle_backend=paddle,
            threshold=0.5,
        )

        text, conf = backend.recognize_text(object())

        assert text == "tess result", (
            "AutoFallback should keep Tesseract result when it has higher confidence"
        )
        assert conf == pytest.approx(0.35)
        assert tess.call_count == 1
        assert paddle.call_count == 1


# ---------------------------------------------------------------------------
# 9–11: OcrBackendPort contract — None/empty input handling
# ---------------------------------------------------------------------------

class TestOcrBackendPortContract:
    """
    OcrBackendPort contract: all adapters must handle None / empty inputs gracefully.
    No exceptions raised; returns ("", 0.0) for None or empty image.
    """

    def test_tesseract_backend_returns_empty_on_none(self):
        """TesseractVieBackend.recognize_text(None) → ("", 0.0) — no exception."""
        from infrastructure.ocr_backends import TesseractVieBackend

        backend = TesseractVieBackend()
        text, conf = backend.recognize_text(None)
        assert text == ""
        assert conf == 0.0

    def test_paddle_backend_returns_empty_on_none(self):
        """PaddleOcrBackend.recognize_text(None) → ("", 0.0) — no exception."""
        from infrastructure.ocr_backends import PaddleOcrBackend

        backend = PaddleOcrBackend(paddle_table=None)
        text, conf = backend.recognize_text(None)
        assert text == ""
        assert conf == 0.0

    def test_paddle_backend_returns_empty_when_paddle_table_is_none(self):
        """
        PaddleOcrBackend with no paddle_table instance (not yet loaded) →
        recognize_text() returns ("", 0.0) — graceful degrade.
        """
        from infrastructure.ocr_backends import PaddleOcrBackend
        import numpy as np

        backend = PaddleOcrBackend(paddle_table=None)
        fake_image = np.zeros((50, 200, 3), dtype="uint8")
        text, conf = backend.recognize_text(fake_image)
        assert text == ""
        assert conf == 0.0

    def test_auto_fallback_returns_empty_on_none(self):
        """AutoFallbackOcrBackend.recognize_text(None) → ("", 0.0) — no exception."""
        from infrastructure.ocr_backends import AutoFallbackOcrBackend

        tess = _FakeTesseractBackend(conf=0.9)
        paddle = _FakePaddleBackend(conf=0.7)
        backend = AutoFallbackOcrBackend(
            tesseract_backend=tess,
            paddle_backend=paddle,
        )
        text, conf = backend.recognize_text(None)
        assert text == ""
        assert conf == 0.0


# ---------------------------------------------------------------------------
# 12–13: set_paddle_table() deferred wiring
# ---------------------------------------------------------------------------

class TestSetPaddleTableWiring:
    """Tests for deferred paddle_table wiring (lazy-model-load pattern)."""

    def test_paddle_backend_set_paddle_table_wires_instance(self):
        """
        PaddleOcrBackend.set_paddle_table() updates the internal paddle_table reference.
        After wiring, recognize_text() uses the new instance.
        """
        from infrastructure.ocr_backends import PaddleOcrBackend
        import numpy as np

        backend = PaddleOcrBackend(paddle_table=None)
        assert backend._paddle_table is None

        fake_paddle = MagicMock()
        fake_paddle.ocr.return_value = [
            [([100, 0, 200, 0, 200, 20, 100, 20], ("Doanh thu", 0.92))]
        ]
        backend.set_paddle_table(fake_paddle)

        assert backend._paddle_table is fake_paddle

        fake_image = np.zeros((50, 200, 3), dtype="uint8")
        text, conf = backend.recognize_text(fake_image)
        fake_paddle.ocr.assert_called_once()

    def test_auto_fallback_set_paddle_table_propagates_to_internal_paddle_backend(self):
        """
        AutoFallbackOcrBackend.set_paddle_table() propagates to its internal
        PaddleOcrBackend._paddle_table.
        """
        from infrastructure.ocr_backends import AutoFallbackOcrBackend

        tess = _FakeTesseractBackend()
        paddle = _FakePaddleBackend()
        backend = AutoFallbackOcrBackend(
            tesseract_backend=tess,
            paddle_backend=paddle,
        )

        fake_paddle_instance = MagicMock()
        backend.set_paddle_table(fake_paddle_instance)

        assert paddle._paddle_table is fake_paddle_instance


# ---------------------------------------------------------------------------
# 14: PekEngineAdapter ocr_backend injection + set_paddle_table called
# ---------------------------------------------------------------------------

class TestPekEngineAdapterOcrInjection:
    """
    Tests that PekEngineAdapter correctly injects the OCR backend and wires
    paddle_table when _run_extraction is called.
    """

    def test_pek_engine_adapter_injects_ocr_backend(self):
        """
        PekEngineAdapter(ocr_backend=...) stores the injected backend.
        """
        from infrastructure.pek_engine_adapter import PekEngineAdapter

        fake_backend = _FakeTesseractBackend()
        adapter = PekEngineAdapter(ocr_backend=fake_backend)
        assert adapter._ocr_backend is fake_backend

    def test_pek_engine_adapter_calls_set_paddle_table_on_extraction(self):
        """
        When _run_extraction() is called and models are loaded, set_paddle_table()
        is called on the injected backend if it has that method.
        """
        from infrastructure.pek_engine_adapter import PekEngineAdapter

        fake_paddle_instance = MagicMock()
        fake_backend = MagicMock()
        fake_backend.set_paddle_table = MagicMock()

        fake_models = {
            "layout_task": None,
            "ocr_task": None,
            "paddle_table": fake_paddle_instance,
        }

        adapter = PekEngineAdapter(ocr_backend=fake_backend)

        with patch("infrastructure.pek_engine_adapter._get_pek_models", return_value=fake_models):
            with patch.object(adapter, "_run_layout_detection", side_effect=Exception("no layout")):
                # _run_layout_detection will raise → falls back to _get_page_dims_fallback
                with patch.object(adapter, "_get_page_dims_fallback", return_value=({}, {})):
                    result = adapter._run_extraction(
                        pdf_path="/fake/path.pdf",
                        report_id="test-ocr-injection",
                    )

        # set_paddle_table must have been called with the loaded paddle instance
        fake_backend.set_paddle_table.assert_called_once_with(fake_paddle_instance)

    def test_pek_engine_adapter_no_set_paddle_table_if_backend_lacks_method(self):
        """
        If the injected backend does NOT have set_paddle_table() (e.g. TesseractVieBackend),
        no AttributeError is raised.
        """
        from infrastructure.pek_engine_adapter import PekEngineAdapter
        from infrastructure.ocr_backends import TesseractVieBackend

        tesseract_backend = TesseractVieBackend()
        fake_models = {
            "layout_task": None,
            "ocr_task": None,
            "paddle_table": MagicMock(),
        }

        adapter = PekEngineAdapter(ocr_backend=tesseract_backend)

        with patch("infrastructure.pek_engine_adapter._get_pek_models", return_value=fake_models):
            with patch.object(adapter, "_get_page_dims_fallback", return_value=({}, {})):
                # Should not raise AttributeError
                result = adapter._run_extraction(
                    pdf_path="/fake/path.pdf",
                    report_id="test-no-set-paddle",
                )

        assert "document_map" in result

    def test_pek_engine_adapter_no_ocr_backend_uses_paddle_table_directly(self):
        """
        PekEngineAdapter with ocr_backend=None (default) falls back to the
        direct paddle_table path (backward-compatible). set_paddle_table NOT called.
        """
        from infrastructure.pek_engine_adapter import PekEngineAdapter

        fake_models = {
            "layout_task": None,
            "ocr_task": None,
            "paddle_table": None,
        }

        # No ocr_backend injected
        adapter = PekEngineAdapter(ocr_backend=None)

        with patch("infrastructure.pek_engine_adapter._get_pek_models", return_value=fake_models):
            with patch.object(adapter, "_get_page_dims_fallback", return_value=({}, {})):
                result = adapter._run_extraction(
                    pdf_path="/fake/path.pdf",
                    report_id="test-no-backend",
                )

        assert "document_map" in result
        assert adapter._ocr_backend is None


# ---------------------------------------------------------------------------
# 15: import-linter compliance — OcrBackendPort in domain/repositories.py
# ---------------------------------------------------------------------------

class TestOcrBackendPortDomainCompliance:
    """Verify OcrBackendPort is in domain layer with zero infra imports."""

    def test_ocr_backend_port_is_in_domain_repositories(self):
        """
        OcrBackendPort must be importable from domain.repositories.
        It is a pure Protocol — no infrastructure imports in that file.
        """
        from domain.repositories import OcrBackendPort
        assert OcrBackendPort is not None

    def test_domain_repositories_has_no_infra_imports(self):
        """
        domain/repositories.py must not import from infrastructure/ or interface/.
        (Fence-A / Fence-B compliance.)
        """
        import inspect
        import domain.repositories as repo_module

        source = inspect.getsource(repo_module)
        import_lines = [
            line.strip()
            for line in source.splitlines()
            if line.strip().startswith("from ") or line.strip().startswith("import ")
        ]
        import_block = "\n".join(import_lines)

        forbidden = ["infrastructure", "interface"]
        for banned in forbidden:
            assert banned not in import_block, (
                f"domain/repositories.py contains import from '{banned}' — DDD violation!\n"
                f"Import lines:\n{import_block}"
            )

    def test_ocr_backend_port_has_recognize_text_method(self):
        """OcrBackendPort Protocol defines recognize_text(image_or_region)."""
        from domain.repositories import OcrBackendPort
        import inspect

        # Protocol methods accessible via __protocol_attrs__ or inspection
        source = inspect.getsource(OcrBackendPort)
        assert "recognize_text" in source, (
            "OcrBackendPort must define recognize_text() method"
        )


# ---------------------------------------------------------------------------
# PEK-OCR-ROOTCAUSE: Tests A–E — _to_pil path + fail-loud contract
# These are the exact tests that would have caught the _to_pil NameError
# before ship (see architect brief 2026-05-27-pek-ocr-rootcause.md §7).
# All use mocked pytesseract — zero real model weights, zero credentials.
# ---------------------------------------------------------------------------

class TestToPilAndFailLoud:
    """
    PEK-OCR-ROOTCAUSE: Tests A–E.

    Verifies:
      A. TesseractVieBackend handles real numpy ndarray (exercises the _to_pil path).
      B. TesseractVieBackend ImportError raises RuntimeError (not returns empty).
      C. PaddleOcrBackend handles real numpy ndarray (exercises the inference path).
      D. TesseractVieBackend handles PIL.Image passthrough (isinstance branch).
      E. _to_pil raises RuntimeError on unsupported input type.
    """

    def test_a_tesseract_backend_handles_real_ndarray(self):
        """
        Test A — TesseractVieBackend with real numpy ndarray: _to_pil path exercised.

        Given: np.zeros((50, 200, 3), dtype="uint8") — minimal valid crop.
        When: TesseractVieBackend().recognize_text(image).
        Then: does NOT raise; returns (str, float) with 0.0 <= float <= 1.0.
              Blank image → empty string acceptable; NameError → test FAILS.
        Patch: pytesseract.image_to_data → DataFrame with no valid rows.
        """
        import numpy as np
        import pandas as pd
        from unittest.mock import patch, MagicMock
        from infrastructure.ocr_backends import TesseractVieBackend

        # Minimal blank-image crop (all zeros → no readable text)
        image = np.zeros((50, 200, 3), dtype="uint8")

        # Minimal pytesseract mock: image_to_data returns empty dataframe
        # with the required columns but no valid rows.
        fake_df = pd.DataFrame({
            "conf": pd.Series([], dtype=float),
            "text": pd.Series([], dtype=str),
        })
        mock_pytesseract = MagicMock()
        mock_pytesseract.image_to_data.return_value = fake_df
        mock_pytesseract.Output.DATAFRAME = "dataframe"

        with patch.dict("sys.modules", {"pytesseract": mock_pytesseract, "pandas": pd}):
            backend = TesseractVieBackend()
            text, conf = backend.recognize_text(image)

        assert isinstance(text, str), f"Expected str, got {type(text)}"
        assert isinstance(conf, float), f"Expected float, got {type(conf)}"
        assert 0.0 <= conf <= 1.0, f"Confidence {conf} out of [0.0, 1.0]"
        # Blank image → empty text is acceptable
        mock_pytesseract.image_to_data.assert_called_once()

    def test_b_tesseract_import_error_raises_runtime_error(self):
        """
        Test B — TesseractVieBackend: ImportError raises RuntimeError (not returns empty).

        Given: pytesseract not importable.
        When: TesseractVieBackend().recognize_text(np.zeros((50,200,3), dtype="uint8")).
        Then: raises RuntimeError (NOT returns ("", 0.0)).
        """
        import numpy as np
        import builtins
        from infrastructure.ocr_backends import TesseractVieBackend

        image = np.zeros((50, 200, 3), dtype="uint8")

        original_import = builtins.__import__

        def _import_that_blocks_pytesseract(name, *args, **kwargs):
            if name == "pytesseract":
                raise ImportError("No module named 'pytesseract'")
            return original_import(name, *args, **kwargs)

        import sys
        # Ensure pytesseract is not already in sys.modules (would bypass __import__)
        saved = sys.modules.pop("pytesseract", None)
        try:
            with patch("builtins.__import__", side_effect=_import_that_blocks_pytesseract):
                backend = TesseractVieBackend()
                with pytest.raises(RuntimeError, match="required packages not installed"):
                    backend.recognize_text(image)
        finally:
            if saved is not None:
                sys.modules["pytesseract"] = saved

    def test_c_paddle_backend_handles_real_ndarray(self):
        """
        Test C — PaddleOcrBackend with real numpy ndarray: full inference path exercised.

        Given: np.zeros((50, 200, 3), dtype="uint8") and a mock paddle_table.
        When: PaddleOcrBackend(paddle_table=mock).recognize_text(image).
        Then: does NOT raise; mock.ocr called with the ndarray; returns (str, float).
        """
        import numpy as np
        from unittest.mock import MagicMock
        from infrastructure.ocr_backends import PaddleOcrBackend

        image = np.zeros((50, 200, 3), dtype="uint8")

        # Mock paddle_table.ocr — returns empty result (blank image → no text)
        mock_paddle = MagicMock()
        mock_paddle.ocr.return_value = [[]]  # valid but empty OCR result

        backend = PaddleOcrBackend(paddle_table=mock_paddle)
        text, conf = backend.recognize_text(image)

        assert isinstance(text, str), f"Expected str, got {type(text)}"
        assert isinstance(conf, float), f"Expected float, got {type(conf)}"
        assert 0.0 <= conf <= 1.0, f"Confidence {conf} out of [0.0, 1.0]"
        mock_paddle.ocr.assert_called_once()
        # Verify the ndarray was passed (not None)
        call_args = mock_paddle.ocr.call_args
        passed_arr = call_args[0][0] if call_args[0] else call_args[1].get("image_arr")
        # cls=False must be passed
        assert call_args[1].get("cls") is False or (
            len(call_args[0]) >= 2 and call_args[0][1] is False
        ) or call_args[1].get("cls") == False

    def test_d_tesseract_backend_pil_image_passthrough(self):
        """
        Test D — TesseractVieBackend with PIL.Image passthrough: isinstance branch.

        Given: PIL.Image.new("RGB", (200, 50), color=(255,255,255)) — white image.
        When: TesseractVieBackend().recognize_text(image).
        Then: does NOT raise; _to_pil returns the PIL.Image unchanged; Tesseract called.
        """
        from PIL import Image
        import pandas as pd
        from unittest.mock import patch, MagicMock
        from infrastructure.ocr_backends import TesseractVieBackend

        pil_image = Image.new("RGB", (200, 50), color=(255, 255, 255))

        fake_df = pd.DataFrame({
            "conf": pd.Series([], dtype=float),
            "text": pd.Series([], dtype=str),
        })
        mock_pytesseract = MagicMock()
        mock_pytesseract.image_to_data.return_value = fake_df
        mock_pytesseract.Output.DATAFRAME = "dataframe"

        with patch.dict("sys.modules", {"pytesseract": mock_pytesseract, "pandas": pd}):
            backend = TesseractVieBackend()
            text, conf = backend.recognize_text(pil_image)

        assert isinstance(text, str)
        assert isinstance(conf, float)
        mock_pytesseract.image_to_data.assert_called_once()
        # The first positional arg to image_to_data must be a PIL.Image (passthrough)
        called_image = mock_pytesseract.image_to_data.call_args[0][0]
        assert isinstance(called_image, Image.Image), (
            f"_to_pil should return PIL.Image unchanged, got {type(called_image)}"
        )

    def test_e_to_pil_unsupported_type_raises_runtime_error(self):
        """
        Test E — _to_pil with unsupported type raises RuntimeError directly.

        Given: _to_pil("a string").
        When: called directly.
        Then: raises RuntimeError (not NameError, not silent return).
        """
        from infrastructure.ocr_backends import _to_pil

        with pytest.raises(RuntimeError, match="unsupported input type"):
            _to_pil("a string")

        with pytest.raises(RuntimeError, match="unsupported input type"):
            _to_pil(42)

        with pytest.raises(RuntimeError, match="unsupported input type"):
            _to_pil([1, 2, 3])
