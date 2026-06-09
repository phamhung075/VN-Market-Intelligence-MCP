"""
Unit tests — domain/primitives/bctc_code_whitelist/primitive.py (GATE-VISION)

Gate (b): code-whitelist gate — every stored Mã số must be in the fixed
B01-DN/HN code set. OCR digit errors (3↔8, 1↔4 confusion) produce codes
outside this set; the gate flags those rows for vision escalation.

Proven from FPT Q1-2026 OCR errors:
    135 → 185  (1↔8 and 3→8 confusion)
    136 → 186
    16  → 46   (1→4 confusion)
    17  → 47
    61  → 62   (adjacent digit drift)

All tests: zero I/O, zero Tesseract, zero DB. Pure function tests.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest
from domain.primitives.bctc_code_whitelist.primitive import (
    B01_DN_BALANCE_SHEET_CODES,
    B01_DN_INCOME_STATEMENT_CODES,
    B01_HN_BALANCE_SHEET_CODES,
    check_code_whitelist,
)


# ===========================================================================
# Helpers
# ===========================================================================

def _row(code, page=1):
    return {"code": code, "label": "Some label", "values": ["12345"], "page": page}


# ===========================================================================
# Whitelist content sanity
# ===========================================================================

class TestWhitelistSanity:
    """Verify the whitelist constant contains the expected canonical codes."""

    def test_anchor_codes_in_b01_dn(self):
        """Key anchor codes for the balance-sheet invariants must be present."""
        for code in ["100", "200", "270", "280", "300", "400", "440"]:
            assert code in B01_DN_BALANCE_SHEET_CODES, (
                f"Anchor code {code!r} must be in B01_DN_BALANCE_SHEET_CODES"
            )

    def test_child_codes_in_b01_dn(self):
        """Section children referenced by identity gates must be present."""
        for code in ["110", "120", "130", "140", "150",   # current-asset children
                     "210", "220", "230", "240", "250"]:  # non-current children
            assert code in B01_DN_BALANCE_SHEET_CODES, (
                f"Child code {code!r} must be in B01_DN_BALANCE_SHEET_CODES"
            )

    def test_equity_suffix_codes_in_whitelist(self):
        """FPT-specific letter-suffix equity codes must be in the whitelist."""
        for code in ["411a", "411b", "420a", "420b"]:
            assert code in B01_DN_BALANCE_SHEET_CODES, (
                f"Letter-suffix code {code!r} must be in B01_DN_BALANCE_SHEET_CODES"
            )

    def test_income_statement_anchor_codes(self):
        """Key income-statement codes must be present in B01_DN_IS set."""
        for code in ["10", "20", "30", "50", "60"]:
            assert code in B01_DN_INCOME_STATEMENT_CODES, (
                f"IS anchor code {code!r} must be in B01_DN_INCOME_STATEMENT_CODES"
            )

    def test_b01_hn_equals_b01_dn(self):
        """B01-HN and B01-DN have the same code set (same Circular 200/2014)."""
        assert B01_HN_BALANCE_SHEET_CODES == B01_DN_BALANCE_SHEET_CODES

    def test_ocr_error_codes_not_in_whitelist(self):
        """FPT Q1-2026 OCR corruption codes must NOT appear in the whitelist."""
        ocr_errors = ["185", "186", "46", "47"]  # known OCR corruptions
        for code in ocr_errors:
            assert code not in B01_DN_BALANCE_SHEET_CODES, (
                f"OCR corruption code {code!r} must NOT be in B01_DN_BALANCE_SHEET_CODES"
            )


# ===========================================================================
# check_code_whitelist — basic pass/fail
# ===========================================================================

class TestCheckCodeWhitelist:

    def test_all_valid_codes_pass(self):
        """All standard B01-DN codes → pass."""
        rows = [
            _row("100"), _row("110"), _row("200"), _row("300"), _row("400"), _row("440"),
        ]
        ok, reason, flagged = check_code_whitelist(rows, template="B01_DN")
        assert ok, f"Expected pass, got reason={reason!r}"
        assert reason == ""
        assert flagged == []

    def test_ocr_corruption_code_135_to_185_fails(self):
        """
        FPT Q1-2026: code 135 OCR'd as 185.
        185 is NOT in the B01-DN whitelist → gate fails, 185 flagged.
        """
        rows = [
            _row("100"), _row("110"), _row("120"), _row("130"),
            _row("185"),  # OCR error: should be 135
            _row("140"),
        ]
        ok, reason, flagged = check_code_whitelist(rows, template="B01_DN")
        assert not ok, "185 is not in whitelist — gate must fail"
        assert "185" in flagged
        assert "code_whitelist_fail" in reason
        assert "invalid_count=1" in reason

    def test_multiple_ocr_errors_flagged(self):
        """All four known FPT Q1-2026 OCR corruption codes must be flagged."""
        rows = [
            _row("100"), _row("185"), _row("186"), _row("46"), _row("47"),
            _row("200"), _row("300"), _row("400"), _row("440"),
        ]
        ok, reason, flagged = check_code_whitelist(rows, template="B01_DN")
        assert not ok
        for bad_code in ["185", "186", "46", "47"]:
            assert bad_code in flagged, f"Expected {bad_code!r} in flagged={flagged!r}"
        assert "invalid_count=4" in reason

    def test_none_code_rows_ignored(self):
        """Rows with None code are skipped — they are not OCR corruption signals."""
        rows = [
            {"code": None, "label": "Header row", "values": [""], "page": 1},
            _row("100"),
            _row("440"),
        ]
        ok, reason, flagged = check_code_whitelist(rows, template="B01_DN")
        assert ok, f"None codes should be ignored, got reason={reason!r}"
        assert flagged == []

    def test_empty_code_rows_ignored(self):
        """Rows with empty string code are skipped."""
        rows = [
            {"code": "", "label": "Empty code row", "values": ["100"], "page": 1},
            _row("270"),
        ]
        ok, reason, flagged = check_code_whitelist(rows, template="B01_DN")
        assert ok, f"Empty codes should be ignored"
        assert flagged == []

    def test_suffix_code_411a_passes(self):
        """Letter-suffix code 411a (FPT equity sub-code) must pass."""
        rows = [_row("411a"), _row("411b"), _row("420a"), _row("420b")]
        ok, reason, flagged = check_code_whitelist(rows, template="B01_DN")
        assert ok, f"FPT suffix codes must pass, got reason={reason!r}"
        assert flagged == []

    def test_empty_rows_skipped(self):
        """Empty row list → skip (no codes to check)."""
        ok, reason, flagged = check_code_whitelist([], template="B01_DN")
        assert ok
        assert "skipped" in reason
        assert flagged == []

    def test_no_codes_in_rows_skipped(self):
        """All None/empty codes → skip."""
        rows = [
            {"code": None, "label": "A", "values": ["1"], "page": 1},
            {"code": "", "label": "B", "values": ["2"], "page": 1},
        ]
        ok, reason, flagged = check_code_whitelist(rows, template="B01_DN")
        assert ok
        assert "skipped" in reason

    def test_unknown_template_skipped(self):
        """Unknown template name → skip gracefully (no crash, no false-fail)."""
        rows = [_row("100"), _row("999")]  # 999 is not in any whitelist
        ok, reason, flagged = check_code_whitelist(rows, template="UNKNOWN_TEMPLATE")
        assert ok
        assert "skipped" in reason
        assert flagged == []

    def test_reason_contains_sample_codes(self):
        """Fail reason must include the first invalid codes for triage."""
        rows = [_row("185"), _row("186")]
        ok, reason, flagged = check_code_whitelist(rows, template="B01_DN")
        assert not ok
        # The reason should include the flagged codes as a sample
        assert "185" in reason or "186" in reason

    def test_income_statement_template(self):
        """IS codes pass against B01_DN_IS template but fail against B01_DN."""
        is_rows = [_row("10"), _row("20"), _row("60")]
        ok_is, _, _ = check_code_whitelist(is_rows, template="B01_DN_IS")
        assert ok_is, "IS codes must pass against B01_DN_IS template"

        # 10, 20, 60 are NOT in balance sheet whitelist
        ok_bs, _, flagged_bs = check_code_whitelist(is_rows, template="B01_DN")
        assert not ok_bs, "IS codes should fail against balance sheet template"
        for c in ["10", "20", "60"]:
            assert c in flagged_bs

    def test_code_whitespace_stripped(self):
        """Codes with surrounding whitespace are normalised before lookup."""
        rows = [{"code": "  100  ", "label": "A", "values": ["1"], "page": 1}]
        ok, reason, flagged = check_code_whitelist(rows, template="B01_DN")
        assert ok, f"Whitespace-padded code should still pass: {reason!r}"

    def test_flagged_codes_deduplicated(self):
        """Duplicate invalid codes appear only once in the flagged list."""
        rows = [_row("185"), _row("185"), _row("185")]  # same bad code 3 times
        ok, reason, flagged = check_code_whitelist(rows, template="B01_DN")
        assert not ok
        assert flagged.count("185") == 1, "Duplicate invalid codes must be deduplicated"

    def test_b01_hn_template_same_result(self):
        """B01_HN template accepts the same set as B01_DN."""
        rows = [_row("100"), _row("270"), _row("300"), _row("400"), _row("440")]
        ok_dn, _, _ = check_code_whitelist(rows, template="B01_DN")
        ok_hn, _, _ = check_code_whitelist(rows, template="B01_HN")
        assert ok_dn == ok_hn, "B01_DN and B01_HN must produce the same result"


# ===========================================================================
# Integration: gate-first scenario
# ===========================================================================

class TestGateFirstScenario:
    """
    Simulates the gate-first, vision-on-failure-only pattern.

    Workflow:
        1. Run code whitelist gate (0 tokens).
        2. If pass → page trusted, no vision needed.
        3. If fail → emit needs_vision_verify=True + flagged pages.
        4. Vision arbiter renders ONLY the flagged pages.
    """

    def test_clean_page_trusted_without_vision(self):
        """All valid codes → gate passes → no vision needed."""
        rows = [
            _row("100", page=3), _row("110", page=3), _row("120", page=3),
            _row("130", page=3), _row("200", page=4), _row("300", page=5),
            _row("400", page=6), _row("440", page=6),
        ]
        ok, _, flagged = check_code_whitelist(rows, template="B01_DN")
        assert ok
        needs_vision = not ok
        assert not needs_vision, "Clean pages must not trigger vision"

    def test_corrupted_code_triggers_vision_escalation(self):
        """OCR corruption code → gate fails → needs_vision_verify=True must be set."""
        rows = [
            _row("100", page=3), _row("185", page=3),  # 185 = corrupted 135
            _row("200", page=4), _row("300", page=5),
        ]
        ok, reason, flagged = check_code_whitelist(rows, template="B01_DN")
        assert not ok
        needs_vision = not ok  # caller sets this flag
        assert needs_vision, "Corrupted code must trigger vision escalation"
        assert "185" in flagged
        # Caller would emit: VisionVerifyMarker(page_numbers=[3], ...)
        # We verify the data needed to construct the marker is present
        assert len(flagged) >= 1

    def test_pages_with_no_corruption_not_flagged(self):
        """
        Pages 4+ are clean even though page 3 has a corrupted code.
        The gate correctly identifies WHICH codes are wrong (page 3),
        allowing vision to target only page 3.
        """
        page3_rows = [_row("185", page=3)]   # corrupted
        page4_rows = [_row("200", page=4)]   # clean
        page5_rows = [_row("300", page=5)]   # clean

        ok3, _, flagged3 = check_code_whitelist(page3_rows, template="B01_DN")
        ok4, _, flagged4 = check_code_whitelist(page4_rows, template="B01_DN")
        ok5, _, flagged5 = check_code_whitelist(page5_rows, template="B01_DN")

        assert not ok3, "Page 3 with corrupted code must fail"
        assert ok4, "Page 4 with valid code must pass"
        assert ok5, "Page 5 with valid code must pass"
        assert flagged3 == ["185"]
        assert flagged4 == []
        assert flagged5 == []
