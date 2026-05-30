"""
infrastructure/unit_grouper.py — compatibility shim

AR-PDF FR-14: bctc_page_grouper.py deleted. This shim now uses inlined
grouping logic from generic_md_table_extractor (which absorbed the constants
and functions from bctc_page_grouper as part of the FR-14 replacement).

This shim remains for backward compatibility with test_unit_grouper.py.

Public API:
    ``group_pages_into_units(pages: List[Dict]) -> List[Dict]``

    Accepts the original dict-based format::

        {"page_num": int, "page_type": str, "title_hints": List[str]}

DDD layer: infrastructure.  Zero I/O, stdlib only.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Dict, List, Optional

# ---------------------------------------------------------------------------
# Inlined constants from bctc_page_grouper (deleted in AR-PDF FR-14)
# ---------------------------------------------------------------------------

_TITLE_BAND_SCAN_LINES: int = 8
_TITLE_BAND_MIN_LEN: int = 5
_TITLE_BAND_MAX_LEN: int = 120
_CONTINUATION_MARKERS: tuple = ("tiếp theo", "(continued)", "continued")
_GUTTER_POSITION_TOLERANCE: float = 0.05
_ROW_PITCH_CHANGE_TOLERANCE: float = 0.50

import re as _re
_MONEY_GROUP_RE = _re.compile(r"\d{1,3}(?:[.,]\d{3})+")


@dataclass
class PageDescriptor:
    """Portable per-page descriptor for the inlined grouper."""
    page_num: int
    page_type: str
    gutter_count: int
    gutter_x_fractions: List[float] = field(default_factory=list)
    row_pitch: float = 0.0
    stored_text: str = ""


@dataclass
class UnitDescriptor:
    """Logical document unit from group_pages_into_units."""
    pages: List[int]
    page_type: str
    schema_page: int


def _is_title_band(stored_text: str) -> bool:
    """Detect title band (D-5). Inlined from deleted bctc_page_grouper."""
    if not stored_text:
        return False
    lines = stored_text.splitlines()
    for line in lines[:_TITLE_BAND_SCAN_LINES]:
        stripped = line.strip()
        if len(stripped) < _TITLE_BAND_MIN_LEN:
            continue
        if len(stripped) > _TITLE_BAND_MAX_LEN:
            continue
        if _MONEY_GROUP_RE.search(stripped):
            continue
        if _re.fullmatch(r"[\d.,\s()]+", stripped):
            continue
        if len(stripped.split()) < 2:
            continue
        stripped_lower = stripped.lower()
        for marker in _CONTINUATION_MARKERS:
            if marker in stripped_lower:
                return False
        return True
    return False


def _is_continuous(desc_a: PageDescriptor, desc_b: PageDescriptor) -> bool:
    """Test if two PageDescriptors belong to the same logical unit."""
    if desc_a.gutter_count != desc_b.gutter_count:
        return False
    gx_a = desc_a.gutter_x_fractions
    gx_b = desc_b.gutter_x_fractions
    if len(gx_a) != len(gx_b):
        return False
    for xa, xb in zip(gx_a, gx_b):
        if abs(xa - xb) > _GUTTER_POSITION_TOLERANCE:
            return False
    pitch_a = desc_a.row_pitch
    pitch_b = desc_b.row_pitch
    if pitch_a > 0 and pitch_b > 0:
        change = abs(pitch_a - pitch_b) / max(pitch_a, pitch_b)
        if change > _ROW_PITCH_CHANGE_TOLERANCE:
            return False
    if _is_title_band(desc_b.stored_text):
        return False
    return True


def _group_pages_into_units(pages: List[PageDescriptor]) -> List[UnitDescriptor]:
    """
    Group PageDescriptors into units. State machine inlined from deleted bctc_page_grouper.

    Key behaviours (preserved from original state machine):
    - Prose pages emit their own UnitDescriptor (never discarded).
    - Blank pages are buffered and bridged into the current table unit only
      when the next non-blank page is a continuation. If the next page is
      prose or a different table, blanks are discarded.
    - _is_continuous: same geometric + D-5 predicate as original.
    - TABLE_OPEN state: flush on prose, TABLE_NEW on geometry change.
    """
    if not pages:
        return []

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

        if pt == "blank":
            pending_blanks.append(desc.page_num)
            continue

        if state == "NO_TABLE":
            pending_blanks = []

            if pt == "table":
                flush()
                current_pages = [desc.page_num]
                current_type = "table"
                last_committed_d1 = desc
                current_prose_desc = None
                state = "TABLE_OPEN"
            else:
                # prose
                if not current_pages:
                    current_pages = [desc.page_num]
                    current_type = "prose"
                    current_prose_desc = desc
                elif current_prose_desc is not None and _is_continuous(current_prose_desc, desc):
                    current_pages.append(desc.page_num)
                    current_prose_desc = desc
                else:
                    flush()
                    current_pages = [desc.page_num]
                    current_type = "prose"
                    current_prose_desc = desc

        elif state == "TABLE_OPEN":
            if pt == "prose":
                pending_blanks = []
                flush()
                current_pages = [desc.page_num]
                current_type = "prose"
                last_committed_d1 = None
                current_prose_desc = desc
                state = "NO_TABLE"
            else:
                # pt == "table"
                assert last_committed_d1 is not None
                if _is_continuous(last_committed_d1, desc):
                    current_pages.extend(pending_blanks)
                    pending_blanks = []
                    current_pages.append(desc.page_num)
                    last_committed_d1 = desc
                else:
                    pending_blanks = []
                    flush()
                    current_pages = [desc.page_num]
                    current_type = "table"
                    last_committed_d1 = desc
                    # state stays TABLE_OPEN

    flush()
    return units


# ---------------------------------------------------------------------------
# Public helper: _has_new_title (D-5 detector for pre-extracted title_hints)
# ---------------------------------------------------------------------------

def _has_new_title(title_hints: List[str]) -> bool:
    """
    Return True when the page announces a NEW table section (D-5 signal).

    Operates on pre-extracted title strings (from YOLO label=0 bboxes on
    PATH B, or unit_hints from fingerprint pre-computation on PATH A).

    Rules:
    - Empty list → False (conservative, allows CONTINUE).
    - All empty strings → False.
    - Any hint containing a continuation marker → False (D-5 suppressed).
    - First non-empty hint without a continuation marker → True (D-5 fires).
    """
    for hint in title_hints:
        stripped = hint.strip()
        if not stripped:
            continue
        lower = stripped.lower()
        if any(marker in lower for marker in _CONTINUATION_MARKERS):
            return False
        # Non-empty, no continuation marker → new title → D-5 fires
        return True
    return False


# ---------------------------------------------------------------------------
# Private helper: translate title_hints → stored_text for D-5
# ---------------------------------------------------------------------------

def _title_hints_to_stored_text(title_hints: List[str]) -> str:
    """
    Convert a list of title hint strings (YOLO label=0 text) into a
    ``stored_text`` value that ``_is_title_band`` will evaluate correctly.

    Rules (mirror _has_new_title from the old implementation):
    - Empty list or all-empty strings → "" (D-5 silent).
    - Any hint containing a continuation marker → "" (D-5 silent).
    - First non-empty hint that is NOT a continuation marker → forwarded
      as stored_text (D-5 will fire if the hint passes all checks).
    """
    for hint in title_hints:
        stripped = hint.strip()
        if not stripped:
            continue
        lower = stripped.lower()
        if any(marker in lower for marker in _CONTINUATION_MARKERS):
            # Continuation marker — D-5 must NOT fire.  Return a text that
            # starts with a continuation marker so _is_title_band returns False.
            return stripped
        # Non-empty, no continuation marker → D-5 should fire.
        # Ensure the stored_text has at least 2 words so _is_title_band passes
        # the word-count guard.  The hint itself may be a single word, so we
        # pad with a second word if needed.
        if len(stripped.split()) >= 2:
            return stripped
        return stripped + " TIEU DE"  # synthesise two-word title
    return ""


# ---------------------------------------------------------------------------
# Public API: dict-based wrapper over bctc_page_grouper
# ---------------------------------------------------------------------------

def group_pages_into_units(
    pages: List[Dict],
    max_consecutive_table_pages: int = 8,  # kept for signature compat; not used
) -> List[Dict]:
    """
    Group a list of page descriptor dicts into logical document units.

    Input page descriptor shape (original format)::

        {
            "page_num": int,
            "page_type": str,         # "table" | "prose" | "blank"
            "title_hints": List[str], # optional; default []
        }

    Returns a list of unit dicts matching the DocumentMap unit shape::

        {
            "unit_id": str,
            "schema_page": int,
            "pages": List[int],
            "page_type": str,         # "table" | "prose"
        }

    Delegates to ``bctc_page_grouper.group_pages_into_units`` for all
    grouping logic.  The 8-page cap is NOT applied — bctc_page_grouper
    uses the geometric _is_continuous predicate instead.
    """
    descriptors: List[PageDescriptor] = []
    for page in pages:
        pn: int = page["page_num"]
        pt: str = page.get("page_type", "prose")
        hints: List[str] = page.get("title_hints", [])
        stored_text = _title_hints_to_stored_text(hints)
        descriptors.append(PageDescriptor(
            page_num=pn,
            page_type=pt,
            gutter_count=0,           # title_hints path has no geometry
            gutter_x_fractions=[],
            row_pitch=0.0,
            stored_text=stored_text,
        ))

    unit_descriptors = _group_pages_into_units(descriptors)

    return [
        {
            "unit_id": str(uuid.uuid4()),
            "schema_page": ud.schema_page,
            "pages": ud.pages,
            "page_type": ud.page_type,
        }
        for ud in unit_descriptors
    ]
