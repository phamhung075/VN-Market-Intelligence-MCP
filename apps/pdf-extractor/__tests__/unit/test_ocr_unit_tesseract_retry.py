"""
Unit tests for ocr_unit() Tesseract retry / SIGTERM robustness (BPE-DEV-5).

The prior BPE-DEV-4 attempt showed that a single Tesseract SIGTERM (-15, signal
-15 from OS load spike) causes image_to_data to raise an exception, which the
existing code catches and then *skips the page entirely*.  Under normalized load
a retry succeeds on the second attempt.  This test verifies:

  AC-1: When _tesseract_image_to_data raises on the first call but succeeds on
         the second, the page IS included in the stitched output (not dropped).

  AC-2: When _tesseract_image_to_data fails on ALL retries (MAX_TESSERACT_RETRIES+1
         times), the page IS skipped (no crash, not quarantined by exception).

  AC-3: The retry count constant (MAX_TESSERACT_RETRIES) is exposed from the
         module and is >= 1 (at least one retry).

  AC-4: Fence-A compliance: ocr_unit must NOT import application/ or interface/
         (unchanged, regression guard).

The implementation exposes a module-level helper _tesseract_image_to_data() that
wraps pytesseract.image_to_data with retry logic.  Tests patch that helper
directly (module-level patch works for module-level functions).
"""
from __future__ import annotations

import ast
import inspect
import os
import sys
from typing import Any, Dict, List
from unittest.mock import MagicMock, call, patch

import pytest

# ---------------------------------------------------------------------------
# Fence-A regression guard (AC-4)
# ---------------------------------------------------------------------------


def test_ac4_fence_a_no_application_import():
    """Fence-A: infrastructure must not import application/ or interface/."""
    import infrastructure.generic_md_table_extractor as mod  # noqa: F401

    source = inspect.getsource(mod)
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            module = node.module
            assert not module.startswith("application"), (
                f"Fence-A violation: 'from {module} import ...' in infrastructure"
            )
            assert not module.startswith("interface"), (
                f"Fence-A violation: 'from {module} import ...' in infrastructure"
            )


# ---------------------------------------------------------------------------
# AC-3: MAX_TESSERACT_RETRIES constant exists and is >= 1
# ---------------------------------------------------------------------------


def test_ac3_retry_constant_exposed():
    """MAX_TESSERACT_RETRIES must be a module-level constant >= 1."""
    import infrastructure.generic_md_table_extractor as mod

    assert hasattr(mod, "MAX_TESSERACT_RETRIES"), (
        "MAX_TESSERACT_RETRIES constant must be exposed at module level"
    )
    assert mod.MAX_TESSERACT_RETRIES >= 1, (
        f"MAX_TESSERACT_RETRIES must be >= 1, got {mod.MAX_TESSERACT_RETRIES}"
    )


def test_ac3b_helper_exposed():
    """_tesseract_image_to_data helper must be exposed at module level (patchable)."""
    import infrastructure.generic_md_table_extractor as mod

    assert hasattr(mod, "_tesseract_image_to_data"), (
        "_tesseract_image_to_data must be a module-level helper function"
    )
    assert callable(mod._tesseract_image_to_data), (
        "_tesseract_image_to_data must be callable"
    )


# ---------------------------------------------------------------------------
# Helpers — build minimal synthetic inputs for ocr_unit()
# ---------------------------------------------------------------------------


def _make_unit(pages: List[int], page_type: str = "table") -> Dict:
    return {
        "unit_id": "test-unit-001",
        "pages": pages,
        "page_type": page_type,
        "schema_page": pages[0] if pages else 1,
    }


def _make_zones_single_col(page_num: int, img_w: int = 400, img_h: int = 300) -> Dict:
    """Minimal PageZones with one column and one row band."""
    return {
        "page_number": page_num,
        "unit_id": "test-unit-001",
        "page_type": "table",
        "is_schema_page": True,
        "is_continuation_page": False,
        "schema_inherited_from_page": None,
        "zones": {
            "image_width_px": img_w,
            "image_height_px": img_h,
            "image_dpi": 200,
            "coordinate_origin": "top-left",
            "coordinate_unit": "px",
            "header_band": {"y_min": 0, "y_max": 30},
            "footer_band": {"y_min": 270, "y_max": 300},
            "column_gutters": [
                {"x_min": 0, "x_max": 200, "is_gutter": False},
                {"x_min": 200, "x_max": 400, "is_gutter": False},
            ],
            "row_bands": [
                {"y_min": 30, "y_max": 80},
                {"y_min": 80, "y_max": 130},
            ],
            "unit_hints": [],
            "unit_boundary_after_page": True,
        },
    }


def _make_ocr_data_with_numbers() -> Dict:
    """Minimal pytesseract.image_to_data output dict for cells with numbers."""
    return {
        "text":   ["100",  "200"],
        "conf":   [90,      85],
        "left":   [10,      210],
        "top":    [40,      90],
        "width":  [40,      40],
        "height": [20,      20],
    }


def _make_synthetic_pil_image():
    """Return a minimal PIL Image (requires Pillow but not Tesseract)."""
    from PIL import Image
    return Image.new("RGB", (400, 300), color=(255, 255, 255))


# ---------------------------------------------------------------------------
# AC-1: retry succeeds on second call
# ---------------------------------------------------------------------------


def _make_fake_pdf2image_module(synthetic_img):
    """Return a fake pdf2image module with convert_from_path pre-set."""
    fake = MagicMock()
    fake.convert_from_path.return_value = [synthetic_img]
    return fake


def _make_fake_pytesseract_module(side_effects):
    """
    Return a fake pytesseract module whose image_to_data cycles through side_effects.
    Raises RuntimeError for Exception instances, returns dict for dict instances.
    """
    call_count = {"n": 0}

    def _image_to_data(img, lang=None, config=None, output_type=None):
        idx = call_count["n"]
        call_count["n"] += 1
        effect = side_effects[idx] if idx < len(side_effects) else side_effects[-1]
        if isinstance(effect, Exception):
            raise effect
        return effect

    fake = MagicMock()
    fake.image_to_data.side_effect = _image_to_data
    # Output.DICT just needs to be something (string)
    fake.Output = MagicMock()
    fake.Output.DICT = "DICT"
    fake._call_count = call_count
    return fake


def test_ac1_tesseract_sigterm_retry_succeeds():
    """
    AC-1: When pytesseract.image_to_data raises on first call but succeeds on
    second, _tesseract_image_to_data retries and the page IS included.

    Note: _tesseract_image_to_data is NOT mocked here — we test its real retry
    logic by patching the inner pytesseract module via sys.modules.  ocr_unit
    calls _tesseract_image_to_data once per page; the retry loop is INSIDE that
    helper.  A successful retry produces a truthy stitched_markdown.
    """
    import infrastructure.generic_md_table_extractor as mod
    from infrastructure.generic_md_table_extractor import ocr_unit

    unit = _make_unit([3])
    zones_by_page = {3: _make_zones_single_col(3)}
    good_ocr = _make_ocr_data_with_numbers()

    synthetic_img = _make_synthetic_pil_image()

    # SIGTERM on attempt 1, success on attempt 2
    side_effects = [
        RuntimeError("tesseract exited with (-15, '')"),  # attempt 1: fail
        good_ocr,                                          # attempt 2: success
    ]
    fake_pytess = _make_fake_pytesseract_module(side_effects)
    fake_pdf2image = _make_fake_pdf2image_module(synthetic_img)

    with patch.dict(sys.modules, {"pytesseract": fake_pytess, "pdf2image": fake_pdf2image}):
        result = ocr_unit(
            unit=unit,
            zones_by_page=zones_by_page,
            pdf_path="/fake/path.pdf",
            tmp_dir="/tmp/test_retry",
        )

    # pytesseract.image_to_data must have been called at least twice (retry)
    assert fake_pytess._call_count["n"] >= 2, (
        f"Expected >= 2 calls to image_to_data (initial + retry), "
        f"got {fake_pytess._call_count['n']}"
    )

    # The unit must have some stitched content (not empty — retry succeeded)
    assert result["unit_id"] == "test-unit-001"
    assert result["stitched_markdown"], (
        f"stitched_markdown must be non-empty after retry, got {result['stitched_markdown']!r}"
    )


# ---------------------------------------------------------------------------
# AC-2: page skipped when ALL retries exhausted
# ---------------------------------------------------------------------------


def test_ac2_all_retries_exhausted_page_skipped():
    """
    AC-2: When pytesseract.image_to_data fails on all attempts (initial +
    MAX_TESSERACT_RETRIES retries), the page is skipped and no exception
    propagates out of ocr_unit.  row_count stays 0.
    """
    from infrastructure.generic_md_table_extractor import ocr_unit, MAX_TESSERACT_RETRIES

    unit = _make_unit([3])
    zones_by_page = {3: _make_zones_single_col(3)}
    synthetic_img = _make_synthetic_pil_image()

    # All attempts fail
    total_attempts = MAX_TESSERACT_RETRIES + 1
    side_effects = [
        RuntimeError("tesseract (-15, '')") for _ in range(total_attempts + 1)
    ]
    fake_pytess = _make_fake_pytesseract_module(side_effects)
    fake_pdf2image = _make_fake_pdf2image_module(synthetic_img)

    with patch.dict(sys.modules, {"pytesseract": fake_pytess, "pdf2image": fake_pdf2image}):
        result = ocr_unit(
            unit=unit,
            zones_by_page=zones_by_page,
            pdf_path="/fake/path.pdf",
            tmp_dir="/tmp/test_retry_exhausted",
        )

    # No crash — result returned
    assert result["unit_id"] == "test-unit-001"
    # Page skipped → no rows
    assert result["row_count"] == 0, (
        f"Expected row_count=0 when all retries fail, got {result['row_count']}"
    )
