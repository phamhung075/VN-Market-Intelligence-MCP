"""
financial_reports — mock port implementations (P1-C, extended P2-C, BT-1).

Provides test doubles for all 9 Protocol ports:
    - MockDecimalNormalizerPort     (DecimalNormalizerPort)
    - MockFinancialValidatorPort    (FinancialValidatorPort)
    - MockConfidenceScorerPort      (ConfidenceScorerPort)
    - MockLowConfidenceGatePort     (LowConfidenceGatePort)
    - MockRatioComputerPort         (RatioComputerPort)
    - MockFieldExtractorPort        (FieldExtractorPort)
    - MockVnNumberNormalizerPort    (VnNumberNormalizerPort — BT-1)
    - MockReconcileFiguresPort      (ReconcileFiguresPort — BT-1)
    - MockSelectPeriodColumnPort    (SelectPeriodColumnPort — BT-1)

Used ONLY in unit tests — never imported in production paths.

These mocks satisfy the Protocol contracts defined in ports.py without
importing any real infrastructure (pdfplumber, pytesseract, aiohttp, SQLite).

Domain layer rules:
    - Zero imports from infrastructure/, application/, interface/
    - No pdfplumber, pytesseract, aiohttp
    - Only stdlib + typing
"""

from __future__ import annotations

from typing import Dict, List, Literal, Optional, Tuple


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


class MockConfidenceScorerPort:
    """
    Test mock for ConfidenceScorerPort.

    Satisfies the ConfidenceScorerPort Protocol. Returns a pre-configured
    quality result dict regardless of input.

    Args:
        return_pass:          The bool to return for the "pass" key.
        return_quality_score: The float to return for the "quality_score" key.
    """

    def __init__(self, return_pass: bool = True, return_quality_score: float = 1.0) -> None:
        self._return_pass = return_pass
        self._return_quality_score = return_quality_score
        self.call_count = 0
        self.last_args: tuple[float, int] = (0.0, 0)

    def score(self, ocr_confidence: float, table_count: int) -> Dict[str, object]:
        """Return the configured quality result. Records call for assertion in tests."""
        self.call_count += 1
        self.last_args = (ocr_confidence, table_count)
        return {
            "pass": self._return_pass,
            "quality_score": self._return_quality_score,
        }


class MockLowConfidenceGatePort:
    """
    Test mock for LowConfidenceGatePort.

    Satisfies the LowConfidenceGatePort Protocol. Returns a pre-configured
    disposition literal regardless of input.

    Args:
        return_disposition: One of "skip" | "low_confidence" | "normal".
    """

    def __init__(self, return_disposition: Literal["skip", "low_confidence", "normal"] = "normal") -> None:
        self._return_disposition = return_disposition
        self.call_count = 0
        self.last_confidence: float = 0.0

    def gate(self, confidence: float) -> Literal["skip", "low_confidence", "normal"]:
        """Return the configured disposition. Records call for assertion in tests."""
        self.call_count += 1
        self.last_confidence = confidence
        return self._return_disposition


class MockRatioComputerPort:
    """
    Test mock for RatioComputerPort.

    Satisfies the RatioComputerPort Protocol. Returns a pre-configured
    ratio value regardless of input.

    Args:
        return_ratio: The float to return, or None to simulate divide-by-zero / invalid.
    """

    def __init__(self, return_ratio: Optional[float] = 0.3) -> None:
        self._return_ratio = return_ratio
        self.call_count = 0
        self.last_args: tuple[float, float, str] = (0.0, 0.0, "")

    def compute(
        self,
        numerator: float,
        denominator: float,
        ratio_type: str,
    ) -> Optional[float]:
        """Return the configured ratio. Records call for assertion in tests."""
        self.call_count += 1
        self.last_args = (numerator, denominator, ratio_type)
        return self._return_ratio


class MockFieldExtractorPort:
    """
    Test mock for FieldExtractorPort.

    Satisfies the FieldExtractorPort Protocol. Returns a pre-configured
    extracted string regardless of input.

    Args:
        return_value: The raw string to return, or None when field is not found.
    """

    def __init__(self, return_value: Optional[str] = None) -> None:
        self._return_value = return_value
        self.call_count = 0
        self.last_args: tuple[str, str] = ("", "")

    def extract(self, text: str, field_name: str) -> Optional[str]:
        """Return the configured extracted value. Records call for assertion in tests."""
        self.call_count += 1
        self.last_args = (text, field_name)
        return self._return_value


class MockVnNumberNormalizerPort:
    """
    Test mock for VnNumberNormalizerPort (BT-1).

    Returns a pre-configured normalized string regardless of input.

    Args:
        return_value: The string to return from normalize_vn(), or None.
    """

    def __init__(self, return_value: Optional[str] = "51000") -> None:
        self._return_value = return_value
        self.call_count = 0
        self.last_raw: str = ""

    def normalize_vn(self, raw: str) -> Optional[str]:
        """Return the configured normalized string. Records call for assertion."""
        self.call_count += 1
        self.last_raw = raw
        return self._return_value


class MockReconcileFiguresPort:
    """
    Test mock for ReconcileFiguresPort (BT-1).

    Returns a pre-configured verdict regardless of input.

    Args:
        return_verdict: One of "agree" | "shift" | "low".
    """

    def __init__(
        self, return_verdict: Literal["agree", "shift", "low"] = "agree"
    ) -> None:
        self._return_verdict = return_verdict
        self.call_count = 0
        self.last_args: tuple[Optional[float], Optional[float], float] = (None, None, 1.0)

    def reconcile(
        self,
        a: Optional[float],
        b: Optional[float],
        tol: float = 1.0,
    ) -> Literal["agree", "shift", "low"]:
        """Return the configured verdict. Records call for assertion."""
        self.call_count += 1
        self.last_args = (a, b, tol)
        return self._return_verdict


class MockSelectPeriodColumnPort:
    """
    Test mock for SelectPeriodColumnPort (BT-1).

    Returns a pre-configured (index, value) tuple regardless of input.

    Args:
        return_index: The column index to return (or None).
        return_value: The cell value string to return (or None).
    """

    def __init__(
        self,
        return_index: Optional[int] = 0,
        return_value: Optional[str] = "2.840.370",
    ) -> None:
        self._return_index = return_index
        self._return_value = return_value
        self.call_count = 0
        self.last_cells: List[str] = []

    def select(
        self,
        cells: List[str],
        hint: Optional[str] = None,
        headers: Optional[List[str]] = None,
    ) -> List:
        """Return the configured [index, value]. Records call for assertion."""
        self.call_count += 1
        self.last_cells = cells
        return [self._return_index, self._return_value]
