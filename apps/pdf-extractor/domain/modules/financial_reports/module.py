"""
financial_reports — FinancialReportsModule (P1-C).

Composes the decimal_normalizer and validate_financial_figures primitives via
Protocol ports (dependency injection). The module NEVER imports concrete
primitive implementations — it only types against the Protocol contracts
defined in ports.py.

This design satisfies:
    - G2: module stub composing P1-B1 + P1-B2 primitives
    - DDD: domain module imports only from domain (ports), never from infra
    - Fence-B: grep -r "from infrastructure" domain/modules/ → 0 matches
    - G12: module-tier sandbox scenario runs through process_report()

Domain layer rules:
    - Zero imports from infrastructure/, application/, interface/
    - No pdfplumber, pytesseract, aiohttp
    - No DB access, no file I/O, no network calls
    - Depends on Protocol ports (DI) not concrete implementations

PYTHONPATH requirement: caller sets PYTHONPATH=apps/pdf-extractor.
"""

from __future__ import annotations

from typing import Any, Optional

from .ports import DecimalNormalizerPort, FinancialValidatorPort


class FinancialReportsModule:
    """
    Module-tier composition of decimal_normalizer + validate_financial_figures.

    Accepts Protocol-typed ports for both primitives. In production the caller
    (composition root / application layer) injects real primitive adapters.
    In tests, mock ports are injected (see mock_ports.py).

    Args:
        normalizer: An object satisfying DecimalNormalizerPort — normalizes raw OCR strings.
        validator:  An object satisfying FinancialValidatorPort — validates figures and scores.
    """

    def __init__(
        self,
        normalizer: DecimalNormalizerPort,
        validator: FinancialValidatorPort,
    ) -> None:
        self._normalizer = normalizer
        self._validator = validator

    def process_report(
        self,
        raw_assets: str,
        raw_equity: str,
        raw_liabilities: str,
        raw_margin: str,
        raw_revenue: str,
        unit_hint: str = "billion_vnd",
    ) -> dict[str, Any]:
        """
        Normalize raw OCR strings then validate financial figures.

        Pipeline:
            1. Normalize each raw string via DecimalNormalizerPort
            2. Validate normalized floats via FinancialValidatorPort
            3. Return composite result dict

        Args:
            raw_assets:      OCR-extracted string for total assets.
            raw_equity:      OCR-extracted string for total equity.
            raw_liabilities: OCR-extracted string for total liabilities.
            raw_margin:      OCR-extracted string for operating margin.
            raw_revenue:     OCR-extracted string for net revenue.
            unit_hint:       Unit hint forwarded to the normalizer (e.g. "billion_vnd").

        Returns:
            dict with keys:
                normalized_assets:      float | None
                normalized_equity:      float | None
                normalized_liabilities: float | None
                normalized_margin:      float | None
                normalized_revenue:     float | None
                confidence:             float in [0.0, 1.0]
        """
        # Step 1: Normalize raw OCR strings via port
        normalized_assets = self._normalizer.normalize(raw_assets, unit_hint)
        normalized_equity = self._normalizer.normalize(raw_equity, unit_hint)
        normalized_liabilities = self._normalizer.normalize(raw_liabilities, unit_hint)
        normalized_margin = self._normalizer.normalize(raw_margin, unit_hint)
        normalized_revenue = self._normalizer.normalize(raw_revenue, unit_hint)

        # Step 2: Validate via port — returns confidence in [0.0, 1.0]
        confidence = self._validator.validate(
            total_assets=normalized_assets,
            total_equity=normalized_equity,
            total_liabilities=normalized_liabilities,
            operating_margin=normalized_margin,
            net_revenue=normalized_revenue,
        )

        return {
            "normalized_assets": normalized_assets,
            "normalized_equity": normalized_equity,
            "normalized_liabilities": normalized_liabilities,
            "normalized_margin": normalized_margin,
            "normalized_revenue": normalized_revenue,
            "confidence": confidence,
        }
