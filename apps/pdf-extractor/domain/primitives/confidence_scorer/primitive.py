"""
confidence_scorer — pure domain primitive (P2-B1).

Scores extraction confidence from OCR confidence and table count.
Derived from domain/services.py _OCR_CONFIDENCE_THRESHOLD quality-gate logic.

Quality-gate rule:
    if ocr_confidence < _OCR_CONFIDENCE_THRESHOLD (0.5) AND table_count == 0
        → pass=False (extraction is too low quality to rely on)
    else
        → pass=True

This matches the domain/services.py ExtractPDFService quality gate:
    if ocr_conf < _OCR_CONFIDENCE_THRESHOLD and not tables:
        raise PDFLowQualityError(...)

The quality_score is always the raw ocr_confidence (no table bonus applied to score).
Tables provide a rescue gate, not a score boost.

Domain layer rules:
    - Zero imports from infrastructure/, application/, interface/
    - No pdfplumber, pytesseract, aiohttp
    - No DB access, no file I/O, no network calls
    - Pure function: output = f(input) with no side effects

PYTHONPATH requirement: caller sets PYTHONPATH=apps/pdf-extractor.
"""

from __future__ import annotations

# Minimum OCR confidence below which we require at least one table to be found.
# Matches domain/services.py _OCR_CONFIDENCE_THRESHOLD = 0.5
_OCR_CONFIDENCE_THRESHOLD: float = 0.5


def score_confidence(ocr_confidence: float, table_count: int) -> dict:
    """
    Score extraction confidence from OCR quality and table presence.

    Quality-gate rule:
        if ocr_confidence < 0.5 AND table_count == 0 → pass=False
        else → pass=True

    Tables compensate for low OCR confidence: if tables are found even with
    low OCR confidence, the extraction can still proceed (tables are structured
    data that do not rely on OCR text accuracy).

    Args:
        ocr_confidence: Float in [0.0, 1.0] — OCR confidence from Tesseract.
        table_count:    Number of tables found in the PDF (int >= 0).

    Returns:
        dict with keys:
            pass (bool):          True if extraction meets quality threshold.
            quality_score (float): The raw OCR confidence score (unchanged).
    """
    fails_gate = (ocr_confidence < _OCR_CONFIDENCE_THRESHOLD) and (table_count == 0)
    return {
        "pass": not fails_gate,
        "quality_score": ocr_confidence,
    }
