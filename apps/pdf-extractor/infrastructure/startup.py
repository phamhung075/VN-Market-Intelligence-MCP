"""
Infrastructure — Startup utilities.

Creates required filesystem directories before the application accepts requests.
Extracted from main.py (P1-A1 composition root shrink) — keeps main.py under 80 logical lines.
"""

import os

from infrastructure.config import Config


def ensure_dirs(cfg: Config) -> None:
    """
    Ensure required storage directories exist on the filesystem.

    Called once at app factory time (inside create_app).
    No-op if directories already exist.
    """
    os.makedirs(cfg.storage_dir, exist_ok=True)
    os.makedirs(os.path.dirname(cfg.db_path) or ".", exist_ok=True)
