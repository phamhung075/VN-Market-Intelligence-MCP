# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · dev-rag-service

**Sprint goal:** Make cowork `guaranteed:true` an honored contract (look-back/catch-up on missed slots). This entry is an ambient CI-red fix filed under the active sprint bucket per fleet journal convention, unrelated to the sprint's own scope.
**Agent:** dev-rag-service
**Started:** 2026-08-07T01:29:33Z

---

### STEP dev-rag-service-S1 · dev-rag-service · 2026-08-07T01:29:33Z
**task-id:** FIX-CI-SIZELINT-RAG-EMBEDDER-NEW-OFFENDER
**what-done:** Added `# size-justification: 175L — ...` header (first 8 lines) to apps/rag-service/infrastructure/embedder.py; declared count matches post-edit `wc -l` exactly (167L→175L).
**what-considered:**
- Split lazy-load vs idle-unload into two files — rejected: both share the SAME asyncio.Lock double-check pattern + SAME _model/_last_used_monotonic state; a split would duplicate the lock or force tight cross-file coupling.
- Justification header only (no split) — chosen, per task's own stated preference for genuinely cohesive lifecycle code.
**why-decision:** File IS the singleton's full state machine (load+unload), not a bag of unrelated helpers — honest justification beats an artificial split.
**why-change:** No change from task brief — AC1 explicitly favored justification over split for this file.

---

### STEP dev-rag-service-S2 · dev-rag-service · 2026-08-07T01:29:33Z
**task-id:** FIX-CI-SIZELINT-RAG-EMBEDDER-NEW-OFFENDER
**what-done:** Did NOT run `--update`; verified fix scoped: `SIZE_LINT_INCLUDE_OVERRIDE=embedder.py --check` → RC=0; full-repo `--check` offender count 4→3 (embedder.py cleared).
**what-considered:**
- Run full `--update` to regenerate baseline — rejected: AC2 forbids it (would launder 3 unrelated current offenders repo-wide).
- Scoped env-override verification vs waiting for sibling baseline tasks to land for a true full-repo RC=0 — chose scoped verification now; documented remaining 3 offenders belong to sibling tasks (BCTCREFINED-PROJECTION-BASELINE, RAG-APP-FACTORY-BASELINE, schema.ts) sequenced separately per task NOTE.
**why-decision:** Task's own NOTE states this task's work is independent of the baseline-touching siblings — full-repo green is a batch-level outcome, not provable from this single-file commit alone.
**why-change:** No change — AC3/AC4 full-repo green depends on sibling tasks landing; this entry records honest scoped verification only.

---

### STEP dev-rag-service-S3 · dev-rag-service · 2026-08-07T02:00:00Z
**task-id:** FIX-CI-SIZELINT-RAG-APP-FACTORY-BASELINE
**what-done:** Added a `# size-justification: 177L — ...` comment header (9 lines, before the module docstring) to `apps/rag-service/app_factory.py`, no code/behavior change.
**what-considered:**
- Split `_idle_unload_loop()`/`build_lifespan()` into their own module (status_note's stated preference) — rejected: they share embedder-duck-typing + asyncio.Task lifecycle wiring with `add_cors_middleware()`/`build_real_adapters()`, all extracted-from-main.py composition-root scope; a split fragments one cohesive root for no token benefit.
- Header-only justification (router-directed, matches sibling embedder.py fix pattern on FIX-CI-SIZELINT-RAG-EMBEDDER-NEW-OFFENDER) — chosen.
**why-decision:** Same cohesion argument as the embedder.py precedent: one file IS the composition root's app-construction helpers, not a bag of unrelated concerns; comment-only fix is honest and zero-risk.
**why-change:** Board status_note offered a split as "preferred" — overridden by explicit router task instruction (header-only, comment-only, zero behavior change) which takes precedence.

**Merge Gate renumbering note:** authored in its own worktree as a fresh S1 (that worktree branched before the sibling embedder-task journal file existed on main); renumbered to S3 when reapplied, appending after agent aa79e0a60034da7fc's S1/S2 which landed first in this Merge Gate's sequential order.

---

### STEP dev-rag-service-S4 · dev-rag-service · 2026-08-12T06:14:24Z
**task-id:** FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS
**what-done:** Implemented per architect's superseding brief (2026-08-12), NOT the board row's own stale allocator-retention title: (1) primary fix — `_build_vector_index()`/`_maybe_build_vector_index()` in `repositories.py`, lazy `lancedb.index.IvfPq` ANN index on `vector`, gated by `_VECTOR_INDEX_MIN_ROWS=256` (LanceDB's own empirically-confirmed IVF_PQ training floor); (2) secondary — `_malloc_trim_or_noop()` periodic sweep in `app_factory._idle_unload_loop()`, guarded `ctypes.CDLL`; (3) `POST /admin/rebuild-vector-index` mirroring `/admin/rebuild-fts`.
**what-considered:**
- Unconditional index build in `search()` vs threshold-gated lazy build — chose gated: an unguarded `create_index()` empirically raises `RuntimeError("Not enough rows...")` below 256 rows (confirmed via scratch repro), which would break ~11 existing `search()`-calling tests across tiny fixtures; the gate is a cheap `count_rows()` no-op below threshold, zero regression.
- Pre-check via `count_rows()` vs try/except around `create_index()` swallowing the specific error string — chose pre-check: deterministic, unit-testable boundary logic, doesn't rely on fragile Rust error-string matching across lancedb versions.
- Trim sweep tied to the embedder-duck-type early-return (`if not callable(maybe_unload): return`) vs independent trigger — kept tied (simpler, matches "permanent no-op for sandbox fakes" comment/determinism-gate exactly, production embedder always implements the hook anyway).
- Separate `/admin/rebuild-vector-index` endpoint vs riding `/admin/rebuild-fts` or the disabled FTS nightly cron — chose separate, per brief's explicit instruction not to silently couple the two (cross-row decision left unmade by the brief).
**why-decision:** Brief §3b named `_get_table()`'s 130 MiB handle-open cost + `search()`'s brute-force `vector_search()` (~340-444 MiB/20-600 calls, ~65-80x embedder footprint) as the confirmed dominant mechanism — architectural fix (index), not allocator hygiene, is the load-bearing remedy; malloc_trim recovers only 8-15% here per the same isolated repro.
**why-change:** Board row's `root_cause_hypothesis`/title (malloc_trim/allocator-retention as primary) explicitly superseded by architect's isolated repro — implemented the ratified brief instead, landed the allocator fix too as brief's own "cheap, low-risk, still worth landing" secondary recommendation, not a substitute.

---

### STEP dev-rag-service-S5 · dev-rag-service · 2026-08-14T07:15:00Z
**task-id:** FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED
**what-done:** Discriminated ineffective-vs-insufficient live in-container (isolated fresh process, scratch db, `docker exec`) before patching, per PO directive. Confirmed pin IS effective (env vars resolve to "1" pre-runtime-init, no fallback-to-auto in logs) but INSUFFICIENT (2 lancedb-tokio-w + 2 lance-cpu threads persist regardless; `strings` on `_lancedb.abi3.so` found no `max_blocking_threads`-equivalent knob — no further env lever exists). Root-caused the real amplifier: `_vector_index_built` is per-process, always False on restart, so the full IVF_PQ/KMeans corpus rebuild re-fires on every cold start even when a valid index already persists on disk (confirmed live: prod `vector_idx` built once 2026-08-13T09:30:44Z, still valid 22h+ later). Fixed: `_maybe_build_vector_index()` now checks `table.list_indices()` before rebuilding; skips if the `vector` column is already indexed, graceful fallback to old behavior if `list_indices()` raises.
**what-considered:**
- Chase a tighter thread-pool env pin (e.g. retry different var names/values) — rejected: exhaustive `strings` scan proved no further knob exists in the compiled binary; would be re-litigating an already-closed question.
- Raise `docker-compose.yml` memory ceiling as the primary fix — rejected as THIS row's fix: out of `apps/rag-service/` zone (`not_my_job: Infrastructure/Docker`); flagged as an ops-recommendation in the handoff instead, not actioned.
- Skip-rebuild-if-persisted-index check inside `_maybe_build_vector_index()`'s existing lock (chosen) vs a new separate startup-time index-check pass — chose inline: reuses the existing `_vector_index_lock` critical section and `_vector_index_built` flag lifecycle exactly, zero new abstraction (Q2 simplicity gate).
**why-decision:** dmesg (VM-internal, per AC) is the only trustworthy OOM signal here; docker inspect OOMKilled is a confirmed false-negative this environment. The persisted-index check removes the actual restart-triggered amplifier the thread-pin alone could never close, since no thread-count knob can reach exactly 1.
**why-change:** No change from PO's directive — explicitly asked to discriminate before patching; discrimination result determined the fix direction (skip-redundant-rebuild, not a tighter pin).
