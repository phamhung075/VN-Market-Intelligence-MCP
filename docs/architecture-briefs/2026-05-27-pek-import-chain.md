# PEK-IMPORT-CHAIN — Root-Cause Review: `unimernet` Eager-Import Crash

**Date:** 2026-05-27
**Author:** architect
**Task:** PEK-IMPORT-CHAIN
**Zone:** apps/pdf-extractor/ (single zone)
**Escalation trigger:** Round 3 fix on pdf-extractor module — fixer ceiling hit. Architect mandatory per feedback_recurring_bug_escalation.

**Editable surfaces (OUR code only — PEK subtree FROZEN):**
- `apps/pdf-extractor/infrastructure/pek_engine_adapter.py`
- `apps/pdf-extractor/Dockerfile`

**Frozen (zero-diff required):**
- `apps/pdf-extractor/PDF-Extract-Kit/` (entire subtree — pristine invariant)
- `apps/pdf-extractor/infrastructure/text_table_extractor.py`
- `apps/pdf-extractor/sandbox/runner.py`
- `docs/data/pilot-status-pdf-extractor.json`

---

## 1. Traced Entry Point — Live Evidence

### 1.1 The two import lines in our code

`apps/pdf-extractor/infrastructure/pek_engine_adapter.py` lines 110–111 (inside `_load_pek_models()`):

```python
from pdf_extract_kit.tasks.layout_detection import LayoutDetectionTask  # type: ignore
from pdf_extract_kit.tasks.ocr import OCRTask  # type: ignore
```

These are the only places in OUR codebase that reference `pdf_extract_kit.tasks` at all. Confirmed by exhaustive grep across all `.py` files under `apps/pdf-extractor/` excluding the pristine subtree. The only other references in `domain/repositories.py` are comments — not executable imports.

### 1.2 Python package init execution chain — verified live

Python's import system rule: importing `pkg.sub.child.module` ALWAYS executes every `__init__.py` in the ancestry chain — `pkg/__init__.py`, then `pkg/sub/__init__.py`, then `pkg/sub/child/__init__.py` — before the target module. This was verified live with a test harness (`/tmp/pek_import_test`): a `tasks/__init__.py` that raises immediately IS triggered by `from mypkg.tasks.layout_detection.task import X` — the leaf module import does not skip the parent.

Therefore `from pdf_extract_kit.tasks.layout_detection import LayoutDetectionTask` (or any variant importing from `pdf_extract_kit.tasks.*`) triggers this exact chain:

```
1. pdf_extract_kit/__init__.py              — benign
2. pdf_extract_kit/tasks/__init__.py        — THE DETONATOR (all 6 tasks imported eagerly)
   line 2: from pdf_extract_kit.tasks.formula_detection.task import FormulaDetectionTask
   line 3: from pdf_extract_kit.tasks.formula_recognition.task import FormulaRecognitionTask
   line 4: from pdf_extract_kit.tasks.layout_detection.task import LayoutDetectionTask
   line 5: from pdf_extract_kit.tasks.ocr.task import OCRTask
   line 6: from pdf_extract_kit.tasks.table_parsing.task import TableParsingTask
3. pdf_extract_kit/tasks/formula_recognition/__init__.py
   line 1: from pdf_extract_kit.tasks.formula_recognition.models.unimernet import FormulaRecognitionUniMERNet
4. pdf_extract_kit/tasks/formula_recognition/models/unimernet.py
   line 9: import unimernet.tasks        — ModuleNotFoundError: No module named 'unimernet'
```

The crash fires at step 4, before Python ever reaches step 2 line 4 (LayoutDetectionTask) or any body of `_load_pek_models()`. Zero model weights load. Zero rows are produced.

**There is no way to import any symbol from `pdf_extract_kit.tasks.*` without triggering steps 1–4.** The only fix is to import zero symbols from that package namespace.

### 1.3 Does the adapter actually need PEK task wrappers?

No. The adapter's runtime usage is:

- `LayoutDetectionTask(layout_cfg)` stores a `LayoutDetectionYOLO` instance under `self.model`. Its only runtime method called by the adapter is `layout_task.predict_pdfs([pdf_path])`, which delegates entirely to `self.model.predict(...)` on a `doclayout_yolo.YOLOv10` instance. The wrapper adds zero behaviour not replicable from `YOLOv10` directly.

- `OCRTask(ocr_cfg)` is stored in the models dict (`"ocr_task": ocr_task`) but is NEVER invoked in `_run_extraction()`. Lines 520–523 of the adapter retrieve `layout_task`, `ocr_task`, and `paddle_table` from the cache, but `ocr_task` is never called anywhere in the execution path. It is dead weight.

- `PaddleOCR` is already imported and instantiated DIRECTLY in `_load_pek_models()` lines 159–173, with no PEK wrapper involvement. This path is correct and does not touch `pdf_extract_kit.tasks`.

**Conclusion:** The adapter does not need `LayoutDetectionTask` or `OCRTask` for their behaviour. It needs `doclayout_yolo.YOLOv10` (for layout inference) and `paddleocr.PaddleOCR` (for table OCR). Both are importable as independent packages with zero `pdf_extract_kit.tasks` involvement.

---

## 2. Fix Selection

### Option A — REJECTED: `pip install unimernet`

`unimernet` is a GPU-oriented formula-recognition transformer (~1.4GB model weights, CUDA inference design). This project operates CPU-only within the 8GB fleet cap. Installing `unimernet` to satisfy a module-level eager import would:

1. Add ~1.4GB to image size (violates REQ-PEK-2/8GB cap).
2. Introduce GPU-oriented inference code that will fail at runtime on this CPU-only host whenever `FormulaRecognitionTask` is actually instantiated.
3. Include 1.4GB of formula-recognition infrastructure that REQ-PEK-1 explicitly excludes from the trimmed task set.

Installing a GPU package to satisfy an import guard is not a fix — it moves the crash from import-time to instantiation-time while wasting budget. **REJECTED.**

### Option C — FALLBACK: stub `unimernet` package

A stub package (empty `unimernet/` with `tasks.py` that exports nothing) placed under `apps/pdf-extractor/vendor/unimernet/` and prepended to `PYTHONPATH` would satisfy the eager import without the real package. This is technically feasible without touching the PEK subtree.

**Why it is a fallback:** It papiermaché-patches the symptom. If PEK's `tasks/__init__.py` acquires additional GPU-only dependencies in a future version, the stub pattern breaks again. Option B eliminates the root cause completely. **Accept only if Option B is infeasible.**

### Option B — SELECTED: bypass `pdf_extract_kit.tasks` entirely

**Basis:** The adapter does not need the task wrapper classes for any functionality. The underlying model objects (`doclayout_yolo.YOLOv10`, `paddleocr.PaddleOCR`) are importable as independent packages. `from doclayout_yolo import YOLOv10` has ZERO dependency on `pdf_extract_kit.tasks` — it is a separate PyPI package. Same for `from paddleocr import PaddleOCR` and `import fitz` (PyMuPDF).

**CPU-only + 8GB-cap compliance:** `YOLOv10` runs CPU by passing `device="cpu"` to inference. `PaddleOCR` already uses `use_gpu=False` in the adapter. No RAM increase.

**PEK-pristine compliance:** Zero lines in `PDF-Extract-Kit/` are touched.

**Implementation:** Replace the two PEK task imports with direct `YOLOv10` import. Add a `_PekLayoutModel` adapter class in OUR file that replicates `LayoutDetectionTask.predict_pdfs()` behaviour (YOLO inference via `fitz` page rasterization). Drop dead `OCRTask` entirely.

**SELECTED.**

---

## 3. Exact Edit List — OUR Code Only

All changes are in `apps/pdf-extractor/infrastructure/pek_engine_adapter.py` only (plus the Dockerfile smoke gate in §4).

### 3.1 Add `_PekLayoutModel` class (new, at module level before `_load_pek_models`)

This class replicates `LayoutDetectionTask.predict_pdfs()` + `LayoutDetectionYOLO` behaviour using only `doclayout_yolo.YOLOv10` and `fitz` (PyMuPDF — already in requirements-pek.txt). Zero PEK task imports.

```python
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

    def __init__(self, yolo_cls: Any, model_cfg: dict) -> None:
        """
        Args:
            yolo_cls: doclayout_yolo.YOLOv10 class (injected to keep import at call site).
            model_cfg: OmegaConf dict for the 'model' sub-key of layout_detection_yolo.yaml.
                       Must contain 'model_path'. Optional: img_size, conf_thres, iou_thres.
        """
        self._model = yolo_cls(model_cfg["model_path"])
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
```

### 3.2 Replace `_load_pek_models()` imports block (lines 107–111)

The current block reads:

```python
    # Import ONLY LayoutDetectionTask and OCRTask — NEVER TableParsingTask.
    # This is the critical CPU guard: TableParsingTask imports struct_eqtable.py
    # which hard-asserts torch.cuda.is_available() → immediate crash on this host.
    from pdf_extract_kit.tasks.layout_detection import LayoutDetectionTask  # type: ignore
    from pdf_extract_kit.tasks.ocr import OCRTask  # type: ignore
```

Replace the entire block (lines 107–111, including comment) with:

```python
    # PEK-IMPORT-CHAIN FIX: import doclayout_yolo.YOLOv10 directly.
    # ANY import under pdf_extract_kit.tasks.* (including pdf_extract_kit.tasks.layout_detection)
    # triggers pdf_extract_kit/tasks/__init__.py, which eagerly imports FormulaRecognitionTask
    # → formula_recognition/__init__.py → models/unimernet.py line 9: import unimernet.tasks
    # → ModuleNotFoundError (unimernet not installed — intentionally excluded, GPU-only, ~1.4GB).
    # Fix: _PekLayoutModel (above) replaces LayoutDetectionTask without any PEK tasks import.
    # OCRTask is dropped entirely — it was never called in _run_extraction() (dead import).
    from doclayout_yolo import YOLOv10  # type: ignore
```

### 3.3 Replace `LayoutDetectionTask` instantiation block (lines 119–133)

Current code:

```python
    if os.path.exists(layout_cfg_path):
        try:
            from omegaconf import OmegaConf  # type: ignore
            layout_cfg = OmegaConf.load(layout_cfg_path)
            # Override device to CPU regardless of config
            if hasattr(layout_cfg, "model"):
                OmegaConf.update(layout_cfg, "model.device", "cpu", merge=True)
            layout_task = LayoutDetectionTask(layout_cfg)
            logger.info("PekEngineAdapter: LayoutDetectionTask loaded (CPU)")
        except Exception as exc:
            logger.warning(
                "PekEngineAdapter: LayoutDetectionTask load failed: %s — "
                "falling back to geometry-only path",
                exc,
            )
```

Replace with:

```python
    if os.path.exists(layout_cfg_path):
        try:
            from omegaconf import OmegaConf  # type: ignore
            layout_cfg = OmegaConf.load(layout_cfg_path)
            model_cfg = dict(OmegaConf.to_container(
                layout_cfg.get("model", {}), resolve=True
            ))
            # Hard-override device to CPU (REQ-PEK-2 — CPU-only invariant)
            model_cfg["device"] = "cpu"
            layout_task = _PekLayoutModel(yolo_cls=YOLOv10, model_cfg=model_cfg)
            logger.info("PekEngineAdapter: _PekLayoutModel loaded (DocLayout-YOLO, CPU)")
        except Exception as exc:
            logger.warning(
                "PekEngineAdapter: _PekLayoutModel load failed: %s — "
                "falling back to geometry-only path",
                exc,
            )
```

### 3.4 Remove the entire OCRTask block (lines 141–152)

Current code (remove entirely):

```python
    if os.path.exists(ocr_cfg_path):
        try:
            from omegaconf import OmegaConf  # type: ignore
            ocr_cfg = OmegaConf.load(ocr_cfg_path)
            ocr_task = OCRTask(ocr_cfg)
            logger.info("PekEngineAdapter: OCRTask loaded (CPU)")
        except Exception as exc:
            logger.warning("PekEngineAdapter: OCRTask load failed: %s", exc)
    else:
        logger.warning(
            "PekEngineAdapter: ocr.yaml not found at %s — OCR task disabled",
            ocr_cfg_path,
        )
```

Replace with a single explanatory comment:

```python
    # OCRTask intentionally removed (PEK-IMPORT-CHAIN).
    # ocr_task was never called in _run_extraction() — it was dead import weight.
    # Table text recognition uses paddle_table (PaddleOCR) directly below.
    ocr_task = None
```

### 3.5 Remove the unused `ocr_cfg_path` variable (just above the removed block)

Remove the line:
```python
    ocr_cfg_path = os.path.join(_PEK_CONFIG_DIR, "ocr.yaml")
```

### 3.6 Update return dict in `_load_pek_models()` — remove dead `ocr_task` key

Current:
```python
    return {
        "layout_task": layout_task,
        "ocr_task": ocr_task,
        "paddle_table": paddle_table,
    }
```

Replace with:
```python
    return {
        "layout_task": layout_task,
        # ocr_task removed — was never invoked in _run_extraction() (PEK-IMPORT-CHAIN)
        "paddle_table": paddle_table,
    }
```

### 3.7 Update `_run_extraction()` — remove dead `ocr_task` reference (lines 521–523)

Current:
```python
        models = _get_pek_models()
        layout_task = models.get("layout_task")
        ocr_task = models.get("ocr_task")
        paddle_table = models.get("paddle_table")
```

Replace with:
```python
        models = _get_pek_models()
        layout_task = models.get("layout_task")
        paddle_table = models.get("paddle_table")
        # ocr_task removed — was dead import; table OCR uses paddle_table directly
```

### 3.8 Update module-level CRITICAL comment (lines 7–14)

Replace the constraint comment block with:

```python
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
```

---

## 4. Corrected Smoke Gate

### 4.1 Why the existing gate missed this crash

The gate installed by PEK-DEP-RECONCILE brief §5.2:

```python
import numpy; import cv2; from paddleocr import PaddleOCR;
from doclayout_yolo import YOLOv10; import torch
print('pek-native-imports: ALL OK')
```

This tested the numpy ABI chain (the previous crash class). It did NOT import `pek_engine_adapter` — the module whose import chain contains the bug. The gate was a PROXY for what the runtime does, not a direct exercise of what the runtime does. A passing gate at build time gave false confidence that first-extraction would succeed.

**Meta-root-cause:** The structural principle was correct (build-time gate catches runtime crashes) but the gate body was not anchored to the actual code path. The principle must be: the gate imports the exact module that is first loaded at extraction time, forcing any import error in that module to fail the build.

### 4.2 New gate body

Replace the existing smoke gate `RUN` step in `apps/pdf-extractor/Dockerfile` (the step before `EXPOSE 5001`):

```dockerfile
# PEK-IMPORT-CHAIN: corrected build-time smoke gate.
# Imports pek_engine_adapter MODULE ITSELF — not a proxy symbol set.
# If ANY import inside pek_engine_adapter.py fails (including transitive chains
# through pdf_extract_kit.tasks.* or any other package), the build fails here,
# not at first /pek-extract call.
# MANDATE: any new 'import X' added to _load_pek_models() must also appear below.
RUN python3 -c "\
import sys; \
sys.path.insert(0, '/app'); \
sys.path.insert(0, '/app/PDF-Extract-Kit'); \
print('--- PEK import chain smoke gate (PEK-IMPORT-CHAIN) ---'); \
import numpy; print('numpy', numpy.__version__); \
import cv2; print('cv2', cv2.__version__); \
import fitz; print('fitz (PyMuPDF)', fitz.__version__); \
from omegaconf import OmegaConf; print('omegaconf OK'); \
from doclayout_yolo import YOLOv10; print('doclayout_yolo.YOLOv10 OK'); \
from paddleocr import PaddleOCR; print('paddleocr.PaddleOCR OK'); \
import torch; print('torch', torch.__version__); \
from infrastructure.pek_engine_adapter import _PekLayoutModel, _load_pek_models; \
print('pek_engine_adapter import OK — no pdf_extract_kit.tasks trigger'); \
print('--- pek-import-chain: ALL OK ---')"
```

**What this guarantees:** The `pek_engine_adapter` module loads successfully at build time. If any import in the module triggers `tasks/__init__.py` → unimernet → crash, the build exits non-zero. No image is produced. No container runs with a broken import chain.

**What it still cannot test:** Model weight loading (weights are in a named volume, not the image). Config file parsing (configs are in the PEK subtree but models need to be downloaded first). These are runtime-only paths with no build-time substitute — they are covered by the sentinel extraction test in the QA gate.

**Mandatory dev constraint:** Add this to the module docstring (§3.8 constraint item 6): any new `import` added to `_load_pek_models()` must also be added to this smoke gate. The gate body and the function body are twins.

---

## 5. Files to Create or Modify

| File | Action | Section |
|---|---|---|
| `apps/pdf-extractor/infrastructure/pek_engine_adapter.py` | MODIFY — add `_PekLayoutModel` class; replace `pdf_extract_kit.tasks` imports with `doclayout_yolo.YOLOv10`; remove `OCRTask` block; update return dict; update `_run_extraction`; update module docstring constraints | §3.1–3.8 |
| `apps/pdf-extractor/Dockerfile` | MODIFY — replace smoke gate `RUN` step with corrected body | §4.2 |

**No other files in OUR code need changes.** PEK subtree: zero edits.

---

## 6. DDD Layer Assignment

- `_PekLayoutModel`: infrastructure layer (wraps external model library; no domain logic)
- `_load_pek_models()`: infrastructure layer (unchanged)
- Smoke gate: build system (no DDD layer)
- No domain/ or application/ changes. No mcp-server changes.

**BUILD-STANDARD: not-applicable** — bug fix / build maintenance.

---

## 7. Risk Flags

**R-CRIT-1: `_PekLayoutModel.predict_pdfs` output format must match `_run_layout_detection()` consumer**

`_run_layout_detection()` at lines 711–718 expects:
```python
page_result.get("page", 1)
page_result.get("bboxes", [])
page_result.get("width", 2338)
page_result.get("height", 3308)
```
The `_PekLayoutModel.predict_pdfs()` prescription returns exactly this shape. Dev must add a unit test asserting the output dict keys before sending to QA.

**R-HIGH-1: `layout_detection_yolo.yaml` model sub-key structure**

`OmegaConf.to_container(layout_cfg.get("model", {}))` must return a dict containing `model_path`. The existing adapter already loaded this same config file successfully in prior dev runs (before the numpy crash). The key exists. Dev must confirm `OmegaConf.to_container` with `resolve=True` flattens it correctly by adding a unit test with a minimal OmegaConf fixture.

**R-HIGH-2: fitz (PyMuPDF) for PDF rasterization**

`_PekLayoutModel.predict_pdfs` uses `fitz` (PyMuPDF) instead of PEK's `load_pdf_images`. PyMuPDF is already in `requirements-pek.txt` as `PyMuPDF`. No new dependency. Dev must verify fitz rasterization at 200 DPI produces RGB ndarray compatible with YOLOv10 inference (3-channel uint8 array, hwc layout). A unit test with a real one-page PDF confirms this.

**R-MED-1: YOLO inference API — `result.boxes` attribute**

`doclayout_yolo 0.0.3` wraps ultralytics. The `det[0].boxes.xyxy`, `.cls`, `.conf` attributes are standard ultralytics API. Dev must confirm with a quick import test in the container before full QA run.

**R-MED-2: OCRTask removal from models dict**

`_run_extraction()` line 522 currently reads `ocr_task = models.get("ocr_task")`. After removal, this line disappears. The variable `ocr_task` is confirmed not used anywhere after line 522 in the current adapter. No functional change.

**R-LOW-1: smoke gate PYTHONPATH**

The gate imports `from infrastructure.pek_engine_adapter import ...` which requires `/app` on sys.path. The gate injects this explicitly. It must run after `COPY . .` and after `ENV PYTHONPATH=/app:/app/PDF-Extract-Kit` — existing Dockerfile ordering already satisfies this.

---

## 8. Verification Sequence for dev-pdf-extractor

```
Step 1: EDIT pek_engine_adapter.py per §3.1–3.8
        - Add _PekLayoutModel class before _load_pek_models
        - Replace pdf_extract_kit.tasks imports with doclayout_yolo.YOLOv10 import
        - Remove OCRTask block; set ocr_task = None with comment
        - Remove ocr_cfg_path variable
        - Update return dict (remove ocr_task key)
        - Update _run_extraction (remove ocr_task line)
        - Update module-level CRITICAL comment

Step 2: EDIT Dockerfile — replace smoke gate RUN step with §4.2 body

Step 3: ADD UNIT TESTS in __tests__/test_pek_engine_adapter.py:
        - Grep pek_engine_adapter source for 'pdf_extract_kit.tasks' — assert zero matches
        - Test _PekLayoutModel(yolo_cls=MockYOLO, model_cfg={...}) instantiates without error
        - Test predict_pdfs output format: list of list of dicts with
          keys {page, bboxes, width, height}; bboxes elements have {bbox, label, score}
        - Mock YOLOv10 result (boxes.xyxy, boxes.cls, boxes.conf)
        - Mock fitz.open / page.get_pixmap

Step 4: BUILD (no-cache required — new pip install must be clean)
        docker compose build --no-cache pdf-extractor
        Expected: smoke gate layer prints "pek-import-chain: ALL OK"
        Failure at gate = fix before proceeding (do NOT skip)

Step 5: FORCE-RECREATE
        docker compose up -d --no-deps --force-recreate pdf-extractor

Step 6: HEALTH CHECK
        docker compose ps pdf-extractor  →  Status: healthy

Step 7: SENTINEL EXTRACTION (off-market hours only — market-hours guard enforced)
        POST http://localhost:5001/pek-extract
        {"report_id": "e71f845d-ffa5-48f9-8f09-30ac2cd09c65",
         "pdf_path": "/app/data/pdfs/20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf"}
        Expected: HTTP 202 Accepted + zero crash in docker compose logs pdf-extractor

Step 8: DIRECT market.db ROW CHECK (endpoint is not the arbiter)
        docker compose exec -T mcp-server bun -e \
          "const {Database}=require('bun:sqlite');\
           const db=new Database('/app/data/market.db');\
           const r=db.query(\"SELECT COUNT(*) as n FROM bctc_layout_units WHERE report_id LIKE 'e71f845d%'\").get();\
           console.log('bctc_layout_units rows:',r.n)"
        Expected: n > 0

Step 9: FULL UNIT SUITE
        docker compose exec -T pdf-extractor python3 -m pytest __tests__/ -q
        Expected: 629+ tests (new _PekLayoutModel tests add to count)

Step 10: SCENARIO TESTS
        docker compose exec -T pdf-extractor python3 -m pytest scenarios/ -v
        Expected: all pass
```

---

## 9. Handoff Summary (5-line relay)

Fix selected: Option B (bypass `pdf_extract_kit.tasks` entirely). Root cause: Python unconditionally executes `tasks/__init__.py` for any import under `pdf_extract_kit.tasks.*`, triggering the `FormulaRecognitionTask` → `unimernet` chain. Fix: add `_PekLayoutModel` class in OUR adapter that calls `doclayout_yolo.YOLOv10` directly via fitz rasterization — zero PEK task imports. Drop dead `OCRTask` (never invoked at runtime). Corrected smoke gate imports `pek_engine_adapter` module itself so any import regression fails the build, not the first extraction. Two files changed in our code: `pek_engine_adapter.py` + `Dockerfile`. PEK subtree untouched.
