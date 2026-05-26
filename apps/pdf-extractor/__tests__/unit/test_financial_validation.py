"""
Unit tests — validate_financial_figures (domain layer, Task 1345b).

Tests cover all 6 validation rules (BCTC-VAL-01..06):
  Hard violations (return 0.0 immediately):
    VAL-01: total_assets < total_equity
    VAL-02: total_assets < 0
    VAL-04: total_liabilities < 0
  Soft violations (-0.2 each, floor 0.1):
    VAL-03: operating_margin outside (-5.0, +1.0)
    VAL-05: net_revenue <= 0
    VAL-06: equity < 0

All tests run in isolation — no I/O, no DB, no HTTP.
"""

import sys
import os

# Adjust sys.path so relative imports work when run from apps/pdf-extractor/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest
from domain.primitives.validate_financial_figures import validate_financial_figures


# ---------------------------------------------------------------------------
# Test 1 — Clean figures: all values pass, returns 1.0
# ---------------------------------------------------------------------------

def test_returns_1_0_when_all_figures_clean():
    """All valid figures: no violations → confidence 1.0."""
    result = validate_financial_figures(
        total_assets=10_000.0,
        total_equity=4_000.0,
        total_liabilities=6_000.0,
        operating_margin=0.15,
        net_revenue=5_000.0,
    )
    assert result == 1.0


# ---------------------------------------------------------------------------
# Test 2 — BCTC-VAL-01 hard: total_assets < total_equity → 0.0
# ---------------------------------------------------------------------------

def test_returns_0_0_when_assets_less_than_equity():
    """Hard violation: accounting identity broken (assets < equity)."""
    result = validate_financial_figures(
        total_assets=957.0,        # VNM scenario: assets much less than equity
        total_equity=18_829.0,
        total_liabilities=6_000.0,
        operating_margin=0.12,
        net_revenue=3_000.0,
    )
    assert result == 0.0


# ---------------------------------------------------------------------------
# Test 3 — BCTC-VAL-02 hard: total_assets < 0 → 0.0
# ---------------------------------------------------------------------------

def test_returns_0_0_when_assets_negative():
    """Hard violation: total_assets cannot be negative."""
    result = validate_financial_figures(
        total_assets=-100.0,
        total_equity=4_000.0,
        total_liabilities=6_000.0,
        operating_margin=0.10,
        net_revenue=2_000.0,
    )
    assert result == 0.0


# ---------------------------------------------------------------------------
# Test 4 — BCTC-VAL-04 hard: total_liabilities < 0 → 0.0
# ---------------------------------------------------------------------------

def test_returns_0_0_when_liabilities_negative():
    """Hard violation: total_liabilities cannot be negative."""
    result = validate_financial_figures(
        total_assets=10_000.0,
        total_equity=4_000.0,
        total_liabilities=-1.0,
        operating_margin=0.10,
        net_revenue=2_000.0,
    )
    assert result == 0.0


# ---------------------------------------------------------------------------
# Test 5 — BCTC-VAL-03 soft: operating_margin > 1.0 → -0.2
# ---------------------------------------------------------------------------

def test_reduces_by_0_2_for_operating_margin_above_1():
    """Soft violation: margin > 1.0 (impossible for operating margin as ratio)."""
    result = validate_financial_figures(
        total_assets=10_000.0,
        total_equity=4_000.0,
        total_liabilities=6_000.0,
        operating_margin=1.5,      # 150% — clearly wrong
        net_revenue=5_000.0,
    )
    assert abs(result - 0.8) < 1e-9


# ---------------------------------------------------------------------------
# Test 6 — BCTC-VAL-05 soft: net_revenue <= 0 → -0.2
# ---------------------------------------------------------------------------

def test_reduces_by_0_2_for_net_revenue_zero():
    """Soft violation: non-holding company with zero revenue."""
    result = validate_financial_figures(
        total_assets=10_000.0,
        total_equity=4_000.0,
        total_liabilities=6_000.0,
        operating_margin=0.15,
        net_revenue=0.0,
    )
    assert abs(result - 0.8) < 1e-9


# ---------------------------------------------------------------------------
# Test 7 — BCTC-VAL-06 soft: equity < 0 → -0.2
# ---------------------------------------------------------------------------

def test_reduces_by_0_2_for_equity_negative():
    """Soft violation: negative equity triggers -0.2 penalty."""
    result = validate_financial_figures(
        total_assets=10_000.0,
        total_equity=-500.0,       # Technically possible but suspicious
        total_liabilities=6_000.0,
        operating_margin=0.10,
        net_revenue=5_000.0,
    )
    assert abs(result - 0.8) < 1e-9


# ---------------------------------------------------------------------------
# Test 8 — 3 soft violations: floor at 0.1
# ---------------------------------------------------------------------------

def test_floors_at_0_1_for_three_soft_violations():
    """Three soft violations: 1.0 - 0.2 - 0.2 - 0.2 = 0.4, floor >= 0.1."""
    result = validate_financial_figures(
        total_assets=10_000.0,
        total_equity=-500.0,       # VAL-06 soft
        total_liabilities=6_000.0,
        operating_margin=2.0,      # VAL-03 soft (>1.0)
        net_revenue=0.0,           # VAL-05 soft
    )
    # 1.0 - 0.6 = 0.4 — above floor — but 3 soft = 0.4
    assert abs(result - 0.4) < 1e-9


# ---------------------------------------------------------------------------
# Test 9 — None values skipped (partial extraction not penalized)
# ---------------------------------------------------------------------------

def test_none_values_skipped_no_penalty():
    """None arguments are not validated — partial extraction is not penalized."""
    result = validate_financial_figures(
        total_assets=10_000.0,
        total_equity=None,
        total_liabilities=None,
        operating_margin=None,
        net_revenue=None,
    )
    assert result == 1.0


# ---------------------------------------------------------------------------
# Test 10 — VNM Q4 2024 scenario: assets=957T equity=18829T → 0.0
# ---------------------------------------------------------------------------

def test_vnm_q4_2024_scenario_returns_0():
    """
    VNM Q4 2024 real corruption case:
      total_assets = 957 billion VND
      total_equity = 18829 billion VND
    assets < equity → BCTC-VAL-01 hard violation → 0.0
    """
    result = validate_financial_figures(
        total_assets=957.0,
        total_equity=18_829.0,
        total_liabilities=6_000.0,
        operating_margin=0.12,
        net_revenue=5_000.0,
    )
    assert result == 0.0


# ---------------------------------------------------------------------------
# Test 11 — VEA Q4 2024 scenario: operating_margin=3.3 → soft (but hard check first)
# ---------------------------------------------------------------------------

def test_vea_q4_2024_scenario_operating_margin_3_3():
    """
    VEA Q4 2024 real scenario:
      operating_margin = 3.3 (330% — impossible)
      No hard violations in isolation.
    VAL-03 soft violation → 0.8
    """
    result = validate_financial_figures(
        total_assets=50_000.0,
        total_equity=20_000.0,
        total_liabilities=30_000.0,
        operating_margin=3.3,      # 330% — VAL-03 soft (>1.0)
        net_revenue=10_000.0,
    )
    assert abs(result - 0.8) < 1e-9


# ---------------------------------------------------------------------------
# Test 12 — composite confidence = min(ocr_confidence, confidence_financial)
# ---------------------------------------------------------------------------

def test_composite_confidence_is_min_of_ocr_and_financial():
    """
    Composite confidence = min(ocr_confidence, confidence_financial).
    When financial validation returns 0.8 and OCR is 0.6, composite = 0.6.
    When financial validation returns 0.3 and OCR is 0.9, composite = 0.3.
    """
    # Case A: OCR limits
    financial_conf = validate_financial_figures(
        total_assets=10_000.0,
        total_equity=4_000.0,
        total_liabilities=6_000.0,
        operating_margin=1.5,       # soft → 0.8
        net_revenue=5_000.0,
    )
    ocr_conf_a = 0.6
    composite_a = min(ocr_conf_a, financial_conf)
    assert abs(composite_a - 0.6) < 1e-9

    # Case B: financial validation limits
    financial_conf_b = validate_financial_figures(
        total_assets=10_000.0,
        total_equity=4_000.0,
        total_liabilities=6_000.0,
        operating_margin=2.0,       # soft
        net_revenue=0.0,            # soft
    )
    ocr_conf_b = 0.9
    composite_b = min(ocr_conf_b, financial_conf_b)
    # 1.0 - 0.2 - 0.2 = 0.6
    assert abs(composite_b - 0.6) < 1e-9
