"""
infrastructure/page_rasterizer.py — AR-PDF FR-1

Page rasterizer: renders PDF pages as PNG images using PyMuPDF.

Public API:
    rasterize_page(pdf_path, report_id, page_number, dpi) -> Path
    rasterize_report(pdf_path, report_id, dpi=None) -> list[Path]

Output path: /data/bctc-page-images/{report_id}/page_{N:04d}.png
DPI: controlled by BCTC_RASTER_DPI env var (default 150).

DDD layer: infrastructure. Zero network calls. Zero model weights.
No domain imports. Idempotent: existing files are returned without re-render.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import List

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Environment-derived defaults
# ---------------------------------------------------------------------------

_DEFAULT_DPI = 150
_BASE_OUTPUT_DIR = "/data/bctc-page-images"


def _get_default_dpi() -> int:
    """Read BCTC_RASTER_DPI env var, returning 150 if unset or invalid."""
    raw = os.getenv("BCTC_RASTER_DPI", str(_DEFAULT_DPI))
    try:
        return int(raw)
    except ValueError:
        logger.warning(
            "page_rasterizer: invalid BCTC_RASTER_DPI=%r — using default %d",
            raw,
            _DEFAULT_DPI,
        )
        return _DEFAULT_DPI


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def rasterize_page(
    pdf_path: str,
    report_id: str,
    page_number: int,
    dpi: int,
) -> Path:
    """
    Render page N (1-indexed) of a PDF to PNG at the given DPI.

    Output path: /data/bctc-page-images/{report_id}/page_{N:04d}.png
    Directory is created automatically (mkdir -p semantics).

    Idempotent: if the output file already exists it is returned without
    re-rendering. Callers that want to force a re-render must delete the file
    first (not the normal use case — idempotency is the contract per AC-FR1-3).

    Args:
        pdf_path:    Absolute path to the PDF file on disk.
        report_id:   Report identifier — used as the output directory name.
        page_number: 1-indexed page number to render.
        dpi:         Raster resolution in dots-per-inch.

    Returns:
        Path to the output PNG file (always absolute).

    Raises:
        FileNotFoundError: if pdf_path does not exist.
        ValueError: if page_number < 1 or exceeds the PDF page count.
        RuntimeError: if PyMuPDF cannot open or render the page.
    """
    import fitz  # PyMuPDF — must be installed (pymupdf in requirements.txt)

    output_dir = Path(_BASE_OUTPUT_DIR) / report_id
    output_dir.mkdir(parents=True, exist_ok=True)

    output_path = output_dir / f"page_{page_number:04d}.png"

    # Idempotency: return existing file without re-rendering.
    if output_path.exists():
        logger.debug(
            "rasterize_page: cache hit report_id=%s page=%d dpi=%d path=%s",
            report_id,
            page_number,
            dpi,
            output_path,
        )
        return output_path

    try:
        doc = fitz.open(pdf_path)
    except Exception as exc:
        raise RuntimeError(
            f"rasterize_page: cannot open PDF at {pdf_path}: {exc}"
        ) from exc

    try:
        if page_number < 1 or page_number > doc.page_count:
            raise ValueError(
                f"rasterize_page: page_number={page_number} out of range "
                f"(PDF has {doc.page_count} pages)"
            )

        # fitz uses 0-indexed pages internally; external API is 1-indexed.
        page = doc[page_number - 1]

        # Build matrix: PyMuPDF default unit = 1/72 inch → scale by dpi/72.
        matrix = fitz.Matrix(dpi / 72.0, dpi / 72.0)
        pix = page.get_pixmap(matrix=matrix)
        pix.save(str(output_path))

        logger.info(
            "rasterize_page: rendered report_id=%s page=%d dpi=%d → %s",
            report_id,
            page_number,
            dpi,
            output_path,
        )
        return output_path

    finally:
        doc.close()


def rasterize_report(
    pdf_path: str,
    report_id: str,
    dpi: int | None = None,
) -> List[Path]:
    """
    Rasterize all pages of a PDF report.

    Reads BCTC_RASTER_DPI env var if dpi is None (default 150).
    Each page is rasterized via rasterize_page() — idempotent per page.

    Args:
        pdf_path:  Absolute path to the PDF file.
        report_id: Report identifier — used as the output directory name.
        dpi:       Raster DPI. If None, reads BCTC_RASTER_DPI env var.

    Returns:
        List of Path objects, one per page, in page order (1-indexed).

    Raises:
        RuntimeError: if PyMuPDF cannot open the PDF.
    """
    import fitz  # PyMuPDF

    if dpi is None:
        dpi = _get_default_dpi()

    try:
        doc = fitz.open(pdf_path)
        page_count = doc.page_count
        doc.close()
    except Exception as exc:
        raise RuntimeError(
            f"rasterize_report: cannot open PDF at {pdf_path}: {exc}"
        ) from exc

    logger.info(
        "rasterize_report: report_id=%s total_pages=%d dpi=%d pdf_path=%s",
        report_id,
        page_count,
        dpi,
        pdf_path,
    )

    return [
        rasterize_page(pdf_path, report_id, page_num, dpi)
        for page_num in range(1, page_count + 1)
    ]
