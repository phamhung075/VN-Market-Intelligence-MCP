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
