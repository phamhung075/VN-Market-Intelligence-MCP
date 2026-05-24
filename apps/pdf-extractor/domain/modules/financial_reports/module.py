"""
financial_reports — FinancialReportsModule (P1-C, extended P2-C).

Composes all 6 domain primitives via Protocol ports (dependency injection).
The module NEVER imports concrete primitive implementations — it only types
against the Protocol contracts defined in ports.py.

This design satisfies:
    - G2 re-verify (P2-C): module composes ALL 6 primitives via ports
    - DDD: domain module imports only from domain (ports), never from infra
    - Fence-B: grep -r "from infrastructure" domain/modules/ → 0 matches
    - G12: module-tier sandbox scenario runs through process_report()

All 6 ports wired (P2-C):
    1. DecimalNormalizerPort     — normalize raw OCR strings
    2. FinancialValidatorPort    — validate figures, return base confidence
    3. ConfidenceScorerPort      — score OCR quality + table presence
    4. LowConfidenceGatePort     — apply BCTC insert-gate decision
    5. RatioComputerPort         — compute financial ratios
    6. FieldExtractorPort        — extract named fields from OCR text

Domain layer rules:
    - Zero imports from infrastructure/, application/, interface/
    - No pdfplumber, pytesseract, aiohttp
    - No DB access, no file I/O, no network calls
    - Depends on Protocol ports (DI) not concrete implementations

PYTHONPATH requirement: caller sets PYTHONPATH=apps/pdf-extractor.
"""

from __future__ import annotations

from typing import Any, Optional

from .ports import (
    ConfidenceScorerPort,
    DecimalNormalizerPort,
    FieldExtractorPort,
    FinancialValidatorPort,
    LowConfidenceGatePort,
    RatioComputerPort,
)


class FinancialReportsModule:
    """
    Module-tier composition of all 6 domain primitives.

    Accepts Protocol-typed ports for all primitives. In production the caller
    (composition root / application layer) injects real primitive adapters.
    In tests, mock ports are injected (see mock_ports.py).

    Args:
        normalizer:         An object satisfying DecimalNormalizerPort.
        validator:          An object satisfying FinancialValidatorPort.
        confidence_scorer:  An object satisfying ConfidenceScorerPort.
        low_confidence_gate: An object satisfying LowConfidenceGatePort.
        ratio_computer:     An object satisfying RatioComputerPort.
        field_extractor:    An object satisfying FieldExtractorPort.
    """

    def __init__(
        self,
        normalizer: DecimalNormalizerPort,
        validator: FinancialValidatorPort,
        confidence_scorer: ConfidenceScorerPort,
        low_confidence_gate: LowConfidenceGatePort,
        ratio_computer: RatioComputerPort,
        field_extractor: FieldExtractorPort,
    ) -> None:
        self._normalizer = normalizer
        self._validator = validator
        self._confidence_scorer = confidence_scorer
        self._low_confidence_gate = low_confidence_gate
        self._ratio_computer = ratio_computer
        self._field_extractor = field_extractor

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
    ) -> dict[str, Any]:
        """
        Full pipeline: OCR field extraction → normalization → validation →
        confidence scoring → insert-gate → ratio computation.

        Pipeline steps:
            1. Extract named field from OCR text via FieldExtractorPort (if ocr_text provided)
            2. Normalize raw OCR strings via DecimalNormalizerPort
            3. Validate normalized figures via FinancialValidatorPort → base confidence
            4. Score OCR quality via ConfidenceScorerPort (pass/quality_score)
            5. Apply BCTC insert-gate via LowConfidenceGatePort → disposition
            6. Compute gross_margin ratio via RatioComputerPort

        Args:
            raw_assets:       OCR-extracted string for total assets.
            raw_equity:       OCR-extracted string for total equity.
            raw_liabilities:  OCR-extracted string for total liabilities.
            raw_margin:       OCR-extracted string for operating margin.
            raw_revenue:      OCR-extracted string for net revenue.
            unit_hint:        Unit hint forwarded to the normalizer.
            ocr_confidence:   Raw OCR confidence float [0.0, 1.0] for quality gate.
            table_count:      Number of tables detected in the PDF.
            ocr_text:         Full OCR text for field extraction (optional).

        Returns:
            dict with keys:
                normalized_assets:      float | None
                normalized_equity:      float | None
                normalized_liabilities: float | None
                normalized_margin:      float | None
                normalized_revenue:     float | None
                confidence:             float in [0.0, 1.0] (from validator)
                ocr_quality_pass:       bool (from confidence_scorer)
                ocr_quality_score:      float (from confidence_scorer)
                disposition:            str "skip" | "low_confidence" | "normal"
                gross_margin:           float | None (revenue→0 → None)
                extracted_net_revenue:  str | None (from field_extractor on ocr_text)
        """
        # Step 1: Extract named field from OCR text (if provided)
        extracted_net_revenue: Optional[str] = None
        if ocr_text:
            extracted_net_revenue = self._field_extractor.extract(ocr_text, "net_revenue")

        # Step 2: Normalize raw OCR strings via port
        normalized_assets = self._normalizer.normalize(raw_assets, unit_hint)
        normalized_equity = self._normalizer.normalize(raw_equity, unit_hint)
        normalized_liabilities = self._normalizer.normalize(raw_liabilities, unit_hint)
        normalized_margin = self._normalizer.normalize(raw_margin, unit_hint)
        normalized_revenue = self._normalizer.normalize(raw_revenue, unit_hint)

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
        # gross_margin = (revenue - liabilities_proxy) / revenue — simplified here
        # Use normalized_margin as numerator, normalized_revenue as denominator
        gross_margin = self._ratio_computer.compute(
            numerator=normalized_margin if normalized_margin is not None else 0.0,
            denominator=normalized_revenue if normalized_revenue is not None else 0.0,
            ratio_type="gross_margin",
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
        }
