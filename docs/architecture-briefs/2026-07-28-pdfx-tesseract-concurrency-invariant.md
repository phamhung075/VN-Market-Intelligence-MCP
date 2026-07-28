# PDFX Tesseract Concurrency — Root Cause + Design

**Task:** `FIX-PDFX-TESSERACT-CONCURRENCY-VIOLATES-SINGLE-WORKER-INVARIANT`
**Author:** architect (plan_only, supervised)
**Written:** 2026-07-28T15:44Z
**Zone:** `apps/pdf-extractor/` — implementer `dev-pdf-extractor`
**Status:** design complete, no code written, no runtime action taken

---

## 1. Verdict

Deliverable (a) asked which of three candidate mechanisms is true. The answer is
**(i), proven; (ii) and (iii) are both REFUTED by live evidence.**

> **(i) A second OCR code path shells out to tesseract without passing through
> `PekEngineAdapter` or `ocr_executor`.**
>
> That path is `POST /extract`. It reaches tesseract through
> `asyncio.to_thread()`, whose bound is the asyncio **default** ThreadPoolExecutor
> — `min(32, os.cpu_count() + 4)`. `docker info` reports `NCPU=6` for this
> daemon, so that expression evaluates to **exactly 10**. The "pool pinned at 10
> with turnover" shape is not an emergent property of the caller; it is a
> hard-coded CPython default that nobody chose.

Compounding it, and equally load-bearing:

> **The 120 s client abort does not stop server-side OCR.** `asyncio.to_thread`
> is not cancellable, and nothing kills the tesseract child. Every abandoned
> request permanently consumes one of the 10 slots. The pool does not merely
> fill — it **ratchets**.

Both guards named in the row are real, are process-global, and work — they are
simply **not on the path that carries 100 % of the observed load**.

---

## 2. Premise corrections (two premises in the board row are wrong)

These must be corrected before the implementer inherits them.

### 2.1 `PPID=1` does **not** mean re-parented

The row's `root_cause` states: *"Every PPID is 1 (= the uvicorn master, which is
also container init) — the spawning worker is gone in each case, so each
tesseract has been re-parented rather than being an in-pool child."*

`docker exec … ps` shows **PID 1 *is* the uvicorn process**:

```
  PID  PPID     ELAPSED      RSS STAT COMMAND
    1     0    06:07:07  1752660 Rsl  python3 -m uvicorn main:app --host 0.0.0.0 --port 5001
 5691     1    01:28:03    88348 Rl   tesseract /tmp/tess_jzf08tc9_input.PNG …
```

`Dockerfile:117` — `CMD ["python3", "-m", "uvicorn", …]` with exec-form, no init
shim, so uvicorn *is* container init. A subprocess spawned by **any thread** of
PID 1 has `PPID=1`. `PPID=1` is therefore exactly what a normal, live,
in-process-spawned tesseract looks like here. It carries **zero** orphan signal
and must not be used as one.

### 2.2 There are no orphans — every child has a live owner

Single atomic `ps -Lo tid,stat,wchan` snapshot of PID 1 (2026-07-28T15:42Z):

```
    1 Ssl  do_epoll_wait      06:16:05   ← event loop, IDLE (this is why /health is green)
 5862 Ssl  do_sys_poll        01:23:55   ┐
 5829 Ssl  do_sys_poll        01:25:58   │
 5797 Ssl  do_sys_poll        01:28:07   │
 5784 Ssl  do_sys_poll        01:30:10   │ EXACTLY TEN threads blocked in
 5740 Ssl  do_sys_poll        01:33:52   │ subprocess.communicate() pipe-poll,
 5734 Ssl  do_sys_poll        01:34:07   │ 1:1 with the ten tesseract children
 5701 Ssl  do_sys_poll        01:36:16   │
 5668 Ssl  do_sys_poll        01:38:18   │
  400 Ssl  do_sys_poll        06:04:39   │
   12 Ssl  do_sys_poll        06:16:02   ┘
   8,9,10,11,14..23  futex_wait_queue    ← 14 native BLAS/OpenMP threads, idle since import
```

10 `do_sys_poll` threads : 10 tesseract children : 1:1. **Hypothesis (iii)
— "the child outlives its worker and is re-parented" — is refuted.** Nothing has
escaped the process; the guards are simply absent from this code path.

Hypothesis (ii) — "per-request/per-thread semaphore" — is also refuted:
`pek_engine_adapter.py:92` declares `_extraction_semaphore = threading.Semaphore(1)`
at **module scope**, which is process-global and correct. It is never acquired by
`/extract`.

---

## 3. Root cause — the escape path, with file:line

```
mcp-server bctcReparseJob / bctcBatchSweepJob
  └─ POST /extract  {pdf_path, source_type}          ← 182 hits / 6 h; the ONLY OCR traffic
     apps/mcp-server/src/infrastructure/fetchers/pdfExtractorClient.ts:69
        signal: AbortSignal.timeout(120_000)          ← client gives up at 120 s
  │
  ▼
apps/pdf-extractor/interface/handlers.py:494  @router.post("/extract")
  ├─ NO market-hours guard, NO semaphore, NO 429 path — 200/500/503 only
  └─ local_extract_usecase.execute(request_dto)                        (handlers.py:532)
     │
     ▼ application/usecases.py → domain/services.py:24 ExtractPDFService.process_pdf
       ├─ await self.engine.extract_tables(pdf_bytes)                  (services.py:66)
       └─ await self.engine.extract_text_ocr(pdf_bytes)                (services.py:67)
          │
          ▼ infrastructure/extraction_engine.py:63
            return await asyncio.to_thread(self._extract_text_ocr_sync, pdf_bytes)
            ▲▲▲ THE ESCAPE. Bound = asyncio DEFAULT executor
                = ThreadPoolExecutor(max_workers=min(32, os.cpu_count()+4))
                = min(32, 6+4) = 10   (docker info NCPU=6; Ubuntu 24.04 ⇒ CPython 3.12)
            │
            ▼ extraction_engine.py:141  self._ocr_page(page)   (per page, sequential in-thread)
              ▼ extraction_engine.py:170  img = page.to_image(resolution=OCR_RASTER_DPI)  # 200 DPI
              ▼ extraction_engine.py:173  pytesseract.image_to_string(img.original,
                                              lang="vie+eng", config="--psm 6")
                                          ← NO timeout= kwarg ⇒ subprocess never killed
                ▼ subprocess.Popen → tesseract /tmp/tess_XXXX_input.PNG … txt
```

**Neither declared guard is anywhere on that path:**

| Guard | Declared at | Actually protects | Reaches `/extract`? |
|---|---|---|---|
| `ProcessPoolExecutor(max_workers=1)` | `main.py:154` | `ExtractTablesUseCase` Path B only (`extract_tables_usecase.py:531-556`), injected at `main.py:161` | **No** |
| `threading.Semaphore(1)` | `pek_engine_adapter.py:92`, acquired `:657` | `PekEngineAdapter.extract_layout_and_tables` ⇒ `POST /pek-extract` only | **No** |

### 3.1 Discriminators that make this identification decisive

1. **Output extension is `txt`.** The live cmdline is
   `tesseract /tmp/tess_XXXX_input.PNG /tmp/tess_XXXX -l vie+eng --psm 6 txt`.
   `txt` ⇒ `pytesseract.image_to_string`. The `image_to_data` call sites
   (`ocr_backends.py:160`, `generic_md_table/unit_ocr.py:84`,
   `generic_md_table/extractor.py:257`) emit `tsv` and are therefore excluded.
2. **No Python child process exists.** `ps -eo pid,ppid` inside the container
   lists PID 1 plus ten tesseract, nothing else. The
   `ProcessPoolExecutor(max_workers=1)` has **never been given work** — so
   `infrastructure/ocr_worker.py:412` (the only `image_to_string` that runs
   out-of-process) is excluded, and `/extract-tables` is excluded outright:
   **zero** `POST /extract-tables` appear in 6 h of access log.
3. **Traffic tally, 6 h of `docker logs`:** `GET /health` 2081 · `POST /extract`
   **182** · `POST /pek-extract` 14 · `GET /page-text` 8 · `POST /rasterize` 4.
   `/extract` is the only OCR-capable endpoint with meaningful volume.
4. That leaves exactly one candidate: `extraction_engine.py:173`.

### 3.2 The ratchet — why it never recovers

`docker logs` correlation, mcp-server ⇄ pdf-extractor, 2026-07-28T15:33Z:

```
15:31:53.622  pdf-extractor  POST /extract 200 OK          ← Tier 1b (URL mode), ~1 s, no OCR
15:33:55.143  mcp-server     [bctc-reparse-job] Tier 1a (pdf_path) null/short
                             serviceStatus: null  textLength: 0      ← 120 s, NO HTTP status
15:33:56.133  mcp-server     [bctc-reparse-job] service Tier 1b null/short  serviceStatus:"failed"
15:33:56.132  pdf-extractor  POST /extract 200 OK
```

`serviceStatus: null` with a 120 s gap = **the client aborted; the server never
answered.** Cadence is a metronomic 122 s (14:40:45 · 14:42:48 · 14:44:54 …
15:40:04), i.e. one abandoned Tier-1a per reparse iteration, indefinitely.

Server side, `asyncio.to_thread` **cannot be cancelled**. When Starlette cancels
the handler task on client disconnect, the worker thread keeps running
`_extract_text_ocr_sync` to completion and the tesseract child keeps burning CPU.
The slot is never returned. Ten such abandonments fill the pool; every subsequent
`asyncio.to_thread` call — including the cheap `_extract_tables_sync` of *any*
new request — queues behind them forever.

**Tier 1a is now failing 100 % of the time**, and each failure costs one
permanent slot plus ~90 MiB. Every `/extract` OCR currently in flight is
**work whose consumer gave up 120 s in**. This is not a slow pipeline; it is a
pipeline that produces nothing at all while consuming the whole container.

---

## 4. Open question answered: are the long-lived ones progressing or wedged?

**Neither. They are progressing and abandoned.** Do not spend implementation
effort hunting a hang.

| Observation | Value | Reading |
|---|---|---|
| `STAT` of all ten | `Rl` (runnable, multi-threaded) | not blocked, not zombie |
| Aggregate container CPU | **200.80 %** vs `cpus: '2.0'` cgroup cap | quota-saturated |
| Per-process `%CPU` | 19.0–22.8 %, i.e. ≈ 200 % ÷ 10 | fair-share starvation, textbook |
| `NLWP` per tesseract | 4 | 40 OCR threads + 25 Python threads on 2 cores |
| Turnover, 15:03Z → 15:33Z | 9 of 10 identical PIDs, aged +30 min; 1 exited, 1 replaced | ~2 page-completions/hour at 10-deep |

Arithmetic closes cleanly: a page needing ~2–4 CPU-min at 200 DPI `vie+eng`
`--psm 6` takes 40–88 min wall at 0.2 core with OpenMP oversubscription overhead.
Fixing concurrency 10 → 1 returns ~10× CPU per page and collapses these times by
roughly an order of magnitude **as a side effect**, without touching
`PERF-PEK-PER-PAGE-LATENCY`.

Second-order amplifier, noted and deliberately **not folded in**: nothing sets
`OMP_THREAD_LIMIT`, so each tesseract spawns 4 threads → 40 runnable OCR threads
against a 2-core quota ≈ 20× oversubscription, and OpenMP spin-wait burns quota
without progress. See §9 (optional, cross-referenced to `PERF-PEK-PER-PAGE-LATENCY`).

---

## 5. Design — chosen

**One OCR gateway. One process-global bound. Subprocess lifetime bound to task
lifetime. Bookkeeping published alongside OS ground truth. A static fence so a
7th call site cannot be added silently.**

### 5.1 New — `apps/pdf-extractor/infrastructure/ocr_gateway.py`

DDD layer: **infrastructure** (owns `pytesseract`, `subprocess`, `/proc`). No
imports from `application/` or `interface/` (Fence-A, matching
`generic_md_table/extractor.py:61`).

| Element | Contract |
|---|---|
| `_OCR_SLOTS = threading.BoundedSemaphore(N)` | module-level, process-global. `N = int(os.getenv("PDFX_OCR_MAX_CONCURRENCY", "1"))`. The **single** authority. |
| `_OCR_POOL = ThreadPoolExecutor(max_workers=N)` | gateway-owned. OCR never again touches the shared asyncio default executor, so it cannot head-of-line-block the push clients / repositories that legitimately use `to_thread`. |
| `async def run_image(image, mode, *, deadline_s) -> str \| dict` | the only way to reach tesseract. `mode ∈ {"string","data"}` covers all 6 existing call sites. |
| `@contextmanager slot()` | for callers running OCR **out of process** (the `ExtractTablesUseCase` → `ProcessPoolExecutor` path). Acquired in the **parent** before `run_in_executor`, so the cross-process path shares the same global bound. |
| `OcrCapacityExceeded` | raised when queue wait `PDFX_OCR_QUEUE_WAIT_S` (default `5`) elapses → HTTP **429** + `Retry-After`. |
| `OcrDeadlineExceeded` | raised when `PDFX_OCR_PAGE_TIMEOUT_S` (default `600`) elapses. Passed straight through as `pytesseract`'s `timeout=` kwarg, whose `TimeoutExpired` branch already does `proc.terminate(); proc.wait()`. |
| `inflight() -> {"semaphore": int, "os_children": int}` | see §5.2 |
| `reap_orphans()` | called from `lifespan` shutdown: `SIGTERM` every live tesseract child, `wait(5)`, then `SIGKILL`. |

Cancellation binding: the async wrapper `await`s the gateway future inside
`try/finally`; on `CancelledError` it sets the call's abandon flag, which the
gateway's runner observes and terminates the child on. This is what makes a
client disconnect actually stop OCR — the single most valuable property of the
whole design.

### 5.2 Observability — publish bookkeeping *and* ground truth (deliverable b)

The defect class here is **a counter that disagreed with reality**. The fix must
make that disagreement visible, not assert it away.

- `os_children` is derived by scanning `/proc/*/stat` for
  `ppid == os.getpid() and comm == "tesseract"`. Dependency-free, no `psutil`.
- `GET /health` gains `ocr: {max: N, semaphore: k, os_children: m, oldest_child_s: t}`.
- Structured log line at spawn **and** exit: `pid`, `page`, `report_id`,
  `elapsed_s`, `outcome ∈ {ok, deadline, abandoned}`.
- `semaphore != os_children` is by definition a bug and must log at ERROR.

This satisfies AC-6 and makes the class permanently diagnosable without
`docker exec ps`.

### 5.3 Call-site rewiring — all six

| File:line | Today | After |
|---|---|---|
| `infrastructure/extraction_engine.py:173` | `pytesseract.image_to_string` on default executor | `await OCR_GATEWAY.run_image(..., mode="string")` — **the live defect** |
| `infrastructure/ocr_backends.py:160` | `image_to_data` | gateway, `mode="data"` |
| `infrastructure/ocr_adapter.py:454` | `image_to_string` | gateway |
| `infrastructure/ocr_worker.py:412` | `image_to_string`, runs in ProcessPool child | keep out-of-process; caller wraps `run_in_executor` in `OCR_GATEWAY.slot()` |
| `infrastructure/generic_md_table/unit_ocr.py:84` | `image_to_data` (+ retry loop) | gateway; retry loop preserved **outside** the slot so retries re-queue rather than hold |
| `infrastructure/generic_md_table/extractor.py:257` | `image_to_data` | gateway |

After this, `import pytesseract` exists in exactly one file.

### 5.4 Deliberately **kept**: `main.py:154` `ProcessPoolExecutor(max_workers=1)`

Tempting to delete as the guard that "didn't work". Do not. It exists for
`ARCH-A20-CPU-CGROUP-REVIEW` / `PDF-AVAIL-02-FIX` — keeping OCR CPU out of the
event-loop *process*. Deleting it re-opens a closed row. Instead it becomes
**subordinate** to the gateway: the semaphore is acquired in the parent process
(§5.1 `slot()`), so the two bounds compose instead of living in different
processes where they provably cannot.

The three prose declarations of the invariant (`main.py:149-152`,
`handlers.py:451`, `generic_md_table/extractor.py:66-68` *"callers MUST pass
images ONE AT A TIME … Never run multiple image_to_data calls concurrently"*,
`:131` *"NEVER run in parallel — each image_to_data call consumes ~300MB RSS"*)
are replaced by references to the gateway. Prose that four files repeat and zero
files enforce is what produced this row.

---

## 6. Rejected alternatives

**R1 — Add a semaphore to `extraction_engine.py` (per-path fix).**
Rejected. Acceptance (1) says it outright: *"an unexplained third guard is just a
fourth thing to bypass."* Six call sites, five prose warnings, two real guards,
zero composition — the failure is architectural, not a missing `if`. A per-path
patch fixes the endpoint we happened to catch and leaves the next one open.

**R2 — `loop.set_default_executor(ThreadPoolExecutor(max_workers=1))` in lifespan.**
Rejected as primary. One line, and it *would* cap OCR — but the default executor
is shared with `table_push_client.py:141`, `alert_adapter.py:136`,
`layout_first_push_client.py:155`, `md_table_push_client.py:134`,
`eval_push_client.py:142`, `repositories.py:69`. Every HTTP round-trip and DB
write would then queue behind a 40-minute OCR. It converts an OCR concurrency bug
into a service-wide head-of-line block, and it still does not bind subprocess
lifetime. The gateway's **private** pool gets the bound without the collateral.

**R3 — Non-blocking acquire → immediate 429 (copy `PekEngineAdapter`'s policy).**
Rejected. Against the *measured* caller shape — 15-wide bursts — an immediate
429 rejects 14 of 15 every time, and the caller has no backoff today, so it
would hot-loop. A **short bounded wait** (5 s) absorbs the burst's arrival jitter
and only 429s genuine overload. Bounded, so it cannot become an unbounded queue.

**R4 — Fix it caller-side (cap mcp-server fan-out).**
Rejected as *the* fix, required as a *companion*. A server whose safety depends
on callers behaving is not safe; the next caller re-opens the row. Server-side
backpressure is the invariant. See §7.

**R5 — Raise the 2.5 GiB memory cap.**
Explicitly out of scope per the row, and wrong regardless: 10-way concurrency on
a 2-core quota is CPU-pathological before it is memory-pathological.

**R6 — Reap the ten live PIDs and close.**
Not a fix; and forbidden to this agent. See §11.

---

## 7. Backpressure contract (deliverable e)

**Server side — in this zone, ships with this row:**
- Bound `N` (default 1) + bounded queue wait 5 s.
- Overflow ⇒ `429` with `Retry-After: <ceil(queue_wait)>`, body
  `{"status":"failed","error":"ocr_capacity","retry_after_s":N}`.
- `/extract` gains a 429 path it does not have today (`handlers.py:494-543`
  emits only 200/500/503).
- **Client disconnect ⇒ OCR terminated.** This alone removes the ratchet and is
  sufficient for safety even if the caller never changes.

**Caller side — mcp-server zone, NOT changed by this row:**
`pdfExtractorClient.ts:69` must learn to honour `429` + `Retry-After` with
jittered backoff, and `bctcBatchSweepJob.ts:224-230` should size `maxConcurrent`
against the advertised `/health` `ocr.max` rather than the watchlist length.
`REFINE_FANOUT_CONCURRENCY: '5'` (`docker-compose.yml:52`) shows the pattern
already exists in that service.

**Ownership: recommend PO mint a separate `dev-mcp-server` row.** I am not
minting it and not touching caller behaviour — the task forbids unilateral
caller changes. It is a **companion, not a blocker**: correctness of this row
does not depend on it.

Also observed, **flagged not folded**: `bctcReparseJob` logs client-abort as
`Tier 1a (pdf_path) null/short, serviceStatus: null` and silently falls through
to Tier 3 OCR cache. A total server-side failure is being recorded as
"short text". That is a fail-loud gap in the mcp-server zone worth its own row.

---

## 8. Sizing `N` against the cap (deliverable d) — procedure, not a number

The row forbids asserting a number without measuring it. Ship with **`N = 1`** —
the value the code has claimed since `PDFX-SINGLE-WORKER-BLOCKING`, and the only
value with any prior warrant — then measure before raising it.

Measured anchor at `N = 10` (2026-07-28T15:33Z): `2.473 GiB / 2.5 GiB` =
**98.92 %**, of which PID 1 RSS 1.68 GiB and 10 × ≈ 93 MiB tesseract (sum
overstates cgroup total by ~140 MiB of shared `vie.traineddata` mappings).

**Procedure for the implementer:**
1. Drain to `ocr.os_children == 0`; record baseline `docker stats` MemUsage.
2. For `N ∈ {1, 2, 3}`: drive the measured caller shape — 15 concurrent
   `POST /extract` against real scanned BCTC PDFs, not a synthetic fixture.
3. Sample `docker stats` every 10 s for the full burst + drain.
4. Choose the **largest** `N` whose peak MemPerc ≤ **80 % of 2.5 GiB (2.0 GiB)**,
   with the raw output and `date -u` stamps pasted into the close-out (AC-4).
5. Sanity gate: aggregate CPU must not sit pinned at the 200 % cap for the whole
   burst — that indicates `N` is still above what the quota supports.

`N` is env-driven (`PDFX_OCR_MAX_CONCURRENCY`), so step 4 needs no rebuild.

---

## 9. Optional, cross-referenced, do not fold in

`OMP_THREAD_LIMIT` is unset, so each tesseract runs 4 threads (`NLWP=4`
observed). Setting `OMP_THREAD_LIMIT` ≈ `cpu_quota / N` would remove ~20×
OpenMP oversubscription. It is a `docker-compose.yml` env change ⇒ rebuild ⇒
**user-gated**, and it is arguably `PERF-PEK-PER-PAGE-LATENCY`'s territory.
Recommendation: note it in the close-out, let PO route it. The 10 → 1
concurrency fix is the dominant term and does not need it.

---

## 10. Regression test — closing the gap the current test leaves open

### 10.1 Why `TestSemaphoreGuard` passes today and caught nothing

`apps/pdf-extractor/__tests__/test_pek_engine_adapter.py:351-406`

1. It calls `PekEngineAdapter.extract_layout_and_tables` **directly**. No ASGI
   app, no route. `/extract` — carrying 100 % of the load — is never exercised.
2. It **hand-acquires** `_extraction_semaphore` and asserts the next call raises.
   That proves *"the guard rejects while held"*. It cannot prove *"the guard is
   on the path"* — the exact property that failed.
3. It **counts nothing**. It asserts an exception type. There is no concurrency
   watermark anywhere in the suite, so "10 concurrent" is not expressible as a
   failure.
4. It never generates real concurrency; no two things ever run at once.

A test that asserts a guard rejects, from inside the guard, is a tautology about
the guard. The missing assertion is about the **system**: *how many tesseract
invocations were live at once?*

### 10.2 New — `apps/pdf-extractor/__tests__/test_ocr_concurrency_invariant.py`

**T1 · `test_extract_burst_never_exceeds_sanctioned_concurrency`** — the one that
would have caught this.

```
env PDFX_OCR_MAX_CONCURRENCY=1
app = create_app()                                   # the REAL composition root
monkeypatch ocr_gateway._exec_tesseract  ->  probe:
      with lock: live += 1; peak = max(peak, live)
      time.sleep(0.15)                               # real overlap, not simulated
      with lock: live -= 1
drive 15 concurrent POST /extract via
      httpx.AsyncClient(transport=ASGITransport(app)) + asyncio.gather
assert peak <= 1
assert every response.status_code in (200, 429)      # never 500
assert count(200) + count(429) == 15                 # nothing dropped
```

- 15 is the **measured** burst width, not a guess.
- Probes at the gateway's single exec point, so it covers all six call sites at
  once and any seventh added later.
- **Mandatory falsification step:** run T1 against **unfixed** `main` first. It
  must go RED with `peak` up to 10. Paste that red output in the close-out. A
  regression test never seen red is not evidence.

**T2 · `test_ocr_call_site_fence`** (static, durability).
Walk every `.py` under `infrastructure/`, `application/`, `interface/`,
`domain/`; assert `pytesseract` appears **only** in `infrastructure/ocr_gateway.py`.
Fails the moment a 7th call site is added. Same family as the repo's existing
mock-guard tests. This is what makes the fix a fence rather than a fourth guard.

**T3 · `test_cancelled_request_leaves_no_tesseract_child`** (AC-5, lifetime).
Spawn a long fake child through the gateway's real spawn helper; cancel the
awaiting task; assert (a) `proc.poll() is not None` within the grace window,
(b) `inflight()["os_children"] == 0`. Linux-only via `/proc`; on macOS
`skipif`, asserting the semaphore counter instead. **This is the test that
directly encodes the 120 s-abort ratchet.**

**T4 · `test_health_inflight_matches_os_truth`** (AC-6, anti-drift).
With K probes live, `GET /health` reports `ocr.semaphore == K == ocr.os_children`.
Encodes the lesson: *bookkeeping that cannot be checked against reality is how
this row happened.*

**T5 · `test_page_deadline_terminates_child`**.
`PDFX_OCR_PAGE_TIMEOUT_S=1` against a 30 s fake child ⇒ `OcrDeadlineExceeded`
within ~2 s, child dead. Would have capped the 88-minute processes.

**Regression floor (AC-7):** `test_pek_engine_adapter.py::TestSemaphoreGuard` and
`test_ocr_backends.py` must still pass unmodified.

**All five are offline and CI-runnable** — no container, no real tesseract, no
network. The live 15-wide burst in AC-2/3/4 is deploy **verification**, not the
regression test; a regression test that needs a container is not a regression
test.

### 10.3 Latent defect found while tracing — record, do not fix here

`extraction_engine.py:177-178` swallows **every** OCR exception and returns `""`.
Combined with `services.py:71` (`ocr_conf < 0.5 AND not tables` ⇒ reject), a
document with any table and **zero** OCR text passes the quality gate and is
stored as a successful extraction. This is also the mechanism by which §11's
mitigation would silently degrade the ten in-flight documents. Suggest PO mint
separately; explicitly **not** in scope here.

---

## 11. Runtime mitigation — RECOMMENDATION ONLY, NOT PERFORMED

**Nothing was killed, stopped, restarted or written. All probes were read-only:
`docker stats`, `docker inspect`, `docker logs`, `docker exec … ps`, `docker info`.
No POST/PUT/PATCH/DELETE was issued to any service endpoint, deliberately —
headroom is ~27 MiB and a write probe could trigger the OOM this row exists to
prevent.** Recorded here for the user, who alone may gate it.

**Option A — reap the ten tesseract PIDs** (`SIGTERM`, not `docker kill`).
- *Correction to the row's estimate:* this will **not** free ~890 MiB of cgroup
  usage. PID 1 alone holds 1.68 GiB RSS. Expected relief ≈ **0.79–0.93 GiB**,
  landing ≈ 1.55–1.70 GiB ≈ **62–68 %** of cap.
- *Cost:* the ten in-flight page OCRs (7–88 min deep) are lost — but per §3.2
  **their HTTP clients aborted 120 s in, so the results were already
  unreachable.** The realised cost is closer to zero than the row assumes.
- *Data-quality caveat:* per §10.3, killing the child makes `_ocr_page` return
  `""`, so those documents may be **stored as low-quality successes** rather
  than failing loudly. That, not the lost CPU, is the real cost.
- *Durability:* temporary. The pool re-arms on the next burst (observed ~hourly:
  12:14, 12:16, 13:57, 14:11, 14:24) and the 122 s reparse drip re-fills it
  regardless.

**Option B — do nothing until the fix ships.** `OOMKilled=false` and
`RestartCount=2` (both cumulative since Created 2026-07-21, unchanged across
6 h 16 m of continuous uptime from `StartedAt=2026-07-28T09:26:20Z`) show the
container has *held* at 96–99 % without dying. Risk is real but has not been
realised. The pool will **not** drain on its own — throughput is ~2 pages/hour
against a continuous 122 s inflow.

**Both are kills; both are user-gated. This agent executed neither and instructs
no one downstream to execute either.** If gated, route to `ops`. VN market is
closed, so the 2026-06-01 intraday-price anchor does not apply right now.

---

## 12. Not re-derived / not claimed

- **`458 jobs stuck in processing` — NOT USED.** PO's refutation stands. No live
  jobs count was taken: the mechanism is proven without one, and the only paths
  to that table (`docker exec … sqlite3`, or a host read of a live-WAL DB) are
  outside the read-only whitelist I was given. Deliverable (f) is **deferred
  intact** to the implementer, who should take it read-only through the runtime
  and record the result either way. This row does not depend on the answer.
- Auditor `.acked_memory` suppression: PO ruled 2026-07-28T15:28Z
  (`docs/agent-memory/decisions/triage-20260728T1528Z-po.md`). Shipping this row
  is the lever that ends the ~30 min Tier-1 re-audit churn. Real recurring cost,
  correctly subordinate to correctness.
- Not re-minted: `FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE`,
  `FIX-AUDITOR-EMIT-SEVERITY-LABEL-FLAT-ESCALATION-BYPASS-NEVER-FIRES`,
  `FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP`,
  `FIX-AUDITOR-TIER1-FRESHNESS-CHECK-RELOCATE-TO-SENTINEL`.
- Not touched: mcp-server's 120 s Tier-1 timeout (`FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT`,
  REVIEW); per-page latency / checkpointing (`PERF-PEK-PER-PAGE-LATENCY`); the
  2.5 GiB cap; the auditor detector plane; `docs/data/quality-checklist.json`.
- **Sequencing — CORRECTED 2026-07-28T15:57:36Z, no constraint.** An earlier
  revision of this brief said *"land `FACTORY-PDF-extract-tesseract-config`
  first"*. **That was wrong and is withdrawn.** That row's code is already on
  `main` — commit `cfe0a78d7 refactor(pdf-extractor): FACTORY-PDF-extract-tesseract-config
  shared OCR config` — and `git show HEAD:` confirms `infrastructure/tesseract_config.py`
  is present at HEAD with all six importers already importing from it. `REVIEW`
  on this board means *landed, awaiting QA verification*
  (`qa_verify_mode=verify-committed`), **not** *pending implementation*. There is
  no unlanded edit to those files, therefore no collision to sequence around.
  §5.3 rewires a tree that already contains the refactor.
  **No `depends` was set, deliberately** — a P0 memory-pressure fix blocked on a
  P2 whose work is already merged would be a false blocker, and `deps_satisfied()`
  requires `DONE_VERIFIED`, so it would have pinned this row behind a QA queue
  for zero benefit.
  *Residual, ordinary:* if QA rejects and reverts `cfe0a78d7`, this row's edits to
  those six files need a rebase. That is a merge concern, not a dependency.

---

## 13. Implementation order (for `dev-pdf-extractor`)

| # | Step | Gate |
|---|---|---|
| 0 | Write T1, run it against unfixed `main`, capture RED | red output pasted — non-negotiable |
| 1 | `infrastructure/ocr_gateway.py` + unit tests T3/T4/T5 | green |
| 2 | Rewire `extraction_engine.py:173` only; run T1 | T1 green, peak ≤ 1 |
| 3 | Rewire remaining 5 call sites; add fence test T2 | T2 green |
| 4 | `handlers.py` → `OcrCapacityExceeded` ⇒ 429 + `Retry-After` | contract test |
| 5 | `main.py` / `lifespan.py`: wire gateway shutdown reaper; subordinate the ProcessPool to `slot()` | `PDF-AVAIL-02` `/health` <5 s unregressed |
| 6 | `/health` `ocr` block | T4 green |
| 7 | Full offline suite + `test_pek_engine_adapter.py` unmodified | AC-7 |
| 8 | Rebuild ⇒ **user-gated**, route to `ops`; then live AC-2/3/4 burst | raw `ps` + `docker stats` with `date -u` |

**Build standard:** `not-applicable` (BUG-FIX in an existing zone; no new
service, no new primitive).

**Risk flags:** (1) step 5 touches the `ARCH-A20` fix — re-verify `PDF-AVAIL-02`
`/health` latency explicitly; (2) `N=1` reduces steady-state throughput vs the
*nominal* 10 but **increases** real throughput, since today's 10 produce results
nobody reads; (3) `unit_ocr.py`'s retry loop must sit **outside** the slot or a
retrying page holds the only slot for `3 × deadline`.
