"""
decimal_normalizer — public export.

Exposes normalize_decimal as the canonical primitive callable.
The sandbox runner imports from this module via:
    from domain.primitives.decimal_normalizer import normalize_decimal

Runner convention: the runner calls getattr(module, primitive_name) where
primitive_name = "decimal_normalizer". The alias below satisfies that contract
while keeping the descriptive function name in the primitive module.
"""

from domain.primitives.decimal_normalizer.primitive import normalize_decimal

# Alias required by sandbox runner convention: module_name == callable_name
decimal_normalizer = normalize_decimal

__all__ = ["normalize_decimal", "decimal_normalizer"]
