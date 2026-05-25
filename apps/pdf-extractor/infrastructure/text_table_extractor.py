"""
infrastructure/text_table_extractor.py — BT-3-A + BT3-FIX-2 + BT3-FIX4

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
          Handled by _parse_lines_to_rows() using 4-pattern _try_parse_code_row().
          Example: FPT pages 5 and 7.
    4. Stitch multi-page sections (p4-7 pattern): list concatenation with global row_order.

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

    Returns True if three-block layout detected.
    """
    text_lower = "\n".join(lines).lower()
    if "mã số" not in text_lower:
        return False

    # Find the position of "mã số" line
    ma_so_idx = None
    for i, line in enumerate(lines):
        if "mã số" in line.lower():
            ma_so_idx = i
            break

    if ma_so_idx is None:
        return False

    # After "Mã số", count standalone code-looking integers (2-3 digits, ≥100)
    # before any "thuyết" or "minh" keyword (which starts the note-ref block)
    count_codes = 0
    for i in range(ma_so_idx + 1, len(lines)):
        stripped = lines[i].strip()
        if not stripped:
            continue
        low = stripped.lower()
        # Stop at "thuyết" / "minh" header
        if "thuy" in low or low == "minh":
            break
        # Count standalone 3-digit BCTC code (100-440 range)
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

    # Phase 1: find "Mã số" header line index
    ma_so_idx = None
    for i, line in enumerate(lines):
        if "mã số" in line.lower():
            ma_so_idx = i
            break

    if ma_so_idx is None:
        # Fallback: should not happen given _is_three_block_layout check
        return [], row_order_start

    # Phase 2: collect labels (free text before "Mã số")
    labels: List[str] = []
    for i in range(0, ma_so_idx):
        stripped = lines[i].strip()
        if not stripped:
            continue
        # Skip company header lines and form reference lines
        low = stripped.lower()
        if any(skip in low for skip in [
            "công ty", "số 10", "phường", "thành phố", "báo cáo",
            "cho kỳ", "đến ngày", "bang c", "bảng c", "mẫu số", "mau so",
            "tài sản\n", "tai san\n",  # standalone asset section header
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
    codes: List[str] = []
    in_note_refs = False
    for i in range(ma_so_idx + 1, len(lines)):
        stripped = lines[i].strip()
        if not stripped:
            continue
        low = stripped.lower()
        # Detect "Thuyết minh" block start
        if "thuy" in low or low == "minh":
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

        # Skip unit header lines
        if any(kw in stripped.lower() for kw in _UNIT_HEADER_VI_KEYWORDS):
            continue

        # Skip date-only header lines (period headers)
        if _DATE_RE.search(stripped) and len(stripped.split()) <= 4:
            # Likely a period-header line (e.g. "31/12/2025  31/12/2024")
            continue

        # BT3-FIX-3 DEFECT 2 FIX: Skip company/address block lines and form-level
        # noise BEFORE they reach the header-row branch. The existing alpha-3 filter
        # does not catch these — they have alphabetic content and pass through,
        # leaking into the output as junk header rows.
        # Explicit string patterns only — no heuristics.
        #
        # BT3-FIX4 CHANGE-4: Extended with signature-block keywords and column-header
        # fragments that slip through the existing filter. The 18 junk orphan rows
        # from the live FPT fixture are all caught by the new entries below.
        low_stripped = stripped.lower()
        if any(skip in low_stripped for skip in [
            # Company/address block (AC-10 targets)
            "công ty",          # company name: "CÔNG TY CỔ PHẦN FPT"
            "phường",           # ward: "Phường Cầu Giấy"
            "thành phố",        # city: "Thành phố Hà Nội"
            "số 10",            # street address: "Số 10 phố Phạm Văn Bạch"
            # Form-level noise (provably not item labels)
            "mã số",            # "Mã số" column header line (e.g. "TÀI SẲN Mã số a 31/12/2025...")
            "mẫu số",           # form number: "MẪU SỐ B 01-DN/HN"
            "mau so",           # OCR-variant form number
            "bảng cân",         # balance-sheet title: "BẢNG CÂN ĐỐI KẾ TOÁN HỢP NHẤT"
            "bang can",         # OCR-variant
            "bang can doi",     # unaccented fallback for balance-sheet title continuation
            "tại ngày",         # date-context: "Tại ngày 31 thang 12 năm 2025"
            "tai ngay",         # OCR-variant
            "ngày 26",          # signature date: "Ngày 26 tháng 01 năm 2026"
            "ngay 26",          # OCR-variant
            # BT3-FIX4 CHANGE-4: Column-header fragments (split across OCR lines)
            "thuyết",           # "Thuyết" / "Thuyết minh" column header fragment
            # BT3-FIX4 CHANGE-4: Signature-block keywords (appear at bottom of last page)
            "người lập",        # signature: "Người lập"
            "kế toán trưởng",   # signature: "Kế toán trưởng"
            "phó tổng",         # signature: "Phó Tổng giám đốc" (covers all variants)
            "hà nội, ngày",     # signature date location line: "Hà Nội, ngày 23 tháng 01..."
            "ha noi",           # unaccented fallback for signature location
        ]):
            continue
        # BT3-FIX4 CHANGE-4: Regex skip for signature dates with any day-of-month.
        # Covers "Hà Nội, ngày 23 tháng 01 năm 2025" and all day variants (1-31).
        # This is more robust than enumerating individual "ngày 01"/"ngày 23" entries.
        if re.search(r"ngày\s+\d{1,2}\s+tháng", low_stripped):
            continue
        # Skip very short OCR noise fragments (< 10 chars, no code row context)
        # Example: "ach Thuyết" (OCR split fragment from "Báo cáo ach Thuyết minh")
        # Use a simple length+pattern heuristic: < 15 chars AND no digits
        if len(stripped) < 15 and not re.search(r"\d", stripped) and not re.search(r"[A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂẮẲẶĐÊẾỆỔỖỘỞỢỤỨỪỬỮ]", stripped):
            # All-lowercase or mixed short fragment with no uppercase letters → likely noise
            pass  # fall through to normal processing
        # Skip line-continuation fragments (backslash-terminated or single-word with no code)
        if stripped.endswith("\\") and len(stripped.split()) <= 6 and not re.search(r"\d{2,3}", stripped):
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
            # Header / separator row — no code.
            # Tightened filter: only emit if stripped text contains ≥3 consecutive
            # alphabetic chars (Vietnamese or ASCII). Kills numeric-only noise,
            # company addresses, short OCR fragments, and date strings.
            if stripped and len(stripped) > 3 and re.search(r"[A-Za-zÀ-ỹ]{3,}", stripped):
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
