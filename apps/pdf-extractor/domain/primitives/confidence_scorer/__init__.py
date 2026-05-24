"""
confidence_scorer — public export (P2-B1).

Exposes score_confidence as the canonical primitive callable.
The sandbox runner imports from this module via:
    from domain.primitives.confidence_scorer import score_confidence

Runner convention: the runner calls getattr(module, primitive_name) where
primitive_name = "confidence_scorer". The alias below satisfies that contract
while keeping the descriptive function name in the primitive module.

Domain layer — zero imports from infrastructure, application, interface.
No pdfplumber, pytesseract, aiohttp.
"""

from domain.primitives.confidence_scorer.primitive import score_confidence

# Alias required by sandbox runner convention: module_name == callable_name
confidence_scorer = score_confidence

__all__ = ["score_confidence", "confidence_scorer"]
