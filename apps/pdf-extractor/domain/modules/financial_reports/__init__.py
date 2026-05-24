"""
financial_reports module — barrel export (P1-C, updated P2-C, BT-1).

Exposes FinancialReportsModule and all 9 Protocol ports as canonical entry points.
Protocol ports are exported for type annotation use in calling code.

All 9 primitives are composed via ports (BT-1 adds 3 new ports):
    DecimalNormalizerPort, FinancialValidatorPort,
    ConfidenceScorerPort, LowConfidenceGatePort,
    RatioComputerPort, FieldExtractorPort,
    VnNumberNormalizerPort, ReconcileFiguresPort, SelectPeriodColumnPort
"""

from .module import FinancialReportsModule
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

__all__ = [
    "FinancialReportsModule",
    "DecimalNormalizerPort",
    "FinancialValidatorPort",
    "ConfidenceScorerPort",
    "LowConfidenceGatePort",
    "RatioComputerPort",
    "FieldExtractorPort",
    "VnNumberNormalizerPort",
    "ReconcileFiguresPort",
    "SelectPeriodColumnPort",
]
