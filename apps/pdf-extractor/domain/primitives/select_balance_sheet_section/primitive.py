"""
domain/primitives/select_balance_sheet_section/primitive.py — BT-7 + BT3-FIX-2

Pure function: select_balance_sheet_section(page_texts) -> list[dict]

Scans a list of pre-supplied {page_number, text} dicts and returns only the
contiguous balance-sheet section pages. Shared core logic used by both:
  - Path A (pre-supplied text from mcp-server) — applied in ExtractTablesUseCase
    BEFORE passing pages to TextTableExtractor.assemble()
  - Path B (auto-locate via PdfOcrAdapter.locate_balance_sheet_pages) — already
    applies BS marker scan; this primitive mirrors the same logic on plain text.

DDD:
    - PURE: zero I/O, zero imports from infrastructure/application/interface.
    - Domain primitive layer. Safe per Fence-A.

Algorithm (mirrors PdfOcrAdapter.locate_balance_sheet_pages logic, but on text):
    1. For each page, check if any BS marker appears in its text (case-insensitive).
    2. Track contiguous BS section: once started, allow 1 gap page.
    3. Stop after 2 consecutive non-BS pages.
    4. Return the selected pages in their original order (page_number preserved).

Vietnamese BS markers (strong indicators — require at least 1 hit):
    "bảng cân đối kế toán" / "bang can doi ke toan"  — explicit BS title
    "tài sản ngắn hạn" / "tai san ngan han"           — current assets section header
    "tài sản dài hạn" / "tai san dai han"             — non-current assets
    "nguồn vốn" / "nguon von"                         — equity/liabilities section
    "tổng cộng tài sản" / "tong cong tai san"         — total assets subtotal
    "tổng cộng nguồn vốn" / "tong cong nguon von"     — total liab+equity subtotal
    "nợ phải trả" / "no phai tra"                     — liabilities header
    "vốn chủ sở hữu" / "von chu so huu"               — equity header

OCR-VARIANT MARKERS (BT3-FIX-2):
    Real FPT Q4 stored OCR (20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf, 46 pages)
    has imperfect diacritics on page 4 (current assets section):
        "BANG CÂN ĐỐI KẾ TOÁN" (not "BẢNG CÂN ĐỐI") — missing ả in BẢNG
        "TÀI SAN NGAN HAN"     (not "TÀI SẢN NGẮN HẠN") — ẢN→AN, ẮN→N, Ạ→A
    These OCR artifacts made page 4 invisible to the section filter, causing:
        - Filter selected only pages 5/6/7 (3 of 4 BS pages)
        - Code 400 (equity) was present, but the balance identity required all
          three of 270/300/400 with parseable values → balance_pass=False (delta=0)
        - BT-5 gate BLOCKED the push → old stale rows never overwritten
    Fix: add mixed-diacritic variant markers that DO appear in the real OCR:
        "bang cân đối"    — matches "BANG CÂN ĐỐI" (all 4 BS pages have "(tiếp theo)")
        "cân đối kế toán" — substring present in all 4 BS pages
        "tài san ngan han" — mixed: tài correct, san/ngan/han missing diacritics

Fallback: if NO marker is found in any page, return ALL pages unchanged (to avoid
silently losing all data for docs with non-standard layouts). This is logged at
caller level. The primitive returns the full list in that case.

FPT Q4 2025 example (the BT-7 bug fix):
    44-page pre-supply → markers found on pages 6-9 only →
    filtered result = 4 BS pages → assembler produces ~8 code rows →
    period_current from BS header ("31/12/2025"), not signature page ("26/01/2026").

FPT Q4 2025 example (the BT3-FIX-2 bug fix):
    46-page real stored OCR → OCR-variant markers now catch page 4 →
    filtered result = 4 BS pages (4/5/6/7) → balance_pass=True → gate PASSES.
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional

# ---------------------------------------------------------------------------
# Vietnamese balance-sheet section markers
# Strong markers — any single match qualifies a page as BS
# ---------------------------------------------------------------------------
_BS_STRONG_MARKERS = [
    "bảng cân đối kế toán",
    "bang can doi ke toan",
    "tài sản ngắn hạn",
    "tai san ngan han",
    "tài sản dài hạn",
    "tai san dai han",
    "nguồn vốn",
    "nguon von",
    "tổng cộng tài sản",
    "tong cong tai san",
    "tổng cộng nguồn vốn",
    "tong cong nguon von",
    "nợ phải trả",
    "no phai tra",
    "vốn chủ sở hữu",
    "von chu so huu",
    # Additional strong markers to catch variant spellings
    "tình hình tài chính",        # "tình hình tài chính" appears in some header formats
    "tinh hinh tai chinh",
    # BT3-FIX-2: OCR-variant markers for real stored FPT Q4 OCR (diacritic artifacts)
    # Real OCR renders "BANG CÂN ĐỐI KẾ TOÁN" (missing ả in BẢNG) and
    # "TÀI SAN NGAN HAN" (missing ẢN→AN etc.) on the current-assets page (page 4).
    # Without these, page 4 was invisible to the filter → only 3/4 BS pages selected
    # → balance_pass=False (at least one code value missing) → BT-5 gate blocked.
    "bang cân đối",               # matches "BANG CÂN ĐỐI KẾ TOÁN" on all 4 FPT BS pages
    "cân đối kế toán",            # substring present on all 4 FPT BS pages (page headers)
    "tài san ngan han",           # OCR variant: tài correct, san/ngan/han missing diacritics
    "mau so b 01",                # "MẪU SỐ B 01-DN/HN" form code present on all BS pages
]

# Maximum balance-sheet section length in pages
# (BCTC balance sheets rarely span more than 10 pages)
_MAX_BS_PAGES = 10

# Gap tolerance: allow this many consecutive non-BS pages within a section
_GAP_TOLERANCE = 1


def _page_has_bs_marker(text: str) -> bool:
    """
    Return True if the page text contains at least one balance-sheet marker.
    Case-insensitive. Pure — no I/O.
    """
    lower = text.lower()
    return any(marker in lower for marker in _BS_STRONG_MARKERS)


def select_balance_sheet_section(page_texts: List[Dict]) -> List[Dict]:
    """
    Filter a list of {page_number, text} dicts to only the balance-sheet section.

    Args:
        page_texts: List of dicts with keys "page_number" (int) and "text" (str).
                    Usually from mcp-server's pdf_extracted_text (pre-supplied OCR).

    Returns:
        Filtered list containing only the BS-section pages, in original order.
        Empty list if page_texts is empty.
        ALL pages returned unchanged if no markers found (safe fallback — avoids
        silent data loss for non-standard layouts).

    Pure function — zero I/O, zero side effects, fully deterministic.
    """
    if not page_texts:
        return []

    # Phase 1: identify which pages have BS markers
    bs_flags = []
    for page in page_texts:
        text = page.get("text", "")
        bs_flags.append(_page_has_bs_marker(text))

    # If no marker found anywhere → return all pages unchanged (safe fallback)
    if not any(bs_flags):
        return list(page_texts)

    # Phase 2: select the contiguous BS section
    # Allow up to _GAP_TOLERANCE consecutive non-BS pages within the section.
    # Stop when we see more than _GAP_TOLERANCE consecutive non-BS pages.
    selected_indices: List[int] = []
    in_section = False
    consecutive_non_bs = 0

    for i, has_marker in enumerate(bs_flags):
        if has_marker:
            in_section = True
            consecutive_non_bs = 0
            selected_indices.append(i)
        elif in_section:
            consecutive_non_bs += 1
            if consecutive_non_bs <= _GAP_TOLERANCE:
                # Within tolerance — include this gap page tentatively
                selected_indices.append(i)
            else:
                # Too many consecutive non-BS pages — section has ended.
                # Remove the trailing gap pages we tentatively included.
                while (
                    selected_indices
                    and consecutive_non_bs > _GAP_TOLERANCE
                    and not bs_flags[selected_indices[-1]]
                ):
                    selected_indices.pop()
                    consecutive_non_bs -= 1
                break

        # Cap: stop after _MAX_BS_PAGES
        if len(selected_indices) >= _MAX_BS_PAGES:
            break

    if not selected_indices:
        # Fallback: couldn't isolate a section — return all (safe)
        return list(page_texts)

    return [page_texts[i] for i in selected_indices]
