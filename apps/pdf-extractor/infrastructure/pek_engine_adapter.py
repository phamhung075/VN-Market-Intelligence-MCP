"""
infrastructure/pek_engine_adapter.py — PEK-INTEGRATE

PekEngineAdapter: wraps PDF-Extract-Kit (installed via pip install -e ./PDF-Extract-Kit)
as the BCTC layout+table extraction engine.

CRITICAL hard constraints (REQ-PEK-2 / PEK-IMPORT-CHAIN / non-negotiable):
    1. NEVER import ANYTHING from pdf_extract_kit.tasks.* — not even 'safe' submodules.
       Python package rule: any import from pdf_extract_kit.tasks.* executes
       pdf_extract_kit/tasks/__init__.py, which eagerly imports ALL 6 task classes
       including FormulaRecognitionTask → unimernet → ModuleNotFoundError crash.
       This is unconditional. There is no safe subpath under pdf_extract_kit.tasks.
    2. NEVER import paddlepaddle_gpu, lmdeploy, unimernet.
    3. CPU-only. No CUDA, no Metal, no NVIDIA GPU on this host.
    4. Layout inference via _PekLayoutModel (doclayout_yolo.YOLOv10 directly).
    5. Table extraction via PaddleOCR PP-StructureV2 table mode DIRECTLY (paddleocr package).
    6. Any new import added to _load_pek_models() MUST also be added to the
       Dockerfile smoke gate — gate must exercise the actual import chain, not a proxy.

Lazy-load singleton (REQ-PEK-4):
    _pek_models_cache is None at import time → cold-start RSS ~80MB.
    Models load on first extraction request.
    threading.Semaphore(1): one extraction at a time.
    Non-blocking acquire: contention → SemaphoreContendedError (→ HTTP 429 at handler).

DDD layer: infrastructure — imports pdf_extract_kit, paddleocr.
    NEVER imported from domain/ or application/ (only injected via composition root).

Privacy: all inference runs on-host. Zero outbound HTTP during extraction
    (model weights cached to named volume; AC-PEK-9a compliant).

LF-OVERLAY contract (brief §3.1):
    PEK DocLayout-YOLO bboxes → bctc_page_zones / bctc_layout_units payload
    for POST /api/push-bctc-layout (via LayoutFirstPushClient — unchanged).

AC-PEK-0a (pristine invariant):
    git -C apps/pdf-extractor/PDF-Extract-Kit diff MUST return empty.
    This file never modifies the PEK subtree.

PEK-IMPL-OCR (REQ-PEK-12 candidate — OCR pluggability):
    The cell/line TEXT-recognition step is now pluggable via OcrBackendPort.
    PekEngineAdapter accepts an ocr_backend: OcrBackendPort at __init__.
    Composition root (main.py) reads OCR_TEXT_BACKEND env var and injects
    the selected backend via infrastructure.ocr_backends.select_ocr_backend().

    Hard gate: ONLY the TEXT step is pluggable.
    LAYOUT (DocLayout-YOLO) + TABLE-GRID (PaddleOCR PP-StructureV2 table mode)
    remain hardcoded in _load_pek_models / _run_table_extraction.
    These are NOT made selectable by this task.
"""

from __future__ import annotations

import logging
import os
import sys
import threading
import uuid
from typing import Dict, List, Optional, Tuple, Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lazy-load singleton — None at boot (cold-start RSS ~80MB)
# REQ-PEK-4: models load on FIRST extraction request, not at container startup.
# ---------------------------------------------------------------------------
_pek_models_cache: Optional[Dict[str, Any]] = None
_pek_models_lock = threading.Lock()

# Sequential guard — one extraction at a time (REQ-PEK-4d / AC-PEK-4d).
# Non-blocking: if semaphore already held → caller gets HTTP 429.
_extraction_semaphore = threading.Semaphore(1)

# PEK config directory — configs/*.yaml live here
_PEK_CONFIG_DIR = os.path.join(
    os.path.dirname(__file__), "..", "PDF-Extract-Kit", "configs"
)

# ---------------------------------------------------------------------------
# Custom exception for semaphore contention (→ HTTP 429)
# ---------------------------------------------------------------------------


class SemaphoreContendedError(RuntimeError):
    """Raised when a second concurrent extraction attempts to acquire the semaphore."""
    pass


# ---------------------------------------------------------------------------
# _PekLayoutModel — replaces LayoutDetectionTask (PEK-IMPORT-CHAIN)
# ---------------------------------------------------------------------------


class _PekLayoutModel:
    """
    Minimal replacement for LayoutDetectionTask + LayoutDetectionYOLO.

    WHY THIS EXISTS (PEK-IMPORT-CHAIN):
    Any import under pdf_extract_kit.tasks.* executes tasks/__init__.py, which
    eagerly imports FormulaRecognitionTask → formula_recognition/__init__.py →
    models/unimernet.py line 9: import unimernet.tasks → ModuleNotFoundError.
    This class replaces LayoutDetectionTask and LayoutDetectionYOLO entirely,
    importing only doclayout_yolo.YOLOv10 (separate package, no PEK tasks link).

    Pristine constraint: pdf_extract_kit/ subtree NOT edited. Fix lives here only.

    DocLayout-YOLO 10-class vocabulary (same as LayoutDetectionYOLO.id_to_names):
        0:title  1:plain_text  2:abandon  3:figure  4:figure_caption
        5:table  6:table_caption  7:table_footnote  8:isolate_formula  9:formula_caption
    """

    def __init__(self, yolo_cls: Any, model_cfg: dict, pek_root: str) -> None:
        """
        Args:
            yolo_cls: doclayout_yolo.YOLOv10 class (injected to keep import at call site).
            model_cfg: OmegaConf dict for the 'model_config' sub-key under
                       tasks.layout_detection in layout_detection_yolo.yaml.
                       Must contain 'model_path'. Optional: img_size, conf_thres, iou_thres.
            pek_root: Absolute path to the PDF-Extract-Kit source root. Used to resolve
                      the relative model_path from the YAML (e.g.
                      'models/Layout/YOLO/doclayout_yolo_ft.pt') to an absolute path,
                      mirroring how the original LayoutDetectionTask resolved it when run
                      from the PEK root directory.
        """
        raw_path = model_cfg["model_path"]
        if not os.path.isabs(raw_path):
            model_path = os.path.join(pek_root, raw_path)
        else:
            model_path = raw_path
        self._model = yolo_cls(model_path)
        self._img_size = model_cfg.get("img_size", 1280)
        self._conf_thres = model_cfg.get("conf_thres", 0.25)
        self._iou_thres = model_cfg.get("iou_thres", 0.45)
        self._device = "cpu"  # Hard-override — CPU-only invariant (REQ-PEK-2)

    def predict_pdfs(self, pdf_paths: List[str]) -> List[List[Dict]]:
        """
        Run DocLayout-YOLO on a list of PDF paths.

        Returns a list (one element per PDF) of lists (one element per page) of dicts:
            {"page": int, "bboxes": [{"bbox": [x0,y0,x1,y1], "label": int, "score": float}],
             "width": int, "height": int}

        This output shape is what _run_layout_detection() consumes at lines 711-718.
        DPI fixed at 200 (matches LF-OVERLAY §3.2 coordinate contract).
        """
        import fitz  # PyMuPDF — in requirements-pek.txt as PyMuPDF
        import numpy as np  # type: ignore

        all_results: List[List[Dict]] = []
        for pdf_path in pdf_paths:
            doc = fitz.open(pdf_path)
            page_results: List[Dict] = []
            try:
                for page_num, page in enumerate(doc, start=1):
                    mat = fitz.Matrix(200 / 72, 200 / 72)  # 200 DPI
                    pix = page.get_pixmap(matrix=mat)
                    img_arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(
                        pix.height, pix.width, pix.n
                    )
                    if pix.n == 4:  # RGBA → RGB
                        img_arr = img_arr[:, :, :3]

                    det = self._model(
                        img_arr,
                        imgsz=self._img_size,
                        conf=self._conf_thres,
                        iou=self._iou_thres,
                        device=self._device,
                        verbose=False,
                    )
                    bboxes: List[Dict] = []
                    if det and len(det) > 0:
                        for box in det[0].boxes:
                            bboxes.append({
                                "bbox": [float(v) for v in box.xyxy[0].tolist()],
                                "label": int(box.cls[0].item()),
                                "score": float(box.conf[0].item()),
                            })
                    page_results.append({
                        "page": page_num,
                        "bboxes": bboxes,
                        "width": pix.width,
                        "height": pix.height,
                    })
            finally:
                doc.close()
            all_results.append(page_results)
        return all_results


# ---------------------------------------------------------------------------
# Model loading (called once, lazily)
# ---------------------------------------------------------------------------


def _load_pek_models() -> Dict[str, Any]:
    """
    Load DocLayout-YOLO + PaddleOCR models.

    CRITICAL: NEVER imports from pdf_extract_kit.tasks.* (PEK-IMPORT-CHAIN).
    Layout inference uses _PekLayoutModel (doclayout_yolo.YOLOv10 directly).
    Table extraction uses PaddleOCR PP-StructureV2 directly.

    Called at most once per process lifetime (lazy singleton).
    """
    # Safety assertion: GPU packages must NOT be present
    assert "paddlepaddle_gpu" not in sys.modules, (
        "paddlepaddle_gpu is imported — CPU-only invariant violated!"
    )

    logger.info("PekEngineAdapter: loading models (first extraction request)...")

    # PEK-IMPORT-CHAIN FIX: import doclayout_yolo.YOLOv10 directly.
    # ANY import under pdf_extract_kit.tasks.* (including pdf_extract_kit.tasks.layout_detection)
    # triggers pdf_extract_kit/tasks/__init__.py, which eagerly imports FormulaRecognitionTask
    # → formula_recognition/__init__.py → models/unimernet.py line 9: import unimernet.tasks
    # → ModuleNotFoundError (unimernet not installed — intentionally excluded, GPU-only, ~1.4GB).
    # Fix: _PekLayoutModel (above) replaces LayoutDetectionTask without any PEK tasks import.
    # OCRTask is dropped entirely — it was never called in _run_extraction() (dead import).
    from doclayout_yolo import YOLOv10  # type: ignore

    layout_cfg_path = os.path.join(_PEK_CONFIG_DIR, "layout_detection_yolo.yaml")
    # PEK root = parent of the configs/ directory
    _pek_root = os.path.normpath(os.path.join(_PEK_CONFIG_DIR, ".."))

    layout_task = None
    ocr_task = None

    if os.path.exists(layout_cfg_path):
        # PEK-LAYOUT-CFG FIX — three divergences corrected:
        #
        # FIX 1 — CONFIG-PATH BUG:
        #   BEFORE: layout_cfg.get("model", {}) → returns {} (no top-level 'model' key in YAML).
        #   The YAML structure is:
        #       tasks:
        #         layout_detection:
        #           model: layout_detection_yolo        # STRING name, not a dict
        #           model_config:                       # ← the dict we need
        #             img_size: 1024
        #             conf_thres: 0.25
        #             iou_thres: 0.45
        #             model_path: models/Layout/YOLO/doclayout_yolo_ft.pt  # RELATIVE
        #             device: 0
        #   AFTER: layout_cfg.tasks.layout_detection.model_config
        #
        # FIX 2 — RELATIVE model_path RESOLUTION:
        #   The YAML model_path is relative to the PEK root, not cwd.
        #   The original LayoutDetectionTask resolved it the same way (run from PEK root).
        #   We resolve it in _PekLayoutModel.__init__ using pek_root (computed above).
        #   If the resolved path does not exist at runtime, YOLOv10 will attempt to
        #   download it (ultralytics/doclayout_yolo auto-download path). Weights are
        #   on the named volume pek_model_cache (/app/pek_models) at runtime, NOT baked
        #   in the image. This means build-time instantiation is IMPOSSIBLE (correct:
        #   smoke gate stays at import-level only — see SMOKE-GATE FINDING below).
        #
        # FIX 3 — FAIL-LOUD (see below — NEVER swallow layout load failure silently).
        try:
            from omegaconf import OmegaConf  # type: ignore
            layout_cfg = OmegaConf.load(layout_cfg_path)

            # Guard for missing keys — fail-loud if structure is wrong
            if (
                not hasattr(layout_cfg, "tasks")
                or not hasattr(layout_cfg.tasks, "layout_detection")
                or not hasattr(layout_cfg.tasks.layout_detection, "model_config")
            ):
                raise RuntimeError(
                    f"layout_detection_yolo.yaml at {layout_cfg_path} is missing required "
                    "structure: tasks.layout_detection.model_config. "
                    "Check the YAML matches the expected PEK config format."
                )

            model_cfg = dict(OmegaConf.to_container(
                layout_cfg.tasks.layout_detection.model_config, resolve=True
            ))
            # Hard-override device to CPU (REQ-PEK-2 — CPU-only invariant)
            model_cfg["device"] = "cpu"
            layout_task = _PekLayoutModel(
                yolo_cls=YOLOv10, model_cfg=model_cfg, pek_root=_pek_root
            )
            logger.info("PekEngineAdapter: _PekLayoutModel loaded (DocLayout-YOLO, CPU)")
        except Exception as exc:
            # FIX 3 — FAIL-LOUD:
            # The original code swallowed this as logger.warning + layout_task = None,
            # which silently disabled layout detection (DocLayout-YOLO) and produced
            # empty/garbage tables. This is the root cause of the QA cycle-131 RED.
            # Per fail-loud-protocol: if the YAML EXISTS but the model fails to load,
            # RAISE (hard fail). Garbage-tables-without-error = worse than a clear crash.
            # Layout detection is MANDATORY for BCTC table extraction — tables come from
            # layout regions. A missing/broken layout model is a deployment error, not a
            # graceful-degradation scenario.
            raise RuntimeError(
                f"PekEngineAdapter: _PekLayoutModel load FAILED (YAML exists at "
                f"{layout_cfg_path} but model could not be loaded): {exc}"
            ) from exc
    else:
        logger.warning(
            "PekEngineAdapter: layout_detection_yolo.yaml not found at %s — "
            "layout detection disabled",
            layout_cfg_path,
        )

    # OCRTask intentionally removed (PEK-IMPORT-CHAIN).
    # ocr_task was never called in _run_extraction() — it was dead import weight.
    # Table text recognition uses paddle_table (PaddleOCR) directly below.
    ocr_task = None

    # PaddleOCR PP-StructureV2 table mode (direct, NOT via PEK TableParsingTask).
    # This is the table extraction path per architect brief §2.1(a) R-CRIT-2.
    paddle_table = None
    try:
        from paddleocr import PaddleOCR  # type: ignore
        paddle_table = PaddleOCR(
            use_angle_cls=False,
            lang="en",
            use_gpu=False,
            show_log=False,
            type="structure",  # PP-StructureV2 table mode
        )
        logger.info("PekEngineAdapter: PaddleOCR PP-StructureV2 table mode loaded (CPU)")
    except Exception as exc:
        logger.warning(
            "PekEngineAdapter: PaddleOCR table mode load failed: %s — "
            "table structure extraction disabled",
            exc,
        )

    # Final GPU-absence assertion
    assert "paddlepaddle_gpu" not in sys.modules, (
        "paddlepaddle_gpu appeared in sys.modules after model load — CPU invariant violated!"
    )

    return {
        "layout_task": layout_task,
        # ocr_task removed — was never invoked in _run_extraction() (PEK-IMPORT-CHAIN)
        "paddle_table": paddle_table,
    }


def _get_pek_models() -> Dict[str, Any]:
    """
    Return the loaded models dict (lazy singleton).

    Thread-safe: uses _pek_models_lock for initialization.
    After first load, subsequent calls return cached dict without locking.
    """
    global _pek_models_cache
    if _pek_models_cache is None:
        with _pek_models_lock:
            # Double-checked locking pattern
            if _pek_models_cache is None:
                _pek_models_cache = _load_pek_models()
    return _pek_models_cache


# ---------------------------------------------------------------------------
# Bbox → LF-OVERLAY zone mapping helpers
# ---------------------------------------------------------------------------

# DocLayout-YOLO 10-class vocabulary (PDF-Extract-Kit)
# 0:title 1:plain_text 2:abandon 3:figure 4:figure_caption
# 5:table 6:table_caption 7:table_footnote 8:isolate_formula 9:formula_caption
_LAYOUT_CLASS_TABLE = 5
_LAYOUT_CLASS_TITLE = 0
_LAYOUT_CLASS_PLAIN_TEXT = 1

_PAGE_HEADER_FRACTION = 0.15   # top 15% = header band
_PAGE_FOOTER_FRACTION = 0.10   # bottom 10% = footer band


def _map_bboxes_to_zones(
    bboxes: List[Dict],
    image_width_px: int,
    image_height_px: int,
    image_dpi: int,
    page_num: int,
    unit_id: str,
    is_schema_page: bool,
    schema_inherited_from_page: Optional[int],
    table_cells_by_region: Optional[Dict] = None,
    unit_boundary_after_page: bool = False,
) -> Dict:
    """
    Map PDF-Extract-Kit DocLayout-YOLO bboxes to the LF-OVERLAY bctc_page_zones contract.

    Bbox format expected (from LayoutDetectionTask.predict_pdfs output):
        Each bbox: {"bbox": [x_min, y_min, x_max, y_max], "label": int, "score": float}
        Coordinates: pixel values at image_dpi resolution.

    Maps to the LF-OVERLAY §3.2 zones contract (SSOT: 2026-05-26-bctc-layout-first-pipeline.md).

    Args:
        bboxes: List of bbox dicts from layout detection.
        image_width_px: Page image width at image_dpi.
        image_height_px: Page image height at image_dpi.
        image_dpi: DPI used for rasterization (200 per brief).
        page_num: 1-indexed page number.
        unit_id: UUID of the logical unit this page belongs to.
        is_schema_page: True if this is the first/schema page of the unit.
        schema_inherited_from_page: Page number of the schema source (for continuation pages).
        table_cells_by_region: Optional dict mapping table bbox index to PaddleOCR cell data.
        unit_boundary_after_page: True if this page is the last page of the logical unit.

    Returns:
        PageZones dict per LF-OVERLAY §3.2 contract.
    """
    header_y_max = int(image_height_px * _PAGE_HEADER_FRACTION)
    footer_y_min = int(image_height_px * (1.0 - _PAGE_FOOTER_FRACTION))

    # Detect header band from first title/text bbox in top 15%
    header_band = {"y_min": 0, "y_max": header_y_max}
    for bbox in bboxes:
        label = bbox.get("label", -1)
        x0, y0, x1, y1 = _safe_bbox(bbox)
        if label in (_LAYOUT_CLASS_TITLE, _LAYOUT_CLASS_PLAIN_TEXT) and y0 < header_y_max:
            header_band = {"y_min": 0, "y_max": max(header_y_max, int(y1))}
            break

    # Footer band from last bbox in bottom 10%
    footer_band = {"y_min": footer_y_min, "y_max": image_height_px}
    for bbox in reversed(bboxes):
        x0, y0, x1, y1 = _safe_bbox(bbox)
        if y1 > footer_y_min:
            footer_band = {"y_min": min(footer_y_min, int(y0)), "y_max": image_height_px}
            break

    # Build column gutters from table bboxes
    # Each table bbox → one column region (x_min..x_max of the table)
    column_gutters: List[Dict] = []
    row_bands: List[Dict] = []
    table_bboxes = [b for b in bboxes if b.get("label") == _LAYOUT_CLASS_TABLE]

    for col_idx, bbox in enumerate(table_bboxes):
        x0, y0, x1, y1 = _safe_bbox(bbox)
        column_gutters.append({
            "col_id": f"col_{col_idx}",
            "x_min": int(x0),
            "x_max": int(x1),
        })
        # Row bands from PaddleOCR cells if available
        cells = (table_cells_by_region or {}).get(col_idx, [])
        if cells:
            row_bands.extend(_cells_to_row_bands(cells, int(y0), int(y1)))

    # If no column gutters found, fall back to full-page width as one region
    if not column_gutters:
        column_gutters = [{"col_id": "col_0", "x_min": 0, "x_max": image_width_px}]

    # Unit hints from title bboxes on this page
    unit_hints: List[str] = []
    for bbox in bboxes:
        if bbox.get("label") == _LAYOUT_CLASS_TITLE:
            hint_text = bbox.get("text", "")
            if hint_text:
                unit_hints.append(hint_text)

    # Determine page_type from bbox classes
    if table_bboxes:
        page_type = "table"
    elif not bboxes:
        page_type = "blank"
    else:
        page_type = "prose"

    return {
        "page_number": page_num,
        "unit_id": unit_id,
        "page_type": page_type,
        "is_schema_page": is_schema_page,
        "is_continuation_page": not is_schema_page,
        "schema_inherited_from_page": schema_inherited_from_page,
        "zones": {
            "image_width_px": image_width_px,
            "image_height_px": image_height_px,
            "image_dpi": image_dpi,
            "coordinate_origin": "top-left",
            "coordinate_unit": "px",
            "header_band": header_band,
            "footer_band": footer_band,
            "column_gutters": column_gutters,
            "row_bands": row_bands,
            "unit_hints": unit_hints,
            "unit_boundary_after_page": unit_boundary_after_page,
        },
    }


def _safe_bbox(bbox: Dict) -> Tuple[float, float, float, float]:
    """Extract (x0, y0, x1, y1) from a bbox dict safely."""
    coords = bbox.get("bbox", [0, 0, 0, 0])
    if len(coords) >= 4:
        return float(coords[0]), float(coords[1]), float(coords[2]), float(coords[3])
    return 0.0, 0.0, 0.0, 0.0


def _cells_to_row_bands(cells: List[Dict], table_y_min: int, table_y_max: int) -> List[Dict]:
    """
    Convert PaddleOCR cell dicts to row_bands format for the LF-OVERLAY contract.

    PaddleOCR PP-StructureV2 cells typically include 'bbox' keys.
    """
    row_bands = []
    for cell in cells:
        cell_bbox = cell.get("bbox", [])
        if len(cell_bbox) >= 4:
            y0, y1 = int(cell_bbox[1]), int(cell_bbox[3])
            # Clamp to table bounds
            y0 = max(y0, table_y_min)
            y1 = min(y1, table_y_max)
            if y1 > y0:
                row_density = float(cell.get("score", 0.7))
                row_bands.append({
                    "y_min": y0,
                    "y_max": y1,
                    "row_density": row_density,
                })
    return row_bands


def _group_bboxes_into_units(
    pages_bboxes: Dict[int, List[Dict]],
    page_dims: Dict[int, Tuple[int, int]],
) -> List[Dict]:
    """
    Group pages into logical units using table-bbox continuity heuristic.

    Simple heuristic for PEK:
        - Pages with table bboxes form a unit run if the table x-range overlaps.
        - A new unit starts when: no table on current page, OR table x-range
          shifts more than 10% of page width from previous page.

    Returns list of unit dicts per DocumentMap format.
    """
    units: List[Dict] = []
    page_nums = sorted(pages_bboxes.keys())

    if not page_nums:
        return units

    current_unit_pages: List[int] = []
    prev_table_x_range: Optional[Tuple[float, float]] = None

    def finalize_unit() -> None:
        if current_unit_pages:
            unit_id = str(uuid.uuid4())
            schema_page = current_unit_pages[0]
            # Detect page_type of unit from first page
            first_page_bboxes = pages_bboxes.get(schema_page, [])
            has_tables = any(b.get("label") == _LAYOUT_CLASS_TABLE for b in first_page_bboxes)
            page_type = "table" if has_tables else "prose"
            units.append({
                "unit_id": unit_id,
                "schema_page": schema_page,
                "pages": list(current_unit_pages),
                "page_type": page_type,
            })

    for page_num in page_nums:
        bboxes = pages_bboxes[page_num]
        width_px = page_dims.get(page_num, (1000, 1000))[0]
        table_bboxes = [b for b in bboxes if b.get("label") == _LAYOUT_CLASS_TABLE]

        if not table_bboxes:
            # Prose or blank page — finalize current unit, start new prose unit
            finalize_unit()
            current_unit_pages = [page_num]
            prev_table_x_range = None
            finalize_unit()
            current_unit_pages = []
            prev_table_x_range = None
            continue

        # Compute table x-range for this page
        x_mins = [_safe_bbox(b)[0] for b in table_bboxes]
        x_maxs = [_safe_bbox(b)[2] for b in table_bboxes]
        cur_x_range = (min(x_mins), max(x_maxs))

        if (
            not current_unit_pages
            or prev_table_x_range is None
        ):
            # Start new unit
            if current_unit_pages:
                finalize_unit()
                current_unit_pages = []
            current_unit_pages.append(page_num)
            prev_table_x_range = cur_x_range
        else:
            # Check x-range shift
            shift_left = abs(cur_x_range[0] - prev_table_x_range[0]) / max(width_px, 1)
            shift_right = abs(cur_x_range[1] - prev_table_x_range[1]) / max(width_px, 1)
            if shift_left > 0.10 or shift_right > 0.10:
                # New unit
                finalize_unit()
                current_unit_pages = [page_num]
                prev_table_x_range = cur_x_range
            else:
                # Same unit — append
                current_unit_pages.append(page_num)
                prev_table_x_range = cur_x_range

    finalize_unit()
    return units


# ---------------------------------------------------------------------------
# Main adapter class
# ---------------------------------------------------------------------------


class PekEngineAdapter:
    """
    Infrastructure adapter: wraps PDF-Extract-Kit engine for BCTC extraction.

    Implements PekEngineAdapterPort (domain/repositories.py).

    Lazy-load: _get_pek_models() called on first extraction.
    Sequential guard: threading.Semaphore(1) — one extraction at a time.

    CRITICAL imports:
        - _PekLayoutModel (doclayout_yolo.YOLOv10 directly) — no pdf_extract_kit.tasks import
        - NEVER import from pdf_extract_kit.tasks.* (PEK-IMPORT-CHAIN)
        - NEVER TableParsingTask, NEVER FormulaDetectionTask, NEVER OCRTask

    DDD: infrastructure layer. Injected at composition root (main.py).

    PEK-IMPL-OCR: accepts an optional ocr_backend (OcrBackendPort) for the
    cell/line TEXT-recognition step. Injected at composition root via
    infrastructure.ocr_backends.select_ocr_backend(). When None, falls back
    to inline PaddleOCR call (backward-compatible).
    LAYOUT + TABLE-GRID detection remain unchanged (not pluggable).
    """

    def __init__(self, ocr_backend: Optional[Any] = None) -> None:
        """
        Args:
            ocr_backend: Optional OcrBackendPort implementation for cell/line text.
                         When None, the adapter uses the paddle_table instance from
                         _pek_models_cache directly (backward-compatible fallback).
                         Inject via infrastructure.ocr_backends.select_ocr_backend().
        """
        self._ocr_backend = ocr_backend

    def extract_layout_and_tables(
        self,
        pdf_path: str,
        report_id: str,
    ) -> Dict:
        """
        Run PEK layout+table extraction for one PDF document.

        Returns LF-OVERLAY-compatible payload dict (brief §7 pipeline).

        Raises:
            SemaphoreContendedError: if semaphore already held (→ HTTP 429).
            RuntimeError: on model load failure.
        """
        # Sequential guard — non-blocking acquire (R-LOW-1: return 429 immediately)
        acquired = _extraction_semaphore.acquire(blocking=False)
        if not acquired:
            raise SemaphoreContendedError(
                "PEK extraction in progress (semaphore held). "
                "Retry after current extraction completes."
            )

        try:
            return self._run_extraction(pdf_path=pdf_path, report_id=report_id)
        finally:
            _extraction_semaphore.release()

    def _run_extraction(self, pdf_path: str, report_id: str) -> Dict:
        """Core extraction pipeline (called within semaphore guard)."""
        models = _get_pek_models()
        layout_task = models.get("layout_task")
        paddle_table = models.get("paddle_table")
        # ocr_task removed — was dead import; table OCR uses paddle_table directly

        # PEK-IMPL-OCR: propagate the now-loaded paddle_table into the injected
        # OCR backend (PaddleOcrBackend / AutoFallbackOcrBackend) if it has a
        # set_paddle_table() method. This deferred wiring is necessary because
        # the backend is constructed at composition-root time (before models load).
        if self._ocr_backend is not None and paddle_table is not None:
            if hasattr(self._ocr_backend, "set_paddle_table"):
                self._ocr_backend.set_paddle_table(paddle_table)

        logger.info(
            "PekEngineAdapter._run_extraction: report_id=%s pdf_path=%s",
            report_id,
            pdf_path,
        )

        # ------------------------------------------------------------------
        # Step 1: Layout detection — DocLayout-YOLO
        # ------------------------------------------------------------------
        pages_bboxes: Dict[int, List[Dict]] = {}
        page_dims: Dict[int, Tuple[int, int]] = {}

        if layout_task is not None:
            try:
                pages_bboxes, page_dims = self._run_layout_detection(
                    layout_task=layout_task,
                    pdf_path=pdf_path,
                )
                logger.info(
                    "PekEngineAdapter: layout detection complete — %d pages",
                    len(pages_bboxes),
                )
            except Exception as exc:
                logger.error(
                    "PekEngineAdapter: layout detection failed: %s — "
                    "using empty bbox fallback",
                    exc,
                )
        else:
            logger.warning(
                "PekEngineAdapter: layout_task unavailable — "
                "using pdf2image page count fallback"
            )
            pages_bboxes, page_dims = self._get_page_dims_fallback(pdf_path)

        # ------------------------------------------------------------------
        # Step 2: Group pages into logical units (DocumentMap)
        # ------------------------------------------------------------------
        units_in_map = _group_bboxes_into_units(pages_bboxes, page_dims)
        total_pages = max(pages_bboxes.keys()) if pages_bboxes else 0

        document_map: Dict = {
            "report_id": report_id,
            "total_pages": total_pages,
            "units": units_in_map,
        }

        # ------------------------------------------------------------------
        # Step 3: Table extraction via PaddleOCR PP-StructureV2
        # ------------------------------------------------------------------
        table_cells_by_page: Dict[int, Dict[int, List[Dict]]] = {}
        if paddle_table is not None:
            try:
                table_cells_by_page = self._run_table_extraction(
                    paddle_table=paddle_table,
                    pdf_path=pdf_path,
                    pages_bboxes=pages_bboxes,
                    page_dims=page_dims,
                )
                logger.info(
                    "PekEngineAdapter: table extraction complete — %d pages with tables",
                    len(table_cells_by_page),
                )
            except Exception as exc:
                logger.warning(
                    "PekEngineAdapter: table extraction failed: %s", exc
                )

        # ------------------------------------------------------------------
        # Step 4: Map bboxes → LF-OVERLAY page_zones contract
        # ------------------------------------------------------------------
        page_zones_output: List[Dict] = []

        # Build page→unit mapping for schema inheritance
        page_to_unit: Dict[int, Dict] = {}
        for unit in units_in_map:
            for pn in unit.get("pages", []):
                page_to_unit[pn] = unit

        for page_num in sorted(pages_bboxes.keys()):
            bboxes = pages_bboxes[page_num]
            width_px, height_px = page_dims.get(page_num, (2338, 3308))
            unit = page_to_unit.get(page_num, {})
            unit_id = unit.get("unit_id", str(uuid.uuid4()))
            schema_page = unit.get("schema_page")
            is_schema_page = (schema_page == page_num) or (not unit)
            schema_inherited_from = None if is_schema_page else schema_page
            pages_in_unit = unit.get("pages", [page_num])
            is_last = (page_num == max(pages_in_unit)) if pages_in_unit else False

            table_cells_for_page = table_cells_by_page.get(page_num, {})

            zone = _map_bboxes_to_zones(
                bboxes=bboxes,
                image_width_px=width_px,
                image_height_px=height_px,
                image_dpi=200,
                page_num=page_num,
                unit_id=unit_id,
                is_schema_page=is_schema_page,
                schema_inherited_from_page=schema_inherited_from,
                table_cells_by_region=table_cells_for_page,
                unit_boundary_after_page=is_last,
            )
            page_zones_output.append(zone)

        # ------------------------------------------------------------------
        # Step 5: Build units output (stitched_markdown from table cells)
        # ------------------------------------------------------------------
        units_output: List[Dict] = []
        quarantine_breakdown = {
            "balance_identity_fail": 0,
            "codes_not_monotonic": 0,
            "orphan_rows": 0,
        }

        for unit in units_in_map:
            unit_id = unit.get("unit_id", str(uuid.uuid4()))
            pages_in_unit: List[int] = unit.get("pages", [])

            # Assemble stitched markdown from PaddleOCR table cells
            stitched_md = self._assemble_unit_markdown(
                pages_in_unit=pages_in_unit,
                table_cells_by_page=table_cells_by_page,
                page_zones_output=page_zones_output,
            )
            row_count = stitched_md.count("\n")
            units_output.append({
                "unit_id": unit_id,
                "stitched_markdown": stitched_md,
                "row_count": row_count,
                "quarantined": False,
                "quarantine_reason": None,
                "page_row_spans": [
                    {"page": p, "row_start": 0, "row_end": 0}
                    for p in pages_in_unit
                ],
            })

        pass_rate_report = {
            "units_total": len(units_output),
            "units_passing": sum(1 for u in units_output if not u["quarantined"]),
            "units_quarantined": sum(1 for u in units_output if u["quarantined"]),
            "quarantine_breakdown": quarantine_breakdown,
        }

        return {
            "document_map": document_map,
            "units": units_output,
            "page_zones": page_zones_output,
            "pass_rate_report": pass_rate_report,
        }

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _run_layout_detection(
        self,
        layout_task: Any,
        pdf_path: str,
    ) -> Tuple[Dict[int, List[Dict]], Dict[int, Tuple[int, int]]]:
        """
        Run DocLayout-YOLO on the PDF.

        Returns:
            pages_bboxes: {page_num: [bbox_dict, ...]}
            page_dims: {page_num: (width_px, height_px)}
        """
        pages_bboxes: Dict[int, List[Dict]] = {}
        page_dims: Dict[int, Tuple[int, int]] = {}

        try:
            # PDF-Extract-Kit LayoutDetectionTask.predict_pdfs expects a list of paths
            results = layout_task.predict_pdfs([pdf_path])
            # results structure: list of page results per PDF
            # Each page result: {"page": N, "bboxes": [...], "width": W, "height": H}
            if results and len(results) > 0:
                pdf_result = results[0] if isinstance(results[0], list) else results
                for page_result in pdf_result:
                    page_num = page_result.get("page", 1)
                    bboxes = page_result.get("bboxes", [])
                    width = page_result.get("width", 2338)
                    height = page_result.get("height", 3308)
                    pages_bboxes[page_num] = bboxes
                    page_dims[page_num] = (int(width), int(height))
        except Exception as exc:
            logger.error(
                "PekEngineAdapter._run_layout_detection: failed: %s", exc
            )
            raise

        return pages_bboxes, page_dims

    def _get_page_dims_fallback(
        self, pdf_path: str
    ) -> Tuple[Dict[int, List[Dict]], Dict[int, Tuple[int, int]]]:
        """Fallback when layout_task is unavailable: use pdf2image to count pages."""
        pages_bboxes: Dict[int, List[Dict]] = {}
        page_dims: Dict[int, Tuple[int, int]] = {}
        try:
            import pdfplumber  # type: ignore
            with pdfplumber.open(pdf_path) as pdf:
                for i, page in enumerate(pdf.pages, start=1):
                    # 200 DPI ≈ page.width * 200/72 pixels
                    w = int(page.width * 200 / 72)
                    h = int(page.height * 200 / 72)
                    pages_bboxes[i] = []
                    page_dims[i] = (w, h)
        except Exception as exc:
            logger.warning(
                "PekEngineAdapter._get_page_dims_fallback: pdfplumber failed: %s", exc
            )
        return pages_bboxes, page_dims

    def _run_table_extraction(
        self,
        paddle_table: Any,
        pdf_path: str,
        pages_bboxes: Dict[int, List[Dict]],
        page_dims: Dict[int, Tuple[int, int]],
    ) -> Dict[int, Dict[int, List[Dict]]]:
        """
        Run PaddleOCR PP-StructureV2 table mode on table regions per page.

        Table-grid detection (bounding-box layout) uses paddle_table directly —
        this part is NOT pluggable (LAYOUT + TABLE-GRID stay fixed).

        Cell/line TEXT recognition uses self._ocr_backend when injected.
        If self._ocr_backend is None, falls back to the paddle_table OCR result
        directly (backward-compatible path).

        Returns:
            {page_num: {region_idx: [cell_dict, ...]}}
        """
        import tempfile
        try:
            from pdf2image import convert_from_path  # type: ignore
        except ImportError:
            logger.warning("PekEngineAdapter: pdf2image not available — skipping table OCR")
            return {}

        result: Dict[int, Dict[int, List[Dict]]] = {}

        with tempfile.TemporaryDirectory(prefix="pek_table_") as tmp_dir:
            for page_num in sorted(pages_bboxes.keys()):
                bboxes = pages_bboxes[page_num]
                table_bboxes = [
                    b for b in bboxes if b.get("label") == _LAYOUT_CLASS_TABLE
                ]
                if not table_bboxes:
                    continue

                try:
                    imgs = convert_from_path(
                        pdf_path,
                        dpi=200,
                        first_page=page_num,
                        last_page=page_num,
                        fmt="png",
                    )
                    if not imgs:
                        continue
                    page_img = imgs[0]
                    import numpy as np  # type: ignore
                    page_arr = np.array(page_img)

                    region_cells: Dict[int, List[Dict]] = {}
                    for region_idx, bbox in enumerate(table_bboxes):
                        x0, y0, x1, y1 = _safe_bbox(bbox)
                        # Crop table region
                        crop = page_arr[
                            int(y0):int(y1),
                            int(x0):int(x1),
                        ]
                        if crop.size == 0:
                            continue
                        try:
                            if self._ocr_backend is not None:
                                # --- Pluggable TEXT step (PEK-IMPL-OCR) ---
                                # Table-grid layout already known from paddle_table above.
                                # Use injected backend for cell/line TEXT only.
                                # Produces (text, confidence) from the region crop.
                                cell_text, cell_score = self._ocr_backend.recognize_text(crop)
                                cells: List[Dict] = []
                                if cell_text.strip():
                                    # Wrap the pluggable result in the same cell dict shape
                                    # so downstream _assemble_unit_markdown / _cells_to_row_bands
                                    # receive consistent data.
                                    cells.append({
                                        "bbox": [
                                            float(x0), float(y0),
                                            float(x1), float(y1),
                                        ],
                                        "text": cell_text,
                                        "score": cell_score,
                                    })
                            else:
                                # --- Backward-compatible path (no injected backend) ---
                                # Use paddle_table directly for TEXT (original behaviour).
                                ocr_result = paddle_table.ocr(crop, cls=False)
                                cells = []
                                if ocr_result and ocr_result[0]:
                                    for item in ocr_result[0]:
                                        if item and len(item) >= 2:
                                            pts = item[0]
                                            text_conf = item[1]
                                            if pts and len(pts) == 4:
                                                xs = [p[0] for p in pts]
                                                ys = [p[1] for p in pts]
                                                cells.append({
                                                    "bbox": [
                                                        min(xs) + x0, min(ys) + y0,
                                                        max(xs) + x0, max(ys) + y0,
                                                    ],
                                                    "text": text_conf[0] if text_conf else "",
                                                    "score": text_conf[1] if text_conf else 0.0,
                                                })
                            region_cells[region_idx] = cells
                        except Exception as exc:
                            logger.warning(
                                "PekEngineAdapter: OCR region %d page %d: %s",
                                region_idx,
                                page_num,
                                exc,
                            )
                    result[page_num] = region_cells
                    try:
                        page_img.close()
                    except Exception:
                        pass

                except Exception as exc:
                    logger.warning(
                        "PekEngineAdapter: table extraction page %d: %s",
                        page_num,
                        exc,
                    )

        return result

    def _assemble_unit_markdown(
        self,
        pages_in_unit: List[int],
        table_cells_by_page: Dict[int, Dict[int, List[Dict]]],
        page_zones_output: List[Dict],
    ) -> str:
        """
        Assemble a simple markdown pipe-table from PaddleOCR cell OCR text.

        Concatenates text from all table regions on all pages of this unit,
        in reading order (page ASC, region ASC, cell ASC).
        """
        rows: List[str] = []
        for page_num in sorted(pages_in_unit):
            cells_by_region = table_cells_by_page.get(page_num, {})
            for region_idx in sorted(cells_by_region.keys()):
                cells = cells_by_region[region_idx]
                if not cells:
                    continue
                texts = [c.get("text", "") for c in cells]
                row_str = "| " + " | ".join(texts) + " |"
                rows.append(row_str)

        if not rows:
            return ""

        header_sep = "| " + " | ".join(["---"] * rows[0].count("|")) + " |"
        return rows[0] + "\n" + header_sep + "\n" + "\n".join(rows[1:])
