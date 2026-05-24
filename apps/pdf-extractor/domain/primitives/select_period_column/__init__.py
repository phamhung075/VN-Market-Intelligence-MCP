"""
select_period_column — public API re-export (BT-1).

Imports the pure function so callers can write:
    from domain.primitives.select_period_column import select_period_column
"""

from .primitive import select_period_column

__all__ = ["select_period_column"]
