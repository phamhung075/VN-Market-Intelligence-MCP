# Task Report: PEK-QA (cycle-131) — Option B Engine Verification (commit 6c124745)
date: 2026-05-27T05:36Z
outcome: CHANGES_REQUESTED (blocking layout-config reading bug found; STAGE 1+2 pending market close)

---

## Executive Summary

Commit `6c124745` (PEK-IMPORT-CHAIN — bypass pdf_extract_kit.tasks via `_PekLayoutModel`) correctly
fixes the prior blocker (unimernet ModuleNotFoundError). The import chain is clean, the smoke gate
passes in the running container, and all static gates PASS.

However, a new blocking issue is found during static analysis: the `_load_pek_models()` function
reads `layout_cfg.get("model", {})` from `layout_detection_yolo.yaml`, but the YAML has NO top-level
`model` key (its structure is `tasks.layout_detection.model_config`). This causes `model_cfg` to be
`{}` → `model_cfg["model_path"]` raises `KeyError` → caught silently → `layout_task = None` →
DocLayout-YOLO layout detection is DISABLED. Extraction falls back to geometry-only page grouping.

STAGE 1 (FPT Q4 sentinel extraction) and STAGE 2 (corpus sweep) are BLOCKED by market hours
(currently 05:36 UTC; guard fires until 09:00 UTC Mon-Fri). A background script is queued to
trigger all 12 report extractions at 09:00 UTC.

---

## Deployment Confirmation

| Field | Value |
|---|---|
| Container | vn-market-intelligence-mcp-pdf-extractor-1 |
| Image SHA | 455eeb073801 |
| Image size | 4.74 GB |
| Status | Up ~1 minute (healthy) at QA start |
| Commit under test | 6c124745 |
| Prior image (swapped out) | 3b4526c0 (unimernet crash) |

---

## Static Gates

### Smoke Gate (build-time + running container verification)
```
--- PEK import chain smoke gate (PEK-IMPORT-CHAIN) ---
numpy 2.2.6
cv2 4.13.0
fitz (PyMuPDF) 1.27.2.3
omegaconf OK
doclayout_yolo.YOLOv10 OK
paddleocr.PaddleOCR OK
torch 2.5.1+cpu
pek_engine_adapter import OK — no pdf_extract_kit.tasks trigger
--- pek-import-chain: ALL OK ---
```
The smoke gate now imports `pek_engine_adapter` MODULE ITSELF, so any import chain regression
inside `_load_pek_models()` would fail the build. PASS.

### Import Chain Fix Verification
```python
# Verified in running container:
from infrastructure.pek_engine_adapter import _PekLayoutModel, _load_pek_models
# → import OK — no pdf_extract_kit.tasks trigger
```
Prior blocker (unimernet ModuleNotFoundError): FIXED.
Executable `pdf_extract_kit.tasks.*` imports in production code: 0 (all references are in
docstrings/comments — verified by grep).

### PEK Subtree
`git -C apps/pdf-extractor/PDF-Extract-Kit diff` → empty (0 bytes). PRISTINE.

### Frozen Surfaces
Files frozen by QA:
- `apps/pdf-extractor/infrastructure/text_table_extractor.py` — NOT in commit 6c124745
- `apps/pdf-extractor/sandbox/runner.py` — NOT in commit 6c124745
- `pilot-status-pdf-extractor.json` — NOT in commit 6c124745
- `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` — NOT in commit 6c124745

Commit 6c124745 changes only: `apps/pdf-extractor/Dockerfile` + `apps/pdf-extractor/infrastructure/pek_engine_adapter.py`. PASS.

### Unit Tests
| Test Set | Result |
|---|---|
| pdf-extractor unit suite (host, non-slow) | 581/581 PASS |
| pdf-extractor full suite (host, non-slow) | 687/687 PASS (7 slow deselected) |
| test_pek_engine_adapter.py | 15/15 PASS |
| test_market_hours_guard.py | 12/12 PASS |
| test_ocr_backends.py | 21/21 PASS |
| scenarios/pek_single_doc_extraction.py | 10/10 PASS |

Prior cycle-130 blocker #2 (patch target test failing): FIXED in this commit.

### DDD Compliance
```
Analyzed 96 files, 207 dependencies.
Fence-A: primitives must not import infrastructure, application, or interface — KEPT
Fence-B: modules must not import infrastructure or interface — KEPT
Contracts: 2 kept, 0 broken.
```
PASS.

### Security Scan
- `process.env` in production code: 0 matches — PASS
- Hardcoded secrets/tokens/passwords: 0 executable matches (all in docstrings) — PASS

### Market-Hours Guard
Layer 2 (HTTP handler):
- Current time at QA start: 05:12 UTC Wednesday (inside HOSE market window 02:00-08:59 UTC Mon-Fri)
- POST /pek-extract → HTTP 503 `{"error":"market_open","retry_after":"after 15:00 ICT (08:00 UTC)"}`
- Guard is working correctly. The 503 is expected and correct — do NOT count as failure.
- Market closes at 09:00 UTC. STAGE 1/2 extraction deferred to post-market.

### mcp-server Regression Gate
- `bun test src/__tests__/1272-push-bctc-layout.test.ts` → 20/20 PASS
- pushBctcLayoutHandler writes to `bctc_layout_units` correctly — PASS

---

## BLOCKING ISSUE FOUND (static analysis)

### Blocking #1 — Layout config key mismatch: DocLayout-YOLO silently disabled
**File:** `apps/pdf-extractor/infrastructure/pek_engine_adapter.py:221`
**Code:**
```python
model_cfg = dict(OmegaConf.to_container(
    layout_cfg.get("model", {}), resolve=True
))
```
**Config:** `apps/pdf-extractor/PDF-Extract-Kit/configs/layout_detection_yolo.yaml`
```yaml
inputs: assets/demo/layout_detection
outputs: outputs/layout_detection
tasks:
  layout_detection:
    model: layout_detection_yolo
    model_config:
      img_size: 1024
      conf_thres: 0.25
      iou_thres: 0.45
      model_path: models/Layout/YOLO/doclayout_yolo_ft.pt
```
**Problem:** The YAML has NO top-level `model` key. `layout_cfg.get("model", {})` returns `{}`.
`model_cfg["model_path"]` → `KeyError: 'model_path'` → caught silently at line 228 →
`layout_task = None` → DocLayout-YOLO layout detection DISABLED.

**Old code (before fix):** Passed full `layout_cfg` object to `LayoutDetectionTask(layout_cfg)`.
`LayoutDetectionTask` knew to navigate `tasks.layout_detection.model_config` itself.

**Fix needed (dev, NOT QA):** Change line 221 to read the correct YAML path:
```python
# Option: navigate tasks.layout_detection.model_config
model_cfg_node = (layout_cfg.get("tasks", {})
                  .get("layout_detection", {})
                  .get("model_config", {}))
model_cfg = dict(OmegaConf.to_container(model_cfg_node, resolve=True))
```
**Impact:** Without layout detection, extraction falls back to `_get_page_dims_fallback()` (geometry-only,
no bbox-guided page grouping). Rows may be produced but column structure quality is uncertain.

**Classification:** This is a code bug introduced in commit 6c124745. Blocking — DocLayout-YOLO is the
core of the PEK extraction. The fix bypassed the import crash but broke the model loading.

---

## Fleet RAM (cold start, pre-model-load)

| Container | RAM Used | Limit |
|---|---|---|
| pdf-extractor | 57.71 MiB | 2.5 GiB |
| rag-service | 976.5 MiB | 1.5 GiB |
| mcp-server | 494.3 MiB | 2.0 GiB |
| frontend | 99.74 MiB | 512 MiB |
| api-gateway | 17.17 MiB | 512 MiB |
| macro-indicators | 15.27 MiB | 1.5 GiB |
| kinh-dich-service | 11.61 MiB | 512 MiB |
| mcp-gateway | 24.69 MiB | 512 MiB |
| **Fleet total** | **~1.7 GiB** | **8 GiB cap** |

Fleet is well within 8GB cap at cold start. With DocLayout-YOLO + PaddleOCR loaded:
estimated additional ~1-2GB (YOLO model ~100MB, PaddleOCR ~200-500MB). Fleet RAM
with models resident estimated at ~3-4GB — within cap, but not yet measured (extraction pending
market close).

---

## STAGE 1 — FPT Q4 Sentinel: BLOCKED (market hours)

- Report ID: e71f845d-ffa5-48f9-8f09-30ac2cd09c65
- PDF: /app/data/pdfs/20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf
- Extraction trigger: BLOCKED — guard returns HTTP 503 until 09:00 UTC
- Current bctc_layout_units rows for e71f845d: 0 (never extracted via PEK path)
- Background script queued to trigger at market close (~09:00 UTC)
- VERDICT: NOT YET RUN — counts as FAIL per honest-green discipline until extraction completes

---

## STAGE 2 — Corpus Sweep: BLOCKED (market hours)

### Corpus Enumeration

14 financial_reports in DB. 12 with pdf_path set (eligible for PEK extraction):

| # | ticker | period | report_id (8) | pdf_path |
|---|---|---|---|---|
| 1 | FPT | 2025-Q4 | e71f845d | 20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf |
| 2 | ACB | 2026-Q1 | fea19bae | 20260422-ACB-BCTC-Hop-nhat-Quy-1-nam-2026.pdf |
| 3 | BSR | 2025-Q4 | ac3f0d01 | 20260130-BSR-Bao-cao-tai-chinh-rieng-Quy-4-nam-2025.pdf |
| 4 | DGC | 2025-Q4 | 0c6f0535 | 20260130-DGC-BCTC-hop-nhat-quy-4-2025.pdf |
| 5 | DHG | 2026-Q1 | 620a9d00 | 20260420-DHG-BCTC-Quy-1.2026.pdf |
| 6 | DIG | 2025-Q4 | 173038f2 | 20260129-DIG-BCTC-hop-nhat-quy-4-nam-2025-cks.pdf |
| 7 | EIB | 2026-Q1 | 549d458a | 20260428-EIB-BCTC-hop-nhat-Q1.2026.pdf |
| 8 | FPT | 2026-Q1 | e8ea3df5 | 20260424-FPT-BCTC-hop-nhat-Quy-1-nam-2026.pdf |
| 9 | HPG | 2025-Q4 | d6f1885f | 20260130-HPG-Bao-cao-tai-chinh-rieng-Cong-ty-me-va-giai-trinh-Q4.2025.pdf |
| 10 | SHB | 2025-Q4 | 59212e0d | 20260130-SHB-Bao-cao-tai-chinh-Q4.2025-Hop-nhat.pdf |
| 11 | VEA | 2025-Q4 | b48f7e6a | BCTC VEA 31.12.2025 - RIENG - VN.pdf |
| 12 | VNM | 2025-Q4 | 4316f6d1 | BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf |

Excluded (no pdf_path in financial_reports):
- VCB 2025-Q1 (6e967457): pdf_path = NULL
- VCB 2025-Q4 (466495f7): pdf_path = NULL

PDFs on disk but no financial_report entry: GAS 2026-Q1, VCB_2025_Q1.pdf, VCB_2025_Q4.pdf (3 files,
not in scope for PEK extraction via report_id).

Total extraction-eligible: **12 reports**. Extraction pending market close.

Per-report results table: **NOT YET RUN**.

---

## Overall Verdict

**RED — CHANGES_REQUESTED**

| Gate | Status |
|---|---|
| Image 455eeb073801 healthy | PASS |
| PEK subtree pristine | PASS |
| Frozen surfaces untouched | PASS |
| unimernet ModuleNotFoundError (prior crash) | FIXED |
| Smoke gate imports pek_engine_adapter | PASS |
| Unit tests 687/687 | PASS |
| Scenario tests 10/10 | PASS |
| DDD fence 2/2 KEPT | PASS |
| Security: 0 violations | PASS |
| Market-hours guard 503 | PASS (guard working) |
| mcp-server pushBctcLayout 20/20 | PASS |
| **Layout config key mismatch (KeyError "model_path")** | **BLOCKING — DocLayout-YOLO disabled** |
| STAGE 1 FPT sentinel extraction | NOT-RUN (market-open blocker) |
| STAGE 2 corpus sweep | NOT-RUN (market-open blocker) |

**BLOCKING ISSUE:** `pek_engine_adapter.py:221` reads `layout_cfg.get("model", {})` but YAML has
no top-level `model` key — should be `tasks.layout_detection.model_config`. DocLayout-YOLO silently
disabled. Fix needed in `pek_engine_adapter.py` before corpus sweep is meaningful.

**Market-open note:** Extraction runs blocked until 09:00 UTC by correct HTTP 503 guard. Background
script queued. STAGE 1/2 results will be appended when market closes.

NEXT: dev-pdf-extractor — fix YAML config reading path at pek_engine_adapter.py:221 →
ops rebuild → qa re-runs STAGE 1+2.
