"""
Unit tests — domain/primitives/reconcile_figures/primitive.py (BT-1).

Generalizes the isDecimalShiftAnomaly formula from:
    apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts

Formula:
    ratio = max(|a|, |b|) / max(min(|a|, |b|), eps)
    ratio <= tol           → "agree"
    ratio > 10 * tol       → "shift"   (decimal-shift-class anomaly)
    otherwise              → "low"     (low-confidence divergence)

Default tol=1.0, eps=1e-9.
Output Literal: "agree" | "shift" | "low"

Domain layer rules:
    - Zero imports from infrastructure/, application/, interface/
    - Pure function: output = f(input) with no side effects
"""

import pytest

from domain.primitives.reconcile_figures import reconcile_figures


# ---------------------------------------------------------------------------
# "agree" cases — ratio within tolerance
# ---------------------------------------------------------------------------


def test_agree_identical_values():
    """Identical values → ratio=1.0 → "agree"."""
    assert reconcile_figures(1000.0, 1000.0) == "agree"


def test_agree_small_divergence():
    """5% divergence: ratio=1.05 ≤ 1.0 tol? No, but within 10x → "low"."""
    # 1050 vs 1000 → ratio = 1050/1000 = 1.05 → "low" (> tol=1.0, < 10)
    assert reconcile_figures(1050.0, 1000.0) == "low"


def test_agree_exact_zero_both():
    """Both zero → ratio=0 → "agree"."""
    assert reconcile_figures(0.0, 0.0) == "agree"


def test_agree_small_values_near_equal():
    """Small matching values 0.5 and 0.5 → ratio=1.0 → "agree"."""
    assert reconcile_figures(0.5, 0.5) == "agree"


# ---------------------------------------------------------------------------
# "shift" cases — decimal-shift anomaly (>10x ratio)
# ---------------------------------------------------------------------------


def test_shift_vnm_net_profit_case():
    """
    VNM regression: ocr=0.000051, api=51000 → massive ratio → "shift".

    This is the exact case that was broken: the OCR misread triệu-unit value
    as a tiny fraction instead of the correct billion-VND figure.
    ratio = 51000 / max(0.000051, 1e-9) ≈ 1e9 >> 10 → "shift"
    """
    assert reconcile_figures(0.000051, 51000.0) == "shift"


def test_shift_dhg_revenue_case():
    """
    DHG regression: ocr=0.000009, api=9000 → massive ratio → "shift".
    ratio = 9000 / max(0.000009, 1e-9) ≈ 1e9 >> 10 → "shift"
    """
    assert reconcile_figures(0.000009, 9000.0) == "shift"


def test_shift_simple_10x():
    """Simple 100x difference: 100 vs 1 → ratio=100 > 10 → "shift"."""
    assert reconcile_figures(100.0, 1.0) == "shift"


def test_shift_11x():
    """11x difference: 11 vs 1 → ratio=11 > 10 → "shift"."""
    assert reconcile_figures(11.0, 1.0) == "shift"


def test_shift_reversed_order():
    """Order-agnostic: 1 vs 100 → same as 100 vs 1 → "shift"."""
    assert reconcile_figures(1.0, 100.0) == "shift"


# ---------------------------------------------------------------------------
# "low" cases — some divergence but not a decimal-shift
# ---------------------------------------------------------------------------


def test_low_9x_divergence():
    """9x divergence: 9 vs 1 → ratio=9 < 10 → "low"."""
    assert reconcile_figures(9.0, 1.0) == "low"


def test_low_2x_divergence():
    """2x divergence: 200 vs 100 → ratio=2 → "low"."""
    assert reconcile_figures(200.0, 100.0) == "low"


# ---------------------------------------------------------------------------
# None / null guards
# ---------------------------------------------------------------------------


def test_none_a_returns_agree():
    """None for a → cannot compare → "agree" (skip, no anomaly flagged)."""
    # Per mcp-server isDecimalShiftAnomaly: if either null → false → no flag
    assert reconcile_figures(None, 1000.0) == "agree"


def test_none_b_returns_agree():
    """None for b → cannot compare → "agree" (skip)."""
    assert reconcile_figures(1000.0, None) == "agree"


def test_both_none_returns_agree():
    """Both None → "agree" (skip)."""
    assert reconcile_figures(None, None) == "agree"


# ---------------------------------------------------------------------------
# Zero-reference guard (b=0 means no API data → skip)
# ---------------------------------------------------------------------------


def test_zero_reference_skips():
    """
    b=0 with non-zero a → "agree" (skip, no API data).

    Matches mcp-server: if api_bridge=0, skip anomaly flag (no API data).
    """
    assert reconcile_figures(1000.0, 0.0) == "agree"


# ---------------------------------------------------------------------------
# Negative values (BCTC can have negative net_profit for loss years)
# ---------------------------------------------------------------------------


def test_negative_values_shift():
    """Negative OCR and positive reference: large ratio → "shift"."""
    assert reconcile_figures(-0.000051, 51000.0) == "shift"


def test_both_negative_agree():
    """Both negative, same magnitude → "agree"."""
    assert reconcile_figures(-1000.0, -1000.0) == "agree"


# ---------------------------------------------------------------------------
# Custom tolerance
# ---------------------------------------------------------------------------


def test_custom_tol_strict():
    """Custom tol=0.5: ratio=2 (200 vs 100) → 2 > 10*0.5=5? No → "low"."""
    # ratio=2, tol=0.5 → agree cutoff = 0.5, shift cutoff = 5
    # 2 > 0.5 and 2 < 5 → "low"
    assert reconcile_figures(200.0, 100.0, tol=0.5) == "low"


def test_custom_tol_large():
    """Custom tol=5: ratio=3 (300 vs 100) → 3 ≤ 5 → "agree"."""
    assert reconcile_figures(300.0, 100.0, tol=5.0) == "agree"
