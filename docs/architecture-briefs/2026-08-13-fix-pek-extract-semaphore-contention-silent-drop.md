# FIX-PEK-EXTRACT-SEMAPHORE-CONTENTION-BOUNDED-QUEUE — Architecture Brief

**Date:** 2026-08-13 | **Author:** architect | **Zone:** apps/pdf-extractor/ | **Size:** M | **Priority:** P0
**Spike:** SPIKE-BCTC-RECONCILE-EXHAUSTED-REAL-UUID-SUBSET (this row's investigation output)

## 0. Zone correction

The SPIKE row that dispatched this investigation carries `zone: apps/mcp-server/` (inherited from
its sibling `FIX-BCTC-FALLBACK-SHELL-REPORTS-STRUCTURALLY-UNEXTRACTABLE`). The actual root cause and
every file this fix touches live in `apps/pdf-extractor/`, a distinct zone with its own specialist
(`dev-pdf-extractor`, `docs/data/system-map.json`). PM should route the follow-up FIX row to
`dev-pdf-extractor`, not `dev-mcp-server`.

## 1. Root Cause (RAW-verified, not inferred)

**This is NOT the same defect as `FIX-BCTC-FALLBACK-SHELL-REPORTS-STRUCTURALLY-UNEXTRACTABLE`.** That
row's write-side `isValidUuid` format gate only rejects `fallback-` shell ids; the 3 named reports
carry real UUIDs that exist in `financial_reports` (RAW-confirmed live, readonly, named-volume DB):

| Ticker/period | report_id | pdf_path | text_status |
|---|---|---|---|
| HUT 2025-Q3 | `dab264ae-9702-4045-b488-bbf5d13f97fc` | `/app/data/pdfs/HUT_2025_Q3.pdf` | COMPLETE |
| BSR 2024-Q1 | `d332bf35-d989-4dcc-a180-48c07369ea01` | `/app/data/pdfs/BSR_2024_Q1.pdf` | COMPLETE |
| FRT 2024-Q1 | `268f4544-d66b-42cd-b37e-18ff7b17d55f` | `/app/data/pdfs/FRT_2024_Q1.pdf` | COMPLETE |

All 3 confirmed at exactly 0 rows in `bctc_layout_units`/`bctc_table_rows`/`bctc_md_tables` (matches
the alerts). None of the 3 ever reaches `pushBctcLayoutHandler.ts`'s write gate — they never produce
an extraction payload to push in the first place. The fallback-shell fix is structurally out of scope
for this cohort, confirming PO's 2026-08-11T13:22Z fold.

### The real mechanism: `pek_engine_adapter.py`'s non-blocking semaphore drops contended requests

`apps/pdf-extractor/infrastructure/pek_engine_adapter.py:90-92` (by design, documented,
`REQ-PEK-4d`/`AC-PEK-4d`): the CPU-only PEK/PaddleOCR engine can only run ONE extraction at a time —
`_extraction_semaphore = threading.Semaphore(1)`. `extract_layout_and_tables()` (line 657) does a
**non-blocking** acquire; on contention it **raises `SemaphoreContendedError` immediately** instead
of waiting:

```python
acquired = _extraction_semaphore.acquire(blocking=False)
if not acquired:
    raise SemaphoreContendedError(
        "PEK extraction in progress (semaphore held). Retry after current extraction completes."
    )
```

`bctcExtractReconcileJob.ts` (mcp-server) re-fires **every still-`pek_triggered` row in its batch**
(up to `DEFAULT_BATCH_SIZE=20`) each 30-min tick, sequentially, with **no pacing** — each call is
just an `await fetch(...)` HTTP round-trip (`pekExtractTrigger.ts`), so a full batch of re-fires lands
at pdf-extractor within a couple of seconds of each other. `/pek-extract` (`routes_pek.py:78`)
schedules `_run_pek_extract` as a FastAPI `BackgroundTask` and returns `202 Accepted` **immediately**,
before the background task runs. Each background task calls
`asyncio.to_thread(pek_adapter.extract_layout_and_tables, ...)` (`pek_run_helper.py:57`) — so a burst
of N near-simultaneous triggers spawns N worker threads that race for the single semaphore. Exactly
ONE wins; every other loses **instantly** (non-blocking acquire), and its background task's `except
Exception` block (`pek_run_helper.py:84-93`) catches `SemaphoreContendedError`, logs it with a full
traceback, and returns — **no retry, no queue, no signal back to mcp-server** (the 202 response was
already sent). The row stays `pek_triggered`; the reconcile job just waits another 30 min and re-fires
the *same* batch, recreating the *same* race.

**A report that consistently loses this race across 8 consecutive ticks reaches
`MAX_RECONCILE_ATTEMPTS` and is marked `enrich_failed` (fail-loud BUG) having NEVER had a single
genuine extraction attempt** — indistinguishable from a truly-failed extraction from the reconcile
job's point of view, but there is nothing wrong with the report, the PDF, or the write path.

### Live confirmation (not simulated) — `docker logs vn-market-intelligence-mcp-pdf-extractor-1`, full retained history (2026-08-08 → present)

- **FRT 2024-Q1 (`268f4544-...`): 8/8 reconciliation passes hit `SemaphoreContendedError`.**
  Every single attempt across this report's entire lifecycle (`08-11T08:36:36Z` through
  `08-11T12:35:03Z`, ~30-min cadence) lost the semaphore race — a 100% loss rate, fully reproduced:
  ```
  2026-08-11T12:35:03.971090722Z ERROR:interface.pek_run_helper:_run_pek_extract: FAILED report_id=268f4544-d66b-42cd-b37e-18ff7b17d55f — full traceback follows
  ...
  infrastructure.pek_engine_adapter.SemaphoreContendedError: PEK extraction in progress (semaphore held). Retry after current extraction completes.
  ```
  The very next log lines (same second) show 2 MORE reports (`fallback-KDC-2024-Q1`,
  `fallback-VIX-2024-Q1`) hitting the identical error within the same burst — proving this is a
  systemic batch-contention pattern, not FRT-specific.
- **HUT 2025-Q3 (`dab264ae-...`): only 1 trace across its entire queue history** (queue row shows
  `reconcile_attempts=11`, i.e. it was reconciled at least 11 times) — the other ~10 attempts left
  zero footprint anywhere in pdf-extractor's log, consistent with the trigger `fetch()` call itself
  timing out/failing to connect (mcp-server's `pekExtractTrigger.ts` classifies this as `outcome:
  "unreachable"`) under the same burst load, before ever reaching pdf-extractor's request handler.
  mcp-server's own container was recycled 2026-08-13 (no `RestartCount=0` history before that),
  destroying its logs for the 08-11 window, so this sub-mechanism could not be directly confirmed
  from the caller side — flagged as an observability gap (§5).
- **BSR 2024-Q1 (`d332bf35-...`): zero trace anywhere** in pdf-extractor's log across 8 reconciled
  passes (`reconcile_attempts=8`, `status=enrich_failed`) — same "never reached the handler" pattern
  as HUT, unconfirmable from the caller side for the same reason.
- **Full-history failure breakdown (`docker logs ... | grep`, 2026-08-08→present):** 183 total
  `_run_pek_extract: FAILED` traces = **129 `SemaphoreContendedError`** (70%, never started
  extraction) + 53 `urllib.error.HTTPError` (100% attributable to the *already-diagnosed*
  `fallback-` write-gate 400s — confirmed by grepping every `report_id=` in these tracebacks; zero
  overlap with the real-UUID cohort) + 1 genuine 30-min extraction timeout (also a `fallback-` id).
  Of the 67 attempts that actually **started** (won the semaphore), only 12 completed (`DONE`); the
  other 55 map exactly onto the 53 fallback-id write-gate rejections + the 1 timeout — **there is no
  evidence of a distinct "extraction runs but silently produces nothing" failure mode.** Whenever
  PEK actually gets to run on a real-UUID report, it works.
- **Direct proof the PDFs and report_ids are fine:** BSR's *own* 2025-Q1 filing (`aa512e16-...`,
  genuinely different PDF content) succeeded with 34 layout units; FRT's own 2025-Q1 filing
  (`172711e1-...`) succeeded with 27. Same tickers, same extraction engine, same write path — the
  only variable is whether that specific report ever won the semaphore race.
- **Timing correlation with the A-30 memory hypothesis:** the observed burst of 3 simultaneous
  `SemaphoreContendedError` failures (12:35:03–12:35:04Z, 2026-08-11) sits **~1 minute before**
  system-auditor's A-30 telegram 4648 (pdf-extractor sustained-high memory, 94.07% loss of
  reclamation, 12:36:20Z). The most parsimonious read is that A-30's memory signal is a **downstream
  symptom** of this same un-throttled batch-refire burst (repeated concurrent model-load attempts +
  thread-pool churn from N simultaneous `asyncio.to_thread` calls racing for one slot), not an
  independent leak that separately causes zero-row extraction. No separate memory-leak mitigation is
  warranted; fixing the contention pattern should reduce or eliminate the correlated memory spikes as
  a side effect. This should be re-checked empirically post-fix (§4).

### Secondary anomaly found (flagged, not fixed here — out of scope)

`bctc_vps_queue` row for HUT 2025-Q3 shows `reconcile_attempts=11` while `MAX_RECONCILE_ATTEMPTS=8`
— exceeding the cap. Since `bctcExtractReconcileJob.ts` only ever *increments* this counter and the
job's own SELECT only picks up `status='pek_triggered'` rows, a count above 8 on an `enrich_failed`
row means something (most likely an out-of-band manual `/api/trigger-pek-extract` call, matching the
precedent already documented in `OPS-BCTC-BANK-2025Q4-ENRICH-0ROW-REPARSE`) reset `status` back to
`pek_triggered` without resetting `reconcile_attempts`, letting it re-exhaust past the original cap.
Flagged for PO/PM visibility as a distinct minor queue-lifecycle bug; not designed here (out of this
brief's scope — the semaphore fix is the load-bearing defect for all 3 named tickers regardless).

## 2. Fix Design — bounded blocking acquire (reuse the existing `ocr_gateway.py` pattern)

**Do not invent a new concurrency primitive.** `apps/pdf-extractor/infrastructure/ocr_gateway.py`
already solves the *identical* problem (one shared resource, multiple async callers, CPU-only host)
with a **bounded blocking acquire** instead of fail-fast:

```python
# ocr_gateway.py:119-121, 382-389 (existing, unrelated to this fix — the pattern to reuse)
PDFX_OCR_QUEUE_WAIT_S: float = _read_float_env("PDFX_OCR_QUEUE_WAIT_S", 5.0)

def _acquire_slot_blocking(timeout_s: float) -> None:
    acquired = _OCR_SLOTS.acquire(blocking=True, timeout=timeout_s)
    if not acquired:
        raise OcrCapacityExceeded(f"OCR at capacity ...", retry_after_s=timeout_s)
```

Apply the same shape to `_extraction_semaphore` in `pek_engine_adapter.py`:

1. **New env-configurable wait bound**, same convention as the existing `_EXTRACTION_TIMEOUT_SECONDS`:
   ```python
   _DEFAULT_SEMAPHORE_WAIT_SECONDS = 30 * 60  # 30 min — same order as one extraction's own budget
   _SEMAPHORE_WAIT_SECONDS: int = int(
       os.environ.get("PEK_SEMAPHORE_WAIT_SECONDS", _DEFAULT_SEMAPHORE_WAIT_SECONDS)
   )
   ```
2. **Change the acquire call** (`extract_layout_and_tables`, line 657) from non-blocking to bounded
   blocking, and add an optional `wait_s` override parameter (mirrors `ocr_gateway.slot(timeout_s=
   None)`) so tests can inject a short bound instead of monkeypatching the module constant:
   ```python
   def extract_layout_and_tables(self, pdf_path: str, report_id: str, wait_s: Optional[float] = None) -> Dict:
       wait = _SEMAPHORE_WAIT_SECONDS if wait_s is None else wait_s
       acquired = _extraction_semaphore.acquire(blocking=True, timeout=wait)
       if not acquired:
           raise SemaphoreContendedError(
               f"PEK extraction queue wait of {wait}s elapsed without a free slot "
               "(semaphore held by another extraction)."
           )
       ...  # unchanged below this point — same try/finally release
   ```
   `SemaphoreContendedError` class name and the existing `try/finally: _extraction_semaphore.release()`
   stay unchanged — the message changes from "instant reject" to "waited N seconds, still no slot",
   and it now fires only in the genuinely-pathological case (queue deeper than the wait bound), not on
   every ordinary contended request.
3. **Why blocking-on-a-worker-thread is safe here (not a new risk):** `extract_layout_and_tables()` is
   already always invoked via `asyncio.to_thread(...)` from `_run_pek_extract`
   (`pek_run_helper.py:57`, documented there as event-loop isolation, PDF-AVAIL-02-FIX) — the calling
   coroutine already expects this call to block a worker thread for up to `PEK_EXTRACTION_TIMEOUT_
   SECONDS` (30 min default). Blocking on the semaphore first, inside that same worker thread, extends
   that existing expected-block window; it does not introduce a new one or touch the event loop.
4. **Correct a stale doc comment while here:** the module docstring (`pek_engine_adapter.py:24`) and
   the method docstring (`:653`) both claim contention maps to "HTTP 429 at the handler level" — this
   is **not true** for the actual `/pek-extract` → `BackgroundTasks.add_task` path (`routes_pek.py`
   always returns 202 before the background task even starts; `SemaphoreContendedError` is caught
   deep inside the detached background task and never reaches an HTTP response). Update both comments
   to describe the real behavior (bounded wait, then a logged `FAILED` trace — no HTTP code involved).

## 3. Test Strategy

`apps/pdf-extractor/__tests__/test_pek_engine_adapter.py::TestSemaphoreGuard` (lines 351-406) needs
updating, not just extending — its current `test_semaphore_contention_raises_error` asserts
**immediate** raise, which is exactly the behavior this fix removes:

1. **Modify** `test_semaphore_contention_raises_error` → pass a short `wait_s` (e.g. `0.2`) and assert
   (a) it still raises `SemaphoreContendedError` once the (short, test-scoped) wait elapses, and
   (b) elapsed wall-clock time is bounded and *close to* `wait_s` (not instant) — mirrors
   `test_ocr_concurrency_invariant.py`'s existing `elapsed < 3.0` idiom for the same class of
   assertion (ocr_gateway's own bounded-wait test, line 384-392).
2. **New case:** a second thread releases the semaphore *before* the wait bound elapses → the waiting
   call succeeds (acquires) instead of raising — proves this is genuinely a queue, not a fixed-delay
   sleep-then-fail.
3. `test_semaphore_released_after_extraction` (line 378) is unaffected — keep as-is (regression
   guard for the release path, which this fix does not touch).
4. **New case, batch-realistic:** N=3 threads call `extract_layout_and_tables` concurrently
   (mocked `_run_extraction`, fast return) against a real `wait_s` large enough to cover serialized
   execution — assert all 3 eventually return successfully (none raises), proving the fix's actual
   real-world claim: a batch of contending re-fires no longer loses any of its members.
5. **Live verification post-deploy (required):** re-probe `bctc_layout_units`/`bctc_table_rows` counts
   for HUT 2025-Q3 / BSR 2024-Q1 / FRT 2024-Q1 after their next reconcile pass following deploy;
   re-check `docker logs vn-market-intelligence-mcp-pdf-extractor-1` for `SemaphoreContendedError`
   disappearing (or dropping to near-zero) across a 24h window with a live reconcile batch. Also
   re-check whether system-auditor A-30's pdf-extractor memory signal quiets down over the same
   window (tests the §1 correlation-not-causation read empirically, per this row's own PM-authored
   AC).

## 4. Recommended (not mandatory) follow-up — reconcile-job pacing

Even with the bounded-queue fix, `bctcExtractReconcileJob.ts` still fires an entire batch (up to 20)
of re-fires back-to-back every 30 min with zero pacing. Post-fix this is now a **throughput/latency**
concern, not a correctness bug (nothing is silently dropped anymore — worst case, the Nth item in a
deep batch waits up to `PEK_SEMAPHORE_WAIT_SECONDS` and, if the queue is deeper than that bound, still
correctly fails loud and gets retried next tick, same as today but now genuinely rare instead of the
common case). Recommend PM/dev-mcp-server size a lightweight throttle (e.g. cap concurrent re-fires
per tick, or add a small inter-request delay) as a P2 follow-up if post-fix telemetry still shows a
meaningful backlog — do not pre-build this speculatively; the primary fix already resolves the
"reports permanently stuck at 0 rows" defect this SPIKE exists to close.

## 5. Observability gap (flagged, not fixed here)

mcp-server's own container was recycled 2026-08-13 with no persisted log volume, destroying all
history from the exact window this investigation needed (2026-08-11). This is the second time in
this task family a container-log gap has materially slowed root-cause work (the sibling brief flagged
the analogous "mcp-server has zero trace of the 400-rejection branch" gap). Recommend ops/PM consider
a persisted/mounted log volume or log-shipping for both `mcp-server` and `pdf-extractor` containers —
noted for PO/PM visibility, not designed here (infra, not this zone).

## 6. DDD Layer / BUILD-STANDARD

`pek_engine_adapter.py` and its test file already live in `apps/pdf-extractor/infrastructure/` and
`apps/pdf-extractor/__tests__/` respectively (infrastructure layer — no violation). Extends the
existing `_extraction_semaphore` guard in place, reusing the exact pattern already shipped in
`ocr_gateway.py`'s `_OCR_SLOTS`/`_acquire_slot_blocking` — no new port, no new file, no shared-helper
duplication.

BUG-FIX (in-zone, no new primitives, existing service) → **BUILD-STANDARD: not-applicable** per the
flow's Standard Detection matrix.

## 7. Suggested follow-up board row (for PM — task breakdown is PM's job, not architect's)

- **ID:** `FIX-PEK-EXTRACT-SEMAPHORE-CONTENTION-BOUNDED-QUEUE`
- **Zone:** `apps/pdf-extractor/` → `dev-pdf-extractor`
- **Size:** M · **Priority:** P0 (same alert class as the parent SPIKE — active, growing, fail-loud)
- **Parent:** `SPIKE-BCTC-RECONCILE-EXHAUSTED-REAL-UUID-SUBSET`
- **Depends:** none (independent of `FIX-BCTC-FALLBACK-SHELL-REPORTS-*` — different zone, different
  code path, no shared files)
