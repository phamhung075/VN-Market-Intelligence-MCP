"""
domain/primitive/top_k_selector/top_k_selector.py

Pure domain primitive: return first k results from an ordered list.

Extracted from SearchUseCase.execute() ranked[:request.limit] slice.
Fence-A (binding): stdlib imports only — zero application/, infrastructure/, interface/.
"""
from typing import Any


def select_top_k(results: list[dict[str, Any]], k: int) -> list[dict[str, Any]]:
    """
    Return the first k results from an ordered list.

    The caller is responsible for pre-sorting the list by score.
    Order of results is preserved (no re-sorting performed here).

    Args:
        results: ordered list of result dicts.
        k:       number of results to return.
                 k <= 0 returns [].
                 k > len(results) returns all results (no error).

    Returns:
        Slice of results: results[:k] clamped to valid range.
    """
    if k <= 0:
        return []
    return results[:k]


# Alias for sandbox runner discovery (runner looks for 'select' as candidate entry point)
select = select_top_k
