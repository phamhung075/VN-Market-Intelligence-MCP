"""
financial_reports — mock port implementations (P1-C).

Provides test doubles for DecimalNormalizerPort and FinancialValidatorPort.
Used ONLY in unit tests — never imported in production paths.

These mocks satisfy the Protocol contracts defined in ports.py without
importing any real infrastructure (pdfplumber, pytesseract, aiohttp, SQLite).

Domain layer rules:
    - Zero imports from infrastructure/, application/, interface/
    - No pdfplumber, pytesseract, aiohttp
    - Only stdlib + typing
"""

from __future__ import annotations

from typing import Optional


class MockDecimalNormalizerPort:
    """
    Test mock for DecimalNormalizerPort.

    Satisfies the DecimalNormalizerPort Protocol. Returns a pre-configured value
    regardless of input — suitable for unit tests that control the normalizer output.

    Args:
        return_value: The value to return from normalize(). Use None to simulate
                      a non-numeric input (e.g. "N/A" → None).
    """

    def __init__(self, return_value: Optional[float]) -> None:
        self._return_value = return_value
        self.call_count = 0
        self.last_args: tuple[str, str] = ("", "")

    def normalize(self, raw_string: str, unit_hint: str = "billion_vnd") -> Optional[float]:
        """Return the configured value. Records call for assertion in tests."""
        self.call_count += 1
        self.last_args = (raw_string, unit_hint)
        return self._return_value


class MockFinancialValidatorPort:
    """
    Test mock for FinancialValidatorPort.

    Satisfies the FinancialValidatorPort Protocol. Returns a pre-configured
    confidence score regardless of input.

    Args:
        return_confidence: The confidence float in [0.0, 1.0] to return.
    """

    def __init__(self, return_confidence: float) -> None:
        self._return_confidence = return_confidence
        self.call_count = 0
        self.last_args: tuple[
            Optional[float],
            Optional[float],
            Optional[float],
            Optional[float],
            Optional[float],
        ] = (None, None, None, None, None)

    def validate(
        self,
        total_assets: Optional[float],
        total_equity: Optional[float],
        total_liabilities: Optional[float],
        operating_margin: Optional[float],
        net_revenue: Optional[float],
    ) -> float:
        """Return the configured confidence. Records call for assertion in tests."""
        self.call_count += 1
        self.last_args = (total_assets, total_equity, total_liabilities, operating_margin, net_revenue)
        return self._return_confidence
