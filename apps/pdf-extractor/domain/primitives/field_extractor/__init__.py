"""
field_extractor — public export (P2-B4).

Exposes extract_field as the canonical primitive callable.
The sandbox runner imports from this module via:
    from domain.primitives.field_extractor import extract_field

Runner convention: the runner calls getattr(module, primitive_name) where
primitive_name = "field_extractor". The alias below satisfies that contract
while keeping the descriptive function name in the primitive module.

Domain layer — zero imports from infrastructure, application, interface.
No pdfplumber, pytesseract, aiohttp.
"""

from domain.primitives.field_extractor.primitive import extract_field

# Alias required by sandbox runner convention: module_name == callable_name
field_extractor = extract_field

__all__ = ["extract_field", "field_extractor"]
