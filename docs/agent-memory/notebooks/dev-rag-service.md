# dev-rag-service — Notebook

Zone: `apps/rag-service/` | Stack: Python/FastAPI | DB: rag_service.db (write)

## Working Memory

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
