"""
vn_number_normalize — pure domain primitive (BT-1).

Root cause fix for the decimal-shift bug class (VNM net_profit → 0.000051,
DHG revenue → 0.000009). The underlying cause was calling float() directly on
Vietnamese-formatted numeric strings where the separators are INVERTED vs EN-US:
    VN: "." = thousands separator, "," = decimal separator
    EN: "," = thousands separator, "." = decimal separator

Examples of the bug:
    "2.840.370"  → float("2.840.370") → 2.84037 (WRONG: should be 2840370)
    "1.234,56"   → float("1.234,56")  → ValueError (WRONG: should be 1234.56)

This primitive normalizes the raw OCR string BEFORE it reaches float(), so the
rest of the pipeline (decimal_normalizer, validate_financial_figures) receives a
clean EN-US format string.

--- Disambiguation rule for "1.234" (ambiguous token) ---

"1.234" could be:
    a) VN integer: 1234 (thousands-grouped, no decimal part)
    b) EN float:   1.234 (three decimal places)

Decision: BCTC context = large financial figures in triệu (millions) or
tỷ (billions) VND, always thousands-grouped. A string matching the pattern
DIGIT{1,3}(DOT DIGIT{3})+ with NO comma suffix = VN thousands-grouped integer.
Rationale: a genuine EN-decimal of the form "1.234" appearing in a Vietnamese
BCTC table would be an extremely unusual edge case; thousands-grouped is the
overwhelming norm. We document this assumption and warn via return value.

--- Pattern classification ---

Pattern A (VN integer, thousands-grouped): DIGIT{1,3}(DOT DIGIT{3})+
    "2.840.370" → strip dots → "2840370"
    "51.000"    → "51000"
    "1.234"     → "1234"   (single group — treated as VN integer per above rule)

Pattern B (VN decimal): DIGIT{1,3}(DOT DIGIT{3})*(COMMA DIGIT+)
    "1.234,56"      → "1234.56"
    "1.234.567,89"  → "1234567.89"
    "0,5"           → "0.5"
    "123,45"        → "123.45"

Pattern C (plain integer/float, no VN separators):
    "51000" → "51000"
    "51"    → "51"

Pattern D (rejected — EN-US format: comma then dot):
    "1,234.5" → None (not a VN format; treat as non-VN, fail-loud)

Pattern E (parenthesis = negative in BCTC):
    "(2.840.370)" → "-2840370"
    "(1.234,56)"  → "-1234.56"

Blank / non-numeric: → None (honest, no crash)

--- Domain layer rules ---
    - Zero imports from infrastructure/, application/, interface/
    - No pdfplumber, pytesseract, aiohttp
    - No DB access, no file I/O, no network calls
    - Pure function: output = f(input) with no side effects

PYTHONPATH requirement: caller sets PYTHONPATH=apps/pdf-extractor.
"""

from __future__ import annotations

import re


# ---------------------------------------------------------------------------
# Compiled patterns (module-level for performance)
# ---------------------------------------------------------------------------

# VN thousands-grouped integer: optional leading digits + groups of exactly 3
# e.g. "2.840.370", "51.000", "1.234"
_VN_INT_RE = re.compile(r"^\d{1,3}(?:\.\d{3})+$")

# VN decimal (thousands dots + comma-decimal suffix)
# e.g. "1.234,56", "1.234.567,89", "0,5", "123,45"
_VN_DECIMAL_RE = re.compile(r"^\d{1,3}(?:\.\d{3})*,\d+$")

# EN-US format (comma-thousands + dot-decimal): reject these
# e.g. "1,234.5", "1,234,567.89"
_EN_US_RE = re.compile(r"^\d{1,3}(?:,\d{3})+\.\d+$")

# Plain number (integer or EN-decimal, no VN separators)
# e.g. "51000", "5", "123.45" (EN-decimal already handled by float)
# Note: "123.45" with a single dot and not a VN-3-group → plain float passthrough
_PLAIN_NUMBER_RE = re.compile(r"^-?\d+(\.\d+)?$")

# Parenthesis-negative BCTC format: "(2.840.370)"
_PARENS_RE = re.compile(r"^\((.+)\)$")


def vn_number_normalize(raw: str) -> str | None:
    """
    Normalize a Vietnamese-formatted numeric string to a clean EN-US decimal string.

    Returns a string ready for float() conversion, or None if the input is
    blank, non-numeric, or in an unrecognised / rejected format.

    Args:
        raw: Raw string token from OCR or table extraction.
             Examples: "2.840.370", "1.234,56", "51000", "N/A", ""

    Returns:
        Normalized string (e.g. "2840370", "1234.56", "51000") or None.

    Note on ambiguous case:
        A lone "1.234" (single 3-digit group, no comma) is treated as VN integer
        "1234" — see module docstring disambiguation rule.
    """
    if not raw:
        return None

    stripped = raw.strip()
    if not stripped:
        return None

    # --- Parenthesis-negative detection (BCTC style) ---
    negative = False
    m = _PARENS_RE.match(stripped)
    if m:
        stripped = m.group(1).strip()
        negative = True

    # --- Leading minus sign ---
    if stripped.startswith("-"):
        negative = True
        stripped = stripped[1:].strip()

    # Reject EN-US format (comma-thousands, dot-decimal)
    if _EN_US_RE.match(stripped):
        return None

    # Pattern B: VN decimal (thousands dots + comma-decimal)
    if _VN_DECIMAL_RE.match(stripped):
        # Remove thousands dots, swap comma → dot
        normalized = stripped.replace(".", "").replace(",", ".")
        return ("-" + normalized) if negative else normalized

    # Pattern A: VN thousands-grouped integer (no comma)
    if _VN_INT_RE.match(stripped):
        normalized = stripped.replace(".", "")
        return ("-" + normalized) if negative else normalized

    # Pattern C: plain number (plain integer or EN-decimal like "123.45")
    if _PLAIN_NUMBER_RE.match(stripped):
        return ("-" + stripped) if negative else stripped

    # Unrecognised — not a number we know how to parse
    return None
