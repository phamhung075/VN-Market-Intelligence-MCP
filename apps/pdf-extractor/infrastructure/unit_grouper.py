"""
infrastructure/unit_grouper.py — compatibility shim (BTB-DRIFT-DEV)

This module was the original SSOT for page grouping.  After BTB-DRIFT-DEV,
the SSOT moved to ``infrastructure.bctc_page_grouper``.

This shim remains for backward compatibility with:
  - ``build_document_map`` (PATH A) if still importing from here
  - test helpers in ``test_grouping_convergence.py``

Public API:
    ``group_pages_into_units(pages: List[Dict]) -> List[Dict]``

    Accepts the original dict-based format::

        {"page_num": int, "page_type": str, "title_hints": List[str]}

    Translates to ``PageDescriptor`` and delegates to
    ``bctc_page_grouper.group_pages_into_units``.

    title_hints are mapped to D-5 via stored_text: a non-empty hint that is
    not a continuation marker is synthesised into a stored_text value that
    ``_is_title_band`` will detect (a two-word non-numeric line).
    Continuation-marker hints are forwarded as-is → _is_title_band returns
    False → D-5 silent (correct).

DDD layer: infrastructure.  Zero I/O, stdlib only.
"""
from __future__ import annotations

import uuid
from typing import Dict, List

from infrastructure.bctc_page_grouper import (
    PageDescriptor,
    group_pages_into_units as _group_pages_into_units,
    _CONTINUATION_MARKERS,
)


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
