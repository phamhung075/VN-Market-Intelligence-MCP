# dev-rag-service — Notebook

Zone: `apps/rag-service/` | Stack: Python/FastAPI | DB: rag_service.db (write)

## Working Memory

### 2026-08-06 — FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH (P1, BOUNDED-1 auto-pickup)

**Task:** design was DONE (`docs/architecture-briefs/2026-08-06-rag-service-memory-sizing-remediation.md` §3), execution-only. `embedder.py`'s lazy-load singleton (GFD-13) had no release path — once warmed, the ~600-700MiB model stayed resident for the container's whole life regardless of traffic, pinning it near its cap forever after the first request.

**Fix:** `_maybe_unload_idle(idle_threshold_s)` in `embedder.py` — same `_load_lock`/double-check pattern as `_ensure_model_loaded()` (outer cheap check, re-check inside the lock); unloads `_model`+`gc.collect()` once idle past threshold. `_raw_embed()` now stamps `_last_used_monotonic = time.monotonic()` (covers both `embed()`/`embed_batch()`). New `_idle_unload_loop()` in `app_factory.py`, duck-typed (`getattr(embedder, "_maybe_unload_idle", None)` → permanent no-op for sandbox fakes, zero determinism impact), started via `asyncio.create_task` in `build_lifespan()`, cancelled+awaited in a `finally:` around the existing `yield`. New `Config.embedder_idle_unload_minutes` (env `EMBEDDER_IDLE_UNLOAD_MINUTES`, default 15) — same `os.environ.get()` pattern as `EMBEDDING_CACHE_DIR`. Reload on next embed is fully transparent via the EXISTING `_ensure_model_loaded()` lock — no second load path added. `main.py` untouched (cfg already flows through unchanged).

**Tests:** new `__tests__/unit/test_embedder_idle_unload.py` (12 tests) — unload after threshold (`gc.collect` spied), no-op paths, double-check-lock race guard, transparent reload (asserts `_load_model` called exactly once via a fake that mirrors the real early-return guard), `/embed/health` `warm→cold` flip staying 200 both sides (never 503), concurrent `embed()`/unload race via `asyncio.gather()` never raising, `_idle_unload_loop()` duck-type no-op for fakes, `Config` env default/override. Fakes use real `numpy.ndarray` for `encode()` returns (matches `_raw_embed()`'s real `.tolist()` call).

**Verified:** pytest 175/175 (163 baseline + 12 new), reproduced across 2 different `pytest-randomly` seeds including one right after a `git stash`/`pop` round-trip. mypy: 20→20 errors (byte-identical set, 0 new, confirmed via stash A/B). Sandbox primitive+module tiers both exit 0 (env-audit-empty implied by that exit 0). Docs: `infrastructure.md` updated (also fixed a stale pre-existing "eagerly loads" line in the same subsection).

**DJ:** `docs/agent-memory/decisions/sprint-FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH-dev-rag-service.md`

---

### 2026-08-05 — FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP (P1 LIVE INCIDENT)

**Task:** compact() failure-path never reset `_insert_count` — PO already root-caused at source (repositories.py:251 reset was inside the `try`, right after `optimize()`); the `except:` block only warned and returned normally, so ANY optimize() failure left the counter stuck `>= _COMPACT_EVERY` and every following insert re-fired a full-table optimize() — burst rewrites inside the 768MiB cap, matching the OOMKilled=false crash pattern. Scope held to this one file per PO directive; 768MiB cap sizing (FU-RAG-DEPLOY-MEMORY) and on-disk amplification (FIX-RAG-COMPACTION-DISK-AMPLIFICATION) explicitly out of scope.

**Fix:** (1) moved `self._insert_count = 0` into a `finally:` on `compact()` so it resets on both success and failure. (2) Added `self._compact_lock` (per-instance `asyncio.Lock`); `compact()` now does `if self._compact_lock.locked(): return` before entering `async with self._compact_lock:` — a concurrent second trigger short-circuits instead of launching its own `optimize()`, and the in-flight call's `finally` resets the counter for both. Did NOT gate the lock body on a re-checked `_insert_count` threshold (considered, rejected — would silently no-op direct/maintenance-cron `compact()` calls below threshold, changing an already-documented contract not covered by fix_spec).

**Tests (AC1/AC2, the DoD):** both new tests inject failure/tracking on the REAL LanceDB table object (not a `store.compact` monkeypatch shortcut, which would bypass the actual finally/lock logic under test). AC1: `table.optimize = AsyncMock(side_effect=RuntimeError(...))`, insert to threshold, assert `_insert_count == 0` after the failure and that the very next insert does not re-fire compact(). AC2: `asyncio.gather()` of two concurrent `insert()` coroutines both crossing threshold, tracking-wrapper around real `table.optimize`, assert exactly 1 call. Stable across 5 pytest-randomly seeds.

**Verified:** pytest 163/163 (161 baseline + 2 new), 4 pre-existing compaction tests unchanged/still pass. mypy: repositories.py 14→14 errors (0 new, all pre-existing patterns at shifted line numbers); test file baseline-consistent +7 (missing-annotation/method-assign on the 2 new test helpers — same untyped-test-function style already used by 100% of this file's existing tests, not a new category). Sandbox 16/16 primitive + 2/2 module GREEN exit 0. Env audit EMPTY via canonical `_audit_env()` (loose `env|grep` shows the same known `CTX_ADVISOR_*TOKEN*` non-credential substring false positive). Fence-A/B grep hits are pre-existing docstring prose only. Graphify: skipped — no Skill-tool path for this spawned Task-tool agent (same structural constraint noted by prior siblings); doc content (infrastructure.md, testing.md) updated directly instead.

**DJ:** `docs/agent-memory/decisions/sprint-FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP-dev-rag-service.md`

Zone health: `apps/rag-service/` test suite 163/163 green, no other drift observed this cycle. HEALTHY.

---

### 2026-07-24 — FACTORY-RAG-delete-dead-sqlite-repo (dead-code removal, P2)

**Task:** delete dead `SQLiteAnalysisRepository` + phantom `AnalysisRepositoryPort`. Investigated at source FIRST (did not trust ticket title): grep-confirmed `SQLiteAnalysisRepository` constructed ONLY in `test_rag_integration.py`'s `sqlite_repo` fixture (4 tests, `TestSQLiteRepository`); `AnalysisRepositoryPort` implemented ONLY by that class; `app_factory.build_real_adapters()` (sole prod-adapter composition point) and `main.py` wire only `SentenceTransformersEmbedder`+`LanceDBVectorStore` — zero `SQLiteAnalysisRepository` construction anywhere live. `IndexUseCase`/`SearchUseCase` `__init__` never took an analysis-repo param (the `IndexUseCase` docstring's `analysis_repo (optional)` claim was itself phantom — fixed). Matches (and independently verified, not just trusted) `docs/architecture-briefs/2026-06-15-maintainability-factory-audit.md` FACTORY-RAG-delete-dead-sqlite-repo entry.

**Deleted:** `SQLiteAnalysisRepository` + `_row_to_entry()` helper + `sqlite3` import (infrastructure/repositories.py), `AnalysisRepositoryPort` ABC (domain/repositories.py), `TestSQLiteRepository`+`sqlite_repo` fixture (test_rag_integration.py). Fixed phantom docstring (usecases.py). Trimmed matching sections from owned docs (domain-model.md, infrastructure.md, testing.md). Net: 238 deletions / 7 insertions.

**Verified:** pytest 165→161 passed (exactly the 4 deleted tests, 0 fail), grep confirms zero remaining refs to either symbol, mypy 259→253 errors (strict decrease, no new), sandbox 16/16 + 2/2 GREEN exit 0, env audit EMPTY via canonical anchored `_audit_env()` (the 3 `CTX_ADVISOR_*` hits from the flow doc's loose `env|grep` one-liner are the SAME known TOKEN-substring false positive already logged in the 07-15 FTS entry below — not credentials). Fence-A/B grep hits are pre-existing docstring prose only, zero real cross-layer imports.

**DJ:** `docs/agent-memory/decisions/sprint-FACTORY-RAG-delete-dead-sqlite-repo-dev-rag-service.md`

---

### 2026-07-15 — RAG-FTS-BUILD-MEMORY-BOUND (P1 FIX-S)

**Root cause found:** native FTS builder (Rust `lance-index`, `scalar/inverted/builder.rs`)
fans build across `LANCE_FTS_NUM_SHARDS` workers (default `num_cpus/2`, host-CPU-based, not
container quota), each buffering up to `LANCE_FTS_PARTITION_SIZE` MiB (**default 2048/worker**)
before flush. Neither knob is in lancedb's Python `FTS()`/`create_index()` — Rust `LazyLock`
env vars, cached per-process on first read. Default = many GB, ~10x the 768m ceiling,
independent of row count → explains 250s+ pin + OOM-restart at 56k rows.

**Rejected:** legacy Tantivy `writer_heap_size` path works on local lancedb 0.25.3 but is
**hard-removed** in Docker-pinned 0.33.0 (`ValueError("Tantivy-based FTS has been removed")`).

**Fix:** `os.environ.setdefault("LANCE_FTS_NUM_SHARDS","1")` +
`setdefault("LANCE_FTS_PARTITION_SIZE","32")` at top of `infrastructure/repositories.py`
(module-import time — must precede first FTS build). `_build_fts_index()` call pattern
(2 calls, title then summary) unchanged. `setdefault` lets ops override via compose env
without redeploy.

**Verified:** 160/160 pytest (156 baseline + 4 new in `test_rag_fts_build_memory_bound.py`),
mypy 15 pre-existing errors unchanged (zero new), import-linter 3/3 fences kept, sandbox
16/16 + 2/2 GREEN, env audit clean (3 `CTX_ADVISOR_*` harness vars are TOKEN-substring false
positives, not credentials). Local 60k-row high-cardinality stress test: unbounded default
3.28GB max RSS / 1.55GB peak footprint → bounded (shards=1, partition=8MiB) 1.37GB / 640MB.

**BLOCKED:** live-container verification (AC#2 hard deliverable — peak-mem+wall-clock on
real ~56k corpus) could not run — Docker Desktop host outage (`Error response from daemon:
Docker Desktop is unable to start`) hit mid-session during my own ephemeral verification
containers, ~30+ min, whole stack unreachable (curl :4000, :5002 both timed out). Likely
self-triggered by my build/run activity. Flagged to router for ops attention + live re-test
once recovered — did NOT attempt Docker Desktop recovery myself (infra, not my zone).

**Docs:** `docs/architecture/microservice/rag-service/infrastructure.md` (new FTS +
bounded-build section), `testing.md` (new test file entry).

---

<!-- Entries 2026-06-08 and older split to `docs/agent-memory/notebooks/archive/dev-rag-service-archive-20260805.md` on 2026-08-05 (po triage) — byte cap 13912B/12000B breached with only 1 prunable section left. Nothing deleted; full record in the archive file and git history. -->
