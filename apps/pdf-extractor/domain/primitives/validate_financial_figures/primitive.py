"""
validate_financial_figures — pure domain primitive (P1-B1).

Validates extracted BCTC financial figures against accounting rules.

Domain layer rules:
    - Zero imports from infrastructure/, application/, interface/
    - No pdfplumber, pytesseract, aiohttp
    - No DB access, no file I/O, no network calls
    - Pure function: output = f(input) with no side effects

Moved from domain/services.py:23-98 (Task 1345b original location).
Call-site in domain/services.py now imports from this module.

PYTHONPATH requirement: caller sets PYTHONPATH=apps/pdf-extractor.
"""

from typing import Optional


def validate_financial_figures(
    total_assets: Optional[float],
    total_equity: Optional[float],
    total_liabilities: Optional[float],
    operating_margin: Optional[float],
    net_revenue: Optional[float],
) -> float:
    """
    Validate extracted BCTC financial figures against accounting rules.

    Returns a confidence score in [0.0, 1.0]:
      1.0  — all figures pass all rules
      0.0  — at least one hard violation (accounting identity impossible)
      0.1+ — soft violations stack, floor at 0.1

    Hard violations (return 0.0 immediately):
      BCTC-VAL-01: total_assets < total_equity (accounting identity broken)
                   Example: VNM Q4 2024 assets=957T equity=18829T → 0.0
      BCTC-VAL-02: total_assets < 0 (impossible in real accounting)
      BCTC-VAL-04: total_liabilities < 0 (impossible in real accounting)

    Soft violations (-0.2 each, stacked, floor 0.1):
      BCTC-VAL-03: operating_margin outside (-5.0, +1.0) as ratio (not %)
                   Example: VEA Q4 2024 margin=3.3 (330%) → -0.2
      BCTC-VAL-05: net_revenue <= 0 (non-holding company with no revenue)
      BCTC-VAL-06: equity < 0 (negative equity — suspicious for BCTC extraction)

    None values are skipped — partial extraction is not penalized.

    Args:
        total_assets:      Total assets from balance sheet (billion VND)
        total_equity:      Total equity from balance sheet (billion VND)
        total_liabilities: Total liabilities from balance sheet (billion VND)
        operating_margin:  Operating profit / net revenue (ratio, not percentage)
        net_revenue:       Net revenue from income statement (billion VND)

    Returns:
        float in [0.0, 1.0]
    """
    # ── Hard violations ───────────────────────────────────────────────────────

    # BCTC-VAL-01: assets < equity (accounting identity: A = L + E must hold)
    if (
        total_assets is not None
        and total_equity is not None
        and total_assets > 0
        and total_equity > 0
        and total_assets < total_equity
    ):
        return 0.0

    # BCTC-VAL-02: negative total assets
    if total_assets is not None and total_assets < 0:
        return 0.0

    # BCTC-VAL-04: negative total liabilities
    if total_liabilities is not None and total_liabilities < 0:
        return 0.0

    # ── Soft violations ───────────────────────────────────────────────────────
    penalty = 0.0

    # BCTC-VAL-03: operating margin outside normal range (-5.0, +1.0) as ratio
    if operating_margin is not None and not (-5.0 < operating_margin < 1.0):
        penalty += 0.2

    # BCTC-VAL-05: net revenue <= 0
    if net_revenue is not None and net_revenue <= 0:
        penalty += 0.2

    # BCTC-VAL-06: equity < 0
    if total_equity is not None and total_equity < 0:
        penalty += 0.2

    confidence = 1.0 - penalty
    return max(confidence, 0.1)
