# Task Report: PEK-QA — G9 Gate (PEK-INTEGRATE OCR Engine Verification)
date: 2026-05-27
outcome: FAIL — CHANGES_REQUESTED

---

## Executive Summary

The PEK-INTEGRATE engine (commit efd23447) boots healthy and passes all static gates (unit tests, DDD, security, frozen surfaces, git pristine). However, the SENTINEL extraction of FPT Q4 2025 (report_id `e71f845d-ffa5-48f9-8f09-30ac2cd09c65`) **crashes at runtime** with a numpy ABI version mismatch. Zero rows were produced. The G9 bar (clean live BCTC rows in market.db) is not met.

Verdict: **FAIL**. Do not close PEK-QA. Bounce to dev-pdf-extractor.

---

## Static Gates

### Git State
- `git -C apps/pdf-extractor/PDF-Extract-Kit diff` → exit 0, empty (PRISTINE confirmed)
- Frozen surfaces (`text_table_extractor.py`, `sandbox/runner.py`) → zero diff vs HEAD (PASS)
- `git diff HEAD -- apps/pdf-extractor/ --name-only` → empty (no stray tracked changes)
- Commit under test: efd23447 (PEK-DEPLOY-FIX)

### Unit Tests (host venv, Python 3.13)
- Full suite (excluding integration): **629 pass / 0 fail** (PASS)
- `test_pek_engine_adapter.py`: 15/15 PASS
- `test_market_hours_guard.py`: 12/12 PASS
- `test_ocr_backends.py`: 21/21 PASS
- Scenarios `pek_single_doc_extraction.py`: 9/10 — **1 FAIL** (see Blocking Issues #2)

### DDD Compliance
- import-linter: **Fence-A KEPT, Fence-B KEPT** — 95 files, 206 dependencies, 0 broken contracts
- Domain layer: zero actual imports from infrastructure/application/interface (grep clean)
- Result: **PASS**

### Security Scan
- `process.env` in PEK-scoped files (pek_engine_adapter.py, handlers.py, main.py, domain/): **0 matches** (PASS)
- Hardcoded secrets/tokens in PEK files: **0 matches** (PASS)
- Result: **PASS**

### Market-Hours Guard (Layer 2 — HTTP 503)
- Tested via FastAPI TestClient with `patch('interface.handlers.is_vn_market_open_utc', return_value=True)`
- Result: HTTP **503** `{"error": "market_open", "retry_after": "after 15:00 ICT (08:00 UTC)"}` — **PASS**
- Boundary logic confirmed inside container: Mon 02:00 UTC → open; Mon 01:59 UTC → closed; Fri 08:59 UTC → open — **PASS**
- Current UTC at test time: 22:02 Tuesday (market CLOSED — extraction permitted)

### Market-Hours Guard (Layer 1 — Cron Schedule)
- `docker-compose.yml`: `CRON_BCTC_REPARSE_JOB: "0 21 * * *"` (21:00 UTC = 04:00 ICT, deep off-market) — **PASS**

### Fleet RAM (Cold-start — before model load)
| Container | RSS | Limit |
|---|---|---|
| pdf-extractor | 377 MiB | 2.5 GiB |
| mcp-server | 580 MiB | 2.0 GiB |
| rag-service | 1.489 GiB | 1.5 GiB |
| All others | < 20 MiB each | — |
| **Fleet total** | **~2.5 GiB** | 8 GiB cap |

Fleet is safe at cold-start (models never loaded due to crash). RAM gate: **PASS at cold-start; UNKNOWN at hot (crash prevents measurement)**.

---

## THE SENTINEL — Live Extraction: FAIL

### Trigger
```
POST http://localhost:5001/pek-extract
{"report_id": "e71f845d-ffa5-48f9-8f09-30ac2cd09c65",
 "pdf_path": "/app/data/pdfs/20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf"}
→ HTTP 202 Accepted (guard passed correctly, background task started)
```

### Crash Log (docker compose logs pdf-extractor)
```
INFO:infrastructure.pek_engine_adapter:PekEngineAdapter: loading models (first extraction request)...
RuntimeError: module compiled against ABI version 0x1000009 but this version of numpy is 0x2000000
ERROR:interface.handlers:_run_pek_extract: FAILED report_id=e71f845d-ffa5-48f9-8f09-30ac2cd09c65
  error=numpy.core.multiarray failed to import
```

Full traceback path:
```
_load_pek_models() →
  from doclayout_yolo import YOLOv10 →
    doclayout_yolo/data/base.py → import cv2 →
      cv2/__init__.py bootstrap() →
        ImportError: numpy.core.multiarray failed to import
```
Same crash for `from paddleocr import PaddleOCR` (same cv2 dependency).

### Root Cause
`apps/pdf-extractor/requirements-pek.txt:49`:
```
numpy>=1.24.0      ← allows numpy 2.x to resolve
```
pip resolves to **numpy 2.4.4** (latest 2.x). Both `opencv-python==4.6.0.66` and `paddlepaddle==3.3.1` were compiled against **numpy 1.x C API** (ABI `0x1000009`). numpy 2.x changed the C ABI to `0x2000000` — binary incompatible. The fix is a narrow upper bound: `numpy>=1.24.0,<2.0.0`.

### DB Count — Direct market.db Query (bun:sqlite, readonly)
```
bctc_layout_units WHERE report_id = 'e71f845d...': 0 rows
bctc_page_zones   WHERE report_id = 'e71f845d...': 0 rows
bctc_table_rows   WHERE report_id = 'e71f845d...' (pre-existing BT3): 79 rows (UNCHANGED)
```
**Zero PEK rows produced.** No row sample possible — extraction never ran.

### BCTC-TABLE-3 Failure Mode Check
Cannot evaluate row quality — extraction crashed before producing any output.
The BCTC-TABLE-3 failure modes (junk text, orphan values, missing code 100, dups, null priors) are **untestable** until the crash is fixed and a real extraction completes.

---

## Blocking Issues

### Blocking #1 — CRITICAL runtime crash: numpy ABI mismatch
**File:** `apps/pdf-extractor/requirements-pek.txt:49`
**Current:** `numpy>=1.24.0`
**Issue:** pip resolves to numpy 2.4.4 (2.x ABI = `0x2000000`). Both `opencv-python==4.6.0.66` and `paddlepaddle==3.3.1` compiled against numpy 1.x ABI (`0x1000009`). Import fails at first extraction call.
**Fix required:** `numpy>=1.24.0,<2.0.0` — then docker compose build pdf-extractor + force-recreate.
**Evidence:** Container log traceback above; `python3 -c "import doclayout_yolo"` fails with same error inside running container.

### Blocking #2 — Scenario test defect: patch target missing
**File:** `apps/pdf-extractor/scenarios/pek_single_doc_extraction.py:TestPekOcrBackendInjectionScenario::test_fake_ocr_backend_result_in_extraction_output`
**Issue:** `patch("infrastructure.pek_engine_adapter.convert_from_path")` — `convert_from_path` is NOT a module-level name in `pek_engine_adapter`; it is imported lazily inside `_run_table_extraction()`. The `with patch(...)` block raises `AttributeError: <module '...'> does not have the attribute 'convert_from_path'`.
**Impact:** 1 of 10 scenario tests fails (the 7/7 claim in handoff referenced an earlier test count; the new `test_fake_ocr_backend_result_in_extraction_output` is a new test that fails).
**Fix required:** Patch target must be where it is used: `patch("pdf2image.convert_from_path")` or move the import to module level. Dev-pdf-extractor to fix.

---

## What Passes (for completeness)

| Gate | Result |
|---|---|
| PDF-Extract-Kit pristine (zero-diff) | PASS |
| Frozen surfaces (text_table_extractor.py, sandbox/runner.py) | PASS |
| Unit tests 629/629 | PASS |
| Market hours guard HTTP 503 (mocked) | PASS |
| Market hours guard boundary logic (all 12 cases) | PASS |
| Layer-1 cron schedule CRON_BCTC_REPARSE_JOB=0 21 \* \* \* | PASS |
| DDD: Fence-A + Fence-B KEPT | PASS |
| Security: 0 process.env, 0 secrets | PASS |
| No stray tracked changes in apps/pdf-extractor | PASS |
| Fleet RAM at cold-start (~2.5 GiB vs 8 GiB cap) | PASS |
| FPT Q4 2025 PDF present in container | PASS |
| HTTP 202 route to background task (guard correctly bypassed at 22:02 UTC) | PASS |

---

## Verdict

**FAIL — CHANGES_REQUESTED**

The engine crashes at first model load. Zero live BCTC rows produced. The G9 done-bar (clean rows in market.db via direct DB query) is not met. A healthy boot with a runtime numpy ABI crash is still a FAIL.

**Do NOT close PEK-QA. Do NOT mark PEK-INTEGRATE done.**

NEXT: dev-pdf-extractor — apply two fixes:
1. `requirements-pek.txt:49` → `numpy>=1.24.0,<2.0.0`
2. `scenarios/pek_single_doc_extraction.py` — fix `convert_from_path` patch target

After fixes: ops must `docker compose build pdf-extractor && docker compose up --force-recreate pdf-extractor`. Then re-run PEK-QA with the FPT Q4 2025 sentinel (the actual extraction + DB row quality check).
