"""
Domain — Pure domain services for RAG.

Business logic: temporal decay scoring, search ranking, entry validation.
Domain layer: no imports from infrastructure/ or interface/.

All services are pure functions or classes with no I/O side effects.
"""

from domain.models import SearchResult
from domain.primitive.temporal_decay_scorer.temporal_decay_scorer import score as _decay_score


# ── Temporal Decay ────────────────────────────────────────────────────────

DEFAULT_HALF_LIFE_DAYS: float = 7.0
DEFAULT_MAX_DISTANCE: float = 0.8


def compute_recency_score(
    similarity: float,
    created_at_iso: str,
    half_life_days: float = DEFAULT_HALF_LIFE_DAYS,
) -> float:
    """
    Compatibility shim: delegates to temporal_decay_scorer primitive (P2-B4 extraction).

    Production code and existing tests call this function.
    The primitive accepts an optional `now` for deterministic scenario injection;
    this shim uses the production default (now=None -> datetime.now(tz=utc)).
    """
    return _decay_score(
        similarity=similarity,
        created_at_iso=created_at_iso,
        half_life_days=half_life_days,
    )


def apply_temporal_decay(
    results: list[SearchResult],
    half_life_days: float = DEFAULT_HALF_LIFE_DAYS,
) -> list[SearchResult]:
    """
    Re-rank search results by recency-weighted score.

    Converts L2 distance to similarity (1 / (1 + distance)), applies decay
    via temporal_decay_scorer primitive, sets recency_score on each result,
    then sorts descending (higher = better).

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
        similarity = 1.0 / (1.0 + r.distance)
        # Use primitive (now defaults to datetime.now(tz=utc) in production)
        recency = _decay_score(
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
            recency_score=recency,
            ticker=r.ticker,
            sector=r.sector,
            source_domain=r.source_domain,
            depth_tier=r.depth_tier,
            doc_type=r.doc_type,
            published_at=r.published_at,
            confidence=r.confidence,
            impact_score=r.impact_score,
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
