"""
low_confidence_gate — public export (P2-B2).

Exposes gate_confidence as the canonical primitive callable.
The sandbox runner imports from this module via:
    from domain.primitives.low_confidence_gate import gate_confidence

Runner convention: the runner calls getattr(module, primitive_name) where
primitive_name = "low_confidence_gate". The alias below satisfies that contract
while keeping the descriptive function name in the primitive module.

Domain layer — zero imports from infrastructure, application, interface.
No pdfplumber, pytesseract, aiohttp.
"""

from domain.primitives.low_confidence_gate.primitive import gate_confidence

# Alias required by sandbox runner convention: module_name == callable_name
low_confidence_gate = gate_confidence

__all__ = ["gate_confidence", "low_confidence_gate"]
