"""
Domain — Pure domain services for RAG.

Business logic: temporal decay scoring, search ranking, entry validation.
Domain layer: no imports from infrastructure/ or interface/.

All services are pure functions or classes with no I/O side effects.
"""

import math
from datetime import datetime, timezone
from typing import Optional

from domain.models import SearchResult


# ── Temporal Decay ────────────────────────────────────────────────────────

DEFAULT_HALF_LIFE_DAYS: float = 7.0
DEFAULT_MAX_DISTANCE: float = 0.8


def compute_recency_score(
    similarity: float,
    created_at_iso: str,
    half_life_days: float = DEFAULT_HALF_LIFE_DAYS,
) -> float:
    """
    Compute recency-weighted similarity score.

    Formula:
        age_hours       = (now - created_at) / 3600
        half_life_hours = half_life_days * 24
        decay_factor    = 0.5 ^ (age_hours / half_life_hours)
        recency_score   = similarity * decay_factor

    A brand-new entry (age=0) scores: recency_score = similarity * 1.0
    A 7-day-old entry with 7d half-life: recency_score = similarity * 0.5
    A very old entry: recency_score approaches 0

    Args:
        similarity:       cosine similarity in [0.0, 1.0] (1.0 = identical)
        created_at_iso:   ISO 8601 timestamp string
        half_life_days:   half-life in days (default: 7)

    Returns:
        recency_score in [0.0, 1.0]
    """
    try:
        created_at = datetime.fromisoformat(created_at_iso.replace("Z", "+00:00"))
        now = datetime.now(tz=timezone.utc)
        # Ensure both are timezone-aware for comparison
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        age_hours = max(0.0, (now - created_at).total_seconds() / 3600.0)
    except (ValueError, TypeError):
        # Invalid date → treat as very old, minimal score
        age_hours = float("inf")

    half_life_hours = half_life_days * 24.0
    if half_life_hours <= 0 or not math.isfinite(age_hours):
        decay_factor = 0.0
    else:
        decay_factor = math.pow(0.5, age_hours / half_life_hours)

    return similarity * decay_factor


def apply_temporal_decay(
    results: list[SearchResult],
    half_life_days: float = DEFAULT_HALF_LIFE_DAYS,
) -> list[SearchResult]:
    """
    Re-rank search results by recency-weighted score.

    Converts L2 distance to similarity (1 / (1 + distance)), applies decay,
    sets recency_score on each result, then sorts descending (higher = better).

    Args:
        results:         Raw SearchResult list from vector store
        half_life_days:  Half-life in days for decay (default: 7)

    Returns:
        New list sorted descending by recency_score
    """
    if not results:
        return []

    ranked = []
    for r in results:
        # Convert L2 distance to similarity in [0, 1]
        # Using: similarity = 1 / (1 + distance)
        similarity = 1.0 / (1.0 + r.distance)
        score = compute_recency_score(
            similarity=similarity,
            created_at_iso=r.created_at,
            half_life_days=half_life_days,
        )
        ranked.append(SearchResult(
            id=r.id,
            level=r.level,
            title=r.title,
            summary=r.summary,
            tags=r.tags,
            action_code=r.action_code,
            created_at=r.created_at,
            distance=r.distance,
            recency_score=score,
        ))

    return sorted(ranked, key=lambda x: x.recency_score, reverse=True)


def filter_by_max_distance(
    results: list[SearchResult],
    max_distance: float = DEFAULT_MAX_DISTANCE,
) -> list[SearchResult]:
    """Remove results with L2 distance exceeding max_distance."""
    return [r for r in results if r.distance <= max_distance]


class SearchService:
    """
    Pure domain service: applies filtering + temporal decay to raw vector results.

    No I/O. Takes raw SearchResult list and returns ranked list.
    """

    def rank(
        self,
        results: list[SearchResult],
        half_life_days: float = DEFAULT_HALF_LIFE_DAYS,
        max_distance: float = DEFAULT_MAX_DISTANCE,
    ) -> list[SearchResult]:
        """
        Filter by distance then apply temporal decay ranking.

        Steps:
        1. Remove results with distance > max_distance
        2. Apply temporal decay: compute recency_score per result
        3. Sort descending by recency_score

        Returns:
            Ranked + filtered SearchResult list
        """
        filtered = filter_by_max_distance(results, max_distance)
        return apply_temporal_decay(filtered, half_life_days)
