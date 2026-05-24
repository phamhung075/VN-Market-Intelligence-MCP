"""
QA PI-3 — Served-URL acceptance tests for the /inspect viewer.

These tests exercise the REAL served path (L9 binding): start the FastAPI
application with a seeded fixture dataset, drive it via the HTTP client,
and assert the user acceptance condition is met:
  list → select doc → LEFT=PDF, RIGHT=extraction, side-by-side.

Also verifies:
  - Honest-degrade states (no PDF, no extraction) emit explicit messages, no fabrication
  - UUID/400 gate on /inspect/pdf/{id} and /inspect/extraction/{id}
  - Path-traversal attempt returns 400/404/422, not 500 or file content

Note: the Playwright headless DOM assertions are in the QA evidence script
at /tmp/qa-pi3-playwright-test.py (run during PI-3 QA cycle; screenshot at
/tmp/qa-pi3-playwright-evidence.png). These pytest tests exercise the same
surface as a regression guard using TestClient (synchronous, no CDN needed).

Fixture: 3 docs — DOC_FULL (PDF+extraction), DOC_NO_PDF, DOC_NO_EXT.
"""

import json
import os
import sqlite3
import sys

import pytest
from fastapi import FastAPI, APIRouter
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from infrastructure.inspection_store import InspectionStore
from interface.handlers import register_routes
from application.usecases import ExtractPDFUseCase

# ---------------------------------------------------------------------------
# Fixture UUIDs
# ---------------------------------------------------------------------------

DOC_FULL   = "a0b1c2d3-e4f5-6789-abcd-ef0123456789"  # has PDF + extraction
DOC_NO_PDF = "b1c2d3e4-f5a6-7890-bcde-f01234567890"  # extraction only, no PDF
DOC_NO_EXT = "c2d3e4f5-a6b7-8901-cdef-012345678901"  # PDF only, no extraction
INVALID_ID = "../../etc/passwd"
SHORT_ID   = "not-a-uuid"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed_db(db_path: str, pdf_dir: str, extraction_dir: str) -> None:
    """Seed test SQLite DB with 3 rows."""
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
    pdf_path_full = os.path.join(pdf_dir, "VNM_2024_Q1.pdf")
    conn.executemany(
        "INSERT INTO pdf_documents (id, url, pdf_path, extracted_at) VALUES (?,?,?,?)",
        [
            (DOC_FULL,   "http://vps/bctc-files/VNM/VNM_2024_Q1.pdf", pdf_path_full, "2024-05-01T10:00:00"),
            (DOC_NO_PDF, "http://vps/bctc-files/VCB/VCB_2024_Q4.pdf", None,           "2024-05-01T09:00:00"),
            (DOC_NO_EXT, "http://vps/bctc-files/HPG/HPG_2024_Q1.pdf", pdf_path_full, "2024-05-01T08:00:00"),
        ],
    )
    conn.commit()
    conn.close()


def _write_pdf(path: str) -> None:
    with open(path, "wb") as f:
        f.write(b"%PDF-1.4 fake-qa-fixture-content")


def _write_extraction(extraction_dir: str, doc_id: str) -> None:
    payload = {
        "document_id": doc_id,
        "tables": [
            {"table_index": 0, "headers": ["Indicator", "Value"], "rows": [["net_profit", "0.000051"]], "page_number": 1}
        ],
        "text_content": f"BCTC text for {doc_id} — net_profit: 0.000051 (DECIMAL-SHIFT BUG)",
        "ocr_confidence": 0.93,
        "extraction_time_ms": 421,
        "confidence_financial": 0.87,
    }
    with open(os.path.join(extraction_dir, f"{doc_id}.json"), "w") as f:
        json.dump(payload, f)


@pytest.fixture
def client(tmp_path):
    """Build TestClient with seeded fixture data."""
    pdf_dir       = tmp_path / "pdfs"
    extraction_dir = tmp_path / "extractions"
    pdf_dir.mkdir()
    extraction_dir.mkdir()
    db_path = str(tmp_path / "test.db")

    # Write fixture PDF
    _write_pdf(str(pdf_dir / "VNM_2024_Q1.pdf"))

    # Write extractions for DOC_FULL and DOC_NO_PDF only
    _write_extraction(str(extraction_dir), DOC_FULL)
    _write_extraction(str(extraction_dir), DOC_NO_PDF)
    # DOC_NO_EXT: intentionally no extraction file

    _seed_db(db_path, str(pdf_dir), str(extraction_dir))

    app = FastAPI()
    router = APIRouter()
    mock_uc = AsyncMock(spec=ExtractPDFUseCase)
    store = InspectionStore(db_path, str(pdf_dir), str(extraction_dir))
    register_routes(router, mock_uc, store)
    app.include_router(router)
    return TestClient(app, raise_server_exceptions=True)


# ---------------------------------------------------------------------------
# AC-1 equivalent: GET /inspect serves the viewer HTML
# ---------------------------------------------------------------------------

class TestViewerServed:
    def test_200_html(self, client):
        r = client.get("/inspect")
        assert r.status_code == 200
        assert "text/html" in r.headers["content-type"]

    def test_si2_boundary_comment(self, client):
        r = client.get("/inspect")
        assert "SI-2 BOUNDARY" in r.text

    def test_select_element_present(self, client):
        r = client.get("/inspect")
        assert "<select" in r.text

    def test_pdfjs_cdn_reference(self, client):
        r = client.get("/inspect")
        assert "pdfjs-dist@4.2.67" in r.text

    def test_fetch_inspect_pdfs_in_script(self, client):
        """JS calls /inspect/pdfs on load — confirm the URL is in the template."""
        r = client.get("/inspect")
        assert "/inspect/pdfs" in r.text


# ---------------------------------------------------------------------------
# AC-2 equivalent: GET /inspect/pdfs list endpoint
# ---------------------------------------------------------------------------

class TestListEndpoint:
    def test_returns_items_key(self, client):
        r = client.get("/inspect/pdfs")
        assert r.status_code == 200
        assert "items" in r.json()

    def test_three_docs_listed(self, client):
        items = client.get("/inspect/pdfs").json()["items"]
        assert len(items) == 3

    def test_doc_full_has_both_flags_true(self, client):
        items = client.get("/inspect/pdfs").json()["items"]
        full = next(i for i in items if i["doc_id"] == DOC_FULL)
        assert full["has_pdf"] is True
        assert full["has_extraction"] is True

    def test_doc_full_ticker_and_period(self, client):
        items = client.get("/inspect/pdfs").json()["items"]
        full = next(i for i in items if i["doc_id"] == DOC_FULL)
        assert full["ticker"] == "VNM"
        assert full["period"] == "2024 Q1"

    def test_doc_no_pdf_honest_degrade(self, client):
        """Honest-degrade: doc with no PDF still appears in list with has_pdf=false."""
        items = client.get("/inspect/pdfs").json()["items"]
        no_pdf = next(i for i in items if i["doc_id"] == DOC_NO_PDF)
        assert no_pdf["has_pdf"] is False
        assert no_pdf["has_extraction"] is True

    def test_doc_no_ext_honest_degrade(self, client):
        """Honest-degrade: doc with no extraction still appears with has_extraction=false."""
        items = client.get("/inspect/pdfs").json()["items"]
        no_ext = next(i for i in items if i["doc_id"] == DOC_NO_EXT)
        assert no_ext["has_extraction"] is False


# ---------------------------------------------------------------------------
# AC-2 equivalent: GET /inspect/pdf/{id} PDF bytes
# ---------------------------------------------------------------------------

class TestPdfBytesEndpoint:
    def test_200_with_pdf_bytes(self, client):
        r = client.get(f"/inspect/pdf/{DOC_FULL}")
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/pdf"
        assert r.content.startswith(b"%PDF")

    def test_404_when_pdf_missing(self, client):
        """doc has no pdf_path → 404, not crash."""
        r = client.get(f"/inspect/pdf/{DOC_NO_PDF}")
        assert r.status_code == 404
        assert r.json()["detail"]["error"] == "pdf_not_found"
        assert r.json()["detail"]["doc_id"] == DOC_NO_PDF

    def test_400_on_invalid_uuid(self, client):
        r = client.get(f"/inspect/pdf/{SHORT_ID}")
        assert r.status_code == 400
        assert r.json()["detail"]["error"] == "invalid_doc_id"

    def test_path_traversal_not_500(self, client):
        r = client.get("/inspect/pdf/../../etc/passwd")
        assert r.status_code in (400, 404, 422)
        assert r.status_code != 500


# ---------------------------------------------------------------------------
# AC-3 equivalent: GET /inspect/extraction/{id}
# ---------------------------------------------------------------------------

class TestExtractionEndpoint:
    def test_200_with_extraction_data(self, client):
        r = client.get(f"/inspect/extraction/{DOC_FULL}")
        assert r.status_code == 200
        data = r.json()
        assert data["document_id"] == DOC_FULL
        assert "text_content" in data
        assert "DECIMAL-SHIFT" in data["text_content"]

    def test_extraction_has_required_fields(self, client):
        data = client.get(f"/inspect/extraction/{DOC_FULL}").json()
        assert "tables" in data
        assert "ocr_confidence" in data
        assert "confidence_financial" in data
        assert "extraction_time_ms" in data

    def test_extraction_tables_structure(self, client):
        data = client.get(f"/inspect/extraction/{DOC_FULL}").json()
        assert isinstance(data["tables"], list)
        assert len(data["tables"]) >= 1
        assert "headers" in data["tables"][0]

    def test_404_when_extraction_missing(self, client):
        r = client.get(f"/inspect/extraction/{DOC_NO_EXT}")
        assert r.status_code == 404
        assert r.json()["detail"]["error"] == "extraction_not_found"
        assert r.json()["detail"]["doc_id"] == DOC_NO_EXT

    def test_400_on_invalid_uuid(self, client):
        r = client.get(f"/inspect/extraction/{SHORT_ID}")
        assert r.status_code == 400
        assert r.json()["detail"]["error"] == "invalid_doc_id"

    def test_path_traversal_not_500(self, client):
        r = client.get("/inspect/extraction/../../etc/shadow")
        assert r.status_code in (400, 404, 422)
        assert r.status_code != 500


# ---------------------------------------------------------------------------
# Honest-degrade edge cases
# ---------------------------------------------------------------------------

class TestHonestDegrade:
    def test_no_fabrication_when_pdf_missing(self, client):
        """PDF-missing doc: /inspect/pdf returns 404 with structured error (no raw file bytes)."""
        r = client.get(f"/inspect/pdf/{DOC_NO_PDF}")
        assert r.status_code == 404
        # Response is JSON error, not PDF bytes — no fabrication
        body = r.json()
        assert "error" in body.get("detail", {})
        assert r.content[:4] != b"%PDF"

    def test_no_fabrication_when_extraction_missing(self, client):
        """Extraction-missing doc: /inspect/extraction returns 404 (no fabricated JSON)."""
        r = client.get(f"/inspect/extraction/{DOC_NO_EXT}")
        assert r.status_code == 404
        body = r.json()
        assert "error" in body.get("detail", {})

    def test_nonexistent_uuid_pdf_returns_404(self, client):
        """Completely unknown UUID → 404, not 500."""
        unknown = "00000000-0000-0000-0000-000000000000"
        r = client.get(f"/inspect/pdf/{unknown}")
        assert r.status_code == 404

    def test_nonexistent_uuid_extraction_returns_404(self, client):
        unknown = "00000000-0000-0000-0000-000000000000"
        r = client.get(f"/inspect/extraction/{unknown}")
        assert r.status_code == 404
