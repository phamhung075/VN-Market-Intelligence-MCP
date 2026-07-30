"""
Unit tests — FIX-PDFX-EXTRACTION-ENGINE-EMPTY-STRING-SWALLOW

Defect: infrastructure/extraction_engine.py's OCR call site caught ANY
exception raised by the OCR gateway (tesseract error, deadline/timeout,
capacity-exceeded) and returned "" as if extraction had succeeded. Combined
with the quality gate at domain/services.py:71 (`ocr_conf < 0.5 AND not
tables` => reject), a document with any table and zero OCR text passed the
gate and was persisted as a successful extraction — a failed/timed-out/
aborted OCR page was byte-indistinguishable, at read time, from a
genuinely sparse-but-real extraction.

AC1: an OCR failure at this call site (tesseract error, deadline/timeout,
     capacity-exceeded) is NOT returned as a plain empty string
     masquerading as success — it must raise/propagate, distinguishable
     from a legitimate empty/sparse result.
AC2: negative control — a genuinely blank/near-blank scanned page
     (legitimate sparse text, NOT an OCR failure) must NOT be reclassified
     as a failure.

Both directions are exercised at two levels:
  - PdfplumberExtractionEngine._ocr_page()            (single page)
  - PdfplumberExtractionEngine._extract_text_ocr_sync() (multi-page loop —
    the caller that used to have its OWN `except Exception: return ("", 0.0)`
    that would re-swallow a propagated OCR failure a second time)

Deadline/capacity-exceeded propagation is already covered by
FIX-PDFX-TESSERACT-CONCURRENCY (see test_ocr_concurrency_invariant.py); the
regression tests here additionally pin that those two error types are still
NOT rewrapped as the new OcrPageFailedError.

See docs/agent-memory/decisions/ for the corresponding decision-journal
entry (task_id: FIX-PDFX-EXTRACTION-ENGINE-EMPTY-STRING-SWALLOW).
"""

from __future__ import annotations

import os
import sys
import types
from unittest.mock import MagicMock, patch

import pytest

# Adjust sys.path so absolute imports work when run from apps/pdf-extractor/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

# pdfplumber is an optional heavy dependency not guaranteed on every dev/CI
# host (see test_low_text_density_ocr_rasterize.py header for the same
# rationale). _extract_text_ocr_sync() does `import pdfplumber` internally;
# stub it host-safe ONLY if the real package is absent — never clobber a
# real import another test module may rely on.
if "pdfplumber" not in sys.modules:
    _pdfplumber_stub = types.ModuleType("pdfplumber")
    _pdfplumber_stub.open = MagicMock()  # replaced per-test via patch("pdfplumber.open", ...)
    sys.modules["pdfplumber"] = _pdfplumber_stub

from infrastructure.extraction_engine import PdfplumberExtractionEngine  # noqa: E402
from domain.errors import (  # noqa: E402
    OcrPageFailedError,
    OcrCapacityExceededError,
    OcrDeadlineExceededError,
    PDFProcessingError,
)


def _fake_page(native_text: str = "") -> MagicMock:
    """A pdfplumber-like page: short/absent native text forces the OCR path."""
    page = MagicMock()
    page.extract_text.return_value = native_text
    fake_image = MagicMock()
    fake_image.original = MagicMock()
    page.to_image.return_value = fake_image
    return page


def _pdfplumber_ctx(pages: list) -> MagicMock:
    """
    A pdfplumber.open(...) context manager mock whose __exit__ explicitly
    returns False — a bare MagicMock's default __exit__ return value is a
    truthy MagicMock, which would SILENTLY SUPPRESS any exception raised
    inside the `with` block (Python context-manager protocol), defeating
    the very propagation these tests assert on. Matches the established
    pattern in test_low_text_density_ocr_rasterize.py / test_ocr_adapter_
    psm6_guard.py.
    """
    fake_pdf = MagicMock()
    fake_pdf.pages = pages
    ctx = MagicMock()
    ctx.__enter__ = MagicMock(return_value=fake_pdf)
    ctx.__exit__ = MagicMock(return_value=False)
    return ctx


# ---------------------------------------------------------------------------
# AC1 — _ocr_page(): a genuine OCR failure raises OcrPageFailedError,
# never returns ""
# ---------------------------------------------------------------------------


class TestOcrPageFailureNotSwallowed:
    def test_tesseract_exception_raises_ocr_page_failed_error(self):
        """
        AC1: ocr_gateway.run_image_sync raising a generic exception
        (simulating a tesseract crash) must surface as OcrPageFailedError —
        NOT be swallowed into "".
        """
        engine = PdfplumberExtractionEngine()
        page = _fake_page()

        with patch(
            "infrastructure.extraction_engine.ocr_gateway.run_image_sync",
            side_effect=RuntimeError("tesseract exited with status 1"),
        ):
            with pytest.raises(OcrPageFailedError):
                engine._ocr_page(page)

    def test_ocr_page_failed_error_is_a_pdf_processing_error(self):
        """
        OcrPageFailedError must be a PDFProcessingError subtype so
        ExtractPDFService.process_pdf()'s existing `except PDFProcessingError`
        branch marks the document failed without any change to services.py.
        """
        assert issubclass(OcrPageFailedError, PDFProcessingError)

    def test_ocr_page_failed_error_wraps_original_exception(self):
        """The original exception is preserved via `raise ... from exc` chaining."""
        engine = PdfplumberExtractionEngine()
        page = _fake_page()
        original = RuntimeError("tesseract exited with status 1")

        with patch(
            "infrastructure.extraction_engine.ocr_gateway.run_image_sync",
            side_effect=original,
        ):
            with pytest.raises(OcrPageFailedError) as exc_info:
                engine._ocr_page(page)

        assert exc_info.value.__cause__ is original

    def test_capacity_exceeded_still_propagates_unwrapped(self):
        """Regression: OcrCapacityExceededError must NOT be rewrapped as OcrPageFailedError."""
        engine = PdfplumberExtractionEngine()
        page = _fake_page()

        with patch(
            "infrastructure.extraction_engine.ocr_gateway.run_image_sync",
            side_effect=OcrCapacityExceededError("queue wait elapsed"),
        ):
            with pytest.raises(OcrCapacityExceededError):
                engine._ocr_page(page)

    def test_deadline_exceeded_still_propagates_unwrapped(self):
        """Regression: OcrDeadlineExceededError must NOT be rewrapped as OcrPageFailedError."""
        engine = PdfplumberExtractionEngine()
        page = _fake_page()

        with patch(
            "infrastructure.extraction_engine.ocr_gateway.run_image_sync",
            side_effect=OcrDeadlineExceededError("page deadline exceeded"),
        ):
            with pytest.raises(OcrDeadlineExceededError):
                engine._ocr_page(page)


# ---------------------------------------------------------------------------
# AC2 — _ocr_page(): a legitimate blank/sparse page still returns "" cleanly
# ---------------------------------------------------------------------------


class TestOcrPageLegitimateBlankNotReclassified:
    def test_ocr_success_with_empty_text_returns_empty_string_no_raise(self):
        """
        AC2 negative control: the OCR call SUCCEEDS and returns "" (a real,
        legitimately blank scanned page) — must return "" and must NOT raise.
        """
        engine = PdfplumberExtractionEngine()
        page = _fake_page()

        with patch(
            "infrastructure.extraction_engine.ocr_gateway.run_image_sync",
            return_value="",
        ):
            result = engine._ocr_page(page)

        assert result == ""

    def test_ocr_success_with_whitespace_only_returns_empty_string_no_raise(self):
        """AC2: whitespace-only OCR output is stripped to "" without raising."""
        engine = PdfplumberExtractionEngine()
        page = _fake_page()

        with patch(
            "infrastructure.extraction_engine.ocr_gateway.run_image_sync",
            return_value="   \n\t  ",
        ):
            result = engine._ocr_page(page)

        assert result == ""

    def test_missing_pytesseract_still_returns_empty_string_no_raise(self):
        """
        Unchanged pre-existing behavior: environment lacking the pytesseract
        dependency is NOT an OCR failure — it never attempts OCR at all.
        """
        engine = PdfplumberExtractionEngine()
        page = _fake_page()

        with patch.dict(sys.modules, {"pytesseract": None}):
            result = engine._ocr_page(page)

        assert result == ""


# ---------------------------------------------------------------------------
# AC1/AC2 — _extract_text_ocr_sync(): the multi-page caller must not
# re-swallow a propagated OcrPageFailedError back into ("", 0.0)
# ---------------------------------------------------------------------------


class TestExtractTextOcrSyncPropagatesPageFailure:
    def test_ocr_page_failure_propagates_not_swallowed_to_empty_tuple(self):
        """
        AC1: a genuine OCR failure on any page must propagate out of
        _extract_text_ocr_sync (which is what process_pdf() awaits via
        extract_text_ocr()), not be re-caught by this method's own broad
        `except Exception: return ("", 0.0)`.
        """
        engine = PdfplumberExtractionEngine()
        ctx = _pdfplumber_ctx([_fake_page()])

        with patch("pdfplumber.open", return_value=ctx):
            with patch.object(
                PdfplumberExtractionEngine,
                "_ocr_page",
                side_effect=OcrPageFailedError("OCR failed for page"),
            ):
                with pytest.raises(OcrPageFailedError):
                    engine._extract_text_ocr_sync(b"%PDF-fake")

    def test_capacity_exceeded_propagates_through_multi_page_loop(self):
        """Regression: capacity/deadline signals still propagate unwrapped through this method."""
        engine = PdfplumberExtractionEngine()
        ctx = _pdfplumber_ctx([_fake_page()])

        with patch("pdfplumber.open", return_value=ctx):
            with patch.object(
                PdfplumberExtractionEngine,
                "_ocr_page",
                side_effect=OcrCapacityExceededError("queue wait elapsed"),
            ):
                with pytest.raises(OcrCapacityExceededError):
                    engine._extract_text_ocr_sync(b"%PDF-fake")

    def test_legitimate_blank_page_still_degrades_confidence_not_raise(self):
        """
        AC2 negative control at the multi-page level: a page whose OCR
        genuinely returns "" (no exception) must still flow through the
        pre-existing low-confidence degrade path, unchanged — no raise.
        """
        engine = PdfplumberExtractionEngine()
        ctx = _pdfplumber_ctx([_fake_page(native_text="")])

        with patch("pdfplumber.open", return_value=ctx):
            with patch.object(PdfplumberExtractionEngine, "_ocr_page", return_value=""):
                text, confidence = engine._extract_text_ocr_sync(b"%PDF-fake")

        assert text == ""
        assert confidence == 0.0  # pre-existing behavior: no text_parts -> 0.0 confidence

    def test_legitimate_blank_page_among_others_does_not_abort_document(self):
        """
        AC2: a legitimately blank page mixed with a page that has real
        native text must still combine normally — sparse content is not a
        failure signal.
        """
        engine = PdfplumberExtractionEngine()
        good_page = _fake_page(native_text="A" * 60)  # >= 50 chars: native path, no OCR
        blank_page = _fake_page(native_text="")
        ctx = _pdfplumber_ctx([good_page, blank_page])

        with patch("pdfplumber.open", return_value=ctx):
            with patch.object(PdfplumberExtractionEngine, "_ocr_page", return_value=""):
                text, confidence = engine._extract_text_ocr_sync(b"%PDF-fake")

        assert "A" * 60 in text
        assert confidence > 0.0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
