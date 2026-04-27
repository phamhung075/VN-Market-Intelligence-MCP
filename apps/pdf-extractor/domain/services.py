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

# Minimum OCR confidence below which we require at least one table to be found.
# If both conditions fail simultaneously the extraction is considered too low quality.
_OCR_CONFIDENCE_THRESHOLD = 0.5

# ─────────────────────────────────────────────────────────────────────────────
# Financial Validation — Task 1345b
# ─────────────────────────────────────────────────────────────────────────────

def validate_financial_figures(
    total_assets: Optional[float],
    total_equity: Optional[float],
    total_liabilities: Optional[float],
    operating_margin: Optional[float],
    net_revenue: Optional[float],
) -> float:
    """
    Validate extracted BCTC financial figures against accounting rules.

    Returns a confidence score in [0.0, 1.0]:
      1.0  — all figures pass all rules
      0.0  — at least one hard violation (accounting identity impossible)
      0.1+ — soft violations stack, floor at 0.1

    Hard violations (return 0.0 immediately):
      BCTC-VAL-01: total_assets < total_equity (accounting identity broken)
                   Example: VNM Q4 2024 assets=957T equity=18829T → 0.0
      BCTC-VAL-02: total_assets < 0 (impossible in real accounting)
      BCTC-VAL-04: total_liabilities < 0 (impossible in real accounting)

    Soft violations (-0.2 each, stacked, floor 0.1):
      BCTC-VAL-03: operating_margin outside (-5.0, +1.0) as ratio (not %)
                   Example: VEA Q4 2024 margin=3.3 (330%) → -0.2
      BCTC-VAL-05: net_revenue <= 0 (non-holding company with no revenue)
      BCTC-VAL-06: equity < 0 (negative equity — suspicious for BCTC extraction)

    None values are skipped — partial extraction is not penalized.

    Args:
        total_assets:      Total assets from balance sheet (billion VND)
        total_equity:      Total equity from balance sheet (billion VND)
        total_liabilities: Total liabilities from balance sheet (billion VND)
        operating_margin:  Operating profit / net revenue (ratio, not percentage)
        net_revenue:       Net revenue from income statement (billion VND)

    Returns:
        float in [0.0, 1.0]
    """
    # ── Hard violations ───────────────────────────────────────────────────────

    # BCTC-VAL-01: assets < equity (accounting identity: A = L + E must hold)
    if (
        total_assets is not None
        and total_equity is not None
        and total_assets > 0
        and total_equity > 0
        and total_assets < total_equity
    ):
        return 0.0

    # BCTC-VAL-02: negative total assets
    if total_assets is not None and total_assets < 0:
        return 0.0

    # BCTC-VAL-04: negative total liabilities
    if total_liabilities is not None and total_liabilities < 0:
        return 0.0

    # ── Soft violations ───────────────────────────────────────────────────────
    penalty = 0.0

    # BCTC-VAL-03: operating margin outside normal range (-5.0, +1.0) as ratio
    if operating_margin is not None and not (-5.0 < operating_margin < 1.0):
        penalty += 0.2

    # BCTC-VAL-05: net revenue <= 0
    if net_revenue is not None and net_revenue <= 0:
        penalty += 0.2

    # BCTC-VAL-06: equity < 0
    if total_equity is not None and total_equity < 0:
        penalty += 0.2

    confidence = 1.0 - penalty
    return max(confidence, 0.1)


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
