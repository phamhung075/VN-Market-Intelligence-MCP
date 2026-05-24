"""
domain/primitive/relevance_threshold_gate/relevance_threshold_gate.py

Pure domain primitive: filter search results by distance threshold.

Extracted from domain/services.py filter_by_max_distance().
Fence-A (binding): stdlib imports only — zero application/, infrastructure/, interface/.
"""
from typing import Any


def gate(results: list[dict[str, Any]], max_distance: float) -> list[dict[str, Any]]:
    """
    Filter search results by max_distance threshold.

    A result passes if result["distance"] <= max_distance (INCLUSIVE boundary).
    Order of results is preserved. Empty list is a valid honest result.

    Args:
        results:      list of result dicts; each must have a "distance" float field.
        max_distance: upper bound (inclusive) on the L2 distance.

    Returns:
        Filtered list preserving original order.
    """
    return [r for r in results if float(r.get("distance", float("inf"))) <= max_distance]
