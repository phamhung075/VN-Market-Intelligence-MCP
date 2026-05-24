"""
decimal_normalizer — pure domain primitive (P1-B2).

Normalizes raw decimal strings from Vietnamese BCTC PDF OCR output into float values,
correcting the decimal-shift bug class that surfaces when billion-VND values are
captured at micro-unit scale by the OCR pipeline.

Decimal-shift bug class (archaeology from mcp-server extractorHelpers.ts):
    VNM net_profit  = "0.000051" OCR raw → 51.0 billion VND (raw_micro unit)
    DHG revenue     = "0.000009" OCR raw → 9.0 billion VND  (raw_micro unit)
    Root cause: when the BCTC PDF stores values in triệu (millions) and the OCR
    regex multiplier fires incorrectly, numbers appear as sub-unit fractions.
    Correction: multiply by 1_000_000 when unit_hint="raw_micro".

Supported unit_hint values:
    "billion_vnd"  (default) — value is already in billion VND; return as-is
    "raw_micro"    — multiply by 1_000_000 to correct decimal shift

Domain layer rules:
    - Zero imports from infrastructure/, application/, interface/
    - No pdfplumber, pytesseract, aiohttp
    - No DB access, no file I/O, no network calls
    - Pure function: output = f(input) with no side effects

PYTHONPATH requirement: caller sets PYTHONPATH=apps/pdf-extractor.
"""

from __future__ import annotations


# Multiplier table — maps unit_hint to correction factor.
_UNIT_MULTIPLIERS: dict[str, float] = {
    "billion_vnd": 1.0,
    "raw_micro": 1_000_000.0,
}


def normalize_decimal(raw_string: str, unit_hint: str = "billion_vnd") -> float | None:
    """
    Normalize a raw decimal string from BCTC OCR output into a float value.

    Applies the unit correction factor for the given unit_hint. Returns None
    when the string is empty or non-numeric — never raises.

    Args:
        raw_string: The raw string as extracted from PDF text.
                    Examples: "1234.5", "0.000051", "N/A", ""
        unit_hint:  Unit context hint. Controls the correction multiplier.
                    - "billion_vnd" (default): no correction (×1.0)
                    - "raw_micro": decimal-shift correction (×1_000_000)

    Returns:
        Normalized float value, or None if the string is non-numeric.
    """
    stripped = raw_string.strip() if raw_string else ""
    if not stripped:
        return None

    try:
        raw_float = float(stripped)
    except ValueError:
        return None

    multiplier = _UNIT_MULTIPLIERS.get(unit_hint, 1.0)
    return raw_float * multiplier
