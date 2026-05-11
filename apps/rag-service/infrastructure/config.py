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
        )
