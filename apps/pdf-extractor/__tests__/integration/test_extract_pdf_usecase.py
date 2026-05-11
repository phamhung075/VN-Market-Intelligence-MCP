"""
Integration tests — ExtractPDFUseCase with real SQLite, mocked HTTP + engine.

Tests verify: use case → domain service → real repository → response DTO.
"""

import pytest
import os
import sys
import tempfile
from unittest.mock import AsyncMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from application.usecases import ExtractPDFUseCase
from application.dtos import ExtractPDFRequest
from domain.services import ExtractPDFService
from domain.models import ExtractedTable
from infrastructure.repositories import SQLitePDFDocumentRepository


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def tmp_db(tmp_path):
    return str(tmp_path / "test_extractor.db")


def build_usecase(db_path: str, engine: AsyncMock, storage_repo: AsyncMock) -> ExtractPDFUseCase:
    doc_repo = SQLitePDFDocumentRepository(db_path=db_path)
    domain_service = ExtractPDFService(doc_repo, storage_repo, engine)
    return ExtractPDFUseCase(extract_service=domain_service)


def make_engine_success(tables=None) -> AsyncMock:
    engine = AsyncMock()
    engine.extract_tables.return_value = tables or [
        ExtractedTable(
            table_index=0,
            headers=["Revenue", "Profit"],
            rows=[["2025", "1000000"]],
            page_number=0,
        )
    ]
    engine.extract_text_ocr.return_value = ("Extracted financial data", 0.95)
    return engine


def make_storage_success() -> AsyncMock:
    storage = AsyncMock()
    storage.fetch_pdf.return_value = b"mock-pdf-bytes"
    storage.store_extraction.return_value = "/tmp/fake/output.json"
    return storage


# ---------------------------------------------------------------------------
# Tests: happy path
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestExtractPDFUseCaseIntegration:

    async def test_happy_path_returns_success_status(self, tmp_db):
        engine = make_engine_success()
        storage = make_storage_success()
        usecase = build_usecase(tmp_db, engine, storage)

        request = ExtractPDFRequest(url="http://example.com/bctc.pdf", source_type="bctc")
        response = await usecase.execute(request)

        assert response.status == "success"
        assert response.document_id

    async def test_happy_path_returns_tables(self, tmp_db):
        engine = make_engine_success()
        storage = make_storage_success()
        usecase = build_usecase(tmp_db, engine, storage)

        request = ExtractPDFRequest(url="http://example.com/bctc.pdf", source_type="bctc")
        response = await usecase.execute(request)

        assert len(response.tables) == 1
        assert response.tables[0].headers == ["Revenue", "Profit"]

    async def test_happy_path_persists_document_in_sqlite(self, tmp_db):
        engine = make_engine_success()
        storage = make_storage_success()
        usecase = build_usecase(tmp_db, engine, storage)

        request = ExtractPDFRequest(url="http://example.com/bctc.pdf", source_type="bctc")
        response = await usecase.execute(request)

        # Read back from the same SQLite DB
        doc_repo = SQLitePDFDocumentRepository(db_path=tmp_db)
        doc = await doc_repo.find_by_id(response.document_id)

        assert doc is not None
        assert doc.status == "success"
        assert doc.url == "http://example.com/bctc.pdf"

    async def test_happy_path_document_has_extracted_at_set(self, tmp_db):
        engine = make_engine_success()
        storage = make_storage_success()
        usecase = build_usecase(tmp_db, engine, storage)

        request = ExtractPDFRequest(url="http://example.com/bctc.pdf", source_type="bctc")
        response = await usecase.execute(request)

        doc_repo = SQLitePDFDocumentRepository(db_path=tmp_db)
        doc = await doc_repo.find_by_id(response.document_id)
        assert doc is not None
        assert doc.extracted_at is not None

    async def test_returns_document_id_in_response(self, tmp_db):
        engine = make_engine_success()
        storage = make_storage_success()
        usecase = build_usecase(tmp_db, engine, storage)

        request = ExtractPDFRequest(url="http://example.com/bctc.pdf", source_type="bctc")
        response = await usecase.execute(request)

        assert len(response.document_id) > 0


# ---------------------------------------------------------------------------
# Tests: error cases
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestExtractPDFUseCaseErrorCases:

    async def test_failed_response_on_download_error(self, tmp_db):
        engine = make_engine_success()
        storage = AsyncMock()
        storage.fetch_pdf.side_effect = Exception("Connection refused")
        storage.store_extraction.return_value = "/tmp/x.json"

        usecase = build_usecase(tmp_db, engine, storage)
        request = ExtractPDFRequest(url="http://bad-host.example/doc.pdf", source_type="bctc")
        response = await usecase.execute(request)

        assert response.status == "failed"
        assert response.tables == []

    async def test_failed_response_on_low_quality(self, tmp_db):
        engine = AsyncMock()
        engine.extract_tables.return_value = []
        engine.extract_text_ocr.return_value = ("", 0.2)

        storage = make_storage_success()
        usecase = build_usecase(tmp_db, engine, storage)

        request = ExtractPDFRequest(url="http://example.com/blurry.pdf", source_type="bctc")
        response = await usecase.execute(request)

        assert response.status == "failed"

    async def test_failed_document_persisted_in_sqlite(self, tmp_db):
        engine = AsyncMock()
        engine.extract_tables.return_value = []
        engine.extract_text_ocr.return_value = ("", 0.1)

        storage = make_storage_success()
        usecase = build_usecase(tmp_db, engine, storage)

        request = ExtractPDFRequest(url="http://example.com/bad.pdf", source_type="bctc")
        response = await usecase.execute(request)

        doc_repo = SQLitePDFDocumentRepository(db_path=tmp_db)
        doc = await doc_repo.find_by_id(response.document_id)
        assert doc is not None
        assert doc.status == "failed"

    async def test_multiple_extractions_independent(self, tmp_db):
        """Two separate extraction requests should produce two separate document ids."""
        engine = make_engine_success()
        storage = make_storage_success()
        usecase = build_usecase(tmp_db, engine, storage)

        r1 = await usecase.execute(
            ExtractPDFRequest(url="http://example.com/doc1.pdf", source_type="bctc")
        )
        r2 = await usecase.execute(
            ExtractPDFRequest(url="http://example.com/doc2.pdf", source_type="bctc")
        )

        assert r1.document_id != r2.document_id
        assert r1.status == "success"
        assert r2.status == "success"
