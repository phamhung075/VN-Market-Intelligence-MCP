"""
Domain — Custom exceptions for PDF Extractor service.

Domain layer: no imports from infrastructure/ or interface/.
"""


class PDFProcessingError(Exception):
    """Raised when PDF extraction fails for any reason."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class PDFNotFoundError(PDFProcessingError):
    """Raised when a requested PDF document does not exist in the repository."""


class PDFDownloadError(PDFProcessingError):
    """Raised when the PDF cannot be fetched from its source URL."""


class PDFLowQualityError(PDFProcessingError):
    """Raised when extracted content quality is below acceptance threshold."""


class OcrCapacityExceededError(PDFProcessingError):
    """
    FIX-PDFX-TESSERACT-CONCURRENCY-VIOLATES-SINGLE-WORKER-INVARIANT.

    Raised by the OCR concurrency gate (infrastructure/ocr_gateway.py) when its
    bounded queue wait elapses without acquiring a slot. A PDFProcessingError
    subtype so process_pdf()'s existing `except PDFProcessingError` branch
    marks the document failed and re-raises WITHOUT being rewrapped by the
    broader `except Exception` handler — the application/interface layers can
    then distinguish "backpressure" (→ HTTP 429 + Retry-After) from a genuine
    processing failure, without domain/ ever importing infrastructure/.
    """

    def __init__(self, message: str, retry_after_s: float = 5.0) -> None:
        super().__init__(message)
        self.retry_after_s = retry_after_s


class OcrDeadlineExceededError(PDFProcessingError):
    """
    FIX-PDFX-TESSERACT-CONCURRENCY-VIOLATES-SINGLE-WORKER-INVARIANT.

    Raised by the OCR concurrency gate when a single OCR call exceeds its
    configured page deadline (PDFX_OCR_PAGE_TIMEOUT_S). Distinguishes a
    bounded, self-healing timeout (the slot IS eventually released) from an
    opaque processing failure — this is the mechanism that breaks the
    "abandoned request permanently consumes a slot" ratchet.
    """


class OcrPageFailedError(PDFProcessingError):
    """
    FIX-PDFX-EXTRACTION-ENGINE-EMPTY-STRING-SWALLOW.

    Raised by PdfplumberExtractionEngine._ocr_page() (infrastructure/
    extraction_engine.py) when a single page's Tesseract OCR call raises any
    exception OTHER than OcrCapacityExceededError / OcrDeadlineExceededError
    (those two are already distinguished — see FIX-PDFX-TESSERACT-CONCURRENCY
    — and are re-raised as transport-layer backpressure/deadline signals, not
    processing failures).

    Prior behavior caught ALL OCR exceptions (tesseract crash, corrupt
    raster, etc.) and returned "" as if extraction had succeeded. Combined
    with the quality gate at domain/services.py (`ocr_conf < 0.5 AND not
    tables` => reject), a document with any table and zero OCR text passed
    the gate and was persisted as a successful extraction — a failed OCR
    page was byte-indistinguishable, at every downstream read site, from a
    genuinely blank/sparse scanned page.

    This subclass makes a REAL OCR failure fail the pipeline loudly instead:
    ExtractPDFService.process_pdf()'s existing `except PDFProcessingError`
    branch marks the document `status="failed"` and re-raises (never reaching
    the quality gate / store_extraction), so callers see an explicit
    `status: "failed"` response instead of a silently hollow "success".

    A genuinely blank/near-blank page — the OCR call SUCCEEDS and simply
    returns "" or whitespace — never raises this error; it is not this
    class's concern and must keep flowing through the pre-existing low-
    confidence path unchanged (see negative-control test).
    """
