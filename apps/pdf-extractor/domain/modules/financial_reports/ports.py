"""
financial_reports — Protocol ports (P1-C).

Defines the abstract interfaces (Python Protocols) that the FinancialReportsModule
depends on. The module NEVER imports concrete primitives directly — it only accepts
objects that satisfy these protocols (dependency injection via constructor).

Domain layer rules:
    - Zero imports from infrastructure/, application/, interface/
    - No pdfplumber, pytesseract, aiohttp
    - Protocol types only — no concrete implementations here

These protocols satisfy G2 (module stub) and enforce the DDD layering rule:
domain modules compose domain primitives via ports, not direct function calls.
"""

from __future__ import annotations

from typing import Optional, Protocol


class DecimalNormalizerPort(Protocol):
    """
    Port for a decimal normalization primitive.

    Any object implementing normalize(raw_string, unit_hint) → float | None
    satisfies this protocol.

    Implemented by:
        - domain/primitives/decimal_normalizer/ (production)
        - domain/modules/financial_reports/mock_ports.MockDecimalNormalizerPort (tests)
    """

    def normalize(self, raw_string: str, unit_hint: str = "billion_vnd") -> Optional[float]:
        """
        Normalize a raw decimal string to a float value.

        Args:
            raw_string: Raw string from OCR text (e.g. "1234.5", "0.000051", "N/A").
            unit_hint:  Unit context (e.g. "billion_vnd", "raw_micro").

        Returns:
            Normalized float, or None if the string is non-numeric.
        """
        ...


class FinancialValidatorPort(Protocol):
    """
    Port for a financial figures validation primitive.

    Any object implementing validate(...) → float satisfies this protocol.

    Implemented by:
        - domain/primitives/validate_financial_figures/ (production)
        - domain/modules/financial_reports/mock_ports.MockFinancialValidatorPort (tests)
    """

    def validate(
        self,
        total_assets: Optional[float],
        total_equity: Optional[float],
        total_liabilities: Optional[float],
        operating_margin: Optional[float],
        net_revenue: Optional[float],
    ) -> float:
        """
        Validate financial figures against accounting rules.

        Args:
            total_assets:      Total assets (billion VND or None).
            total_equity:      Total equity (billion VND or None).
            total_liabilities: Total liabilities (billion VND or None).
            operating_margin:  Operating margin as ratio (not %) or None.
            net_revenue:       Net revenue (billion VND or None).

        Returns:
            Confidence score in [0.0, 1.0].
        """
        ...
