"""
ratio_computer — public export (P2-B3).

Exposes compute_ratio as the canonical primitive callable.
The sandbox runner imports from this module via:
    from domain.primitives.ratio_computer import compute_ratio

Runner convention: the runner calls getattr(module, primitive_name) where
primitive_name = "ratio_computer". The alias below satisfies that contract
while keeping the descriptive function name in the primitive module.

Domain layer — zero imports from infrastructure, application, interface.
No pdfplumber, pytesseract, aiohttp.
"""

from domain.primitives.ratio_computer.primitive import compute_ratio

# Alias required by sandbox runner convention: module_name == callable_name
ratio_computer = compute_ratio

__all__ = ["compute_ratio", "ratio_computer"]
