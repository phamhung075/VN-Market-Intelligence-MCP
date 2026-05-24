"""
domain/primitive/context_window_packer/context_window_packer.py

Pure domain primitive: assemble an embedding-ready text string from metadata fields.

Extracted from application/usecases.py _build_embedding_text().
Fence-A (binding): stdlib imports only — zero application/, infrastructure/, interface/.
"""


def pack(title: str, content: str, source: str, max_chars: int = 512) -> str:
    """
    Assemble a single embedding-ready text string from metadata fields.

    Combines title, source (label), and content into a structured string.
    Content is truncated to max_chars characters if needed.
    Returns a string suitable for passing to an EmbedderPort.

    Args:
        title:     document title (may be empty string).
        content:   document content body (truncated to max_chars).
        source:    data source label (e.g. "VNDirect", "HOSE").
        max_chars: maximum characters for the content portion (default: 512).

    Returns:
        Assembled string. Never calls the embedder — pure assembly only.
    """
    truncated_content = content[:max_chars] if max_chars > 0 else ""
    parts = []
    if title:
        parts.append(title)
    if source:
        parts.append(source)
    parts.append(truncated_content)
    return "\n".join(parts)
