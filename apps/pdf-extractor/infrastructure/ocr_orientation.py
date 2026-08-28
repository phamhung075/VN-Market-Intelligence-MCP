# size-justification: ~230L — NEW module (FIX-PDFX-OCR-ORIENTATION-UNDETECTED-ROTATED-BCTC-PAGES-READ-UPSIDE-DOWN): 3 pure rotation functions (detect/rotate/correct) + load-bearing measured-evidence module docstring (AC cost, false-positive rate on 89 pages, fail-closed reasoning) shared by every rasterize→OCR site. The docstring IS the AC evidence trail; splitting would fragment the fail-closed contract from its evidence.
"""
infrastructure/ocr_orientation.py — FIX-PDFX-OCR-ORIENTATION-UNDETECTED-ROTATED-BCTC-PAGES-READ-UPSIDE-DOWN

Page/crop rotation detection + correction, shared by every rasterize→OCR
construction site in this service (ocr_adapter.py, ocr_worker.py,
pek_engine_adapter.py) and by the page rasterizer that serves
get_bctc_page_image (page_rasterizer.py).

WHAT THIS REPLACES
------------------
PaddleOCR was constructed with ``use_angle_cls=False`` at all three OCR sites on
the written premise "BCTC tables are not rotated". That premise is FALSE.
Measured on report 1f53ef33-8f50-489b-8505-689740692ab0 (VIC_2026_Q1.pdf), all
71 pages rasterized at 200 DPI and probed with Tesseract OSD:

    19 of 71 pages need a 90 degree CLOCKWISE correction
    (10, 11, 31, 34, 35, 48, 57, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71)
    the other 52 read upright (rotate=0)

Every one of those pages carries a portrait /MediaBox (612x792) with a
``/Rotate`` attribute of 0, so nothing in the PDF metadata flags them and no
rasterizer setting fixes them — the page CONTENT is sideways. They are the
landscape subsidiary/notes tables (PHU LUC 1 — CO CAU TO CHUC, TAI SAN CO DINH
HUU HINH, BAO CAO KET QUA HOAT DONG KINH DOANH continuation pages).

MECHANISM, and why NOT use_angle_cls=True
-----------------------------------------
PaddleOCR's own angle classifier (``cls=True``) runs a per-detected-TEXT-LINE
CNN pass — cost scales O(n) in line count, and a dense BCTC table has dozens of
numeric rows per page. That is the same per-line-model-pass shape that has
OOM-killed this service before (FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM,
open in review[] when this landed). It also would not help the DEFAULT path at
all: ``select_ocr_backend()`` in infrastructure/ocr_backends.py defaults to
``tesseract-vie`` and OCR_TEXT_BACKEND is unset in this deployment, so
``paddle_table``'s own flag never reaches the code that reads the table text.

Instead: ONE ``image_to_osd`` call per PAGE — O(1) in text-line count, issued
through ``infrastructure.ocr_gateway`` (mode="osd") so the probe sits inside THE
single process-global tesseract concurrency bound, wall-clock deadline and
orphan reaper like every other tesseract invocation in this service — using the
``osd`` traineddata already present in the built image
(verified: ``tesseract --list-langs`` inside the running container lists
eng/osd/vie, so no Dockerfile change and no new model weight). Correction is a
single ``numpy.rot90``. Because the correction runs on the rasterized PIXELS
upstream of the backend dispatch, it fixes the Tesseract path AND the PaddleOCR
path AND the PNG the refine agent looks at, with one mechanism.

MEASURED COST (AC-5, same container, 200 DPI, 1700x2200 raster)
---------------------------------------------------------------
Wall clock: mean 1.07 s per page for the OSD probe (VIC_2026_Q1 71-page sweep,
min 0.89 s, max 1.33 s), plus ~1 ms for the rot90 + ascontiguousarray on a
corrected page. Memory: measured on the container cgroup (``memory.peak`` /
``memory.events``), NOT ru_maxrss (which double-counts copy-on-write pages
across the per-cell tesseract forks) — see the commit message / the decisions
record for the raw numbers.

FALSE-POSITIVE RATE, measured on two reports (89 pages, 200 DPI): 21 pages
detected rotated, 68 detected upright, ZERO false positives — every detection
recovered readable Vietnamese and every non-detection re-OCR'd byte-identical.

FAILS CLOSED
------------
Any OSD exception — most commonly Tesseract's "Too few characters" on a sparse
or numeric-only region, which is routine for BCTC crops, but also OCR-gateway
capacity/deadline errors — is caught and treated as "no rotation" (0). A missed
rotation reproduces today's already-tracked bug; a FALSE rotation on an
already-correct page would be a NEW regression, so the uncertain direction is
always "do nothing".

FALSE-POSITIVE EVIDENCE (AC-4)
------------------------------
On the 52 pages of the acceptance report that OSD scores rotate=0, the returned
array IS the input array (same object, no copy), so the OCR input is unchanged
byte-for-byte. Verified by re-OCR rather than by construction: pages 13, 14, 15,
16, 41 and 58, 59 were OCR'd twice — once on the raw raster, once on the
``correct_orientation()`` output — and the two texts are byte-identical.
Re-run the evidence with ``scripts/audits/ocr-orientation-probe.py``.

DDD: infrastructure layer. Zero domain/application imports. Pure functions —
no state, no singletons, safe to import from any site including the
ProcessPoolExecutor worker.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Tuple

from infrastructure.ocr_gateway_config import OUTPUT_DICT

logger = logging.getLogger(__name__)

# Defensive floor only — NOT a discriminative threshold. Every page in the
# acceptance sweep (rotated and upright alike) scored 7.5-13.3, far above this;
# the floor exists solely to reject a degenerate near-zero-confidence OSD guess,
# never to separate the two classes. Do not tune it into a classifier.
_MIN_ORIENTATION_CONFIDENCE = 1.0

_VALID_ROTATIONS = (0, 90, 180, 270)


def detect_rotation_degrees(image_array: Any) -> int:
    """
    Return the CLOCKWISE degrees (0/90/180/270) needed to bring `image_array`
    to upright reading orientation, via a single Tesseract OSD probe.

    Never raises. Any failure (PIL/numpy missing, no tesseract binary, "Too few
    characters" on a sparse crop, OCR gateway at capacity or past its deadline,
    malformed OSD output) or a below-floor confidence returns 0 — see module
    docstring "FAILS CLOSED".

    Args:
        image_array: numpy.ndarray (H x W x C, uint8) — a rasterized page or a
            cropped region. A PIL.Image.Image is also accepted directly.

    Returns:
        0, 90, 180 or 270. 0 means "make no correction".
    """
    try:
        import numpy as np
        from PIL import Image

        from infrastructure import ocr_gateway

        if isinstance(image_array, np.ndarray):
            if image_array.size == 0:
                return 0
            pil_image = Image.fromarray(image_array)
        else:
            pil_image = image_array

        # Routed through ocr_gateway, never pytesseract directly: an OSD probe
        # forks a tesseract child exactly like a page read does, so it must sit
        # inside THE single process-global concurrency bound + wall-clock
        # deadline + orphan reaper (see infrastructure/ocr_gateway.py and
        # __tests__/test_ocr_concurrency_invariant.py::TestOcrCallSiteFence).
        # lang="osd" (NOT vie+eng) — image_to_osd reads the `osd` traineddata.
        raw = ocr_gateway.run_image_sync(
            pil_image, mode="osd", lang="osd", config="", output_type=OUTPUT_DICT
        )
        # run_image_sync is typed Union[str, Any] (mode="string" returns str);
        # anything that is not the OSD dict means the probe did not answer.
        if not isinstance(raw, dict):
            return 0
        osd: Dict[str, Any] = raw
        rotate = int(osd.get("rotate", 0)) % 360
        conf = float(osd.get("orientation_conf", 0.0))

        if conf < _MIN_ORIENTATION_CONFIDENCE:
            logger.debug(
                "ocr_orientation: OSD confidence %.2f below floor %.2f — "
                "treating as no rotation (raw rotate=%d ignored)",
                conf,
                _MIN_ORIENTATION_CONFIDENCE,
                rotate,
            )
            return 0

        if rotate not in _VALID_ROTATIONS:
            return 0

        return rotate

    except Exception as exc:
        # Expected/routine: sparse numeric-only crops raise pytesseract's
        # "Too few characters" TesseractError. Never blocks the page.
        logger.debug(
            "ocr_orientation: OSD probe failed, treating as no rotation: %s", exc
        )
        return 0


def rotate_image(image_array: Any, degrees: int) -> Any:
    """
    Rotate `image_array` CLOCKWISE by `degrees` (0/90/180/270).

    Separated from detect_rotation_degrees() so a caller that already knows the
    PAGE rotation can apply it to N crops of that page WITHOUT paying N further
    OSD probes — that is exactly what pek_engine_adapter._run_table_extraction
    does (one probe per page, applied to every table region on it).

    degrees == 0 returns the SAME OBJECT, not a copy: a no-op caller then
    reproduces the pre-fix behaviour byte-for-byte.

    Args:
        image_array: numpy.ndarray (H x W x C, uint8).
        degrees:     0, 90, 180 or 270. Any other value is treated as 0.

    Returns:
        The rotated (C-contiguous) array, or `image_array` itself when no
        rotation is applied.
    """
    if degrees not in _VALID_ROTATIONS or degrees == 0:
        return image_array

    try:
        import numpy as np
    except Exception as exc:  # pragma: no cover — numpy is a hard dep everywhere
        logger.debug("ocr_orientation: numpy unavailable, skipping rotation: %s", exc)
        return image_array

    if not isinstance(image_array, np.ndarray):
        # PIL path — Image.rotate() is counter-clockwise, so negate.
        try:
            return image_array.rotate(-degrees, expand=True)
        except Exception as exc:
            logger.debug("ocr_orientation: PIL rotate failed: %s", exc)
            return image_array

    # `degrees` is OSD's "clockwise degrees to correct" value. np.rot90's k
    # rotates COUNTER-clockwise by 90*k, and clockwise-by-d is the same as
    # counter-clockwise-by-(360-d).
    k = ((360 - degrees) // 90) % 4
    # np.rot90 returns a view; PaddleOCR and pytesseract both need a contiguous
    # buffer, so materialise it.
    return np.ascontiguousarray(np.rot90(image_array, k=k))


def correct_orientation(image_array: Any) -> Tuple[Any, int]:
    """
    Detect and correct rotation with a single OSD probe.

    Args:
        image_array: numpy.ndarray (H x W x C, uint8), or a PIL.Image.Image.

    Returns:
        (corrected, degrees_applied). degrees_applied is 0 when no correction
        was made (OSD failed, confidence below floor, or already upright) — and
        in that case `corrected` IS `image_array`, the same object.
    """
    rotate = detect_rotation_degrees(image_array)
    if rotate == 0:
        return image_array, 0
    return rotate_image(image_array, rotate), rotate
