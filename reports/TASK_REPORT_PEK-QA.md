# Task Report: PEK-QA — LIVE Two-Stage Verification (commit e6b84ca5)

date: 2026-05-27
commit_under_test: e6b84ca5 (fix(pdf-extractor): PEK-LAYOUT-CFG — config-path + model_path resolution + fail-loud)
image_sha: fb6fda6f17cf (built 2026-05-27 08:00 CEST)
outcome: RED — CHANGES_REQUESTED
qa_utc: 2026-05-27T09:04–10:30Z
market_state_at_start: CLOSED (09:04 UTC — past 08:59 UTC close, extraction permitted)

---

## Overall Verdict: RED

The config-path fix (e6b84ca5) is structurally CORRECT and VERIFIED: DocLayout-YOLO loads
successfully, layout detection runs on all pages, fail-loud is wired. However, the OCR TEXT step
(`TesseractVieBackend.recognize_text`) throws `NameError: name '_to_pil' is not defined` on every
call. The exception is caught silently (returns `("", 0.0)`), producing empty `stitched_markdown`
in every table unit across all 5 extracted reports. Code 100 cannot be found. Stage 1 and Stage 2
FAIL on content — not on the config fix itself.

Root cause is a separate code defect in `infrastructure/ocr_backends.py:108` — `_to_pil` is called
but never defined in that module.

---

## 503 Market-Hours Guard: INTACT

- `CRON_BCTC_REPARSE_JOB=0 21 * * *` confirmed in docker-compose.yml (unchanged)
- HTTP guard: `is_vn_market_open_utc()` imported from `domain.primitives.market_hours.primitive`
  returns 503 during 02:00–08:59 UTC Mon–Fri — code at `interface/handlers.py:403` (unchanged)
- QA verification: at 09:04 UTC (market closed), endpoint returned HTTP 202 — guard correctly open
- Prior run at 05:12 UTC (cycle-131) returned HTTP 503 — guard correctly closed
- VERDICT: 503 guard UNCHANGED and WORKING

---

## Stage 1 — FPT Q4 2025 Sentinel (report_id: e71f845d)

### Trigger and HTTP response

```
POST /pek-extract
  {"report_id": "e71f845d-ffa5-48f9-8f09-30ac2cd09c65",
   "pdf_path": "/app/data/pdfs/20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf"}
HTTP 202 Accepted (market CLOSED at 09:04 UTC)
```

### Model load sequence (verified from docker logs)

Attempt 1 (09:04 UTC): FAILED — model weights missing at
  `/app/PDF-Extract-Kit/models/Layout/YOLO/doclayout_yolo_ft.pt`
  Auto-download from GitHub returned 404 (doclayout_yolo v8.1.0 GitHub assets URL does not exist).
  Fail-loud WORKED CORRECTLY: RuntimeError raised, not silent degradation.

QA action: Downloaded model via `huggingface_hub.hf_hub_download` from
  `opendatalab/PDF-Extract-Kit-1.0` to `/app/PDF-Extract-Kit/models/Layout/YOLO/doclayout_yolo_ft.pt`
  (38.8 MB). This is a first-run setup requirement — named volume `pek_model_cache` is empty in
  current image.

Attempt 2 (after weights placed): MODELS LOADED SUCCESSFULLY

```
PekEngineAdapter: _PekLayoutModel loaded (DocLayout-YOLO, CPU)
PekEngineAdapter: PaddleOCR PP-StructureV2 table mode loaded (CPU)
PekEngineAdapter._run_extraction: report_id=e71f845d...
PekEngineAdapter: layout detection complete — 46 pages
PekEngineAdapter: table extraction complete — 30 pages with tables
LayoutFirstPushClient.push_layout OK: units_stored=39 pages_stored=46
_run_pek_extract: DONE report_id=e71f845d units_stored=39 pages_stored=46
```

No crash. No RuntimeError. No traceback. The config-path fix (e6b84ca5) WORKS.

### Direct DB verification (python3 sqlite3 readonly in mcp-server container)

```sql
SELECT COUNT(*) FROM bctc_layout_units WHERE report_id LIKE 'e71f845d%';
-- Result: 39
```

COUNT = 39 > 0: PASS

### Layout units breakdown

| page_type | units | table_units_with_empty_md |
|---|---|---|
| prose | 16 | N/A |
| table | 23 | 23 (ALL empty) |

### 15-row sample — Column Alignment Check

All 39 units have `stitched_markdown = ""` (empty string, LENGTH=0). No row content to inspect.
No markdown table structure. Code 100 (TONG CONG TAI SAN / total assets) ABSENT.

This is NOT a layout detection failure. DocLayout-YOLO correctly identified 23 table pages.
The zones_json for page 5 shows valid column gutters: `col_0: x_min=225, x_max=1494`.
The failure is in the OCR TEXT step — `TesseractVieBackend.recognize_text` returns ("", 0.0)
for every table region crop due to `_to_pil` undefined at `ocr_backends.py:108`.

### PASS bar evaluation

| Check | Result |
|---|---|
| No crash / traceback during extraction | PASS — clean DONE, no RuntimeError |
| rows > 0 (layout units COUNT) | PASS — 39 units stored |
| 15-row stitched_markdown sample CLEAN | FAIL — all stitched_markdown empty |
| Code 100 present | FAIL — absent (empty content) |
| No failure modes (a) junk-text rows | INCONCLUSIVE — content empty |
| No failure modes (b) value-no-label orphans | INCONCLUSIVE — content empty |
| No failure modes (c) missing code 100 | FAIL — code 100 absent |
| No failure modes (d) mass duplicate rows | INCONCLUSIVE — content empty |
| No failure modes (e) null prior-period column | INCONCLUSIVE — content empty |
| 503 guard unchanged | PASS |
| pdf-extractor RAM | PASS — 1.44 GiB / 2.5 GiB limit |
| Total fleet RAM | PASS — 3.57 GiB / 8 GiB cap |

### Stage 1 verdict: FAIL

---

## Stage 2 — Corpus Sweep (the /goal)

### Excluded reports (pdf_path = NULL, correctly skipped)

| report_id | ticker | reason |
|---|---|---|
| 6e967457 | VCB 2025-Q1 | pdf_path = NULL — PDF never downloaded (SSC doc blocked/geo-restricted) |
| 466495f7 | VCB 2025-Q4 | pdf_path = NULL — PDF never downloaded (SSC doc blocked/geo-restricted) |

Both are known-excluded. Corpus = 12 eligible, 2 excluded = 14 total.

### Corpus results (5 verified via PEK path during this QA run)

| report_id (short) | ticker / period | units | pages | table_units | non_empty_md | code-100 | failure modes | PASS/FAIL |
|---|---|---|---|---|---|---|---|---|
| e71f845d | FPT / 2025-Q4 | 39 | 46 | 23 | 0 | NO | content empty | FAIL |
| fea19bae | ACB / 2026-Q1 | 27 | 33 | 11 | 0 | NO | content empty | FAIL |
| ac3f0d01 | BSR / 2025-Q4 | 24 | 30 | 14 | 0 | NO | content empty | FAIL |
| b48f7e6a | VEA / 2025-Q4 | 34 | 51 | 11 | 0 | NO | content empty | FAIL |
| d6f1885f | HPG / 2025-Q4 | 20 | 24 | 13 | 0 | NO | content empty | FAIL |

### Remaining 7 reports (not yet extracted via current PEK path at report write time)

| report_id (short) | ticker / period | expected outcome |
|---|---|---|
| 620a9d00 | DHG / 2026-Q1 | FAIL — same _to_pil bug applies |
| 59212e0d | SHB / 2025-Q4 | FAIL — same _to_pil bug applies |
| 549d458a | EIB / 2026-Q1 | FAIL — same _to_pil bug applies |
| 4316f6d1 | VNM / 2025-Q4 | FAIL — same _to_pil bug applies |
| 173038f2 | DIG / 2025-Q4 | FAIL — same _to_pil bug applies |
| 0c6f0535 | DGC / 2025-Q4 | FAIL — same _to_pil bug applies |
| e8ea3df5 | FPT / 2026-Q1 | FAIL — same _to_pil bug applies (prior LF-path data in DB from 2026-05-26 is not PEK output) |

The `_to_pil` bug is in `TesseractVieBackend.recognize_text` — a shared code path called for
every table region crop on every report. No report-specific variation can change this outcome.
The 5 verified reports are a representative sample; the remaining 7 would produce identical results.

### Stage 2 verdict: FAIL

The /goal "all bctc downloaded can extract correct table" is NOT MET.
5 of 5 verified reports FAIL. Expected: 12 of 12 FAIL.

---

## Static Gates

### Unit Tests
```
694 pass / 0 fail / 7 slow deselected
```
PASS

### DDD Fence
```
lint-imports: 96 files, 207 dependencies analyzed
Fence-A: KEPT  Fence-B: KEPT  Contracts: 2 kept, 0 broken
```
PASS

### Security
- process.env in source: 0 matches
- hardcoded secrets/credentials: 0 matches
PASS

### Config-Path Fix Verification (structural, in-container)

```python
OmegaConf.load('/app/PDF-Extract-Kit/configs/layout_detection_yolo.yaml')
has tasks: True
has layout_detection: True
has model_config: True
model_config: {img_size: 1024, conf_thres: 0.25, iou_thres: 0.45,
               model_path: models/Layout/YOLO/doclayout_yolo_ft.pt, ...}
FAIL-LOUD guard: PASS — config structure correct, RuntimeError would fire if missing
```
Fix e6b84ca5 is STRUCTURALLY CORRECT. PASS.

---

## RAM

| container | usage | limit |
|---|---|---|
| pdf-extractor | 1.44 GiB | 2.5 GiB |
| rag-service | 1.19 GiB | 1.5 GiB |
| mcp-server | 0.84 GiB | 2.0 GiB |
| others | ~0.10 GiB | — |
| TOTAL FLEET | 3.57 GiB | 8 GiB cap |

PASS — well under cap.

---

## Blocking Issues (file:line)

### Blocking Issue 1 — ocr_backends.py:108 — `_to_pil` undefined

File: `apps/pdf-extractor/infrastructure/ocr_backends.py:108`

```python
pil_image = _to_pil(image_or_region)  # line 108 — _to_pil is NOT defined anywhere in this module
```

`_to_pil` is called but never defined in `ocr_backends.py`. No `def _to_pil` exists anywhere in
the file. Every call to `TesseractVieBackend.recognize_text(image_or_region)` with a non-None
numpy array reaches line 108, raises `NameError: name '_to_pil' is not defined`, is caught by the
bare `except Exception` at line 134, and returns `("", 0.0)` silently.

Effect: 100% of OCR TEXT calls produce empty output. `stitched_markdown` is empty in every table
unit for every report. Code 100 is never stored. The /goal cannot be met.

Fix options (dev-pdf-extractor to choose):
  A. Define `_to_pil` as a module-level helper in `ocr_backends.py`:
     ```python
     def _to_pil(img):
         from PIL import Image
         import numpy as np
         if isinstance(img, np.ndarray):
             return Image.fromarray(img)
         return img
     ```
  B. Set `OCR_TEXT_BACKEND=paddleocr` as default in docker-compose.yml (PaddleOCR path at
     `pek_engine_adapter.py:987-1004` has no `_to_pil` dependency and uses the loaded
     `paddle_table` instance directly — this path is known-working).

### Blocking Issue 2 — test_ocr_backends.py — real numpy array path untested

File: `apps/pdf-extractor/__tests__/test_ocr_backends.py`

`TesseractVieBackend.recognize_text` is never tested with a real `numpy.ndarray` input.
All tests use `None` (exits early at line 92) or `object()` (falls to import check at line 97).
The `_to_pil` call at line 108 is therefore dead code from test coverage perspective.

Fix: Add test: `backend.recognize_text(np.zeros((50, 200, 3), dtype=np.uint8))` — should
return `("", 0.0)` gracefully without NameError (after `_to_pil` is defined).

### Non-blocking

3. Model weights not pre-seeded on `pek_model_cache` volume: `doclayout_yolo_ft.pt` (38.8 MB)
   must be manually downloaded on first run. GitHub auto-download returns 404 for v8.1.0 URL.
   Recommend: add startup script that downloads via HuggingFace (`opendatalab/PDF-Extract-Kit-1.0`)
   if weights absent.

---

## config-path fix (e6b84ca5) — verified correct

| Fix | Verified |
|---|---|
| FIX 1: reads `layout_cfg.tasks.layout_detection.model_config` (not nonexistent `model` key) | YES — live YAML structure confirmed in container |
| FIX 2: resolves relative `model_path` against `_pek_root` | YES — `_PekLayoutModel.__init__` receives correct absolute path |
| FIX 3: RuntimeError on broken config instead of silent logger.warning + layout_task=None | YES — confirmed by Attempt 1 failure (weights absent → clean RuntimeError logged) |

The fix closes the cycle-131 YAML-config blocker. The `_to_pil` defect is a pre-existing latent
bug in `ocr_backends.py` that only became reachable once models actually loaded after the config fix.

---

## Recurring-Bug Rule

e6b84ca5 is the 4th+ fix commit on `apps/pdf-extractor` (preceded by 9ab93889, efd23447, and
others). Per the recurring-bug rule: if dev-pdf-extractor proposes an architectural change to the
OCR backend strategy (not just the one-liner `_to_pil` fix), architect should review before
implementation. The one-liner Option A fix does not require architect review. Option B
(OCR_TEXT_BACKEND default change) is configuration-only and also does not require architect review.

Route: dev-pdf-extractor → ops rebuild → qa re-run.
