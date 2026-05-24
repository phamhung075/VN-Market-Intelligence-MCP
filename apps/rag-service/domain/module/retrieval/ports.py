"""
retrieval/ports.py — Protocol-based port definitions for the retrieval module.

Design decisions:
  - Protocol (not ABC): structural typing, not nominal. Any object with the
    correct method signatures satisfies the port — no explicit inheritance needed.
  - Fence-B: zero imports from infrastructure/, application/, or interface/.
  - Async ports: both operations are I/O-bound (network/disk) in production.
    In tests, AsyncMock satisfies the protocol without any infrastructure import.

Ports:
  EmbedderModulePort  — produce a 384-dim embedding vector from raw text.
  VectorSearchPort    — run ANN search and return raw result dicts with distance.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class EmbedderModulePort(Protocol):
    """
    Port for a text embedder that produces a fixed-dim float vector.

    Production implementation: SentenceTransformersEmbedder (infrastructure layer).
    Test implementation: AsyncMock returning a pre-baked list[float].

    The retrieval module never imports the infrastructure adapter directly —
    it only references this Protocol.
    """

    async def embed(self, text: str) -> list[float]:
        """
        Embed text and return a flat float vector.

        Args:
            text: raw query string (Vietnamese or English)

        Returns:
            list[float] of fixed dimensionality (e.g. 384 for MiniLM-L12)
        """
        ...


@runtime_checkable
class VectorSearchPort(Protocol):
    """
    Port for an ANN vector similarity search backend.

    Production implementation: LanceDBVectorStore (infrastructure layer).
    Test implementation: AsyncMock returning pre-baked list[dict].

    Each dict in the returned list must contain at minimum:
        id           (str)   — unique entry identifier
        distance     (float) — L2 distance from query vector (lower = more similar)
        created_at   (str)   — ISO 8601 timestamp string

    Optional keys: level, title, summary, tags, action_code.
    """

    async def search(
        self,
        vector: list[float],
        limit: int,
    ) -> list[dict]:
        """
        Search for the `limit` nearest vectors to `vector`.

        Args:
            vector: query embedding (flat list[float])
            limit:  maximum number of raw candidates to return

        Returns:
            list of result dicts, each with at minimum {id, distance, created_at}
        """
        ...
