"""
domain/primitives/market_hours/primitive.py — PEK-INTEGRATE

Pure function: is_vn_market_open_utc()

Determines whether a given UTC instant falls within VN HOSE trading hours.

VN HOSE session: 09:00–15:00 ICT (UTC+7) = 02:00–07:59 UTC, Mon–Fri.
HOSE close: 15:00 ICT = 08:00 UTC — the guard LIFTS at 08:00 UTC.

Mirrors isVnMarketHoursUtc() from:
    apps/mcp-server/src/scheduler/vpsProxyWatchdogJob.ts

DDD layer rules (CRITICAL):
    - This module is in the DOMAIN layer — pure function, zero I/O.
    - Zero imports from infrastructure/, application/, interface/.
    - Only Python stdlib (datetime, timezone).
    - Zero BCTC semantic strings, zero network calls, zero DB.

REQ-PEK-11 (market-hours isolation, CRITICAL):
    Layer 2 — runtime HTTP guard:
        POST /pek-extract returns HTTP 503 if this function returns True.
        No model load, no inference during VN market hours.
        AC-PEK-NEW-1: confirmed by ops calling endpoint during 03:00 UTC Monday.

Boundary cases (AC-PEK-NEW-1, unit-tested in __tests__/test_market_hours_guard.py):
    Mon 02:00 UTC → open (True)
    Mon 01:59 UTC → closed (False)
    Sat 03:00 UTC → closed (False)
    Fri 07:59 UTC → open (True)   ← last blocked minute (15:59 ICT)
    Fri 08:00 UTC → closed (False) ← guard lifts exactly at HOSE close (15:00 ICT)
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

# VN HOSE UTC block window: 02:00 to 07:59 inclusive (Mon–Fri).
# HOSE opens  09:00 ICT = 02:00 UTC  → _VN_MARKET_OPEN_UTC_HOUR
# HOSE closes 15:00 ICT = 08:00 UTC  → guard lifts AT 08:00 UTC
#
# Single boundary constant: _VN_MARKET_LAST_BLOCKED_UTC_HOUR = 7
# Meaning: hours 0..7 inside Mon–Fri are blocked; hour 8 and above are allowed.
# The retry_after message in interface/handlers.py derives this same value
# so the enforced window and the human-readable string can never drift.
_VN_MARKET_OPEN_UTC_HOUR: int = 2        # 09:00 ICT — first blocked hour
_VN_MARKET_LAST_BLOCKED_UTC_HOUR: int = 7  # 07:59 ICT last second blocked; 08:00 = allowed


def is_vn_market_open_utc(now: Optional[datetime] = None) -> bool:
    """
    Return True if the given instant falls within VN HOSE trading hours.

    VN HOSE: Mon–Fri 02:00–07:59 UTC (= 09:00–14:59 ICT/UTC+7).
    Guard lifts at 08:00 UTC = 15:00 ICT (HOSE close).
    Outside this window (evenings, nights, weekends): returns False.

    Args:
        now: UTC datetime to test. Defaults to datetime.now(timezone.utc).
             MUST be timezone-aware if provided.

    Returns:
        True  — market is open; extraction must be BLOCKED.
        False — market is closed; extraction may proceed.

    Boundary constant: _VN_MARKET_LAST_BLOCKED_UTC_HOUR = 7
        h <= 7 → blocked (market open); h >= 8 → allowed (market closed).
        The retry_after string in interface/handlers.py uses the SAME boundary
        value (08:00 UTC) so the enforced window and the human message stay in sync.

    DDD: pure function — no I/O, no imports from infra/app/interface.
    """
    if now is None:
        now = datetime.now(timezone.utc)

    # weekday(): Mon=0, Tue=1, ..., Sat=5, Sun=6
    weekday = now.weekday()  # 0=Mon … 6=Sun
    if weekday >= 5:  # Sat (5) or Sun (6) → closed
        return False

    h = now.hour
    return _VN_MARKET_OPEN_UTC_HOUR <= h <= _VN_MARKET_LAST_BLOCKED_UTC_HOUR
