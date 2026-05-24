"""
validate_financial_figures primitive — domain layer (P1-B1).

Validates extracted BCTC financial figures against accounting rules.
Pure function: zero IO, zero infra imports.

Moved from domain/services.py (Task 1345b) into the primitives layer.
Callers outside this package must import from this __init__ (public API).

Domain layer — zero imports from infrastructure, application, interface.
No pdfplumber, pytesseract, aiohttp.
"""

from domain.primitives.validate_financial_figures.primitive import validate_financial_figures

__all__ = ["validate_financial_figures"]
