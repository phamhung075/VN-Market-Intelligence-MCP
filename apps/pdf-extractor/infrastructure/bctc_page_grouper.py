"""
infrastructure/bctc_page_grouper.py — BTB-DRIFT SSOT grouper

Single Source of Truth for BCTC page-grouping logic.

Both PATH A (build_document_map / generic_md_table_extractor.py) and
PATH B (_run_extraction / pek_engine_adapter.py) MUST call
``group_pages_into_units`` from this module.  Any change to boundary
logic goes HERE ONLY — never in the callers.

Anti-drift gates:
    test_anti_drift_grouper.py AD-2: asserts _group_bboxes_into_units
        does NOT exist in pek_engine_adapter (proves deletion is permanent).
    test_anti_drift_grouper.py AD-1: both PATH A and PATH B descriptor
        builders produce identical unit boundaries for the same sequence.
    test_grouping_convergence.py CG-1 + CG-2: source-level and behavioural
        agreement between PATH A and PATH B.

DDD layer: infrastructure.  Zero I/O, zero model dependency, stdlib only.
Pure functions — safe to import from any layer.

Constants (all moved from generic_md_table_extractor.py as SSOT):
    _GUTTER_POSITION_TOLERANCE
    _ROW_PITCH_CHANGE_TOLERANCE
    _CONTINUATION_MARKERS
    _TITLE_BAND_SCAN_LINES / _TITLE_BAND_MIN_LEN / _TITLE_BAND_MAX_LEN
    _MONEY_GROUP_RE
"""
from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from typing import List, Optional

# ---------------------------------------------------------------------------
# Constants (SSOT — re-imported by generic_md_table_extractor)
# ---------------------------------------------------------------------------

# Gutter position tolerance: two pages belong to the same unit if all gutter
# x-fractions differ by less than this value (as fraction of page width).
# RC-1 calibrated value — proven correct on FPT/ACB BCTC continuation pages.
_GUTTER_POSITION_TOLERANCE: float = 0.05

# Row pitch change tolerance: a unit break fires if row_pitch changes by more
# than this fraction (50% change = significantly different row density).
_ROW_PITCH_CHANGE_TOLERANCE: float = 0.50

# Number of lines from the top of the page text to scan for a title band.
_TITLE_BAND_SCAN_LINES: int = 8

# Minimum character length for a candidate title line.
_TITLE_BAND_MIN_LEN: int = 5

# Maximum character length for a candidate title line.
_TITLE_BAND_MAX_LEN: int = 120

# Continuation marker strings — presence of any of these causes D-5 to return
# False (the page is a continuation of the previous table, not a new one).
_CONTINUATION_MARKERS: tuple = ("tiếp theo", "(continued)", "continued")

# Financial money-group pattern (e.g. "1.234.567" or "44,393,950") —
# lines matching this are table data, not a title band.
_MONEY_GROUP_RE = re.compile(r"\d{1,3}(?:[.,]\d{3})+")


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class PageDescriptor:
    """
    Portable per-page descriptor for the shared grouper.

    Both PATH A (fingerprint-based) and PATH B (bbox-based) adapters build
    one PageDescriptor per page before calling group_pages_into_units().

    Fields:
        page_num:              1-indexed page number.
        page_type:             "table" | "prose" | "blank"
        gutter_count:          Number of structural column gutters detected.
                               0 for prose/blank pages.
        gutter_x_fractions:    List of gutter centre x-positions as fractions
                               of page width.  [] for prose/blank.
        row_pitch:             Estimated row pitch in pixels.  0.0 when
                               unavailable (PATH B — disables pitch guard).
        stored_text:           Stored OCR text for D-5 title-band check.
                               "" disables D-5 (PATH B has no OCR text here).
    """
    page_num: int
    page_type: str                       # "table" | "prose" | "blank"
    gutter_count: int
    gutter_x_fractions: List[float] = field(default_factory=list)
    row_pitch: float = 0.0
    stored_text: str = ""


@dataclass
class UnitDescriptor:
    """
    Logical document unit returned by group_pages_into_units().

    Fields:
        pages:       Ordered list of page numbers in this unit.
        page_type:   "table" | "prose"
        schema_page: First page number of the unit (schema-inheritance anchor).
    """
    pages: List[int]
    page_type: str    # "table" | "prose"
    schema_page: int


# ---------------------------------------------------------------------------
# D-5 title-band detector
# ---------------------------------------------------------------------------

def _is_title_band(stored_text: str) -> bool:
    """
    Detect whether a page opens with a standalone table-title band (D-5).

    Algorithm (cheap — reads stored OCR text, no new Tesseract calls):
        1. Split text into lines. Scan only the first _TITLE_BAND_SCAN_LINES lines.
        2. For each scanned line:
           a. Strip whitespace. Skip empty and lines shorter than _TITLE_BAND_MIN_LEN.
           b. Skip lines containing _MONEY_GROUP_RE match (financial data, not a title).
           c. Skip lines that are purely numeric/punctuation.
           d. Skip lines with fewer than 2 words (likely an OCR column-header artifact).
           e. If a candidate line contains a continuation marker → return False immediately.
           f. Otherwise: record as a candidate title line.
        3. If at least one candidate title line found → return True (D-5 fires).
        4. Otherwise → return False (no title band detected).

    AC-0: detects structural pattern (non-numeric standalone line in top region).
    No BCTC-specific keyword strings used in branching decisions.
    Pure function: no I/O, no Tesseract, no new imports.
    DDD layer: infrastructure.
    """
    if not stored_text:
        return False

    lines = stored_text.splitlines()
    scan_lines = lines[:_TITLE_BAND_SCAN_LINES]

    for line in scan_lines:
        stripped = line.strip()

        # Skip empty or too-short lines
        if len(stripped) < _TITLE_BAND_MIN_LEN:
            continue

        # Skip lines longer than the maximum title length
        if len(stripped) > _TITLE_BAND_MAX_LEN:
            continue

        # Skip lines containing financial money-group patterns (table data, not title)
        if _MONEY_GROUP_RE.search(stripped):
            continue

        # Skip lines that are purely numeric/punctuation/whitespace
        if re.fullmatch(r"[\d.,\s()]+", stripped):
            continue

        # Skip lines with fewer than 2 words — single-char column header artifacts
        # like "TM" or "CS" must not trigger a false D-5 split.
        if len(stripped.split()) < 2:
            continue

        # Continuation marker check: any of these means D-5 does NOT fire
        stripped_lower = stripped.lower()
        for marker in _CONTINUATION_MARKERS:
            if marker in stripped_lower:
                return False

        # At least one candidate title line found — D-5 fires
        return True

    return False


# ---------------------------------------------------------------------------
# Continuity predicate (_is_continuous — replaces _fingerprints_continuous)
# ---------------------------------------------------------------------------

def _is_continuous(desc_a: PageDescriptor, desc_b: PageDescriptor) -> bool:
    """
    Test if two PageDescriptors belong to the same logical table unit.

    Continuity test (AC-0 — purely geometric + structural):
        0. Both must be "table" type (caller ensures this — blanks handled
           separately in the state machine).
        1. gutter_count must be equal.
        2. Each gutter x-fraction must be within GUTTER_POSITION_TOLERANCE (5%).
        3. row_pitch must not change by more than ROW_PITCH_CHANGE_TOLERANCE (50%)
           — only enforced when both pitches are > 0.
        D-5. desc_b.stored_text must NOT contain a title-band signal on page B.
             If it does → return False (new table section announced).

    8-PAGE CAP IS NOT APPLIED HERE: a real >8-page geometrically-identical
    table has identical geometry page-to-page → _is_continuous stays True →
    unit stays open → no force-split.  Two distinct adjacent ≤8-page tables
    differ geometrically → _is_continuous returns False → TABLE_NEW fires.

    Returns True if the pages are in the same unit, False if a unit break fires.
    """
    gc_a = desc_a.gutter_count
    gc_b = desc_b.gutter_count

    # Gutter count change = new unit (fine-grained layout shift)
    if gc_a != gc_b:
        return False

    # Gutter position shift > tolerance = new unit
    gx_a = desc_a.gutter_x_fractions
    gx_b = desc_b.gutter_x_fractions
    if len(gx_a) != len(gx_b):
        return False
    for xa, xb in zip(gx_a, gx_b):
        if abs(xa - xb) > _GUTTER_POSITION_TOLERANCE:
            return False

    # Row pitch change > 50% = new unit (only when both pitches available)
    pitch_a = desc_a.row_pitch
    pitch_b = desc_b.row_pitch
    if pitch_a > 0 and pitch_b > 0:
        change = abs(pitch_a - pitch_b) / max(pitch_a, pitch_b)
        if change > _ROW_PITCH_CHANGE_TOLERANCE:
            return False

    # D-5: title-band check — fires if page B announces a new table section.
    # PATH B passes stored_text="" → _is_title_band returns False → D-5 silent.
    # PATH A passes real OCR text → D-5 can fire.
    if _is_title_band(desc_b.stored_text):
        return False

    return True


# ---------------------------------------------------------------------------
# Continuity predicate wrapper for dict-based fingerprints (PATH A compat)
# ---------------------------------------------------------------------------

def _fingerprints_continuous(
    fp_a: dict,
    fp_b: dict,
    stored_text_b: str = "",
) -> bool:
    """
    Test if two page fingerprint dicts belong to the same logical unit.

    Compatibility wrapper: translates the dict-based fingerprint format used
    by build_document_map into PageDescriptors and calls _is_continuous.

    This function is the SSOT for the dict-based continuity test and is
    re-exported from generic_md_table_extractor for backward compatibility
    with existing test imports.

    Args:
        fp_a: Fingerprint dict of the reference page (last committed D-1).
        fp_b: Fingerprint dict of the candidate continuation page.
        stored_text_b: Stored OCR text of page B (for D-5 check).
    """
    if fp_a.get("page_type") == "blank" or fp_b.get("page_type") == "blank":
        return False

    # Page type change = structural section boundary = new unit.
    pt_a = fp_a.get("page_type", "prose")
    pt_b = fp_b.get("page_type", "prose")
    if pt_a != pt_b:
        return False

    desc_a = PageDescriptor(
        page_num=fp_a.get("page_number", 0),
        page_type=pt_a,
        gutter_count=fp_a.get("gutter_count", 0),
        gutter_x_fractions=fp_a.get("gutter_x_fractions", []),
        row_pitch=fp_a.get("row_pitch_px_at_50dpi", 0.0),
        stored_text="",
    )
    desc_b = PageDescriptor(
        page_num=fp_b.get("page_number", 0),
        page_type=pt_b,
        gutter_count=fp_b.get("gutter_count", 0),
        gutter_x_fractions=fp_b.get("gutter_x_fractions", []),
        row_pitch=fp_b.get("row_pitch_px_at_50dpi", 0.0),
        stored_text=stored_text_b,
    )
    return _is_continuous(desc_a, desc_b)


# ---------------------------------------------------------------------------
# Public API — 5-state machine
# ---------------------------------------------------------------------------

def group_pages_into_units(pages: List[PageDescriptor]) -> List[UnitDescriptor]:
    """
    Group a list of PageDescriptors into logical document units.

    State machine: NO_TABLE | TABLE_OPEN

    Key behaviours:
    - Prose pages emit a prose UnitDescriptor (BLOCKING-2 fix — prose pages
      are NEVER silently discarded).
    - Blank pages are buffered (pending_blanks) and bridged into the current
      table unit only when the next non-blank page satisfies _is_continuous.
      If the next non-blank page is prose or triggers a table break, pending
      blanks are discarded.
    - 8-PAGE CAP REMOVED: replaced by _is_continuous geometric predicate.
      A real >8-page table (identical geometry) stays ONE unit.
      Two distinct adjacent tables (different geometry) split correctly.
    - D-5 title-band: _is_continuous calls _is_title_band(desc_b.stored_text);
      PATH B passes stored_text="" → D-5 is silently disabled (by design);
      PATH A passes real OCR text → D-5 can fire.

    RC invariants preserved:
    - RC-1 (no X-range threshold): _is_continuous uses 5% gutter tolerance,
      same as the calibrated value from prior RC-1 fix.
    - RC-2 (no double-finalize on prose): flush fires only on state transitions
      out of TABLE_OPEN, never on re-entering the same state.

    Args:
        pages: List of PageDescriptors in ascending page_num order.

    Returns:
        List of UnitDescriptors in document order.
    """
    units: List[UnitDescriptor] = []
    current_pages: List[int] = []
    current_type: Optional[str] = None
    pending_blanks: List[int] = []
    last_committed_d1: Optional[PageDescriptor] = None
    current_prose_desc: Optional[PageDescriptor] = None
    state: str = "NO_TABLE"

    def flush() -> None:
        nonlocal current_pages, current_type
        if not current_pages:
            return
        units.append(UnitDescriptor(
            pages=list(current_pages),
            page_type=current_type or "prose",
            schema_page=current_pages[0],
        ))
        current_pages = []

    for desc in pages:
        pt = desc.page_type

        # ----------------------------------------------------------------
        # Blank: buffer without committing (deferred bridge)
        # ----------------------------------------------------------------
        if pt == "blank":
            pending_blanks.append(desc.page_num)
            continue

        # ----------------------------------------------------------------
        # Non-blank page
        # ----------------------------------------------------------------
        if state == "NO_TABLE":
            # Any blanks before the first non-blank page (or before a new
            # section) are pre-document fillers — discard them.
            pending_blanks = []

            if pt == "table":
                # → TABLE_START: flush any open prose unit, open table unit
                flush()
                current_pages = [desc.page_num]
                current_type = "table"
                last_committed_d1 = desc
                current_prose_desc = None
                state = "TABLE_OPEN"

            else:
                # prose page in NO_TABLE state
                if not current_pages:
                    # Open a new prose unit
                    current_pages = [desc.page_num]
                    current_type = "prose"
                    current_prose_desc = desc
                elif current_prose_desc is not None and _is_continuous(current_prose_desc, desc):
                    # Extend existing prose unit
                    current_pages.append(desc.page_num)
                    current_prose_desc = desc
                else:
                    # Different prose geometry — flush and start new prose unit
                    flush()
                    current_pages = [desc.page_num]
                    current_type = "prose"
                    current_prose_desc = desc

        elif state == "TABLE_OPEN":
            if pt == "prose":
                # → TABLE_END: blanks before prose are NOT bridged (discard)
                pending_blanks = []
                flush()
                current_pages = [desc.page_num]
                current_type = "prose"
                last_committed_d1 = None
                current_prose_desc = desc
                state = "NO_TABLE"

            else:
                # pt == "table": check D-4 + D-5 continuation
                assert last_committed_d1 is not None  # invariant: TABLE_OPEN always has one
                if _is_continuous(last_committed_d1, desc):
                    # → TABLE_CONTINUE: drain pending_blanks then append
                    current_pages.extend(pending_blanks)
                    pending_blanks = []
                    current_pages.append(desc.page_num)
                    last_committed_d1 = desc
                else:
                    # → TABLE_NEW: flush current table, discard pending blanks,
                    # open a fresh table unit for the new (different) table.
                    pending_blanks = []
                    flush()
                    current_pages = [desc.page_num]
                    current_type = "table"
                    last_committed_d1 = desc
                    # state stays TABLE_OPEN

    # Flush the last unit
    flush()
    return units
