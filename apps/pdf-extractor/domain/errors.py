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
