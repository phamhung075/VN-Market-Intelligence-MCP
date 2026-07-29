"""
Domain — Shared constants for PDF Extractor service.

Domain layer: no imports from infrastructure/ or interface/.
"""

# FACTORY-PDF-split-handlers: the set of BCTC statement sections the
# extraction pipeline understands. Previously a `valid_sections` property
# living on interface/handlers.py's ExtractTablesRequestSchema — moved here
# so the interface layer stops owning this business rule.
STATEMENT_SECTIONS = frozenset({"balance_sheet", "income_statement", "cash_flow"})
