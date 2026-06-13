"""
Unit test — BT3-FIX3-PSM regression guard.

Asserts that PdfOcrAdapter.ocr_pages() invokes pytesseract.image_to_string
with config="--psm 6".  No real PDF, no real Tesseract, no pdf2image required.

Root cause context (drift #4):
  - Spike (spike/fpt_balance_sheet_eval.py:160, spike/eval/harness.py:193) used
    pytesseract.image_to_string(..., config="--psm 6") → single-block, line-by-line
    → clean 89-row BCTC output.
  - Production ocr_adapter.py (before this fix) omitted config= entirely → Tesseract
    defaulted to psm 3 (auto column segmentation) → column-scrambled output:
    47 orphan rows, off-by-one labels, dup code 222 despite balance_pass=True.
  - This guard prevents silent re-introduction of the same drift.

Patch strategy:
  ocr_pages() does lazy local imports inside the function body:
    from pdf2image import convert_from_path
    import pytesseract
  We pre-populate sys.modules with minimal stub modules before importing the SUT,
  then use patch(..., create=True) so that unittest.mock creates the attribute on
  the stub if it does not already exist.  This keeps the test entirely host-safe:
  no poppler, no Tesseract binary needed.
"""

from __future__ import annotations

import sys
import types
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Pre-populate minimal stubs for pdf2image and pytesseract BEFORE importing
# the SUT, so the lazy `import` calls inside ocr_pages() succeed on a host
# that does not have these packages installed.
# ---------------------------------------------------------------------------


def _ensure_stub(module_name: str, **attrs: object) -> None:
    """
    Insert a stub module into sys.modules if the real package is absent.
    Pre-populate any ``attrs`` on the stub so patch() can locate them.
    """
    if module_name not in sys.modules:
        stub = types.ModuleType(module_name)
        for name, value in attrs.items():
            setattr(stub, name, value)
        sys.modules[module_name] = stub
    else:
        # Real package is installed — ensure the attrs exist (patch will swap them)
        existing = sys.modules[module_name]
        for name, value in attrs.items():
            if not hasattr(existing, name):
                setattr(existing, name, value)


# Pre-populate sys.modules before calling _ensure_stub so that, when the real
# package is installed, it lands in sys.modules NOW (the real module with all
# its attributes, including Output).  _ensure_stub then takes the else-branch
# and only fills in any genuinely absent attrs — it does NOT replace the real
# module with a minimal stub that lacks Output.
try:
    import pdf2image as _pdf2image_real  # noqa: F401
except ImportError:
    pass
try:
    import pytesseract as _pytesseract_real  # noqa: F401
except ImportError:
    pass

_ensure_stub("pdf2image", convert_from_path=MagicMock())
_ensure_stub("pytesseract", image_to_string=MagicMock())

# Now import the SUT — safe even without Tesseract/poppler on the host
from infrastructure.ocr_adapter import PdfOcrAdapter  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _fake_image() -> MagicMock:
    """Minimal stand-in for a PIL Image object."""
    return MagicMock(name="PilImage")


# ---------------------------------------------------------------------------
# Guard tests
# ---------------------------------------------------------------------------


class TestOcrAdapterPsm6Guard:
    """
    Regression guard: ocr_pages() MUST pass config='--psm 6' to
    pytesseract.image_to_string on every page.

    Failure here means someone removed or changed the config= argument —
    which would silently re-introduce PSM-level dual-path drift (drift #4)
    and produce scrambled BCTC column output in production.
    """

    def test_ocr_pages_passes_psm6_config(self) -> None:
        """
        GIVEN: a PdfOcrAdapter with mocked pdf2image and pytesseract
        WHEN:  ocr_pages("/fake/any.pdf", [1]) is called
        THEN:  pytesseract.image_to_string is called with config="--psm 6"
        """
        adapter = PdfOcrAdapter()
        image = _fake_image()
        mock_ocr = MagicMock(return_value="100 TÀI SẢN NGẮN HẠN 58.102.970.741.619")

        with patch("pdf2image.convert_from_path", return_value=[image], create=True), \
             patch("pytesseract.image_to_string", mock_ocr, create=True):
            adapter.ocr_pages("/fake/any.pdf", [1])

        assert mock_ocr.called, "pytesseract.image_to_string was never called"

        call = mock_ocr.call_args
        # config can be passed positionally (arg index 2 after img, lang) or as kwarg
        config_value = call.kwargs.get("config") or (
            call.args[2] if len(call.args) > 2 else None
        )
        assert config_value == "--psm 6", (
            f"ocr_pages() must call pytesseract.image_to_string with "
            f"config='--psm 6' (got {config_value!r}). "
            f"Removing this argument causes Tesseract to default to psm 3 "
            f"(column segmentation), which scrambles BCTC three-block layouts "
            f"(drift #4 — see BT3-FIX3-PSM)."
        )

    def test_ocr_pages_passes_psm6_for_every_page(self) -> None:
        """
        GIVEN: a PdfOcrAdapter with mocked dependencies
        WHEN:  ocr_pages() is called with pages [1, 2, 3]
        THEN:  every image_to_string call uses config="--psm 6"

        Ensures psm 6 is not accidentally applied only to the first page.
        """
        adapter = PdfOcrAdapter()
        image = _fake_image()
        mock_ocr = MagicMock(return_value="270 TỔNG CỘNG TÀI SẢN 88.089.621.779.862")

        with patch("pdf2image.convert_from_path", return_value=[image], create=True), \
             patch("pytesseract.image_to_string", mock_ocr, create=True):
            adapter.ocr_pages("/fake/any.pdf", [1, 2, 3])

        assert mock_ocr.call_count == 3, (
            f"Expected 3 image_to_string calls (one per page), got {mock_ocr.call_count}"
        )

        for i, call in enumerate(mock_ocr.call_args_list):
            config_value = call.kwargs.get("config") or (
                call.args[2] if len(call.args) > 2 else None
            )
            assert config_value == "--psm 6", (
                f"Page call index {i}: expected config='--psm 6', got {config_value!r}"
            )

    def test_ocr_pages_output_contains_tesseract_text(self) -> None:
        """
        Smoke: the text returned by the mock propagates into the result dicts.
        """
        adapter = PdfOcrAdapter()
        image = _fake_image()
        expected_text = "100 TÀI SẢN NGẮN HẠN 58.102.970.741.619"

        with patch("pdf2image.convert_from_path", return_value=[image], create=True), \
             patch("pytesseract.image_to_string", return_value=expected_text, create=True):
            result = adapter.ocr_pages("/fake/any.pdf", [5])

        assert len(result) == 1
        assert result[0]["page_number"] == 5
        assert result[0]["text"] == expected_text
