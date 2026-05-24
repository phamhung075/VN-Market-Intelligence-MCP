"""
echo_identity — trivial identity primitive for sandbox scaffolding (P1-A1).

Contract:
    echo_identity(value: object) -> object
    Returns the input value unchanged.

This primitive is a scaffold-only utility to prove the sandbox runner works
end-to-end before real primitives are extracted. It will remain as a permanent
harness fixture and is NOT part of any business logic.

Domain layer rules:
    - Zero imports from infrastructure/, application/, interface/
    - No pdfplumber, pytesseract, aiohttp
    - No DB access, no file I/O, no network calls
    - Pure function: output = f(input) with no side effects

PYTHONPATH requirement: caller sets PYTHONPATH=apps/pdf-extractor.
"""

from typing import Any


def echo_identity(value: Any) -> Any:
    """Return value unchanged — pure identity function."""
    return value
