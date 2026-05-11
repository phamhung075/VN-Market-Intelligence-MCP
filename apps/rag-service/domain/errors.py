"""
Domain — Error types for RAG service.

Domain layer: no imports from infrastructure/ or interface/.
"""


class RAGError(Exception):
    """Base class for all RAG service errors."""


class VectorStoreError(RAGError):
    """Raised when the vector store operation fails."""


class EmbeddingError(RAGError):
    """Raised when embedding generation fails."""


class IndexError(RAGError):
    """Raised when indexing an entry fails."""


class SearchError(RAGError):
    """Raised when a search operation fails."""


class EntryNotFoundError(RAGError):
    """Raised when a requested entry does not exist."""
