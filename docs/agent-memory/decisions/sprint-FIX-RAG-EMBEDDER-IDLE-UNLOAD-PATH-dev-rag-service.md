# Decision Journal — Sprint FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH · dev-rag-service

**Sprint goal:** P1 structural fix — add a release path to the embedder singleton so rag-service
stops sitting pinned near its memory cap forever after the first embed call.
**Agent:** dev-rag-service (via BOUNDED-1 idle-capacity auto-pickup)
**Started:** 2026-08-06T16:31Z

---

### STEP dev-rag-service-S1 · dev-rag-service · 2026-08-06T16:35Z
**task-id:** FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH
**what-done:** Read design (`docs/architecture-briefs/2026-08-06-rag-service-memory-sizing-remediation.md`
§3) and root cause (`infrastructure/embedder.py`, no unload path). Design was DONE per the row —
execution only, no re-design performed.
**what-considered:**
- Put the idle-unload background loop INSIDE `embedder.py` itself (e.g. embedder spawns its own
  `asyncio.create_task` in `initialize()`) — rejected: `initialize()` is intentionally a no-op
  under GFD-13 lazy-load; giving it side effects again would re-couple lifecycle management into
  the embedder class and contradicts the brief's explicit "trigger: background loop started in
  build_lifespan()" placement.
- Give `_maybe_unload_idle()` its own separate lock — rejected: brief explicitly says "under the
  SAME `self._load_lock` used for load" — a second lock would let a load and an unload race each
  other's read of `self._model` without mutual exclusion, defeating the whole point of reusing
  the lock. Reusing `_load_lock` makes unload and (re)load strictly serialized, matching the
  double-check-lock pattern already used by `_ensure_model_loaded()`.
**why-decision:** Chosen shape (loop in `app_factory.build_lifespan()`, unload logic in
`embedder._maybe_unload_idle()` under the existing `_load_lock`) is a literal, symmetric mirror of
the existing lazy-load: same lock, same double-check pattern, same composition-root wiring point.
**why-change:** No change from the brief's design — this row was execution-only.

### STEP dev-rag-service-S2 · dev-rag-service · 2026-08-06T16:45Z
**task-id:** FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH
**what-done:** Implemented `_maybe_unload_idle(idle_threshold_s)` in `embedder.py` (cheap outer
check outside the lock, re-check inside the lock before mutating — same shape as
`_ensure_model_loaded()`); `_raw_embed()` now stamps `self._last_used_monotonic =
time.monotonic()` at its top (covers both `embed()`/`embed_batch()`, the only two callers, per
brief). Added `_idle_unload_loop()` in `app_factory.py`: duck-types `getattr(embedder,
"_maybe_unload_idle", None)` and returns immediately (permanent no-op) if absent — this is what
keeps the service-tier sandbox fakes untouched, zero determinism impact. `build_lifespan()` now
starts the loop via `asyncio.create_task` after the existing `initialize()` call, and cancels +
awaits it in a `finally:` around the existing `yield` (previously the `yield`/shutdown-log had no
enclosing `try`/`finally` at all — added one only to hang the cancel off it, no other behaviour
change). New `Config.embedder_idle_unload_minutes` field, read from
`EMBEDDER_IDLE_UNLOAD_MINUTES` env (default `"15"`), same `os.environ.get()` pattern as
`EMBEDDING_CACHE_DIR`/`LOG_LEVEL` — never hardcoded.
**what-considered:**
- Make the poll interval (how often the background loop *checks*) itself env-configurable
  alongside the idle threshold — rejected: the brief only asks for
  `EMBEDDER_IDLE_UNLOAD_MINUTES` as the idle *threshold* knob; the check cadence is an internal
  implementation detail (bounded interval, brief's own example value 60s), not a user-facing
  tuning surface. Kept as a module constant (`_IDLE_UNLOAD_CHECK_INTERVAL_S = 60.0` in
  `app_factory.py`) with an explicit comment explaining why it is NOT env-driven, so a future
  reader doesn't mistake the omission for an oversight.
- Touch `main.py` per the brief's "if config plumbing needs it" — checked first: `cfg` already
  flows `Config.from_env()` → `build_real_adapters()` → `create_app()` → `build_lifespan(embedder,
  cfg)` with zero intermediate unpacking, so adding a field to `Config` requires zero `main.py`
  changes. Left `main.py` untouched (confirmed, not assumed).
**why-decision:** Minimizes surface touched to exactly what the brief's own files-to-modify list
implies is actually necessary, while keeping the one real env-facing knob (the idle threshold)
genuinely configurable per the task's explicit "config, never hardcoded" instruction.
**why-change:** No change from the brief — `main.py` was listed as conditional ("if needed") and
turned out not to be needed.

### STEP dev-rag-service-S3 · dev-rag-service · 2026-08-06T16:52Z
**task-id:** FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH
**what-done:** New `__tests__/unit/test_embedder_idle_unload.py` (12 tests): timestamp-set on
embed, no-op when unloaded/not-yet-idle, unload fires past threshold (`gc.collect()` spied),
double-check-lock regression guard (a concurrent refresh inside the lock aborts a stale outer
unload decision), transparent reload after unload via the EXISTING `_ensure_model_loaded()` path
(no second load path — asserted via `_load_model` call-count), `/embed/health` warm→cold flip
across an injected unload staying 200 on both sides (never 503), a concurrent
`embed()`/`_maybe_unload_idle()` race via `asyncio.gather()` that must never raise, the
`app_factory._idle_unload_loop()` duck-typing no-op for sandbox fakes, and `Config` env-var
default/override.
**what-considered:**
- Fake the loaded model's `encode()` return value as a plain Python list of floats (matching the
  final `EmbeddingVector.values` shape) — rejected once it broke: `_raw_embed()` calls
  `.tolist()` on each row of the real `SentenceTransformer.encode()` return (a numpy ndarray), so
  a plain-list fake raised `AttributeError` and would have silently exercised a code path that
  doesn't match production. Switched every fake `encode()` to return a real `numpy.ndarray` (a
  small, host-safe, non-ML-model numpy call — no `sentence_transformers` import, no model
  download) so the test exercises the actual `.tolist()` line.
- First draft of the reload-count assertion undercounted: my `fake_load_model()` didn't mirror the
  real `_load_model()`'s own early-return guard (`if self._model is not None: return`), and
  `_raw_embed()` calls `_load_model()` defensively even after `_ensure_model_loaded()` already
  loaded it — so the fake double-counted. Fixed the fake to replicate the same guard so the test
  measures the real contract (exactly one genuine load per idle-unload cycle), not an artifact of
  a sloppier fake.
- Test the background loop's actual `asyncio.sleep(60)` cadence with a real sleep — rejected,
  would make the suite slow/flaky; instead unit-tested `_idle_unload_loop()` directly with
  `asyncio.sleep` patched to resolve instantly and the embedder's `_maybe_unload_idle` swapped for
  a spy that raises `CancelledError` after one iteration, asserting the exact `idle_threshold_s`
  it was called with.
**why-decision:** Every test drives real production code paths (real `_maybe_unload_idle()`, real
`_raw_embed()`/`.tolist()`, real `_ensure_model_loaded()` lock, real `/embed/health` handler via
`TestClient`) with only the boundary (the `SentenceTransformer` model object and `time.monotonic`
readings) faked — matches the brief's own test-strategy paragraph ("inject a fake clock /
monkeypatch `time.monotonic`") and the standing convention already used in
`test_gfd13_lazy_load.py`.
**why-change:** No change from the brief's test strategy — implemented exactly the two prescribed
checks (unit: `_model` becomes `None` + transparent reload; integration:
`/embed/health` `warm→cold` with no 503) plus 2 additional regression-guard tests (double-check
race, concurrent-embed race) that the brief's design section itself flagged as the risk the
double-check-lock reuse is meant to close.

### STEP dev-rag-service-S4 · dev-rag-service · 2026-08-06T16:56Z
**task-id:** FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH
**what-done:** Verification pass. `python -m pytest` (full suite, this service):
175/175 pass (163 baseline + 12 new), 0 fail, `asyncio-mode=auto`, ran twice across two different
`pytest-randomly` seeds (both 175/175) — including once immediately after a `git stash`/`git
stash pop` round-trip to confirm the working tree survived intact. `python -m mypy
infrastructure/embedder.py infrastructure/config.py app_factory.py --ignore-missing-imports`:
20 errors before AND after my change, byte-identical set at shifted line numbers (confirmed via
`git stash` A/B diff of the raw mypy output) — 0 new errors, all pre-existing
`infrastructure/repositories.py`-owned patterns untouched by this task. Sandbox: `python -m
sandbox --service=rag-service --tier=primitive --scenario=all` and `--tier=module --scenario=all`
both exit 0 / all scenarios `"passed": true` (the sandbox runner's own env-audit gate ran as part
of that exit-0, so env-audit-empty is satisfied by the same invocation — no forbidden-key
env vars present). Updated `docs/architecture/microservice/rag-service/infrastructure.md`
(SentenceTransformersEmbedder § Methods/Configuration) — also corrected a pre-existing stale line
("`initialize()`: Eagerly loads model from FastAPI lifespan", contradicted by the already-shipped
GFD-13 lazy-load) while in the neighbourhood, since it is the exact section this task's change
touches and doc accuracy is mandatory here, not optional cleanup.
**what-considered:**
- Leave the stale "Eagerly loads" doc line alone (out of literal task scope) — rejected: it sits
  inside the exact subsection (`SentenceTransformersEmbedder` methods) this task is adding new
  methods to, and doc_maintenance rules require zone docs to stay accurate after any behaviour-
  altering change; leaving a known-false statement adjacent to new-and-correct ones would make the
  doc actively misleading rather than merely incomplete.
- Add an explicit `EMBEDDER_IDLE_UNLOAD_MINUTES=` line to `docker-compose.yml`'s rag-service
  `environment:` block to document the default — rejected: not in the row's listed files, the
  code-level default (`15`) already satisfies "config, never hardcode", and the row's own scope
  section names only `embedder.py`/`main.py` as files to touch; adding a compose line is optional
  documentation-of-default, not a behaviour requirement, and this row is explicitly execution-only
  against a DONE design.
**why-decision:** Verification matches the row's own stated DoD ("Direct test coverage showing an
injected idle-unload flips state warm→cold without ever returning a 503 to a concurrent/subsequent
embed call") plus this agent's standing `g12_dod` gate (sandbox-green + env-audit-empty before any
DONE-adjacent flip).
**why-change:** No change from plan — routine verification pass, all gates green.
