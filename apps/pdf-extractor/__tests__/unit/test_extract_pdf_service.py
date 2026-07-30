"""
Unit tests — ExtractPDFService (domain layer).

All ports (doc_repo, storage_repo, engine) are AsyncMock.
Tests cover: happy path, not-found, low quality, unexpected errors, status transitions.
"""

import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

# Adjust sys.path so relative imports work when run from apps/pdf-extractor/
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from domain.services import ExtractPDFService
from domain.models import PDFDocument, ExtractedTable, ExtractedContent
from domain.errors import (
    PDFProcessingError,
    PDFNotFoundError,
    PDFLowQualityError,
    OcrPageFailedError,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mocked_ports():
    doc_repo = AsyncMock()
    storage_repo = AsyncMock()
    engine = AsyncMock()
    service = ExtractPDFService(doc_repo, storage_repo, engine)
    return {
        "service": service,
        "doc_repo": doc_repo,
        "storage_repo": storage_repo,
        "engine": engine,
    }


def make_doc(doc_id: str = "doc-001", status: str = "pending") -> PDFDocument:
    return PDFDocument(
        id=doc_id,
        url="http://example.com/report.pdf",
        source_type="bctc",
        status=status,
    )


def make_table(table_index: int = 0) -> ExtractedTable:
    return ExtractedTable(
        table_index=table_index,
        headers=["Revenue", "Profit"],
        rows=[["2025", "1_000_000"]],
        page_number=1,
    )


# ---------------------------------------------------------------------------
# Test cases
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestExtractPDFServiceHappyPath:

    async def test_returns_extracted_content_on_success(self, mocked_ports):
        p = mocked_ports
        doc = make_doc("doc-001")
        p["doc_repo"].find_by_id.return_value = doc
        p["storage_repo"].fetch_pdf.return_value = b"PDF bytes"
        p["engine"].extract_tables.return_value = [make_table()]
        p["engine"].extract_text_ocr.return_value = ("Revenue data", 0.95)

        result = await p["service"].process_pdf("doc-001")

        assert result.document_id == "doc-001"
        assert len(result.tables) == 1
        assert result.ocr_confidence == 0.95
        assert result.text_content == "Revenue data"

    async def test_marks_document_success(self, mocked_ports):
        p = mocked_ports
        doc = make_doc("doc-002")
        p["doc_repo"].find_by_id.return_value = doc
        p["storage_repo"].fetch_pdf.return_value = b"bytes"
        p["engine"].extract_tables.return_value = [make_table()]
        p["engine"].extract_text_ocr.return_value = ("text", 0.9)

        await p["service"].process_pdf("doc-002")

        # last save call should mark success
        last_call_args = p["doc_repo"].save.call_args_list[-1]
        saved_doc: PDFDocument = last_call_args[0][0]
        assert saved_doc.status == "success"
        assert saved_doc.extracted_at is not None

    async def test_calls_ports_in_correct_order(self, mocked_ports):
        """Ensure fetch_pdf is called before extract_tables."""
        p = mocked_ports
        call_order: list[str] = []

        async def mock_fetch(url: str) -> bytes:
            call_order.append("fetch_pdf")
            return b"bytes"

        async def mock_extract_tables(pdf_bytes: bytes) -> list[ExtractedTable]:
            call_order.append("extract_tables")
            return [make_table()]

        p["storage_repo"].fetch_pdf.side_effect = mock_fetch
        p["engine"].extract_tables.side_effect = mock_extract_tables
        p["engine"].extract_text_ocr.return_value = ("text", 1.0)
        p["doc_repo"].find_by_id.return_value = make_doc()

        await p["service"].process_pdf("doc-001")

        assert call_order == ["fetch_pdf", "extract_tables"]

    async def test_store_extraction_called_with_content(self, mocked_ports):
        p = mocked_ports
        p["doc_repo"].find_by_id.return_value = make_doc()
        p["storage_repo"].fetch_pdf.return_value = b"bytes"
        p["engine"].extract_tables.return_value = [make_table()]
        p["engine"].extract_text_ocr.return_value = ("text", 0.9)

        await p["service"].process_pdf("doc-001")

        p["storage_repo"].store_extraction.assert_called_once()
        args = p["storage_repo"].store_extraction.call_args[0]
        assert args[0] == "doc-001"
        assert isinstance(args[1], ExtractedContent)


@pytest.mark.asyncio
class TestExtractPDFServiceErrorCases:

    async def test_raises_not_found_when_doc_missing(self, mocked_ports):
        p = mocked_ports
        p["doc_repo"].find_by_id.return_value = None

        with pytest.raises(PDFNotFoundError):
            await p["service"].process_pdf("nonexistent")

    async def test_raises_low_quality_when_confidence_low_and_no_tables(self, mocked_ports):
        p = mocked_ports
        p["doc_repo"].find_by_id.return_value = make_doc()
        p["storage_repo"].fetch_pdf.return_value = b"bytes"
        p["engine"].extract_tables.return_value = []
        p["engine"].extract_text_ocr.return_value = ("", 0.3)

        with pytest.raises(PDFLowQualityError):
            await p["service"].process_pdf("doc-001")

    async def test_does_not_raise_low_quality_when_tables_present(self, mocked_ports):
        """Low confidence is acceptable if tables were extracted."""
        p = mocked_ports
        p["doc_repo"].find_by_id.return_value = make_doc()
        p["storage_repo"].fetch_pdf.return_value = b"bytes"
        p["engine"].extract_tables.return_value = [make_table()]
        p["engine"].extract_text_ocr.return_value = ("", 0.2)

        result = await p["service"].process_pdf("doc-001")
        assert len(result.tables) == 1

    async def test_marks_document_failed_on_low_quality(self, mocked_ports):
        p = mocked_ports
        p["doc_repo"].find_by_id.return_value = make_doc()
        p["storage_repo"].fetch_pdf.return_value = b"bytes"
        p["engine"].extract_tables.return_value = []
        p["engine"].extract_text_ocr.return_value = ("", 0.3)

        with pytest.raises(PDFLowQualityError):
            await p["service"].process_pdf("doc-001")

        last_call_args = p["doc_repo"].save.call_args_list[-1]
        assert last_call_args[0][0].status == "failed"

    async def test_marks_failed_on_fetch_error(self, mocked_ports):
        p = mocked_ports
        p["doc_repo"].find_by_id.return_value = make_doc()
        p["storage_repo"].fetch_pdf.side_effect = Exception("Network timeout")

        with pytest.raises(PDFProcessingError):
            await p["service"].process_pdf("doc-001")

        last_call_args = p["doc_repo"].save.call_args_list[-1]
        assert last_call_args[0][0].status == "failed"

    async def test_marks_processing_before_fetch(self, mocked_ports):
        """Document must be marked 'processing' before any I/O starts."""
        p = mocked_ports
        statuses_at_fetch: list[str] = []

        async def capture_fetch(url: str) -> bytes:
            statuses_at_fetch.append(p["doc_repo"].save.call_args_list[-1][0][0].status)
            return b"bytes"

        p["doc_repo"].find_by_id.return_value = make_doc()
        p["storage_repo"].fetch_pdf.side_effect = capture_fetch
        p["engine"].extract_tables.return_value = [make_table()]
        p["engine"].extract_text_ocr.return_value = ("text", 0.9)

        await p["service"].process_pdf("doc-001")

        assert statuses_at_fetch == ["processing"]

    # -----------------------------------------------------------------
    # FIX-PDFX-EXTRACTION-ENGINE-EMPTY-STRING-SWALLOW
    # AC1: an OCR failure must be distinguishable "all the way to whatever
    # stores or serves the page" — i.e. it must reach process_pdf(), mark
    # the document failed, and NEVER reach store_extraction() as if it were
    # a successful (if hollow) extraction.
    # -----------------------------------------------------------------

    async def test_ocr_page_failed_error_marks_document_failed_and_reraises(self, mocked_ports):
        p = mocked_ports
        p["doc_repo"].find_by_id.return_value = make_doc()
        p["storage_repo"].fetch_pdf.return_value = b"bytes"
        p["engine"].extract_tables.return_value = [make_table()]  # has a table
        p["engine"].extract_text_ocr.side_effect = OcrPageFailedError(
            "OCR failed for page (tesseract crash)"
        )

        with pytest.raises(OcrPageFailedError):
            await p["service"].process_pdf("doc-001")

        last_call_args = p["doc_repo"].save.call_args_list[-1]
        assert last_call_args[0][0].status == "failed"

    async def test_ocr_page_failed_error_never_reaches_store_extraction(self, mocked_ports):
        """
        The defect this row closes: previously a swallowed OCR failure
        returned ("", 0.0), which — combined with a present table — PASSED
        the quality gate at line 71 and was persisted via store_extraction()
        as a successful extraction. With the fix, the error now short-
        circuits before the quality gate is ever evaluated.
        """
        p = mocked_ports
        p["doc_repo"].find_by_id.return_value = make_doc()
        p["storage_repo"].fetch_pdf.return_value = b"bytes"
        p["engine"].extract_tables.return_value = [make_table()]  # has a table
        p["engine"].extract_text_ocr.side_effect = OcrPageFailedError(
            "OCR failed for page (tesseract crash)"
        )

        with pytest.raises(OcrPageFailedError):
            await p["service"].process_pdf("doc-001")

        p["storage_repo"].store_extraction.assert_not_called()

    async def test_extraction_time_positive(self, mocked_ports):
        p = mocked_ports
        p["doc_repo"].find_by_id.return_value = make_doc()
        p["storage_repo"].fetch_pdf.return_value = b"bytes"
        p["engine"].extract_tables.return_value = [make_table()]
        p["engine"].extract_text_ocr.return_value = ("text", 0.9)

        result = await p["service"].process_pdf("doc-001")
        assert result.extraction_time_ms >= 0
