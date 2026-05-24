"""
Infrastructure — Concrete repository implementations.

SQLitePDFDocumentRepository: persists PDFDocument to SQLite.
HTTPPDFStorageRepository: downloads PDF via HTTP + stores JSON extraction.

Infrastructure layer: implements domain/ ports, may use DB/HTTP, never imports interface/.
"""

import json
import os
import sqlite3
from datetime import datetime
from typing import Optional

import aiohttp

from domain.models import PDFDocument, ExtractedContent, ExtractedTable
from domain.repositories import PDFDocumentRepository, PDFStorageRepository
from domain.errors import PDFDownloadError


# ---------------------------------------------------------------------------
# SQLite migration helper
# ---------------------------------------------------------------------------

_DDL = """
CREATE TABLE IF NOT EXISTS pdf_documents (
    id           TEXT PRIMARY KEY,
    url          TEXT NOT NULL,
    source_type  TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending',
    extracted_at TEXT
);
"""

_MIGRATION_PDF_PATH = """
ALTER TABLE pdf_documents ADD COLUMN pdf_path TEXT;
"""


def _ensure_schema(db_path: str) -> None:
    """Create table + apply migrations if not already present (idempotent)."""
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(_DDL)
        # Migration: add pdf_path column (nullable, lazy-backfilled at list time).
        existing_cols = {
            row[1]
            for row in conn.execute("PRAGMA table_info(pdf_documents)").fetchall()
        }
        if "pdf_path" not in existing_cols:
            conn.execute(_MIGRATION_PDF_PATH)
        conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# SQLitePDFDocumentRepository
# ---------------------------------------------------------------------------

class SQLitePDFDocumentRepository(PDFDocumentRepository):
    """
    Concrete implementation: SQLite persistence for PDF document metadata.

    Thread-safety: each operation opens its own short-lived connection.
    Async wrappers use asyncio.to_thread in Python 3.9+ to keep the event
    loop unblocked. Here we keep it simple with direct sync calls (acceptable
    for single-user local service).
    """

    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        _ensure_schema(db_path)

    async def save(self, doc: PDFDocument) -> None:
        extracted_at_str = (
            doc.extracted_at.isoformat() if doc.extracted_at else None
        )
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute(
                "INSERT OR REPLACE INTO pdf_documents "
                "(id, url, source_type, status, extracted_at) VALUES (?, ?, ?, ?, ?)",
                (doc.id, doc.url, doc.source_type, doc.status, extracted_at_str),
            )
            conn.commit()
        finally:
            conn.close()

    async def set_pdf_path(self, doc_id: str, pdf_path: str) -> None:
        """Lazy-backfill the pdf_path column for a known doc_id."""
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute(
                "UPDATE pdf_documents SET pdf_path = ? WHERE id = ?",
                (pdf_path, doc_id),
            )
            conn.commit()
        finally:
            conn.close()

    async def find_by_id(self, doc_id: str) -> Optional[PDFDocument]:
        conn = sqlite3.connect(self.db_path)
        try:
            row = conn.execute(
                "SELECT id, url, source_type, status, extracted_at "
                "FROM pdf_documents WHERE id = ?",
                (doc_id,),
            ).fetchone()
        finally:
            conn.close()

        if not row:
            return None

        extracted_at = None
        if row[4]:
            try:
                extracted_at = datetime.fromisoformat(row[4])
            except ValueError:
                extracted_at = None

        return PDFDocument(
            id=row[0],
            url=row[1],
            source_type=row[2],
            status=row[3],
            extracted_at=extracted_at,
        )

    async def find_pending(self) -> list[PDFDocument]:
        conn = sqlite3.connect(self.db_path)
        try:
            rows = conn.execute(
                "SELECT id, url, source_type, status, extracted_at "
                "FROM pdf_documents WHERE status = 'pending'",
            ).fetchall()
        finally:
            conn.close()

        result = []
        for row in rows:
            extracted_at = None
            if row[4]:
                try:
                    extracted_at = datetime.fromisoformat(row[4])
                except ValueError:
                    extracted_at = None
            result.append(
                PDFDocument(
                    id=row[0],
                    url=row[1],
                    source_type=row[2],
                    status=row[3],
                    extracted_at=extracted_at,
                )
            )
        return result

    async def find_all(self) -> list[PDFDocument]:
        """Return all documents ordered by extracted_at DESC (NULLs last)."""
        conn = sqlite3.connect(self.db_path)
        try:
            rows = conn.execute(
                "SELECT id, url, source_type, status, extracted_at "
                "FROM pdf_documents ORDER BY extracted_at DESC",
            ).fetchall()
        finally:
            conn.close()

        result = []
        for row in rows:
            extracted_at = None
            if row[4]:
                try:
                    extracted_at = datetime.fromisoformat(row[4])
                except ValueError:
                    extracted_at = None
            result.append(
                PDFDocument(
                    id=row[0],
                    url=row[1],
                    source_type=row[2],
                    status=row[3],
                    extracted_at=extracted_at,
                )
            )
        return result


# ---------------------------------------------------------------------------
# HTTPPDFStorageRepository
# ---------------------------------------------------------------------------

class HTTPPDFStorageRepository(PDFStorageRepository):
    """
    Concrete implementation: download PDF via HTTP, store extraction JSON to disk.

    Uses aiohttp for async HTTP — no blocking I/O in the event loop.
    """

    def __init__(self, storage_dir: str) -> None:
        self.storage_dir = storage_dir
        os.makedirs(storage_dir, exist_ok=True)

    async def fetch_pdf(self, url: str) -> bytes:
        timeout = aiohttp.ClientTimeout(total=60)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(
                url,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (compatible; VN-Market-Intelligence/1.0; "
                        "+https://github.com/vn-market)"
                    ),
                    "Accept": "application/pdf,*/*",
                },
            ) as resp:
                if resp.status != 200:
                    raise PDFDownloadError(
                        f"HTTP {resp.status} fetching {url}"
                    )
                return await resp.read()

    async def store_extraction(self, doc_id: str, content: ExtractedContent) -> str:
        output_path = os.path.join(self.storage_dir, f"{doc_id}.json")
        payload = {
            "document_id": content.document_id,
            "tables": [
                {
                    "table_index": t.table_index,
                    "headers": t.headers,
                    "rows": t.rows,
                    "page_number": t.page_number,
                }
                for t in content.tables
            ],
            "text_content": content.text_content,
            "ocr_confidence": content.ocr_confidence,
            "extraction_time_ms": content.extraction_time_ms,
        }
        with open(output_path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False)
        return output_path
