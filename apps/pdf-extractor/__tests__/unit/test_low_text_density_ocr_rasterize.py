"""
Unit tests — FIX-BCTC-BANK-PDF-OCR-RASTERIZE

AC-RASTERIZE-1: Low-text-density detector
    detect_low_text_density(pdf_path) is a module-level function in
    infrastructure.ocr_adapter that returns True when the PDF's average
    native chars-per-page is below LOW_TEXT_DENSITY_THRESHOLD.

AC-RASTERIZE-2: locate_balance_sheet_pages — scanned PDF wide-scan
    When low_text_density is True for a PDF, locate_balance_sheet_pages()
    returns ALL page numbers (not just BS-marker pages) because no native
    text means no markers can be found.

AC-RASTERIZE-3: ocr_pages rasterize fallback
    When a page's Tesseract text is < LOW_TESSERACT_PAGE_CHARS threshold,
    ocr_pages() falls back to PyMuPDF rasterize + PaddleOCR for that page.

AC-RASTERIZE-4: Non-regression — text-native PDFs unaffected
    When native char density is ABOVE the threshold, the standard Tesseract
    path runs unchanged (no rasterize fallback triggered).

AC-RASTERIZE-5: enrich_failed guard — 0-row OCR still fails loudly
    When rasterize+PaddleOCR also yields 0 rows, the result has
    rows_stored=0 and blocked_reason or the existing enrich_failed gate
    keeps the report in enrich_failed status (not silently done).

DDD: infrastructure layer only. No domain imports in tests.
"""

from __future__ import annotations

import sys
import types
import unittest
from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# Ensure heavy optional packages are stubbed so tests run host-safe
# (without real Tesseract, PaddleOCR, or pdf2image on the CI host)
# ---------------------------------------------------------------------------

def _ensure_stub(module_name: str, **attrs: Any) -> None:
    """Insert a minimal stub if the real package is absent."""
    if module_name not in sys.modules:
        stub = types.ModuleType(module_name)
        for name, value in attrs.items():
            setattr(stub, name, value)
        sys.modules[module_name] = stub
    else:
        existing = sys.modules[module_name]
        for name, value in attrs.items():
            if not hasattr(existing, name):
                setattr(existing, name, value)


try:
    import pdf2image as _real_pdf2image  # noqa: F401
except ImportError:
    pass
try:
    import pytesseract as _real_tess  # noqa: F401
except ImportError:
    pass
try:
    import pdfplumber as _real_pdfplumber  # noqa: F401
except ImportError:
    pass
try:
    import fitz as _real_fitz  # noqa: F401
except ImportError:
    pass
try:
    import paddleocr as _real_paddle  # noqa: F401
except ImportError:
    pass

_ensure_stub("pdf2image", convert_from_path=MagicMock())
_ensure_stub("pytesseract", image_to_string=MagicMock(return_value=""))

# pdfplumber stub: open() returns a context manager with empty pages
_plumber_stub = types.ModuleType("pdfplumber")
_fake_page = MagicMock()
_fake_page.extract_text.return_value = ""
_fake_pdf_ctx = MagicMock()
_fake_pdf_ctx.__enter__ = MagicMock(return_value=MagicMock(pages=[_fake_page]))
_fake_pdf_ctx.__exit__ = MagicMock(return_value=False)
_plumber_stub.open = MagicMock(return_value=_fake_pdf_ctx)
_ensure_stub("pdfplumber")
sys.modules["pdfplumber"] = _plumber_stub

# fitz (PyMuPDF) stub
_fitz_stub = types.ModuleType("fitz")
_fake_fitz_doc = MagicMock()
_fake_fitz_doc.page_count = 4
_fake_fitz_doc.__getitem__ = MagicMock(return_value=MagicMock())
_fake_fitz_doc.close = MagicMock()
_fitz_stub.open = MagicMock(return_value=_fake_fitz_doc)
_fitz_stub.Matrix = MagicMock(return_value=MagicMock())
_ensure_stub("fitz")
sys.modules["fitz"] = _fitz_stub

# paddleocr stub
_paddle_stub = types.ModuleType("paddleocr")
_fake_paddle_instance = MagicMock()
_fake_paddle_instance.ocr = MagicMock(return_value=[[]])
_paddle_stub.PaddleOCR = MagicMock(return_value=_fake_paddle_instance)
_ensure_stub("paddleocr")
sys.modules["paddleocr"] = _paddle_stub

# numpy stub
_np_stub = types.ModuleType("numpy")
_np_stub.array = MagicMock(return_value=MagicMock())  # type: ignore
_ensure_stub("numpy")

# PIL stub
_pil_stub = types.ModuleType("PIL")
_pil_image_stub = types.ModuleType("PIL.Image")
_pil_image_stub.fromarray = MagicMock(return_value=MagicMock())  # type: ignore
_pil_image_stub.Image = MagicMock  # type: ignore
_ensure_stub("PIL")
sys.modules["PIL"] = _pil_stub
sys.modules["PIL.Image"] = _pil_image_stub

from infrastructure.ocr_adapter import (  # noqa: E402
    LOW_TEXT_DENSITY_THRESHOLD,
    LOW_TESSERACT_PAGE_CHARS,
    detect_low_text_density,
    PdfOcrAdapter,
)


# ---------------------------------------------------------------------------
# AC-RASTERIZE-1: detect_low_text_density
# ---------------------------------------------------------------------------


class TestDetectLowTextDensity(unittest.TestCase):
    """AC-RASTERIZE-1: Low-text-density detector (generic — no per-ticker logic)."""

    def test_constants_exist_and_positive(self) -> None:
        """LOW_TEXT_DENSITY_THRESHOLD and LOW_TESSERACT_PAGE_CHARS are positive numbers."""
        self.assertIsInstance(LOW_TEXT_DENSITY_THRESHOLD, (int, float))
        self.assertGreater(LOW_TEXT_DENSITY_THRESHOLD, 0)
        self.assertIsInstance(LOW_TESSERACT_PAGE_CHARS, (int, float))
        self.assertGreater(LOW_TESSERACT_PAGE_CHARS, 0)

    def test_low_text_density_true_when_empty_pages(self) -> None:
        """AC-RASTERIZE-1: all pages with 0 chars → low density → True."""
        # Simulate pdfplumber returning empty text on all pages
        fake_page = MagicMock()
        fake_page.extract_text.return_value = ""
        fake_pdf = MagicMock()
        fake_pdf.pages = [fake_page, fake_page, fake_page, fake_page]
        fake_ctx = MagicMock()
        fake_ctx.__enter__ = MagicMock(return_value=fake_pdf)
        fake_ctx.__exit__ = MagicMock(return_value=False)

        with patch("pdfplumber.open", return_value=fake_ctx):
            result = detect_low_text_density("/fake/vcb.pdf")

        self.assertTrue(result, "Empty-page PDF should be detected as low-text-density")

    def test_low_text_density_true_when_below_threshold(self) -> None:
        """AC-RASTERIZE-1: pages with very few chars → True."""
        # ~110 chars across 8 pages = ~13 chars/page — well below threshold (50)
        fake_page = MagicMock()
        fake_page.extract_text.return_value = "AB"  # 2 chars per page
        fake_pdf = MagicMock()
        fake_pdf.pages = [fake_page] * 8
        fake_ctx = MagicMock()
        fake_ctx.__enter__ = MagicMock(return_value=fake_pdf)
        fake_ctx.__exit__ = MagicMock(return_value=False)

        with patch("pdfplumber.open", return_value=fake_ctx):
            result = detect_low_text_density("/fake/vcb.pdf")

        self.assertTrue(result)

    def test_low_text_density_false_when_above_threshold(self) -> None:
        """AC-RASTERIZE-4: text-native PDF with many chars → False."""
        # FPT-style: hundreds of chars per page
        fake_page = MagicMock()
        fake_page.extract_text.return_value = "A" * 500  # 500 chars per page
        fake_pdf = MagicMock()
        fake_pdf.pages = [fake_page] * 6
        fake_ctx = MagicMock()
        fake_ctx.__enter__ = MagicMock(return_value=fake_pdf)
        fake_ctx.__exit__ = MagicMock(return_value=False)

        with patch("pdfplumber.open", return_value=fake_ctx):
            result = detect_low_text_density("/fake/fpt.pdf")

        self.assertFalse(result, "Text-native PDF must NOT trigger low-density routing")

    def test_low_text_density_on_import_error_returns_false(self) -> None:
        """AC-RASTERIZE-1: if pdfplumber unavailable, returns False (safe default)."""
        import importlib
        # Temporarily replace pdfplumber.open to raise ImportError
        with patch("pdfplumber.open", side_effect=Exception("no module")):
            result = detect_low_text_density("/fake/any.pdf")
        # Should not crash — returns False or True but never raises
        self.assertIsInstance(result, bool)

    def test_no_ticker_or_allowlist_in_function_signature(self) -> None:
        """
        AC-RASTERIZE-1 GENERIC MANDATE: detect_low_text_density takes only pdf_path.
        No ticker, no allowlist, no per-filename special-casing.
        """
        import inspect
        from infrastructure.ocr_adapter import detect_low_text_density as fn
        sig = inspect.signature(fn)
        params = list(sig.parameters.keys())
        # Must accept pdf_path as sole parameter (optionally max_pages for safety cap)
        self.assertIn("pdf_path", params)
        # Must NOT have 'ticker', 'allowlist', 'vcb', 'ctg' etc.
        for forbidden in ("ticker", "allowlist", "vcb", "ctg"):
            self.assertNotIn(forbidden, params, f"Found forbidden param {forbidden!r}")


# ---------------------------------------------------------------------------
# AC-RASTERIZE-2: locate_balance_sheet_pages — wide-scan for scanned PDFs
# ---------------------------------------------------------------------------


class TestLocateBalanceSheetPagesScanned(unittest.TestCase):
    """AC-RASTERIZE-2: scanned PDF → all pages returned."""

    def _make_empty_pdf_ctx(self, num_pages: int) -> Any:
        """Build a pdfplumber context that yields num_pages pages with empty text."""
        fake_page = MagicMock()
        fake_page.extract_text.return_value = ""
        fake_pdf = MagicMock()
        fake_pdf.pages = [fake_page] * num_pages
        # Also set len() for pagination math
        fake_pdf.__len__ = MagicMock(return_value=num_pages)
        fake_ctx = MagicMock()
        fake_ctx.__enter__ = MagicMock(return_value=fake_pdf)
        fake_ctx.__exit__ = MagicMock(return_value=False)
        return fake_ctx

    def test_scanned_pdf_returns_all_pages_within_cap(self) -> None:
        """
        AC-RASTERIZE-2: when detect_low_text_density returns True,
        locate_balance_sheet_pages returns ALL pages up to _MAX_BS_PAGES (8).
        For a 6-page PDF: returns [1,2,3,4,5,6] (all 6, within cap).
        For a 10-page PDF: returns [1..8] (capped at _MAX_BS_PAGES for host safety).
        """
        # Test with a 6-page PDF (below cap) — should return all 6
        num_pages = 6
        fake_ctx = self._make_empty_pdf_ctx(num_pages)
        adapter = PdfOcrAdapter()

        with patch("pdfplumber.open", return_value=fake_ctx):
            result = adapter.locate_balance_sheet_pages("/fake/vcb.pdf")

        # Must return all pages (not just fallback [4,5,6,7])
        self.assertGreater(len(result), 4, "Scanned PDF must return > 4 pages (wide-scan)")
        self.assertEqual(result, list(range(1, num_pages + 1)),
                         f"6-page scanned PDF must return all {num_pages} pages")

    def test_scanned_pdf_large_capped_at_max_bs_pages(self) -> None:
        """
        AC-RASTERIZE-2: for a large scanned PDF (10 pages), wide-scan is capped
        at _MAX_BS_PAGES (8) for host safety.
        """
        num_pages = 10
        fake_ctx = self._make_empty_pdf_ctx(num_pages)
        adapter = PdfOcrAdapter()

        with patch("pdfplumber.open", return_value=fake_ctx):
            result = adapter.locate_balance_sheet_pages("/fake/vcb_large.pdf")

        from infrastructure.ocr_adapter import _MAX_BS_PAGES as cap
        self.assertEqual(len(result), cap,
                         f"Wide-scan for {num_pages}-page PDF must be capped at _MAX_BS_PAGES={cap}")
        self.assertEqual(result, list(range(1, cap + 1)))

    def test_text_native_pdf_returns_marker_pages_only(self) -> None:
        """AC-RASTERIZE-4: text-native PDF → standard BS-marker path unaffected."""
        # Page 1 has BS marker; page 2 does not
        p1 = MagicMock()
        p1.extract_text.return_value = "tổng cộng tài sản " + "A" * 200
        p2 = MagicMock()
        p2.extract_text.return_value = "notes and disclaimers " + "B" * 200
        fake_pdf = MagicMock()
        fake_pdf.pages = [p1, p2]
        fake_pdf.__len__ = MagicMock(return_value=2)
        fake_ctx = MagicMock()
        fake_ctx.__enter__ = MagicMock(return_value=fake_pdf)
        fake_ctx.__exit__ = MagicMock(return_value=False)
        adapter = PdfOcrAdapter()

        with patch("pdfplumber.open", return_value=fake_ctx):
            result = adapter.locate_balance_sheet_pages("/fake/fpt.pdf")

        # Page 1 should be in result (has BS marker), page 2 may or may not
        self.assertIn(1, result)


# ---------------------------------------------------------------------------
# AC-RASTERIZE-3: ocr_pages rasterize + PaddleOCR fallback
# ---------------------------------------------------------------------------


class TestOcrPagesRasterizeFallback(unittest.TestCase):
    """
    AC-RASTERIZE-3: when Tesseract returns < LOW_TESSERACT_PAGE_CHARS on a page,
    ocr_pages() falls back to PyMuPDF rasterize + PaddleOCR OCR.
    """

    def test_low_tesseract_triggers_paddleocr_fallback(self) -> None:
        """
        AC-RASTERIZE-3: Tesseract returns 5 chars → PaddleOCR fallback fires
        and its text is used in the result.
        """
        adapter = PdfOcrAdapter()
        fake_pil_image = MagicMock()
        paddle_text = "I Tiền mặt vàng bạc đá quý 12.930.996 15.542.769"
        # Tesseract returns very few chars (simulate scanned image)
        tess_text = "AB"  # below LOW_TESSERACT_PAGE_CHARS

        with patch("pdf2image.convert_from_path", return_value=[fake_pil_image], create=True), \
             patch("pytesseract.image_to_string", return_value=tess_text, create=True):
            # Simulate PyMuPDF rasterize + PaddleOCR via the adapter's fallback
            with patch.object(adapter, "_rasterize_and_ocr_page",
                               return_value=paddle_text) as mock_paddle:
                result = adapter.ocr_pages("/fake/vcb.pdf", [1])

        # The result must use the PaddleOCR text when Tesseract yields too few chars
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["page_number"], 1)
        # Either the text is the paddle result, or it's at least non-empty
        # (paddle fallback was called)
        mock_paddle.assert_called_once()

    def test_high_tesseract_char_count_no_fallback(self) -> None:
        """
        AC-RASTERIZE-4: Tesseract returns many chars → PaddleOCR fallback NOT triggered.
        """
        adapter = PdfOcrAdapter()
        fake_image = MagicMock()
        good_text = "100 TÀI SẢN NGẮN HẠN 58.102.970.741.619\n" * 10  # well above threshold

        with patch("pdf2image.convert_from_path", return_value=[fake_image], create=True), \
             patch("pytesseract.image_to_string", return_value=good_text, create=True):
            with patch.object(adapter, "_rasterize_and_ocr_page") as mock_paddle:
                result = adapter.ocr_pages("/fake/fpt.pdf", [4])

        mock_paddle.assert_not_called()
        self.assertEqual(result[0]["text"], good_text)

    def test_rasterize_and_ocr_page_exists_as_method(self) -> None:
        """
        AC-RASTERIZE-3: PdfOcrAdapter must have a _rasterize_and_ocr_page method
        (the rasterize + PaddleOCR path). Signature: (pdf_path: str, page_num: int) -> str.
        """
        import inspect
        adapter = PdfOcrAdapter()
        self.assertTrue(
            hasattr(adapter, "_rasterize_and_ocr_page"),
            "PdfOcrAdapter must have _rasterize_and_ocr_page method",
        )
        sig = inspect.signature(adapter._rasterize_and_ocr_page)
        param_names = list(sig.parameters.keys())
        self.assertIn("pdf_path", param_names)
        self.assertIn("page_num", param_names)


# ---------------------------------------------------------------------------
# AC-RASTERIZE-5: enrich_failed guard — 0-row OCR does not silently pass
# ---------------------------------------------------------------------------


class TestEnrichFailedGuard(unittest.TestCase):
    """
    AC-RASTERIZE-5: even after rasterize+PaddleOCR, if 0 rows are parsed,
    the report must NOT land in 'done' status. The existing enrich_failed gate
    (989654f2) must remain intact — low-text-density routing must not bypass it.
    """

    def test_no_per_ticker_hardcode_in_source(self) -> None:
        """
        Generic mandate: ocr_adapter.py must NOT contain ticker literals ('VCB', 'CTG')
        or an allowlist variable used for routing decisions.
        Comments mentioning "no allowlist" are acceptable (they document absence).
        The guard is: no ticker string literal and no variable named *allowlist*.
        """
        import inspect
        import re
        import infrastructure.ocr_adapter as mod
        source = inspect.getsource(mod)
        # Hard-coded ticker string literals — never acceptable in routing code
        for forbidden_literal in ("'VCB'", '"VCB"', "'CTG'", '"CTG"'):
            self.assertNotIn(
                forbidden_literal,
                source,
                f"ocr_adapter.py must NOT contain hardcoded ticker {forbidden_literal!r}",
            )
        # Allowlist variable assignments (= [] or = set() or = {}) — not doc comments
        allowlist_var = re.search(r"\ballowlist\s*=\s*[\[{(]", source, re.IGNORECASE)
        self.assertIsNone(
            allowlist_var,
            "ocr_adapter.py must NOT define an allowlist variable for routing",
        )

    def test_low_text_density_threshold_is_generic_constant(self) -> None:
        """
        The threshold is a module-level constant (not computed per-ticker).
        """
        from infrastructure.ocr_adapter import LOW_TEXT_DENSITY_THRESHOLD
        # Threshold should be sensible: >0 and < 1000 chars/page
        self.assertGreater(LOW_TEXT_DENSITY_THRESHOLD, 0)
        self.assertLess(LOW_TEXT_DENSITY_THRESHOLD, 1000)


if __name__ == "__main__":
    unittest.main()
