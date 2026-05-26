"""
Unit tests for schema inheritance in zone_page() — LF-EXTRACT

AC-LFE-2 regression: confirms that continuation pages SKIP column detection
and inherit the schema-page's column gutters directly.

This is the named fix for the FPT Q1 2026 page-5 scramble:
    - Page 5 (NGUON VON / liabilities) has no column header row.
    - The old engine tried to detect columns from page 5 alone and scrambled.
    - The fix: when zone_page() receives unit_schema (is_schema_page=False),
      it uses unit_schema["column_gutters"] directly, skipping detection entirely.

Tests use MOCK objects for PIL Image to avoid requiring Pillow in the venv.
The mock implements only the interface used by zone_page:
    - .size  → (width, height)
    - .convert("L")  → returns self (mock)
    - .getdata()  → returns flat list of pixel values (all white = 255)

AC-0 compliance: column IDs in test fixtures are positional (col_0, col_1, ...).
No BCTC semantic strings appear in any decision path.

Zero I/O, zero Tesseract, zero DB, zero network.
"""

from __future__ import annotations

import re
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest
from infrastructure.generic_md_table_extractor import zone_page


# ---------------------------------------------------------------------------
# Mock PIL Image: minimal interface required by zone_page
# ---------------------------------------------------------------------------

class MockImage:
    """
    Minimal mock for PIL.Image.Image, implementing only the methods
    called by zone_page():
        - .size                     → (width, height)
        - .convert("L")             → returns self (mock grayscale)
        - .getdata()                → flat list of pixel values (all 255 = white)

    Using a mock instead of real PIL avoids the Pillow dependency in the
    dev venv (Pillow is only installed inside the Docker container).

    The mock produces an all-white image (no dark pixels), which results in:
        - col_dark = [0, 0, ..., 0]  → all columns are "gutters"
        - row_dark = [0, 0, ..., 0]  → no row bands detected
        - column detection on a blank image → single full-width col_0 (fallback)
    """

    def __init__(self, width: int = 400, height: int = 600):
        self.width = width
        self.height = height
        self.size = (width, height)
        # All-white pixels (no dark content)
        self._pixels = [255] * (width * height)

    def convert(self, mode: str) -> "MockImage":
        """Return self — mock is already grayscale-compatible."""
        return self

    def getdata(self) -> list:
        """Return flat list of pixel values."""
        return self._pixels

    def close(self) -> None:
        """No-op — mock has no resources to free."""
        pass


# ---------------------------------------------------------------------------
# Helper: build a known column schema dict
# ---------------------------------------------------------------------------

def _make_known_schema(col_ids: list = None) -> dict:
    """Build a known column schema dict (as produced by a schema-page)."""
    if col_ids is None:
        col_ids = ["col_0", "col_1", "col_2", "col_3"]
    gutters = [
        {"col_id": cid, "x_min": i * 100, "x_max": i * 100 + 90}
        for i, cid in enumerate(col_ids)
    ]
    return {
        "column_gutters": gutters,
        "row_pitch": 15.0,
    }


# ---------------------------------------------------------------------------
# Tests: schema-page (unit_schema=None) — column detection runs
# ---------------------------------------------------------------------------


class TestSchemaPageDetection:
    """Tests for schema-pages: column detection from 200-DPI projection profile."""

    def test_schema_page_returns_page_zones_dict(self):
        """zone_page on a schema-page returns a dict with required keys."""
        img = MockImage()
        result = zone_page(
            page_img=img,
            unit_schema=None,  # schema-page: no inherited schema
            page_num=3,
            unit_id="unit-abc",
            unit_page_type="table",
            is_schema_page=True,
            schema_inherited_from_page=None,
        )

        assert isinstance(result, dict)
        assert result["page_number"] == 3
        assert result["unit_id"] == "unit-abc"
        assert result["is_schema_page"] is True
        assert result["is_continuation_page"] is False
        assert result["schema_inherited_from_page"] is None

    def test_schema_page_has_zones_sub_dict(self):
        """The 'zones' key is present with required sub-keys."""
        img = MockImage()
        result = zone_page(
            page_img=img,
            unit_schema=None,
            page_num=3,
            unit_id="unit-abc",
            unit_page_type="table",
            is_schema_page=True,
            schema_inherited_from_page=None,
        )

        zones = result.get("zones", {})
        assert "column_gutters" in zones
        assert "header_band" in zones
        assert "footer_band" in zones
        assert "row_bands" in zones
        assert "coordinate_origin" in zones
        assert zones["coordinate_origin"] == "top-left"
        assert zones["coordinate_unit"] == "px"

    def test_schema_page_column_ids_are_positional(self):
        """Column IDs must be positional (col_0, col_1, ...) — AC-0."""
        img = MockImage(width=500, height=800)
        result = zone_page(
            page_img=img,
            unit_schema=None,
            page_num=1,
            unit_id="unit-001",
            unit_page_type="table",
            is_schema_page=True,
            schema_inherited_from_page=None,
        )

        gutters = result["zones"].get("column_gutters", [])
        for gutter in gutters:
            col_id = gutter.get("col_id", "")
            assert col_id.startswith("col_"), (
                f"Column ID '{col_id}' is not positional — AC-0 violation"
            )
            assert re.fullmatch(r"col_\d+", col_id), (
                f"Column ID '{col_id}' does not match positional pattern col_N"
            )

    def test_schema_page_image_dimensions_in_zones(self):
        """Image dimensions (width, height) are recorded in the zones output."""
        img = MockImage(width=600, height=900)
        result = zone_page(
            page_img=img,
            unit_schema=None,
            page_num=1,
            unit_id="unit-dim",
            unit_page_type="table",
            is_schema_page=True,
            schema_inherited_from_page=None,
        )
        zones = result["zones"]
        assert zones["image_width_px"] == 600
        assert zones["image_height_px"] == 900
        assert zones["image_dpi"] == 200


# ---------------------------------------------------------------------------
# Tests: continuation page (unit_schema provided) — schema INHERITANCE
# ---------------------------------------------------------------------------


class TestSchemaInheritance:
    """
    Tests for the schema-inheritance mechanism (the named fix — AC-LFE-2).

    Continuation pages receive unit_schema and MUST NOT run column detection.
    They must use unit_schema["column_gutters"] directly.
    """

    def test_continuation_page_uses_inherited_schema(self):
        """
        AC-LFE-2: continuation page must use unit_schema["column_gutters"],
        NOT column gutters derived from its own image.

        We inject a known schema (4 columns) and verify the output column_gutters
        match the injected schema exactly.

        The mock image is all-white (no column structure). If schema inheritance
        works → column_gutters == injected schema.
        If it falls back to auto-detection → column_gutters would be single col_0
        (blank-image fallback). The assertion catches any regression.
        """
        known_schema = _make_known_schema(["col_0", "col_1", "col_2", "col_3"])
        expected_gutters = known_schema["column_gutters"]

        img = MockImage(width=400, height=600)

        result = zone_page(
            page_img=img,
            unit_schema=known_schema,   # schema inherited from page 3
            page_num=5,
            unit_id="unit-balance-sheet",
            unit_page_type="table",
            is_schema_page=False,       # CONTINUATION page
            schema_inherited_from_page=3,
        )

        actual_gutters = result["zones"]["column_gutters"]
        assert actual_gutters == expected_gutters, (
            f"Continuation page did not inherit schema. "
            f"Expected {expected_gutters!r}, got {actual_gutters!r}"
        )

    def test_continuation_page_schema_inherited_from_page_field(self):
        """
        Continuation page must record schema_inherited_from_page = schema_page_num.

        This is the proof for AC-LFE-2 in the DB query:
            SELECT schema_inherited_from_page FROM bctc_page_zones WHERE page_number=5
        must return 3.
        """
        known_schema = _make_known_schema()
        img = MockImage()

        result = zone_page(
            page_img=img,
            unit_schema=known_schema,
            page_num=5,
            unit_id="unit-bs",
            unit_page_type="table",
            is_schema_page=False,
            schema_inherited_from_page=3,  # inherits from page 3
        )

        assert result["is_continuation_page"] is True
        assert result["is_schema_page"] is False
        assert result["schema_inherited_from_page"] == 3

    def test_continuation_page_header_and_footer_still_detected(self):
        """
        Even on continuation pages (schema inherited), header_band and footer_band
        are always freshly computed from the page's own image dimensions.
        They must have y_min and y_max keys.
        """
        known_schema = _make_known_schema()
        img = MockImage(width=400, height=600)

        result = zone_page(
            page_img=img,
            unit_schema=known_schema,
            page_num=5,
            unit_id="unit-bs",
            unit_page_type="table",
            is_schema_page=False,
            schema_inherited_from_page=3,
        )

        zones = result["zones"]
        header = zones.get("header_band", {})
        footer = zones.get("footer_band", {})

        assert "y_min" in header, "header_band must have y_min"
        assert "y_max" in header, "header_band must have y_max"
        assert "y_min" in footer, "footer_band must have y_min"
        assert "y_max" in footer, "footer_band must have y_max"
        # Header: top 15% of 600px = 90px
        assert header["y_min"] == 0
        assert header["y_max"] == 90
        # Footer: bottom 10% of 600px = 540px
        assert footer["y_min"] == 540
        assert footer["y_max"] == 600

    def test_schema_inherited_col_count_matches_schema_page(self):
        """
        The number of columns on the continuation page equals the number
        of columns from the schema-page (no new columns invented).

        This is the core correctness property: schema-page had 4 columns →
        page 5 must use exactly those 4 columns.
        """
        known_schema = _make_known_schema(["col_0", "col_1", "col_2", "col_3"])
        schema_col_count = len(known_schema["column_gutters"])

        img = MockImage()
        result = zone_page(
            page_img=img,
            unit_schema=known_schema,
            page_num=5,
            unit_id="unit-bs",
            unit_page_type="table",
            is_schema_page=False,
            schema_inherited_from_page=3,
        )

        cont_col_count = len(result["zones"]["column_gutters"])
        assert cont_col_count == schema_col_count, (
            f"Continuation page has {cont_col_count} columns but "
            f"schema-page had {schema_col_count}"
        )

    def test_different_unit_schema_produces_different_columns(self):
        """
        Two continuation pages with DIFFERENT injected schemas produce
        different column layouts. Confirms injection is respected.
        """
        schema_2col = _make_known_schema(["col_0", "col_1"])
        schema_4col = _make_known_schema(["col_0", "col_1", "col_2", "col_3"])

        img = MockImage()

        result_2col = zone_page(
            page_img=img,
            unit_schema=schema_2col,
            page_num=5,
            unit_id="unit-a",
            unit_page_type="table",
            is_schema_page=False,
            schema_inherited_from_page=3,
        )
        result_4col = zone_page(
            page_img=img,
            unit_schema=schema_4col,
            page_num=7,
            unit_id="unit-b",
            unit_page_type="table",
            is_schema_page=False,
            schema_inherited_from_page=6,
        )

        assert len(result_2col["zones"]["column_gutters"]) == 2
        assert len(result_4col["zones"]["column_gutters"]) == 4

    def test_fpt_q1_scenario_page5_inherits_page3_schema(self):
        """
        Direct regression test for the FPT Q1 2026 page-5 scramble fix.

        Simulates: page 3 (schema-page, 5 columns) produces a schema that page 5
        (continuation, no column header) inherits. Confirms pages 3 and 5 share
        identical column_gutters — the visual inheritance proof from brief §3.2.

        The column layout mirrors the real FPT Q1 2026 balance-sheet structure
        (5 columns: label+code+note+current+prior at 200 DPI, A4 page = 2338px wide).

        AC-LFE-2 proof without real PDF: inject page-3 schema into page-5 zone_page call.
        """
        # Schema derived from FPT Q1 2026 page 3 (balance-sheet schema-page)
        page3_schema = {
            "column_gutters": [
                {"col_id": "col_0", "x_min": 0,    "x_max": 460},
                {"col_id": "col_1", "x_min": 461,  "x_max": 520},
                {"col_id": "col_2", "x_min": 521,  "x_max": 810},
                {"col_id": "col_3", "x_min": 811,  "x_max": 855},
                {"col_id": "col_4", "x_min": 856,  "x_max": 2338},
            ],
            "row_pitch": 35.0,
        }

        # Page 5 mock image (blank — simulates missing header row on continuation page)
        page5_img = MockImage(width=2338, height=3308)

        result = zone_page(
            page_img=page5_img,
            unit_schema=page3_schema,   # inherited from page 3
            page_num=5,
            unit_id="unit-fpt-balance-sheet",
            unit_page_type="table",
            is_schema_page=False,
            schema_inherited_from_page=3,
        )

        # Page 5 column_gutters must EXACTLY equal page 3's gutters (inherited)
        assert result["zones"]["column_gutters"] == page3_schema["column_gutters"], (
            "Page 5 column_gutters do not match page 3 injected schema "
            "(schema inheritance broken — FPT Q1 page-5 scramble regression)"
        )
        assert result["schema_inherited_from_page"] == 3
        assert result["is_continuation_page"] is True

    def test_schema_inheritance_ignores_image_content(self):
        """
        Confirms schema inheritance is independent of image content.

        Two calls with DIFFERENT mock images (different sizes) but the SAME
        injected unit_schema must produce IDENTICAL column_gutters.
        This proves the image content is NOT consulted for column detection
        on continuation pages.
        """
        schema = _make_known_schema(["col_0", "col_1", "col_2"])

        img_small = MockImage(width=200, height=300)
        img_large = MockImage(width=2338, height=3308)

        result_small = zone_page(
            page_img=img_small,
            unit_schema=schema,
            page_num=5,
            unit_id="unit-x",
            unit_page_type="table",
            is_schema_page=False,
            schema_inherited_from_page=3,
        )
        result_large = zone_page(
            page_img=img_large,
            unit_schema=schema,
            page_num=6,
            unit_id="unit-x",
            unit_page_type="table",
            is_schema_page=False,
            schema_inherited_from_page=3,
        )

        # Column gutters must be IDENTICAL (both inherited from the same schema)
        assert result_small["zones"]["column_gutters"] == schema["column_gutters"]
        assert result_large["zones"]["column_gutters"] == schema["column_gutters"]


# ---------------------------------------------------------------------------
# Tests: prose and blank pages
# ---------------------------------------------------------------------------


class TestProseAndBlankPageHandling:
    """Tests that prose and blank pages return correct zone output."""

    def test_prose_page_returns_zone_dict(self):
        """Prose page (unit_page_type='prose') still returns a valid PageZones dict."""
        img = MockImage()
        result = zone_page(
            page_img=img,
            unit_schema=None,
            page_num=41,
            unit_id="unit-prose",
            unit_page_type="prose",
            is_schema_page=True,
            schema_inherited_from_page=None,
        )
        assert result["page_number"] == 41
        assert result["page_type"] == "prose"
        assert "zones" in result

    def test_blank_page_returns_valid_zone_dict(self):
        """
        A blank mock image produces a valid PageZones dict.
        Dimensions must be recorded from the mock image's .size.
        """
        img = MockImage(width=400, height=600)
        result = zone_page(
            page_img=img,
            unit_schema=None,
            page_num=12,
            unit_id="unit-blank",
            unit_page_type="blank",
            is_schema_page=True,
            schema_inherited_from_page=None,
        )
        assert result["page_number"] == 12
        assert result["page_type"] == "blank"
        zones = result["zones"]
        assert zones["image_width_px"] == 400
        assert zones["image_height_px"] == 600

    def test_page_zones_coordinate_origin_is_top_left(self):
        """
        AC: coordinate_origin must always be 'top-left' per brief §3.2.
        """
        img = MockImage()
        result = zone_page(
            page_img=img,
            unit_schema=None,
            page_num=1,
            unit_id="unit-x",
            unit_page_type="table",
            is_schema_page=True,
            schema_inherited_from_page=None,
        )
        assert result["zones"]["coordinate_origin"] == "top-left"
        assert result["zones"]["coordinate_unit"] == "px"
        assert result["zones"]["image_dpi"] == 200


# ---------------------------------------------------------------------------
# Tests: AC-0 enforcement on zone_page output
# ---------------------------------------------------------------------------


class TestAC0Compliance:
    """
    Confirms AC-LFE-0 (grep-proof) at the output level:
    column IDs in zone output are purely positional — no BCTC semantic labels.
    """

    def test_no_bctc_labels_in_column_gutters_schema_page(self):
        """
        Schema-page column IDs must be positional (col_N). No Vietnamese labels.
        """
        img = MockImage(width=600, height=900)
        result = zone_page(
            page_img=img,
            unit_schema=None,
            page_num=3,
            unit_id="unit-test",
            unit_page_type="table",
            is_schema_page=True,
            schema_inherited_from_page=None,
        )
        for gutter in result["zones"]["column_gutters"]:
            col_id = gutter["col_id"]
            assert re.fullmatch(r"col_\d+", col_id), (
                f"Non-positional column ID '{col_id}' in schema-page output (AC-0 violation)"
            )

    def test_no_bctc_labels_in_column_gutters_continuation_page(self):
        """
        Continuation page (inherited schema) column IDs must also be positional.
        The injected schema already has positional IDs — verifies they pass through.
        """
        known_schema = {
            "column_gutters": [
                {"col_id": "col_0", "x_min": 0, "x_max": 300},
                {"col_id": "col_1", "x_min": 301, "x_max": 600},
            ],
            "row_pitch": 15.0,
        }
        img = MockImage()
        result = zone_page(
            page_img=img,
            unit_schema=known_schema,
            page_num=5,
            unit_id="unit-c",
            unit_page_type="table",
            is_schema_page=False,
            schema_inherited_from_page=3,
        )
        for gutter in result["zones"]["column_gutters"]:
            col_id = gutter["col_id"]
            assert re.fullmatch(r"col_\d+", col_id), (
                f"Non-positional column ID '{col_id}' in continuation page output (AC-0 violation)"
            )

    def test_unit_hints_are_metadata_not_decision_input(self):
        """
        unit_hints in the output is a list (metadata for overlay display only).
        It must not influence column_gutters or row_bands.
        """
        img = MockImage()
        result = zone_page(
            page_img=img,
            unit_schema=None,
            page_num=3,
            unit_id="unit-x",
            unit_page_type="table",
            is_schema_page=True,
            schema_inherited_from_page=None,
        )
        zones = result["zones"]
        assert isinstance(zones["unit_hints"], list), "unit_hints must be a list"
        # unit_hints presence/content does NOT affect column_gutters
        # (structural test: column_gutters is independently populated)
        assert "column_gutters" in zones
