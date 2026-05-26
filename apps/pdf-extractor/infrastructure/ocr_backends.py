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
# TesseractVieBackend — default backend for Vietnamese BCTC
# ---------------------------------------------------------------------------


class TesseractVieBackend:
    """
    OcrBackendPort adapter: pytesseract (vie+eng, --psm 6).

    Reuses the same Tesseract configuration as infrastructure/ocr_adapter.py:
        - lang="vie+eng"
        - config="--psm 6"  (single uniform block — line-by-line BCTC layout)

    DO NOT remove config="--psm 6": Tesseract default (psm 3) triggers column
    segmentation → scrambled BCTC output (drift #4, documented in ocr_adapter.py).

    Accepts numpy ndarray (uint8, H×W×C BGR/RGB) or PIL.Image.Image.
    Returns ("", 0.0) on None input or any exception.
    """

    def recognize_text(self, image_or_region: Any) -> Tuple[str, float]:
        """
        Run Tesseract vie+eng --psm 6 on a single image region.

        Returns:
            (text, confidence) — confidence estimated from character-level scores
            via pytesseract.image_to_data(). Returns ("", 0.0) on failure.
        """
        if image_or_region is None:
            return ("", 0.0)

        try:
            import pytesseract  # type: ignore
            import pandas as pd  # type: ignore
        except ImportError as exc:
            logger.warning(
                "TesseractVieBackend: pytesseract/pandas not installed: %s — "
                "returning empty text",
                exc,
            )
            return ("", 0.0)

        try:
            # Convert numpy array to PIL.Image if needed
            pil_image = _to_pil(image_or_region)
            if pil_image is None:
                return ("", 0.0)

            # Use image_to_data to get per-word confidence scores
            data = pytesseract.image_to_data(
                pil_image,
                lang="vie+eng",
                config="--psm 6",
                output_type=pytesseract.Output.DATAFRAME,
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

            return (text.strip(), max(0.0, min(1.0, mean_conf)))

        except Exception as exc:
            logger.warning(
                "TesseractVieBackend.recognize_text: error: %s — returning empty",
                exc,
            )
            return ("", 0.0)


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
            confidence = mean of per-word scores from ocr_result[0].
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
                except Exception:
                    return ("", 0.0)
            else:
                image_arr = image_or_region

            if image_arr.size == 0:
                return ("", 0.0)

            # PaddleOCR inference — same call as pek_engine_adapter._run_table_extraction
            ocr_result = self._paddle_table.ocr(image_arr, cls=False)

            texts: list[str] = []
            scores: list[float] = []

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

            if not texts:
                return ("", 0.0)

            combined_text = " ".join(texts)
            mean_confidence = sum(scores) / len(scores) if scores else 0.0
            return (combined_text.strip(), max(0.0, min(1.0, mean_confidence)))

        except Exception as exc:
            logger.warning(
                "PaddleOcrBackend.recognize_text: error: %s — returning empty",
                exc,
            )
            return ("", 0.0)


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

        # Low Tesseract confidence — retry with PaddleOCR
        logger.debug(
            "AutoFallbackOcrBackend: Tesseract confidence %.3f < threshold %.3f — "
            "retrying with PaddleOCR",
            tesseract_conf,
            self._threshold,
        )
        paddle_text, paddle_conf = self._paddle.recognize_text(image_or_region)

        # Keep the result with the higher confidence score
        if paddle_conf >= tesseract_conf:
            logger.debug(
                "AutoFallbackOcrBackend: PaddleOCR (%.3f) >= Tesseract (%.3f) — "
                "using PaddleOCR result",
                paddle_conf,
                tesseract_conf,
            )
            return (paddle_text, paddle_conf)
        else:
            logger.debug(
                "AutoFallbackOcrBackend: Tesseract (%.3f) > PaddleOCR (%.3f) — "
                "keeping Tesseract result",
                tesseract_conf,
                paddle_conf,
            )
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
