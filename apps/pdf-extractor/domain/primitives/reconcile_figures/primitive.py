"""
reconcile_figures — pure domain primitive (BT-1).

Generalizes the isDecimalShiftAnomaly logic from:
    apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts

Original formula (TypeScript):
    const ratio = larger / Math.max(smaller, 1e-9);
    return ratio > 10;

This primitive extends it to a three-way verdict:
    "agree" — values are consistent (ratio ≤ tol)
    "shift" — decimal-shift-class anomaly (ratio > 10 × tol)
    "low"   — some divergence but not a decimal-shift (tol < ratio ≤ 10 × tol)

Exact formula (matches isDecimalShiftAnomaly, generalised):
    absA = abs(a)
    absB = abs(b)
    larger  = max(absA, absB)
    smaller = min(absA, absB)
    ratio   = larger / max(smaller, eps)

    ratio ≤ tol         → "agree"
    ratio > 10 * tol    → "shift"
    otherwise           → "low"

Null-handling (matches mcp-server behaviour):
    If either a or b is None → "agree" (cannot compare, skip)
    If b (reference) is 0   → "agree" (no API data, skip anomaly flag)

Default tol=1.0, eps=1e-9.

Usage:
    from domain.primitives.reconcile_figures import reconcile_figures
    verdict = reconcile_figures(ocr_value, api_value)
    # → "agree" | "shift" | "low"

    # With custom tolerance:
    verdict = reconcile_figures(ocr_value, api_value, tol=2.0)

Domain layer rules:
    - Zero imports from infrastructure/, application/, interface/
    - No pdfplumber, pytesseract, aiohttp
    - No DB access, no file I/O, no network calls
    - Pure function: output = f(input) with no side effects

PYTHONPATH requirement: caller sets PYTHONPATH=apps/pdf-extractor.
"""

from __future__ import annotations

from typing import Literal, Optional

# Default epsilon matching the mcp-server constant
_DEFAULT_EPS: float = 1e-9


def reconcile_figures(
    a: Optional[float],
    b: Optional[float],
    tol: float = 1.0,
    eps: float = _DEFAULT_EPS,
) -> Literal["agree", "shift", "low"]:
    """
    Compare two figures and return a reconciliation verdict.

    Verdicts:
        "agree" — values are consistent within tolerance.
        "shift" — decimal-shift-class anomaly (>10x divergence).
        "low"   — some divergence but not a clear decimal-shift.

    Null-safe: returns "agree" when either value is None or when b (reference)
    is zero (no reference data available).

    Args:
        a:   First figure (e.g. OCR-extracted value). None = not available.
        b:   Second figure (e.g. API-bridge reference). None = not available.
        tol: Agreement tolerance threshold. ratio ≤ tol → "agree".
             Default 1.0 (exact agreement or smaller → agree).
        eps: Epsilon for division-by-zero guard. Default 1e-9 (matches mcp-server).

    Returns:
        Literal "agree" | "shift" | "low"
    """
    # Null guard: cannot compare if either is missing
    if a is None or b is None:
        return "agree"

    # Zero-reference guard: b=0 means no API data — skip anomaly flag
    if b == 0.0:
        return "agree"

    abs_a = abs(a)
    abs_b = abs(b)

    # Both zero: identical at zero
    if abs_a == 0.0 and abs_b == 0.0:
        return "agree"

    larger = max(abs_a, abs_b)
    smaller = min(abs_a, abs_b)

    # Prevent division by zero when smaller is ~0 (e.g. ocr=0.000051 vs api=51000)
    ratio = larger / max(smaller, eps)

    if ratio <= tol:
        return "agree"
    elif ratio > 10.0 * tol:
        return "shift"
    else:
        return "low"
