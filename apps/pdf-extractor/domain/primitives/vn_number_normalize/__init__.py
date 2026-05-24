"""
vn_number_normalize — public API re-export (BT-1).

Imports the pure function so callers can write:
    from domain.primitives.vn_number_normalize import vn_number_normalize
"""

from .primitive import vn_number_normalize

__all__ = ["vn_number_normalize"]
