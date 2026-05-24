"""
field_extractor — pure domain primitive (P2-B4).

Regex-based named-field extraction from OCR text (BCTC structure).

Applies Vietnamese financial statement field detection patterns derived from
mcp-server BCTC parsers. Extracts raw string values before decimal normalization.

Pattern source (READ-ONLY archaeology — ZERO mcp-server writes):
    # Pattern adapted from fetchParseAndStoreBctc.ts regex heuristics — READ-ONLY reference
    # Primary patterns from incomeStatementExtractor.ts and balanceSheetExtractor.ts
    # in apps/mcp-server/src/domain/services/financial-reports/
    #
    # net_revenue  : P_NET_REVENUE  = /doanh\\s+thu\\s+thu[ầa]n/i
    # net_profit   : P_NET_PROFIT   = /l[ợo]i\\s+nhu[ậa]n\\s+sau\\s+thu[ếe](?!\\s+ch[ưu]a\\s+ph[âa]n\\s+ph[ốo]i)/i
    # total_assets : P_TOTAL_ASSETS = /t[ổo]ng\\s+(?:c[ộo]ng\\s+)?t[àa]i\\s+s[ảa]n/i
    # equity       : P_EQUITY_TOTAL = /v[ốo]n\\s+ch[ủu]\\s+s[ởo]\\s+h[ữu]u/i

The primitive extracts the FIRST numeric token found after a matching label.
Only the raw string is returned — decimal normalization is applied downstream
by the decimal_normalizer primitive.

Supported field_name values:
    "net_revenue"   — Vietnamese: Doanh thu thuần
    "net_profit"    — Vietnamese: Lợi nhuận sau thuế (excl. undistributed retained earnings)
    "total_assets"  — Vietnamese: Tổng cộng tài sản / Tổng tài sản
    "equity"        — Vietnamese: Vốn chủ sở hữu

Domain layer rules:
    - Zero imports from infrastructure/, application/, interface/
    - No pdfplumber, pytesseract, aiohttp
    - No DB access, no file I/O, no network calls
    - Pure function: output = f(input) with no side effects

PYTHONPATH requirement: caller sets PYTHONPATH=apps/pdf-extractor.
"""

from __future__ import annotations

import re
from typing import Optional

# ---------------------------------------------------------------------------
# Field patterns (adapted from mcp-server BCTC extractor — READ-ONLY reference)
# ---------------------------------------------------------------------------
# Each pattern matches the Vietnamese label line in OCR text.
# After a label match, we look forward for the first numeric token.
#
# Pattern adapted from fetchParseAndStoreBctc.ts regex heuristics — READ-ONLY reference
# Source: apps/mcp-server/src/domain/services/financial-reports/incomeStatementExtractor.ts
# Source: apps/mcp-server/src/domain/services/financial-reports/balanceSheetExtractor.ts

_FIELD_PATTERNS: dict[str, re.Pattern[str]] = {
    # Income statement fields
    "net_revenue": re.compile(
        r"doanh\s+thu\s+thu[ầa]n",
        re.IGNORECASE,
    ),
    "net_profit": re.compile(
        r"l[ợo]i\s+nhu[ậa]n\s+sau\s+thu[ếe](?!\s+ch[ưu]a\s+ph[âa]n\s+ph[ốo]i)",
        re.IGNORECASE,
    ),
    # Balance sheet fields
    "total_assets": re.compile(
        r"t[ổo]ng\s+(?:c[ộo]ng\s+)?t[àa]i\s+s[ảa]n",
        re.IGNORECASE,
    ),
    "equity": re.compile(
        r"v[ốo]n\s+ch[ủu]\s+s[ởo]\s+h[ữu]u",
        re.IGNORECASE,
    ),
}

# Numeric token pattern — matches integers and decimals (including comma-formatted)
# Examples: "1,234.5", "1234.5", "0.000051", "(123)", "-456"
_NUMERIC_PATTERN: re.compile = re.compile(
    r"\(?\-?[\d.,]+(?:[eE][+-]?\d+)?\)?",
)

# Number of lines to look ahead after a label match (same heuristic as mcp-server)
_LOOKAHEAD_LINES: int = 5


def extract_field(text: str, field_name: str) -> Optional[str]:
    """
    Extract a named field value from BCTC OCR text.

    Searches text line by line for a label matching the Vietnamese field name.
    When found, scans forward within LOOKAHEAD_LINES for the first numeric token.
    Returns the raw numeric string (not parsed/normalized) for downstream processing.

    Args:
        text:       OCR text output from PDF extraction (may be multi-line).
        field_name: Field identifier — one of "net_revenue", "net_profit",
                    "total_assets", "equity".

    Returns:
        Raw extracted string (e.g. "1,234.5") if found, else None.
        None is returned on empty input, unknown field name, or when the
        field label is not found in the text. Never raises.
    """
    if not text or not text.strip():
        return None

    pattern = _FIELD_PATTERNS.get(field_name)
    if pattern is None:
        return None

    lines = text.splitlines()

    for i, line in enumerate(lines):
        if pattern.search(line):
            # Label matched — look for numeric token on this line first,
            # then in the next LOOKAHEAD_LINES lines
            search_lines = lines[i: i + 1 + _LOOKAHEAD_LINES]
            for search_line in search_lines:
                tokens = _NUMERIC_PATTERN.findall(search_line)
                if tokens:
                    # Return first numeric token, stripped of wrapping parentheses
                    raw = tokens[0].strip("()")
                    return raw if raw else None

    return None
