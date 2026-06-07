"""
Unit tests — FEAT-PDF-EXTRACTOR-LOCAL-INPUT

RED → GREEN cycle for local-file input mode on POST /extract.

Coverage:
  (a) pdf_path happy-path: LocalPDFStorageRepository reads file, returns bytes.
  (b) traversal rejection: path outside /app/data/pdfs raises PDFDownloadError.
  (c) missing-file: non-existent path raises PDFDownloadError.
  (d) url-mode regression: url-only request still routed to HTTP storage repo.
  (e) ExtractPDFRequestSchema validation: pdf_path accepted, url still required alone.
  (f) /extract handler wiring: pdf_path body routes to local_extract_usecase.
  (g) Size cap: file exceeding PDF_LOCAL_SIZE_CAP_MB raises PDFDownloadError.
  (h) Traversal via symlink/resolved path: ../etc/passwd rejected.
"""

import os
import sys
import tempfile
import pytest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from infrastructure.repositories import LocalPDFStorageRepository
from domain.errors import PDFDownloadError
from interface.serializers import ExtractPDFRequestSchema


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def pdf_data_dir(tmp_path):
    """Simulated /app/data/pdfs volume directory."""
    d = tmp_path / "pdfs"
    d.mkdir()
    return str(d)


@pytest.fixture
def small_pdf(pdf_data_dir):
    """A valid-enough small PDF file (minimal bytes, not real PDF content)."""
    p = Path(pdf_data_dir) / "test_report.pdf"
    p.write_bytes(b"%PDF-1.4 fake pdf content for testing")
    return str(p)


@pytest.fixture
def local_repo(pdf_data_dir):
    return LocalPDFStorageRepository(
        storage_dir="/tmp/test_extractions",
        pdf_data_dir=pdf_data_dir,
    )


# ---------------------------------------------------------------------------
# (a) happy path: fetch_pdf with valid local path returns bytes
# ---------------------------------------------------------------------------

class TestLocalPDFStorageRepositoryHappyPath:

    @pytest.mark.asyncio
    async def test_fetch_pdf_returns_bytes_for_valid_path(self, local_repo, small_pdf):
        result = await local_repo.fetch_pdf(small_pdf)
        assert isinstance(result, bytes)
        assert len(result) > 0

    @pytest.mark.asyncio
    async def test_fetch_pdf_returns_correct_content(self, local_repo, small_pdf):
        expected = Path(small_pdf).read_bytes()
        result = await local_repo.fetch_pdf(small_pdf)
        assert result == expected

    @pytest.mark.asyncio
    async def test_fetch_pdf_accepts_path_within_data_dir(self, pdf_data_dir, small_pdf):
        repo = LocalPDFStorageRepository(
            storage_dir="/tmp/test_extractions",
            pdf_data_dir=pdf_data_dir,
        )
        result = await repo.fetch_pdf(small_pdf)
        assert isinstance(result, bytes)


# ---------------------------------------------------------------------------
# (b) traversal rejection
# ---------------------------------------------------------------------------

class TestLocalPDFStorageRepositoryTraversalRejection:

    @pytest.mark.asyncio
    async def test_rejects_path_above_data_dir(self, local_repo, pdf_data_dir):
        """Path resolving outside /app/data/pdfs prefix must be rejected."""
        traversal_path = os.path.join(pdf_data_dir, "..", "..", "etc", "passwd")
        with pytest.raises(PDFDownloadError) as exc_info:
            await local_repo.fetch_pdf(traversal_path)
        assert "traversal" in str(exc_info.value).lower() or "allowed" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_rejects_absolute_path_outside_data_dir(self, local_repo):
        """An absolute path not under pdf_data_dir must be rejected."""
        outside_path = "/etc/passwd"
        with pytest.raises(PDFDownloadError) as exc_info:
            await local_repo.fetch_pdf(outside_path)
        assert "traversal" in str(exc_info.value).lower() or "allowed" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_rejects_sibling_directory_path(self, local_repo, pdf_data_dir, tmp_path):
        """A path in a sibling directory (same parent, different name) must be rejected."""
        sibling = tmp_path / "secret_dir" / "secret.pdf"
        sibling.parent.mkdir(parents=True, exist_ok=True)
        sibling.write_bytes(b"secret")
        with pytest.raises(PDFDownloadError):
            await local_repo.fetch_pdf(str(sibling))


# ---------------------------------------------------------------------------
# (c) missing file → 404-class error
# ---------------------------------------------------------------------------

class TestLocalPDFStorageRepositoryMissingFile:

    @pytest.mark.asyncio
    async def test_raises_on_missing_file(self, local_repo, pdf_data_dir):
        missing = os.path.join(pdf_data_dir, "does_not_exist.pdf")
        with pytest.raises(PDFDownloadError) as exc_info:
            await local_repo.fetch_pdf(missing)
        assert "not found" in str(exc_info.value).lower() or "does not exist" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_error_message_includes_path(self, local_repo, pdf_data_dir):
        missing = os.path.join(pdf_data_dir, "missing_report.pdf")
        with pytest.raises(PDFDownloadError) as exc_info:
            await local_repo.fetch_pdf(missing)
        assert "missing_report.pdf" in str(exc_info.value)


# ---------------------------------------------------------------------------
# (g) size cap
# ---------------------------------------------------------------------------

class TestLocalPDFStorageRepositorySizeCap:

    @pytest.mark.asyncio
    async def test_raises_when_file_exceeds_size_cap(self, pdf_data_dir):
        """A file larger than size_cap_mb must raise PDFDownloadError."""
        big_pdf = Path(pdf_data_dir) / "big_report.pdf"
        # Write 2 bytes over a 0-MB cap to test without touching disk heavily
        big_pdf.write_bytes(b"x" * 10)
        repo = LocalPDFStorageRepository(
            storage_dir="/tmp/test_extractions",
            pdf_data_dir=pdf_data_dir,
            size_cap_mb=0,  # 0 MB cap = any non-empty file is too large
        )
        with pytest.raises(PDFDownloadError) as exc_info:
            await repo.fetch_pdf(str(big_pdf))
        assert "size" in str(exc_info.value).lower() or "cap" in str(exc_info.value).lower() or "large" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_no_error_when_file_within_size_cap(self, pdf_data_dir):
        """A file smaller than size_cap_mb must pass through normally."""
        small = Path(pdf_data_dir) / "small.pdf"
        small.write_bytes(b"%PDF tiny")
        repo = LocalPDFStorageRepository(
            storage_dir="/tmp/test_extractions",
            pdf_data_dir=pdf_data_dir,
            size_cap_mb=500,  # 500 MB cap — any reasonable test PDF is fine
        )
        result = await repo.fetch_pdf(str(small))
        assert isinstance(result, bytes)


# ---------------------------------------------------------------------------
# (d) url-mode regression — ExtractPDFRequestSchema still validates url-only requests
# ---------------------------------------------------------------------------

class TestExtractPDFRequestSchemaUrlRegression:

    def test_url_only_request_still_valid(self):
        schema = ExtractPDFRequestSchema(url="https://example.com/report.pdf")
        assert schema.url == "https://example.com/report.pdf"
        assert schema.pdf_path is None

    def test_url_empty_string_still_rejected(self):
        import pydantic
        with pytest.raises((ValueError, pydantic.ValidationError)):
            ExtractPDFRequestSchema(url="")

    def test_to_dto_url_mode_preserves_url(self):
        schema = ExtractPDFRequestSchema(url="https://example.com/report.pdf")
        dto = schema.to_dto()
        assert dto.url == "https://example.com/report.pdf"
        assert dto.pdf_path is None


# ---------------------------------------------------------------------------
# (e) ExtractPDFRequestSchema — pdf_path accepted
# ---------------------------------------------------------------------------

class TestExtractPDFRequestSchemaPdfPath:

    def test_pdf_path_accepted_without_url(self):
        schema = ExtractPDFRequestSchema(pdf_path="/app/data/pdfs/report.pdf")
        assert schema.pdf_path == "/app/data/pdfs/report.pdf"

    def test_pdf_path_to_dto_carries_pdf_path(self):
        schema = ExtractPDFRequestSchema(pdf_path="/app/data/pdfs/report.pdf")
        dto = schema.to_dto()
        assert dto.pdf_path == "/app/data/pdfs/report.pdf"

    def test_pdf_path_to_dto_url_is_empty_sentinel(self):
        """url field should be empty string (sentinel) when pdf_path is provided."""
        schema = ExtractPDFRequestSchema(pdf_path="/app/data/pdfs/report.pdf")
        dto = schema.to_dto()
        # url must be set to something (sentinel) — not raise
        assert dto.url is not None

    def test_neither_url_nor_pdf_path_raises_validation_error(self):
        import pydantic
        with pytest.raises((ValueError, pydantic.ValidationError)):
            ExtractPDFRequestSchema()

    def test_both_url_and_pdf_path_accepted(self):
        """If both provided, schema is valid (handler picks pdf_path mode)."""
        schema = ExtractPDFRequestSchema(
            url="https://example.com/report.pdf",
            pdf_path="/app/data/pdfs/report.pdf",
        )
        assert schema.pdf_path == "/app/data/pdfs/report.pdf"
        assert schema.url == "https://example.com/report.pdf"


# ---------------------------------------------------------------------------
# (f) /extract handler wiring: pdf_path body routes to local_extract_usecase
# ---------------------------------------------------------------------------

class TestExtractHandlerRouting:
    """
    Verify that when pdf_path is set in the request body, the handler uses
    local_extract_usecase (not the HTTP extract_usecase).

    Approach: mock both usecases; verify only local one was called.
    """

    @pytest.mark.asyncio
    async def test_pdf_path_request_calls_local_usecase(self):
        from fastapi import APIRouter
        from fastapi.testclient import TestClient
        from fastapi import FastAPI
        from interface.handlers import register_routes
        from unittest.mock import AsyncMock

        http_usecase = AsyncMock()
        local_usecase = AsyncMock()
        inspection_store = MagicMock()
        inspection_store.list_docs.return_value = []

        # local_usecase.execute returns a valid response DTO
        from application.dtos import ExtractPDFResponse
        local_usecase.execute.return_value = ExtractPDFResponse(
            document_id="local-doc-1",
            tables=[],
            text_content="local text",
            ocr_confidence=0.9,
            extraction_time_ms=100,
            status="success",
        )

        app = FastAPI()
        router = APIRouter()
        register_routes(
            router,
            extract_usecase=http_usecase,
            inspection_store=inspection_store,
            local_extract_usecase=local_usecase,
        )
        app.include_router(router)

        client = TestClient(app)
        resp = client.post(
            "/extract",
            json={"pdf_path": "/app/data/pdfs/report.pdf"},
        )

        # local usecase was called; HTTP usecase was not
        local_usecase.execute.assert_called_once()
        http_usecase.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_url_only_request_calls_http_usecase(self):
        from fastapi import APIRouter
        from fastapi.testclient import TestClient
        from fastapi import FastAPI
        from interface.handlers import register_routes
        from unittest.mock import AsyncMock

        http_usecase = AsyncMock()
        local_usecase = AsyncMock()
        inspection_store = MagicMock()
        inspection_store.list_docs.return_value = []

        from application.dtos import ExtractPDFResponse
        http_usecase.execute.return_value = ExtractPDFResponse(
            document_id="http-doc-1",
            tables=[],
            text_content="http text",
            ocr_confidence=0.9,
            extraction_time_ms=100,
            status="success",
        )

        app = FastAPI()
        router = APIRouter()
        register_routes(
            router,
            extract_usecase=http_usecase,
            inspection_store=inspection_store,
            local_extract_usecase=local_usecase,
        )
        app.include_router(router)

        client = TestClient(app)
        resp = client.post(
            "/extract",
            json={"url": "https://example.com/report.pdf"},
        )

        http_usecase.execute.assert_called_once()
        local_usecase.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_pdf_path_response_includes_document_id(self):
        from fastapi import APIRouter
        from fastapi.testclient import TestClient
        from fastapi import FastAPI
        from interface.handlers import register_routes
        from unittest.mock import AsyncMock

        local_usecase = AsyncMock()
        http_usecase = AsyncMock()
        inspection_store = MagicMock()
        inspection_store.list_docs.return_value = []

        from application.dtos import ExtractPDFResponse
        local_usecase.execute.return_value = ExtractPDFResponse(
            document_id="expected-id-123",
            tables=[],
            text_content="",
            ocr_confidence=0.85,
            extraction_time_ms=200,
            status="success",
        )

        app = FastAPI()
        router = APIRouter()
        register_routes(
            router,
            extract_usecase=http_usecase,
            inspection_store=inspection_store,
            local_extract_usecase=local_usecase,
        )
        app.include_router(router)

        client = TestClient(app)
        resp = client.post(
            "/extract",
            json={"pdf_path": "/app/data/pdfs/report.pdf"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["document_id"] == "expected-id-123"
