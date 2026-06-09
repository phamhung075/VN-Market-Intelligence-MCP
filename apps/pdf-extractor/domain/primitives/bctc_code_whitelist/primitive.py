"""
domain/primitives/bctc_code_whitelist/primitive.py — GATE-VISION

Code-whitelist gate for B01-DN / B01-HN BCTC balance sheets and income statements.

Purpose (gate-first, vision-on-failure-only pattern):
    Every Mã số (row code) stored in the DB after OCR must be a member of the
    fixed enumerated code set for the template in use (B01-DN/HN balance sheet,
    B01-DN income statement). The code set is a known constant per template —
    OCR digit errors are the ONLY source of invalid codes (e.g. 3↔8, 1↔4
    confusion seen on FPT Q1-2026: 135→185, 136→186, 16→46, 17→47, 61→62).

    A code NOT in the whitelist = OCR corruption flag on that row.
    The extractor emits needs_vision_verify=True for flagged rows, not auto-vision.

Design rules:
    - SSOT: this file is the single authoritative code set for the pdf-extractor zone.
      Do NOT duplicate in infrastructure/, application/, or any mcp-server layer.
    - Pure function: zero I/O, zero DB, zero Tesseract.
    - Domain layer only: no imports from infrastructure/, application/, interface/.
    - AC-0 compliant: the whitelist itself IS the semantic anchor — it is a registry of
      known legal codes, not keyword matching on labels.

Code sets documented from:
    - Circular No. 200/2014/TT-BTC (Bộ Tài chính) — B01-DN balance sheet (corporate).
    - Circular No. 202/2014/TT-BTC — B01-HN (consolidated) same code range, same structure.
    - Live corpus validation (FPT Q1-2026, FPT Q4-2025, HPG, VNM).
    - mcp-server/src/domain/services/financial-reports/bctcScalarAggregator.ts (VAS-CODE-TABLE).

Scope:
    Balance sheet (B01-DN / B01-HN) — 3-digit numeric codes:
        100–299 (Assets)
        300–399 (Liabilities)
        400–440 (Equity)
    Income statement (B01-DN standalone) — 2-digit numeric codes:
        01–70 (VAS standard IS codes)
    Note: cash-flow codes (B03-DN) are intentionally NOT gated here — they use
    distinct 2-digit codes (01–60) that heavily overlap IS codes; section-awareness
    is required to distinguish them. The whitelist gate applies only where a clean
    1:1 code-to-row mapping is guaranteed (balance sheet pages pp3-7).

Suffix codes (letter-suffixed variants):
    FPT and some other issuers use letter suffixes on equity sub-codes:
    e.g. 411a, 411b, 420a, 420b. These are valid. The whitelist is extended with
    known suffix variants. Codes not in the extended set are still flagged.

Function signature:
    check_code_whitelist(
        rows: list[dict],
        template: str = "B01_DN",   # "B01_DN" | "B01_HN" | "B01_DN_IS"
    ) -> tuple[bool, str, list[str]]
        Returns (pass: bool, reason: str, flagged_codes: list[str])
        pass=True if ALL codes in rows are in the whitelist (or are None/empty).
        flagged_codes is the list of codes found that were NOT in the whitelist.
"""

from __future__ import annotations

import re
from typing import Dict, FrozenSet, List, Optional, Tuple

# ---------------------------------------------------------------------------
# B01-DN Balance Sheet — 3-digit codes (Circular 200/2014 VAS)
# Assets section (100–299)
# ---------------------------------------------------------------------------

_B01_DN_ASSETS: FrozenSet[str] = frozenset({
    # Current assets (Tài sản ngắn hạn)
    "100",
    "110", "111", "112",               # Cash & equivalents
    "120", "121", "122", "123",        # Short-term investments
    "130", "131", "132", "133", "134", "135", "136", "137", "139",  # Receivables
    "140", "141", "149",               # Inventories (net / gross / provisions)
    "150", "151", "152", "153", "154", "155", "156", "157", "158",  # Other current assets
    # Non-current assets (Tài sản dài hạn)
    "200",
    "210", "211", "212", "213",        # Long-term receivables
    "220", "221", "222", "223",        # Fixed assets (tangible + intangible + finance lease)
    "224", "225",                      # Depreciation (contra)
    "226", "227", "228", "229",        # Investment property + construction in progress
    "230",                             # Investment property (Bất động sản đầu tư)
    "240", "241", "242",               # Long-term investments
    "250", "251", "252", "253", "254", "255",  # Other long-term assets
    "260",                             # Goodwill (hợp nhất kinh doanh)
    "270",                             # TOTAL ASSETS sub-total (tổng cộng tài sản — some layouts)
    "280",                             # TOTAL ASSETS (tổng cộng tài sản — Circular 200/2014 canonical)
})

# ---------------------------------------------------------------------------
# B01-DN Balance Sheet — Liabilities section (300–399)
# ---------------------------------------------------------------------------

_B01_DN_LIABILITIES: FrozenSet[str] = frozenset({
    "300",
    # Current liabilities (Nợ ngắn hạn)
    "310",
    "311",  # Short-term borrowings (Vay ngắn hạn)
    "312",  # Current portion of long-term debt
    "313",  # Finance lease obligations (short-term)
    "314",  # Trade payables (Phải trả người bán ngắn hạn)
    "315",  # Advances from customers (short-term)
    "316",  # Taxes payable
    "317",  # Payable to employees
    "318",  # Accrued expenses
    "319",  # Intra-group payables (short-term)
    "320",  # Deferred revenue (short-term)
    "321",  # Short-term provisions
    "322",  # Bonus & welfare fund (Quỹ khen thưởng phúc lợi — some periods)
    "323",  # Other short-term payables
    "324",  # Government bond payable
    # Long-term liabilities (Nợ dài hạn)
    "330",
    "331",  # Long-term payables to suppliers
    "332",  # Long-term advances from customers
    "333",  # Finance lease (long-term)
    "334",  # Long-term borrowings (Vay dài hạn)
    "335",  # Bonds payable (long-term)
    "336",  # Deferred tax liability
    "337",  # Deferred revenue (long-term)
    "338",  # Long-term intra-group payables
    "339",  # Long-term provisions (Dự phòng dài hạn / Vay dài hạn alt)
    "340",  # Undistributed profit (as liability — some consolidations)
    "341",  # Capital surplus liability (alternate code)
    # Subtotal
    "350",
})

# ---------------------------------------------------------------------------
# B01-DN Balance Sheet — Equity section (400–440)
# ---------------------------------------------------------------------------

_B01_DN_EQUITY: FrozenSet[str] = frozenset({
    "400",
    "410",
    "411",              # Charter capital (Vốn điều lệ)
    "411a", "411b",    # FPT / issuer-specific suffix variants
    "412",              # Capital surplus (Thặng dư vốn cổ phần)
    "413",              # Other equity components
    "414",              # Treasury shares (Cổ phiếu quỹ)
    "415",              # Exchange differences
    "416",              # Investment development fund
    "417",              # Other funds within equity
    "418",              # Undistributed retained earnings (LNST chưa phân phối)
    "419",              # Other equity items
    "420",
    "420a", "420b",    # FPT suffix variants (equity sub-items)
    "421",              # Retained earnings this period
    "422",              # Retained earnings prior periods
    "430",              # Non-controlling interests (minority interest)
    "440",              # TOTAL EQUITY (tổng cộng nguồn vốn / tổng cộng tài sản & nguồn vốn)
})

# ---------------------------------------------------------------------------
# Full B01-DN Balance Sheet whitelist = assets + liabilities + equity
# ---------------------------------------------------------------------------

B01_DN_BALANCE_SHEET_CODES: FrozenSet[str] = (
    _B01_DN_ASSETS | _B01_DN_LIABILITIES | _B01_DN_EQUITY
)

# ---------------------------------------------------------------------------
# B01-HN (Hợp nhất / Consolidated) — same code structure as B01-DN
# Differences: adds minority interest / goodwill codes at the group level.
# In practice the code range is identical for the whitelist gate.
# ---------------------------------------------------------------------------

B01_HN_BALANCE_SHEET_CODES: FrozenSet[str] = B01_DN_BALANCE_SHEET_CODES

# ---------------------------------------------------------------------------
# B01-DN Income Statement — 2-digit numeric codes
# (Circular 200/2014, Mẫu B02-DN — income statement component of annual report)
# ---------------------------------------------------------------------------

B01_DN_INCOME_STATEMENT_CODES: FrozenSet[str] = frozenset({
    "01",   # Gross revenue (Doanh thu bán hàng và cung cấp dịch vụ)
    "02",   # Deductions (Các khoản giảm trừ doanh thu)
    "10",   # Net revenue (Doanh thu thuần)
    "11",   # COGS (Giá vốn hàng bán)
    "20",   # Gross profit (Lợi nhuận gộp)
    "21",   # Financial income (Doanh thu hoạt động tài chính)
    "22",   # Financial expenses (Chi phí tài chính)
    "23",   # Interest expense (Chi phí lãi vay)
    "24",   # Profit/loss from associates
    "25",   # Selling expenses (Chi phí bán hàng)
    "26",   # G&A expenses (Chi phí quản lý doanh nghiệp)
    "30",   # Operating profit (Lợi nhuận thuần từ HĐKD)
    "31",   # Other income
    "32",   # Other expenses
    "40",   # Other profit (Lợi nhuận khác)
    "50",   # Profit before tax (Lợi nhuận kế toán trước thuế)
    "51",   # Income tax — current
    "52",   # Income tax — deferred
    "60",   # Net profit (Lợi nhuận sau thuế TNDN)
    "61",   # Profit attributable to non-controlling interests
    "62",   # Profit attributable to parent shareholders
    "70",   # Basic EPS
    "71",   # Diluted EPS
})

# B01-HN income statement uses same codes
B01_HN_INCOME_STATEMENT_CODES: FrozenSet[str] = B01_DN_INCOME_STATEMENT_CODES

# ---------------------------------------------------------------------------
# Template registry — maps template name → whitelist set
# ---------------------------------------------------------------------------

_TEMPLATE_MAP: Dict[str, FrozenSet[str]] = {
    "B01_DN":    B01_DN_BALANCE_SHEET_CODES,
    "B01_HN":    B01_HN_BALANCE_SHEET_CODES,
    "B01_DN_IS": B01_DN_INCOME_STATEMENT_CODES,
    "B01_HN_IS": B01_HN_INCOME_STATEMENT_CODES,
}


# ---------------------------------------------------------------------------
# Internal: normalise a raw OCR code string to lowercase stripped form
# ---------------------------------------------------------------------------

def _normalise_code(raw: Optional[str]) -> Optional[str]:
    """
    Strip whitespace from a code string. Return None for None/empty.

    Lowercase for consistency — whitelist entries are stored lowercase
    for letter-suffixed variants (411a, 420b).

    AC-0: pure normalisation, no label matching.
    """
    if not raw:
        return None
    stripped = raw.strip().lower()
    return stripped if stripped else None


# ---------------------------------------------------------------------------
# check_code_whitelist — gate (b)
# ---------------------------------------------------------------------------

def check_code_whitelist(
    rows: List[Dict],
    template: str = "B01_DN",
) -> Tuple[bool, str, List[str]]:
    """
    Check that every non-empty code in ``rows`` is a member of the known
    code set for the given BCTC template.

    A code NOT in the whitelist signals OCR digit corruption on that row
    (e.g. 3↔8 confusion: 135→185, 136→186; 1↔4: 16→46, 17→47).
    The extractor must emit needs_vision_verify=True for the affected page(s).

    Args:
        rows:     List of row dicts. Each row must have a "code" key (str | None)
                  and a "page" key (int). Other keys are ignored.
        template: One of "B01_DN", "B01_HN", "B01_DN_IS", "B01_HN_IS".
                  Unknown template → gate skipped (pass, reason contains note).

    Returns:
        (pass: bool, reason: str, flagged_codes: list[str])

        pass=True  → all codes valid (or no codes present, or template unknown)
        pass=False → one or more codes not in the whitelist

        reason:
          ""                              on clean pass (all codes valid)
          "code_whitelist_skipped=true"   when no parseable codes or unknown template
          "code_whitelist_fail: ..."      on fail (includes count + first invalid codes)

        flagged_codes:
          [] on pass
          ["185", "186", ...] on fail — the raw code strings not in the whitelist
    """
    valid_set = _TEMPLATE_MAP.get(template)
    if valid_set is None:
        return (
            True,
            f"code_whitelist_skipped=true: unknown template {template!r}",
            [],
        )

    flagged: List[str] = []

    for row in rows:
        raw_code = row.get("code")
        norm = _normalise_code(raw_code)
        if norm is None:
            # None or empty code — skip (not an OCR corruption signal)
            continue
        if norm not in valid_set:
            # raw_code is the original OCR value to preserve the actual digit seen
            flagged.append(str(raw_code).strip())

    if not flagged:
        if not rows:
            return True, "code_whitelist_skipped=true: no rows", []
        # Check if any codes were present at all
        any_coded = any(row.get("code") for row in rows)
        if not any_coded:
            return True, "code_whitelist_skipped=true: no codes in rows", []
        return True, "", []

    # De-duplicate while preserving first-seen order
    seen: set = set()
    unique_flagged: List[str] = []
    for c in flagged:
        if c not in seen:
            seen.add(c)
            unique_flagged.append(c)

    first_few = unique_flagged[:5]
    more = len(unique_flagged) - 5 if len(unique_flagged) > 5 else 0

    reason = (
        f"code_whitelist_fail: template={template} "
        f"invalid_count={len(unique_flagged)} "
        f"sample={first_few!r}"
    )
    if more:
        reason += f" (+{more} more)"

    return False, reason, unique_flagged
