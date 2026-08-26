"""
infrastructure/pek_extraction_status_repository.py — PEK-EXTRACT durable status.

FIX-PDFX-PEK-EXTRACT-202-ACCEPTED-THEN-SILENTLY-DROPPED-SEMAPHORE-1800S (AC-1):

POST /pek-extract returns 202 and hands the real work to a FastAPI
BackgroundTask (interface/pek_run_helper.py::_run_pek_extract). Before this
fix, a background-task failure (SemaphoreContendedError after the bounded
queue wait elapses, or any other exception from PekEngineAdapter) was ONLY a
logged traceback ("_run_pek_extract: FAILED") — nothing durable or queryable
recorded that an accepted job died. 13 of 45 accepted extractions on
2026-08-26 vanished this way.

This repository is the durable record:
    - interface/routes_pek.py writes status="accepted" before returning 202.
    - interface/pek_run_helper.py writes status="done" on success, or
      status="failed" (with the exception message) in the except branch —
      the exact branch that used to ONLY log.
    - GET /pek-extract/{report_id} (interface/routes_pek_status.py) reads
      this back, so the accepted report_id (the "job id" the 202 already
      carries) has an observable terminal state instead of silent hope.

DDD: infrastructure layer — sqlite3 I/O, mirrors
infrastructure/repositories.py::SQLitePDFDocumentRepository ("keep it simple
with direct sync calls — acceptable for single-user local service"; async
wrapping/asyncio.to_thread is not used there either). Injected at composition
root (main.py), same DI shape as PekEngineAdapter / LayoutFirstPushClient
(Optional[Any] at the interface-layer call sites — no domain port, matching
the existing PEK-INTEGRATE convention rather than the older ABC-port
PDFDocumentRepository convention).

Isolated table in the pdf-extractor's OWN db (cfg.db_path, DB_PATH env var,
default /app/data/pdf_extractor.db) — no shared access, no new database file.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, Optional

_DDL = """
CREATE TABLE IF NOT EXISTS pek_extraction_attempts (
    report_id  TEXT PRIMARY KEY,
    status     TEXT NOT NULL,
    error      TEXT,
    updated_at TEXT NOT NULL
);
"""


class PekExtractionStatusRepository:
    """Durable, queryable record of the terminal state of a /pek-extract job."""

    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        conn = sqlite3.connect(db_path)
        try:
            conn.execute(_DDL)
            conn.commit()
        finally:
            conn.close()

    def _write(self, report_id: str, status: str, error: Optional[str]) -> None:
        now = datetime.now(timezone.utc).isoformat()
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute(
                "INSERT INTO pek_extraction_attempts "
                "(report_id, status, error, updated_at) VALUES (?, ?, ?, ?) "
                "ON CONFLICT(report_id) DO UPDATE SET "
                "status=excluded.status, error=excluded.error, "
                "updated_at=excluded.updated_at",
                (report_id, status, error, now),
            )
            conn.commit()
        finally:
            conn.close()

    def mark_accepted(self, report_id: str) -> None:
        """Written by routes_pek.py BEFORE the 202 response is returned."""
        self._write(report_id, "accepted", None)

    def mark_done(self, report_id: str) -> None:
        """Written by pek_run_helper.py on a successful push_layout()."""
        self._write(report_id, "done", None)

    def mark_failed(self, report_id: str, error: str) -> None:
        """
        Written by pek_run_helper.py's except-Exception branch — the exact
        branch that used to ONLY call logger.error(). Covers
        SemaphoreContendedError (queue wait exhausted) and every other
        exception raised by PekEngineAdapter.extract_layout_and_tables().
        """
        self._write(report_id, "failed", error)

    def get(self, report_id: str) -> Optional[Dict[str, Any]]:
        """Return the latest recorded attempt for report_id, or None."""
        conn = sqlite3.connect(self.db_path)
        try:
            row = conn.execute(
                "SELECT report_id, status, error, updated_at "
                "FROM pek_extraction_attempts WHERE report_id = ?",
                (report_id,),
            ).fetchone()
        finally:
            conn.close()
        if not row:
            return None
        return {
            "report_id": row[0],
            "status": row[1],
            "error": row[2],
            "updated_at": row[3],
        }
