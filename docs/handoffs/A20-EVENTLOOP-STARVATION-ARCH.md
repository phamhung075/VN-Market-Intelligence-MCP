# Handoff — A20-EVENTLOOP-STARVATION-ARCHITECT

**Sprint:** ORCH-DASH-DECISION-DRILLDOWN
**Task:** A20-EVENTLOOP-STARVATION-ARCHITECT
**Date:** 2026-06-08T08:20Z
**Zone:** apps/pdf-extractor/
**Brief:** docs/architecture-briefs/2026-06-08-pdf-extractor-eventloop-starvation.md

---

## [Architect] Brownfield Findings

- **Zone:** apps/pdf-extractor/
- **BUILD-STANDARD:** not-applicable (bug fix / refactor, no new service primitives)

- **Verified paths:**
  - `apps/pdf-extractor/infrastructure/extraction_engine.py:26-68` — `extract_tables()`: async def with NO await; pdfplumber iteration runs sync on event loop
  - `apps/pdf-extractor/infrastructure/extraction_engine.py:71-114` — `extract_text_ocr()`: async def with NO await; includes `_ocr_page()` → `pytesseract.image_to_string()` blocking call on event loop
  - `apps/pdf-extractor/domain/services.py:66-67` — callers; no change needed
  - `apps/pdf-extractor/application/usecases.py:59` — caller; no change needed

- **Root cause (confirmed):** `PdfplumberExtractionEngine.extract_tables()` and `extract_text_ocr()` are "async def wearing a costume" — they block the single uvicorn event loop for the full duration of pdfplumber page parsing + pytesseract OCR. No amount of CPU quota or `workers=` can fix this without either multiplying processes (memory blow-up) or releasing the loop during blocking I/O.

- **Reuse patterns:**
  - `asyncio.to_thread()` pattern already established in 6 infrastructure files: `table_push_client.py`, `alert_adapter.py`, `layout_first_push_client.py`, `md_table_push_client.py`, `eval_push_client.py`, `repositories.py` — extend the same pattern, never duplicate
  - TC11 in `test_extract_tables_usecase.py` — thread-isolation assertion pattern to reuse for TC-EE-1/2

- **Design decisions:**
  - **Layer:** infrastructure — `extraction_engine.py` is correctly placed; change is local to this file
  - Extract sync logic to `_extract_tables_sync()` and `_extract_text_ocr_sync()` as private helpers
  - Wrap with `asyncio.to_thread()` in the public async methods
  - Zero changes to callers (domain/application layers untouched — DDD boundary preserved)
  - Do NOT add `workers=` to uvicorn.run() — deliberate single-worker decision preserved
  - Do NOT change `ProcessPoolExecutor(max_workers=1)` — deliberate host-safety decision preserved

- **Test strategy:**
  - NEW `__tests__/unit/test_extraction_engine_nonblocking.py`
    - TC-EE-1: `extract_tables()` runs on worker thread, not event loop thread (mirror TC11)
    - TC-EE-2: `extract_text_ocr()` runs on worker thread
  - Integration (stretch): TC-EE-3 failure-under-load (health 200 while extract in flight, >=15min)
  - All existing tests unaffected (sync helpers are internal implementation details)

- **Risk flags:**
  - R-1 (low): default ThreadPoolExecutor shared with push clients; scales to `min(32, cpu_count+4)` threads — sufficient for sequential BCTC extractions
  - R-2 (low): pdfplumber thread safety — each call gets its own `BytesIO` + `pdfplumber.open()` handle; no shared state; safe for concurrent invocations
  - R-3 (none): no API surface change; no new HTTP endpoints; no schema change

- **Scan clean:** true

---

## Dev Task Spec (for PM to clone as dev-pdf-extractor task)

**Owner:** dev-pdf-extractor
**Size:** S
**Type:** FIX
**Priority:** P1 (RECURRING-BUG 4th recurrence — ops blocked)

### Files to change

1. `apps/pdf-extractor/infrastructure/extraction_engine.py`
   - Extract pdfplumber+pytesseract logic from `extract_tables()` into new `_extract_tables_sync()` method
   - Extract logic from `extract_text_ocr()` into new `_extract_text_ocr_sync()` method (includes `_ocr_page()`)
   - Change `extract_tables()` body to: `return await asyncio.to_thread(self._extract_tables_sync, pdf_bytes)`
   - Change `extract_text_ocr()` body to: `return await asyncio.to_thread(self._extract_text_ocr_sync, pdf_bytes)`
   - Add `import asyncio` at top if not present

2. `apps/pdf-extractor/__tests__/unit/test_extraction_engine_nonblocking.py` (NEW)
   - TC-EE-1: verify `extract_tables()` runs on worker thread (threading.get_ident() != event_loop_ident)
   - TC-EE-2: verify `extract_text_ocr()` runs on worker thread
   - Pattern: copy TC11 from `test_extract_tables_usecase.py` as the model

### Acceptance criteria

1. `pytest` full suite green (40 tests — FU-DEBT note: 40 failures pre-exist; TC-EE-1/2 must be green)
2. In-container probe (inside running container): `curl -m5 localhost:5001/health` returns HTTP 200 WHILE a real `/extract` call is in flight
3. External host probe: `curl -m5 localhost:5001/health` returns HTTP 200 WHILE `/extract` in flight
4. Both probes return 200 for >=15min under /extract load (multi-probe, not single-probe)
5. NO new workers= in uvicorn.run(); NO change to ProcessPoolExecutor max_workers

### Ops sequence after dev ships

1. Targeted rebuild: `docker compose up -d --no-deps --build pdf-extractor` (NEVER `down&&up`)
2. Poll health: `for i in $(seq 1 18); do curl -s -o /dev/null -w "%{http_code}\n" -m5 localhost:5001/health; sleep 10; done`
3. If 18/18 return 200 → healthy confirmed; unfreeze zone
4. Re-queue 26 blocked_pdf_extractor rows: `UPDATE bctc_vps_queue SET status='pending' WHERE status='blocked_pdf_extractor'`
5. THEN dispatch FIX-AUDITOR-A20-MULTIPROBE (agent-father, system-auditor sensor hardening)
