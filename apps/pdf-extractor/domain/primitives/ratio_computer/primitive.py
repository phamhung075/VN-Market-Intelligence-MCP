"""
ratio_computer — pure domain primitive (P2-B3).

Computes financial ratios from validated figure inputs.
Pure arithmetic — no OCR, no database, no file I/O.

Supported ratio types:
    "gross_margin"  — gross_profit / net_revenue
    "debt_equity"   — total_liabilities / equity
    "roe"           — net_income / equity

Divide-by-zero rule:
    When denominator == 0 (or None), return None (no exception, no crash).
    Consumer is responsible for handling None results (flag as uncomputable).

None propagation:
    If either numerator or denominator is None, return None.
    Missing data should not crash the pipeline.

Domain layer rules:
    - Zero imports from infrastructure/, application/, interface/
    - No pdfplumber, pytesseract, aiohttp
    - No DB access, no file I/O, no network calls
    - Pure function: output = f(input) with no side effects

PYTHONPATH requirement: caller sets PYTHONPATH=apps/pdf-extractor.
"""

from __future__ import annotations

from typing import Optional

# Supported ratio types — extensible. Consumers must pass one of these strings.
_SUPPORTED_RATIO_TYPES: frozenset[str] = frozenset({
    "gross_margin",
    "debt_equity",
    "roe",
})


def compute_ratio(
    numerator: float,
    denominator: float,
    ratio_type: str,
) -> Optional[float]:
    """
    Compute a named financial ratio from numerator and denominator.

    Supported ratio types:
        "gross_margin": gross_profit / net_revenue
        "debt_equity":  total_liabilities / equity
        "roe":          net_income / equity

    Divide-by-zero: returns None (no exception).
    Unsupported ratio_type: returns None (treated as unknown, no exception).

    Args:
        numerator:   Numeric numerator (already validated/normalized float).
        denominator: Numeric denominator (already validated/normalized float).
        ratio_type:  Named ratio identifier — one of the supported types above.

    Returns:
        Computed ratio as float, or None when denominator is zero or inputs invalid.
    """
    # Handle divide-by-zero gracefully — do not raise
    if denominator == 0:
        return None

    # Handle unsupported ratio types — return None rather than crash
    if ratio_type not in _SUPPORTED_RATIO_TYPES:
        return None

    return numerator / denominator
