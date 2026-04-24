"""
Application — ExtractPDFUseCase: orchestrates domain service + repository setup.

Application layer: imports domain/, receives injected infrastructure ports.
No HTTP or DB knowledge here — only orchestration.
"""

from uuid import uuid4

from application.dtos import ExtractPDFRequest, ExtractPDFResponse, ExtractedTableDTO
from domain.models import PDFDocument
from domain.services import ExtractPDFService
from domain.errors import PDFProcessingError


class ExtractPDFUseCase:
    """
    Application use case: create document record, run extraction pipeline,
    map result to response DTO.

    The `extract_service` already holds all port references (doc_repo,
    storage_repo, engine) so we only need one injection point here.
    """

    def __init__(self, extract_service: ExtractPDFService) -> None:
        self.extract_service = extract_service

    async def execute(self, request: ExtractPDFRequest) -> ExtractPDFResponse:
        """
        High-level orchestration:
        1. Assign a new document id.
        2. Persist initial PDFDocument (pending status).
        3. Delegate to domain service for the extraction pipeline.
        4. Convert domain result → response DTO.

        On PDFProcessingError: returns a failed response DTO (no re-raise)
        so the HTTP handler can serialize cleanly without an uncaught exception.
        """
        doc_id = str(uuid4())
        doc = PDFDocument(
            id=doc_id,
            url=request.url,
            source_type=request.source_type,
            status="pending",
        )
        # Persist so the domain service can find_by_id later
        await self.extract_service.doc_repo.save(doc)

        try:
            content = await self.extract_service.process_pdf(doc_id)

            return ExtractPDFResponse(
                document_id=content.document_id,
                tables=[
                    ExtractedTableDTO(
                        table_index=t.table_index,
                        headers=t.headers,
                        rows=t.rows,
                        page_number=t.page_number,
                    )
                    for t in content.tables
                ],
                text_content=content.text_content,
                ocr_confidence=content.ocr_confidence,
                extraction_time_ms=content.extraction_time_ms,
                status="success",
            )

        except PDFProcessingError:
            return ExtractPDFResponse(
                document_id=doc_id,
                tables=[],
                text_content="",
                ocr_confidence=0.0,
                extraction_time_ms=0,
                status="failed",
            )
