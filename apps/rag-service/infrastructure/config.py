"""
Infrastructure — Configuration loaded from environment variables.

All env-var reads happen here so the rest of the app is env-agnostic.
"""

import os
from dataclasses import dataclass


@dataclass
class Config:
    lancedb_path: str
    db_path: str
    embedding_model: str
    embedding_cache_dir: str
    host: str
    port: int
    log_level: str
    embedder_idle_unload_minutes: int
    lancedb_index_cache_mb: int
    lancedb_metadata_cache_mb: int
    lancedb_compact_retention_hours: float

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            lancedb_path=os.environ.get("LANCEDB_PATH", "./data/lancedb"),
            db_path=os.environ.get("DB_PATH", "./data/rag_service.db"),
            embedding_model=os.environ.get(
                "EMBEDDING_MODEL",
                "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
            ),
            embedding_cache_dir=os.environ.get(
                "EMBEDDING_CACHE_DIR", "./data/models"
            ),
            host=os.environ.get("HOST", "0.0.0.0"),
            port=int(os.environ.get("PORT", "5002")),
            log_level=os.environ.get("LOG_LEVEL", "INFO"),
            # FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH: idle-unload threshold, minutes.
            # Never hardcode — config, same pattern as EMBEDDING_CACHE_DIR/LOG_LEVEL.
            embedder_idle_unload_minutes=int(
                os.environ.get("EMBEDDER_IDLE_UNLOAD_MINUTES", "15")
            ),
            # FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS
            # (2026-08-14, in-process profile attribution): lancedb.connect_async()
            # with no explicit `session=` builds an INTERNAL DEFAULT Session sized
            # via Session.default() -- confirmed live (lancedb 0.37.1) at 6 GiB
            # index cache + 1 GiB metadata cache, i.e. a 7 GiB native (Rust-side,
            # non-glibc, non-PyArrow-pool) LRU ceiling that never gets remotely
            # close to full inside this container's 1 GiB total budget -- so in
            # practice it behaves as UNBOUNDED growth: every unique index page /
            # dataset-version manifest read by insert()/search()/hybrid_search()/
            # compact() gets cached and is never evicted before the container OOMs.
            # This is invisible to malloc_trim (glibc-only), tracemalloc (Python
            # heap only) and pyarrow's own memory pool (a completely separate
            # native allocator) -- see docs/architecture-briefs/
            # 2026-08-14-fix-rag-lancedb-session-cache-unbounded.md for the full
            # in-process attribution (tracemalloc/gc-census/pyarrow-pool all flat
            # while RSS climbed ~120MB over 140 ops under real 4:1 insert:search
            # production traffic mix). Sized to fit the corpus's on-disk index
            # footprint (~136MB at ~30k rows) inside a fraction of the container's
            # 1 GiB cap, leaving headroom for the ~400-700MB warm embedding model.
            lancedb_index_cache_mb=int(
                os.environ.get("LANCEDB_INDEX_CACHE_MB", "96")
            ),
            lancedb_metadata_cache_mb=int(
                os.environ.get("LANCEDB_METADATA_CACHE_MB", "32")
            ),
            # FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS
            # (2026-08-14): see infrastructure/repositories.py's _COMPACT_RETENTION
            # module comment for the measured evidence (422MB / 4170 stale
            # versions pruned by a short retention window that the prior 2-day
            # default never reached inside this container's real uptime).
            lancedb_compact_retention_hours=float(
                os.environ.get("LANCEDB_COMPACT_RETENTION_HOURS", "1")
            ),
        )
