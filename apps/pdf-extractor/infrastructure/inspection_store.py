# SI-2 BOUNDARY: PDF inspection viewer surface.
# This file is part of the served /inspect viewer (Sprint PDF-INSPECT).
# It is SEPARATE from the sandbox trace dashboard (dashboard/index.html).
# Do NOT merge viewer code into dashboard/index.html or dashboard/traces.js.
"""
Infrastructure — InspectionStore.

Read-only adapter for the PDF inspection viewer.
Provides:
  list_docs()       — enumerate available PDFs with has_pdf / has_extraction flags.
  get_pdf_bytes()   — return raw bytes for a doc_id's local PDF.
  get_extraction()  — return the extraction JSON dict for a doc_id.

PDF path resolution:
  pdf_documents.pdf_path (nullable) is the canonical local path.
  On first list_docs() call, any row with pdf_path IS NULL is lazy-backfilled:
    - Parse ticker from VPS URL (last non-filename path component or URL basename prefix).
    - Scan pdf_dir for files matching {TICKER}_{YEAR_Q?QUARTER}.pdf pattern.
    - If a single unambiguous match is found, write back to pdf_documents.pdf_path.

Security: doc_id is validated as a UUID hex string before any filesystem operation.
"""

import json
import os
import re
import sqlite3
from typing import Optional

# UUID pattern: 8-4-4-4-12 hex characters
_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)

# PDF filename pattern: {TICKER}_{YEAR}_Q{QUARTER}.pdf
_PDF_FILENAME_RE = re.compile(
    r"^([A-Z0-9]+)_(\d{4})_Q(\d)\.pdf$",
    re.IGNORECASE,
)


def _is_valid_uuid(doc_id: str) -> bool:
    return bool(_UUID_RE.match(doc_id))


def _parse_ticker_from_url(url: str) -> Optional[str]:
    """
    Derive ticker from a VPS URL such as:
      http://125.212.251.27:8765/bctc-files/VCB/VCB_2025_Q4.pdf
    Strategy: look for a path component that is all uppercase letters/digits
    and appears before the final filename segment.
    Falls back to None if nothing matches.
    """
    try:
        path = url.split("?")[0]
        parts = [p for p in path.split("/") if p]
        # Walk from second-to-last part backward; pick the first uppercase-only segment
        for part in reversed(parts[:-1]):
            if re.match(r"^[A-Z0-9]{2,10}$", part):
                return part
        # Fallback: try to parse ticker from the filename component itself
        filename = parts[-1] if parts else ""
        m = _PDF_FILENAME_RE.match(filename)
        if m:
            return m.group(1).upper()
    except Exception:
        pass
    return None


def _scan_pdf_dir(pdf_dir: str) -> dict[str, str]:
    """
    Return a dict mapping filename (lower) → absolute path
    for all *.pdf files in pdf_dir.
    """
    result: dict[str, str] = {}
    if not os.path.isdir(pdf_dir):
        return result
    for fname in os.listdir(pdf_dir):
        if fname.lower().endswith(".pdf"):
            result[fname.lower()] = os.path.join(pdf_dir, fname)
    return result


def _match_pdf_for_ticker(pdf_dir_index: dict[str, str], ticker: str) -> list[str]:
    """Return all PDF absolute paths whose filename starts with TICKER_ (case-insensitive)."""
    prefix = ticker.lower() + "_"
    return [path for fname, path in pdf_dir_index.items() if fname.startswith(prefix)]


class InspectionStore:
    """
    Infrastructure read adapter for the PDF inspection viewer.

    db_path        — path to pdf_extractor.db (SQLite)
    pdf_dir        — directory containing PDFs, e.g. /app/data/pdfs
    extraction_dir — directory containing extraction JSONs, e.g. /app/data/extractions
    """

    def __init__(self, db_path: str, pdf_dir: str, extraction_dir: str) -> None:
        self.db_path = db_path
        self.pdf_dir = pdf_dir
        self.extraction_dir = extraction_dir

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def list_docs(self) -> list[dict]:
        """
        Return a list of dicts, one per pdf_documents row, with fields:
          doc_id, filename, ticker, period, has_extraction, has_pdf

        Triggers lazy pdf_path backfill for rows where it is NULL and a
        matching PDF can be unambiguously found on disk.

        Degrade: rows missing PDF or extraction are included with has_* flags
        set to False — the viewer shows explicit messages for each missing side.
        """
        rows = self._query_all_docs()
        pdf_dir_index = _scan_pdf_dir(self.pdf_dir)
        items = []

        for row in rows:
            doc_id, url, pdf_path = row["id"], row["url"], row["pdf_path"]

            # --- Lazy backfill: attempt to resolve pdf_path from disk ---
            if not pdf_path:
                pdf_path = self._try_resolve_pdf_path(doc_id, url, pdf_dir_index)

            # --- Determine filename + human label ---
            if pdf_path:
                filename = os.path.basename(pdf_path)
                ticker, period = _parse_filename_label(filename)
                has_pdf = os.path.isfile(pdf_path)
            else:
                filename = _filename_from_url(url)
                ticker, period = _parse_filename_label(filename)
                has_pdf = False

            # --- Check extraction ---
            extraction_path = os.path.join(self.extraction_dir, f"{doc_id}.json")
            has_extraction = os.path.isfile(extraction_path)

            items.append({
                "doc_id": doc_id,
                "filename": filename,
                "ticker": ticker,
                "period": period,
                "has_extraction": has_extraction,
                "has_pdf": has_pdf,
            })

        return items

    def get_pdf_bytes(self, doc_id: str) -> Optional[bytes]:
        """
        Return raw PDF bytes for doc_id, or None if the file does not exist.

        doc_id is validated as a UUID before any filesystem access.
        Raises ValueError if doc_id is not a valid UUID pattern.
        """
        if not _is_valid_uuid(doc_id):
            raise ValueError(f"Invalid doc_id format: {doc_id!r}")

        pdf_path = self._resolve_pdf_path_for_id(doc_id)
        if not pdf_path or not os.path.isfile(pdf_path):
            return None
        with open(pdf_path, "rb") as fh:
            return fh.read()

    def get_extraction(self, doc_id: str) -> Optional[dict]:
        """
        Return parsed extraction JSON dict for doc_id, or None if not found.

        doc_id is validated as a UUID before any filesystem access.
        Raises ValueError if doc_id is not a valid UUID pattern.
        """
        if not _is_valid_uuid(doc_id):
            raise ValueError(f"Invalid doc_id format: {doc_id!r}")

        path = os.path.join(self.extraction_dir, f"{doc_id}.json")
        if not os.path.isfile(path):
            return None
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)  # type: ignore[no-any-return]

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _query_all_docs(self) -> list[dict]:
        """Query all pdf_documents rows; returns list of {id, url, pdf_path}."""
        if not os.path.isfile(self.db_path):
            return []
        conn = sqlite3.connect(self.db_path)
        try:
            # Ensure column exists before querying (defensive — schema migration
            # normally runs in __init__ of SQLitePDFDocumentRepository, but
            # InspectionStore may open the DB independently in tests).
            existing_cols = {
                row[1]
                for row in conn.execute(
                    "PRAGMA table_info(pdf_documents)"
                ).fetchall()
            }
            if "pdf_path" not in existing_cols:
                conn.execute(
                    "ALTER TABLE pdf_documents ADD COLUMN pdf_path TEXT"
                )
                conn.commit()

            rows = conn.execute(
                "SELECT id, url, pdf_path FROM pdf_documents "
                "ORDER BY extracted_at DESC"
            ).fetchall()
        finally:
            conn.close()

        return [{"id": r[0], "url": r[1], "pdf_path": r[2]} for r in rows]

    def _try_resolve_pdf_path(
        self,
        doc_id: str,
        url: str,
        pdf_dir_index: dict[str, str],
    ) -> Optional[str]:
        """
        Attempt to find a PDF on disk for a row whose pdf_path is NULL.

        Strategy:
          1. Parse ticker from URL.
          2. Find all PDFs in pdf_dir whose name starts with TICKER_.
          3. If exactly one match → write back to pdf_documents.pdf_path + return it.
          4. If zero or multiple → return None (ambiguous, do not guess).
        """
        ticker = _parse_ticker_from_url(url)
        if not ticker:
            return None

        matches = _match_pdf_for_ticker(pdf_dir_index, ticker)
        if len(matches) == 1:
            resolved = matches[0]
            self._write_pdf_path(doc_id, resolved)
            return resolved
        # Multiple matches: ambiguous — return None, viewer shows has_pdf=False.
        return None

    def _resolve_pdf_path_for_id(self, doc_id: str) -> Optional[str]:
        """
        Look up pdf_path from DB for a single doc_id.
        If NULL, attempt lazy backfill using disk scan.
        """
        if not os.path.isfile(self.db_path):
            return None
        conn = sqlite3.connect(self.db_path)
        try:
            row = conn.execute(
                "SELECT url, pdf_path FROM pdf_documents WHERE id = ?",
                (doc_id,),
            ).fetchone()
        finally:
            conn.close()

        if not row:
            return None

        url, pdf_path = row[0], row[1]
        if pdf_path:
            return pdf_path

        # Lazy backfill attempt
        pdf_dir_index = _scan_pdf_dir(self.pdf_dir)
        return self._try_resolve_pdf_path(doc_id, url, pdf_dir_index)

    def _write_pdf_path(self, doc_id: str, pdf_path: str) -> None:
        """Persist resolved pdf_path back to DB (best-effort; silent on failure)."""
        try:
            conn = sqlite3.connect(self.db_path)
            try:
                conn.execute(
                    "UPDATE pdf_documents SET pdf_path = ? WHERE id = ?",
                    (pdf_path, doc_id),
                )
                conn.commit()
            finally:
                conn.close()
        except Exception:
            pass  # Non-critical; viewer still works from in-memory value


# ------------------------------------------------------------------
# Module-level helpers (pure functions, no I/O)
# ------------------------------------------------------------------

def _parse_filename_label(filename: str) -> tuple[str, str]:
    """
    Parse ticker + period string from a PDF filename.

    Examples:
      VCB_2025_Q4.pdf  → ("VCB", "2025 Q4")
      VNM_2024_Q1.pdf  → ("VNM", "2024 Q1")
      unknown.pdf      → ("unknown", "")
    """
    m = _PDF_FILENAME_RE.match(filename)
    if m:
        return m.group(1).upper(), f"{m.group(2)} Q{m.group(3)}"
    # Fallback: use stem without extension
    stem = os.path.splitext(filename)[0]
    return stem, ""


def _filename_from_url(url: str) -> str:
    """Extract the trailing filename from a URL, or 'unknown.pdf' if unparseable."""
    try:
        path = url.split("?")[0]
        name = path.rstrip("/").split("/")[-1]
        return name if name else "unknown.pdf"
    except Exception:
        return "unknown.pdf"
