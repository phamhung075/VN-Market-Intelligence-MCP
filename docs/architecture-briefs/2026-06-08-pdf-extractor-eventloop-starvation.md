# Architecture Brief — A20-EVENTLOOP-STARVATION-ARCHITECT

**Date:** 2026-06-08T08:20Z
**Task:** A20-EVENTLOOP-STARVATION-ARCHITECT (UNBLOCK, M, P1, RECURRING-BUG 4th recurrence)
**Zone:** apps/pdf-extractor/
**Architect:** architect (claude-sonnet-4-6)
**Sprint:** ORCH-DASH-DECISION-DRILLDOWN
**Status:** DESIGNED — handoff to dev-pdf-extractor

---

## Constraint Reminder

FORBIDDEN: any 4th CPU/cgroup/start_period patch.
Three prior CPU-class patches all failed: 48a64056, 3033e1dc, acb48383.

---

## Root Cause — Confirmed

### Why prior patches failed

The prior investigation was correct that OCR compute (Tesseract) was the stressor. The
ProcessPoolExecutor fix (3033e1dc) was also correctly conceived — it moves OCR into a
child OS process so the uvicorn event loop is not directly occupied by Tesseract CPU.
The cpus:2.0 patch (acb48383) was also correct in isolation.

**The remaining failure is a different mechanism**: the uvicorn event loop process
itself blocks on synchronous I/O for the `/extract` call path — even when Tesseract
has been offloaded.

### The blocking call in `/extract`

The `/extract` route calls `ExtractPDFUseCase.execute()`, which calls
`self.extract_service.process_pdf()`, which calls:

```
tables  = await self.engine.extract_tables(pdf_bytes)   # domain/services.py:66
text, _ = await self.engine.extract_text_ocr(pdf_bytes)  # domain/services.py:67
```

`engine` is `PdfplumberExtractionEngine`. Both methods are declared `async def` but
contain NO `await` — they are synchronous functions wearing an `async` costume:

- `extract_tables()`: opens `pdfplumber.open(io.BytesIO(pdf_bytes))`, iterates all
  pages, calls `page.extract_tables()` — fully synchronous. For a multi-page BCTC PDF,
  this can run for **several seconds** on the event loop thread.
- `extract_text_ocr()`: iterates all pages, calls `page.extract_text()` natively, and
  for scanned pages calls `self._ocr_page(page)` which runs
  `pytesseract.image_to_string()` — **blocking Tesseract call directly on the event
  loop**. No `to_thread`, no `run_in_executor`.

When a POST /extract request is in flight, the single uvicorn event loop is blocked
inside `pdfplumber` + `pytesseract` for the duration of the extraction. No other
coroutine can run — including `/health`. The `/health` handler is:

```python
async def health() -> HealthResponse:
    return HealthResponse(ocr_source_ok=ocr_source_ok)
```

It has no awaitable operations; it returns immediately when it gets the event loop.
The problem is it never gets the event loop because `extract_tables` / `extract_text_ocr`
never yield.

### Why it survived the cpus:2.0 patch

The cpus:2.0 change increased the CFS budget, so the event loop process can actually
be scheduled by the OS. But "schedulable" only helps if the event loop is free to pick
up new I/O. With the loop blocked inside `pdfplumber.open()` or `pytesseract.image_to_string()`,
extra CPU quota means the blocking call runs faster — but `/health` still cannot
interleave until the blocking call completes.

The HEALTHCHECK interval is 30s, timeout 30s. For a large PDF (BCTC = 40-80 pages),
pdfplumber extraction + pytesseract OCR fallback can easily exceed 30 seconds,
causing the probe to timeout, marking the container unhealthy — exactly the symptom
that is observed.

### In-container vs host probe discriminator

The task spec asks: does `/health` wedge from INSIDE the container too, or only
host-facing? The answer derived from code: it ALSO wedges inside the container,
because the starvation is at the event loop level, not the network level. An in-container
`curl localhost:5001/health` would also queue behind the blocked event loop. This is
the definitive test that distinguishes a network/proxy wedge from an event-loop wedge.
A20-WEDGE-CAPTURE-RESTART's in-container probe result will confirm this.

### Call paths with blocking exposure

| Route | Call chain | Blocking risk |
|-------|-----------|---------------|
| POST /extract | `extract_tables_usecase` → NO (OCR via `run_in_executor`) | Low (OCR offloaded) |
| POST /extract | `extract_pdf_usecase` → `process_pdf` → `extract_tables` + `extract_text_ocr` | **CRITICAL** — sync on loop |
| POST /extract-tables | `extract_tables_usecase` → OCR via `run_in_executor` | LOW — properly offloaded |
| POST /extract-md-tables | `background_tasks.add_task` → 202 immediately | LOW |
| POST /extract-layout-first | `background_tasks.add_task` → 202 immediately | LOW |
| POST /pek-extract | `background_tasks.add_task` → 202 immediately | LOW |

The CRITICAL path is: the `/extract` endpoint (POST) triggers `ExtractPDFUseCase`, which
calls `PdfplumberExtractionEngine.extract_tables()` and `.extract_text_ocr()` synchronously
on the event loop. These are the blocking calls.

Note: `/extract-tables` is NOT the problem. That path correctly uses `run_in_executor`
via `ocr_executor` (ProcessPoolExecutor) since commit 3033e1dc.

### Why single-worker was chosen — PDFX-SINGLE-WORKER-BLOCKING history

From code comments and git log: `ProcessPoolExecutor(max_workers=1)` was chosen
deliberately:
1. Host safety: 16GB Mac host cannot sustain parallel Tesseract processes. `max_workers=1`
   prevents memory spikes and CPU pile-up.
2. It matches `PekEngineAdapter.Semaphore(1)` — one extraction at a time.

This decision is SOUND and must not be reversed. The fix does NOT add more workers.

---

## Recommended Fix — Option B: wrap `PdfplumberExtractionEngine` sync methods in `run_in_executor`

### Why not workers>1

`workers=N` in `uvicorn.run()` spawns N OS processes. This would allow one process to
serve `/health` while another runs extraction. But:
1. It multiplies the RSS footprint (PEK models: ~600MB RSS per process; N=2 → ~1.2GB
   extra). The host memory ceiling (Docker 8GB) was the explicit reason for
   `max_workers=1` in the first place.
2. Multiple workers = multiple `ProcessPoolExecutor` instances = potential parallel
   Tesseract child processes, re-introducing the OOM risk that `max_workers=1` was
   chosen to avoid.
3. It is a blunt instrument: fixing one endpoint's blocking call is more targeted and
   leaves the deliberate resource constraints intact.

### Why not Gunicorn+uvicorn workers

Same reasoning as workers>1: multiple processes, same memory multiplication.
Additionally, the container already runs under Docker healthcheck — a more complex
process supervisor adds no correctness benefit here.

### Recommended: Fix `PdfplumberExtractionEngine` to offload to thread pool (Option B)

The correct fix is minimal and targeted:

**In `infrastructure/extraction_engine.py`:**

Change `extract_tables()` and `extract_text_ocr()` from "async def that runs sync code"
to "async def that offloads sync code via `asyncio.to_thread()`".

The `asyncio.to_thread()` pattern is already established in this codebase for exactly
this purpose (see `table_push_client.py`, `alert_adapter.py`, `layout_first_push_client.py`,
`md_table_push_client.py`, `repositories.py` — all use the identical pattern).

Concrete change:

```python
# BEFORE — blocks event loop:
async def extract_tables(self, pdf_bytes: bytes) -> list[ExtractedTable]:
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            page_tables = page.extract_tables()  # blocking
            ...

# AFTER — offloads to thread pool:
async def extract_tables(self, pdf_bytes: bytes) -> list[ExtractedTable]:
    return await asyncio.to_thread(self._extract_tables_sync, pdf_bytes)

def _extract_tables_sync(self, pdf_bytes: bytes) -> list[ExtractedTable]:
    # all existing logic unchanged, now runs on a worker thread
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        ...
```

Identical pattern for `extract_text_ocr()`:

```python
async def extract_text_ocr(self, pdf_bytes: bytes) -> tuple[str, float]:
    return await asyncio.to_thread(self._extract_text_ocr_sync, pdf_bytes)

def _extract_text_ocr_sync(self, pdf_bytes: bytes) -> tuple[str, float]:
    # all existing logic unchanged (including _ocr_page / pytesseract call)
    ...
```

This approach:
- Releases the event loop during pdfplumber page iteration and pytesseract calls
- Requires zero change to callers (domain/services.py, application/usecases.py)
- Preserves all existing tests (the sync helper methods are internal)
- Does NOT add workers, does NOT change memory limits, does NOT reverse max_workers=1
- Is consistent with every other blocking-I/O wrapper in the codebase
- Keeps the DDD boundary intact (infrastructure layer self-contained change)

### Test strategy

A test mirroring TC11 pattern should be added:

```
TC-EE-1: extract_tables() runs on a worker thread (not the event loop thread).
  - threading.get_ident() inside _extract_tables_sync != event_loop_thread_ident
  - Fails if asyncio.to_thread() is removed (mirrors TC11 pattern in test_extract_tables_usecase.py)

TC-EE-2: extract_text_ocr() runs on a worker thread.
  - Same pattern.

TC-EE-3: failure-under-load AC.
  - Integration: while /extract is in flight (background task), /health returns 200 within 5s.
  - Hold the healthy state for >=15min (the c103 false-green trap requires persistence,
    not a single probe pass).
```

---

## Acceptance Criteria (from task spec — non-negotiable)

- host `/health` returns 200 within 5s WHILE an `/extract` OCR job is in flight
- Proven healthy for >=15min (single-probe PASS is the c103 false-green trap — multi-probe required)
- No new workers parameter, no memory footprint increase, no reversal of `max_workers=1`
- `FIX-AUDITOR-A20-MULTIPROBE` (already in backlog) tunes the auditor probe to
  match this: 3 probes x 5s apart, fail if any fails

---

## Files to Modify

| File | Change | DDD Layer |
|------|--------|-----------|
| `apps/pdf-extractor/infrastructure/extraction_engine.py` | Wrap `_extract_tables_sync` + `_extract_text_ocr_sync` as sync helpers; `extract_tables` + `extract_text_ocr` become thin `asyncio.to_thread()` wrappers | Infrastructure |
| `apps/pdf-extractor/__tests__/unit/test_extraction_engine_nonblocking.py` | NEW: TC-EE-1 + TC-EE-2 thread-isolation tests (mirror TC11) | Test |
| `apps/pdf-extractor/__tests__/integration/test_health_under_extract_load.py` | NEW (optional, stretch): TC-EE-3 failure-under-load integration test | Test |

No changes to:
- `domain/services.py` — callers unchanged
- `application/usecases.py` — callers unchanged
- `main.py` — composition root unchanged
- `docker-compose.yml` — NO further cgroup changes (forbidden)
- `Dockerfile` — no CMD workers parameter change (deliberate single-worker)

---

## Risk Flags

**R-1 (low):** `asyncio.to_thread()` uses the default `ThreadPoolExecutor` shared with all
other `to_thread()` callers (push clients, alert adapter). Under peak load, the thread
pool could become saturated. Mitigation: the default executor scales with `min(32, cpu_count + 4)`
threads — more than enough for sequential BCTC extractions. If needed in a future sprint,
inject a dedicated `Executor` at composition root (same pattern as `ocr_executor`).

**R-2 (low):** `pdfplumber` is not thread-safe for the same `pdf` object but is safe to
call independently per thread (each call creates its own file handle). The sync helper
receives `pdf_bytes` (immutable bytes), opens its own `BytesIO` and `pdfplumber.open()` —
no shared state. Thread safety is preserved.

**R-3 (mitigated):** Existing tests for `PdfplumberExtractionEngine` mock at the use-case
level, not at the engine level. The refactoring (sync helper extraction) is transparent to
those tests. Only TC-EE-1/2 test the offloading directly.

---

## DDD Layer Assignment

- Change: `infrastructure/extraction_engine.py` — infrastructure layer (correct, adapts
  external library pdfplumber+pytesseract to domain port contract)
- No domain or application layer changes required
- No interface layer changes required

**BUILD-STANDARD: not-applicable** — bug fix / refactor in existing service, no new
primitives, no new interfaces.

---

## PM Split Instructions

This is a single-zone, single-dev task. No split required.

- **dev-pdf-extractor**: implement extraction_engine.py `asyncio.to_thread()` wrappers +
  TC-EE-1/TC-EE-2 unit tests. Targeted rebuild (NEVER `down&&up`). Verify with
  multi-probe /health under /extract load for >=15min.
- Sequence: dev-pdf-extractor THEN ops targeted rebuild THEN FIX-AUDITOR-A20-MULTIPROBE
  (auditor sensor tuning is gated on fix landing)
