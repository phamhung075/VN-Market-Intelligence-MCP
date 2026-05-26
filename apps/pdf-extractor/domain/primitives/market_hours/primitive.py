"""
domain/primitives/market_hours/primitive.py — PEK-INTEGRATE

Pure function: is_vn_market_open_utc()

Determines whether a given UTC instant falls within VN HOSE trading hours.

VN HOSE session: 09:00–15:59 ICT (UTC+7) = 02:00–08:59 UTC, Mon–Fri.

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
    Fri 08:59 UTC → open (True)
    Fri 09:00 UTC → closed (False)
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

# VN HOSE UTC window: 02:00 to 08:59 inclusive (Mon–Fri)
# Matches isVnMarketHoursUtc: h >= 2 && h <= 8 (TypeScript reference)
_VN_MARKET_OPEN_UTC_HOUR: int = 2    # 09:00 ICT (UTC+7)
_VN_MARKET_CLOSE_UTC_HOUR: int = 8   # 15:59 ICT (the 08:xx UTC hour is still 15:xx ICT)


def is_vn_market_open_utc(now: Optional[datetime] = None) -> bool:
    """
    Return True if the given instant falls within VN HOSE trading hours.

    VN HOSE: Mon–Fri 02:00–08:59 UTC (= 09:00–15:59 ICT/UTC+7).
    Outside this window (evenings, nights, weekends): returns False.

    Args:
        now: UTC datetime to test. Defaults to datetime.now(timezone.utc).
             MUST be timezone-aware if provided.

    Returns:
        True  — market is open; extraction must be BLOCKED.
        False — market is closed; extraction may proceed.

    Mirrors:
        isVnMarketHoursUtc() in apps/mcp-server/src/scheduler/vpsProxyWatchdogJob.ts
        TypeScript: day===0||day===6 → false; h>=2&&h<=8 → true

    DDD: pure function — no I/O, no imports from infra/app/interface.
    """
    if now is None:
        now = datetime.now(timezone.utc)

    # weekday(): Mon=0, Tue=1, ..., Sat=5, Sun=6
    # TS equivalent: getUTCDay() 0=Sun, 6=Sat → day===0||day===6 → false
    weekday = now.weekday()  # 0=Mon … 6=Sun
    if weekday >= 5:  # Sat (5) or Sun (6) → closed
        return False

    h = now.hour
    return _VN_MARKET_OPEN_UTC_HOUR <= h <= _VN_MARKET_CLOSE_UTC_HOUR
