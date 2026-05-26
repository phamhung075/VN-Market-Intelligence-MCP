# Task Report: PEK-QA (RE-RUN) — G9 Gate (PEK-INTEGRATE OCR Engine Verification)
date: 2026-05-27
outcome: FAIL — CHANGES_REQUESTED

---

## Context

This is the SECOND PEK-QA run. The first run (cycle-129) FAILED on a numpy 1.x vs 2.x ABI mismatch
(commit efd23447). That was fixed by commit `9ab93889` (PEK-DEP-RECONCILE: numpy-2 coherent pin set +
smoke gate). This run verifies commit `9ab93889`, deployed image `3b4526c0…`, force-recreated by ops.

---

## Executive Summary

The numpy ABI crash IS fixed — the smoke gate passes inside the running container (numpy 2.2.6,
cv2 4.12.0.88, paddleocr 2.10.0, doclayout_yolo OK, torch 2.5.1+cpu — pek-native-imports: ALL OK).
However, the sentinel extraction FAILS again at first model load with a new error:
`No module named 'unimernet'`. Zero rows produced. The G9 bar (clean live BCTC rows in market.db)
is not met.

Root cause: `pdf_extract_kit/tasks/__init__.py` imports ALL tasks at module level — including
`FormulaRecognitionTask` which chains to `formula_recognition/__init__.py` which imports
`unimernet` (not installed, intentionally excluded per PEK CPU-trimmed spec). ANY import of
any `pdf_extract_kit.tasks.*` symbol triggers this chain. The smoke gate does NOT test PEK task
imports — it only tests numpy/cv2/paddleocr/doclayout_yolo/torch — so the build passes green
while the runtime crash is invisible until first extraction.

Verdict: **FAIL**. Do not close PEK-QA. Bounce to dev-pdf-extractor (fixer ceiling = 2 fix rounds;
this is round 3 → architect review required before any further dev fix).

---

## Image + Container State

| Field | Value |
|---|---|
| Container | vn-market-intelligence-mcp-pdf-extractor-1 |
| Status | Up 2 minutes (healthy) at trigger time |
| Image SHA | sha256:3b4526c0668d73ebb43f7119d30b1e3fb83267a4b6ef8b15c39fdde12c5c42ac |
| Commit under test | 9ab93889 (PEK-DEP-RECONCILE) |
| UTC at extraction | 22:47 Tuesday → market CLOSED (guard correctly bypassed) |

---

## Static Gates

### Smoke Gate (build-time ABI check)
Confirmed passes inside running container:
```
numpy 2.2.6
cv2 4.13.0  (opencv-python==4.12.0.88)
paddleocr import OK  (2.10.0)
doclayout_yolo import OK
torch 2.5.1+cpu
pek-native-imports: ALL OK
```
ABI mismatch from prior FAIL: **RESOLVED**. numpy 2.2.6 is within the 2.0.0–2.3.0 window.

### Installed Package Versions
| Package | Version | numpy-2 compatible |
|---|---|---|
| numpy | 2.2.6 | n/a (ABI anchor) |
| opencv-python | 4.12.0.88 | YES |
| paddleocr | 2.10.0 | YES |

### Git State
- `git -C apps/pdf-extractor/PDF-Extract-Kit diff` → exit 0, empty — **PRISTINE confirmed**
- Frozen surfaces (`text_table_extractor.py`, `sandbox/runner.py`, `pilot-status.json`) → zero diff
- Commit `9ab93889` → 3 files only: Dockerfile + requirements-pek.txt + scenarios/pek_single_doc_extraction.py

### Unit Tests (host venv)
- Full suite (excluding integration): **629/629 PASS**
- `test_pek_engine_adapter.py`: 15/15 PASS
- `test_market_hours_guard.py`: 12/12 PASS
- Scenarios `pek_single_doc_extraction.py`: **10/10 PASS** (previous test-patch-target blocker #2 FIXED)

### DDD Compliance
- import-linter: **Fence-A KEPT, Fence-B KEPT** — 95 files, 206 dependencies, 0 broken contracts
- Result: **PASS**

### Security Scan
- `process.env` in PEK-scoped files: **0 matches** — PASS
- Hardcoded secrets/tokens: **0 matches** — PASS

### Market-Hours Guard (Layer 1 — Cron Schedule)
- `docker-compose.yml`: `CRON_BCTC_REPARSE_JOB: "0 21 * * *"` (21:00 UTC = 04:00 ICT, deep off-market)
- Result: **PASS**

### Market-Hours Guard (Layer 2 — HTTP 503)
- Current UTC: 22:47 Tuesday — market CLOSED (Mon–Fri 02:00–08:59 UTC window)
- POST /pek-extract returned HTTP 202 Accepted (guard correctly bypassed)
- Handler code at `interface/handlers.py:404`: `if is_vn_market_open_utc(): raise HTTPException(503)`
- Guard is in place and functional. Tested live: market-closed path works correctly.
- 503 path (market-open simulation): confirmed in handler code + prior cycle-129 mock test (12/12 boundary tests PASS)
- Result: **PASS** (guard intact; extraction not blocked because we are in the permitted window)

---

## THE SENTINEL — Live Extraction: FAIL

### Trigger
```
POST http://localhost:5001/pek-extract
{"report_id": "e71f845d-ffa5-48f9-8f09-30ac2cd09c65",
 "pdf_path": "/app/data/pdfs/20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf"}
→ HTTP 202 Accepted (guard passed correctly, 22:47 UTC Tuesday = market CLOSED)
```

PDF present in container: `/app/data/pdfs/20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf` (2.7MB, confirmed)

### Crash Log (docker compose logs pdf-extractor)
```
INFO:infrastructure.pek_engine_adapter:PekEngineAdapter: loading models (first extraction request)...
Creating new Ultralytics Settings v0.0.6 file ✅
ERROR:interface.handlers:_run_pek_extract: FAILED report_id=e71f845d-ffa5-48f9-8f09-30ac2cd09c65
  error=No module named 'unimernet'
```

### Full Traceback (reproduced inside container)
```
Traceback:
  File "/app/PDF-Extract-Kit/pdf_extract_kit/tasks/__init__.py", line 3, in <module>
    from pdf_extract_kit.tasks.formula_recognition.task import FormulaRecognitionTask
  File "/app/PDF-Extract-Kit/pdf_extract_kit/tasks/formula_recognition/__init__.py", line 1, in <module>
    from pdf_extract_kit.tasks.formula_recognition.models.unimernet import FormulaRecognitionUniMERNet
  File "/app/PDF-Extract-Kit/pdf_extract_kit/tasks/formula_recognition/models/unimernet.py", line 9, in <module>
    import unimernet.tasks as tasks
ModuleNotFoundError: No module named 'unimernet'
```

### Root Cause Analysis

`pek_engine_adapter.py:110-111` imports:
```python
from pdf_extract_kit.tasks.layout_detection import LayoutDetectionTask
from pdf_extract_kit.tasks.ocr import OCRTask
```

Python resolves `pdf_extract_kit.tasks.layout_detection` by executing
`pdf_extract_kit/tasks/__init__.py` first. That file imports ALL tasks eagerly:
```python
# pdf_extract_kit/tasks/__init__.py
from pdf_extract_kit.tasks.formula_recognition.task import FormulaRecognitionTask  # line 3
```

`formula_recognition/__init__.py` immediately imports:
```python
from pdf_extract_kit.tasks.formula_recognition.models.unimernet import FormulaRecognitionUniMERNet
```

`unimernet` is not installed — intentionally excluded per the CPU-trimmed architecture
(too large, GPU-oriented, out of scope). The import fails at module load, before any PEK
task is instantiated.

**Why the smoke gate missed this:** The build-time smoke gate tests:
```python
import numpy; import cv2; from paddleocr import PaddleOCR;
from doclayout_yolo import YOLOv10; import torch
```
It does NOT test `from pdf_extract_kit.tasks.layout_detection import LayoutDetectionTask`.
The PEK source is on PYTHONPATH but PEK task imports are not exercised at build time.

**Workaround hypothesis (for architect — do NOT implement as fixer):**
Option A: Add `unimernet` to requirements-pek.txt (installs but requires GPU at runtime; may or may not import cleanly without GPU).
Option B: Avoid `pdf_extract_kit.tasks` package import entirely — import the underlying model classes directly (e.g. `doclayout_yolo.YOLOv10` directly, bypassing the PEK task wrapper).
Option C: Add a stub `unimernet` package (empty module) to satisfy the import without pulling the real package.
**Architect must decide the correct fix** — this is the 3rd fix round on this module; fixer ceiling is hit.

### DB Count — Direct market.db Query (bun:sqlite, readonly, via mcp-server container)
```
SELECT COUNT(*) FROM bctc_layout_units WHERE report_id LIKE 'e71f845d%'  →  0
SELECT COUNT(*) FROM bctc_page_zones   WHERE report_id LIKE 'e71f845d%'  →  0
```
**Zero PEK rows produced.** Extraction never completed.

### Row Sample
None available — extraction crashed before any rows were written.

### BCTC-TABLE-3 Failure Mode Check
Cannot evaluate:
- label + code + value alignment: UNTESTABLE
- code 100 (TỔNG CỘNG TÀI SẢN) presence: UNTESTABLE
- duplicate rows, junk text, value-without-label orphans: UNTESTABLE
- prior-period column null: UNTESTABLE
- balance identity (assets = liabilities + equity): UNTESTABLE

All remain untestable until a real extraction completes without crash.

---

## Fleet RAM

Models did NOT load (crash at first import, before model weights downloaded or resident).
pdf-extractor container: 645.9 MiB / 2.5 GiB (25%) — cold-start + Ultralytics settings write only.

| Container | RAM Used | Limit |
|---|---|---|
| pdf-extractor | 645.9 MiB | 2.5 GiB |
| mcp-server | 391.4 MiB | 2.0 GiB |
| rag-service | 1.483 GiB | 1.5 GiB |
| frontend | 49.5 MiB | 512 MiB |
| api-gateway | 11.0 MiB | 512 MiB |
| macro-indicators | 10.2 MiB | 1.5 GiB |
| kinh-dich-service | 10.2 MiB | 512 MiB |
| mcp-gateway | 16.7 MiB | 512 MiB |
| **Fleet total** | **~2.6 GiB** | **8 GiB cap** |

Fleet is safe at cold-start. RAM with models resident = UNKNOWN (models never loaded; crash prevents measurement).

---

## Summary of Gates

| Gate | Result |
|---|---|
| PDF-Extract-Kit pristine (zero-diff) | PASS |
| Frozen surfaces (text_table_extractor.py, sandbox/runner.py, pilot-status.json) | PASS |
| numpy ABI mismatch (prior FAIL #1) | FIXED in 9ab93889 — PASS |
| Scenario test patch target (prior FAIL #2) | FIXED in 9ab93889 — PASS |
| Unit tests 629/629 | PASS |
| Scenario tests 10/10 | PASS |
| DDD: Fence-A + Fence-B KEPT | PASS |
| Security: 0 process.env, 0 secrets | PASS |
| Market-hours guard Layer 1 (cron 0 21 * * *) | PASS |
| Market-hours guard Layer 2 (503 handler in code) | PASS |
| 503 guard state at test time (22:47 UTC Tue) | NOT TRIGGERED — market closed, 202 returned correctly |
| FPT Q4 2025 PDF present in container | PASS |
| Smoke gate (pek-native-imports: ALL OK) | PASS |
| **Sentinel extraction — no crash** | **FAIL — ModuleNotFoundError: No module named 'unimernet'** |
| **bctc_layout_units rows > 0** | **FAIL — 0 rows** |
| **Row quality (BCTC-TABLE-3 modes absent)** | **UNTESTABLE** |
| **code 100 present** | **UNTESTABLE** |
| **Fleet RAM < 8GB with models resident** | **UNTESTABLE (models never loaded)** |

---

## Blocking Issue

### Blocking #1 — CRITICAL runtime crash: unimernet module not installed (NEW)
**File:** `apps/pdf-extractor/PDF-Extract-Kit/pdf_extract_kit/tasks/__init__.py:3` (pristine — DO NOT EDIT)
**Trigger:** Any import of `pdf_extract_kit.tasks.*` (including `LayoutDetectionTask`) triggers `tasks/__init__.py` which eagerly imports `FormulaRecognitionTask` → `formula_recognition/__init__.py` → `models/unimernet.py` → `import unimernet.tasks`
**Crash:** `ModuleNotFoundError: No module named 'unimernet'`
**Impact:** Zero BCTC rows produced. Extraction crashes before any model loads.
**Smoke gate gap:** Build-time smoke gate does NOT test PEK task imports — it passes green while this crash is invisible until runtime.
**Fix class (architect to decide — fixer ceiling hit at round 3):**
- Option A: `pip install unimernet` (real package; unknown RAM budget; GPU-oriented)
- Option B: Bypass `pdf_extract_kit.tasks` entirely — import model layers directly (doclayout_yolo.YOLOv10 + paddleocr) without PEK task wrappers
- Option C: Install a stub `unimernet` package to satisfy the eager import without running the real code
**Who decides:** Architect (≥2 fix commits on same module → PM blocks, architect reviews per feedback_recurring_bug_escalation.md)

---

## Verdict

**FAIL — CHANGES_REQUESTED**

The numpy ABI crash is fixed. The smoke gate passes. Unit tests and scenario tests are green (629/629 + 10/10). But the extraction still crashes at first model load — now on a missing `unimernet` module caused by `pdf_extract_kit/tasks/__init__.py` eagerly importing all tasks including the formula-recognition task that requires `unimernet`.

Zero live BCTC rows in market.db. G9 bar not met.

**This is the 3rd fix round on apps/pdf-extractor. Fixer ceiling is hit (≥2 fix commits on same module). Per feedback_recurring_bug_escalation.md: PM blocks task, architect reviews root cause before any new fix.**

**Do NOT close PEK-QA. Do NOT mark PEK-INTEGRATE done.**

NEXT: architect → root-cause review of PEK import chain gap → select fix option (A/B/C above) → dev-pdf-extractor implements → ops force-recreate → qa re-runs sentinel.

---

## Previous FAIL Record

Prior run (cycle-129, commit efd23447) FAILED: numpy 1.x vs 2.x ABI crash at first model load.
That blocker was fixed by commit 9ab93889 (numpy-2 coherent pin set). This run confirms the ABI fix
landed correctly. The new blocker is structurally different: an eager import chain in the pristine PEK
package that requires `unimernet` which is not installed.
