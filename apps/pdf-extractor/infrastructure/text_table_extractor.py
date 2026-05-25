"""
infrastructure/text_table_extractor.py — BT-3-A

TEXT-path table assembler adapter.

Implements TableAssemblerPort. Concrete Tesseract (vie+eng) + BT-1 primitives pipeline
that converts raw OCR page text into structured BCTC table rows.

Layer: infrastructure (does Tesseract I/O — impure). Safe per Fence-A/B.
DDD: may import from domain/primitives and infrastructure/. MUST NOT import
     from application/ or interface/.

Privacy: self-hosted Tesseract only. Zero external API. Zero data leaves the machine.

Algorithm per page:
    1. Detect unit header ("Đơn vị tính") → unit = "billion_vnd" or "vnd".
    2. Detect period header (Vietnamese date pattern DD/MM/YYYY) → extract
       period_current and period_prior strings.
    3. Parse each text line:
       - Code row: regex matches code + label in code-first or label-first layout,
         then extracts value columns using vn_number_normalize + select_period_column.
       - Header/separator row: no code — code=None, label=line text, values=None.
    4. Stitch multi-page sections (p4-7 pattern): list concatenation with global row_order.

BCTC summary codes (is_summary_row=1): {100, 200, 270, 300, 400, 440}.

FPT golden balance-check (from BT-0 spike eval, used as regression anchor in tests):
    Total Assets:       88,089,621,779,862 VND  (= 88089621.779862 billion VND)
    Total Liabilities:  44,338,155,487,272 VND  (= 44338155.487272 billion VND)
    Total Equity:       43,751,466,292,590 VND  (= 43751466.292590 billion VND)
    balance_delta = 0.0 (identity holds to the dong)
"""

from __future__ import annotations

import re
import logging
from typing import Dict, List, Optional

from domain.primitives.vn_number_normalize.primitive import vn_number_normalize
from domain.primitives.select_period_column.primitive import select_period_column

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# BCTC standard major subtotal codes (is_summary_row = 1)
_SUMMARY_CODES = frozenset({"100", "200", "270", "300", "400", "440"})

# Regex: BCTC code row — code appears AT START of line (code-first format):
#   "100  TÀI SẢN NGAN HAN  58.102.970.741.619"
_CODE_ROW_START_RE = re.compile(r"^\s*(\d{2,3})\s{2,}(.+)$")

# Regex: BCTC code row — code appears AFTER label, followed by optional values (label-first format):
#   "A. TÀI SẢN NGAN HAN  100  58.102.970.741.619  45.535.942.846.453"
#   "I. Tiền và các khoản tương đương tiền  110  10.540.181.640.920  ..."
#   "1. Tiền  111  8.084.826.991.114  6.725.619.929.289"
#   "Một khoản mục không có số liệu  999"  (code at end, no values)
# Pattern: (non-empty label text) + 2+spaces + (2-3 digit code) + optional trailing
_CODE_ROW_LABEL_FIRST_RE = re.compile(
    r"^(.+?)\s{2,}(\d{2,3})\s*(.*?)$"
)

# Regex: period header — Vietnamese date format DD/MM/YYYY (or YYYY/MM/DD variation)
_DATE_RE = re.compile(r"\d{1,2}/\d{1,2}/\d{4}")

# Vietnamese unit header tokens — matches both "Đơn vị tính" and "Đơn vị:"
_UNIT_HEADER_VI_KEYWORDS = ["đơn vị tính", "đơn vị:"]

# Unit keywords → unit strings
_UNIT_VND = "vnd"
_UNIT_BILLION_VND = "billion_vnd"
# If unit line contains "tỷ"/"billion"/etc., we keep billion_vnd; if raw "vnd" → vnd
_VND_KEYWORDS = [" vnd", ": vnd"]
_BILLION_KEYWORDS = ["tỷ", "triệu", "billion", "1,000,000,000", "1.000.000.000"]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _detect_unit(text: str) -> str:
    """
    Detect the unit from a 'Đơn vị' header line.
    Returns "billion_vnd" or "vnd". Defaults to "billion_vnd" if not detectable.

    Examples:
        "Đơn vị: VND"     → "vnd"
        "Đơn vị tính: Tỷ đồng" → "billion_vnd"
        "Đơn vị tính: Triệu đồng" → "billion_vnd"  (treat as billion for storage)
    """
    lower = text.lower()
    if any(kw in lower for kw in _BILLION_KEYWORDS):
        return _UNIT_BILLION_VND
    # If the line says raw "vnd" (no billion qualifier) → vnd
    if any(kw in lower for kw in _VND_KEYWORDS):
        return _UNIT_VND
    # Default to billion_vnd (BCTC standard)
    return _UNIT_BILLION_VND


def _detect_periods(lines: List[str]) -> tuple[Optional[str], Optional[str]]:
    """
    Scan lines for date patterns to identify period_current and period_prior.
    Returns (period_current, period_prior) — both may be None.
    """
    dates_found: List[str] = []
    for line in lines:
        matches = _DATE_RE.findall(line)
        for m in matches:
            if m not in dates_found:
                dates_found.append(m)
        if len(dates_found) >= 2:
            break
    period_current = dates_found[0] if dates_found else None
    period_prior = dates_found[1] if len(dates_found) > 1 else None
    return period_current, period_prior


def _parse_value(raw: Optional[str]) -> Optional[float]:
    """
    Apply vn_number_normalize then convert to float.
    Returns None on any failure.
    """
    if raw is None:
        return None
    normalized = vn_number_normalize(str(raw).strip())
    if normalized is None:
        return None
    try:
        return float(normalized)
    except ValueError:
        return None


def _extract_value_cells(rest_of_line: str) -> List[str]:
    """
    Split the value portion of a code row into individual cell tokens.
    Values are separated by whitespace (Tesseract column layout).
    Returns a list of candidate value strings.
    """
    # Strip common non-numeric prefixes that are part of the label
    # Value cells are right-aligned numbers; split on 2+ spaces
    parts = re.split(r"\s{2,}", rest_of_line.strip())
    # Filter to at most 3 tokens (label + current + prior is the most common layout)
    return [p.strip() for p in parts if p.strip()]


def _try_parse_code_row(stripped: str) -> Optional[tuple[str, str, str]]:
    """
    Try to extract (code, label, values_rest) from a stripped line.

    Handles two BCTC OCR layouts:
    1. Code-first: "100  TÀI SẢN NGAN HAN  58.102..."
    2. Label-first: "A. TÀI SẢN NGAN HAN  100  58.102..."
                    "1. Tiền  111  8.084.826.991.114  6.725.619.929.289"

    Returns (code, label, values_rest) or None if not a code row.
    """
    # Layout 1: code at start, 2+ spaces, then rest
    m = _CODE_ROW_START_RE.match(stripped)
    if m:
        code = m.group(1)
        rest = m.group(2).strip()
        # Split rest into label + values (label is first part, values follow 2+ spaces)
        parts = re.split(r"\s{2,}", rest, maxsplit=1)
        if len(parts) >= 2:
            return (code, parts[0].strip(), parts[1].strip())
        else:
            return (code, rest, "")

    # Layout 2: label-first — look for code in the middle using 2+ space boundaries
    m2 = _CODE_ROW_LABEL_FIRST_RE.match(stripped)
    if m2:
        label = m2.group(1).strip()
        code = m2.group(2)
        values_rest = m2.group(3).strip()
        return (code, label, values_rest)

    return None


def _parse_value_cells(values_rest: str) -> List[str]:
    """Split a value string into individual value tokens (split on 2+ spaces)."""
    if not values_rest.strip():
        return []
    parts = re.split(r"\s{2,}", values_rest.strip())
    return [p.strip() for p in parts if p.strip()]


def _parse_page_lines(
    page_num: int,
    lines: List[str],
    unit: str,
    period_current: Optional[str],
    period_prior: Optional[str],
    row_order_start: int,
) -> tuple[List[Dict], int]:
    """
    Parse text lines from one OCR page into structured row dicts.

    Returns (rows, next_row_order_start).
    """
    rows: List[Dict] = []
    row_order = row_order_start

    # Build a minimal headers list for select_period_column if periods known
    period_headers: Optional[List[str]] = None
    if period_current:
        period_headers = [period_current]
        if period_prior:
            period_headers.append(period_prior)

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        # Skip unit header lines
        if any(kw in stripped.lower() for kw in _UNIT_HEADER_VI_KEYWORDS):
            continue

        # Skip date-only header lines (period headers)
        if _DATE_RE.search(stripped) and len(stripped.split()) <= 4:
            # Likely a period-header line (e.g. "31/12/2025  31/12/2024")
            continue

        # Try to match a code row (handles code-first and label-first layouts)
        parsed = _try_parse_code_row(stripped)
        if parsed is not None:
            code, label, values_rest = parsed

            # Split values_rest into individual value cells
            value_cells = _parse_value_cells(values_rest)

            # Select columns using select_period_column
            headers_for_select = period_headers if period_headers else None
            hint = "consolidated" if period_headers and len(period_headers) > 1 else None

            if value_cells:
                col_result = select_period_column(
                    value_cells, hint=hint, headers=headers_for_select
                )
                col_idx = col_result[0]
                if col_idx is not None and col_idx < len(value_cells):
                    value_current_raw = value_cells[col_idx]
                    # Prior is typically the next column
                    prior_idx = col_idx + 1 if col_idx + 1 < len(value_cells) else None
                    value_prior_raw = (
                        value_cells[prior_idx] if prior_idx is not None else None
                    )
                else:
                    # Fallback: first cell = current, second = prior
                    value_current_raw = value_cells[0] if value_cells else None
                    value_prior_raw = (
                        value_cells[1] if len(value_cells) > 1 else None
                    )
            else:
                value_current_raw = None
                value_prior_raw = None

            value_current = _parse_value(value_current_raw)
            value_prior = _parse_value(value_prior_raw)
            is_summary = 1 if code in _SUMMARY_CODES else 0

            rows.append({
                "page_number": page_num,
                "row_order": row_order,
                "code": code,
                "label": label,
                "value_current": value_current,
                "value_prior": value_prior,
                "unit": unit,
                "is_summary_row": is_summary,
            })
        else:
            # Header / separator row — no code
            # Skip purely numeric lines and very short lines (likely OCR noise)
            if stripped and not stripped.isdigit() and len(stripped) > 1:
                rows.append({
                    "page_number": page_num,
                    "row_order": row_order,
                    "code": None,
                    "label": stripped,
                    "value_current": None,
                    "value_prior": None,
                    "unit": unit,
                    "is_summary_row": 0,
                })

        row_order += 1

    return rows, row_order


# ---------------------------------------------------------------------------
# Public class — implements TableAssemblerPort
# ---------------------------------------------------------------------------


class TextTableExtractor:
    """
    TEXT-path table assembler (infrastructure adapter).

    Implements TableAssemblerPort. Uses vn_number_normalize + select_period_column
    (BT-1 primitives) for value parsing and column selection.

    No Tesseract subprocess is called here — the caller (use case or API handler)
    is responsible for supplying pre-run Tesseract text per page in the `pages`
    argument. This design keeps the adapter testable with fixture text (zero creds,
    zero I/O in unit tests).

    For production use, the FastAPI route runs Tesseract per page and passes the
    result as pages[n]["text"].
    """

    def assemble(
        self,
        pages: List[Dict],
        statement_section: str,
    ) -> Dict:
        """
        Assemble OCR page text into ordered structured rows.

        Args:
            pages: list of dicts:
                   [{"page_number": int, "text": str}, ...]
                   text = raw Tesseract output for that page.
            statement_section: "balance_sheet" | "income_statement" | "cash_flow"

        Returns:
            {
                "rows": list[dict],            # ordered by row_order ASC
                "period_current": str | None,
                "period_prior": str | None,
            }
        """
        if not pages:
            return {"rows": [], "period_current": None, "period_prior": None}

        all_rows: List[Dict] = []
        global_row_order = 0

        # Detect periods from all pages combined (first occurrence wins)
        all_text = "\n".join(p.get("text", "") for p in pages)
        all_lines = all_text.splitlines()
        period_current, period_prior = _detect_periods(all_lines)

        # Detect unit from first page (carry forward)
        first_page_text = pages[0].get("text", "")
        unit = _UNIT_BILLION_VND
        for line in first_page_text.splitlines():
            if any(kw in line.lower() for kw in _UNIT_HEADER_VI_KEYWORDS):
                unit = _detect_unit(line)
                break

        # Parse each page
        for page in pages:
            page_num = page.get("page_number", 0)
            text = page.get("text", "")
            lines = text.splitlines()

            page_rows, global_row_order = _parse_page_lines(
                page_num=page_num,
                lines=lines,
                unit=unit,
                period_current=period_current,
                period_prior=period_prior,
                row_order_start=global_row_order,
            )
            all_rows.extend(page_rows)

        logger.info(
            "TextTableExtractor.assemble: section=%s pages=%d rows=%d "
            "period_current=%s period_prior=%s",
            statement_section,
            len(pages),
            len(all_rows),
            period_current,
            period_prior,
        )

        return {
            "rows": all_rows,
            "period_current": period_current,
            "period_prior": period_prior,
        }
