"""
reconcile_figures — public API re-export (BT-1).

Imports the pure function so callers can write:
    from domain.primitives.reconcile_figures import reconcile_figures
"""

from .primitive import reconcile_figures

__all__ = ["reconcile_figures"]
