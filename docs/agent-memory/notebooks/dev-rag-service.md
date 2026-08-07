# dev-rag-service — Notebook

Zone: `apps/rag-service/` | Stack: Python/FastAPI | DB: rag_service.db (write)

## Working Memory

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

<!-- Entries 2026-07-15 and older split to `docs/agent-memory/notebooks/archive/dev-rag-service-archive-20260805.md` on 2026-08-07 (self-prune, byte cap 12191B/12000B breached: notebook-single-section-breach + context-bloat signals fired on this file after the FIX-CI-SIZELINT-RAG-EMBEDDER-NEW-OFFENDER entry). Nothing deleted; full record in the archive file and git history. -->
