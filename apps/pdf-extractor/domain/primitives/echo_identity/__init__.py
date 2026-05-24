"""
echo_identity primitive — trivial pass-through for sandbox scaffolding.

This primitive exists ONLY to provide a zero-dependency runnable scenario
for P1-A1 G12 DoD gate verification. It proves the sandbox runner works
before real primitives (validate_financial_figures, decimal_normalizer) are
extracted in P1-B1 and P1-B2.

Domain layer — zero imports from infrastructure, application, interface.
No pdfplumber, pytesseract, aiohttp.
"""

from domain.primitives.echo_identity.primitive import echo_identity

__all__ = ["echo_identity"]
