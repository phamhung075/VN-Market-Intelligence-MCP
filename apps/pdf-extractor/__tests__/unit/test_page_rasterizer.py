"""
Unit tests for infrastructure/page_rasterizer.py — AR-PDF FR-1

Test plan (AC-FR1-1 through AC-FR1-4):
    AC-FR1-1: BCTC_RASTER_DPI env var controls DPI; default 150 if unset.
    AC-FR1-2: Output path correct — /data/bctc-page-images/{report_id}/page_{N:04d}.png
    AC-FR1-3: Idempotency — second call with same args returns existing file without re-render.
    AC-FR1-4: PDF-Extract-Kit subtree untouched (git diff check — verified at commit time).

DV Pattern: tests use a real minimal PDF created with PyMuPDF in a tmp dir,
so they exercise the actual rendering path without network or external fixtures.
If PyMuPDF is not installed, tests are skipped (not failed) — prevents red in
environments that only have base Python installed (no pymupdf yet).
"""

from __future__ import annotations

import os
import shutil
import tempfile
import unittest

# ---------------------------------------------------------------------------
# Skip guard: tests require PyMuPDF (pymupdf package)
# ---------------------------------------------------------------------------

try:
    import fitz  # type: ignore  # noqa: F401
    FITZ_AVAILABLE = True
except ImportError:
    FITZ_AVAILABLE = False

_skip_no_fitz = unittest.skipUnless(
    FITZ_AVAILABLE,
    "PyMuPDF (pymupdf) not installed — skip page_rasterizer tests",
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _create_minimal_pdf(path: str, num_pages: int = 2) -> None:
    """Create a minimal N-page PDF at the given path using PyMuPDF."""
    import fitz  # type: ignore
    doc = fitz.open()
    for i in range(num_pages):
        page = doc.new_page(width=595, height=842)  # A4 points
        page.insert_text((50, 50), f"Test page {i + 1}", fontsize=12)
    doc.save(path)
    doc.close()


# ---------------------------------------------------------------------------
# Test class
# ---------------------------------------------------------------------------


class TestPageRasterizer(unittest.TestCase):
    """
    Unit tests for rasterize_page() and rasterize_report().

    All tests run in a temporary directory. Output paths are patched so
    tests do NOT write to /data/bctc-page-images on the host.
    """

    def setUp(self) -> None:
        """Create a temp dir, a minimal PDF, and patch the output base dir."""
        self.tmp_dir = tempfile.mkdtemp(prefix="test_rasterizer_")
        self.pdf_path = os.path.join(self.tmp_dir, "test.pdf")
        if FITZ_AVAILABLE:
            _create_minimal_pdf(self.pdf_path, num_pages=2)

        # Patch the _BASE_OUTPUT_DIR to use our temp dir instead of /data/...
        import infrastructure.page_rasterizer as rasterizer_mod
        self._orig_base = rasterizer_mod._BASE_OUTPUT_DIR
        rasterizer_mod._BASE_OUTPUT_DIR = self.tmp_dir

    def tearDown(self) -> None:
        """Restore original base dir and clean up temp dir."""
        import infrastructure.page_rasterizer as rasterizer_mod
        rasterizer_mod._BASE_OUTPUT_DIR = self._orig_base
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    # ------------------------------------------------------------------
    # AC-FR1-1: DPI from env var (default 150)
    # ------------------------------------------------------------------

    @_skip_no_fitz
    def test_ac_fr1_1_default_dpi_is_150(self) -> None:
        """AC-FR1-1: when BCTC_RASTER_DPI is unset, _get_default_dpi() returns 150."""
        from infrastructure.page_rasterizer import _get_default_dpi

        saved = os.environ.pop("BCTC_RASTER_DPI", None)
        try:
            result = _get_default_dpi()
            self.assertEqual(result, 150)
        finally:
            if saved is not None:
                os.environ["BCTC_RASTER_DPI"] = saved

    @_skip_no_fitz
    def test_ac_fr1_1_env_var_controls_dpi(self) -> None:
        """AC-FR1-1: BCTC_RASTER_DPI env var is read by _get_default_dpi()."""
        from infrastructure.page_rasterizer import _get_default_dpi

        saved = os.environ.get("BCTC_RASTER_DPI")
        os.environ["BCTC_RASTER_DPI"] = "100"
        try:
            result = _get_default_dpi()
            self.assertEqual(result, 100)
        finally:
            if saved is None:
                os.environ.pop("BCTC_RASTER_DPI", None)
            else:
                os.environ["BCTC_RASTER_DPI"] = saved

    @_skip_no_fitz
    def test_ac_fr1_1_invalid_env_var_falls_back_to_150(self) -> None:
        """AC-FR1-1: invalid BCTC_RASTER_DPI falls back to 150 without crashing."""
        from infrastructure.page_rasterizer import _get_default_dpi

        saved = os.environ.get("BCTC_RASTER_DPI")
        os.environ["BCTC_RASTER_DPI"] = "not_a_number"
        try:
            result = _get_default_dpi()
            self.assertEqual(result, 150)
        finally:
            if saved is None:
                os.environ.pop("BCTC_RASTER_DPI", None)
            else:
                os.environ["BCTC_RASTER_DPI"] = saved

    # ------------------------------------------------------------------
    # AC-FR1-2: Output path correct
    # ------------------------------------------------------------------

    @_skip_no_fitz
    def test_ac_fr1_2_output_path_format(self) -> None:
        """AC-FR1-2: output path is {base}/{report_id}/page_{N:04d}.png."""
        from infrastructure.page_rasterizer import rasterize_page

        report_id = "rpt-001"
        page_number = 1
        dpi = 72

        out_path = rasterize_page(
            pdf_path=self.pdf_path,
            report_id=report_id,
            page_number=page_number,
            dpi=dpi,
        )

        expected_suffix = f"{report_id}/page_0001.png"
        self.assertTrue(
            str(out_path).endswith(expected_suffix),
            f"Expected path ending with {expected_suffix!r}, got {out_path!r}",
        )

    @_skip_no_fitz
    def test_ac_fr1_2_output_path_page_padding(self) -> None:
        """AC-FR1-2: page numbers are zero-padded to 4 digits."""
        from infrastructure.page_rasterizer import rasterize_page

        out_path = rasterize_page(
            pdf_path=self.pdf_path,
            report_id="rpt-pad",
            page_number=2,
            dpi=72,
        )
        self.assertIn("page_0002.png", str(out_path))

    @_skip_no_fitz
    def test_ac_fr1_2_output_dir_created(self) -> None:
        """AC-FR1-2: output directory is created automatically (mkdir -p)."""
        from infrastructure.page_rasterizer import rasterize_page

        report_id = "new-dir-test"
        import infrastructure.page_rasterizer as rmod
        expected_dir = os.path.join(rmod._BASE_OUTPUT_DIR, report_id)
        # Verify dir does NOT exist before call
        self.assertFalse(os.path.isdir(expected_dir))

        rasterize_page(pdf_path=self.pdf_path, report_id=report_id, page_number=1, dpi=72)

        # Verify dir was created
        self.assertTrue(os.path.isdir(expected_dir))

    @_skip_no_fitz
    def test_ac_fr1_2_output_file_is_png(self) -> None:
        """AC-FR1-2: output file exists and has non-zero size (valid PNG)."""
        from infrastructure.page_rasterizer import rasterize_page

        out_path = rasterize_page(
            pdf_path=self.pdf_path,
            report_id="rpt-png-check",
            page_number=1,
            dpi=72,
        )
        self.assertTrue(out_path.exists(), "Output PNG file must exist")
        self.assertGreater(out_path.stat().st_size, 0, "Output PNG must be non-empty")

    # ------------------------------------------------------------------
    # AC-FR1-3: Idempotency
    # ------------------------------------------------------------------

    @_skip_no_fitz
    def test_ac_fr1_3_idempotency_returns_same_path(self) -> None:
        """AC-FR1-3: calling rasterize_page twice returns the same Path object."""
        from infrastructure.page_rasterizer import rasterize_page

        path_1 = rasterize_page(
            pdf_path=self.pdf_path,
            report_id="rpt-idem",
            page_number=1,
            dpi=72,
        )
        path_2 = rasterize_page(
            pdf_path=self.pdf_path,
            report_id="rpt-idem",
            page_number=1,
            dpi=72,
        )
        self.assertEqual(str(path_1), str(path_2))

    @_skip_no_fitz
    def test_ac_fr1_3_second_call_does_not_re_render(self) -> None:
        """
        AC-FR1-3: second call does not re-render — file mtime is unchanged.

        This proves idempotency: if the file already exists, rasterize_page
        returns it without touching it (mtime stays the same).
        """
        from infrastructure.page_rasterizer import rasterize_page

        path_1 = rasterize_page(
            pdf_path=self.pdf_path,
            report_id="rpt-mtime",
            page_number=1,
            dpi=72,
        )
        mtime_after_first = path_1.stat().st_mtime

        path_2 = rasterize_page(
            pdf_path=self.pdf_path,
            report_id="rpt-mtime",
            page_number=1,
            dpi=72,
        )
        mtime_after_second = path_2.stat().st_mtime

        self.assertEqual(
            mtime_after_first,
            mtime_after_second,
            "Second rasterize_page call must not modify the existing file (idempotent)",
        )

    # ------------------------------------------------------------------
    # rasterize_report tests
    # ------------------------------------------------------------------

    @_skip_no_fitz
    def test_rasterize_report_returns_all_pages(self) -> None:
        """rasterize_report returns one Path per page in the PDF."""
        from infrastructure.page_rasterizer import rasterize_report

        paths = rasterize_report(
            pdf_path=self.pdf_path,
            report_id="rpt-all-pages",
            dpi=72,
        )
        # Minimal PDF has 2 pages
        self.assertEqual(len(paths), 2)
        for p in paths:
            self.assertTrue(p.exists())

    @_skip_no_fitz
    def test_rasterize_report_uses_env_dpi_when_none(self) -> None:
        """rasterize_report reads BCTC_RASTER_DPI when dpi=None."""
        from infrastructure.page_rasterizer import rasterize_report

        saved = os.environ.get("BCTC_RASTER_DPI")
        os.environ["BCTC_RASTER_DPI"] = "72"
        try:
            paths = rasterize_report(
                pdf_path=self.pdf_path,
                report_id="rpt-env-dpi",
                dpi=None,
            )
            self.assertEqual(len(paths), 2)
        finally:
            if saved is None:
                os.environ.pop("BCTC_RASTER_DPI", None)
            else:
                os.environ["BCTC_RASTER_DPI"] = saved


if __name__ == "__main__":
    unittest.main()
