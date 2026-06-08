"""
Application — SearchUseCase and IndexUseCase.

Orchestrates domain services and ports.
Application layer: imports domain/, receives injected infrastructure ports.
No HTTP or DB knowledge here — only orchestration.
"""

from datetime import datetime, timezone

from application.dtos import (
    SearchRequest,
    SearchResponse,
    SearchResultDTO,
    IndexRequest,
    IndexResponse,
)
from domain.models import AnalysisEntry
from domain.repositories import VectorStorePort, EmbedderPort
from domain.services import SearchService
from domain.errors import SearchError, IndexError
from domain.primitive.context_window_packer.context_window_packer import pack as _pack_context


class SearchUseCase:
    """
    Application use case: embed query, search vector store, apply temporal decay.

    Injection points: vector_store, embedder, search_service
    """

    def __init__(
        self,
        vector_store: VectorStorePort,
        embedder: EmbedderPort,
        search_service: SearchService,
    ) -> None:
        self.vector_store = vector_store
        self.embedder = embedder
        self.search_service = search_service

    async def execute(self, request: SearchRequest) -> SearchResponse:
        """
        High-level orchestration:
        1. Embed query text.
        2. Search vector store (optionally filtered by level/action_code).
        3. Apply distance filter + temporal decay ranking.
        4. Map domain results → DTOs.

        Raises SearchError on failure.
        """
        try:
            query_vector = await self.embedder.embed(request.query)

            # DFR-P3: branch on hybrid flag.
            # hybrid=False (default) → vector-only path (unchanged, zero regression).
            # hybrid=True → FTS + vector RRF hybrid path via LanceDB RRFReranker.
            # Temporal decay applies on BOTH paths.
            filter_kwargs = dict(
                level_filter=request.level,
                action_code_filter=request.action_code,
                ticker_filter=request.ticker,
                sector_filter=request.sector,
                source_domain_filter=request.source_domain,
                depth_tier_filter=request.depth_tier,
                doc_type_filter=request.doc_type,
            )
            if request.hybrid:
                raw_results = await self.vector_store.hybrid_search(
                    query_vector=query_vector,
                    query_text=request.query,
                    limit=request.limit * 4,  # over-fetch for dedup + filter
                    **filter_kwargs,
                )
            else:
                raw_results = await self.vector_store.search(
                    query_vector=query_vector,
                    limit=request.limit * 4,  # over-fetch for dedup + filter
                    **filter_kwargs,
                )

            ranked = self.search_service.rank(
                results=raw_results,
                half_life_days=request.decay_half_life_days,
                max_distance=request.max_distance,
            )

            # Trim to requested limit after ranking
            ranked = ranked[: request.limit]

            dtos = [
                SearchResultDTO(
                    id=r.id,
                    level=r.level,
                    title=r.title,
                    summary=r.summary,
                    tags=r.tags,
                    action_code=r.action_code,
                    created_at=r.created_at,
                    distance=r.distance,
                    recency_score=r.recency_score,
                    # FR-3: Phase 1 metadata propagated to HTTP response
                    ticker=r.ticker,
                    sector=r.sector,
                    source_domain=r.source_domain,
                    depth_tier=r.depth_tier,
                    doc_type=r.doc_type,
                    published_at=r.published_at,
                    confidence=r.confidence,
                    impact_score=r.impact_score,
                )
                for r in ranked
            ]

            return SearchResponse(results=dtos, total=len(dtos))

        except ValueError:
            # FR-3: Let validation errors (invalid depth_tier, doc_type, ticker) propagate
            # as ValueError so the interface layer can return HTTP 400.
            raise
        except Exception as exc:
            raise SearchError(f"Search failed: {exc}") from exc


class IndexUseCase:
    """
    Application use case: embed content and index in vector store.

    Injection points: vector_store, embedder, analysis_repo (optional)
    """

    def __init__(
        self,
        vector_store: VectorStorePort,
        embedder: EmbedderPort,
    ) -> None:
        self.vector_store = vector_store
        self.embedder = embedder

    async def execute(self, request: IndexRequest) -> IndexResponse:
        """
        High-level orchestration:
        1. Build embedding text from title + summary + content + tags.
        2. Embed text.
        3. Create AnalysisEntry entity.
        4. Insert into vector store.

        Raises IndexError on failure.
        """
        try:
            # Build rich embedding text using domain primitive (extracted to context_window_packer).
            # Field order mirrors original _build_embedding_text for vector compatibility:
            # action_code, title, level, tags, content — joined then passed as content to pack().
            ordered_parts = []
            if request.action_code:
                ordered_parts.append(request.action_code)
            if request.title:
                ordered_parts.append(request.title)
            ordered_parts.append(str(request.level))
            if request.tags:
                ordered_parts.append(" ".join(request.tags))
            ordered_parts.append(request.content)

            embedding_text = _pack_context(
                title="",
                content="\n".join(filter(None, ordered_parts)),
                source="",
                max_chars=2000,
            )

            vector = await self.embedder.embed(embedding_text)

            entry = AnalysisEntry(
                id=request.id,
                level=request.level,
                title=request.title or request.content[:100],
                summary=request.summary or request.content[:500],
                tags=request.tags,
                created_at=datetime.now(tz=timezone.utc),
                action_code=request.action_code,
                # FR-2: Phase 1 metadata fields
                ticker=request.ticker,
                sector=request.sector,
                source_domain=request.source_domain,
                depth_tier=request.depth_tier,
                doc_type=request.doc_type,
                published_at=request.published_at,
                confidence=request.confidence,
                impact_score=request.impact_score,
            )

            await self.vector_store.insert(entry, vector)

            return IndexResponse(
                status="ok",
                indexed=1,
                entry_id=request.id,
            )

        except Exception as exc:
            raise IndexError(f"Index failed: {exc}") from exc


# _build_embedding_text() was extracted to domain/primitive/context_window_packer/context_window_packer.py
# (P2-B3 migration). Use _pack_context() imported above.
