# PEK-OCR-ROOTCAUSE — Architect Brief

**Date:** 2026-05-27
**Task:** PEK-OCR-ROOTCAUSE
**Zone:** `apps/pdf-extractor/`
**BUILD-STANDARD:** not-applicable (bug-fix / anti-recurrence hardening)
**Author:** architect
**Status:** DESIGN COMPLETE

---

## §1 Escalation Context

This is the fourth defect in the same module class across four fix commits:

| Commit | Fix | Root defect class |
|---|---|---|
| `9ab93889` | numpy-2 ABI coherence | Dep-ABI silent build drift |
| `6c124745` | `pdf_extract_kit.tasks` import chain | Eager-import crash at first request |
| `e6b84ca5` | `_load_pek_models()` layout-config fail-loud | Silent `except → None` masking layout load failure |
| cycle-132 | `_to_pil` NameError swallowed at `:134` | Silent `except Exception` masking every OCR call |

The serial pattern is not a sequence of independent bugs. It is a single structural defect: **silent exception swallowing in the OCR path transforms all runtime errors into `("", 0.0)` returns, making the pipeline appear healthy (layout structure correct, table bboxes present) while producing zero text in every cell**. Each fix only exposed the next swallowed defect. The loop ends when the swallows are replaced with fail-loud raises and a one-pass audit is done before any next fix.

The previous architect brief (PEK-IMPORT-CHAIN, 2026-05-27T05:15Z) correctly identified and fixed the layout-config swallow (`e6b84ca5`). This brief closes the OCR text-recognition swallow and mandates the one-pass audit.

---

## §2 Brownfield Findings — What is Confirmed Working

**Do not redesign or regress these — qa verified on live image `fb6fda6f17cf`:**

- `_PekLayoutModel` (DocLayout-YOLO via `doclayout_yolo.YOLOv10`): 46 pages, 23 table pages, valid column gutters detected. Fail-loud on load confirmed (`e6b84ca5`).
- HTTP 503 market-hours guard, CPU-only/8GB cap, dep-ABI pins, Dockerfile smoke gate.
- 694/694 unit tests + DDD fence pass.
- PEK subtree zero-diff invariant (pristine — `git -C apps/pdf-extractor/PDF-Extract-Kit diff` must remain empty).

**Frozen files (dev must not touch):**
- `infrastructure/text_table_extractor.py`
- `sandbox/runner.py`
- `pilot-status-pdf-extractor.json`
- `infrastructure/generic_md_table_extractor.py`

---

## §3 Immediate Defect — `_to_pil` Undefined at `ocr_backends.py:108`

**Location:** `apps/pdf-extractor/infrastructure/ocr_backends.py`

**Line 108:**
```python
pil_image = _to_pil(image_or_region)
```

`_to_pil` is called inside `TesseractVieBackend.recognize_text()` but is **never defined anywhere in the file or imported**. At runtime, when `recognize_text()` reaches this line, Python raises `NameError: name '_to_pil' is not defined`.

**Line 134 swallows it:**
```python
except Exception as exc:
    logger.warning("TesseractVieBackend.recognize_text: error: %s — returning empty", exc)
    return ("", 0.0)
```

The NameError is caught by this bare `except Exception`, logged as a silent WARNING, and the function returns `("", 0.0)`. Because the default backend is `tesseract-vie` and the default (no `OCR_TEXT_BACKEND` env var set) selects `TesseractVieBackend`, **every table cell in every extraction produces empty text**. Layout structure is correct; OCR text is absent. The QA corpus sweep showed 0 text in all 5 reports — this is why.

---

## §4 Decision 1 — Fail-Loud Remediation (Root-Cause Fix)

**Decision: Remove the bare `except Exception` swallow at `ocr_backends.py:134` and replace it with a fail-loud raise.**

**Rationale:** The swallow is the structural root cause. With it in place, any NameError, ImportError, AttributeError, or logic bug inside `recognize_text()` is invisible at test time and produces false-green. The fail-loud pattern already proven on `_load_pek_models()` (brief `e6b84ca5`) applies identically here.

**Replacement contract:**

The `try` block in `TesseractVieBackend.recognize_text()` (lines 106–138) handles two logically different failure modes that must be treated differently:

1. **`None` input / empty region** — legitimate caller contract (`if image_or_region is None: return ("", 0.0)`) — keep the early return, this is not an error.
2. **`ImportError` (pytesseract/pandas not installed)** — infra misconfiguration, not a caller error. **This must RAISE**, not return empty. A missing pytesseract at runtime means the backend was selected but cannot run — the operator must know. Replace the `ImportError` catch-and-return with `raise RuntimeError(f"TesseractVieBackend: required packages not installed: {exc}") from exc`.
3. **Any other exception inside the `try` block** (including `NameError: _to_pil`, any unexpected OCR failure) — **must RAISE**, not return empty. Replace `except Exception` with no catch: let exceptions propagate to the caller (`_run_table_extraction`), which already has a per-region warning at `:1006` (acceptable — that is a per-crop isolation boundary, not a module-level swallow).

**Scope of fail-loud audit in `ocr_backends.py`:**

All three `except Exception` locations in the file:
- Line 134 (TesseractVieBackend): **RAISE** as described above.
- Line 205 (PaddleOcrBackend, inner `np.array()` conversion): This catches failure to convert a non-ndarray to ndarray. Acceptable silent return here — it is a single-crop data-shape issue, not a broken backend. **Keep** as `return ("", 0.0)` but add a WARNING log with the actual exception so it is visible in logs.
- Line 237 (PaddleOcrBackend outer): Same analysis as line 134 — swallows any PaddleOCR inference exception silently. **RAISE** (let the per-region isolation in `_run_table_extraction:1006` handle it).

---

## §5 Decision 2 — Fix for `_to_pil` Undefined

**Decision: Option A — define `_to_pil` as a module-level helper in `ocr_backends.py`.**

**Rationale vs Option B (make PaddleOCR the default):**

- Option B (default to `paddleocr`) avoids the `_to_pil` bug but does NOT fix the fail-loud gap. The same structural problem (bare `except Exception` at line 237) exists in `PaddleOcrBackend`. Switching default without fixing the swallows leaves the architecture in exactly the same false-green posture for any future PaddleOCR error.
- Option A fixes the immediate defect AND the structural cause together. `TesseractVieBackend` with `lang="vie+eng"` is the documented proven path for Vietnamese BCTC (module docstring, `ocr_adapter.py` precedent). Keeping it as default preserves continuity.
- Option B is a workaround that defers the problem. Option A is the correct fix.

**`_to_pil` definition (module-level, before `TesseractVieBackend`):**

```python
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
    """
    from PIL import Image
    import numpy as np
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
```

Place this function at module level, before the `TesseractVieBackend` class definition. The `from PIL import Image` and `import numpy as np` are local imports (deferred) to avoid loading them at module import time.

---

## §6 Decision 3 — OCR Backend Contract, Default, and Vietnamese Language Config

**Input contract (canonical):**

The layout pipeline (`_run_table_extraction`) produces crops via:
```python
crop = page_arr[int(y0):int(y1), int(x0):int(x1)]
```
where `page_arr = np.array(page_img)` from `pdf2image.convert_from_path(..., fmt="png")`. This produces a **numpy ndarray, dtype uint8, shape (H, W, 3), RGB channel order** (pdf2image produces RGB).

All `OcrBackendPort.recognize_text()` implementations must handle `numpy.ndarray` as primary input. The `_to_pil` helper handles the ndarray→PIL conversion for Tesseract (which requires PIL). PaddleOCR already handles ndarray natively (no conversion needed).

**Default backend:** `tesseract-vie` (unchanged). This is correct — Tesseract with `lang="vie+eng"` is the proven Vietnamese diacritics path. The module docstring, `ocr_adapter.py`, and the `TesseractVieBackend` class docstring all state this explicitly. No change to the default.

**CRITICAL — Vietnamese language misconfiguration in `_load_pek_models()`:**

`pek_engine_adapter.py` line 316:
```python
paddle_table = PaddleOCR(
    use_angle_cls=False,
    lang="en",         # <-- BUG: English language model for Vietnamese documents
    ...
)
```

PaddleOCR `lang="en"` loads the English recognition model. Vietnamese has distinct diacritics (e.g. `ổ`, `ắ`, `ề`, `ụ`). The English model will misrecognize or skip these characters, producing corrupted text for Vietnamese BCTC documents. This is defect #5 — it would have been the next serial discovery after `_to_pil`.

**Fix:** Change `lang="en"` to `lang="vi"` in `_load_pek_models()`.

PaddleOCR 2.7.3 (pinned in `requirements-pek.txt`) ships Vietnamese model weights. The `lang="vi"` parameter selects the Vietnamese PP-OCRv4 recognition model — this is the same model family used in the existing `ocr_adapter.py` Tesseract path's Vietnamese focus. The change is a one-token edit.

This fix applies to the **fallback path** (when `OCR_TEXT_BACKEND=paddleocr` is selected) and to the **table-grid detection path** (the backward-compatible path at `_run_table_extraction:987` that calls `paddle_table.ocr(crop, cls=False)` directly when no `_ocr_backend` is injected). Both paths use the same `paddle_table` instance. Fixing `lang` at construction time fixes both.

---

## §7 Decision 4 — Test Coverage Mandate

**Current gap:** `test_ocr_backends.py` tests the factory selection, the AutoFallback policy, and None-input contract. It **never passes a real numpy ndarray to `TesseractVieBackend.recognize_text()`** — which means `_to_pil` was never exercised and the NameError never surfaced.

**Mandatory new tests (add to `__tests__/test_ocr_backends.py`):**

**Test A — TesseractVieBackend with real ndarray shape (covers the `_to_pil` path):**
```
Given: np.zeros((50, 200, 3), dtype="uint8")  # minimal valid crop
When: TesseractVieBackend().recognize_text(image)
Then: does NOT raise; returns (str, float) where 0.0 <= float <= 1.0
      (blank image → empty string is acceptable; NameError → test fails)
Patch: pytesseract.image_to_data → returns a DataFrame with no valid rows
       (so no real Tesseract binary required in CI)
```

**Test B — TesseractVieBackend ImportError raises instead of returning empty:**
```
Given: pytesseract not importable (patch builtins.__import__ for pytesseract)
When: TesseractVieBackend().recognize_text(np.zeros((50,200,3), dtype="uint8"))
Then: raises RuntimeError (NOT returns ("", 0.0))
```

**Test C — PaddleOcrBackend with real ndarray shape (covers inference path):**
```
Given: np.zeros((50, 200, 3), dtype="uint8"), fake paddle_table mock
When: PaddleOcrBackend(paddle_table=mock).recognize_text(image)
Then: does NOT raise; mock.ocr called with the ndarray; returns (str, float)
```
(This test already exists for `set_paddle_table` — extend it to cover the full recognize_text path with ndarray input.)

**Test D — TesseractVieBackend with PIL.Image passthrough (covers the isinstance branch):**
```
Given: PIL.Image.new("RGB", (200, 50), color=(255,255,255))
When: TesseractVieBackend().recognize_text(image)
Then: does NOT raise; _to_pil returns the PIL.Image unchanged; Tesseract called
Patch: pytesseract.image_to_data → minimal mock
```

**Test E — `_to_pil` with unsupported type raises RuntimeError:**
```
Given: _to_pil("a string")
When: called directly
Then: raises RuntimeError (not NameError, not silent return)
```

These five tests are sufficient to make `ocr_backends.py` false-green-proof for the `_to_pil` class of defects. They require zero real model weights and zero credentials.

---

## §8 Decision 5 — One-Pass Audit Directive

Before implementing any code, dev must run the following grep across `infrastructure/ocr_backends.py` AND `infrastructure/pek_engine_adapter.py` and resolve ALL findings in the same commit:

```bash
# Undefined symbols called but not defined or imported at module/function level
grep -n "_to_pil\|_some_helper\|NameError" \
  apps/pdf-extractor/infrastructure/ocr_backends.py \
  apps/pdf-extractor/infrastructure/pek_engine_adapter.py

# Bare/broad except swallows (return ("", 0.0) or return {} or pass after exception)
grep -n "except Exception\|except:" \
  apps/pdf-extractor/infrastructure/ocr_backends.py \
  apps/pdf-extractor/infrastructure/pek_engine_adapter.py

# Language misconfig (any lang= argument in these files)
grep -n 'lang=' \
  apps/pdf-extractor/infrastructure/ocr_backends.py \
  apps/pdf-extractor/infrastructure/pek_engine_adapter.py
```

For each `except Exception` found, dev must classify it per the taxonomy in §4:
- **Structural failure (backend broken)** → replace with RAISE
- **Per-crop data-shape issue** → keep return, but add WARNING log with the actual exception
- **Page-level isolation boundary** → keep warning log + continue (already correct at `:1006` and `:1019`)

The `_run_table_extraction` outer per-page catch at lines 1006 and 1019 in `pek_engine_adapter.py` are CORRECT per-crop/per-page isolation boundaries — they must NOT be changed to raises (that would abort the whole extraction on a single bad crop). Annotate them with a comment to prevent future "fix" attempts.

**Scope rule:** This audit covers ONLY `ocr_backends.py` and `pek_engine_adapter.py`. No other file is in scope for this task.

---

## §9 Complete Change-List for dev-pdf-extractor

All changes in one commit. No partial deploys.

### File 1: `apps/pdf-extractor/infrastructure/ocr_backends.py`

1. **ADD** `_to_pil(image_or_region)` module-level helper (before `TesseractVieBackend` class) — exact spec in §5.
2. **MODIFY** `TesseractVieBackend.recognize_text()`:
   - Remove the `except ImportError` block that returns `("", 0.0)` — replace with `raise RuntimeError(...)`.
   - Remove the outer `except Exception as exc` block at line 134 that returns `("", 0.0)` — let exceptions propagate.
   - Result: `_to_pil` NameError will now surface immediately as a hard exception on the first extraction, not silently.
3. **MODIFY** `PaddleOcrBackend.recognize_text()`:
   - Line 205 (inner `np.array()` exception): keep `return ("", 0.0)` but add `logger.warning("PaddleOcrBackend: could not convert input to ndarray: %s", exc)`.
   - Line 237 (outer `except Exception`): replace `return ("", 0.0)` with `raise` — let the per-region isolation in `_run_table_extraction` handle it.
4. **VERIFY** no other undefined symbols called (§8 grep).

### File 2: `apps/pdf-extractor/infrastructure/pek_engine_adapter.py`

1. **MODIFY** `_load_pek_models()` line 316: change `lang="en"` to `lang="vi"`.
2. **ANNOTATE** the per-crop/per-page `except Exception` blocks at lines 1006 and 1019 with a comment: `# Per-crop isolation: catch here is intentional — one bad crop must not abort the page.`
3. **NO other changes** to this file.

### File 3: `apps/pdf-extractor/__tests__/test_ocr_backends.py`

1. **ADD** Tests A through E as specified in §7.
2. **DO NOT** remove or modify any existing tests (tests 1–15 stay).

### File 4: `apps/pdf-extractor/Dockerfile`

No change required. The smoke gate added in `9ab93889` already imports `pek_engine_adapter` at build time — once the NameError is raised instead of swallowed, a `docker build` that exercises the import chain will fail fast if any new undefined symbol appears. This is the correct build-time guard.

---

## §10 Verification Sequence

Execute in strict order:

1. **Run unit tests** (no container, no models):
   ```bash
   cd apps/pdf-extractor && python -m pytest __tests__/test_ocr_backends.py -v
   ```
   Expected: all 15 existing + 5 new tests pass. If any existing test changes to a `RuntimeError` expectation, that is correct (the old "returns empty" contract is being replaced with "raises" for error cases).

2. **Run full test suite**:
   ```bash
   cd apps/pdf-extractor && python -m pytest __tests__/ -v --ignore=__tests__/integration
   ```
   Expected: 694+ tests pass. No regressions.

3. **Dispatch ops** to `docker compose build --no-cache pdf-extractor` and `docker compose up -d --no-deps --force-recreate pdf-extractor`. The `--no-cache` is required because the smoke gate layer is cached and will not re-run without it.

4. **Dispatch qa** to run single-document extraction against the FPT Q4 2025 sentinel (`report_id e71f845d-...`). Verify via direct `bun:sqlite` query on `market.db`: `bctc_table_rows` rows for this report_id have non-empty `label` AND non-empty values (the key signal that OCR text is flowing). A non-empty stitched_markdown in the extraction response also confirms OCR text is reaching the output.

5. **QA corpus sweep**: run the full multi-doc corpus and measure pass-rate. Done-bar: same as PEK-EXIT requirements (direct DB rows clean, not endpoint-only).

---

## §11 DDD Layer Assignment

| Component | Layer | Rationale |
|---|---|---|
| `_to_pil` helper | infrastructure | Converts numpy/PIL — infra utility, not domain logic |
| `TesseractVieBackend` | infrastructure | External tool wrapper (pytesseract) |
| `PaddleOcrBackend` | infrastructure | External tool wrapper (paddleocr) |
| `OcrBackendPort` (Protocol) | domain/repositories | Interface contract — domain layer, zero infra imports |
| `_load_pek_models` lang fix | infrastructure | Config parameter to external library |
| New tests | infrastructure-layer tests | Per dev-standards: infrastructure-layer tests |

No DDD violations introduced or removed by this change.

---

## §12 Risk Flags

**R-HIGH — First extraction after fix will surface any remaining `_to_pil`-class bugs as hard errors.** This is intentional and correct (the goal). Ops must be ready to see a 500 instead of a silent empty result. The 500 will contain a full Python traceback — that traceback is the diagnostic. Do not patch it silently; read it.

**R-MED — `lang="vi"` PaddleOCR model download.** If the `vi` model weights are not in the `pek_model_cache` named volume (first boot after the change), PaddleOCR will attempt to download them. In a network-isolated container this will fail. Mitigation: the existing `_load_pek_models` `except Exception` catch at line 322 logs a WARNING and sets `paddle_table = None` — the extraction continues with Tesseract only (the primary backend). The named volume will need to be populated on first restart (same model-download behavior as the initial `en` model load).

**R-LOW — Existing test assertions that expect `("", 0.0)` on ImportError will need to be updated.** The `TesseractVieBackend` ImportError path now raises instead of returning empty. Dev must update any such assertions — this is expected and correct.

**R-LOW — PaddleOcrBackend outer `except Exception` change.** Removing the swallow means that a real PaddleOCR inference crash (e.g., memory error, CUDA assertion on wrong dtype) will propagate to the per-region catch at `_run_table_extraction:1006`. That per-region catch logs a WARNING and skips the region — correct isolation behavior. No full extraction abort.

---

## §13 Handoff

**Next actor:** dev-pdf-extractor — implement §9 change-list in a single commit.
**Then:** ops — `docker compose build --no-cache pdf-extractor` + force-recreate.
**Then:** qa — FPT Q4 2025 sentinel + corpus sweep per §10.
**Gate:** PEK-EXIT (PO sign-off) unchanged — direct DB rows non-empty + user verbal G9.

**RELATIONSHIP TO PRIOR TASKS:** This task replaces `PEK-IMPORT-CHAIN` in the ready queue. `PEK-IMPORT-CHAIN` status should be updated to SUPERSEDED (its work is committed in `6c124745`). This is the next task in the `PEK-INTEGRATE` sprint for dev-pdf-extractor.
