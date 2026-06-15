"""
infrastructure/text_table_extractor.py — BT-3-A + BT3-FIX-2 + BT3-FIX4 + BT3-FIX5 + FIX-BCTC-ENRICH-SILENT-0ROWS

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
    3. Detect page layout:
       a) Three-block layout (BT3-FIX-2): page has "Mã số" header followed by
          standalone code integers in their own block. Labels, codes, and values
          appear in 3 separate OCR blocks. Detected by presence of "mã số" in text
          and isolated code-only lines after it. Handle with _parse_three_block_layout().
          Example: FPT pages 4 and 6 — current-assets and liabilities sections.
       b) Inline layout: code + label + values on the same line (or 2-column layout).
          Handled by _parse_lines_to_rows() using 5-pattern _try_parse_code_row().
          Example: FPT pages 5 and 7.
       c) B02-TCTD inline layout (FIX-BCTC-ENRICH-SILENT-0ROWS):
          Bank forms (Mẫu B02-TCTD) use Roman-numeral section codes (I, II, III, ...)
          and single-digit sub-codes (1, 2, 3, ...) instead of 3-digit numeric codes.
          Layout 6: Roman code at line start + label + values (e.g. "I Tiền mặt 12.930.996")
          Layout 7: single-digit code at line start + label + values (e.g. "1 Tiền gửi 100.000")
          No per-ticker/bank allowlist — purely structural detection.
    4. Stitch multi-page sections (p4-7 pattern): list concatenation with global row_order.
    5. Positional cutoff (BT3-FIX5 Ruling B): drop all rows after the last sentinel
       code row (270/440 for balance sheets). B02-TCTD has no numeric sentinel → cutoff
       not applied (logs WARNING, rows returned unchanged — correct behaviour).

BCTC summary codes (is_summary_row=1): {100, 200, 270, 300, 400, 440}.

FPT golden balance-check (from BT-0 spike eval, used as regression anchor in tests):
    Total Assets:       88,089,621,779,862 VND  (= 88089621.779862 billion VND)
    Total Liabilities:  44,338,155,487,272 VND  (= 44338155.487272 billion VND)
    Total Equity:       43,751,466,292,590 VND  (= 43751466.292590 billion VND)
    balance_delta = 0.0 (identity holds to the dong)

BT3-FIX-2: Three-block layout fix (2026-05-25)
    FPT Q4 pages 4 (current assets, code 100) and 6 (liabilities, code 300) use a
    3-block OCR layout where labels, codes, and values are in separate text blocks.
    The original line-by-line parser could not pair them → codes 100 and 300 were
    missing from assembled rows → balance_pass=False → BT-5 gate blocked the push.
    Fix: _parse_three_block_layout() detects the "Mã số" header, collects codes in
    order, then collects current and prior values in order, and pairs them positionally.

BT3-FIX5: Root-cause fix — substrate-mismatch (2026-05-26)
    Root cause: FIX4 unit tests ran against PyMuPDF OCR fixture; live container uses
    poppler (pdf2image). Diacritic output differs. Negative skip-list was calibrated
    against PyMuPDF characters → missed on poppler substrate → 23 orphan rows live.

    Four rulings implemented:
    A. POSITIVE-KEEP: non-code else-branch now requires _is_recognized_section_header()
       instead of alpha-3 heuristic. Garbled noise never matches → silently dropped.
    B. POSITIONAL CUTOFF: _apply_positional_cutoff() drops everything after last 270/440.
    C. DIACRITIC-INSENSITIVE: _norm() (NFD + strip Mn) applied to ALL string comparisons.
    D. EMBEDDED-CODE recovery: _find_code_in_line() as Layout 5 fallback in
       _try_parse_code_row() — scan-and-extract for 222/223/226/131/319/421b.

FIX-BCTC-ENRICH-SILENT-0ROWS (2026-06-15):
    Root cause: B02-TCTD (banking) BCTCs use Roman-numeral section codes (I, II, III,
    IV, V, VI, VII, VIII, IX, X, XI, XII, XIII) and single-digit sub-codes (1, 2, 3 ...)
    instead of 3-digit corporate codes (100, 270, 300, 400). ALL existing Layouts 1-5
    only match 2-3 digit numeric codes → every B02-TCTD line returned None → 0 rows.

    Two new layouts added (generic — no per-ticker allowlist):
    Layout 6: Roman-numeral code at line start + 1+ space + label + values.
              Pattern: anchored Roman code (XIII|XII|...|I) + whitespace + rest.
              Guard: line must contain at least one VN-format number.
              Non-regression: "I. xxx" (with period) is a section header already
              handled by _is_recognized_section_header(); Layout 6 only matches
              "I xxx" (no period after code).
    Layout 7: single-digit code (1-9) at line start + 1+ space + label + values.
              Pattern: anchored single digit (1-9) + whitespace + rest.
              Guard: line must contain at least one VN-format number.
              False-positive protection: requires numeric value present in the rest of
              the line — prevents treating "1 January" or note-ref lines as data rows.
"""

from __future__ import annotations

import re
import logging
import unicodedata
from typing import Dict, List, Optional

from domain.primitives.vn_number_normalize.primitive import vn_number_normalize
from domain.primitives.select_period_column.primitive import select_period_column

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# BT3-FIX5 Ruling C — Diacritic-insensitive normalization (module-level helper)
# ---------------------------------------------------------------------------

def _norm(s: str) -> str:
    """
    Diacritic-insensitive normalization: NFD decompose + strip combining marks + uppercase.

    Used for ALL string comparisons in skip-lists and header recognition.
    Makes the parser immune to poppler vs PyMuPDF diacritic variation.

    Example:
        _norm("BẢNG CÂN ĐỐI") == _norm("BANG CAN DOI")  # True
        _norm("tại ngày")     == _norm("tai ngay")       # True

    Special handling: Vietnamese "Đ" (U+0110, D with stroke) and "đ" (U+0111) are NOT
    decomposed by NFD (they are standalone letters, not base+combining-mark). They must
    be mapped explicitly to "D" before NFD normalization.

    DDD layer: pure function (no I/O, no imports beyond unicodedata from stdlib).
    Infrastructure concern (OCR substrate adaptation), not domain logic.
    """
    # Explicit replacement for Đ/đ (D-with-stroke — not NFD-decomposable)
    s = s.replace("Đ", "D").replace("đ", "d")
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    ).upper()


# ---------------------------------------------------------------------------
# BT3-FIX5 Ruling C — Module-level junk skip-list (normalized forms)
# ---------------------------------------------------------------------------

# Strings that identify junk/non-data lines in BCTC OCR output.
# Applied via _norm(skip) in _norm(stripped) — diacritic-insensitive.
# The negative skip-list is SECONDARY: only for structurally recognizable patterns
# (company name, form number) that always start a page and have consistent tokens.
# Primary noise filter is POSITIVE-KEEP (_is_recognized_section_header) + POSITIONAL CUTOFF.
_JUNK_SKIP_KEYS: List[str] = [
    # Company/address block
    "công ty",          # company name: "CÔNG TY CỔ PHẦN FPT"
    "phường",           # ward: "Phường Cầu Giấy"
    "thành phố",        # city: "Thành phố Hà Nội"
    "số 10",            # street address: "Số 10 phố Phạm Văn Bạch"
    # Form-level noise (provably not item labels)
    "mã số",            # "Mã số" column header line
    "mẫu số",           # form number: "MẪU SỐ B 01-DN/HN"
    "mau so",           # OCR-variant form number
    # Signature-block keywords (also caught by positional cutoff but listed for defense-in-depth)
    "người lập",        # signature: "Người lập"
    "kế toán trưởng",   # signature: "Kế toán trưởng"
    "phó tổng",         # signature: "Phó Tổng giám đốc"
]


# ---------------------------------------------------------------------------
# FIX-BCTC-ENRICH-SILENT-0ROWS — Layout 6: Roman-numeral codes (B02-TCTD)
# ---------------------------------------------------------------------------

# Regex: B02-TCTD Roman-numeral section code at start of line.
# Matches: I, II, III, IV, V, VI, VII, VIII, IX, X, XI, XII, XIII
# Guards:
#   - Code MUST be at the START of the line (anchored with ^).
#   - Code MUST be followed by 1 or more whitespace characters then additional content.
#   - Ordered longest-first to avoid matching "I" inside "III" etc.
#   - Does NOT match "I." or "II." (section-header pattern with trailing period)
#     because whitespace is required after the code, and the dot is checked
#     in the negative-lookbehind filter in _try_parse_roman_code_row().
_ROMAN_CODE_RE = re.compile(
    r"^(XIII|XII|XI|IX|VIII|VII|VI|IV|III|II|I|X|V)\s+(.+)$"
)

# VN-format number pattern (positive or parenthetical-negative) for guard check.
# Used to reject lines that have a Roman/digit code but no numeric value.
_VN_NUMBER_GUARD_RE = re.compile(r"\(?\d[\d.,]+\d\)?")

# ---------------------------------------------------------------------------
# FIX-BCTC-ENRICH-SILENT-0ROWS — Layout 7: single-digit sub-codes (B02-TCTD)
# ---------------------------------------------------------------------------

# Regex: single-digit sub-code (1-9) at start of line.
# B02-TCTD sub-items use codes 1, 2, 3, ... under each Roman-numeral section.
# E.g. "1 Tiền gửi tại các tổ chức tín dụng khác 574.752.661 515.588.640"
# Guard: code followed by 1+ whitespace then additional content.
_SINGLE_DIGIT_CODE_RE = re.compile(r"^([1-9])\s+(.+)$")

# ---------------------------------------------------------------------------
# BT3-FIX5 Ruling D — Embedded-code scanner (Layout 5)
# ---------------------------------------------------------------------------

# Regex: scan a line for a BCTC code token followed by VN-format value(s).
# Used in _find_code_in_line() — the Layout 5 fallback in _try_parse_code_row().
#
# Structure of the pattern:
#   (?<![.\d])            — not preceded by a digit OR a dot (avoids matching inside
#                           large VN numbers like 7.399.799.985.311 where "311" follows ".")
#   (\d{2,3}[a-z]?)       — code: 2-3 digits + optional lowercase letter suffix (421b)
#   \s+                   — separator (one or more spaces)
#   (?:\d{1,3}\s+)?       — optional note-ref: 1-3 digit integer followed by space
#   (\(?\d[\d.,]+\)?)     — first value: positive or paren-negative VN number
#   (?:\s+(\(?\d[\d.,\s]*\d\)?))?  — optional second value (prior period)
#                            NOTE: \s inside allows for OCR space mid-number
#   \s*.{0,3}\s*$         — allow up to 3 trailing chars: "1" (note ref), "}" "]" ";"
#                            "i" (OCR artifact), ":" etc. — permissive tail
_BCTC_CODE_SCAN_RE = re.compile(
    r"(?<![.\d])"
    r"(\d{2,3}[a-z]?)"
    r"\s+"
    r"(?:\d{1,3}\s+)?"
    r"(\(?\d[\d.,]+\)?)"
    r"(?:\s+(\(?\d[\d.,\s]*\d\)?))?"
    r"\s*.{0,3}\s*$"
)


def _find_code_in_line(stripped: str) -> Optional[tuple]:
    """
    BT3-FIX5 Ruling D — Layout 5: scan-and-extract code finder.

    Scan a stripped OCR line for a BCTC code token regardless of what precedes it
    (the label portion). Returns (code, label, values_rest) or None.

    Strategy:
      1. Pre-process: remove OCR-artifact spaces inside parenthetical numbers,
         e.g. "(11.683.165.704. 793)" → "(11.683.165.704.793)".
         These occur when poppler inserts a space mid-number in the rasterized image.
      2. Find all candidate code positions using _BCTC_CODE_SCAN_RE.
      3. For each match: code is the (\\d{2,3}[a-z]?) group; everything before
         the match start is the label; the value groups form values_rest.
      4. Accept the FIRST match where:
         (a) numeric part of code is in range [100, 999] (BCTC structural codes)
             OR is a known letter-suffix form (e.g. "421b"),
         (b) at least one value group was captured.

    This function is called ONLY when Layouts 1-4 all fail. It does not modify or
    replace the 4 existing layouts — it provides a fallback that is insensitive to
    label content (handles diacritic-mangled labels that break regex boundaries).

    Non-regression: Layout 5 is only reached when Layouts 1-4 return None, so
    zero existing matches can be reduced.

    False-positive guard: (?<![\\.\\d]) lookbehind prevents matching "311" inside
    "7.399.799.985.311". code_int < 100 guard rejects 1-2 digit note-ref numbers.
    """
    # Pre-process: remove OCR-artifact spaces inside parenthetical numbers.
    # Pattern: "(digits. digit)" where a space appears after a dot inside parens.
    # Example: "(11.683.165.704. 793)" → "(11.683.165.704.793)"
    # This is a poppler rendering artifact where the rasterizer breaks a number mid-word.
    cleaned = re.sub(r"(\(\d[\d.]*)\.\s+(\d[\d.]*\))", r"\1.\2", stripped)

    for m in _BCTC_CODE_SCAN_RE.finditer(cleaned):
        code_str = m.group(1)
        first_value = m.group(2)
        if first_value is None:
            continue

        # Accept code if numeric part is in BCTC structural range [100, 999]
        numeric_match = re.match(r"(\d{2,3})", code_str)
        if numeric_match is None:
            continue
        code_int = int(numeric_match.group(1))
        if code_int < 100:
            continue  # 1-2 digit note-ref numbers — skip

        label = cleaned[: m.start()].strip()
        second_value = m.group(3) or ""
        # Clean up the second value (may contain spaces from OCR artifact cleanup)
        second_value = second_value.strip()
        values_rest = first_value + (" " + second_value if second_value else "")

        return (code_str, label, values_rest)

    return None


# ---------------------------------------------------------------------------
# FIX-BCTC-ENRICH-SILENT-0ROWS — Layout 6 helper (Roman-numeral codes)
# ---------------------------------------------------------------------------

def _try_parse_roman_code_row(stripped: str) -> Optional[tuple]:
    """
    FIX-BCTC-ENRICH-SILENT-0ROWS Layout 6 — Roman-numeral code rows (B02-TCTD).

    Parses lines of the form:
        "I Tiền mặt, vàng bạc, đá quý 12.930.996 15.542.769"
        "II Tiền gửi tại Ngân hàng Nhà nước 17.957.497 37.445.504"
        "VIII Lợi nhuận trước thuế 10.000.000 9.000.000"

    Returns (code, label, values_rest) or None.

    Non-regression guard:
      Lines with a trailing period after the code ("I. xxx") are section headers
      handled by _is_recognized_section_header(). Layout 6 explicitly rejects
      them by checking for a period immediately after the code token.
      The _ROMAN_CODE_RE already anchors code at line start, and the section-header
      detection happens BEFORE _try_parse_code_row is called in _parse_lines_to_rows(),
      so period-suffix lines never reach this function in the first place. The guard
      here is defense-in-depth.

    False-positive protection:
      Line must contain at least one VN-format number (guard via _VN_NUMBER_GUARD_RE).
      This prevents treating pure-text lines that happen to start with a Roman
      numeral word ("V. Tài sản dài hạn") from matching. Since we reject lines
      with a trailing period, the main risk is a label-only line starting with
      a Roman letter (unlikely in Vietnamese financial text).
    """
    m = _ROMAN_CODE_RE.match(stripped)
    if m is None:
        return None

    code = m.group(1)
    rest = m.group(2).strip()

    # False-positive guard: period after code → section header, not data row
    # E.g. "I." parsed as code="I" with rest=". Tiền..." → reject
    if rest.startswith("."):
        return None

    # False-positive guard: must have at least one VN-format number
    if not _VN_NUMBER_GUARD_RE.search(rest):
        return None

    # Split rest into label + values using 2+ spaces as separator (standard layout)
    parts = re.split(r"\s{2,}", rest, maxsplit=1)
    if len(parts) >= 2:
        label = parts[0].strip()
        values_rest = parts[1].strip()
    else:
        # Single space separation (layout 4 style) — label ends before first number
        # Strategy: walk backwards from the end to find label/value boundary.
        # The value portion starts with a digit or '(' (parenthetical negative).
        # Split on the LAST single space before a numeric token.
        num_match = _VN_NUMBER_GUARD_RE.search(rest)
        if num_match:
            # Label is everything before the number block
            split_pos = num_match.start()
            # Walk back to find the space
            while split_pos > 0 and rest[split_pos - 1] == " ":
                split_pos -= 1
            label = rest[:split_pos].rstrip()
            values_rest = rest[num_match.start():].strip()
        else:
            label = rest
            values_rest = ""

    return (code, label, values_rest)


# ---------------------------------------------------------------------------
# FIX-BCTC-ENRICH-SILENT-0ROWS — Layout 7 helper (single-digit sub-codes)
# ---------------------------------------------------------------------------

def _try_parse_single_digit_code_row(stripped: str) -> Optional[tuple]:
    """
    FIX-BCTC-ENRICH-SILENT-0ROWS Layout 7 — single-digit sub-code rows (B02-TCTD).

    Parses lines of the form:
        "1 Tiền gửi tại các tổ chức tín dụng khác 574.752.661 515.588.640"
        "2 Cho vay các tổ chức tín dụng khác 6.769.531 6.885.722"
        "3 Dự phòng rủi ro (585) -"

    Returns (code, label, values_rest) or None.

    False-positive protection:
      Line must contain at least one VN-format number (guard via _VN_NUMBER_GUARD_RE).
      This prevents treating date-like lines ("1 January 2026") or section-title
      lines ("1. Vốn chủ sở hữu") from matching.
      Note: "1." (with trailing period) lines are caught by the period guard below.

    Overlap with existing Layouts 1-4:
      Corporate B01-DN sub-items use patterns like "1. Tiền  111  value"
      (label-first with 2+ spaces before 3-digit code). Those lines already
      match Layouts 1 or 4 and are handled before Layout 7 is reached.
      Layout 7 is only reached when Layouts 1-5 return None.
    """
    m = _SINGLE_DIGIT_CODE_RE.match(stripped)
    if m is None:
        return None

    code = m.group(1)
    rest = m.group(2).strip()

    # False-positive guard: period after code → numbered section label, not data row
    # E.g. "1. Tiền" with period after the digit
    if rest.startswith("."):
        return None

    # False-positive guard: must have at least one VN-format number
    if not _VN_NUMBER_GUARD_RE.search(rest):
        return None

    # Split rest into label + values using 2+ spaces as separator
    parts = re.split(r"\s{2,}", rest, maxsplit=1)
    if len(parts) >= 2:
        label = parts[0].strip()
        values_rest = parts[1].strip()
    else:
        # Single-space separation — find where values start
        num_match = _VN_NUMBER_GUARD_RE.search(rest)
        if num_match:
            split_pos = num_match.start()
            while split_pos > 0 and rest[split_pos - 1] == " ":
                split_pos -= 1
            label = rest[:split_pos].rstrip()
            values_rest = rest[num_match.start():].strip()
        else:
            label = rest
            values_rest = ""

    return (code, label, values_rest)


# ---------------------------------------------------------------------------
# BT3-FIX5 Ruling A — Recognized section header gate
# ---------------------------------------------------------------------------

def _is_recognized_section_header(stripped: str) -> bool:
    """
    BT3-FIX5 Ruling A — POSITIVE-KEEP gate for non-code lines.

    Return True ONLY if stripped is a recognized BCTC section-level header.
    Uses diacritic-insensitive matching via _norm() so poppler OCR
    ("BANG CAN DOI", partial diacritics) and PyMuPDF OCR (full diacritics) both match.

    Recognized headers are structural section labels that appear in Vietnamese BCTC
    balance sheets (and income/cash-flow statements) with consistent structural
    tokens regardless of diacritic fidelity:
      - "A.", "B.", "C.", "D.", "E." — section letters (short-form headers)
      - "I.", "II.", "III.", "IV.", "V." — sub-section roman numerals

    Design is deliberately NARROW — only matches structural section labels.
    It does NOT attempt to match arbitrary Vietnamese section names by keyword.
    Narrow gate = zero false-positives on garbled OCR noise.

    Lines that are real data rows always carry a code and are handled by the
    code-path first. The recognizer is only reached when no code was found.
    """
    if not stripped:
        return False

    normalized = _norm(stripped)

    # Section-letter headers (e.g. "A. TAI SAN NGAN HAN", "D. VON CHU SO HUU")
    if re.match(r"^[A-E]\.\s+[A-Z]", normalized):
        return True

    # Sub-section roman numeral headers (e.g. "I. Tien va cac khoan")
    if re.match(r"^(I{1,3}|IV|V|VI{0,3}|IX|X{1,3})\.\s+[A-Z]", normalized):
        return True

    return False


# ---------------------------------------------------------------------------
# BT3-FIX5 Ruling B — Positional cutoff
# ---------------------------------------------------------------------------

def _apply_positional_cutoff(rows: List[Dict], statement_section: str) -> List[Dict]:
    """
    BT3-FIX5 Ruling B — Drop all rows after the last sentinel code.

    In Vietnamese BCTC balance sheets, the accounting identity row
    (code 440 = total equity+liabilities, or code 270 = total assets) is
    the last meaningful data row. Everything after it belongs to the
    signature block, digital certificate, or footer — never to the table.

    Implementation: scan rows in reverse; find the last row with a code in
    the sentinel set; drop all rows after it. Rows AT the sentinel are kept.

    Args:
        rows:              All assembled rows (stitched across pages).
        statement_section: "balance_sheet" | "income_statement" | "cash_flow"

    Returns:
        Truncated rows list (sentinel row and everything before it).
        Returns rows unchanged if no sentinel is found (logs warning).
    """
    # Sentinel sets per statement type
    _BALANCE_SHEET_SENTINELS = frozenset({"270", "440"})
    _INCOME_SENTINELS = frozenset({"50", "60", "70"})
    _CASH_FLOW_SENTINELS = frozenset({"70"})

    if statement_section == "balance_sheet":
        sentinels = _BALANCE_SHEET_SENTINELS
    elif statement_section == "income_statement":
        sentinels = _INCOME_SENTINELS
    elif statement_section == "cash_flow":
        sentinels = _CASH_FLOW_SENTINELS
    else:
        sentinels = _BALANCE_SHEET_SENTINELS

    # Find the last sentinel row index (scan in reverse)
    last_sentinel_idx = None
    for i in range(len(rows) - 1, -1, -1):
        code = rows[i].get("code")
        if code and code in sentinels:
            last_sentinel_idx = i
            break

    if last_sentinel_idx is None:
        logger.warning(
            "_apply_positional_cutoff: no sentinel code %r found in rows — "
            "positional cutoff NOT applied. Check OCR quality or statement section.",
            sorted(sentinels),
        )
        return rows

    cutoff_count = len(rows) - (last_sentinel_idx + 1)
    if cutoff_count > 0:
        logger.info(
            "_apply_positional_cutoff: dropped %d post-sentinel rows "
            "(last sentinel code=%r at row_order=%r)",
            cutoff_count,
            rows[last_sentinel_idx].get("code"),
            rows[last_sentinel_idx].get("row_order"),
        )
    return rows[: last_sentinel_idx + 1]


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# BCTC standard major subtotal codes (is_summary_row = 1)
_SUMMARY_CODES = frozenset({"100", "200", "270", "300", "400", "440"})

# Regex: BCTC code row — code appears AT START of line (code-first format, 2+ spaces):
#   "100  TÀI SẢN NGAN HAN  58.102.970.741.619"
# BT3-FIX4 CHANGE-2: code group extended to \d{2,3}[a-z]? to accept letter-suffix codes
#   like "421b" (clean OCR) or "411q" (OCR character error for "411a").
_CODE_ROW_START_RE = re.compile(r"^\s*(\d{2,3}[a-z]?)\s{2,}(.+)$")

# Regex: BCTC code row — code appears AFTER label, followed by optional values (label-first format):
#   "A. TÀI SẢN NGAN HAN  100  58.102.970.741.619  45.535.942.846.453"
#   "I. Tiền và các khoản tương đương tiền  110  10.540.181.640.920  ..."
#   "1. Tiền  111  8.084.826.991.114  6.725.619.929.289"
#   "Một khoản mục không có số liệu  999"  (code at end, no values)
# Pattern: (non-empty label text) + 2+spaces + (2-3 digit code) + optional trailing
# BT3-FIX4 CHANGE-2: code group extended to \d{2,3}[a-z]? to accept letter-suffix codes
#   (e.g. "421b" for sub-items, "411q" for OCR character errors).
_CODE_ROW_LABEL_FIRST_RE = re.compile(
    r"^(.+?)\s{2,}(\d{2,3}[a-z]?)\s*(.*?)$"
)

# Regex: BCTC "code-only column" row — code at start with single space then value(s).
# FPT pages 4-5 render codes in a separate OCR column:
#   "270 88.089.621.779.862"         (Total Assets)
#   "300 44.338.155.487.272"         (Total Liabilities)
#   "221 — 11 15.385.816.846.287"    (note ref between code and value — strip it)
# This pattern: code + single space + optional note fragment + value numeric token.
# Constraint: line must contain a VN-format number (dot-thousands or plain digits).
# The label is stored as "" (code-column block; no label on same line).
_CODE_VALUE_COL_RE = re.compile(
    r"^\s*(\d{2,3})\s+(?:[-—\w\s]*?)(\d[\d.,]+(?:\.\d+)?|\(\d[\d.,]+\))\s*$"
)

# Regex: BCTC label-code-value on same line with single spaces (FPT page 7 layout):
#   "D. VỐN CHỦ SỞ HỮU 400 43.751.466.292.590 35.727.540.104.800"
#   "TONG CỘNG NGUON VỐN (440=300+400) 440 88.089.621.779.862 71.999.995.678.620"
#   "I. Vốn chủ sở hữu 410 24 43.748.716.292.590 35.724.790.104.800"
#   "6. Dự phòng phải thu ngắn hạn khó đòi 137 9 (586.166.744.274) (619.531.925.859)"
#   "- Giá trị hao mòn lũy kế 223 (13.762.875.752.850) (11.683.165.704.793)"
#   "- Lợi nhuận sau thuế chưa phân phối kỳ này 421b 6.924.484.515.123 5.572.300.562.297"
# Pattern: any label text (including parentheses) + space + 2-3 digit code +
#          space + optional-note + VN-number value (positive or parenthetical negative).
# BT3-FIX-3: Extended to also match lines starting with "-" (dash-prefixed sub-items)
# and parenthetical negative values like "(13.762.875.752.850)".
# Must end with a VN-format number (positive or in-paren negative) to distinguish
# from pure label lines.
#
# BT3-FIX4 CHANGES:
#   CHANGE-1: trailing anchor relaxed from [a-zA-Z|\\]* (zero-or-more) to [a-zA-Z|\\]?
#             (at most one) — allows lines ending with ")" (parenthetical negative prior
#             value) or a digit to match. Unblocks dash sub-items (A1) and note-ref
#             lines (A2) where the last character is not a letter.
#   CHANGE-2: code group extended to \d{2,3}[a-z]? — accepts letter-suffix codes
#             like "421b". Suffix is kept in the code field value.
#   CHANGE-3: optional note-number group extended from \d{1,2} to \d{1,3} — handles
#             up to 3-digit Thuyết minh note ref numbers (defensive future-proofing).
_VN_NUMBER_TOKEN = r"(?:\d[\d.,]+|\(\d[\d.,]+\))"  # positive or paren-negative VN number
_CODE_ROW_SINGLE_SPACE_RE = re.compile(
    r"^(.+?)\s+(\d{2,3}[a-z]?)\s+(?:\d{1,3}\s+)?(" + _VN_NUMBER_TOKEN + r"(?:\s+" + _VN_NUMBER_TOKEN + r")?)\s*[a-zA-Z|\\]?\s*$"
)

# Regex: period header — Vietnamese date format DD/MM/YYYY (or YYYY/MM/DD variation)
_DATE_RE = re.compile(r"\d{1,2}/\d{1,2}/\d{4}")

# Regex: detect a digital-signature timestamp immediately following a date.
# Signatures appear as: "26/01/2026 16:18:09 +07'00'" — HH:MM:SS after the date.
# We reject any date found on a line that also contains an HH:MM:SS time pattern.
_SIGNATURE_TIME_RE = re.compile(r"\d{2}:\d{2}:\d{2}")

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

    BT3-FIX5 Ruling C: apply _norm() for diacritic-insensitive keyword matching.

    Examples:
        "Đơn vị: VND"     → "vnd"
        "Đơn vị tính: Tỷ đồng" → "billion_vnd"
        "Đơn vị tính: Triệu đồng" → "billion_vnd"  (treat as billion for storage)
    """
    norm_text = _norm(text)
    if any(_norm(kw) in norm_text for kw in _BILLION_KEYWORDS):
        return _UNIT_BILLION_VND
    # If the line says raw "vnd" (no billion qualifier) → vnd
    if any(_norm(kw) in norm_text for kw in _VND_KEYWORDS):
        return _UNIT_VND
    # Default to billion_vnd (BCTC standard)
    return _UNIT_BILLION_VND


def _is_signature_line(line: str) -> bool:
    """
    Return True if the line looks like a digital-signature timestamp.

    Signature lines contain a date AND a time pattern (HH:MM:SS), e.g.:
        "26/01/2026 16:18:09 +07'00'"
        "Date: 2026.01.26 16:18:09 +07'00'"

    Such lines must NOT contribute to period_current / period_prior detection.
    """
    return bool(_SIGNATURE_TIME_RE.search(line))


def _detect_periods(lines: List[str]) -> tuple[Optional[str], Optional[str]]:
    """
    Scan lines for date patterns to identify period_current and period_prior.
    Returns (period_current, period_prior) — both may be None.

    BT-7 hardening: two-pass approach.
    Pass 1 (preferred): look for a line containing EXACTLY TWO dates (BS column
        header, e.g. "31/12/2025      31/12/2024"). Two dates on one line is a
        strong signal for the BCTC period header. Use those as current + prior.
    Pass 2 (fallback): scan all lines for the first date that is NOT on a
        signature line (does not contain HH:MM:SS adjacent to the date).

    Rationale: cover pages and digital-signature pages often contain a single date
    ("26/01/2026" = signature timestamp). The BS period header always contains
    two dates on the same line. By preferring two-date lines, we avoid picking
    up the signature date as period_current.
    """
    # Pass 1: find a line with exactly two dates — strong BS header signal
    for line in lines:
        # Reject signature lines regardless
        if _is_signature_line(line):
            continue
        matches = _DATE_RE.findall(line)
        if len(matches) >= 2:
            # Two dates on the same line = BS period header (current + prior)
            return matches[0], matches[1]

    # Pass 2: fallback — collect dates from non-signature lines (first two unique)
    dates_found: List[str] = []
    for line in lines:
        if _is_signature_line(line):
            continue
        matches = _DATE_RE.findall(line)
        for m in matches:
            if m not in dates_found:
                dates_found.append(m)
        if len(dates_found) >= 2:
            break

    period_current = dates_found[0] if dates_found else None
    period_prior = dates_found[1] if len(dates_found) > 1 else None
    return period_current, period_prior


def _coerce_ocr_number(raw: str) -> Optional[str]:
    """
    Attempt to coerce an OCR-mangled number into a parseable form.

    Handles common OCR artifacts in VN financial PDFs:
    - "44,338.155.487.272" — OCR renders first separator as comma, rest as dots.
      In VN format all separators should be dots (dot = thousands). Replace first
      comma with a dot if the rest of the string uses dots as thousands.
    - "1,381.813.111.264" — same pattern.

    Returns a cleaned string ready for vn_number_normalize, or None if no
    correction can be applied.
    """
    if "," not in raw:
        return None  # No comma → standard path

    # Check if it looks like: digits,digits.digits.digits... (VN with first-sep comma)
    # Pattern: number before comma + "," + three-digit group + rest with dots
    m = re.match(r"^(\d+),(\d{3})((?:\.\d{3})*)$", raw.strip())
    if m:
        # Replace the leading comma with a dot → fully VN dot-thousands format
        return m.group(1) + "." + m.group(2) + m.group(3)

    # Negative variant: "(44,338.155.487.272)"
    m2 = re.match(r"^\((\d+),(\d{3})((?:\.\d{3})*)\)$", raw.strip())
    if m2:
        return "-" + m2.group(1) + "." + m2.group(2) + m2.group(3)

    return None


def _parse_value(raw: Optional[str]) -> Optional[float]:
    """
    Apply vn_number_normalize then convert to float.
    On failure, try OCR-coercion for mixed comma/dot numbers.
    Returns None on any failure.
    """
    if raw is None:
        return None
    cleaned = str(raw).strip()
    normalized = vn_number_normalize(cleaned)
    if normalized is None:
        # Try OCR-coercion (e.g. "44,338.155.487.272" → "44.338.155.487.272")
        coerced = _coerce_ocr_number(cleaned)
        if coerced is not None:
            normalized = vn_number_normalize(coerced)
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

    Handles three BCTC OCR layouts:
    1. Code-first (2+ spaces): "100  TÀI SẢN NGAN HAN  58.102..."
    2. Label-first (2+ spaces): "A. TÀI SẢN NGAN HAN  100  58.102..."
                                "1. Tiền  111  8.084.826.991.114  6.725.619.929.289"
    3. Code-value column (single space, no label on line):
       "270 88.089.621.779.862"  (FPT separate-column OCR layout)
       "221 — 11 15.385.816.846.287"  (note ref stripped)

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

    # Layout 3: code-value column — code + single space + optional note fragment + numeric value
    # Used when Tesseract renders the code column separately from the label column.
    # Example: "270 88.089.621.779.862" → code="270", label="", values="88.089.621.779.862"
    m3 = _CODE_VALUE_COL_RE.match(stripped)
    if m3:
        code = m3.group(1)
        value_token = m3.group(2).strip()
        return (code, "", value_token)

    # Layout 4: label + single space + code + single space + values (FPT page 7 inline).
    # Example: "D. VỐN CHỦ SỞ HỮU 400 43.751.466.292.590 35.727.540.104.800"
    # More permissive than Layout 2 (accepts single space separation).
    # Guard: line must end with a VN-format numeric block.
    m4 = _CODE_ROW_SINGLE_SPACE_RE.match(stripped)
    if m4:
        label = m4.group(1).strip()
        code = m4.group(2)
        values_rest = m4.group(3).strip()
        return (code, label, values_rest)

    # Layout 5: scan-and-extract (BT3-FIX5 Ruling D — diacritic-insensitive code finder).
    # Only reached when Layouts 1-4 all fail. Handles embedded codes where the label
    # portion contains diacritic-mangled chars that break the boundary regexes in
    # Layouts 2 and 4 (e.g. "222/223/226/131/319/421b" on poppler substrate).
    m5 = _find_code_in_line(stripped)
    if m5 is not None:
        return m5

    # Layout 6: Roman-numeral code at line start (FIX-BCTC-ENRICH-SILENT-0ROWS).
    # B02-TCTD banking BCTCs use Roman codes I, II, III, IV, V, VI, VII, VIII, IX, X,
    # XI, XII, XIII instead of 3-digit numeric codes. Only reached when Layouts 1-5
    # all fail (i.e. no 2-3 digit numeric code found in the line).
    # Non-regression: "I. xxx" (period after code) is rejected by _try_parse_roman_code_row
    # false-positive guard; those lines are handled by _is_recognized_section_header().
    m6 = _try_parse_roman_code_row(stripped)
    if m6 is not None:
        return m6

    # Layout 7: single-digit sub-code at line start (FIX-BCTC-ENRICH-SILENT-0ROWS).
    # B02-TCTD sub-items use codes 1, 2, 3, ... under each Roman section.
    # Only reached when Layouts 1-6 all fail.
    # Non-regression: "1. xxx" (period after digit) is rejected; corporate B01-DN
    # sub-items like "1. Tiền  111  value" already match Layouts 1-4 before reaching here.
    m7 = _try_parse_single_digit_code_row(stripped)
    if m7 is not None:
        return m7

    return None


def _parse_value_cells(values_rest: str) -> List[str]:
    """
    Split a value string into individual value tokens.

    Primary: split on 2+ spaces (standard BCTC inline layout).
    Fallback: when result is 1 token that contains a single space between two
    VN-format numbers (layout 4 single-space separation), split on that space.

    Example:
      "43.751.466.292.590 35.727.540.104.800" → ["43.751.466.292.590", "35.727.540.104.800"]
    """
    if not values_rest.strip():
        return []
    parts = re.split(r"\s{2,}", values_rest.strip())
    tokens = [p.strip() for p in parts if p.strip()]

    # Fallback: single token that may be two VN numbers joined by a single space
    if len(tokens) == 1 and " " in tokens[0]:
        # Try splitting on single space; check each half looks like a VN number
        sub = tokens[0].split(" ")
        # Filter to at most 2 candidate value tokens (current + prior)
        candidates = [s.strip() for s in sub if s.strip()]
        vn_like = [
            s for s in candidates
            if re.match(r"^\(?[\d.,]+\)?$", s)
        ]
        if len(vn_like) >= 2:
            return vn_like[:2]
        elif len(vn_like) == 1:
            return vn_like

    return tokens


def _is_three_block_layout(lines: List[str]) -> bool:
    """
    Detect the three-block OCR layout used on FPT Q4 pages 4 and 6.

    In this layout, labels, codes, and values appear in separate OCR blocks:
      - Labels block: free text lines (item descriptions)
      - Code block: "Mã số" header followed by standalone code integers (one per line)
      - Value block: date header followed by numeric values (one per line)

    Detected by: the text contains "mã số" (case-insensitive) AND there is at
    least one standalone code integer (2-3 digits on its own line) appearing
    AFTER the "mã số" marker. Distinguish from the period-detection note refs
    (1-2 digit "Thuyết minh" codes) by requiring the isolated integer to be
    ≥100 (a BCTC structural code) — or to appear before any "thuyết minh" header.

    BT3-FIX5 Ruling C: use _norm() for "mã số" and "thuyết" checks so poppler
    OCR variants ("ma so", "thuy") match without exact diacritics.

    Returns True if three-block layout detected.
    """
    _NORM_MA_SO = _norm("mã số")
    full_norm = _norm("\n".join(lines))
    if _NORM_MA_SO not in full_norm:
        return False

    # Find the position of "mã số" line
    ma_so_idx = None
    for i, line in enumerate(lines):
        if _NORM_MA_SO in _norm(line):
            ma_so_idx = i
            break

    if ma_so_idx is None:
        return False

    # After "Mã số", count standalone code-looking integers (2-3 digits, ≥100)
    # before any "thuyết" / "thuy" keyword (which starts the note-ref block)
    _NORM_THUY = _norm("thuy")
    count_codes = 0
    for i in range(ma_so_idx + 1, len(lines)):
        stripped = lines[i].strip()
        if not stripped:
            continue
        norm_s = _norm(stripped)
        # Stop at "thuyết" / "thuy" / "minh" header
        if _NORM_THUY in norm_s or norm_s == "MINH":
            break
        # Count standalone 3-digit BCTC structural code (100-999 range)
        if re.match(r"^\d{3}$", stripped) and 100 <= int(stripped) <= 999:
            count_codes += 1

    return count_codes >= 1


def _parse_three_block_layout(
    lines: List[str],
    page_num: int,
    unit: str,
    period_current: Optional[str],
    period_prior: Optional[str],
    row_order_start: int,
) -> tuple[List[Dict], int]:
    """
    Parse the three-block OCR layout (BT3-FIX-2 fix).

    Layout structure (FPT Q4 pages 4 and 6):
      Block 1 — Labels:  free text lines (item descriptions)
      "Mã số" header
      Block 2 — Codes:   standalone 3-digit BCTC codes (100, 110, 111, ...)
      "Thuyết minh" header + note refs (1-2 digit, ignored for pairing)
      "Tại ngày..." context line
      Block 3a — Values current: date header (31/12/2025) followed by numeric values
      form ref + unit lines (ignored)
      Block 3b — Values prior: date header (31/12/2024) followed by numeric values

    Algorithm:
      1. Collect labels (free text lines before "Mã số")
      2. Collect codes (standalone 3-digit integers after "Mã số", before "Thuyết")
      3. Collect current values (numeric lines after first date)
      4. Collect prior values (numeric lines after second date)
      5. Pair: code[i] → label[i], value_current[i], value_prior[i]
         (positional pairing — same row count in each block)

    Note reference codes (1-2 digit integers after "Thuyết minh") are detected
    and skipped — they appear at the end of the code block, not paired with labels.

    Returns (rows, next_row_order_start).
    """
    rows: List[Dict] = []
    row_order = row_order_start

    # Phase 1: find "Mã số" header line index (BT3-FIX5: use _norm() for diacritic tolerance)
    _NORM_MA_SO = _norm("mã số")
    ma_so_idx = None
    for i, line in enumerate(lines):
        if _NORM_MA_SO in _norm(line):
            ma_so_idx = i
            break

    if ma_so_idx is None:
        # Fallback: should not happen given _is_three_block_layout check
        return [], row_order_start

    # Phase 2: collect labels (free text before "Mã số")
    # BT3-FIX5 Ruling C: use _norm() for all skip checks
    labels: List[str] = []
    for i in range(0, ma_so_idx):
        stripped = lines[i].strip()
        if not stripped:
            continue
        # Skip company header lines and form reference lines using normalized comparison
        norm_s = _norm(stripped)
        if any(_norm(skip) in norm_s for skip in [
            "công ty", "số 10", "phường", "thành phố", "báo cáo",
            "cho kỳ", "đến ngày", "bảng cân", "bang can", "mẫu số", "mau so",
        ]):
            continue
        # Skip very short lines (noise)
        if len(stripped) < 3:
            continue
        # Skip if the line is ONLY a capital acronym / section header that has
        # a corresponding code-row entry (e.g., "TÀI SẲN" is not an item label)
        if re.match(r"^[A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂẮẲẶĐÊẾỆỔỖỘỞỢỤỨỪỬỮ\s]+$", stripped) and len(stripped) <= 20:
            continue
        labels.append(stripped)

    # Phase 3: collect BCTC codes (3-digit standalone integers after "Mã số",
    # before "Thuyết minh" header)
    # BT3-FIX5 Ruling C: use _norm() for "thuyết" detection
    _NORM_THUY = _norm("thuy")
    codes: List[str] = []
    in_note_refs = False
    for i in range(ma_so_idx + 1, len(lines)):
        stripped = lines[i].strip()
        if not stripped:
            continue
        norm_s = _norm(stripped)
        # Detect "Thuyết minh" block start (diacritic-insensitive)
        if _NORM_THUY in norm_s or norm_s == "MINH":
            in_note_refs = True
            continue
        # Once in note-ref block, stop collecting codes
        if in_note_refs:
            break
        # Collect 3-digit BCTC structural code
        if re.match(r"^\d{3}$", stripped) and 100 <= int(stripped) <= 999:
            codes.append(stripped)

    if not codes:
        return [], row_order_start

    # BT3-FIX-3: Assert len(labels) == len(codes) after collection.
    # If they diverge by more than 1, something is misaligned — log a WARNING
    # and fall back to label="" for unmatched codes (never silently misalign).
    label_code_delta = abs(len(labels) - len(codes))
    if label_code_delta > 1:
        logger.warning(
            "_parse_three_block_layout: page %d label/code count mismatch: "
            "len(labels)=%d len(codes)=%d delta=%d — falling back to label='' "
            "for unmatched codes. Check OCR quality on this page.",
            page_num, len(labels), len(codes), label_code_delta,
        )

    # Phase 4: collect values (current and prior) from value blocks
    # Find first date (31/12/YYYY) line position — marks start of current values
    # Find second date line — marks start of prior values
    date_positions: List[int] = []
    for i in range(ma_so_idx, len(lines)):
        stripped = lines[i].strip()
        if re.match(r"^\d{1,2}/\d{1,2}/\d{4}$", stripped):
            date_positions.append(i)
        if len(date_positions) >= 2:
            break

    _VN_VALUE_RE = re.compile(
        r"^\(?\d[\d.,]*\d\)?$"  # VN-format number, possibly negative in parens
    )

    def _collect_values_after(start_idx: int, stop_idx: Optional[int]) -> List[str]:
        """Collect value-like lines between two index boundaries."""
        vals: List[str] = []
        end = stop_idx if stop_idx is not None else len(lines)
        for i in range(start_idx + 1, end):
            stripped = lines[i].strip()
            if not stripped:
                continue
            if _VN_VALUE_RE.match(stripped) and len(stripped) > 2:
                # Only accept tokens that look like real numeric values
                # (reject single or two-digit note refs)
                if re.match(r"^\d{1,2}$", stripped):
                    continue  # note reference — skip
                vals.append(stripped)
        return vals

    # Find end-of-page sentinel (second date start / end of lines)
    current_values: List[str] = []
    prior_values: List[str] = []

    if len(date_positions) >= 2:
        current_values = _collect_values_after(date_positions[0], date_positions[1])
        prior_values = _collect_values_after(date_positions[1], None)
    elif len(date_positions) == 1:
        current_values = _collect_values_after(date_positions[0], None)
    # else: no dates found — no values available; codes still get emitted with None values

    # Phase 5: pair codes with values positionally
    # codes[i] → current_values[i], prior_values[i]
    for i, code in enumerate(codes):
        value_current_raw = current_values[i] if i < len(current_values) else None
        value_prior_raw = prior_values[i] if i < len(prior_values) else None

        value_current = _parse_value(value_current_raw)
        value_prior = _parse_value(value_prior_raw)
        is_summary = 1 if code in _SUMMARY_CODES else 0

        # Use label at corresponding position (may be None if fewer labels than codes)
        # Labels and codes don't always have 1:1 correspondence due to multi-line labels
        # and section headers, so we use "" as label for unmatched codes.
        label = labels[i] if i < len(labels) else ""

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
        row_order += 1

    return rows, row_order


def _parse_lines_to_rows(
    lines: List[str],
    page_num: int,
    unit: str,
    period_current: Optional[str],
    period_prior: Optional[str],
    row_order_start: int,
) -> tuple[List[Dict], int]:
    """
    Parse text lines from one OCR page into structured row dicts.

    Pure: no I/O, no Tesseract, no HTTP.
    Used by BOTH the live TextTableExtractor.assemble() path
    AND the pre-supplied-text backfill path.

    Tightened else-branch junk filter: only emit a non-code line as a
    header/separator row when it contains ≥3 consecutive alphabetic characters
    (Vietnamese or ASCII). This kills address/number/noise lines (94 junk rows
    on FPT) while preserving genuine section headers like "TÀI SẢN NGẮN HẠN".

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

    # Track codes seen so far (for BT3-FIX-3 dedup guard — R3)
    _seen_codes: Dict[str, int] = {}  # code → count

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        # Skip unit header lines (diacritic-insensitive via _norm())
        if any(_norm(kw) in _norm(stripped) for kw in _UNIT_HEADER_VI_KEYWORDS):
            continue

        # Skip date-only header lines (period headers)
        if _DATE_RE.search(stripped) and len(stripped.split()) <= 4:
            # Likely a period-header line (e.g. "31/12/2025  31/12/2024")
            continue

        # BT3-FIX5 Ruling C: Apply diacritic-insensitive normalization to skip-list.
        # Both the input and each skip key are normalized via _norm() so poppler OCR
        # variants (no/partial diacritics) match the same patterns as full-diacritic
        # PyMuPDF OCR. This replaces the FIX4 diacritic-sensitive low_stripped checks.
        norm_stripped = _norm(stripped)

        # Secondary skip-list (company name, form number, signature block).
        # These are structurally recognizable patterns that always appear outside the
        # table. Applied via _norm() on both sides — immune to diacritic variation.
        if any(_norm(skip) in norm_stripped for skip in _JUNK_SKIP_KEYS):
            continue

        # BT3-FIX5 Ruling C: Diacritic-insensitive date regex for signature dates.
        # Replaces: re.search(r"ngày\s+\d{1,2}\s+tháng", low_stripped)
        # Now: search on norm_stripped (all uppercase, diacritics stripped).
        # Catches "Tại ngày 31 tháng 12 năm 2025", "Tai ngay 31 thang 12 nam 2025", etc.
        if re.search(r"NGAY\s+\d{1,2}\s+THANG", norm_stripped):
            continue

        # BT3-FIX5 Ruling C: Diacritic-insensitive balance-sheet title filter.
        # "BẢNG CÂN ĐỐI" and "BANG CAN DOI" both normalize to "BANG CAN DOI".
        # Also catches "NGUON VON" (NGUỒN VỐN) standalone section header lines.
        if "BANG CAN" in norm_stripped and "DOI" in norm_stripped:
            continue

        # Skip line-continuation fragments (backslash-terminated or single-word with no code)
        if stripped.endswith("\\") and len(stripped.split()) <= 6 and not re.search(r"\d{2,3}", stripped):
            continue

        # Try to match a code row (handles code-first and label-first layouts,
        # plus Layout 5 scan-and-extract fallback for embedded codes).
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

            # BT3-FIX-3 R3: Code dedup guard — detect same code appearing twice
            # on one page. Fresh Tesseract OCR should resolve 222/223 misread
            # naturally; this guard is defensive and logs a WARNING without dropping.
            _seen_codes[code] = _seen_codes.get(code, 0) + 1
            if _seen_codes[code] > 1:
                logger.warning(
                    "_parse_lines_to_rows: page %d duplicate code %r "
                    "(occurrence #%d) — possible OCR misread (e.g. 222/223). "
                    "Do NOT silently drop — emitting row with duplicate code.",
                    page_num, code, _seen_codes[code],
                )

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
            # BT3-FIX5 Ruling A — POSITIVE-KEEP gate:
            # Only emit non-code lines that are recognized section-level headers.
            # All other non-code lines are silently dropped — garbled noise, junk,
            # diacritic variants of known headers, and signature-block text all fail
            # this gate and are never stored as orphan rows.
            #
            # _is_recognized_section_header() uses _norm() internally so it is immune
            # to poppler vs PyMuPDF diacritic variation.
            #
            # This replaces the FIX4 alpha-3 heuristic (re.search(r"[A-Za-zÀ-ỹ]{3,}"))
            # which let through garbled OCR noise that happened to contain 3+ letters.
            if _is_recognized_section_header(stripped):
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
            # else: DROP SILENTLY — no orphan row created (Ruling A core behavior)

        row_order += 1

    return rows, row_order


def _parse_page_lines(
    page_num: int,
    lines: List[str],
    unit: str,
    period_current: Optional[str],
    period_prior: Optional[str],
    row_order_start: int,
) -> tuple[List[Dict], int]:
    """
    Thin wrapper around _parse_lines_to_rows for backward-compat.

    Preserves the positional-argument signature so existing callers and unit
    tests that import _parse_page_lines directly continue to work without change.
    """
    return _parse_lines_to_rows(
        lines=lines,
        page_num=page_num,
        unit=unit,
        period_current=period_current,
        period_prior=period_prior,
        row_order_start=row_order_start,
    )


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

        # Parse each page, dispatching to the correct layout handler.
        #
        # Layout A (BT3-FIX-2): Three-block layout — labels, codes, values in
        #   separate OCR blocks. Detected by "Mã số" header + standalone 3-digit
        #   integers on their own lines. Handler: _parse_three_block_layout().
        #   Example: FPT Q4 pages 4 (current assets, code 100) and 6 (liabilities,
        #   code 300).
        #
        # Layout B: Inline layout — code + label + values on same line (or 2-column).
        #   Handler: _parse_lines_to_rows() with 4-pattern _try_parse_code_row().
        #   Example: FPT Q4 pages 5 (non-current assets + total) and 7 (equity).
        for page in pages:
            page_num = page.get("page_number", 0)
            text = page.get("text", "")
            lines = text.splitlines()

            if _is_three_block_layout(lines):
                page_rows, global_row_order = _parse_three_block_layout(
                    lines=lines,
                    page_num=page_num,
                    unit=unit,
                    period_current=period_current,
                    period_prior=period_prior,
                    row_order_start=global_row_order,
                )
                logger.info(
                    "TextTableExtractor: page %d → three-block layout detected",
                    page_num,
                )
            else:
                page_rows, global_row_order = _parse_lines_to_rows(
                    lines=lines,
                    page_num=page_num,
                    unit=unit,
                    period_current=period_current,
                    period_prior=period_prior,
                    row_order_start=global_row_order,
                )

            logger.info(
                "TextTableExtractor: page %d → %d rows",
                page_num, len(page_rows),
            )

            all_rows.extend(page_rows)

        # BT3-FIX5 Ruling B — Positional cutoff:
        # Drop all rows after the last sentinel code (270/440 for balance sheets).
        # Applied after all pages are stitched — the sentinel (440) only appears on
        # the last page, so per-page cutoff would not work.
        all_rows = _apply_positional_cutoff(all_rows, statement_section)

        logger.info(
            "TextTableExtractor.assemble: section=%s pages=%d rows=%d "
            "period_current=%s period_prior=%s (after positional cutoff)",
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
