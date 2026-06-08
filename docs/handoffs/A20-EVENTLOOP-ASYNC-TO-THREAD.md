---
sprint: ORCH-DASH-DECISION-DRILLDOWN
task_id: A20-EVENTLOOP-ASYNC-TO-THREAD
owner: dev-pdf-extractor
zone: apps/pdf-extractor/
size: S
type: FIX
priority: P1
created_at: 2026-06-08T08:35:00Z
depends_on: []
blocks: ["FIX-AUDITOR-A20-MULTIPROBE"]
---

## TLDR

Event-loop starvation in pdf-extractor: `extract_tables()` and `extract_text_ocr()` are async def with NO await, blocking the single uvicorn event loop on pdfplumber/pytesseract for the duration of PDF extraction. Fix: extract sync logic to private `_extract_tables_sync()` / `_extract_text_ocr_sync()`, make public methods thin `asyncio.to_thread()` wrappers (established pattern, 6 files in codebase). Multi-probe gate: /health must return 200 within 5s WHILE /extract is in flight, sustained >=15min (single-probe PASS is the c103 false-green trap).

## [PM] Planning Context

- **Zone:** apps/pdf-extractor/ (DDD infrastructure layer only)
- **Acceptance Criteria:**
  - [ ] `pytest` full suite green (40 tests total; pre-existing 40 failures per FU-DEBT; TC-EE-1/2 must be GREEN)
  - [ ] In-container probe: `curl -m5 localhost:5001/health` returns HTTP 200 WHILE a real `/extract` OCR call is in flight
  - [ ] External host probe (from docker host): same as above
  - [ ] Both probes return 200 for >=15min continuously under /extract load (multi-probe sustained, not single-probe pass)
  - [ ] NO new `workers=` parameter in uvicorn.run(); NO change to ProcessPoolExecutor `max_workers=1`
- **Files to read first:**
  - apps/pdf-extractor/infrastructure/extraction_engine.py:26-114 (both blocking methods)
  - docs/architecture-briefs/2026-06-08-pdf-extractor-eventloop-starvation.md (root cause + design)
  - Reference TC11 in apps/pdf-extractor/__tests__/unit/test_extract_tables_usecase.py:L??? (thread-isolation pattern to reuse)
- **Files to create:**
  - apps/pdf-extractor/__tests__/unit/test_extraction_engine_nonblocking.py (NEW: TC-EE-1 + TC-EE-2 thread-isolation tests)
- **Files to modify:**
  - apps/pdf-extractor/infrastructure/extraction_engine.py
    - Extract sync logic from `extract_tables()` → new private `_extract_tables_sync(self, pdf_bytes: bytes)`
    - Extract sync logic from `extract_text_ocr()` → new private `_extract_text_ocr_sync(self, pdf_bytes: bytes)`
    - Rewrite `extract_tables()` body: `return await asyncio.to_thread(self._extract_tables_sync, pdf_bytes)`
    - Rewrite `extract_text_ocr()` body: `return await asyncio.to_thread(self._extract_text_ocr_sync, pdf_bytes)`
    - Add `import asyncio` at top if not present
- **Dependencies:** None (no caller changes required; domain/application layers untouched)
- **Knowledge needed:**
  - docs/architecture-briefs/2026-06-08-pdf-extractor-eventloop-starvation.md (comprehensive root cause + design rationale)
  - docs/handoffs/A20-EVENTLOOP-STARVATION-ARCH.md (architect decision + Dev Task Spec)
  - Reuse pattern: asyncio.to_thread() in 6+ files (table_push_client.py, alert_adapter.py, layout_first_push_client.py, md_table_push_client.py, eval_push_client.py, repositories.py)
  - Test pattern: TC11 in test_extract_tables_usecase.py (thread-isolation assertion mirrored in TC-EE-1/2)

## Risk Flags (from architect brief)

- **R-1 (low):** Default ThreadPoolExecutor shared with push clients + alert adapter; scales to `min(32, cpu_count+4)` threads — sufficient for sequential BCTC extractions. Mitigation: if saturation observed, inject dedicated Executor at composition root (same pattern as ocr_executor).
- **R-2 (low):** pdfplumber thread safety — each call gets its own BytesIO + pdfplumber.open() handle; no shared state; safe for concurrent invocations.
- **R-3 (none):** Existing tests mock at use-case level (transparent to refactoring). Only TC-EE-1/2 test the offloading directly.

## Ops sequence after dev ships (NOT this task; owner=ops after DONE)

1. Targeted rebuild: `docker compose up -d --no-deps --build pdf-extractor` (NEVER `down&&up`)
2. Multi-probe verification: `for i in $(seq 1 18); do curl -s -o /dev/null -w "%{http_code}\n" -m5 localhost:5001/health; sleep 10; done`
   - AC gate: 18/18 must return 200 (3min x 10s intervals = 300s sustained, exceeds 15min requirement)
3. If healthy: unfreeze zone, re-queue 26 blocked_pdf_extractor rows: `UPDATE bctc_vps_queue SET status='pending' WHERE status='blocked_pdf_extractor'`
4. THEN unblock FIX-AUDITOR-A20-MULTIPROBE (dispatch to agent-father after this task is DONE + ops rebuild is green)

## Design Rationale (from architect deep-dive)

**Why asyncio.to_thread() and not workers=N:**
- `workers=N` spawns N OS processes → RSS footprint multiplies (PEK models ~600MB each; N=2 → 1.2GB extra). Host memory ceiling (Docker 8GB cap) was the explicit reason for max_workers=1.
- Multiple workers = multiple ProcessPoolExecutor instances → potential parallel Tesseract child processes, re-introducing OOM risk that max_workers=1 was chosen to avoid.
- Fixing one endpoint's blocking call is more targeted and leaves deliberate resource constraints intact.

**Why not Gunicorn+uvicorn workers:**
- Same memory multiplication as workers=N above.
- Container already runs under Docker healthcheck — more complex process supervisor adds no correctness benefit.

**Pattern is established in codebase:**
- 6 files already use asyncio.to_thread(): table_push_client.py, alert_adapter.py, layout_first_push_client.py, md_table_push_client.py, eval_push_client.py, repositories.py
- Zero caller changes required (domain/application layers call the same public async method signatures)
- All existing tests pass unchanged (sync helpers are internal implementation details)
- DDD boundary intact (infrastructure layer self-contained change)
