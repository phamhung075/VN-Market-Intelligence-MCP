"""
Integration tests — PDF inspection viewer routes.

Tests cover:
  GET /inspect          — viewer HTML returned
  GET /inspect/pdfs     — list endpoint returns docs
  GET /inspect/pdf/{id} — PDF bytes (bytes, 404, 400)
  GET /inspect/extraction/{id} — extraction (200, 404, 400)

Uses FastAPI TestClient with real SQLite + temp filesystem.
Honest-degrade: missing PDF → 404, missing extraction → 404.
"""

import json
import os
import sqlite3
import sys
import tempfile

import pytest
from fastapi import FastAPI, APIRouter
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from infrastructure.inspection_store import InspectionStore
from interface.handlers import register_routes
from application.usecases import ExtractPDFUseCase
from unittest.mock import AsyncMock


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

DOC_ID_1 = "550e8400-e29b-41d4-a716-446655440100"
DOC_ID_2 = "550e8400-e29b-41d4-a716-446655440101"
INVALID_ID = "not-valid-uuid"


@pytest.fixture
def tmp_dirs(tmp_path):
    pdf_dir = tmp_path / "pdfs"
    extraction_dir = tmp_path / "extractions"
    pdf_dir.mkdir()
    extraction_dir.mkdir()
    db_path = str(tmp_path / "test.db")
    return str(tmp_path), db_path, str(pdf_dir), str(extraction_dir)


def _seed_db(db_path: str, rows: list[dict]) -> None:
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


def _write_extraction(extraction_dir: str, doc_id: str) -> None:
    payload = {
        "document_id": doc_id,
        "tables": [{"table_index": 0, "headers": ["Col"], "rows": [["Val"]], "page_number": 1}],
        "text_content": "Extracted text here",
        "ocr_confidence": 0.92,
        "extraction_time_ms": 200,
        "confidence_financial": 0.85,
    }
    with open(os.path.join(extraction_dir, f"{doc_id}.json"), "w") as f:
        json.dump(payload, f)


def _write_pdf(pdf_dir: str, filename: str) -> str:
    path = os.path.join(pdf_dir, filename)
    with open(path, "wb") as f:
        f.write(b"%PDF-1.4 fake-content")
    return path


def _build_client(db_path: str, pdf_dir: str, extraction_dir: str) -> TestClient:
    """Build a FastAPI TestClient with inspection routes wired."""
    app = FastAPI()
    router = APIRouter()
    # Minimal mock for extract_usecase (not exercised by these tests)
    mock_usecase = AsyncMock(spec=ExtractPDFUseCase)
    inspection_store = InspectionStore(db_path, pdf_dir, extraction_dir)
    register_routes(router, mock_usecase, inspection_store)
    app.include_router(router)
    return TestClient(app, raise_server_exceptions=True)


# ---------------------------------------------------------------------------
# GET /inspect — viewer HTML page
# ---------------------------------------------------------------------------

class TestViewerPage:

    def test_returns_200_html(self, tmp_dirs):
        _, db_path, pdf_dir, extraction_dir = tmp_dirs
        client = _build_client(db_path, pdf_dir, extraction_dir)
        resp = client.get("/inspect")
        assert resp.status_code == 200
        assert "text/html" in resp.headers["content-type"]

    def test_html_contains_si2_boundary_comment(self, tmp_dirs):
        _, db_path, pdf_dir, extraction_dir = tmp_dirs
        client = _build_client(db_path, pdf_dir, extraction_dir)
        resp = client.get("/inspect")
        assert "SI-2 BOUNDARY" in resp.text

    def test_html_contains_select_element(self, tmp_dirs):
        _, db_path, pdf_dir, extraction_dir = tmp_dirs
        client = _build_client(db_path, pdf_dir, extraction_dir)
        resp = client.get("/inspect")
        assert "<select" in resp.text

    def test_html_contains_pdfjs_reference(self, tmp_dirs):
        _, db_path, pdf_dir, extraction_dir = tmp_dirs
        client = _build_client(db_path, pdf_dir, extraction_dir)
        resp = client.get("/inspect")
        assert "pdfjs-dist" in resp.text


# ---------------------------------------------------------------------------
# GET /inspect/pdfs — list endpoint
# ---------------------------------------------------------------------------

class TestListPdfs:

    def test_empty_db_returns_empty_items(self, tmp_dirs):
        _, db_path, pdf_dir, extraction_dir = tmp_dirs
        _seed_db(db_path, [])
        client = _build_client(db_path, pdf_dir, extraction_dir)
        resp = client.get("/inspect/pdfs")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert data["items"] == []

    def test_returns_doc_with_both_flags(self, tmp_dirs):
        _, db_path, pdf_dir, extraction_dir = tmp_dirs
        pdf_path = _write_pdf(pdf_dir, "VCB_2025_Q4.pdf")
        _write_extraction(extraction_dir, DOC_ID_1)
        _seed_db(db_path, [{"id": DOC_ID_1, "url": "http://vps/VCB/VCB_2025_Q4.pdf", "pdf_path": pdf_path}])

        client = _build_client(db_path, pdf_dir, extraction_dir)
        resp = client.get("/inspect/pdfs")

        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) == 1
        item = items[0]
        assert item["doc_id"] == DOC_ID_1
        assert item["has_pdf"] is True
        assert item["has_extraction"] is True
        assert item["ticker"] == "VCB"
        assert item["period"] == "2025 Q4"

    def test_returns_doc_with_missing_pdf(self, tmp_dirs):
        _, db_path, pdf_dir, extraction_dir = tmp_dirs
        _write_extraction(extraction_dir, DOC_ID_1)
        _seed_db(db_path, [{"id": DOC_ID_1, "url": "http://vps/VNM/VNM_2024_Q1.pdf", "pdf_path": None}])

        client = _build_client(db_path, pdf_dir, extraction_dir)
        resp = client.get("/inspect/pdfs")

        assert resp.status_code == 200
        item = resp.json()["items"][0]
        assert item["has_pdf"] is False
        assert item["has_extraction"] is True

    def test_returns_doc_with_missing_extraction(self, tmp_dirs):
        _, db_path, pdf_dir, extraction_dir = tmp_dirs
        pdf_path = _write_pdf(pdf_dir, "VNM_2024_Q4.pdf")
        _seed_db(db_path, [{"id": DOC_ID_1, "url": "http://vps/VNM/VNM_2024_Q4.pdf", "pdf_path": pdf_path}])

        client = _build_client(db_path, pdf_dir, extraction_dir)
        resp = client.get("/inspect/pdfs")

        assert resp.status_code == 200
        item = resp.json()["items"][0]
        assert item["has_pdf"] is True
        assert item["has_extraction"] is False

    def test_multiple_docs_returned(self, tmp_dirs):
        _, db_path, pdf_dir, extraction_dir = tmp_dirs
        pdf_path1 = _write_pdf(pdf_dir, "VCB_2025_Q4.pdf")
        pdf_path2 = _write_pdf(pdf_dir, "VNM_2024_Q1.pdf")
        _seed_db(db_path, [
            {"id": DOC_ID_1, "url": "http://vps/VCB/VCB_2025_Q4.pdf", "pdf_path": pdf_path1},
            {"id": DOC_ID_2, "url": "http://vps/VNM/VNM_2024_Q1.pdf", "pdf_path": pdf_path2},
        ])

        client = _build_client(db_path, pdf_dir, extraction_dir)
        resp = client.get("/inspect/pdfs")

        assert resp.status_code == 200
        assert len(resp.json()["items"]) == 2


# ---------------------------------------------------------------------------
# GET /inspect/pdf/{doc_id} — PDF bytes
# ---------------------------------------------------------------------------

class TestGetPdfBytes:

    def test_returns_pdf_bytes_200(self, tmp_dirs):
        _, db_path, pdf_dir, extraction_dir = tmp_dirs
        pdf_path = _write_pdf(pdf_dir, "VCB_2025_Q4.pdf")
        _seed_db(db_path, [{"id": DOC_ID_1, "url": "http://vps/VCB/VCB_2025_Q4.pdf", "pdf_path": pdf_path}])

        client = _build_client(db_path, pdf_dir, extraction_dir)
        resp = client.get(f"/inspect/pdf/{DOC_ID_1}")

        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"
        assert resp.content.startswith(b"%PDF")

    def test_returns_404_when_pdf_not_on_disk(self, tmp_dirs):
        _, db_path, pdf_dir, extraction_dir = tmp_dirs
        # pdf_path points to a non-existent file
        _seed_db(db_path, [{"id": DOC_ID_1, "url": "http://vps/VCB/missing.pdf", "pdf_path": None}])

        client = _build_client(db_path, pdf_dir, extraction_dir)
        resp = client.get(f"/inspect/pdf/{DOC_ID_1}")

        assert resp.status_code == 404
        body = resp.json()
        assert body["detail"]["error"] == "pdf_not_found"
        assert body["detail"]["doc_id"] == DOC_ID_1

    def test_returns_400_on_invalid_uuid(self, tmp_dirs):
        _, db_path, pdf_dir, extraction_dir = tmp_dirs
        client = _build_client(db_path, pdf_dir, extraction_dir)
        resp = client.get(f"/inspect/pdf/{INVALID_ID}")

        assert resp.status_code == 400
        assert resp.json()["detail"]["error"] == "invalid_doc_id"

    def test_returns_400_on_path_traversal_attempt(self, tmp_dirs):
        _, db_path, pdf_dir, extraction_dir = tmp_dirs
        client = _build_client(db_path, pdf_dir, extraction_dir)
        # URL-encode the path traversal — TestClient sends it as-is
        resp = client.get("/inspect/pdf/../../etc/passwd")
        # FastAPI will route this differently (404 from router, or 400 from handler)
        # The key assertion: no server error (500) and no file leaked
        assert resp.status_code in (400, 404, 422)


# ---------------------------------------------------------------------------
# GET /inspect/extraction/{doc_id} — extraction content
# ---------------------------------------------------------------------------

class TestGetExtraction:

    def test_returns_extraction_200(self, tmp_dirs):
        _, db_path, pdf_dir, extraction_dir = tmp_dirs
        _write_extraction(extraction_dir, DOC_ID_1)

        client = _build_client(db_path, pdf_dir, extraction_dir)
        resp = client.get(f"/inspect/extraction/{DOC_ID_1}")

        assert resp.status_code == 200
        data = resp.json()
        assert data["document_id"] == DOC_ID_1
        assert data["text_content"] == "Extracted text here"
        assert isinstance(data["tables"], list)
        assert data["ocr_confidence"] == pytest.approx(0.92)

    def test_returns_404_when_no_extraction(self, tmp_dirs):
        _, db_path, pdf_dir, extraction_dir = tmp_dirs
        # No extraction file written

        client = _build_client(db_path, pdf_dir, extraction_dir)
        resp = client.get(f"/inspect/extraction/{DOC_ID_1}")

        assert resp.status_code == 404
        body = resp.json()
        assert body["detail"]["error"] == "extraction_not_found"
        assert body["detail"]["doc_id"] == DOC_ID_1

    def test_returns_400_on_invalid_uuid(self, tmp_dirs):
        _, db_path, pdf_dir, extraction_dir = tmp_dirs
        client = _build_client(db_path, pdf_dir, extraction_dir)
        resp = client.get(f"/inspect/extraction/{INVALID_ID}")

        assert resp.status_code == 400
        assert resp.json()["detail"]["error"] == "invalid_doc_id"

    def test_extraction_contains_tables(self, tmp_dirs):
        _, db_path, pdf_dir, extraction_dir = tmp_dirs
        _write_extraction(extraction_dir, DOC_ID_1)

        client = _build_client(db_path, pdf_dir, extraction_dir)
        resp = client.get(f"/inspect/extraction/{DOC_ID_1}")

        assert resp.status_code == 200
        tables = resp.json()["tables"]
        assert len(tables) == 1
        assert tables[0]["headers"] == ["Col"]

    def test_extraction_contains_confidence_scores(self, tmp_dirs):
        _, db_path, pdf_dir, extraction_dir = tmp_dirs
        _write_extraction(extraction_dir, DOC_ID_1)

        client = _build_client(db_path, pdf_dir, extraction_dir)
        resp = client.get(f"/inspect/extraction/{DOC_ID_1}")

        data = resp.json()
        assert "ocr_confidence" in data
        assert "confidence_financial" in data
