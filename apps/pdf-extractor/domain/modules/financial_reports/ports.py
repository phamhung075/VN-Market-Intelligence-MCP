"""
financial_reports — Protocol ports (P1-C, extended P2-C, BT-1, BT-3-A).

Defines the abstract interfaces (Python Protocols) that the FinancialReportsModule
depends on. The module NEVER imports concrete primitives directly — it only accepts
objects that satisfy these protocols (dependency injection via constructor).

Domain layer rules:
    - Zero imports from infrastructure/, application/, interface/
    - No pdfplumber, pytesseract, aiohttp
    - Protocol types only — no concrete implementations here

These protocols satisfy G2 re-verify (P2-C) and enforce the DDD layering rule:
domain modules compose domain primitives via ports, not direct function calls.

Ports defined here (11 ports — BT-1 adds 3; BT-3-A adds 2):
    - DecimalNormalizerPort     (decimal_normalizer — P1-B2)
    - FinancialValidatorPort    (validate_financial_figures — P1-B1)
    - ConfidenceScorerPort      (confidence_scorer — P2-B1)
    - LowConfidenceGatePort     (low_confidence_gate — P2-B2)
    - RatioComputerPort         (ratio_computer — P2-B3)
    - FieldExtractorPort        (field_extractor — P2-B4)
    - VnNumberNormalizerPort    (vn_number_normalize — BT-1)
    - ReconcileFiguresPort      (reconcile_figures — BT-1)
    - SelectPeriodColumnPort    (select_period_column — BT-1)
    - TableAssemblerPort        (text_table_extractor — BT-3-A)
    - TablePushClientPort       (table_push_client — BT-3-A)
"""

from __future__ import annotations

from typing import Dict, List, Literal, Optional, Protocol, Tuple


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


class ConfidenceScorerPort(Protocol):
    """
    Port for the OCR confidence + table-count quality gate primitive.

    Any object implementing score(ocr_confidence, table_count) → dict satisfies
    this protocol.

    Implemented by:
        - domain/primitives/confidence_scorer/ (production)
        - domain/modules/financial_reports/mock_ports.MockConfidenceScorerPort (tests)
    """

    def score(self, ocr_confidence: float, table_count: int) -> Dict[str, object]:
        """
        Score extraction confidence.

        Args:
            ocr_confidence: Float in [0.0, 1.0] — OCR confidence from Tesseract.
            table_count:    Number of tables found in the PDF (int >= 0).

        Returns:
            dict with keys:
                pass (bool):           True if extraction meets quality threshold.
                quality_score (float): The raw OCR confidence score.
        """
        ...


class LowConfidenceGatePort(Protocol):
    """
    Port for the canonical BCTC insert-gate logic primitive.

    Any object implementing gate(confidence) → Literal satisfies this protocol.

    Implemented by:
        - domain/primitives/low_confidence_gate/ (production)
        - domain/modules/financial_reports/mock_ports.MockLowConfidenceGatePort (tests)
    """

    def gate(self, confidence: float) -> Literal["skip", "low_confidence", "normal"]:
        """
        Apply the BCTC insert-gate decision to a confidence score.

        Args:
            confidence: Float confidence score from the extraction pipeline.

        Returns:
            Literal "skip" | "low_confidence" | "normal"
        """
        ...


class RatioComputerPort(Protocol):
    """
    Port for the financial ratio computation primitive.

    Any object implementing compute(numerator, denominator, ratio_type) → float | None
    satisfies this protocol.

    Implemented by:
        - domain/primitives/ratio_computer/ (production)
        - domain/modules/financial_reports/mock_ports.MockRatioComputerPort (tests)
    """

    def compute(
        self,
        numerator: float,
        denominator: float,
        ratio_type: str,
    ) -> Optional[float]:
        """
        Compute a named financial ratio.

        Args:
            numerator:   Numeric numerator.
            denominator: Numeric denominator (0 → returns None).
            ratio_type:  One of "gross_margin" | "debt_equity" | "roe".

        Returns:
            Computed ratio as float, or None on divide-by-zero or invalid input.
        """
        ...


class FieldExtractorPort(Protocol):
    """
    Port for the regex-based BCTC field extraction primitive.

    Any object implementing extract(text, field_name) → str | None satisfies
    this protocol.

    Implemented by:
        - domain/primitives/field_extractor/ (production)
        - domain/modules/financial_reports/mock_ports.MockFieldExtractorPort (tests)
    """

    def extract(self, text: str, field_name: str) -> Optional[str]:
        """
        Extract a named field value from BCTC OCR text.

        Args:
            text:       OCR text output from PDF extraction.
            field_name: One of "net_revenue" | "net_profit" | "total_assets" | "equity".

        Returns:
            Raw extracted string if found, else None.
        """
        ...


class VnNumberNormalizerPort(Protocol):
    """
    Port for the Vietnamese number format normalization primitive (BT-1).

    Converts VN-formatted numeric strings (dot=thousands, comma=decimal) to
    clean EN-US format strings ready for float() conversion.

    Implemented by:
        - domain/primitives/vn_number_normalize/ (production)
        - domain/modules/financial_reports/mock_ports.MockVnNumberNormalizerPort (tests)
    """

    def normalize_vn(self, raw: str) -> Optional[str]:
        """
        Normalize a Vietnamese-formatted numeric string to a clean EN-US string.

        Args:
            raw: Raw OCR token (e.g. "2.840.370", "1.234,56", "51000").

        Returns:
            Normalized string (e.g. "2840370", "1234.56") or None if not parseable.
        """
        ...


class ReconcileFiguresPort(Protocol):
    """
    Port for the decimal-shift reconciliation primitive (BT-1).

    Compares an extracted figure against a reference and returns a verdict.

    Implemented by:
        - domain/primitives/reconcile_figures/ (production)
        - domain/modules/financial_reports/mock_ports.MockReconcileFiguresPort (tests)
    """

    def reconcile(
        self,
        a: Optional[float],
        b: Optional[float],
        tol: float = 1.0,
    ) -> Literal["agree", "shift", "low"]:
        """
        Compare two figures and return a reconciliation verdict.

        Args:
            a:   First figure (e.g. OCR-extracted value). None = not available.
            b:   Second figure (e.g. API-bridge reference). None = not available.
            tol: Agreement tolerance threshold (default 1.0).

        Returns:
            Literal "agree" | "shift" | "low"
        """
        ...


class SelectPeriodColumnPort(Protocol):
    """
    Port for the BCTC period column selector primitive (BT-1).

    Picks the correct result column from a table row with multiple period columns.

    Implemented by:
        - domain/primitives/select_period_column/ (production)
        - domain/modules/financial_reports/mock_ports.MockSelectPeriodColumnPort (tests)
    """

    def select(
        self,
        cells: List[str],
        hint: Optional[str] = None,
        headers: Optional[List[str]] = None,
    ) -> List:
        """
        Select the best result column from a BCTC table row.

        Args:
            cells:   List of raw cell strings for a single data row.
            hint:    Optional semantic hint ("consolidated" | "current" | "ytd").
            headers: Optional list of column header strings.

        Returns:
            [index, value] list, or [None, None] if no suitable cell found.
            List (not tuple) for JSON round-trip compatibility.
        """
        ...


class TableAssemblerPort(Protocol):
    """
    Port for the TEXT-path table assembler (BT-3-A).

    The concrete adapter (infrastructure/text_table_extractor.py) uses Tesseract
    (vie+eng) + BT-1 primitives to convert OCR page output into structured rows.

    Domain layer rules:
        - Zero imports from infrastructure/, application/, interface/
        - Pure Protocol — no concrete logic here.

    Implemented by:
        - infrastructure/text_table_extractor.TextTableExtractor (production)
        - Fake/stub in tests (injected)
    """

    def assemble(
        self,
        pages: List[Dict],
        statement_section: str,
    ) -> Dict:
        """
        Assemble OCR page output into ordered structured rows.

        Args:
            pages: list of dicts, each with keys:
                   {page_number: int, text: str}
                   The text is raw Tesseract output for that page.
            statement_section: One of "balance_sheet" | "income_statement"
                               | "cash_flow".

        Returns:
            dict with keys:
                rows (list[dict]):      Each row has:
                    page_number (int)
                    row_order (int)     — sequential across all pages
                    code (str | None)   — BCTC line code e.g. "100", "270"
                    label (str)         — Vietnamese label text
                    value_current (float | None)  — billion VND or VND
                    value_prior (float | None)     — billion VND or VND, or None
                    unit (str)          — "billion_vnd" or "vnd"
                    is_summary_row (int) — 1 for major subtotal codes
                period_current (str):  e.g. "31/12/2025"
                period_prior (str | None): e.g. "31/12/2024", or None
        """
        ...


class TablePushClientPort(Protocol):
    """
    Port for the HTTP push client that delivers assembled table rows to mcp-server
    (BT-3-A).

    The concrete adapter (infrastructure/table_push_client.py) posts to
    POST /api/push-bctc-table on mcp-server (internal Docker network).

    Domain layer rules:
        - Zero imports from infrastructure/, application/, interface/
        - Pure Protocol — no concrete logic here.

    Implemented by:
        - infrastructure/table_push_client.TablePushClient (production)
        - Fake/stub in tests (injected)
    """

    async def push_table(
        self,
        report_id: str,
        statement_section: str,
        rows: List[Dict],
        balance_check: Optional[Dict],
        period_current: str,
        period_prior: Optional[str],
    ) -> Dict:
        """
        Deliver assembled table rows to mcp-server for storage.

        Args:
            report_id:         UUID string matching financial_reports.id.
            statement_section: "balance_sheet" | "income_statement" | "cash_flow".
            rows:              list of structured row dicts (output of TableAssemblerPort).
            balance_check:     dict with total_assets, total_liabilities, total_equity,
                               balance_delta, balance_pass — or None if no balance check.
            period_current:    Current period label e.g. "31/12/2025".
            period_prior:      Prior period label or None.

        Returns:
            dict with at least keys: ok (bool), rows_stored (int).

        Raises:
            Exception: on HTTP error or network failure (caller handles).
        """
        ...
