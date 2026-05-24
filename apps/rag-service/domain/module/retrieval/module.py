"""
retrieval/module.py — RetrievalModule: composes all 5 primitives via Protocol ports.

Pipeline (Phase 2 full wiring):
  1. Embed query text       via EmbedderModulePort (port — never infra directly)
  2. ANN search             via VectorSearchPort   (port — never infra directly)
  3. context_window_packer  primitive: pack result metadata (title+source+content)
  4. similarity_scorer      primitive: distance -> similarity in [0,1]
  5. relevance_threshold_gate primitive: filter by max_distance threshold
  6. temporal_decay_scorer  primitive: apply exponential decay (now injected)
  7. top_k_selector         primitive: trim to top_k results

Fence-B (binding): ZERO imports from infrastructure/, application/, or interface/.
The only external imports are stdlib + domain.primitive.* (same domain layer).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

# Primitive imports (same domain layer — Fence-B allows domain→domain)
from domain.primitive.similarity_scorer.similarity_scorer import score as _similarity_score
from domain.primitive.relevance_threshold_gate.relevance_threshold_gate import gate as _threshold_gate
from domain.primitive.temporal_decay_scorer.temporal_decay_scorer import score as _temporal_score
from domain.primitive.top_k_selector.top_k_selector import select_top_k as _select_top_k
from domain.primitive.context_window_packer.context_window_packer import pack as _pack

# Port types (structural Protocol — no infra import)
from domain.module.retrieval.ports import EmbedderModulePort, VectorSearchPort


class RetrievalModule:
    """
    Thin composition barrel for the retrieval pipeline.

    Receives pre-computed embedding vectors (EmbedderModulePort) and raw ANN
    results (VectorSearchPort), applies all 5 domain primitives, and returns
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
        Execute the full retrieval pipeline via all 5 domain primitives.

        Args:
            query_text:    raw query string to embed and search
            top_k:         maximum number of results to return
            max_distance:  L2 distance threshold (results beyond this are filtered)
            half_life_days: decay half-life in days for temporal scoring
            now:           fixed datetime for deterministic scoring (None = datetime.now())

        Returns:
            list of result dicts, sorted descending by recency_score.
            Each dict includes: id, distance, similarity, recency_score, packed_text
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

        # Step 3 — context_window_packer: pack result metadata into embedding-ready text
        packed: list[dict] = []
        for result in raw_candidates:
            packed_text = _pack(
                title=str(result.get("title", "")),
                content=str(result.get("summary", result.get("content", ""))),
                source=str(result.get("source", result.get("action_code", ""))),
            )
            packed.append({**result, "packed_text": packed_text})

        # Step 4 — similarity_scorer primitive: distance -> similarity in [0,1]
        scored: list[dict] = []
        for result in packed:
            distance = float(result.get("distance", 1.0))
            try:
                similarity = _similarity_score(distance)
            except ValueError:
                # Negative distance from buggy store — skip entry
                continue
            scored.append({**result, "similarity": similarity})

        # Step 5 — relevance_threshold_gate primitive: filter by max_distance
        gated = _threshold_gate(scored, max_distance)

        if not gated:
            return []

        # Step 6 — temporal_decay_scorer primitive: apply exponential decay
        # now injection (determinism gate): allows tests/sandbox to supply fixed datetime
        _now: datetime = now if now is not None else datetime.now(tz=timezone.utc)

        decayed: list[dict] = []
        for r in gated:
            similarity = r.get("similarity", 0.0)
            created_at_iso: str = r.get("created_at", "")
            recency_score = _temporal_score(
                similarity=similarity,
                created_at_iso=created_at_iso,
                half_life_days=half_life_days,
                now=_now,
            )
            decayed.append({**r, "recency_score": recency_score})

        # Step 7 — top_k_selector primitive: trim to top_k, sorted by recency_score desc
        ranked = sorted(decayed, key=lambda x: x.get("recency_score", 0.0), reverse=True)
        return _select_top_k(ranked, top_k)


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

    Zero infrastructure imports, zero model loading, zero LanceDB.
    Determinism gate: now_iso is a fixed ISO timestamp injected from the scenario.
    All 5 primitives execute against pre-baked fixed inputs — fully deterministic.
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
