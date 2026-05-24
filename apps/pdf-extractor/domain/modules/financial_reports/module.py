"""
financial_reports — FinancialReportsModule (P1-C, extended P2-C, BT-1).

Composes all 9 domain primitives via Protocol ports (dependency injection).
The module NEVER imports concrete primitive implementations — it only types
against the Protocol contracts defined in ports.py.

This design satisfies:
    - G2 re-verify (P2-C): module composes ALL primitives via ports
    - DDD: domain module imports only from domain (ports), never from infra
    - Fence-B: grep -r "from infrastructure" domain/modules/ → 0 matches
    - G12: module-tier sandbox scenario runs through process_report()
    - BT-1: vn_number_normalize runs BEFORE decimal_normalizer to fix
            the VNM/DHG decimal-shift bug at parse time

All 9 ports wired (BT-1 adds 3):
    1. DecimalNormalizerPort     — normalize raw OCR strings (EN-US float)
    2. FinancialValidatorPort    — validate figures, return base confidence
    3. ConfidenceScorerPort      — score OCR quality + table presence
    4. LowConfidenceGatePort     — apply BCTC insert-gate decision
    5. RatioComputerPort         — compute financial ratios
    6. FieldExtractorPort        — extract named fields from OCR text
    7. VnNumberNormalizerPort    — VN-format → EN-US string (BT-1, pre-parse)
    8. ReconcileFiguresPort      — decimal-shift anomaly detection (BT-1)
    9. SelectPeriodColumnPort    — pick correct period column (BT-1)

Domain layer rules:
    - Zero imports from infrastructure/, application/, interface/
    - No pdfplumber, pytesseract, aiohttp
    - No DB access, no file I/O, no network calls
    - Depends on Protocol ports (DI) not concrete implementations

PYTHONPATH requirement: caller sets PYTHONPATH=apps/pdf-extractor.
"""

from __future__ import annotations

from typing import Any, List, Optional

from .ports import (
    ConfidenceScorerPort,
    DecimalNormalizerPort,
    FieldExtractorPort,
    FinancialValidatorPort,
    LowConfidenceGatePort,
    RatioComputerPort,
    ReconcileFiguresPort,
    SelectPeriodColumnPort,
    VnNumberNormalizerPort,
)


class FinancialReportsModule:
    """
    Module-tier composition of all 9 domain primitives (BT-1 adds 3 new ones).

    Accepts Protocol-typed ports for all primitives. In production the caller
    (composition root / application layer) injects real primitive adapters.
    In tests, mock ports are injected (see mock_ports.py).

    The BT-1 fix wires vn_number_normalize BEFORE decimal_normalizer:
        raw OCR token → vn_number_normalize → normalize_decimal → float
    This corrects the VNM/DHG decimal-shift bug where VN-formatted strings
    ("2.840.370") were passed directly to float() → wrong parse (2.84).

    Args:
        normalizer:          An object satisfying DecimalNormalizerPort.
        validator:           An object satisfying FinancialValidatorPort.
        confidence_scorer:   An object satisfying ConfidenceScorerPort.
        low_confidence_gate: An object satisfying LowConfidenceGatePort.
        ratio_computer:      An object satisfying RatioComputerPort.
        field_extractor:     An object satisfying FieldExtractorPort.
        vn_normalizer:       An object satisfying VnNumberNormalizerPort (BT-1).
        reconciler:          An object satisfying ReconcileFiguresPort (BT-1).
        period_selector:     An object satisfying SelectPeriodColumnPort (BT-1).
    """

    def __init__(
        self,
        normalizer: DecimalNormalizerPort,
        validator: FinancialValidatorPort,
        confidence_scorer: ConfidenceScorerPort,
        low_confidence_gate: LowConfidenceGatePort,
        ratio_computer: RatioComputerPort,
        field_extractor: FieldExtractorPort,
        vn_normalizer: Optional[VnNumberNormalizerPort] = None,
        reconciler: Optional[ReconcileFiguresPort] = None,
        period_selector: Optional[SelectPeriodColumnPort] = None,
    ) -> None:
        self._normalizer = normalizer
        self._validator = validator
        self._confidence_scorer = confidence_scorer
        self._low_confidence_gate = low_confidence_gate
        self._ratio_computer = ratio_computer
        self._field_extractor = field_extractor
        self._vn_normalizer = vn_normalizer
        self._reconciler = reconciler
        self._period_selector = period_selector

    def _vn_pre_normalize(self, raw: str) -> str:
        """
        Apply VN number format normalization before decimal_normalizer (BT-1 fix).

        If a VnNumberNormalizerPort is wired, run the raw token through it first.
        This converts "2.840.370" → "2840370" so float() receives a clean string.
        If no port is wired (backward-compat), return raw unchanged.

        Args:
            raw: Raw OCR token string.

        Returns:
            Normalized string ready for decimal_normalizer, or raw if port not wired.
        """
        if self._vn_normalizer is None:
            return raw
        normalized = self._vn_normalizer.normalize_vn(raw)
        # If vn_normalizer returns None (unrecognised format), fall back to raw
        # so decimal_normalizer can handle it (may return None itself)
        return normalized if normalized is not None else raw

    def process_report(
        self,
        raw_assets: str,
        raw_equity: str,
        raw_liabilities: str,
        raw_margin: str,
        raw_revenue: str,
        unit_hint: str = "billion_vnd",
        ocr_confidence: float = 1.0,
        table_count: int = 0,
        ocr_text: str = "",
        api_bridge_revenue: Optional[float] = None,
        table_cells: Optional[List[str]] = None,
        column_hint: Optional[str] = None,
        column_headers: Optional[List[str]] = None,
    ) -> dict[str, Any]:
        """
        Full pipeline: OCR field extraction → VN-format normalization →
        decimal normalization → validation → confidence scoring →
        insert-gate → ratio computation → reconciliation (BT-1).

        Pipeline steps (BT-1 updated):
            0. Select period column via SelectPeriodColumnPort (if table_cells provided)
            1. Extract named field from OCR text via FieldExtractorPort (if ocr_text)
            2a. VN-format normalize raw OCR strings via VnNumberNormalizerPort (BT-1)
            2b. Decimal-normalize (EN-US string → float) via DecimalNormalizerPort
            3. Validate normalized figures via FinancialValidatorPort → base confidence
            4. Score OCR quality via ConfidenceScorerPort (pass/quality_score)
            5. Apply BCTC insert-gate via LowConfidenceGatePort → disposition
            6. Compute gross_margin ratio via RatioComputerPort
            7. Reconcile revenue figure against API bridge (BT-1)

        Args:
            raw_assets:         OCR-extracted string for total assets.
            raw_equity:         OCR-extracted string for total equity.
            raw_liabilities:    OCR-extracted string for total liabilities.
            raw_margin:         OCR-extracted string for operating margin.
            raw_revenue:        OCR-extracted string for net revenue.
            unit_hint:          Unit hint forwarded to the decimal normalizer.
            ocr_confidence:     Raw OCR confidence float [0.0, 1.0].
            table_count:        Number of tables detected in the PDF.
            ocr_text:           Full OCR text for field extraction (optional).
            api_bridge_revenue: API-bridge reference value for reconciliation (BT-1).
            table_cells:        Raw cell list for period column selection (BT-1).
            column_hint:        Semantic hint for column selection (BT-1).
            column_headers:     Column header labels for hint matching (BT-1).

        Returns:
            dict with keys:
                normalized_assets:       float | None
                normalized_equity:       float | None
                normalized_liabilities:  float | None
                normalized_margin:       float | None
                normalized_revenue:      float | None
                confidence:              float in [0.0, 1.0] (from validator)
                ocr_quality_pass:        bool (from confidence_scorer)
                ocr_quality_score:       float (from confidence_scorer)
                disposition:             str "skip" | "low_confidence" | "normal"
                gross_margin:            float | None (revenue→0 → None)
                extracted_net_revenue:   str | None (from field_extractor)
                revenue_reconciliation:  str "agree"|"shift"|"low"|"skip"
                selected_column_index:   int | None (from period selector)
                selected_column_value:   str | None (from period selector)
        """
        # Step 0: Select period column (BT-1)
        selected_column_index: Optional[int] = None
        selected_column_value: Optional[str] = None
        if table_cells is not None and self._period_selector is not None:
            _col_result = self._period_selector.select(
                cells=table_cells,
                hint=column_hint,
                headers=column_headers,
            )
            selected_column_index = _col_result[0]
            selected_column_value = _col_result[1]

        # Step 1: Extract named field from OCR text (if provided)
        extracted_net_revenue: Optional[str] = None
        if ocr_text:
            extracted_net_revenue = self._field_extractor.extract(ocr_text, "net_revenue")

        # Step 2a+2b: VN-format normalize THEN decimal-normalize each raw string.
        # BT-1 fix: vn_pre_normalize converts "2.840.370" → "2840370" so that
        # decimal_normalizer receives a valid EN-US string and float() works correctly.
        normalized_assets = self._normalizer.normalize(
            self._vn_pre_normalize(raw_assets), unit_hint
        )
        normalized_equity = self._normalizer.normalize(
            self._vn_pre_normalize(raw_equity), unit_hint
        )
        normalized_liabilities = self._normalizer.normalize(
            self._vn_pre_normalize(raw_liabilities), unit_hint
        )
        normalized_margin = self._normalizer.normalize(
            self._vn_pre_normalize(raw_margin), unit_hint
        )
        normalized_revenue = self._normalizer.normalize(
            self._vn_pre_normalize(raw_revenue), unit_hint
        )

        # Step 3: Validate via port — returns confidence in [0.0, 1.0]
        confidence = self._validator.validate(
            total_assets=normalized_assets,
            total_equity=normalized_equity,
            total_liabilities=normalized_liabilities,
            operating_margin=normalized_margin,
            net_revenue=normalized_revenue,
        )

        # Step 4: Score OCR quality via ConfidenceScorerPort
        quality_result = self._confidence_scorer.score(ocr_confidence, table_count)
        ocr_quality_pass: bool = bool(quality_result.get("pass", False))
        ocr_quality_score: float = float(quality_result.get("quality_score", ocr_confidence))

        # Step 5: Apply BCTC insert-gate via LowConfidenceGatePort
        disposition = self._low_confidence_gate.gate(confidence)

        # Step 6: Compute gross_margin via RatioComputerPort
        # Use normalized_margin as numerator, normalized_revenue as denominator
        gross_margin = self._ratio_computer.compute(
            numerator=normalized_margin if normalized_margin is not None else 0.0,
            denominator=normalized_revenue if normalized_revenue is not None else 0.0,
            ratio_type="gross_margin",
        )

        # Step 7: Reconcile revenue figure against API bridge (BT-1)
        revenue_reconciliation: str = "skip"
        if self._reconciler is not None and api_bridge_revenue is not None:
            revenue_reconciliation = self._reconciler.reconcile(
                a=normalized_revenue,
                b=api_bridge_revenue,
            )

        return {
            "normalized_assets": normalized_assets,
            "normalized_equity": normalized_equity,
            "normalized_liabilities": normalized_liabilities,
            "normalized_margin": normalized_margin,
            "normalized_revenue": normalized_revenue,
            "confidence": confidence,
            "ocr_quality_pass": ocr_quality_pass,
            "ocr_quality_score": ocr_quality_score,
            "disposition": disposition,
            "gross_margin": gross_margin,
            "extracted_net_revenue": extracted_net_revenue,
            "revenue_reconciliation": revenue_reconciliation,
            "selected_column_index": selected_column_index,
            "selected_column_value": selected_column_value,
        }
