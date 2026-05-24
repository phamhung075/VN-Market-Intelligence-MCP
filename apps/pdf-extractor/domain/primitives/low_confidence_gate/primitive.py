"""
low_confidence_gate — pure domain primitive (P2-B2).

Implements the canonical BCTC insert-gate logic: decides whether an extracted
value should be skipped, flagged as low-confidence, or inserted normally.

This is the load-bearing threshold logic from the BCTC pipeline, extracted as
a pure primitive so it can be tested in isolation and composed into modules.

Canonical BCTC insert-gate boundaries:
    confidence == 0.0  → "skip"           (do not insert — zero confidence)
    confidence < 0.2   → "low_confidence"  (insert with low-confidence flag)
    confidence >= 0.2  → "normal"          (insert normally)

BOUNDARY NOTE (critical):
    The 0.0 case is checked FIRST (exact zero gate).
    The 0.2 threshold uses STRICT less-than: confidence < 0.2 (not <=).
    Therefore: confidence = 0.19 → "low_confidence", confidence = 0.20 → "normal".
    These boundaries are the G10/G11 injection targets (single-literal change risk).

See also: MEMORY reference_low_confidence_handling.md for system-wide policy.

Domain layer rules:
    - Zero imports from infrastructure/, application/, interface/
    - No pdfplumber, pytesseract, aiohttp
    - No DB access, no file I/O, no network calls
    - Pure function: output = f(input) with no side effects

PYTHONPATH requirement: caller sets PYTHONPATH=apps/pdf-extractor.
"""

from __future__ import annotations

from typing import Literal

# Load-bearing threshold constants.
# THESE ARE G10/G11 INJECTION TARGETS — single-literal mutations here
# will flip boundary scenarios RED on the dashboard.
_SKIP_THRESHOLD: float = 0.0     # exact zero → skip
_LOW_CONF_THRESHOLD: float = 0.2  # strictly less than → low_confidence; ≥ → normal


def gate_confidence(confidence: float) -> Literal["skip", "low_confidence", "normal"]:
    """
    Apply the canonical BCTC insert-gate decision to an extraction confidence score.

    Boundaries (canonical — do not change without updating scenarios):
        confidence == 0.0  → "skip"
        confidence < 0.2   → "low_confidence"
        confidence >= 0.2  → "normal"

    Args:
        confidence: Float confidence score from the extraction pipeline.
                    Should be in [0.0, 1.0] range; out-of-range values are
                    handled gracefully (negative → skip; >1 → normal).

    Returns:
        Literal string: "skip" | "low_confidence" | "normal"
    """
    if confidence == _SKIP_THRESHOLD:
        return "skip"
    if confidence < _LOW_CONF_THRESHOLD:
        return "low_confidence"
    return "normal"
