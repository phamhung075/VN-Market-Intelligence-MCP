"""
Unit tests — check_bs_accounting_identities (GATE-VISION, gate-a checksum)

Verifies the four VAS Circular 200/2014 B01-DN balance-sheet identities:
    I1  total_assets (280 or 270) == total_equity_liab (440)
    I2  total_equity_liab (440) == liabilities (300) + equity (400)
    I3  current_assets (100) == Σ(110, 120, 130, 140, 150)
    I4  non_current_assets (200) == Σ(210, 220, 230, 240, 250, 260)

All tests: zero I/O, zero Tesseract, zero DB. Pure function.

The gate emits violations list (escalation markers) but does NOT call vision.
Vision is triggered only by the flow, and only for flagged pages.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest
from domain.primitives.layout_invariants.primitive import check_bs_accounting_identities


# ===========================================================================
# Helpers
# ===========================================================================

def _row(code, value, page=1):
    """Build a test row dict with a single value cell."""
    return {"code": code, "label": f"Label {code}", "values": [str(value)], "page": page}


def _make_balanced_bs(assets=100_000, liabilities=60_000, equity=40_000) -> list:
    """
    Build a minimal balanced balance sheet:
        code 280 = total assets
        code 300 = liabilities
        code 400 = equity
        code 440 = total equity+liabilities
        code 100 = current assets (= 280 for simplicity in minimal fixture)
    """
    return [
        _row("100", assets),           # current assets (simplified = total)
        _row("280", assets),           # total assets
        _row("300", liabilities),      # liabilities
        _row("400", equity),           # equity
        _row("440", assets),           # total equity+liab (== 280)
    ]


# ===========================================================================
# I1: total_assets (280 or 270) == total_equity_liab (440)
# ===========================================================================

class TestIdentityI1:

    def test_i1_passes_when_280_equals_440(self):
        """Code 280 == code 440 → I1 passes."""
        rows = [
            _row("280", 100_000),
            _row("440", 100_000),
        ]
        ok, reason, violations = check_bs_accounting_identities(rows)
        assert ok or "I1" not in reason, f"I1 must pass, got: {reason!r}"
        assert not any("I1" in v for v in violations)

    def test_i1_fails_when_280_not_equal_440(self):
        """280 != 440 → I1 fails."""
        rows = [
            _row("100", 50_000),   # ensure >= 3 distinct codes
            _row("280", 100_000),
            _row("300", 60_000),
            _row("400", 40_000),
            _row("440", 95_000),   # 5% off — exceeds 1% tolerance
        ]
        ok, reason, violations = check_bs_accounting_identities(rows)
        assert not ok, "280 != 440 (5% diff) must trigger I1 failure"
        assert any("I1" in v for v in violations), (
            f"Expected 'I1' in violations, got: {violations!r}"
        )
        # Verify reason string is informative
        assert "total_assets" in violations[0].lower() or "I1" in violations[0]

    def test_i1_falls_back_to_code_270_when_280_absent(self):
        """When code 280 is absent, fall back to 270 for total assets."""
        rows = [
            _row("100", 50_000),
            _row("270", 100_000),  # no 280
            _row("300", 60_000),
            _row("400", 40_000),
            _row("440", 100_000),  # equals 270 → pass
        ]
        ok, reason, violations = check_bs_accounting_identities(rows)
        # I1 should pass because 270 == 440
        assert not any("I1" in v for v in violations), (
            f"I1 must pass when 270==440: violations={violations!r}"
        )

    def test_i1_skipped_when_440_absent(self):
        """No code 440 → I1 cannot be checked → skip (no false-fail)."""
        rows = [_row("100", 50_000), _row("280", 100_000), _row("300", 60_000)]
        ok, reason, violations = check_bs_accounting_identities(rows)
        assert not any("I1" in v for v in violations), (
            "I1 must be skipped when code 440 absent"
        )

    def test_i1_1pct_tolerance_passes(self):
        """Delta <= 1% of total → rounding tolerance → pass."""
        # 100_000 vs 100_900 → delta=900 → ratio=0.009 → within 1%
        rows = [
            _row("100", 50_000),
            _row("280", 100_000),
            _row("300", 60_000),
            _row("400", 40_000),
            _row("440", 100_900),  # 0.9% diff — within tolerance
        ]
        ok, reason, violations = check_bs_accounting_identities(rows)
        assert not any("I1" in v for v in violations), (
            f"1% rounding must pass I1: violations={violations!r}"
        )

    def test_i1_2pct_fails(self):
        """Delta > 1% → fails I1."""
        # 100_000 vs 102_100 → ratio=0.021 → exceeds 1%
        rows = [
            _row("100", 50_000),
            _row("280", 100_000),
            _row("300", 60_000),
            _row("400", 40_000),
            _row("440", 102_100),  # 2.1% diff — exceeds tolerance
        ]
        ok, reason, violations = check_bs_accounting_identities(rows)
        assert not ok, "2% diff must fail I1"
        assert any("I1" in v for v in violations)


# ===========================================================================
# I2: total_equity_liab (440) == liabilities (300) + equity (400)
# ===========================================================================

class TestIdentityI2:

    def test_i2_passes_when_300_plus_400_equals_440(self):
        """300 + 400 == 440 → I2 passes."""
        rows = [
            _row("100", 50_000),
            _row("280", 100_000),
            _row("300", 60_000),
            _row("400", 40_000),
            _row("440", 100_000),  # == 300 + 400
        ]
        ok, reason, violations = check_bs_accounting_identities(rows)
        assert not any("I2" in v for v in violations), (
            f"I2 must pass: violations={violations!r}"
        )

    def test_i2_fails_when_components_dont_sum_to_440(self):
        """300 + 400 != 440 (>1% diff) → I2 fails."""
        rows = [
            _row("100", 50_000),
            _row("280", 100_000),
            _row("300", 65_000),   # 65k + 40k = 105k != 100k → 5% error
            _row("400", 40_000),
            _row("440", 100_000),
        ]
        ok, reason, violations = check_bs_accounting_identities(rows)
        assert not ok, "I2 must fail when components don't sum to 440"
        assert any("I2" in v for v in violations), (
            f"Expected I2 violation, got: {violations!r}"
        )

    def test_i2_skipped_when_300_absent(self):
        """No code 300 → I2 skipped."""
        rows = [_row("100", 50_000), _row("440", 100_000), _row("400", 40_000)]
        ok, reason, violations = check_bs_accounting_identities(rows)
        assert not any("I2" in v for v in violations), "I2 must be skipped when 300 absent"


# ===========================================================================
# I3: current_assets (100) == Σ(110, 120, 130, 140, 150)
# ===========================================================================

class TestIdentityI3:

    def test_i3_passes_when_children_sum_equals_100(self):
        """Σ(110+120+130+140+150) == 100 → I3 passes."""
        rows = [
            _row("100", 50_000),
            _row("110", 10_000),
            _row("120", 15_000),
            _row("130", 12_000),
            _row("140", 8_000),
            _row("150", 5_000),   # sum = 50_000 == 100
            _row("280", 80_000),
            _row("440", 80_000),
        ]
        ok, reason, violations = check_bs_accounting_identities(rows)
        assert not any("I3" in v for v in violations), (
            f"I3 must pass: violations={violations!r}"
        )

    def test_i3_fails_when_children_dont_sum_to_100(self):
        """Children sum != 100 (>1%) → I3 fails."""
        rows = [
            _row("100", 50_000),
            _row("110", 10_000),
            _row("120", 15_000),  # sum only = 25_000, not 50_000
            _row("280", 80_000),
            _row("440", 80_000),
        ]
        ok, reason, violations = check_bs_accounting_identities(rows)
        # 25_000 vs 50_000 → 50% error → I3 fails
        assert not ok, "I3 must fail when children sum != 100"
        assert any("I3" in v for v in violations), (
            f"Expected I3 violation, got: {violations!r}"
        )

    def test_i3_skipped_when_no_children_found(self):
        """No 11x children present → I3 skipped (can't compute)."""
        rows = [
            _row("100", 50_000),
            _row("280", 80_000),
            _row("440", 80_000),
        ]
        ok, reason, violations = check_bs_accounting_identities(rows)
        assert not any("I3" in v for v in violations), (
            "I3 must be skipped when no children present"
        )


# ===========================================================================
# I4: non_current_assets (200) == Σ(210, 220, 230, 240, 250, 260)
# ===========================================================================

class TestIdentityI4:

    def test_i4_passes_when_children_sum_equals_200(self):
        """Σ(210+220+230+240+250+260) == 200 → I4 passes."""
        rows = [
            _row("200", 60_000),
            _row("210", 10_000),
            _row("220", 20_000),
            _row("230", 10_000),
            _row("240", 10_000),
            _row("250", 5_000),
            _row("260", 5_000),   # sum = 60_000 == 200
            _row("280", 110_000),
            _row("440", 110_000),
        ]
        ok, reason, violations = check_bs_accounting_identities(rows)
        assert not any("I4" in v for v in violations), (
            f"I4 must pass: violations={violations!r}"
        )

    def test_i4_fails_when_children_dont_sum_to_200(self):
        """Children sum != 200 (>1%) → I4 fails."""
        rows = [
            _row("200", 60_000),
            _row("210", 10_000),
            _row("220", 20_000),  # sum = 30_000 vs 60_000 → 50% error
            _row("280", 110_000),
            _row("440", 110_000),
        ]
        ok, reason, violations = check_bs_accounting_identities(rows)
        assert not ok, "I4 must fail when children sum != 200"
        assert any("I4" in v for v in violations), (
            f"Expected I4 violation, got: {violations!r}"
        )


# ===========================================================================
# Multiple violations
# ===========================================================================

class TestMultipleViolations:

    def test_all_four_identities_can_fail_simultaneously(self):
        """
        A fully corrupt unit can trigger all four identities simultaneously.
        Verifies the gate collects all violations, not just the first one.
        """
        rows = [
            _row("100", 50_000),
            _row("110", 10_000),   # I3: 10k != 50k
            _row("200", 60_000),
            _row("210", 10_000),   # I4: 10k != 60k
            _row("280", 110_000),
            _row("300", 55_000),   # I2: 55k + 40k = 95k != 120k
            _row("400", 40_000),
            _row("440", 120_000),  # I1: 110k != 120k
        ]
        ok, reason, violations = check_bs_accounting_identities(rows)
        assert not ok
        # At least I1 and I2 should fire; I3/I4 depend on child sum computation
        assert len(violations) >= 2, (
            f"Expected at least 2 violations, got {len(violations)}: {violations!r}"
        )

    def test_violation_reason_contains_delta(self):
        """Each violation string must include the delta for triage."""
        rows = [
            _row("100", 50_000),
            _row("280", 100_000),
            _row("300", 60_000),
            _row("400", 40_000),
            _row("440", 95_000),  # I1 fails: delta = 5_000
        ]
        ok, reason, violations = check_bs_accounting_identities(rows)
        assert not ok
        i1_viol = next((v for v in violations if "I1" in v), None)
        assert i1_viol is not None
        assert "delta=" in i1_viol, (
            f"Violation string must include delta=: {i1_viol!r}"
        )


# ===========================================================================
# Skip conditions
# ===========================================================================

class TestSkipConditions:

    def test_empty_rows_skipped(self):
        """Empty rows → skip gracefully."""
        ok, reason, violations = check_bs_accounting_identities([])
        assert ok
        assert "skipped" in reason
        assert violations == []

    def test_fewer_than_3_codes_skipped(self):
        """< 3 distinct 3-digit codes → skip (not enough structure)."""
        rows = [_row("100", 50_000), _row("440", 50_000)]
        ok, reason, violations = check_bs_accounting_identities(rows)
        assert ok
        assert "skipped" in reason

    def test_no_3digit_codes_skipped(self):
        """No 3-digit codes (e.g. IS codes only) → skip."""
        rows = [
            {"code": "10", "label": "Revenue", "values": ["50000"], "page": 1},
            {"code": "60", "label": "Net profit", "values": ["5000"], "page": 2},
        ]
        ok, reason, violations = check_bs_accounting_identities(rows)
        assert ok
        assert "skipped" in reason

    def test_none_codes_skipped(self):
        """All None codes → skip."""
        rows = [
            {"code": None, "label": "A", "values": ["100"], "page": 1},
            {"code": None, "label": "B", "values": ["200"], "page": 1},
        ]
        ok, reason, violations = check_bs_accounting_identities(rows)
        assert ok
        assert violations == []


# ===========================================================================
# Gate-first pattern: vision escalation proof
# ===========================================================================

class TestVisionEscalationProof:
    """
    Proves the gate-first, vision-on-failure-only pattern:
    1. Gate (a) fails for a unit with identity violations.
    2. The caller emits needs_vision_verify=True + page_numbers.
    3. Gate (a) passes for a balanced unit → no vision needed.
    """

    def _make_rows(self, total_assets, liabilities, equity) -> list:
        return [
            _row("100", total_assets * 0.4, page=3),
            _row("110", total_assets * 0.2, page=3),
            _row("120", total_assets * 0.2, page=3),
            _row("200", total_assets * 0.6, page=4),
            _row("280", total_assets, page=4),
            _row("300", liabilities, page=5),
            _row("400", equity, page=6),
            _row("440", total_assets, page=6),
        ]

    def test_balanced_unit_needs_no_vision(self):
        """Perfectly balanced BS → gate passes → no vision escalation."""
        rows = self._make_rows(
            total_assets=100_000, liabilities=60_000, equity=40_000
        )
        ok, reason, violations = check_bs_accounting_identities(rows)
        needs_vision = not ok
        assert not needs_vision, (
            f"Balanced BS must not trigger vision. violations={violations!r}"
        )

    def test_misbalanced_unit_triggers_vision(self):
        """5% balance mismatch → gate fails → needs_vision_verify must be set."""
        rows = self._make_rows(
            total_assets=100_000,
            liabilities=70_000,  # 70k + 40k = 110k → 10% mismatch vs 440=100k
            equity=40_000,
        )
        ok, reason, violations = check_bs_accounting_identities(rows)
        needs_vision = not ok  # caller sets this flag
        assert needs_vision, (
            f"Misbalanced BS must trigger vision escalation. reason={reason!r}"
        )
        assert violations, "At least one violation must be emitted"
