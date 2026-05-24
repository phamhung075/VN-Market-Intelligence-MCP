"""
domain/primitive/temporal_decay_scorer/temporal_decay_scorer.py

Pure domain primitive: apply temporal decay to a similarity score.

Extracted from domain/services.py compute_recency_score() + apply_temporal_decay().

R-2 (CRITICAL — determinism gate): `now` MUST be a parameter so scenario timestamps
are time-stable. Passing `now=None` in production defaults to datetime.now(tz=utc).
In scenarios, pass a fixed datetime parsed from `now_iso` in the scenario JSON.

Fence-A (binding): stdlib imports only (datetime, math, typing) — zero
application/, infrastructure/, or interface/ imports.
"""

import math
from datetime import datetime, timezone
from typing import Optional


def score(
    similarity: float,
    created_at_iso: str,
    half_life_days: float,
    now: Optional[datetime] = None,
    now_iso: Optional[str] = None,
) -> float:
    """
    Apply temporal decay to a similarity score.

    Formula:
        age_hours       = max(0, (now - created_at).total_seconds() / 3600)
        half_life_hours = half_life_days * 24
        decay_factor    = 0.5 ^ (age_hours / half_life_hours)
        result          = similarity * decay_factor

    A document created right now (age=0) returns similarity * 1.0.
    A document 7 days old with half_life_days=7 returns similarity * 0.5.
    A document 14 days old with half_life_days=7 returns similarity * 0.25.

    Future dates (created_at > now): treated as age=0 (score = similarity).
    Invalid timestamp: treated as infinitely old (score -> 0.0).

    Args:
        similarity:       cosine similarity in [0.0, 1.0].
        created_at_iso:   ISO 8601 timestamp string (e.g. "2026-05-10T00:00:00Z").
        half_life_days:   decay half-life in days.
        now:              reference datetime for age computation.
                          If None, defaults to datetime.now(tz=timezone.utc).
                          In scenarios: inject a fixed datetime (R-2 determinism gate).
        now_iso:          ISO string alternative to `now` for scenario JSON injection.
                          If provided, overrides `now`. Parsed internally.
                          Use in scenario JSON: {"now_iso": "2026-05-24T00:00:00Z"}.

    Returns:
        float in [0.0, 1.0]: similarity weighted by exponential decay.
    """
    # Resolve `now` — now_iso (scenario injection) takes precedence over now param
    if now_iso is not None:
        _now = datetime.fromisoformat(now_iso.replace("Z", "+00:00"))
        if _now.tzinfo is None:
            _now = _now.replace(tzinfo=timezone.utc)
    elif now is not None:
        _now = now
    else:
        _now = datetime.now(tz=timezone.utc)

    try:
        created_at = datetime.fromisoformat(created_at_iso.replace("Z", "+00:00"))
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        # Future dates treated as age=0 (score = similarity, no penalisation)
        age_hours = max(0.0, (_now - created_at).total_seconds() / 3600.0)
    except (ValueError, TypeError):
        # Invalid timestamp → treat as infinitely old → score approaches 0
        age_hours = float("inf")

    half_life_hours = half_life_days * 24.0
    if half_life_hours <= 0.0 or not math.isfinite(age_hours):
        decay_factor = 0.0
    else:
        decay_factor = math.pow(0.5, age_hours / half_life_hours)

    return similarity * decay_factor
