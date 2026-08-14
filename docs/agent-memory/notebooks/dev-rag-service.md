# dev-rag-service — Notebook

Zone: `apps/rag-service/` | Stack: Python/FastAPI | DB: rag_service.db (write)

## Working Memory

### 2026-08-14 (later cycle) — FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS (P0, PO critical-path ruling, in-process attribution mandated)

**Task:** PO ruling `po_RULING_CRITICAL_PATH_20260814T0927Z` de-certified 3 prior fixes (memory-cap raise, thread-pin, skip-redundant-rebuild) — each looked like a fix and OOM-killed within hours. Explicit ban on another restart-timing/deploy-config guess; required deliverable: a per-allocation-site attribution from a real in-process memory profile on the deployed image, naming the retaining object graph — not RSS-delta inference.

**Method:** `scripts/audits/rag-lancedb-mem-attribution-probe.py` — drove the REAL production traffic mix (docker logs, 2026-08-14T09:39Z 60min window: 79 `POST /index` : 19 `POST /search`, ~4:1 write:read — both 2026-08-12 probes tested `search()` only, missing the dominant write path) against the real `LanceDBVectorStore` singleton, via `docker run` against the deployed image + a read/write COPY of the production corpus (never the live container's own data). Instrumented 3 orthogonal planes simultaneously at every checkpoint: `tracemalloc` (Python heap), `gc.get_objects()` type census (dependency-free `objgraph.show_growth()` equivalent — `objgraph` not installed in the deployed image), `pyarrow.default_memory_pool().bytes_allocated()` (Arrow's own native pool, backend=`mimalloc` — a 3rd allocator context, separate from glibc/CPython).

**Root cause, named by elimination:** over 140 ops (~4.5min), RSS climbed ~120MB while `tracemalloc_current_kb` moved +60KB total, `pyarrow` pool `bytes_allocated` stayed 0 the entire run, and `lancedb`/`pyarrow` wrapper-object gc counts stayed capped at +1 — none of Python heap / PyArrow buffers / Python-visible object counts can account for the growth. Confirmed live against lancedb 0.37.1: `lancedb.connect_async()` with no `session=` builds lancedb's own internal `Session.default()` — its own docstring: "6GB index cache + 1GB metadata cache", i.e. effectively unbounded inside this service's 1GB container (never reaches its own eviction floor before OOM). Second, independently-measured contributor found while validating the Session fix didn't fully plateau growth in a longer (~1200-op) synthetic replay: `_COMPACT_RETENTION`'s 2-day default never prunes anything within this container's real uptime (OOM-restarts every 30-90min) — re-running `optimize(cleanup_older_than=timedelta(seconds=0))` against the same grown corpus copy pruned 4170 stale versions / ~422MiB in one call.

**Fix:** `_get_table()` (`infrastructure/repositories.py`) now builds an explicit `lancedb.Session(index_cache_size_bytes=.., metadata_cache_size_bytes=..)` when `LanceDBVectorStore.__init__`'s new `index_cache_bytes`/`metadata_cache_bytes` params are set (wired from `Config.lancedb_index_cache_mb`/`lancedb_metadata_cache_mb`, env `LANCEDB_INDEX_CACHE_MB`=96/`LANCEDB_METADATA_CACHE_MB`=32 default) — `None` (untouched default) preserves the exact pre-fix behaviour for every caller that doesn't opt in. `compact_retention` ctor param (wired from `Config.lancedb_compact_retention_hours`, env `LANCEDB_COMPACT_RETENTION_HOURS`=1h default) overrides the module `_COMPACT_RETENTION` passed to `table.optimize(cleanup_older_than=...)`. `app_factory.build_real_adapters()` threads both from `Config` into the real `LanceDBVectorStore`.

**Co-fixed (PO-flagged co-blocker):** QA `CHANGES_REQUESTED` 2026-08-12T09:33Z — `fastapi.testclient.TestClient` could not import in the deployed image; live error message: starlette (resolves 1.6.0 here) requires `httpx2`, not `httpx`. Added `httpx2>=2.10.0` to `requirements.txt` + `pyproject.toml` dev extras.

**Tests:** 14 new in `__tests__/unit/test_rag_lancedb_session_and_retention_bound.py` — Session-not-built-by-default, Session built with exact configured bytes (patched `lancedb.Session` spy), a REAL end-to-end (no mocks) 80-insert+20-search replay against a deliberately tiny cache bound confirming live `Session.size_bytes` stays bounded, retention-override wiring through `compact()` (real table + spy on `optimize()`), `Config` env default/override pairs for all 3 new knobs, `build_real_adapters()` production wiring. 215/215 pytest green in-image (201 baseline + 14 new — httpx2 install unblocked the ~11-12 previously-failing TestClient tests too).

**Verified:** mypy — repositories.py hits are all pre-existing `self._db`/`self._table` untyped-attribute categories (verified line-by-line manually, not stash-diffed — shared multi-agent repo, `git stash` collision risk per `feedback_qa_git_stash_collision_shared_repo_near_miss.md`); config.py/app_factory.py show ZERO mypy hits. Sandbox primitive 16/16 + module 2/2 GREEN exit 0. Env-audit ran empty modulo `CLAUDE_CODE_MESSAGING_TOKEN` — a false-positive from grepping this agent's own host shell (Claude Code harness var), not the sandbox subprocess, unrelated to rag-service. Fence-A/B clean (pre-existing docstring-only hits). Size-lint `--check` PASS repo-wide (3 files' size-justification headers updated with exact post-edit `wc -l`). Mock-guard PASS.

**Scope note:** this row's own AC (RAG-MEM-DURABILITY-BAR v2 D1-D5, in particular D3's ≥12h positive-plateau measurement) requires an ops-supervised multi-hour post-deploy window — outside this agent's zone/tool grant (Docker ops = ops's job). RETURN carries `REBUILD_REQUIRED: true`. Board row: `next_agent` → `qa` (code review first), commit `0eb733b57`. RAW-verified the board write landed (re-read `docs/data/orch/orch-state.json` post-`orch-apply.sh`).

**DJ:** none minted (single-cycle investigation+fix, no multi-step decomposition needed).

Zone health: rag-service test suite 215/215 green (+14 this cycle), size-lint clean, no other drift observed. HEALTHY | FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS → REVIEW (next_agent: qa)

---

### 2026-08-14 — FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED (P0, live incident, router-dispatched)

**Task:** container `92e6017318e4` OOM-killed 3x in ~44h (dmesg-confirmed, invoker `lancedb-tokio-w`) AFTER `ca6d86869`'s `TOKIO_WORKER_THREADS=1`/`LANCE_CPU_THREADS=1` pin deployed + content-hash-verified live. PO asked to discriminate ineffective-vs-insufficient before patching.

**Discrimination (done live, in-container, `docker exec` against the running prod image, scratch db — no prod data touched):** pin IS effective — fresh isolated process confirmed both env vars read `"1"` before the first `lancedb.connect_async()`, no `"Falling back to auto"` fallback in logs (confirmed as the binary's own literal error path via `strings`). But INSUFFICIENT — `/proc/<pid>/task/*/comm` showed 2 `lancedb-tokio-w` + 2 `lance-cpu` threads persisting regardless, in BOTH prod and the isolated repro. `strings` on `_lancedb.abi3.so` (live v0.36.0) found no `max_blocking_threads`-equivalent knob anywhere — Tokio's separate on-demand blocking-thread pool (shares the same thread-name prefix) and lance-core's rayon IO-core-reservation floor each bottom out above 1, with no further env lever available. Root-caused the REAL amplifier instead: `_vector_index_built` is per-process, always False on restart, so the full IVF_PQ/KMeans corpus rebuild re-fires on EVERY cold start even when a valid index already persists on disk (confirmed live: prod `vector_idx` built once 2026-08-13T09:30:44Z, still valid unrebuilt 22h+ later).

**Fix:** `_maybe_build_vector_index()` (`infrastructure/repositories.py`) now calls `table.list_indices()` inside the existing `_vector_index_lock` before attempting a build — skips the rebuild entirely if the `vector` column is already indexed; `list_indices()` failure degrades gracefully to the pre-existing row-count-gated check.

**Tests:** 3 new in `test_rag_vector_index_build.py` (`TestVectorIndexPersistsAcrossRestart`) — real end-to-end persisted-index-skip via a simulated restart (2nd store instance, same `db_path`), negative control (no persisted index still builds), `list_indices()`-raises fallback. RED confirmed first. 201/201 pytest green. mypy: byte-identical error set to `main` baseline (diffed via stash), 0 new categories.

**Still open, flagged for PO/ops (out of zone — `docker-compose.yml` is infra):** steady-state memory ~91-95%/1GiB even with no rebuild in flight — a memory-ceiling review is a reasonable companion action, not made here.

**AC (binding, next actor):** `REBUILD_REQUIRED: true`. Verification = ≥2h supervised `dmesg`-inside-VM sampling ONLY — never `docker inspect .State.OOMKilled`, never a short window (sibling row `FIX-QA-OOM-CLASS-AC3-CERTIFIES-ON-UNRELIABLE-SIGNAL-AND-UNSETTLED-WINDOW` exists because a prior cert on this exact container used both invalid signals and was falsified 60min later).

**DJ:** `docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-rag-service.md` S5.

Zone health: rag-service test suite 201/201 green (+3 this cycle), no other drift observed. HEALTHY | FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED → REVIEW (next_agent: qa)

---

### 2026-08-12 — OPS-RAG-SERVICE-REBUILD-DEPLOY-LANCEDB-FIX (P0, router-reassigned after AC-3 FAIL)

**Task:** the FIX-RAG-EMBEDDER-IDLE-UNLOAD fix below (commit `4c8c601e6`) got deployed by ops (10:14:37Z) but AC-3 FAILED: container OOM-restarted TWICE more within 10min of the "fix" going live (10:18:10Z, 10:24:01Z per ops.md correction). Router reassigned to me with the post-fix samples to find WHY the fix wasn't holding — not to re-attempt a bare rebuild.

**Root cause (dmesg-confirmed, NOT speculation):** `docker inspect .State.OOMKilled` read `false`/`ExitCode=0` for both crashes — **unreliable in this Docker Desktop environment**, the VM-boundary cgroup OOM signal doesn't reliably propagate to dockerd's reported state here. `dmesg` **inside the VM** (`docker run --rm --privileged --pid=host alpine dmesg`) told the true story: kernel memcg OOM-killer invoked BY THREADS NAMED `lancedb-tokio-w`/`lance-cpu` — LanceDB's own native Rust worker pools, not the CPython heap, mid IVF_PQ/KMeans training. Two compounding causes: (1) `strings` on `_lancedb.abi3.so` (0.36.0) surfaced `TOKIO_WORKER_THREADS`/`LANCE_CPU_THREADS` — general-purpose lance-core thread pools that default-size from the HOST's visible CPU count (6, `os.cpu_count()` inside the container agrees — cgroup `cpus: 1.0` quota is invisible to `sched_getaffinity()`), same root-cause SHAPE as the already-landed RAG-FTS-BUILD-MEMORY-BOUND fix, just uncovered knobs it never pinned. (2) `_maybe_build_vector_index()` had no concurrency guard — concurrent `/search` requests on the single asyncio loop could race into building the index N times simultaneously (confirmed live traffic includes concurrent requests), multiplying peak memory. `malloc_trim` (a live hypothesis in the dispatch) is CONFIRMED the wrong layer — different allocator context entirely from Rust's in-use thread-local allocations.

**Fix:** pinned `TOKIO_WORKER_THREADS=1`/`LANCE_CPU_THREADS=1` via `os.environ.setdefault()` (`infrastructure/repositories.py` module header, same placement/pattern as `LANCE_FTS_NUM_SHARDS`) + `_vector_index_lock` (`asyncio.Lock`, double-checked inside), same shape as the existing `_compact_lock` precedent. Commit `ca6d86869`.

**Verified live (no detached background — all sampling done synchronously in-turn):** rebuilt (new image `sha256:b9a7109e...`), first real IVF_PQ build (27,684-row corpus) completed in ~6s (was 40s+, never finished before OOM) and peaked at 796.7MiB (was >1020MiB anon-rss when OOM-killed). 26+ min continuous post-rebuild monitoring: memory flat 796.7-803.9MiB, `restarts=0` throughout, `dmesg` shows ZERO new OOM events since the rebuild. Peers (mcp-server 17h, pdf-extractor 34h) unaffected before/after. 198/198 pytest green (195 baseline + 3 new: env-pin AC-1/AC-2 pair, concurrent-build regression guard via `asyncio.gather()`). mypy +6 (all untyped test fns, 0 new categories). size-lint: header `642L→715L`, PASS. Sandbox primitive+module GREEN, env-audit empty.

**DJ:** none minted (single-cycle FIX, no multi-step decomposition needed).

Zone health: HEALTHY (targeted infra-layer fix, verified against real OOM evidence, no regression) | OPS-RAG-SERVICE-REBUILD-DEPLOY-LANCEDB-FIX → REVIEW (next_agent: qa)

---

### 2026-08-12 — FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS (P0, PO-severity-expedite)

**Task:** PO-severity-expedite manual dispatch (po-S157/po_expedite_20260812T0542Z) bypassing the idle-tick rotation for a live incident: rag-service hit BELOW-FLOOR memory 3x in ~90min, each recovered only by a scoped ops restart, each climbing back to critical within ~50min. A PRIOR spawn attempt on this task_id (site=S1, ~03:15Z) died silently — confirmed at cycle start: zero notebook entry, no branch/worktree, no uncommitted `apps/rag-service/` state; clean start, nothing to recover. Board row's own title/`root_cause_hypothesis` (malloc_trim/allocator-retention) was PARTIALLY REFUTED and superseded by the architect's 2026-08-12 isolated repro (`docs/architecture-briefs/2026-08-12-fix-rag-embedder-idle-unload-second-growth-source.md`) — implemented per the brief, not the stale row title.

**Root cause (architect-diagnosed):** `rag_entries` had ZERO index on the `vector` column (only FTS on title/summary) — every `vector_search()`/`.nearest_to()` call ran LanceDB's brute-force full-column exact-kNN scan, no eviction. Isolated repro: +340-444 MiB resident growth over ~20-600 real `search()` calls against a 26,730-row corpus, ~65-80x the embedder's own per-call footprint (ruled out as dominant in the same cycle). `malloc_trim(0)` recovered only ~8-15% of this — allocator hygiene alone insufficient.

**Fix:** Primary — `_build_vector_index()`/`_maybe_build_vector_index()` (`infrastructure/repositories.py`): lazy `lancedb.index.IvfPq(distance_type="l2")` build on `vector`, gated by `_VECTOR_INDEX_MIN_ROWS=256` (LanceDB's own IVF_PQ training floor, empirically confirmed via scratch repro — an unguarded build raises `RuntimeError` below it, which would break ~11 existing `search()`-calling tests across tiny fixtures without the gate). Triggered from both `search()` and `hybrid_search()`. `POST /admin/rebuild-vector-index` (mirrors `/admin/rebuild-fts`, deliberately a SEPARATE endpoint, not wired onto RAG-FTS-BUILD-MEMORY-BOUND's disabled cron). Secondary — `_malloc_trim_or_noop()` periodic sweep in `app_factory._idle_unload_loop()`, guarded `ctypes.CDLL("libc.so.6")`, same shape as the FIX-PDFX precedent, silent no-op on non-glibc (this macOS dev host).

**Tests:** 20 new (15 vector-index in new `test_rag_vector_index_build.py` — call-shape, threshold boundary off-by-one, flag-guard, REAL end-to-end IVF_PQ build against a bulk-seeded 300-row corpus with no mocks, hybrid_search coverage, admin-endpoint triad; 5 malloc_trim extending `test_embedder_idle_unload.py` — guard behavior mocked+real, loop cadence independent of unload firing, non-fatal failure). 195/195 pytest green (175 baseline + 20 new).

**Verified:** mypy delta +53 (289→342) scoped-clean via paired stash/pop (production files: +3 occurrences across 2 pre-existing categories — untyped `_get_table()` calls, `-> dict` generic-arg — 0 new categories; rest is the new test file's untyped test functions, same style as 100% of sibling test files). Sandbox primitive 16/16 + module 2/2 exit 0 GREEN. Env audit EMPTY via canonical `_audit_env()`. Fence-A/B clean (pre-existing docstring-only hits, files untouched). Size-lint: 3 files pushed past baseline tolerance by the new code — added/updated size-justification headers with exact post-edit `wc -l` counts (repositories.py 517L→642L, app_factory.py 177L→212L, handlers.py new 233L header) — `--check` now passes for all 3 (only the pre-existing, unrelated mcp-server `transport.ts` offender remains repo-wide). Did NOT run `--update` (would launder that unrelated offender). Simplicity gate: PASS (Q1 no scope creep — index+admin-endpoint+trim all explicitly brief-recommended; Q2 no single-use abstractions — every new method has ≥2 call sites except `_malloc_trim_or_noop`, which mirrors the existing `_maybe_unload_idle` single-caller-but-independently-tested convention; Q3/Q4 clean).

**Scope note:** the brief's actual AC (PO ruling po-S157) is a ≥2h ops-supervised live cold-start heap-growth-rate + plateau measurement, not a before/after dip — that is QA/ops's job per the standard `REBUILD_REQUIRED` chain (docker rebuild + live verify), outside this agent's zone/tool grant (Docker ops = ops's job). RETURN carries `REBUILD_REQUIRED: true`.

**DJ:** `docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-rag-service.md` S4.

Zone health: rag-service test suite 195/195 green (+20 this cycle), size-lint clean, no other drift observed. HEALTHY.

---

### 2026-08-07 — FIX-CI-SIZELINT-RAG-APP-FACTORY-BASELINE (P1, CI-RED, XS)

**Task:** `app_factory.py` grew 121L→168L (baseline-tolerance-exceeded, upper=133L) via commit 0308514f5 (`_idle_unload_loop()` added to `build_lifespan()` for FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH) with no size-justification header. Same fix pattern as sibling FIX-CI-SIZELINT-RAG-EMBEDDER-NEW-OFFENDER (`infrastructure/embedder.py`).

**Fix:** added a `# size-justification: 177L — ...` comment header (9L, above the module docstring) — cohesion argument: `build_lifespan()` (lifespan wiring + idle-unload loop), `add_cors_middleware()`, `build_real_adapters()` are all the SAME extracted-from-main.py composition-root scope; comment-only, zero behavior change. Did NOT touch `docs/data/size-lint-baseline.json` (no `--update` — would launder unrelated offenders per AC2 precedent).

**Verified:** `bash scripts/audits/size-lint-justification.sh --check` no longer lists `app_factory.py` (scoped override RC=0; full-repo run still shows 3 unrelated offenders — 2 mcp-server sibling tasks + `embedder.py` cleared on main per commit 8b415f6a2). pytest 175/175 green (this worktree's baseline, unchanged).

**DJ:** `docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-rag-service.md` S3.

---

### 2026-08-07 — FIX-CI-SIZELINT-RAG-EMBEDDER-NEW-OFFENDER (dev-team dispatch, size XS)

**Task:** size-lint RED, new-offender: `embedder.py` 167L > 120L cap, no baseline entry, no justification header. Trigger: commit `0308514f5` (FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH, previous cycle above) added `_maybe_unload_idle()`/`_idle_unload_loop()`/`_last_used_monotonic` to the lazy-load singleton, pushing it past 120L with zero grandfather.

**Fix:** added `# size-justification: 175L — ...` header (first 8 lines) — lazy-load (`_ensure_model_loaded`/`_load_model`, GFD-13) and idle-unload (`_maybe_unload_idle`) share the SAME `asyncio.Lock` double-check pattern and SAME `_model`/`_last_used_monotonic` state on one singleton; a split would duplicate the lock or force tight cross-file coupling for zero benefit. Comment-only, no behavior change. Declared count (175L) matches post-edit `wc -l` exactly. Did NOT touch `docs/data/size-lint-baseline.json`, did NOT run `--update` (AC2 — would launder the 3 other unrelated current offenders repo-wide).

**Verified:** scoped `SIZE_LINT_INCLUDE_OVERRIDE=embedder.py --check` → RC=0. Full-repo `--check` offender count 4→3 (embedder.py cleared; remaining 3 — `schema.ts`, `getBctcRefinedTool.ts`, `app_factory.py` — belong to sibling tasks FIX-CI-SIZELINT-BCTCREFINED-PROJECTION-BASELINE / FIX-CI-SIZELINT-RAG-APP-FACTORY-BASELINE, sequenced separately per task NOTE — full-repo/CI green is a batch-level outcome, not achievable from this single-file commit alone). `pytest -k embedder`: 17/17 passed.

**DJ:** `docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-rag-service.md`

Zone health: HEALTHY (comment-only header, no behavior/test impact) | FIX-CI-SIZELINT-RAG-EMBEDDER-NEW-OFFENDER → REVIEW (next_agent: qa)

---

### 2026-08-06 — FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH (P1, BOUNDED-1 auto-pickup)

**Task:** design was DONE (`docs/architecture-briefs/2026-08-06-rag-service-memory-sizing-remediation.md` §3), execution-only. `embedder.py`'s lazy-load singleton (GFD-13) had no release path — once warmed, the ~600-700MiB model stayed resident for the container's whole life regardless of traffic, pinning it near its cap forever after the first request.

**Fix:** `_maybe_unload_idle(idle_threshold_s)` in `embedder.py` — same `_load_lock`/double-check pattern as `_ensure_model_loaded()` (outer cheap check, re-check inside the lock); unloads `_model`+`gc.collect()` once idle past threshold. `_raw_embed()` now stamps `_last_used_monotonic = time.monotonic()` (covers both `embed()`/`embed_batch()`). New `_idle_unload_loop()` in `app_factory.py`, duck-typed (`getattr(embedder, "_maybe_unload_idle", None)` → permanent no-op for sandbox fakes, zero determinism impact), started via `asyncio.create_task` in `build_lifespan()`, cancelled+awaited in a `finally:` around the existing `yield`. New `Config.embedder_idle_unload_minutes` (env `EMBEDDER_IDLE_UNLOAD_MINUTES`, default 15) — same `os.environ.get()` pattern as `EMBEDDING_CACHE_DIR`. Reload on next embed is fully transparent via the EXISTING `_ensure_model_loaded()` lock — no second load path added. `main.py` untouched (cfg already flows through unchanged).

**Tests:** new `__tests__/unit/test_embedder_idle_unload.py` (12 tests) — unload after threshold (`gc.collect` spied), no-op paths, double-check-lock race guard, transparent reload (asserts `_load_model` called exactly once via a fake that mirrors the real early-return guard), `/embed/health` `warm→cold` flip staying 200 both sides (never 503), concurrent `embed()`/unload race via `asyncio.gather()` never raising, `_idle_unload_loop()` duck-type no-op for fakes, `Config` env default/override. Fakes use real `numpy.ndarray` for `encode()` returns (matches `_raw_embed()`'s real `.tolist()` call).

**Verified:** pytest 175/175 (163 baseline + 12 new), reproduced across 2 different `pytest-randomly` seeds including one right after a `git stash`/`pop` round-trip. mypy: 20→20 errors (byte-identical set, 0 new, confirmed via stash A/B). Sandbox primitive+module tiers both exit 0 (env-audit-empty implied by that exit 0). Docs: `infrastructure.md` updated (also fixed a stale pre-existing "eagerly loads" line in the same subsection).

**DJ:** `docs/agent-memory/decisions/sprint-FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH-dev-rag-service.md`

---

<!-- Entries 2026-08-05 (FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP) and 2026-07-24 (FACTORY-RAG-delete-dead-sqlite-repo) and older split to `docs/agent-memory/notebooks/archive/dev-rag-service-archive-20260805.md` on 2026-08-12 (self-prune, byte cap 12000B breached after the FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS entry landed — same recurring pattern as the 2026-08-07 self-prune). Nothing deleted; full record in the archive file and git history. -->
