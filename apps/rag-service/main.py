"""RAG Service — composition root. Port: 5002. Business logic lives in domain/ and application/.

P3-A injection seam: create_app(embedder=None, vector_store=None)
  - None (default) -> build REAL adapters from Config (production path, UNCHANGED)
  - Injected       -> use provided fakes (service-tier sandbox; zero model/DB access)
"""

from typing import Optional

from fastapi import FastAPI, APIRouter

from domain.repositories import EmbedderPort, VectorStorePort
from domain.services import SearchService
from application.usecases import SearchUseCase, IndexUseCase
from interface.handlers import register_routes
from app_factory import build_lifespan, add_cors_middleware, build_real_adapters


def create_app(
    embedder: Optional[EmbedderPort] = None,
    vector_store: Optional[VectorStorePort] = None,
) -> FastAPI:
    """Wire config, infrastructure, use cases, and routes. Zero business logic.

    Production: both args None -> real adapters from Config (unchanged behaviour).
    Test/sandbox: inject fake adapters -> zero model load, zero LanceDB, zero network.
    """
    real_embedder, real_vector_store, cfg = build_real_adapters(
        embedder_override=embedder,
        vector_store_override=vector_store,
    )

    search_service = SearchService()
    search_usecase = SearchUseCase(
        vector_store=real_vector_store,
        embedder=real_embedder,
        search_service=search_service,
    )
    index_usecase = IndexUseCase(
        vector_store=real_vector_store,
        embedder=real_embedder,
    )

    app = FastAPI(
        title="RAG Service",
        version="1.0.0",
        description="Vector search + temporal decay ranking for VN Market Intelligence.",
        lifespan=build_lifespan(real_embedder, cfg),
    )

    add_cors_middleware(app)

    router = APIRouter()
    # DFR-P3: pass vector_store so /admin/rebuild-fts can call _build_fts_index()
    # GFD-7: pass embedder so /embed/health can probe model + index
    register_routes(router, search_usecase, index_usecase, vector_store=real_vector_store, embedder=real_embedder)
    app.include_router(router)

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    from infrastructure.config import Config

    cfg = Config.from_env()
    uvicorn.run("main:app", host=cfg.host, port=cfg.port,
                log_level=cfg.log_level.lower(), reload=False)
