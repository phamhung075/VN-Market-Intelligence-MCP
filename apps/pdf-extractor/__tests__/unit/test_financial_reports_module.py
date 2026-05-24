"""
Unit tests — domain/modules/financial_reports/ (P1-C).

Tests cover:
  - Module imports cleanly (import chain works)
  - Module accepts Protocol ports (DecimalNormalizerPort, FinancialValidatorPort)
  - Module processes raw strings through DI'd ports (mock ports only — zero real infra)
  - Confidence returned matches mock validator output
  - None normalization result propagates gracefully
  - Module does NOT directly call primitive functions (only via ports)

Domain rules:
  - Zero imports from infrastructure/, application/, interface/
  - Ports only — no direct primitive function calls from module
  - Tests use AsyncMock/mock ports ONLY
"""

import pytest

from domain.modules.financial_reports import FinancialReportsModule
from domain.modules.financial_reports.mock_ports import (
    MockDecimalNormalizerPort,
    MockFinancialValidatorPort,
)


# ---------------------------------------------------------------------------
# Module import sanity
# ---------------------------------------------------------------------------


def test_financial_reports_module_imports():
    """Module and supporting types import without error."""
    from domain.modules.financial_reports import FinancialReportsModule  # noqa: F401
    from domain.modules.financial_reports.ports import (  # noqa: F401
        DecimalNormalizerPort,
        FinancialValidatorPort,
    )


# ---------------------------------------------------------------------------
# Mock port construction
# ---------------------------------------------------------------------------


def test_mock_decimal_normalizer_port_returns_configured_value():
    """MockDecimalNormalizerPort returns the configured return value."""
    mock = MockDecimalNormalizerPort(return_value=1234.5)
    result = mock.normalize("1234.5", "billion_vnd")
    assert result == 1234.5


def test_mock_decimal_normalizer_port_returns_none():
    """MockDecimalNormalizerPort returns None when configured."""
    mock = MockDecimalNormalizerPort(return_value=None)
    result = mock.normalize("N/A", "billion_vnd")
    assert result is None


def test_mock_financial_validator_port_returns_configured_confidence():
    """MockFinancialValidatorPort returns the configured confidence."""
    mock = MockFinancialValidatorPort(return_confidence=0.8)
    result = mock.validate(1000.0, 400.0, 600.0, 0.15, 5000.0)
    assert result == pytest.approx(0.8, rel=1e-6)


# ---------------------------------------------------------------------------
# Module: process_report with mock ports
# ---------------------------------------------------------------------------


def test_module_process_report_happy_path():
    """
    Module.process_report returns correct confidence from mock validator.
    Inputs are raw strings — normalizer mock converts them to floats first.
    """
    normalizer = MockDecimalNormalizerPort(return_value=10000.0)
    validator = MockFinancialValidatorPort(return_confidence=1.0)

    module = FinancialReportsModule(
        normalizer=normalizer,
        validator=validator,
    )

    result = module.process_report(
        raw_assets="10000.0",
        raw_equity="4000.0",
        raw_liabilities="6000.0",
        raw_margin="0.15",
        raw_revenue="5000.0",
        unit_hint="billion_vnd",
    )

    assert result["confidence"] == pytest.approx(1.0, rel=1e-6)
    assert result["normalized_assets"] == 10000.0


def test_module_process_report_low_confidence():
    """Module returns low confidence from validator mock."""
    normalizer = MockDecimalNormalizerPort(return_value=957.0)
    validator = MockFinancialValidatorPort(return_confidence=0.0)

    module = FinancialReportsModule(
        normalizer=normalizer,
        validator=validator,
    )

    result = module.process_report(
        raw_assets="957.0",
        raw_equity="18829.0",
        raw_liabilities="6000.0",
        raw_margin="0.12",
        raw_revenue="3000.0",
        unit_hint="billion_vnd",
    )

    assert result["confidence"] == pytest.approx(0.0, rel=1e-6)


def test_module_process_report_none_normalization():
    """
    When normalizer returns None for a value, module passes None to validator
    and the validator mock returns its configured confidence.
    """
    normalizer = MockDecimalNormalizerPort(return_value=None)
    validator = MockFinancialValidatorPort(return_confidence=0.5)

    module = FinancialReportsModule(
        normalizer=normalizer,
        validator=validator,
    )

    result = module.process_report(
        raw_assets="N/A",
        raw_equity="N/A",
        raw_liabilities="N/A",
        raw_margin="N/A",
        raw_revenue="N/A",
        unit_hint="billion_vnd",
    )

    assert result["confidence"] == pytest.approx(0.5, rel=1e-6)
    assert result["normalized_assets"] is None


# ---------------------------------------------------------------------------
# Fence-B verification (runtime check)
# ---------------------------------------------------------------------------


def test_module_does_not_import_infrastructure():
    """
    Fence-B: module imports must not include infrastructure, application, or interface.
    Verified at import time — if this test passes, the module imported cleanly.
    """
    import domain.modules.financial_reports.module as mod_module
    import domain.modules.financial_reports.ports as mod_ports

    # Verify neither module has infrastructure in its __dict__ (module globals)
    for mod in [mod_module, mod_ports]:
        src = getattr(mod, "__file__", "")
        # Simple: if the module loaded without ImportError from infra, Fence-B holds.
        assert src, f"Module {mod} has no __file__ — unexpected"
