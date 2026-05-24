"""
financial_reports module — barrel export (P1-C, updated P2-C).

Exposes FinancialReportsModule and all 6 Protocol ports as canonical entry points.
Protocol ports are exported for type annotation use in calling code.

All 6 primitives are composed via ports (P2-C):
    DecimalNormalizerPort, FinancialValidatorPort,
    ConfidenceScorerPort, LowConfidenceGatePort,
    RatioComputerPort, FieldExtractorPort
"""

from .module import FinancialReportsModule
from .ports import (
    ConfidenceScorerPort,
    DecimalNormalizerPort,
    FieldExtractorPort,
    FinancialValidatorPort,
    LowConfidenceGatePort,
    RatioComputerPort,
)

__all__ = [
    "FinancialReportsModule",
    "DecimalNormalizerPort",
    "FinancialValidatorPort",
    "ConfidenceScorerPort",
    "LowConfidenceGatePort",
    "RatioComputerPort",
    "FieldExtractorPort",
]
