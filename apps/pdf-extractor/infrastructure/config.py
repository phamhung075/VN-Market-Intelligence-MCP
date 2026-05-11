"""
Infrastructure — Configuration loader.

Reads environment variables and provides typed config to all infrastructure adapters.
"""

import os
from dataclasses import dataclass


@dataclass
class Config:
    db_path: str
    storage_dir: str
    host: str
    port: int
    log_level: str

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            db_path=os.getenv("DB_PATH", "/app/data/pdf_extractor.db"),
            storage_dir=os.getenv("STORAGE_DIR", "/app/data/extractions"),
            host=os.getenv("HOST", "0.0.0.0"),
            port=int(os.getenv("PORT", "5001")),
            log_level=os.getenv("LOG_LEVEL", "INFO"),
        )
