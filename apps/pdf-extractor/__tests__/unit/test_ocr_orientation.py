"""
Unit tests — FIX-PDFX-OCR-ORIENTATION-UNDETECTED-ROTATED-BCTC-PAGES-READ-UPSIDE-DOWN.

Covers infrastructure/ocr_orientation.py plus the AC-2 requirement that the
detection is wired at ALL construction sites, not just one.

Host-safe: no Tesseract binary, no poppler, no PDF, no model weights. The OSD
call is stubbed; only numpy is real (rotation arithmetic must be verified for
real, not mocked — getting the clockwise/counter-clockwise direction backwards
is the single most likely silent defect in this fix).

Precedent for the source-level site guard: __tests__/unit/test_ocr_adapter_psm6_guard.py
("prevents silent re-introduction of the same drift"). The AC-2 failure mode
here is identical in shape — the lang=en→vi fix was applied to the table path and
never propagated to the text path, so this guard asserts every site at once.
"""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

_SERVICE_ROOT = Path(__file__).resolve().parents[2]
if str(_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(_SERVICE_ROOT))

from infrastructure.ocr_orientation import (  # noqa: E402
    _MIN_ORIENTATION_CONFIDENCE,
    correct_orientation,
    detect_rotation_degrees,
    rotate_image,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _arr(h: int = 4, w: int = 6) -> np.ndarray:
    """Deterministic, non-square, non-symmetric RGB array."""
    base = np.arange(h * w, dtype=np.uint8).reshape(h, w)
    return np.stack([base, base + 1, base + 2], axis=-1)


def _stub_osd(rotate: int, conf: float = 10.0):
    """
    Patch the OCR GATEWAY seam, not pytesseract.

    Patching the gateway is itself part of the assertion: the OSD probe forks a
    tesseract child exactly like a page read does, so it must be routed through
    infrastructure/ocr_gateway (the single process-global concurrency bound +
    deadline + orphan reaper). A future edit that reverted to calling
    pytesseract.image_to_osd() directly would bypass this stub and fail the
    tests below on a host with no tesseract binary — plus trip
    __tests__/test_ocr_concurrency_invariant.py::TestOcrCallSiteFence.
    """
    fake = MagicMock(return_value={"rotate": rotate, "orientation_conf": conf})
    return patch("infrastructure.ocr_gateway.run_image_sync", fake), fake


# ---------------------------------------------------------------------------
# detect_rotation_degrees
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("rotate", [0, 90, 180, 270])
def test_detect_returns_osd_rotation_when_confident(rotate: int) -> None:
    ctx, _ = _stub_osd(rotate, conf=10.0)
    with ctx:
        assert detect_rotation_degrees(_arr()) == rotate


def test_detect_returns_zero_below_confidence_floor() -> None:
    """A degenerate near-zero-confidence OSD guess must never rotate a page."""
    ctx, _ = _stub_osd(90, conf=_MIN_ORIENTATION_CONFIDENCE - 0.01)
    with ctx:
        assert detect_rotation_degrees(_arr()) == 0


def test_detect_fails_closed_on_osd_exception() -> None:
    """
    Tesseract raises "Too few characters" routinely on sparse numeric BCTC
    crops. That must degrade to "no rotation", never propagate.
    """
    with patch("infrastructure.ocr_gateway.run_image_sync",
               side_effect=RuntimeError("Too few characters")):
        assert detect_rotation_degrees(_arr()) == 0


def test_detect_rejects_non_multiple_of_90() -> None:
    ctx, _ = _stub_osd(45, conf=10.0)
    with ctx:
        assert detect_rotation_degrees(_arr()) == 0


def test_detect_returns_zero_on_empty_array_without_calling_osd() -> None:
    ctx, fake = _stub_osd(90, conf=10.0)
    with ctx:
        assert detect_rotation_degrees(np.zeros((0, 0, 3), dtype=np.uint8)) == 0
    fake.assert_not_called()


def test_detect_routes_through_the_ocr_gateway_with_osd_mode_and_lang() -> None:
    """
    lang MUST be "osd", not the vie+eng used for page reads: image_to_osd reads
    the `osd` traineddata and passing the Vietnamese model silently breaks the
    probe. mode MUST be "osd" so ocr_gateway._exec_tesseract dispatches to
    image_to_osd rather than image_to_string.
    """
    ctx, fake = _stub_osd(90, conf=10.0)
    with ctx:
        detect_rotation_degrees(_arr())

    assert fake.call_args.kwargs["mode"] == "osd"
    assert fake.call_args.kwargs["lang"] == "osd"


def test_gateway_exec_dispatches_osd_mode_to_image_to_osd() -> None:
    """The other half of the seam: ocr_gateway must actually know mode='osd'."""
    import types

    import infrastructure.ocr_gateway as gw

    fake_pt = types.ModuleType("pytesseract")
    fake_pt.Output = SimpleNamespace(DICT="dict", DATAFRAME="dataframe")  # type: ignore[attr-defined]
    fake_pt.image_to_osd = MagicMock(return_value={"rotate": 180})  # type: ignore[attr-defined]

    with patch.dict(sys.modules, {"pytesseract": fake_pt}):
        out = gw._exec_tesseract("img", "osd", "osd", "", None, 30)

    assert out == {"rotate": 180}
    assert fake_pt.image_to_osd.call_args.kwargs["output_type"] == "dict"  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------
# rotate_image — real numpy arithmetic, no mocks
# ---------------------------------------------------------------------------


def test_rotate_zero_returns_the_same_object_not_a_copy() -> None:
    """
    AC-4 foundation: on an upright page the OCR input must be byte-for-byte the
    pre-fix input. Returning the SAME OBJECT makes that structural rather than
    a claim.
    """
    src = _arr()
    assert rotate_image(src, 0) is src


def test_rotate_90_is_clockwise() -> None:
    """
    OSD's `rotate` is "clockwise degrees needed to correct". Getting this
    backwards yields a 180-degree error on every rotated page while still
    "detecting" correctly — the exact silent failure this test exists to block.

    Clockwise by 90: the FIRST COLUMN of the source, read bottom-to-top,
    becomes the FIRST ROW of the result.
    """
    src = _arr(h=4, w=6)
    out = rotate_image(src, 90)

    assert out.shape == (6, 4, 3)
    expected_first_row = src[::-1, 0, :]
    np.testing.assert_array_equal(out[0], expected_first_row)


def test_rotate_180_reverses_both_axes() -> None:
    src = _arr()
    np.testing.assert_array_equal(rotate_image(src, 180), src[::-1, ::-1, :])


def test_rotate_270_is_inverse_of_90() -> None:
    src = _arr()
    np.testing.assert_array_equal(rotate_image(rotate_image(src, 90), 270), src)


def test_four_90_rotations_return_to_origin() -> None:
    src = _arr()
    out = src
    for _ in range(4):
        out = rotate_image(out, 90)
    np.testing.assert_array_equal(out, src)


def test_rotated_output_is_c_contiguous() -> None:
    """PaddleOCR and pytesseract both need a contiguous buffer, not a view."""
    assert rotate_image(_arr(), 90).flags["C_CONTIGUOUS"]


def test_rotate_ignores_invalid_degrees() -> None:
    src = _arr()
    assert rotate_image(src, 45) is src
    assert rotate_image(src, -90) is src


def test_rotate_pil_image_uses_negative_angle_for_clockwise() -> None:
    """PIL.Image.rotate() is counter-clockwise, so clockwise needs -degrees."""
    pil = SimpleNamespace(rotate=MagicMock(return_value="rotated"))
    assert rotate_image(pil, 90) == "rotated"
    pil.rotate.assert_called_once_with(-90, expand=True)


# ---------------------------------------------------------------------------
# correct_orientation
# ---------------------------------------------------------------------------


def test_correct_orientation_passthrough_is_identity() -> None:
    src = _arr()
    ctx, _ = _stub_osd(0, conf=10.0)
    with ctx:
        out, deg = correct_orientation(src)
    assert deg == 0
    assert out is src


def test_correct_orientation_applies_detected_rotation() -> None:
    src = _arr()
    ctx, _ = _stub_osd(90, conf=10.0)
    with ctx:
        out, deg = correct_orientation(src)
    assert deg == 90
    np.testing.assert_array_equal(out, rotate_image(src, 90))


def test_correct_orientation_passthrough_when_osd_unavailable() -> None:
    src = _arr()
    with patch("infrastructure.ocr_gateway.run_image_sync",
               side_effect=OSError("tesseract missing")):
        out, deg = correct_orientation(src)
    assert (deg, out is src) == (0, True)


# ---------------------------------------------------------------------------
# AC-2 — the detection must be wired at EVERY construction site
# ---------------------------------------------------------------------------

# (relative path, human label). The first three are the sites named in the row;
# page_rasterizer is the fourth in-zone consumer of the same rasterized pixels
# (it produces the PNG get_bctc_page_image serves to the refine agent).
_ORIENTATION_SITES = [
    ("infrastructure/ocr_adapter.py", "text path (in-process adapter)"),
    ("infrastructure/ocr_worker.py", "text path (ProcessPoolExecutor worker)"),
    ("infrastructure/pek_engine_adapter.py", "table path (PEK)"),
    ("infrastructure/page_rasterizer.py", "page-image path (get_bctc_page_image)"),
]


@pytest.mark.parametrize("rel_path,label", _ORIENTATION_SITES)
def test_every_construction_site_wires_orientation_detection(rel_path: str, label: str) -> None:
    """
    AC-2: 'whatever is chosen is applied at ALL THREE construction sites ... or
    the defect simply relocates to the path that was missed.'
    """
    source = (_SERVICE_ROOT / rel_path).read_text(encoding="utf-8")
    assert "ocr_orientation" in source, (
        f"{rel_path} ({label}) does not import infrastructure.ocr_orientation — "
        "the orientation fix has been removed from or never reached this site"
    )


@pytest.mark.parametrize("rel_path,label", _ORIENTATION_SITES[:3])
def test_falsified_premise_comment_is_gone(rel_path: str, label: str) -> None:
    """AC-1: the falsified 'BCTC tables are not rotated' premise must not
    survive anywhere for the next reader to trust."""
    source = (_SERVICE_ROOT / rel_path).read_text(encoding="utf-8")
    offending = "# use_angle_cls=False: BCTC tables are not rotated."
    assert offending not in source, f"{rel_path} still asserts the falsified premise"


# ---------------------------------------------------------------------------
# AC-2 behavioural — the CORRECTED pixels, not the raw ones, reach the OCR call
# ---------------------------------------------------------------------------
#
# Guarding the PaddleOCR construction sites alone would be inert on the path
# that actually produces page text: a rotated page yields hundreds of chars of
# mojibake, far above LOW_TESSERACT_PAGE_CHARS, so the PaddleOCR rasterize
# fallback never fires. These tests pin the PRIMARY Tesseract read at both text
# sites.


def _stub_absent(module_name: str, **attrs: object) -> None:
    import types

    if module_name not in sys.modules:
        stub = types.ModuleType(module_name)
        for name, value in attrs.items():
            setattr(stub, name, value)
        sys.modules[module_name] = stub


try:  # keep the REAL packages when present; only stub what is missing
    import pdf2image as _pdf2image_real  # noqa: F401
except ImportError:
    pass
_stub_absent("pdf2image", convert_from_path=MagicMock())


class TestPrimaryTesseractReadUsesCorrectedImage:
    def test_ocr_adapter_ocr_pages_ocrs_the_rotated_image(self) -> None:
        from infrastructure.ocr_adapter import PdfOcrAdapter

        raw, rotated = MagicMock(name="raw"), MagicMock(name="rotated")
        gateway = MagicMock(return_value="text")

        with patch("pdf2image.convert_from_path", return_value=[raw], create=True), \
             patch("infrastructure.ocr_orientation.correct_orientation",
                   return_value=(rotated, 90)), \
             patch("infrastructure.ocr_gateway.run_image_sync", gateway):
            PdfOcrAdapter().ocr_pages("/fake/any.pdf", [1])

        assert gateway.call_args.args[0] is rotated, (
            "ocr_pages() OCR'd the RAW raster — the orientation correction is "
            "computed but discarded, so rotated pages stay garbled"
        )

    def test_ocr_adapter_ocr_pages_passes_raw_image_when_upright(self) -> None:
        from infrastructure.ocr_adapter import PdfOcrAdapter

        raw = MagicMock(name="raw")
        gateway = MagicMock(return_value="text")

        with patch("pdf2image.convert_from_path", return_value=[raw], create=True), \
             patch("infrastructure.ocr_orientation.correct_orientation",
                   return_value=(raw, 0)), \
             patch("infrastructure.ocr_gateway.run_image_sync", gateway):
            PdfOcrAdapter().ocr_pages("/fake/any.pdf", [1])

        assert gateway.call_args.args[0] is raw

    def test_ocr_worker_ocr_pages_worker_ocrs_the_rotated_image(self) -> None:
        from infrastructure.ocr_worker import ocr_pages_worker

        raw, rotated = MagicMock(name="raw"), MagicMock(name="rotated")
        tess = MagicMock(return_value="text")

        with patch("pdf2image.convert_from_path", return_value=[raw], create=True), \
             patch("infrastructure.ocr_orientation.correct_orientation",
                   return_value=(rotated, 90)), \
             patch("pytesseract.image_to_string", tess, create=True):
            ocr_pages_worker("/fake/any.pdf", [1])

        assert tess.call_args.args[0] is rotated, (
            "ocr_pages_worker() OCR'd the RAW raster — site 2/3 missed"
        )


# ---------------------------------------------------------------------------
# AC-6 — the stored-artifact invalidation lever for page images
# ---------------------------------------------------------------------------


class TestRasterizeForceInvalidation:
    def test_existing_png_is_not_rerendered_by_default(self, tmp_path: Path) -> None:
        from infrastructure import page_rasterizer

        open_mock = MagicMock()
        with patch.object(page_rasterizer, "_BASE_OUTPUT_DIR", str(tmp_path)):
            out_dir = tmp_path / "rid"
            out_dir.mkdir()
            (out_dir / "page_0003.png").write_bytes(b"stale-sideways-png")

            with patch.dict(sys.modules, {"fitz": SimpleNamespace(open=open_mock)}):
                result = page_rasterizer.rasterize_page("/x.pdf", "rid", 3, 150)

        assert result.read_bytes() == b"stale-sideways-png"
        open_mock.assert_not_called()

    def test_force_rerenders_an_existing_png(self, tmp_path: Path) -> None:
        """
        Without this lever every page image rasterized before the orientation
        fix stays sideways on the shared volume forever — idempotency turns the
        constructor fix into a no-op for already-stored artifacts (AC-6).
        """
        from infrastructure import page_rasterizer

        pix = SimpleNamespace(samples=b"", height=1, width=1, n=3,
                              save=MagicMock(side_effect=lambda p: Path(p).write_bytes(b"fresh")))
        page = SimpleNamespace(get_pixmap=MagicMock(return_value=pix))
        doc = MagicMock()
        doc.page_count = 5
        doc.__getitem__.return_value = page
        fitz_stub = SimpleNamespace(open=MagicMock(return_value=doc),
                                    Matrix=MagicMock(return_value="matrix"))

        with patch.object(page_rasterizer, "_BASE_OUTPUT_DIR", str(tmp_path)):
            out_dir = tmp_path / "rid"
            out_dir.mkdir()
            (out_dir / "page_0003.png").write_bytes(b"stale-sideways-png")

            with patch.dict(sys.modules, {"fitz": fitz_stub}), \
                 patch("infrastructure.ocr_orientation.correct_orientation",
                       side_effect=lambda a: (a, 0)):
                result = page_rasterizer.rasterize_page("/x.pdf", "rid", 3, 150, force=True)

        fitz_stub.open.assert_called_once()
        assert result.read_bytes() == b"fresh"

    def test_rasterizer_writes_rotated_pixels_when_osd_detects_rotation(
        self, tmp_path: Path
    ) -> None:
        from infrastructure import page_rasterizer

        src = _arr(h=4, w=6)
        pix = SimpleNamespace(samples=src.tobytes(), height=4, width=6, n=3,
                              save=MagicMock())
        page = SimpleNamespace(get_pixmap=MagicMock(return_value=pix))
        doc = MagicMock()
        doc.page_count = 5
        doc.__getitem__.return_value = page
        fitz_stub = SimpleNamespace(open=MagicMock(return_value=doc),
                                    Matrix=MagicMock(return_value="matrix"))

        ctx, _ = _stub_osd(90, conf=10.0)
        with patch.object(page_rasterizer, "_BASE_OUTPUT_DIR", str(tmp_path)), \
             patch.dict(sys.modules, {"fitz": fitz_stub}), ctx:
            out = page_rasterizer.rasterize_page("/x.pdf", "rid", 1, 150)

        pix.save.assert_not_called()  # PyMuPDF writer bypassed — PIL wrote the rotated array

        from PIL import Image

        np.testing.assert_array_equal(np.array(Image.open(out)), rotate_image(src, 90))
