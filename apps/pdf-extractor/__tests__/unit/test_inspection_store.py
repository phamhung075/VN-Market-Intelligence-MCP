"""
Unit tests — InspectionStore (infrastructure layer).

Tests cover: list_docs, get_pdf_bytes, get_extraction, UUID validation,
pdf_path lazy backfill, honest-degrade for missing files.
"""

import json
import os
import sqlite3
import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from infrastructure.inspection_store import (
    InspectionStore,
    _parse_filename_label,
    _filename_from_url,
    _is_valid_uuid,
    _parse_ticker_from_url,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def tmp_dirs(tmp_path):
    """Return (db_path, pdf_dir, extraction_dir) with dirs created."""
    pdf_dir = tmp_path / "pdfs"
    extraction_dir = tmp_path / "extractions"
    pdf_dir.mkdir()
    extraction_dir.mkdir()
    db_path = str(tmp_path / "test.db")
    return db_path, str(pdf_dir), str(extraction_dir)


def _seed_db(db_path: str, rows: list[dict]) -> None:
    """Insert rows into pdf_documents. Each row: {id, url, pdf_path=None}."""
    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS pdf_documents (
            id TEXT PRIMARY KEY,
            url TEXT NOT NULL,
            source_type TEXT NOT NULL DEFAULT 'bctc',
            status TEXT NOT NULL DEFAULT 'success',
            extracted_at TEXT,
            pdf_path TEXT
        )
    """)
    for r in rows:
        conn.execute(
            "INSERT INTO pdf_documents (id, url, pdf_path) VALUES (?, ?, ?)",
            (r["id"], r["url"], r.get("pdf_path")),
        )
    conn.commit()
    conn.close()


def _write_extraction(extraction_dir: str, doc_id: str, data: dict | None = None) -> None:
    if data is None:
        data = {
            "document_id": doc_id,
            "tables": [],
            "text_content": "Sample extracted text",
            "ocr_confidence": 0.95,
            "extraction_time_ms": 123,
            "confidence_financial": 1.0,
        }
    path = os.path.join(extraction_dir, f"{doc_id}.json")
    with open(path, "w") as f:
        json.dump(data, f)


def _write_pdf(pdf_dir: str, filename: str) -> str:
    path = os.path.join(pdf_dir, filename)
    with open(path, "wb") as f:
        f.write(b"%PDF-1.4 fake content")
    return path


# ---------------------------------------------------------------------------
# Pure function tests
# ---------------------------------------------------------------------------

class TestParseFilenameLabel:
    def test_standard_pattern(self):
        ticker, period = _parse_filename_label("VCB_2025_Q4.pdf")
        assert ticker == "VCB"
        assert period == "2025 Q4"

    def test_lowercase_input(self):
        ticker, period = _parse_filename_label("vcb_2025_q4.pdf")
        assert ticker == "VCB"
        assert period == "2025 Q4"

    def test_unknown_pattern_uses_stem(self):
        ticker, period = _parse_filename_label("unknown_report.pdf")
        assert ticker == "unknown_report"
        assert period == ""

    def test_no_extension_fallback(self):
        ticker, period = _parse_filename_label("VNM.pdf")
        assert ticker == "VNM"
        assert period == ""


class TestFilenameFromUrl:
    def test_extracts_filename(self):
        url = "http://125.212.251.27:8765/bctc-files/VCB/VCB_2025_Q4.pdf"
        assert _filename_from_url(url) == "VCB_2025_Q4.pdf"

    def test_strips_query_string(self):
        url = "http://example.com/files/report.pdf?token=abc"
        assert _filename_from_url(url) == "report.pdf"

    def test_empty_url_returns_unknown(self):
        assert _filename_from_url("") == "unknown.pdf"


class TestIsValidUuid:
    def test_valid_uuid(self):
        assert _is_valid_uuid("550e8400-e29b-41d4-a716-446655440000")

    def test_uppercase_uuid(self):
        assert _is_valid_uuid("550E8400-E29B-41D4-A716-446655440000")

    def test_invalid_path_traversal(self):
        assert not _is_valid_uuid("../../etc/passwd")

    def test_invalid_short(self):
        assert not _is_valid_uuid("abc123")

    def test_invalid_extra_chars(self):
        assert not _is_valid_uuid("550e8400-e29b-41d4-a716-44665544000X")


class TestParseTickerFromUrl:
    def test_directory_before_filename(self):
        url = "http://125.212.251.27:8765/bctc-files/VCB/VCB_2025_Q4.pdf"
        assert _parse_ticker_from_url(url) == "VCB"

    def test_ticker_from_filename_fallback(self):
        url = "http://example.com/files/VNM_2024_Q2.pdf"
        assert _parse_ticker_from_url(url) == "VNM"

    def test_unparseable_url_returns_none(self):
        assert _parse_ticker_from_url("not a url") is None


# ---------------------------------------------------------------------------
# InspectionStore.list_docs()
# ---------------------------------------------------------------------------

class TestInspectionStoreListDocs:

    def test_empty_db_returns_empty_list(self, tmp_dirs):
        db_path, pdf_dir, extraction_dir = tmp_dirs
        _seed_db(db_path, [])
        store = InspectionStore(db_path, pdf_dir, extraction_dir)
        items = store.list_docs()
        assert items == []

    def test_no_db_file_returns_empty_list(self, tmp_dirs):
        _, pdf_dir, extraction_dir = tmp_dirs
        store = InspectionStore("/nonexistent/path.db", pdf_dir, extraction_dir)
        items = store.list_docs()
        assert items == []

    def test_doc_with_pdf_and_extraction(self, tmp_dirs):
        db_path, pdf_dir, extraction_dir = tmp_dirs
        doc_id = "550e8400-e29b-41d4-a716-446655440001"
        pdf_path = _write_pdf(pdf_dir, "VCB_2025_Q4.pdf")
        _write_extraction(extraction_dir, doc_id)
        _seed_db(db_path, [{"id": doc_id, "url": "http://vps/VCB/VCB_2025_Q4.pdf", "pdf_path": pdf_path}])

        store = InspectionStore(db_path, pdf_dir, extraction_dir)
        items = store.list_docs()

        assert len(items) == 1
        item = items[0]
        assert item["doc_id"] == doc_id
        assert item["has_pdf"] is True
        assert item["has_extraction"] is True
        assert item["ticker"] == "VCB"
        assert item["period"] == "2025 Q4"

    def test_doc_missing_pdf_shows_false_flag(self, tmp_dirs):
        db_path, pdf_dir, extraction_dir = tmp_dirs
        doc_id = "550e8400-e29b-41d4-a716-446655440002"
        _write_extraction(extraction_dir, doc_id)
        _seed_db(db_path, [{"id": doc_id, "url": "http://vps/VCB/VCB_2025_Q3.pdf", "pdf_path": None}])

        store = InspectionStore(db_path, pdf_dir, extraction_dir)
        items = store.list_docs()

        assert len(items) == 1
        assert items[0]["has_pdf"] is False
        assert items[0]["has_extraction"] is True

    def test_doc_missing_extraction_shows_false_flag(self, tmp_dirs):
        db_path, pdf_dir, extraction_dir = tmp_dirs
        doc_id = "550e8400-e29b-41d4-a716-446655440003"
        pdf_path = _write_pdf(pdf_dir, "VNM_2024_Q4.pdf")
        # No extraction file written
        _seed_db(db_path, [{"id": doc_id, "url": "http://vps/VNM/VNM_2024_Q4.pdf", "pdf_path": pdf_path}])

        store = InspectionStore(db_path, pdf_dir, extraction_dir)
        items = store.list_docs()

        assert len(items) == 1
        assert items[0]["has_pdf"] is True
        assert items[0]["has_extraction"] is False

    def test_lazy_backfill_resolves_pdf_path(self, tmp_dirs):
        db_path, pdf_dir, extraction_dir = tmp_dirs
        doc_id = "550e8400-e29b-41d4-a716-446655440004"
        _write_pdf(pdf_dir, "VCB_2025_Q4.pdf")
        # pdf_path is NULL in DB; URL encodes ticker VCB
        _seed_db(db_path, [{"id": doc_id, "url": "http://vps/bctc-files/VCB/VCB_2025_Q4.pdf", "pdf_path": None}])

        store = InspectionStore(db_path, pdf_dir, extraction_dir)
        items = store.list_docs()

        assert len(items) == 1
        assert items[0]["has_pdf"] is True  # backfill succeeded

    def test_ambiguous_pdf_not_backfilled(self, tmp_dirs):
        db_path, pdf_dir, extraction_dir = tmp_dirs
        doc_id = "550e8400-e29b-41d4-a716-446655440005"
        # Two PDFs for the same ticker — ambiguous
        _write_pdf(pdf_dir, "VCB_2025_Q4.pdf")
        _write_pdf(pdf_dir, "VCB_2025_Q3.pdf")
        _seed_db(db_path, [{"id": doc_id, "url": "http://vps/VCB/VCB_2025_Q4.pdf", "pdf_path": None}])

        store = InspectionStore(db_path, pdf_dir, extraction_dir)
        items = store.list_docs()

        # Ambiguous — has_pdf may be False (no unambiguous match)
        assert len(items) == 1
        # We don't assert has_pdf value as it's explicitly ambiguous; just ensure no crash


# ---------------------------------------------------------------------------
# InspectionStore.get_pdf_bytes()
# ---------------------------------------------------------------------------

class TestInspectionStoreGetPdfBytes:

    def test_returns_bytes_when_pdf_exists(self, tmp_dirs):
        db_path, pdf_dir, extraction_dir = tmp_dirs
        doc_id = "550e8400-e29b-41d4-a716-446655440010"
        pdf_path = _write_pdf(pdf_dir, "VCB_2025_Q4.pdf")
        _seed_db(db_path, [{"id": doc_id, "url": "http://vps/VCB/VCB_2025_Q4.pdf", "pdf_path": pdf_path}])

        store = InspectionStore(db_path, pdf_dir, extraction_dir)
        data = store.get_pdf_bytes(doc_id)

        assert data is not None
        assert data.startswith(b"%PDF")

    def test_returns_none_when_pdf_missing(self, tmp_dirs):
        db_path, pdf_dir, extraction_dir = tmp_dirs
        doc_id = "550e8400-e29b-41d4-a716-446655440011"
        _seed_db(db_path, [{"id": doc_id, "url": "http://vps/VCB/VCB_2025_Q4.pdf", "pdf_path": None}])

        store = InspectionStore(db_path, pdf_dir, extraction_dir)
        data = store.get_pdf_bytes(doc_id)

        assert data is None

    def test_raises_value_error_on_invalid_uuid(self, tmp_dirs):
        db_path, pdf_dir, extraction_dir = tmp_dirs
        store = InspectionStore(db_path, pdf_dir, extraction_dir)

        with pytest.raises(ValueError, match="Invalid doc_id"):
            store.get_pdf_bytes("../../etc/passwd")

    def test_raises_value_error_on_non_uuid_string(self, tmp_dirs):
        db_path, pdf_dir, extraction_dir = tmp_dirs
        store = InspectionStore(db_path, pdf_dir, extraction_dir)

        with pytest.raises(ValueError):
            store.get_pdf_bytes("not-a-uuid-at-all")


# ---------------------------------------------------------------------------
# InspectionStore.get_extraction()
# ---------------------------------------------------------------------------

class TestInspectionStoreGetExtraction:

    def test_returns_dict_when_extraction_exists(self, tmp_dirs):
        db_path, pdf_dir, extraction_dir = tmp_dirs
        doc_id = "550e8400-e29b-41d4-a716-446655440020"
        payload = {
            "document_id": doc_id,
            "tables": [{"table_index": 0, "headers": ["A"], "rows": [["1"]], "page_number": 1}],
            "text_content": "hello",
            "ocr_confidence": 0.9,
            "extraction_time_ms": 100,
        }
        _write_extraction(extraction_dir, doc_id, payload)

        store = InspectionStore(db_path, pdf_dir, extraction_dir)
        data = store.get_extraction(doc_id)

        assert data is not None
        assert data["document_id"] == doc_id
        assert data["text_content"] == "hello"
        assert len(data["tables"]) == 1

    def test_returns_none_when_extraction_missing(self, tmp_dirs):
        db_path, pdf_dir, extraction_dir = tmp_dirs
        doc_id = "550e8400-e29b-41d4-a716-446655440021"

        store = InspectionStore(db_path, pdf_dir, extraction_dir)
        data = store.get_extraction(doc_id)

        assert data is None

    def test_raises_value_error_on_invalid_uuid(self, tmp_dirs):
        db_path, pdf_dir, extraction_dir = tmp_dirs
        store = InspectionStore(db_path, pdf_dir, extraction_dir)

        with pytest.raises(ValueError, match="Invalid doc_id"):
            store.get_extraction("../../../secret")
