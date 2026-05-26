"""
Unit tests — domain/primitives/market_hours/primitive.py (PEK-INTEGRATE)

Tests is_vn_market_open_utc() boundary cases per REQ-PEK-11 / AC-PEK-NEW-1.

All 5 boundary cases from the brief (hard constraints, non-negotiable):
    Mon 02:00 UTC → open  (True)
    Mon 01:59 UTC → closed (False)
    Sat 03:00 UTC → closed (False)
    Fri 08:59 UTC → open  (True)
    Fri 09:00 UTC → closed (False)

DDD: pure domain function — zero I/O, zero DB, zero network, zero creds.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from datetime import datetime, timezone
from domain.primitives.market_hours.primitive import is_vn_market_open_utc


def _utc(year: int, month: int, day: int, hour: int, minute: int = 0) -> datetime:
    """Build a timezone-aware UTC datetime for testing."""
    return datetime(year, month, day, hour, minute, 0, tzinfo=timezone.utc)


class TestIsVnMarketOpenUtc:
    """
    Boundary tests per architect brief §4.2 and REQ-PEK-11 AC-PEK-NEW-1.

    VN HOSE UTC window: Mon–Fri 02:00–08:59 UTC (= 09:00–15:59 ICT/UTC+7).
    """

    def test_monday_0200_utc_is_open(self):
        """
        Mon 02:00 UTC = market OPEN.
        Boundary: exactly at the open edge.
        """
        # 2026-06-01 is a Monday
        now = _utc(2026, 6, 1, 2, 0)
        assert is_vn_market_open_utc(now) is True, (
            "Mon 02:00 UTC should be market OPEN"
        )

    def test_monday_0159_utc_is_closed(self):
        """
        Mon 01:59 UTC = market CLOSED.
        Boundary: one minute before the open edge.
        """
        now = _utc(2026, 6, 1, 1, 59)
        assert is_vn_market_open_utc(now) is False, (
            "Mon 01:59 UTC should be market CLOSED (before open)"
        )

    def test_saturday_0300_utc_is_closed(self):
        """
        Sat 03:00 UTC = market CLOSED (weekend).
        Time falls within 02:00-08:59 but day is Saturday.
        """
        # 2026-06-06 is a Saturday
        now = _utc(2026, 6, 6, 3, 0)
        assert is_vn_market_open_utc(now) is False, (
            "Sat 03:00 UTC should be market CLOSED (weekend)"
        )

    def test_friday_0859_utc_is_open(self):
        """
        Fri 08:59 UTC = market OPEN.
        Boundary: last minute of the open window.
        """
        # 2026-06-05 is a Friday
        now = _utc(2026, 6, 5, 8, 59)
        assert is_vn_market_open_utc(now) is True, (
            "Fri 08:59 UTC should be market OPEN (within window)"
        )

    def test_friday_0900_utc_is_closed(self):
        """
        Fri 09:00 UTC = market CLOSED.
        Boundary: exactly one hour after the close edge.
        h=9 is outside the 02..08 inclusive range.
        """
        now = _utc(2026, 6, 5, 9, 0)
        assert is_vn_market_open_utc(now) is False, (
            "Fri 09:00 UTC should be market CLOSED (after session)"
        )

    # Additional coverage tests

    def test_sunday_is_closed(self):
        """Sunday is always closed (weekend)."""
        # 2026-06-07 is a Sunday
        now = _utc(2026, 6, 7, 5, 0)
        assert is_vn_market_open_utc(now) is False

    def test_wednesday_midday_utc_is_closed(self):
        """Wed 12:00 UTC = well outside market hours (h=12 > 8)."""
        # 2026-06-03 is a Wednesday
        now = _utc(2026, 6, 3, 12, 0)
        assert is_vn_market_open_utc(now) is False

    def test_tuesday_0500_utc_is_open(self):
        """Tue 05:00 UTC = market OPEN (mid-session)."""
        # 2026-06-02 is a Tuesday
        now = _utc(2026, 6, 2, 5, 0)
        assert is_vn_market_open_utc(now) is True

    def test_default_now_no_error(self):
        """Calling with no argument (uses datetime.now(utc)) must not raise."""
        result = is_vn_market_open_utc()
        assert isinstance(result, bool)

    def test_monday_0800_utc_is_open(self):
        """Mon 08:00 UTC = last full hour inside the window."""
        now = _utc(2026, 6, 1, 8, 0)
        assert is_vn_market_open_utc(now) is True

    def test_friday_0100_utc_is_closed(self):
        """Fri 01:00 UTC = before open (deep overnight VN)."""
        now = _utc(2026, 6, 5, 1, 0)
        assert is_vn_market_open_utc(now) is False

    def test_thursday_2300_utc_is_closed(self):
        """Thu 23:00 UTC = late night, well outside session."""
        # 2026-06-04 is a Thursday
        now = _utc(2026, 6, 4, 23, 0)
        assert is_vn_market_open_utc(now) is False
