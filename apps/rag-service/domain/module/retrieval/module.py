"""
retrieval/module.py — RetrievalModule: composes primitives via Protocol ports.

Pipeline (Phase 1 stub):
  1. Embed query text       via EmbedderModulePort (port — never infra directly)
  2. ANN search             via VectorSearchPort   (port — never infra directly)
  3. similarity_scorer      primitive: distance -> similarity in [0,1]
  4. relevance gate         stub pass-through (relevance_threshold_gate not yet extracted)
  5. temporal decay         stub pass-through (temporal_decay_scorer not yet extracted;
                            datetime.now() injection deferred to Phase 2 primitive extraction)
  6. top-k trim             inline slice (top_k_selector not yet extracted to primitive)

Fence-B (binding): ZERO imports from infrastructure/, application/, or interface/.
The only external imports are stdlib + domain.primitive.* (same domain layer).

AC-6 compliance: P1-C does NOT extract temporal-decay-scorer, relevance-threshold-gate,
top-k-selector, or context-window-packer. Steps 4-6 are stubs / inline logic here.
Extraction of the remaining 4 primitives is Phase 2 bucket-B tasks.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Optional

# Primitive import (same domain layer — Fence-B allows domain→domain)
from domain.primitive.similarity_scorer.similarity_scorer import score as _similarity_score

# Port types (structural Protocol — no infra import)
from domain.module.retrieval.ports import EmbedderModulePort, VectorSearchPort


class RetrievalModule:
    """
    Thin composition barrel for the retrieval pipeline.

    Receives pre-computed embedding vectors (EmbedderModulePort) and raw ANN
    results (VectorSearchPort), applies the primitive pipeline, and returns
    a ranked top-k list of result dicts.

    Constructor injection: ports are injected at build time (composition root).
    Tests inject AsyncMock ports — no infrastructure is loaded in tests.
    """

    def __init__(
        self,
        embedder: EmbedderModulePort,
        vector_search: VectorSearchPort,
    ) -> None:
        self._embedder = embedder
        self._vector_search = vector_search

    async def retrieve(
        self,
        query_text: str,
        top_k: int = 5,
        max_distance: float = 0.8,
        half_life_days: float = 7.0,
        now: Optional[datetime] = None,
    ) -> list[dict]:
        """
        Execute the retrieval pipeline.

        Args:
            query_text:    raw query string to embed and search
            top_k:         maximum number of results to return
            max_distance:  L2 distance threshold (results beyond this are filtered)
            half_life_days: decay half-life in days for temporal scoring
            now:           fixed datetime for deterministic scoring (None = datetime.now())

        Returns:
            list of result dicts, sorted descending by recency_score.
            Each dict includes: id, distance, similarity, recency_score, created_at
            plus any extra fields from the VectorSearchPort.
        """
        # Step 1 — Embed via port (never calls infra directly)
        query_vector: list[float] = await self._embedder.embed(query_text)

        # Step 2 — ANN search via port (never calls LanceDB directly)
        # Request more candidates than top_k to allow downstream filtering
        raw_candidates: list[dict] = await self._vector_search.search(
            vector=query_vector,
            limit=max(top_k * 3, 20),
        )

        if not raw_candidates:
            return []

        # Step 3 — similarity_scorer primitive: distance -> similarity in [0,1]
        scored: list[dict] = []
        for result in raw_candidates:
            distance = float(result.get("distance", 1.0))
            # Fence-A: similarity_scorer is a domain primitive — calling it from
            # a domain module is legal (same layer).
            try:
                similarity = _similarity_score(distance)
            except ValueError:
                # Negative distance from buggy store — skip entry
                continue
            scored.append({**result, "similarity": similarity})

        # Step 4 — relevance threshold gate (stub: inline filter, not yet extracted)
        # Phase 2 will replace this with: relevance_threshold_gate.gate(results, max_distance)
        gated = [r for r in scored if r.get("distance", 1.0) <= max_distance]

        if not gated:
            return []

        # Step 5 — temporal decay scoring (stub: inline, not yet extracted)
        # Phase 2 will replace this with: temporal_decay_scorer.score(similarity, created_at, half_life_days, now)
        # now injection (determinism gate): allows tests to supply fixed datetime
        _now: datetime = now or datetime.now(tz=timezone.utc)

        decayed: list[dict] = []
        for r in gated:
            similarity = r.get("similarity", 0.0)
            created_at_iso: str = r.get("created_at", "")
            recency_score = _compute_recency_score_inline(
                similarity=similarity,
                created_at_iso=created_at_iso,
                half_life_days=half_life_days,
                now=_now,
            )
            decayed.append({**r, "recency_score": recency_score})

        # Step 6 — top-k selector (stub: inline slice, not yet extracted)
        # Phase 2 will replace with: top_k_selector.select(results, top_k)
        ranked = sorted(decayed, key=lambda x: x.get("recency_score", 0.0), reverse=True)
        return ranked[:top_k]


# ── Sandbox entry point ────────────────────────────────────────────────────
# Module-level async function called by the sandbox runner at --tier=module.
# Inputs come from module_golden.json scenario "input" dict.
# Ports are satisfied by lightweight inline classes (no infrastructure).

async def retrieve(
    query_vector: list[float],
    raw_results: list[dict],
    now_iso: str,
    top_k: int = 5,
    max_distance: float = 0.8,
    half_life_days: float = 7.0,
) -> dict:
    """
    Sandbox entry point for the retrieval module.

    Accepts pre-baked inputs from scenario JSON and returns a trace dict
    that the sandbox runner compares against expected_output.

    Protocol-satisfied inline ports:
      - _SandboxEmbedder: returns the pre-computed query_vector directly.
      - _SandboxVectorSearch: returns the pre-baked raw_results directly.

    This means zero infrastructure imports, zero model loading, zero LanceDB.
    Determinism gate: now_iso is a fixed ISO timestamp injected from the scenario.
    """

    class _SandboxEmbedder:
        """Satisfies EmbedderModulePort via pre-baked vector (no model load)."""
        async def embed(self, text: str) -> list[float]:
            return query_vector

    class _SandboxVectorSearch:
        """Satisfies VectorSearchPort via pre-baked raw_results (no LanceDB)."""
        async def search(self, vector: list[float], limit: int) -> list[dict]:
            return raw_results[:limit]

    _now = datetime.fromisoformat(now_iso.replace("Z", "+00:00"))
    if _now.tzinfo is None:
        _now = _now.replace(tzinfo=timezone.utc)

    module = RetrievalModule(
        embedder=_SandboxEmbedder(),
        vector_search=_SandboxVectorSearch(),
    )
    results = await module.retrieve(
        query_text="sandbox-query",
        top_k=top_k,
        max_distance=max_distance,
        half_life_days=half_life_days,
        now=_now,
    )
    return {"top_k_ids": [r["id"] for r in results]}


# ── Inline stub: temporal decay ────────────────────────────────────────────
# This is a TEMPORARY inline implementation duplicating the logic from
# domain/services.py compute_recency_score(). It will be REPLACED in Phase 2
# when temporal_decay_scorer is extracted to domain/primitive/temporal_decay_scorer/.
# The `now` parameter is the determinism injection point (Phase 1 task plan §Execution Notes).

def _compute_recency_score_inline(
    similarity: float,
    created_at_iso: str,
    half_life_days: float,
    now: datetime,
) -> float:
    """Inline recency score stub (extracted to primitive in Phase 2)."""
    try:
        created_at = datetime.fromisoformat(created_at_iso.replace("Z", "+00:00"))
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        age_hours = max(0.0, (now - created_at).total_seconds() / 3600.0)
    except (ValueError, TypeError):
        age_hours = float("inf")

    half_life_hours = half_life_days * 24.0
    if half_life_hours <= 0 or not math.isfinite(age_hours):
        decay_factor = 0.0
    else:
        decay_factor = math.pow(0.5, age_hours / half_life_hours)

    return similarity * decay_factor
