"""
Domain — ExtractPDFService: pure business logic for PDF extraction pipeline.

Domain layer: no imports from infrastructure/ or interface/.
All I/O happens through injected port abstractions.
"""

from datetime import datetime
from typing import Optional

from domain.models import PDFDocument, ExtractedContent
from domain.repositories import PDFDocumentRepository, PDFStorageRepository, PDFExtractionEngine
from domain.errors import PDFProcessingError, PDFNotFoundError, PDFLowQualityError

# validate_financial_figures lives in domain/primitives/validate_financial_figures/ (P1-B1).
# Used below (content.confidence_financial). External callers must import from domain.primitives directly.
from domain.primitives.validate_financial_figures import validate_financial_figures

# Minimum OCR confidence below which we require at least one table to be found.
# If both conditions fail simultaneously the extraction is considered too low quality.
_OCR_CONFIDENCE_THRESHOLD = 0.5


class ExtractPDFService:
    """
    Domain service: orchestrates the core PDF extraction business logic.

    Collaborators are injected as ports — never instantiated directly here.
    Pipeline: find document → mark processing → fetch bytes → extract → validate → store → mark success.
    """

    def __init__(
        self,
        doc_repo: PDFDocumentRepository,
        storage_repo: PDFStorageRepository,
        engine: PDFExtractionEngine,
    ) -> None:
        self.doc_repo = doc_repo
        self.storage_repo = storage_repo
        self.engine = engine

    async def process_pdf(self, doc_id: str) -> ExtractedContent:
        """
        Execute the full extraction pipeline for the given document id.

        Raises:
            PDFNotFoundError: document not registered.
            PDFLowQualityError: extraction quality below threshold.
            PDFProcessingError: any other processing failure.
        """
        # 1. Load document metadata
        doc = await self.doc_repo.find_by_id(doc_id)
        if not doc:
            raise PDFNotFoundError(f"Document {doc_id} not found")

        # 2. Mark as in-progress so concurrent callers skip it
        doc.status = "processing"
        await self.doc_repo.save(doc)

        try:
            # 3. Fetch raw bytes (port call — no HTTP knowledge in domain)
            pdf_bytes = await self.storage_repo.fetch_pdf(doc.url)

            # 4. Extract tables + text (port call — no pdfplumber knowledge here)
            start = datetime.now()
            tables = await self.engine.extract_tables(pdf_bytes)
            text, ocr_conf = await self.engine.extract_text_ocr(pdf_bytes)
            extraction_time_ms = int((datetime.now() - start).total_seconds() * 1000)

            # 5. Quality gate: reject when confidence is low AND no tables found
            if ocr_conf < _OCR_CONFIDENCE_THRESHOLD and not tables:
                raise PDFLowQualityError(
                    f"Extraction quality too low: confidence={ocr_conf:.2f}, tables=0"
                )

            # 6. Build result value object
            content = ExtractedContent(
                document_id=doc_id,
                tables=tables,
                text_content=text,
                ocr_confidence=ocr_conf,
                extraction_time_ms=extraction_time_ms,
            )

            # 6b. Financial validation (Task 1345b) — pure function, no I/O.
            # Financial figure values are not parsed at this layer (that occurs
            # in the MCP server parseBctcReport use case). Passing None here
            # is correct: None values are skipped by the validator (returns 1.0).
            # Downstream callers that DO have parsed figures must call
            # validate_financial_figures() directly and update confidence_financial.
            content.confidence_financial = validate_financial_figures(
                total_assets=None,
                total_equity=None,
                total_liabilities=None,
                operating_margin=None,
                net_revenue=None,
            )

            # 7. Persist extraction (port call — no file I/O in domain)
            await self.storage_repo.store_extraction(doc_id, content)

            # 8. Mark document as completed
            doc.status = "success"
            doc.extracted_at = datetime.now()
            await self.doc_repo.save(doc)

            return content

        except PDFProcessingError:
            # Re-raise domain errors after updating status
            doc.status = "failed"
            await self.doc_repo.save(doc)
            raise
        except Exception as exc:
            doc.status = "failed"
            await self.doc_repo.save(doc)
            raise PDFProcessingError(f"Unexpected error: {exc}") from exc
