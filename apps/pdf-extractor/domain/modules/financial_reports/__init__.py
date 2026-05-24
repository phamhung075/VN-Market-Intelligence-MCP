"""
financial_reports module — barrel export (P1-C).

Exposes FinancialReportsModule as the canonical entry point.
Protocol ports are exported for type annotation use in calling code.

Composition root wires the module by injecting concrete adapters:
    from domain.modules.financial_reports import FinancialReportsModule
    from domain.primitives.decimal_normalizer import normalize_decimal
    from domain.primitives.validate_financial_figures import validate_financial_figures

    module = FinancialReportsModule(
        normalizer=DecimalNormalizerAdapter(normalize_decimal),
        validator=FinancialValidatorAdapter(validate_financial_figures),
    )

Tests inject mock ports:
    from domain.modules.financial_reports.mock_ports import (
        MockDecimalNormalizerPort,
        MockFinancialValidatorPort,
    )
"""

from .module import FinancialReportsModule
from .ports import DecimalNormalizerPort, FinancialValidatorPort

__all__ = [
    "FinancialReportsModule",
    "DecimalNormalizerPort",
    "FinancialValidatorPort",
]
