# FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED

**Priority:** P0 — live production crash loop, dispatched outside normal backlog
queueing by explicit PO directive (2026-08-14T06:50:41Z).

## Context (as received)
rag-service container (`92e6017318e4`) kernel-OOM-killed 3x in ~44h
(2026-08-12T13:46:51Z, 2026-08-12T14:00:57Z, 2026-08-13T09:20:09Z) — AFTER
`ca6d86869`'s `TOKIO_WORKER_THREADS=1`/`LANCE_CPU_THREADS=1` thread-pin fix was
deployed and content-hash-verified live. All 3 kills invoker=`lancedb-tokio-w`.
`docker inspect .State.OOMKilled` reads `false`/`ExitCode=0` for all 3 —
documented, confirmed unreliable in this environment; `dmesg` inside the Docker
Desktop VM is the only trustworthy signal.

PO's unconfirmed lead: does the pin actually take effect (ineffective) or take
effect but is insufficient (need a different fix)? Discriminate before patching.

## [Developer] Investigation — Discrimination (ineffective vs. insufficient)

Done live, in-container, against the running production image (`92e6017318e4`)
— not theoretically:

1. **Confirmed the pin IS taking effect.** Isolated a fresh `python3` process
   inside the live container (`docker exec`, scratch LanceDB path — zero
   production data touched) replicating the exact `main.py` import chain.
   Printed `os.environ["TOKIO_WORKER_THREADS"]`/`["LANCE_CPU_THREADS"]` —
   both read `"1"` **before** the first `lancedb.connect_async()` call (the
   pin's own documented ordering requirement — module-level `setdefault()` in
   `infrastructure/repositories.py` runs at import time, well before any
   deferred `import lancedb` inside `_get_table()`). No `"Falling back to
   auto"` fallback message (confirmed as the literal Rust error path for an
   unparseable value, via `strings` on the compiled `.so`) appeared in
   container logs — the value is syntactically valid and accepted.
2. **Confirmed it is INSUFFICIENT.** `/proc/<pid>/task/*/comm` enumeration in
   BOTH the live production container and the isolated repro showed **2
   `lancedb-tokio-w` + 2 `lance-cpu` threads persisting even with both env
   vars pinned to `"1"`** — never converging to exactly 1.
3. **Root cause of the insufficiency.** `strings /usr/local/lib/python3.10/
   dist-packages/lancedb/_lancedb.abi3.so` (live version confirmed `0.36.0`)
   found no `max_blocking_threads` (or equivalent) env knob anywhere in the
   binary. `TOKIO_WORKER_THREADS` sizes only Tokio's CORE async-executor
   worker pool; Tokio also maintains a separate, always-present, on-demand
   BLOCKING-thread pool (used for blocking file I/O during table-open/
   index-build) that inherits the SAME `"lancedb-tokio-worker"` thread-name
   prefix — indistinguishable in `/proc`, and this repo has no lever to
   size it. `lance-cpu` is a `rayon` pool whose `LANCE_CPU_THREADS`
   interacts with an undocumented `LANCE_IO_CORE_RESERVATION` floor (message
   string: `"...using 1 CPU for compute intensive tasks."`) — also bottoms
   out above 1. **No further env-var lever exists for either pool.**
4. **The real per-restart amplifier.** `_vector_index_built` is a
   per-**process** in-memory flag (always `False` on a fresh container
   start) — but a LanceDB index persists on disk (Lance dataset manifest)
   across restarts. Confirmed live: production `vector_idx` was built once
   at `2026-08-13T09:30:44Z` (~10 min after the `09:20:09Z` restart) and was
   still valid, unrebuilt, 22h+ later at investigation time
   (`num_indexed_rows=29,364` of `29,419` total — a normal small incremental
   gap). Without a check, **every** restart re-triggers a full IVF_PQ/KMeans
   retrain over the WHOLE corpus on the first `search()`/`hybrid_search()`
   call — the single most thread/memory-heavy operation in this file — even
   when a valid persisted index already exists.

**Verdict:** the thread-pin fix is real and correctly implemented, but cannot
reach exactly 1 total OS thread for either pool (no lever exists) — pursuing a
tighter pin is a dead end. The fix that actually reduces OOM risk removes the
restart-triggered redundant full-corpus rebuild instead.

## [Developer] Implementation Record
- **Service:** rag-service
- **Zone:** `apps/rag-service/`
- **Files modified:**
  - `apps/rag-service/infrastructure/repositories.py:566-611` — `_maybe_build_vector_index()`
    now calls `table.list_indices()` inside the existing `_vector_index_lock`
    critical section before attempting a build; if an index already covers the
    `vector` column, sets `_vector_index_built = True` and returns without
    rebuilding. `list_indices()` failure degrades to the pre-existing
    row-count-gated build check (never silently skips a legitimately-needed
    first build).
  - `apps/rag-service/__tests__/unit/test_rag_vector_index_build.py` — new
    `TestVectorIndexPersistsAcrossRestart` class (3 tests): persisted-index
    skip (real end-to-end LanceDB, simulated restart via a second store
    instance on the same `db_path`), negative control (no persisted index
    still builds normally), `list_indices()`-raises graceful fallback.
  - `docs/architecture/microservice/rag-service/infrastructure.md` — new
    `FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED` section
    documenting the discrimination + fix.
  - `docs/architecture/microservice/rag-service/testing.md` — new test
    coverage section for the same.
- **Tests written:** 3 new (`test_new_process_does_not_rebuild_existing_persisted_index`,
  `test_no_persisted_index_still_builds_normally`,
  `test_list_indices_failure_falls_back_to_existing_behavior`) — all GREEN.
  RED confirmed first (rebuild fired against a persisted index pre-fix).
- **Type check:** `python -m mypy . --ignore-missing-imports` — zero NEW
  errors introduced (byte-identical error set to baseline `main`, only line
  numbers shifted by the insertion; diffed explicitly against `git stash`
  baseline to confirm).
- **Service tests:** 201 pass / 0 fail (`python -m pytest`, full suite).
- **Docs updated:** `docs/architecture/microservice/rag-service/infrastructure.md`,
  `docs/architecture/microservice/rag-service/testing.md`.
- **Graphify:** skipped — no Skill-tool grant available in this subagent
  context (only Read/Edit/Write/Bash tools were provided this cycle); not
  fabricated as run.
- **Simplicity gate:** PASS — Q1 scope clean (no feature beyond the
  persisted-index check + its documented graceful-degradation fallback), Q2 no
  single-use abstractions introduced, Q3 senior-test clean (a guard clause
  inside an existing lock, same shape as the file's other lazy-build guards),
  Q4 ratio: code delta is a small guard block (~15 real lines) + a root-cause
  comment matching this file's own established heavily-commented convention
  (every prior OOM-fix block in this file carries comparable investigation
  narrative) — not speculative.

## Still open — flagged for PO/ops, NOT actioned here (out of `apps/rag-service/` zone)
Live container memory sits at ~91–95% of the 1GiB ceiling even in **steady
state** (no rebuild in flight): `docker stats` sampled 934.3MiB/1024MiB
(91.24%) during this investigation; task board recorded 976.6–977.1MiB
(95.37–95.42%) at dispatch time. This fix removes the dominant per-restart
amplifier but does not by itself guarantee headroom for every future growth/
traffic scenario on a corpus growing ~100 rows/h. A `docker-compose.yml`
`rag-service.deploy.resources.limits.memory` review (currently `1g`) is a
reasonable companion action for ops to consider — not made here (zone
boundary: `apps/rag-service/` code only, `docker-compose.yml` is
infra/ops territory per this agent's `not_my_job`).

## AC per PO directive (binding — next actor must honor)
`REBUILD_REQUIRED: true`. Verification is **≥2h supervised sampling with
`dmesg` inside the Docker Desktop VM** as the sole pass/fail signal. **Never**
`docker inspect .State.OOMKilled` (proven unreliable this incident) and
**never** a short/immediate-only probe window — sibling row
`FIX-QA-OOM-CLASS-AC3-CERTIFIES-ON-UNRELIABLE-SIGNAL-AND-UNSETTLED-WINDOW`
exists precisely because a prior certification on this exact container used
both invalid signals and was falsified by the kernel 60 minutes after closing.

NEXT: qa | ops must rebuild+redeploy first (`docker compose up -d --build
rag-service`), then qa/ops runs the ≥2h supervised `dmesg` window before any
DONE/DONE_VERIFIED status flip.
