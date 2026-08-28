# size-justification: ~690L — OcrBackendPort adapter module: 3 concrete backends (TesseractVie / PaddleOCR / AutoFallback) + selector factory + recall-aware confidence helpers (Otsu ink coverage, polygon→box); legitimately grew via reviewed fixes (OCR concurrency gateway dispatch FIX-PDFX-TESSERACT-CONCURRENCY, recall-aware confidence FIX-PDFX-TESSERACT-CONFIDENCE-MEAN-OVER-NONEMPTY-MASKS-TOTAL-PAGE-MISS with its measured-evidence block). Cohesive single-purpose module — splitting would fragment the shared ink/recall basis all three backends must agree on.
"""
infrastructure/ocr_backends.py — PEK-IMPL-OCR (REQ-PEK-12 candidate)

Pluggable cell/line TEXT-recognition adapters and selector factory.

Implements OcrBackendPort (domain/repositories.py) with two concrete backends:

    PaddleOcrBackend    — wraps the PaddleOCR PP-StructureV2 OCR call already used
                          inside pek_engine_adapter._run_table_extraction().
                          EXTRACTED from that path — no new logic, same paddle_table
                          instance is injected at construction.

    TesseractVieBackend — wraps pytesseract (vie+eng, --psm 6), reusing the same
                          Tesseract invocation pattern as infrastructure/ocr_adapter.py.
                          Default backend for BCTC: Vietnamese diacritics proven path.

Selection factory (select_ocr_backend):
    Reads OCR_TEXT_BACKEND env var ∈ {tesseract-vie, paddleocr, auto}.
    - "tesseract-vie" (default when unset): returns TesseractVieBackend.
    - "paddleocr": returns PaddleOcrBackend.
    - "auto": returns AutoFallbackOcrBackend (Tesseract-first; falls back to
      PaddleOCR if tesseract confidence < AUTO_FALLBACK_CONFIDENCE_THRESHOLD).

AutoFallbackOcrBackend:
    Policy: run TesseractVieBackend first. If confidence < threshold, retry with
    PaddleOcrBackend. Keep the result with the higher confidence score.

Confidence semantics (BOTH backends):
    confidence = min(precision, recall)
      precision = mean per-word engine score over what WAS recognised
      recall    = `_ink_coverage` — fraction of the crop's foreground pixels
                  that fall inside a box the engine emitted text for.
    Precision alone is blind to a near-total page miss; see the "Recall-aware
    confidence" block below for the measured rejection of the alternatives.

Hard constraints (non-negotiable):
    - ONLY the cell/line TEXT step is implemented here.
    - NEVER performs layout detection or table-grid detection.
    - CPU-only. No CUDA, no paddlepaddle_gpu.
    - No network calls during inference (all weights on-host).

DDD: infrastructure layer — may import pytesseract, paddleocr, numpy, PIL.
    NEVER imported from domain/ or application/ (injected at composition root only).

Privacy: all inference on-host. Zero outbound HTTP.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional, Tuple

from infrastructure import ocr_gateway
from infrastructure.tesseract_config import TESSERACT_LANG, TESSERACT_PSM6_CONFIG

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Confidence threshold for "auto" fallback mode.
# If Tesseract confidence < this value, retry with PaddleOCR.
# ---------------------------------------------------------------------------
AUTO_FALLBACK_CONFIDENCE_THRESHOLD: float = float(
    os.environ.get("OCR_FALLBACK_THRESHOLD", "0.5")
)

# ---------------------------------------------------------------------------
# OcrBackendPort — re-imported here for isinstance checks in factory.
# (Domain import in infrastructure is permitted: infra → domain is valid DDD.)
# ---------------------------------------------------------------------------
# We don't import OcrBackendPort at module level to avoid circular-ish import
# warnings in some test setups; the factory returns a duck-typed object.


# ---------------------------------------------------------------------------
# _to_pil — module-level image-conversion helper (PEK-OCR-ROOTCAUSE)
# ---------------------------------------------------------------------------


def _to_pil(image_or_region):
    """
    Convert image_or_region to PIL.Image.Image.

    Accepts:
        numpy.ndarray (uint8, H×W×C BGR or RGB) — converted via Image.fromarray.
        PIL.Image.Image — returned as-is (passthrough).
        None — returns None (caller must handle).
    Returns:
        PIL.Image.Image or None.
    Raises:
        RuntimeError if the input type is neither ndarray nor PIL.Image and
        conversion fails — so the caller receives a hard failure instead of
        silent empty text.

    DDD: infrastructure helper — local imports deferred to avoid loading heavy
    dependencies at module import time.
    """
    from PIL import Image  # type: ignore
    import numpy as np  # type: ignore

    if image_or_region is None:
        return None
    if isinstance(image_or_region, Image.Image):
        return image_or_region
    if isinstance(image_or_region, np.ndarray):
        return Image.fromarray(image_or_region)
    raise RuntimeError(
        f"_to_pil: unsupported input type {type(image_or_region).__name__} — "
        "expected numpy.ndarray or PIL.Image.Image"
    )


# ---------------------------------------------------------------------------
# Recall-aware confidence
# (FIX-PDFX-TESSERACT-CONFIDENCE-MEAN-OVER-NONEMPTY-MASKS-TOTAL-PAGE-MISS)
#
# THE DEFECT — confidence used to be mean(conf) over ONLY the rows the engine
# managed to recognise. The denominator was the successfully-read rows, not the
# rows that SHOULD have been read, so recall was invisible to the score by
# construction. A region where Tesseract picked up a header band and lost every
# data row therefore self-reported ~0.7-0.9 and `auto` mode's rescue never
# fired: measured byte-identical output to tesseract-vie on 30/30 FPT Q4 2025
# units, page 9 included.
#
# THE FIX — measure what was NOT recognised, on the only basis that is present
# in the crop itself: its INK. `_ink_coverage` is the fraction of the region's
# foreground pixels that fall inside a box the engine actually emitted text for.
# Confidence then becomes `min(precision, recall)` (`_recall_adjusted_confidence`).
#
# WHY ink coverage and not the three obvious alternatives. All four were
# measured side by side on the real 51 table regions of FPT Q4 2025 with
# scripts/audits/ocr-confidence-probe.sh (page 9 = the known catastrophic miss):
#
#   metric                       page 9    lowest legitimate region    separable?
#   mean(conf)  [old]            0.7084    0.7122  (pg34)              NO  (0.5% apart)
#   char-weighted mean(conf)     0.7121    0.6876  (pg34)              NO  (INVERTED)
#   recognised-area / crop-area  0.1183    0.0896  (pg16)              NO  (INVERTED)
#   recognised lines / detected  1.0000    1.0000  (all)               NO  (inert)
#   INK COVERAGE                 0.1740    0.6739  (pg40)              YES (3.9x gap)
#
# - char-weighted mean and raw-area coverage rank a GOOD region below page 9,
#   so no threshold on either can satisfy both the positive and the negative
#   control. Raw-area coverage is confounded by whitespace density; a sparse
#   but perfectly-read region looks identical to a dense but unread one.
# - "recognised rows vs rows the layout pass found" is structurally inert here:
#   Tesseract emits a level-4 line box only where it already found words, so the
#   ratio is 1.0 on every region including page 9 (4 of 4). It cannot see rows
#   that were never segmented.
# - Lowering AUTO_FALLBACK_CONFIDENCE_THRESHOLD is not a fix and is explicitly
#   rejected by the owning row: any value that catches page 9 (> 0.7084) also
#   catches pages 34/27/28, which are legitimate full reads (ink coverage 0.93 /
#   0.84 / 0.77). The constant stays 0.5 — what changed is what is measured.
#
# NOTE on the 0.674 floor: the ink a good region leaves uncovered is dominated
# by NON-TEXT ink — table rule lines, borders, stamps, signatures — which no
# text engine emits a word box for. 0.674 is therefore "all text read, plus
# heavy ruling", not "33% of the text missed". The discriminating gap is the
# 3.9x drop to page 9, not the absolute level.
# ---------------------------------------------------------------------------

# Below this many foreground pixels a coverage RATIO is numerically meaningless
# (a single 200-DPI glyph is already ~10x this). Degenerate-input guard only —
# NOT a tuning knob. The smallest real region measured on FPT Q4 2025 carried
# 2136 ink pixels, ~8x this floor.
_INK_COVERAGE_MIN_INK_PIXELS: int = 256


def _otsu_threshold(gray: Any) -> int:
    """
    Otsu's method on a uint8 grayscale array. Pure numpy — no cv2, no scipy.

    Data-derived, so it introduces no new hand-tuned constant: the ink/paper
    split is read off the crop's own intensity histogram.
    """
    import numpy as np  # type: ignore

    hist = np.bincount(gray.ravel(), minlength=256).astype(np.float64)
    total = gray.size
    if total == 0:
        return 128
    omega = np.cumsum(hist) / total
    mu = np.cumsum(hist * np.arange(256)) / total
    mu_t = mu[-1]
    denom = omega * (1.0 - omega)
    with np.errstate(divide="ignore", invalid="ignore"):
        sigma_b = np.where(denom > 0, (mu_t * omega - mu) ** 2 / denom, 0.0)
    return int(np.argmax(sigma_b))


def _ink_coverage(image_or_region: Any, boxes: Any) -> float:
    """
    Fraction of the region's foreground (ink) pixels that fall inside `boxes`.

    Args:
        image_or_region: the SAME crop that was handed to the OCR engine
                         (numpy ndarray or PIL.Image).
        boxes: iterable of (left, top, width, height) in crop pixel coordinates
               — one per text span the engine actually emitted.

    Returns:
        0.0 .. 1.0. Returns 1.0 when the crop carries no measurable ink: there
        is then nothing that COULD have been missed, and reporting 0.0 would
        make every blank region trigger a pointless rescue.

    Polarity guard: if the Otsu foreground is the MAJORITY of the crop, the crop
    is inverted (white text on black) and the mask is flipped — otherwise a
    perfectly-read inverted scan would score ~0 and be rescued every time.
    """
    import numpy as np  # type: ignore

    pil_image = _to_pil(image_or_region)
    if pil_image is None:
        return 1.0

    gray = np.asarray(pil_image.convert("L"))
    if gray.ndim != 2 or gray.size == 0:
        return 1.0
    h, w = gray.shape

    ink = gray <= _otsu_threshold(gray)
    if ink.mean() > 0.5:
        ink = ~ink

    ink_total = int(ink.sum())
    if ink_total < _INK_COVERAGE_MIN_INK_PIXELS:
        return 1.0

    covered = np.zeros((h, w), dtype=bool)
    for box in boxes:
        left, top, width, height = (int(v) for v in box)
        x0, y0 = max(0, left), max(0, top)
        x1, y1 = min(w, left + width), min(h, top + height)
        if x1 > x0 and y1 > y0:
            covered[y0:y1, x0:x1] = True

    return float(int((ink & covered).sum()) / ink_total)


def _polygon_to_box(points: Any) -> Optional[Tuple[int, int, int, int]]:
    """
    Axis-aligned (left, top, width, height) for a PaddleOCR detection polygon.

    PaddleOCR returns 4 corner points per text line, in CROP coordinates (the
    x0/y0 page offsets are re-added by the caller, not here). Returns None for
    any shape that is not a usable polygon — an unmeasurable box is dropped from
    the recall basis rather than silently counted as covering nothing.
    """
    try:
        xs = [float(p[0]) for p in points]
        ys = [float(p[1]) for p in points]
    except (TypeError, ValueError, IndexError):
        return None
    if not xs or not ys:
        return None
    left, top = int(min(xs)), int(min(ys))
    return (left, top, int(max(xs)) - left, int(max(ys)) - top)


_TESSERACT_GEOMETRY_COLUMNS = ("left", "top", "width", "height")


def _has_geometry_columns(frame: Any) -> bool:
    """
    True when an image_to_data frame carries the per-word box geometry the
    recall term needs.

    Real pytesseract always emits these four columns. A frame without them can
    only come from a stub or a future pytesseract shape change, and there the
    honest answer is "recall is unmeasurable here" — degrade to precision-only
    (i.e. pre-fix behaviour) rather than abort a whole table region over a
    column name.
    """
    try:
        return all(c in frame.columns for c in _TESSERACT_GEOMETRY_COLUMNS)
    except Exception:  # noqa: BLE001 — not a DataFrame at all
        return False


def _recall_adjusted_confidence(precision: float, coverage: float) -> float:
    """
    Combine precision (mean conf over what WAS read) with recall (`_ink_coverage`).

    min(), deliberately — not the product and not the harmonic mean. Both of
    those let a high precision partially compensate for a collapsed recall,
    which is the exact failure this function exists to prevent: under an F1 a
    region read perfectly but only 34% covered still scores 0.507 and escapes a
    0.5 gate. Under min() it scores 0.34 and is rescued. A read is only as
    trustworthy as its weaker dimension.
    """
    return max(0.0, min(1.0, min(float(precision), float(coverage))))


# ---------------------------------------------------------------------------
# TesseractVieBackend — default backend for Vietnamese BCTC
# ---------------------------------------------------------------------------


class TesseractVieBackend:
    """
    OcrBackendPort adapter: pytesseract (vie+eng, --psm 6).

    Config (TESSERACT_LANG, TESSERACT_PSM6_CONFIG) sourced from the single
    authoritative infrastructure/tesseract_config.py — see that module's
    docstring for the "DO NOT remove --psm 6" rationale (drift #4).

    Accepts numpy ndarray (uint8, H×W×C BGR/RGB) or PIL.Image.Image.
    Returns ("", 0.0) on None input only. All other failures raise (fail-loud).
    PEK-OCR-ROOTCAUSE: bare except swallow removed — errors propagate to caller.
    """

    def recognize_text(self, image_or_region: Any) -> Tuple[str, float]:
        """
        Run Tesseract vie+eng --psm 6 on a single image region.

        Returns:
            (text, confidence) — confidence is
            min(mean per-word conf over the recognised rows,
                `_ink_coverage` of those rows' boxes over the whole crop).
            Returns ("", 0.0) on None input only.

            FIX-PDFX-TESSERACT-CONFIDENCE-MEAN-OVER-NONEMPTY-MASKS-TOTAL-PAGE-MISS:
            the mean alone is precision-only and cannot fall on a region that was
            almost entirely missed, because its denominator is the rows that WERE
            read. The ink term supplies the missing recall dimension.

        Raises:
            RuntimeError if pytesseract/pandas are not installed (infra
            misconfiguration — operator must know).
            Any other exception propagates to the caller (per-crop isolation
            catch in _run_table_extraction handles it per-region).

        PEK-OCR-ROOTCAUSE: ImportError and bare except swallows removed.
        The previous bare `except Exception → return ("", 0.0)` was the root
        cause of corpus-wide empty OCR text (swallowed `_to_pil` NameError).
        """
        if image_or_region is None:
            return ("", 0.0)

        try:
            import pytesseract  # type: ignore  # noqa: F401 (existence check only)
            import pandas as pd  # type: ignore  # noqa: F401
        except ImportError as exc:
            # PEK-OCR-ROOTCAUSE: RAISE instead of returning empty.
            # pytesseract/pandas missing = infra misconfiguration.
            # Operator must know — a silent ("", 0.0) would mask the problem.
            raise RuntimeError(
                f"TesseractVieBackend: required packages not installed: {exc}"
            ) from exc

        # Convert numpy array to PIL.Image if needed
        pil_image = _to_pil(image_or_region)
        if pil_image is None:
            return ("", 0.0)

        # FIX-PDFX-TESSERACT-CONCURRENCY: the actual tesseract invocation now
        # goes through the OCR concurrency gateway (THE single process-global
        # bound — see infrastructure/ocr_gateway.py) instead of calling
        # pytesseract.image_to_data() directly. Same call contract (lang,
        # config, DATAFRAME output) — only the dispatch point moved.
        data = ocr_gateway.run_image_sync(
            pil_image,
            mode="data",
            lang=TESSERACT_LANG,
            config=TESSERACT_PSM6_CONFIG,
            output_type=ocr_gateway.OUTPUT_DATAFRAME,
        )

        # Filter to rows with valid text (non-empty, confidence > 0)
        valid_rows = data[
            (data["conf"] > 0) & (data["text"].str.strip() != "")
        ]

        if valid_rows.empty:
            return ("", 0.0)

        texts = valid_rows["text"].str.strip().tolist()
        text = " ".join(t for t in texts if t)
        mean_conf = float(valid_rows["conf"].mean()) / 100.0  # Tesseract: 0-100 → 0-1

        # FIX-PDFX-TESSERACT-CONFIDENCE-MEAN-OVER-NONEMPTY-MASKS-TOTAL-PAGE-MISS
        # mean_conf above is PRECISION ONLY — it is averaged over the rows
        # Tesseract managed to read, so a region it almost entirely MISSED still
        # scores high. Pair it with the recall term before reporting. See the
        # "Recall-aware confidence" block at the top of this module for the
        # measured rejection of the alternatives.
        coverage = _ink_coverage(
            pil_image,
            zip(
                valid_rows["left"].astype(int),
                valid_rows["top"].astype(int),
                valid_rows["width"].astype(int),
                valid_rows["height"].astype(int),
            ),
        ) if _has_geometry_columns(valid_rows) else 1.0

        confidence = _recall_adjusted_confidence(mean_conf, coverage)
        if confidence < mean_conf:
            logger.debug(
                "TesseractVieBackend: recall-adjusted confidence %.3f "
                "(precision %.3f, ink coverage %.3f) — %.0f%% of this region's "
                "ink sits outside every recognised word box",
                confidence,
                mean_conf,
                coverage,
                (1.0 - coverage) * 100.0,
            )

        return (text.strip(), confidence)


# ---------------------------------------------------------------------------
# PaddleOcrBackend — wraps existing PaddleOCR call from pek_engine_adapter
# ---------------------------------------------------------------------------


class PaddleOcrBackend:
    """
    OcrBackendPort adapter: PaddleOCR PP-StructureV2 (CPU, paddleocr==2.7.3).

    Wraps the EXACT same paddle_table.ocr(crop, cls=False) call that was
    previously hardcoded in pek_engine_adapter._run_table_extraction().
    No new logic — just extracted into this adapter.

    The paddle_table instance (PaddleOCR object) is injected at construction.
    When paddle_table is None (load failure), returns ("", 0.0) gracefully.

    CPU-only invariant: paddle_table must be constructed with use_gpu=False.
    This is enforced in _load_pek_models().

    Returns ("", 0.0) on None input, empty crop, or any exception.
    """

    def __init__(self, paddle_table: Optional[Any] = None) -> None:
        """
        Args:
            paddle_table: PaddleOCR instance constructed with use_gpu=False.
                          If None, all recognize_text() calls return ("", 0.0).
                          Can be set later via set_paddle_table() after lazy model load.
        """
        self._paddle_table = paddle_table

    def set_paddle_table(self, paddle_table: Any) -> None:
        """
        Inject or update the paddle_table instance after lazy model load.

        Called by PekEngineAdapter._run_extraction() once _get_pek_models()
        has loaded the models. Allows the backend to be constructed at
        composition-root time (before models exist) and filled in later.
        """
        self._paddle_table = paddle_table

    def recognize_text(self, image_or_region: Any) -> Tuple[str, float]:
        """
        Run PaddleOCR ocr(crop, cls=False) on a single image region (numpy ndarray).

        Extracts the SAME logic as the inner loop of
        pek_engine_adapter._run_table_extraction() — no rewrite, just encapsulation.

        Returns:
            (text, confidence) from PaddleOCR output.
            confidence = min(mean of per-word scores from ocr_result[0],
                             `_ink_coverage` of the detection polygons).
            Returns ("", 0.0) on failure or if paddle_table is None.
        """
        if image_or_region is None or self._paddle_table is None:
            return ("", 0.0)

        try:
            import numpy as np  # type: ignore

            # Ensure input is a numpy array (PaddleOCR requires ndarray)
            if not isinstance(image_or_region, np.ndarray):
                try:
                    image_arr = np.array(image_or_region)
                except Exception as exc:
                    # Per-crop data-shape issue (single crop with unsupported type).
                    # Not a broken backend — acceptable silent return here.
                    # PEK-OCR-ROOTCAUSE: added WARNING log so this is visible in logs.
                    logger.warning(
                        "PaddleOcrBackend: could not convert input to ndarray: %s", exc
                    )
                    return ("", 0.0)
            else:
                image_arr = image_or_region

            if image_arr.size == 0:
                return ("", 0.0)

            # PaddleOCR inference — same call as pek_engine_adapter._run_table_extraction
            ocr_result = self._paddle_table.ocr(image_arr, cls=False)

            texts: list[str] = []
            scores: list[float] = []
            boxes: list[Tuple[int, int, int, int]] = []

            if ocr_result and ocr_result[0]:
                for item in ocr_result[0]:
                    if item and len(item) >= 2:
                        text_conf = item[1]
                        if text_conf:
                            word_text = text_conf[0] if text_conf[0] else ""
                            word_score = float(text_conf[1]) if text_conf[1] is not None else 0.0
                            if word_text.strip():
                                texts.append(word_text.strip())
                                scores.append(word_score)
                                box = _polygon_to_box(item[0])
                                if box is not None:
                                    boxes.append(box)

            if not texts:
                return ("", 0.0)

            combined_text = " ".join(texts)
            mean_confidence = sum(scores) / len(scores) if scores else 0.0

            # FIX-PDFX-TESSERACT-CONFIDENCE-MEAN-OVER-NONEMPTY-MASKS-TOTAL-PAGE-MISS
            # Same precision-only defect, same fix. This backend is the RESCUE
            # arm of AutoFallbackOcrBackend, which picks a winner with
            # `paddle_conf >= tesseract_conf` — a comparison that is only
            # meaningful if both sides measure the same quantity on the same
            # crop. Leaving PaddleOCR on a precision-only score would let a
            # rescue that read even less than Tesseract win on paper.
            coverage = _ink_coverage(image_arr, boxes) if boxes else 1.0
            return (combined_text.strip(), _recall_adjusted_confidence(mean_confidence, coverage))

        except Exception:
            # PEK-OCR-ROOTCAUSE: RAISE instead of returning empty.
            # Structural backend failure (PaddleOCR inference crash, memory error,
            # dtype assertion, etc.) must propagate to the per-crop isolation catch
            # in _run_table_extraction:1006, which logs a WARNING and skips the region.
            # Swallowing here would mask the failure with false-green ("", 0.0).
            raise


# ---------------------------------------------------------------------------
# AutoFallbackOcrBackend — Tesseract-first with PaddleOCR confidence fallback
# ---------------------------------------------------------------------------


class AutoFallbackOcrBackend:
    """
    OcrBackendPort adapter: Tesseract-first with confidence-based PaddleOCR fallback.

    Policy ("auto" mode):
        1. Run TesseractVieBackend.
        2. If tesseract_confidence < AUTO_FALLBACK_CONFIDENCE_THRESHOLD:
               Run PaddleOcrBackend on the same region.
               Keep the result with the higher confidence.
        3. Otherwise: return Tesseract result directly.

    This gives the best of both worlds for Vietnamese BCTC:
        - Tesseract vie+eng is proven on Vietnamese diacritics (balanced text).
        - PaddleOCR catches cases where Tesseract struggles (rotated/noisy cells).

    Injected backends allow fake substitution in tests (zero real inference).
    """

    def __init__(
        self,
        tesseract_backend: TesseractVieBackend,
        paddle_backend: PaddleOcrBackend,
        threshold: float = AUTO_FALLBACK_CONFIDENCE_THRESHOLD,
    ) -> None:
        self._tesseract = tesseract_backend
        self._paddle = paddle_backend
        self._threshold = threshold

    def set_paddle_table(self, paddle_table: Any) -> None:
        """
        Propagate a loaded paddle_table to the internal PaddleOcrBackend.

        Called by PekEngineAdapter._run_extraction() after lazy model load.
        """
        self._paddle.set_paddle_table(paddle_table)

    def recognize_text(self, image_or_region: Any) -> Tuple[str, float]:
        """
        Run Tesseract first; fall back to PaddleOCR if confidence is below threshold.

        Returns the result with the higher confidence between the two runs.
        """
        if image_or_region is None:
            return ("", 0.0)

        tesseract_text, tesseract_conf = self._tesseract.recognize_text(image_or_region)

        if tesseract_conf >= self._threshold:
            # Tesseract has sufficient confidence — no need to run PaddleOCR
            return (tesseract_text, tesseract_conf)

        # Low Tesseract confidence — retry with PaddleOCR.
        #
        # INFO, not DEBUG, and deliberately: PaddleOCR is a per-region RESCUE,
        # not a co-default. It carries a real Vietnamese-diacritic penalty
        # (paddleocr==2.10.0 buckets "vi" into a generic 30-language "latin" rec
        # model), so it must stay RARE — measured 1 fire in 51 table regions on
        # FPT Q4 2025. A silent rescue is one nobody can audit; this line is how
        # an operator sees the fire rate without a harness. The no-rescue path
        # stays silent so the signal-to-noise stays useful.
        paddle_text, paddle_conf = self._paddle.recognize_text(image_or_region)
        winner = "paddleocr" if paddle_conf >= tesseract_conf else "tesseract"
        logger.info(
            "AutoFallbackOcrBackend: RESCUE FIRED — Tesseract confidence %.3f < "
            "threshold %.3f; PaddleOCR returned %.3f (%d chars vs %d); "
            "keeping %s result",
            tesseract_conf,
            self._threshold,
            paddle_conf,
            len(paddle_text),
            len(tesseract_text),
            winner,
        )

        # Keep the result with the higher confidence score. Both sides are
        # recall-adjusted on the same ink basis, so this comparison is between
        # like quantities — see the module's "Recall-aware confidence" block.
        if paddle_conf >= tesseract_conf:
            return (paddle_text, paddle_conf)
        return (tesseract_text, tesseract_conf)


# ---------------------------------------------------------------------------
# Selector factory — reads OCR_TEXT_BACKEND env var
# ---------------------------------------------------------------------------

_VALID_BACKENDS = frozenset({"tesseract-vie", "paddleocr", "auto"})
_DEFAULT_BACKEND = "tesseract-vie"


def select_ocr_backend(paddle_table: Optional[Any] = None) -> Any:
    """
    Factory: read OCR_TEXT_BACKEND env var and return the appropriate OcrBackendPort.

    Args:
        paddle_table: Pre-loaded PaddleOCR instance (from _pek_models_cache).
                      Required by PaddleOcrBackend and AutoFallbackOcrBackend.
                      Pass None if PaddleOCR failed to load — backends degrade gracefully.

    Returns:
        One of: TesseractVieBackend | PaddleOcrBackend | AutoFallbackOcrBackend.
        All implement OcrBackendPort.recognize_text(image_or_region) -> (text, float).

    Env var:
        OCR_TEXT_BACKEND ∈ {tesseract-vie, paddleocr, auto}
        Default (when unset or invalid): "tesseract-vie".
        Unknown values: logged as warning, fallback to "tesseract-vie".

    Backend rationale:
        "tesseract-vie" (default): Vietnamese BCTC is the primary corpus.
            Tesseract vie+eng --psm 6 is the proven path (ocr_adapter.py).
        "paddleocr": use when PDF fonts confuse Tesseract.
        "auto": best-of-both; slight overhead from potentially running both.
    """
    raw = os.environ.get("OCR_TEXT_BACKEND", _DEFAULT_BACKEND).strip().lower()

    if raw not in _VALID_BACKENDS:
        logger.warning(
            "select_ocr_backend: unknown OCR_TEXT_BACKEND=%r — "
            "falling back to default '%s'",
            raw,
            _DEFAULT_BACKEND,
        )
        raw = _DEFAULT_BACKEND

    logger.info("select_ocr_backend: OCR_TEXT_BACKEND=%r → backend class selected", raw)

    if raw == "paddleocr":
        backend: Any = PaddleOcrBackend(paddle_table=paddle_table)
        logger.info("select_ocr_backend: PaddleOcrBackend selected (explicit)")
        return backend

    if raw == "auto":
        tesseract_be = TesseractVieBackend()
        paddle_be = PaddleOcrBackend(paddle_table=paddle_table)
        backend = AutoFallbackOcrBackend(
            tesseract_backend=tesseract_be,
            paddle_backend=paddle_be,
        )
        logger.info(
            "select_ocr_backend: AutoFallbackOcrBackend selected "
            "(threshold=%.2f)",
            AUTO_FALLBACK_CONFIDENCE_THRESHOLD,
        )
        return backend

    # Default: "tesseract-vie"
    backend = TesseractVieBackend()
    logger.info("select_ocr_backend: TesseractVieBackend selected (default)")
    return backend
