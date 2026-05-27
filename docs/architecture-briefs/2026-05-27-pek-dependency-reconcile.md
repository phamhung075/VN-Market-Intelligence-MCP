# PEK-DEP-RECONCILE — Architect Brief
## Recurring-bug escalation: PEK-INTEGRATE dependency incompatibilities (2 crashes)

**Date:** 2026-05-27
**Author:** architect
**Task:** PEK-DEP-RECONCILE
**Zone:** apps/pdf-extractor/
**Editable surfaces:** requirements-pek.txt · Dockerfile · scenarios/pek_single_doc_extraction.py
**Frozen surfaces (zero-diff):** text_table_extractor.py · sandbox/runner.py · pilot-status-pdf-extractor.json · PDF-Extract-Kit/ subtree

---

## 1. Why you are reading this (escalation chain)

Two successive QA bounces on PEK-INTEGRATE, both from native-library ABI mismatches discovered at first model load:

- **Fix #1 (commit `efd23447`):** `doclayout-yolo==0.0.2` ghost pin (→ 0.0.3); PEK subtree `pyproject.toml` failed Python 3.12 strict TOML parser on `pip install -e` (→ replaced with `PYTHONPATH=/app:/app/PDF-Extract-Kit`).
- **Fix #2 (QA PEK-QA FAIL):** sentinel FPT Q4 2025 extraction crashed at first model load:
  ```
  RuntimeError: module compiled against ABI version 0x1000009 but this version of numpy is 0x2000000
  numpy.core.multiarray failed to import
  (chain: _load_pek_models → from doclayout_yolo import YOLOv10 → import cv2 → bootstrap)
  (same chain: from paddleocr import PaddleOCR → import cv2 → bootstrap)
  ```
  Result: **0 BCTC rows produced**. Row quality could not even be evaluated.

Per ≥2-fixes-on-same-module rule: architect root-cause rethink mandated BEFORE any new fix is applied.

---

## 2. Systemic root cause: the dual-path drift family

The Dockerfile builds GREEN because `apt`/`pip` steps never import the heavy native libs — they are imported lazily at first `/pek-extract` (runtime). The host `.venv` (where unit tests run) had numpy 2.3.5 + cv2 4.13.0.92 already installed and WORKING, so 629 unit tests passed. The clean container got a different resolution: `opencv-python 4.6.0.66` (numpy-1.x ABI binary) against `numpy 2.4.4` (numpy-2.x ABI). The ABI numbers are incompatible at the C level; Python never even sees the import failure until runtime.

This is the same "tested locally / never built clean in container" dual-path-drift pattern this project has hit before (DRIFT-1, DRIFT-2, BCTC-OCR-PSM-DRIFT). The structural fix is a **build-time import smoke gate** that fails the Docker build if any ABI mismatch is present.

---

## 3. Live dependency-tree audit (conducted 2026-05-27)

All audit probes were executed live via PyPI JSON API (`https://pypi.org/pypi/<pkg>/<ver>/json`).

### 3.1 The culprit: `cv2` ABI mismatch

`opencv-python 4.6.0.66` ships a `cp36-abi3-manylinux_2_17_x86_64` wheel compiled against **numpy 1.x C API** (ABI marker `0x1000009`). When imported against numpy 2.x (ABI marker `0x2000000`), the numpy bootstrap extension `numpy.core.multiarray` fails. The fix is a wheel compiled against numpy 2.x: `opencv-python 4.12.0.88` is the first release to declare `numpy>=2.0.0,<2.3.0` for Python 3.9+.

**Why the container got 4.6.0.66:** `requirements-pek.txt` had no explicit opencv pin. `doclayout-yolo 0.0.3` declares `opencv-python>=4.6.0` with no upper bound. pip's resolver is allowed to pick any compatible version, and under certain layer-cache or index-ordering conditions it selected `4.6.0.66`. An explicit pin in `requirements-pek.txt` eliminates this non-determinism.

### 3.2 Full binary dependency tree — numpy ABI audit

| Package | Version in req | numpy requirement | numpy-2 ABI compatible | Action |
|---|---|---|---|---|
| `opencv-python` | (unpinned, resolved to 4.6.0.66) | numpy>=1.21 for py3.12 | **NO — cp36-abi3, compiled numpy 1.x** | **UPGRADE to 4.12.0.88** |
| `opencv-python 4.12.0.88` | target | `numpy>=2.0.0,<2.3.0` for py>=3.9 | YES — compiled numpy 2.x | pin explicitly |
| `paddlepaddle 3.3.1` | 3.3.1 | numpy>=1.21 (no upper) | **YES** — cp312 wheel; host evidence: paddlepaddle 3.0.0 + numpy 2.3.5 = working | keep 3.3.1 |
| `paddleocr 2.7.3` | 2.7.3 | numpy (no constraint) | YES — follows paddle | keep 2.7.3 |
| `ultralytics 8.2.85` | >=8.2.85 | `numpy<2.0.0,>=1.23.0` | **NO — blocks numpy 2.x** | **FLOOR to >=8.3.10** |
| `ultralytics 8.3.0` | — | `numpy<2.0.0,>=1.23.0` | NO | — |
| `ultralytics 8.3.10` | target | `numpy>=1.23.0` (no upper) | YES | first safe version |
| `ultralytics 8.4.55` (latest) | — | `numpy>=1.23.0` (no upper) | YES | allowed by >=8.3.10 |
| `doclayout-yolo 0.0.3` | 0.0.3 | (none — no numpy dep) | YES — no numpy pin | keep 0.0.3 |
| `torch 2.5.1` (CPU) | unpinned | (none) | YES — torch has no numpy constraint since ~2.0 | **pin explicitly** |
| `torchvision 0.20.1` (CPU) | unpinned | numpy (no constraint) | YES | **pin explicitly, pairs with torch 2.5.1** |
| `scipy` | (transitive via doclayout-yolo) | `numpy<2.3,>=1.23.5` (1.14.0) | YES with pin <2.3 | accept >=1.14.0 |
| `pandas` | (transitive via doclayout-yolo) | `numpy>=1.26` for py312 (2.2.2+) | YES — no upper bound for py312 | accept >=2.2.2 |
| `albumentations >=1.4.11` | (transitive) | `numpy>=1.24.4` (no upper) | YES | accept |
| `Pillow`, `pdfplumber`, `pdf2image`, `pytesseract` | all present | no numpy pin | YES | unchanged |
| `omegaconf`, `matplotlib`, `PyMuPDF` | all present | no numpy pin | YES | unchanged |

### 3.3 Why torch is not the conflict driver

torch 2.5.1 CPU has **no numpy requirement** in `requires_dist`. The Dockerfile installs torch via `--index-url https://download.pytorch.org/whl/cpu` which fetches the CPU-only wheel (`torch-2.5.1+cpu-cp312-cp312-linux_x86_64.whl`). torch is not a participant in the ABI conflict; it does not link against numpy at the C level.

### 3.4 The single resolution that satisfies all deps

```
numpy>=2.0.0,<2.3.0
```

- `>=2.0.0` forces pip to select only wheels compiled against numpy 2.x. `cv2 4.6.0.66` (numpy-1.x compiled) becomes **uninstallable** — pip MUST upgrade cv2.
- `<2.3.0` satisfies `opencv-python 4.12.0.88`'s ceiling (`numpy<2.3.0` for py3.9+).
- All other packages have no upper bound or have ceilings above 2.3.0.

This one pin acts as a **self-enforcing constraint**: any future binary wheel that is compiled against numpy 1.x will fail to resolve, surfacing the incompatibility at install time (pip resolution), not at runtime.

---

## 4. Prescribed pin set — exact `requirements-pek.txt` changes

### 4.1 Changes (minimal churn)

| Line | Was | Becomes | Reason |
|---|---|---|---|
| numpy | `numpy>=1.24.0` | `numpy>=2.0.0,<2.3.0` | forces numpy-2 ABI floor; ceiling from opencv 4.12 |
| opencv-python | (absent — resolved to 4.6.0.66 via doclayout-yolo transitive) | `opencv-python==4.12.0.88` | explicit pin; numpy-2 native build |
| ultralytics | `ultralytics>=8.2.85` | `ultralytics>=8.3.10` | 8.3.10 = first version to drop `numpy<2.0.0` from core requires |
| torch (in Dockerfile RUN, not in requirements-pek.txt) | `torch torchvision` (unpinned) | `torch==2.5.1 torchvision==0.20.1` | prevents build-time drift; these are a matched pair |

### 4.2 Complete target `requirements-pek.txt`

```text
# apps/pdf-extractor/requirements-pek.txt
# PEK-DEP-RECONCILE: numpy-2 ABI coherent pin set (2026-05-27)
# Base: Ubuntu 24.04, Python 3.12
#
# NUMPY ABI POLICY (PEK-DEP-RECONCILE):
#   ALL binary deps MUST be compiled against numpy 2.x ABI.
#   numpy>=2.0.0,<2.3.0 enforces this at install time — pip cannot select
#   a wheel compiled against numpy 1.x (those declare numpy<2.0 or no upper
#   bound but link against older C API). Ceiling <2.3.0 is opencv 4.12's limit.
#
# EXCLUDED intentionally (REQ-PEK-1 / REQ-PEK-2 — CPU-only, 8GB-safe):
#   unimernet==0.2.1         (formula model, ~1.4GB, OUT OF SCOPE)
#   struct-eqtable           (StructEqTable VLM, GPU-only, crashes on CPU import)
#   paddlepaddle-gpu         (NVIDIA GPU only)
#   lmdeploy                 (GPU serving framework)
#
# torch + torchvision MUST be installed as CPU-only builds.
# Install separately BEFORE this file to use CPU index-url:
#   pip3 install --no-cache-dir --break-system-packages \
#       torch==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cpu
# (Dockerfile handles this as a separate RUN step before -r requirements-pek.txt)

# FastAPI service runtime
fastapi>=0.110.0
uvicorn[standard]>=0.29.0
python-multipart>=0.0.9
pydantic>=2.6.4

# PDF processing
pdfplumber>=0.10.3
pdf2image>=1.16.0

# Image + HTTP
Pillow>=10.2.0
aiohttp>=3.9.3

# Tesseract (still used for existing structured path — text_table_extractor.py)
pytesseract>=0.3.10

# PDF-Extract-Kit runtime deps (from PDF-Extract-Kit/requirements-cpu.txt — trimmed)
omegaconf
matplotlib
PyMuPDF

# NumPy — ABI floor (PEK-DEP-RECONCILE)
# >=2.0.0 forces pip to reject all numpy-1.x-compiled binary wheels (cv2 4.6, etc.)
# <2.3.0 satisfies opencv-python 4.12.0.88 ceiling (numpy<2.3.0 for py3.9+)
numpy>=2.0.0,<2.3.0

# OpenCV — explicitly pinned to numpy-2-native build (PEK-DEP-RECONCILE fix #2)
# 4.12.0.88 = first version compiled against numpy 2.x ABI (declares numpy>=2.0,<2.3 for py3.9+)
# Do NOT use 4.6.0.66 (cp36-abi3, numpy 1.x compiled) — ABI 0x1000009 vs 0x2000000 crash.
opencv-python==4.12.0.88

# Layout detection (DocLayout-YOLO, CPU)
# doclayout-yolo 0.0.3 has no numpy pin itself; its ultralytics dep is constrained below.
doclayout-yolo==0.0.3

# ultralytics >= 8.3.10 (PEK-DEP-RECONCILE fix)
# 8.2.85–8.3.0: declared numpy<2.0.0 in requires_dist → BLOCKED numpy 2.x
# 8.3.10+: removed numpy<2.0 from core requires → numpy-2 compatible
# doclayout-yolo 0.0.3 requires ultralytics>=8.2.85 with no upper; we floor at 8.3.10.
ultralytics>=8.3.10

# OCR + table structure (CPU, no GPU variant)
# paddlepaddle CPU build (not paddlepaddle-gpu)
# paddlepaddle 3.3.1 cp312 wheel declares numpy>=1.21 (no upper) and is numpy-2 compatible
# (confirmed: paddlepaddle 3.0.0 + numpy 2.3.5 = working on host).
paddlepaddle==3.3.1
paddleocr==2.7.3

# Dev / testing
pytest>=8.1.1
pytest-asyncio>=0.23.6
import-linter>=2.0
httpx>=0.27.0
```

---

## 5. Build-time import smoke gate — Dockerfile placement and exact text

### 5.1 Rationale

The structural fix that ends the one-crash-at-a-time loop is a Docker build step that actually IMPORTS the full native chain. If any binary is ABI-incompatible with the resolved numpy, the import will raise `RuntimeError: module compiled against ABI version ...` and the build will **fail at layer time**, not at first `/pek-extract` call.

### 5.2 Exact Dockerfile step

Add one `RUN` step as the **last step before `EXPOSE`**, after `COPY . .` and after `ENV` declarations (models are lazy-loaded at runtime, not imported here — only the import machinery is tested):

```dockerfile
# PEK-DEP-RECONCILE: build-time native import smoke gate.
# Fails the build immediately if any binary wheel is ABI-incompatible with numpy.
# This catches the entire class of "works in host venv, crashes in container" errors.
# Note: actual model weights are NOT loaded here (lazy-load at runtime per REQ-PEK-4).
# PYTHONPATH is already set to /app:/app/PDF-Extract-Kit from the ENV step above.
RUN python3 -c "\
import numpy; \
print('numpy', numpy.__version__); \
import cv2; \
print('cv2', cv2.__version__); \
from paddleocr import PaddleOCR; \
print('paddleocr import OK'); \
from doclayout_yolo import YOLOv10; \
print('doclayout_yolo import OK'); \
import torch; \
print('torch', torch.__version__); \
print('pek-native-imports: ALL OK')"
```

### 5.3 Placement in Dockerfile

The step goes here (after the current `RUN mkdir` + `ENV` block, before `EXPOSE 5001`):

```
... [existing layers]
RUN mkdir -p /app/data/extractions /app/data /app/pek_models
ENV PYTHONPATH=/app:/app/PDF-Extract-Kit
ENV HOST=0.0.0.0
... [other ENV lines]
ENV PADDLEOCR_HOME=/app/pek_models/paddleocr

# ← INSERT SMOKE GATE HERE (see §5.2)

EXPOSE 5001
HEALTHCHECK ...
CMD ...
```

### 5.4 Why this placement is correct

- After `COPY . .`: ensures `PDF-Extract-Kit/` is present in `PYTHONPATH` for the `doclayout_yolo` import.
- After all `ENV` declarations: `PYTHONPATH=/app:/app/PDF-Extract-Kit` is visible to the `RUN` shell.
- Before `EXPOSE/CMD`: failure here cancels the build; no runnable image is produced.
- After pip installs: the installed wheels are already in place; this is a pure import verification, not an install step.

### 5.5 What this does NOT do

- Does NOT load model weights (lazy per REQ-PEK-4; no `_load_pek_models()` call here).
- Does NOT run any inference.
- Does NOT require network access (all packages are already installed in earlier layers).
- Does NOT add significant build time (pure Python import, <5 seconds).

---

## 6. Test file fix: `test_fake_ocr_backend_result_in_extraction_output`

### 6.1 The bug

`scenarios/pek_single_doc_extraction.py` line ~534:

```python
with patch("infrastructure.pek_engine_adapter.convert_from_path") as mock_convert:
```

`convert_from_path` is imported **lazily inside `_run_table_extraction()`**:

```python
def _run_table_extraction(self, ...):
    import tempfile
    try:
        from pdf2image import convert_from_path  # ← local import
    except ImportError:
        ...
```

When `from pdf2image import convert_from_path` is a local import, `unittest.mock.patch("infrastructure.pek_engine_adapter.convert_from_path")` targets a name that does **not exist** in the `pek_engine_adapter` module namespace at patch time. The patch creates an attribute but the local import bypasses it, so `mock_convert` is never used and the real `convert_from_path` is called (or the local import fails if pdf2image is absent). Result: `AttributeError` or silent non-mock.

The other test (`test_fake_ocr_backend_invoked_by_pek_engine_adapter`) uses `patch("pdf2image.convert_from_path", ...)` which patches the **source module** and is correct.

### 6.2 Fix decision: patch the source module

**Recommended fix:** change the patch target in `test_fake_ocr_backend_result_in_extraction_output` from:

```python
with patch("infrastructure.pek_engine_adapter.convert_from_path") as mock_convert:
```

to:

```python
with patch("pdf2image.convert_from_path") as mock_convert:
```

**Why not hoist the import to module level in `pek_engine_adapter.py`?**

- `pdf2image.convert_from_path` is only needed inside `_run_table_extraction`, which is called lazily per REQ-PEK-4. Hoisting the import to module level would cause `from pdf2image import convert_from_path` to execute at import time, pulling `poppler-utils` into the boot path — a minor startup cost increase.
- More importantly: `pek_engine_adapter.py` already uses the local-import pattern intentionally for the heavy native libs (`LayoutDetectionTask`, `OCRTask`, `PaddleOCR`). Consistency with the existing pattern is preferable.
- The source-module patch (`patch("pdf2image.convert_from_path")`) is the correct unittest.mock idiom for local imports: it patches where the function is **defined**, not where it is consumed.

### 6.3 Exact diff (the only change to the test file)

In `TestPekOcrBackendInjectionScenario.test_fake_ocr_backend_result_in_extraction_output`, replace lines ~533–534:

```python
        with patch("infrastructure.pek_engine_adapter.convert_from_path") as mock_convert:
            import numpy as np2
```

with:

```python
        with patch("pdf2image.convert_from_path") as mock_convert:
            import numpy as np2
```

No other change to the test file. The `mock_np` inner patch and the rest of the test body are correct and unchanged.

---

## 7. Host-venv vs container divergence advisory

### 7.1 Current state

The host `.venv` has `numpy 2.3.5` + `opencv-python 4.13.0.92` + `paddlepaddle 3.0.0` + `paddleocr 3.5.0`. These are DIFFERENT versions from the container's target (`numpy 2.0.x–2.2.x` + `opencv 4.12.0.88` + `paddlepaddle 3.3.1` + `paddleocr 2.7.3`). This divergence means:

- Unit tests pass locally (host venv, compatible combination).
- Container could still be broken (different combination, different wheel resolutions).

### 7.2 Advisory

The build-time smoke gate (§5) is the primary guardrail: it fails the build if the container's combination is ABI-incompatible. This is stronger than aligning the host venv to match the container.

However, for completeness: developers running the unit tests locally against a host venv with `numpy>=2.3.0` may encounter the same ABI errors IF the host ever gets an opencv downgrade. This is an unlikely regression path given that the host pip install is separate from the container's pip install.

**Recommendation:** document in `apps/pdf-extractor/README.md` (or the microservice doc) that the authoritative test environment is the container (smoke gate + container-run scenarios), and that local venv runs are convenience-only. The smoke gate at build time is the invariant.

### 7.3 Not in scope of this fix

Do NOT align the host venv to match the container pip by adding `pip install -r requirements-pek.txt` to any pre-commit hook or CI script — this is out of scope and would complicate the multi-agent host setup.

---

## 8. Verification sequence (mechanical — dev-pdf-extractor follows this exactly)

```
Step 1: EDIT requirements-pek.txt per §4.2
Step 2: EDIT Dockerfile — pin torch==2.5.1 torchvision==0.20.1 in the CPU RUN step;
        ADD smoke gate step per §5.2 immediately before EXPOSE 5001
Step 3: EDIT scenarios/pek_single_doc_extraction.py per §6.3
Step 4: BUILD
        docker compose build --no-cache pdf-extractor
        # Expected: smoke gate layer prints "pek-native-imports: ALL OK"
        # Failure: build exits non-zero with ABI error → investigate before proceeding
Step 5: FORCE-RECREATE (not plain restart — restart relaunches stale image)
        docker compose up -d --no-deps --force-recreate pdf-extractor
Step 6: HEALTH CHECK
        docker compose ps pdf-extractor
        # Expected: Status = healthy (HEALTHCHECK curl -f http://localhost:5001/health)
Step 7: RE-RUN SENTINEL (FPT Q4 2025, report_id = e71f845d-...)
        # Trigger extraction via the normal /pek-extract endpoint or
        # via the existing BCTC reparse cron (CRON_BCTC_REPARSE_JOB at 21:00 UTC)
        # during off-market hours ONLY (market-hours guard enforced)
Step 8: DIRECT market.db ROW CHECK (endpoint is not the arbiter)
        docker compose exec -T mcp-server bun -e \
          "const {Database}=require('bun:sqlite');\
           const db=new Database('/app/data/market.db');\
           const r=db.query(\"SELECT COUNT(*) as n FROM bctc_layout_units WHERE report_id LIKE 'e71f845d%'\").get();\
           console.log('bctc_layout_units rows:',r.n)"
        # Expected: n > 0 (rows stored, not write-wedged)
        # Also verify bctc_table_rows unregressed:
        docker compose exec -T mcp-server bun -e \
          "const {Database}=require('bun:sqlite');\
           const db=new Database('/app/data/market.db');\
           const r=db.query(\"SELECT COUNT(*) as n FROM bctc_table_rows\").get();\
           console.log('bctc_table_rows total:',r.n)"
Step 9: RUN UNIT TESTS (629 green gate)
        docker compose exec -T pdf-extractor python3 -m pytest __tests__/ -q
Step 10: RUN SCENARIO TESTS
        docker compose exec -T pdf-extractor python3 -m pytest scenarios/ -v
        # All 3 TestPekOcrBackendInjectionScenario tests must pass including
        # test_fake_ocr_backend_result_in_extraction_output (the patched one)
```

---

## 9. Risk flags

**R-HIGH: paddlepaddle 3.3.1 numpy-2 ABI**
The PyPI `requires_dist` for paddlepaddle 3.3.1 only declares `numpy>=1.21` (no upper bound). This is a soft claim; the actual binary ABI depends on what version numpy was installed when the wheel was compiled. Evidence that it is numpy-2 compatible: `paddlepaddle 3.0.0 + numpy 2.3.5` is running and functional on the host. If the container's paddlepaddle 3.3.1 wheel fails with an ABI error, the fallback is to drop back to `paddlepaddle==3.0.0` (the version confirmed working on host). The smoke gate (§5) will surface this at build time.

**R-MED: ultralytics version ceiling**
We pin `ultralytics>=8.3.10` with no upper bound. A future ultralytics release could reintroduce a conflicting numpy constraint. Mitigation: the smoke gate catches this before the container runs. If a future build fails the smoke gate, pin an exact ultralytics version at that time.

**R-MED: opencv-python 4.12.0.88 ceiling**
`opencv-python 4.12.0.88` declares `numpy<2.3.0` for py3.9+. Our numpy pin is `<2.3.0` to match. If numpy ever needs to be upgraded past 2.3.0 (e.g., another package requires it), we will need to bump opencv to the next numpy-2.3-compatible version. The smoke gate will catch this.

**R-LOW: torch/torchvision version pinning**
Pinning torch to `2.5.1` + torchvision to `0.20.1` prevents version drift. These are a matched pair (torchvision 0.20.1 requires `torch==2.5.1` exactly). The CPU download URL is `https://download.pytorch.org/whl/cpu`. If this specific version is removed from the torch CPU index, the build will fail cleanly at the `pip install torch==2.5.1` step (not at runtime).

**R-LOW: doclayout-yolo 0.0.3 vs 0.0.4**
We keep `doclayout-yolo==0.0.3`. Version `0.0.4` exists on PyPI and has the same dependency profile (no numpy pin, no ultralytics pin in core deps). Either works. We keep 0.0.3 to avoid any behavioral regression from the model upgrade — the fix does not require changing doclayout-yolo.

---

## 10. Files to create/modify

| File | Action | Section |
|---|---|---|
| `apps/pdf-extractor/requirements-pek.txt` | MODIFY — replace numpy pin + add opencv pin + floor ultralytics | §4.2 |
| `apps/pdf-extractor/Dockerfile` | MODIFY — pin torch/torchvision versions + add smoke gate RUN step | §4.1 + §5.2 |
| `apps/pdf-extractor/scenarios/pek_single_doc_extraction.py` | MODIFY — one line: patch target in `test_fake_ocr_backend_result_in_extraction_output` | §6.3 |

**Frozen (zero-diff required):**
- `apps/pdf-extractor/infrastructure/text_table_extractor.py`
- `apps/pdf-extractor/sandbox/runner.py`
- `apps/pdf-extractor/docs/data/pilot-status-pdf-extractor.json`
- `apps/pdf-extractor/PDF-Extract-Kit/` (entire subtree — pristine invariant)

---

## 11. DDD layer assignment

This task is infrastructure-layer and build-system only:
- `requirements-pek.txt` = build surface, no DDD layer
- `Dockerfile` = infrastructure build config
- `scenarios/pek_single_doc_extraction.py` = test/scenarios layer (no DDD violation)
- No domain/ or application/ changes. No mcp-server changes.

**BUILD-STANDARD: not-applicable** — this is a bug fix / build-system maintenance task, not a new feature or new service.

---

## 12. Handoff summary

dev-pdf-extractor implements all three changes (§10). The verification sequence in §8 is the done-bar. QA re-runs the sentinel after force-recreate and verifies rows via direct `bun:sqlite` query.

The smoke gate (§5) is the structural fix that ends the one-crash-at-a-time loop: if the ABI is broken, the Docker build fails. No container runs with a broken numpy stack.
