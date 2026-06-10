# Decision Journal — Sprint GO-FLEET-DEPLOY · dev-rag-service

**Sprint goal:** Port-to-Go + deploy 6 not_deployed_by_design services (rag-service = Python exception per architect)
**Agent:** dev-rag-service
**Started:** 2026-06-10T21:01:49Z

---

### STEP dev-rag-service-S1 · dev-rag-service · 2026-06-10T21:01:49Z
**task-id:** GFD-7
**what-done:** Added GET `/embed/health` capability probe endpoint to rag-service FastAPI app. Updated rag-service memory limits in docker-compose.yml (limits.memory 1.5g → 768m, reservations.memory 1g → 512m).

**what-considered:**
- Probe placement: could have added a new router file, but the pattern is to add all routes via `register_routes()` in `interface/handlers.py`. Added `embedder: Any = None` as a new kwarg (backward-compatible default) alongside the existing `vector_store` kwarg. All existing test calls use keyword args — zero breakage confirmed (130 unit tests pass).
- Model-loaded check: `SentenceTransformersEmbedder._model` is None until `initialize()` runs (lazy-loaded). Probe checks `getattr(embedder, '_model', None)` — returns 503 if None, runs `model_obj.encode('a', ...)` smoke test if loaded.
- index_size: `LanceDBVectorStore.count()` already exists (async, opens table lazily). Called directly — 0 is acceptable on fresh deploy.
- model_name: `SentenceTransformersEmbedder._model_name` is the constructor-injected string (e.g. `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`). Returned verbatim.
- Response type: used `fastapi.Response` with explicit `media_type="application/json"` to allow variable status codes (200 vs 503) without creating a Pydantic schema.
- Handoff code block uses `model.get_sentence_embedding_dimension()` as `model_name` — that is wrong (returns an int). Used `_model_name` (the actual string) instead.
- No new imports at domain or application layer — probe lives entirely in the interface layer. Fence-A and Fence-B remain clean.

**why-decision:**
- `register_routes()` kwarg extension: DRY — keeps all route registration in one place, consistent with the DFR-P3 `vector_store` kwarg pattern already established.
- `_model` attribute access: `SentenceTransformersEmbedder` does not expose a public `is_loaded` property; `_model` is the canonical sentinel (set to None in `__init__`, assigned in `_load_model()`). Accessing private attr in the same infrastructure module is acceptable — no domain/app code is affected.
- Memory reduction 1g→512m/1.5g→768m: per architect brief GFD-7 spec § (c); rag-service uses ~400MB model + ~100MB FastAPI overhead; 512m reservation is tight but safe.

**live-verification:**
- 130 unit tests PASS (was 130 before; zero regressions)
- Fence-A: CLEAN (no infra/app/interface imports in domain/primitive)
- Fence-B: CLEAN (no infrastructure imports in application)
- Env audit: not applicable for this handler-only change (no new env var reads)
- docker-compose.yml diff verified: only rag-service limits.memory (1.5g→768m) and reservations.memory (1g→512m) changed

**real-variable-names-wired:**
- embedder object: `real_embedder` (instance of `SentenceTransformersEmbedder`)
- model sentinel: `real_embedder._model` (None when not loaded, SentenceTransformer instance when loaded)
- model name string: `real_embedder._model_name` (set at construction from `cfg.embedding_model`)
- vector store: `real_vector_store` (instance of `LanceDBVectorStore`)
- row count method: `real_vector_store.count()` (existing async method, returns int)

**rebuild-required:** YES — targeted rag-service rebuild required to ship new endpoint:
`docker compose build rag-service && docker compose up -d rag-service`
Do NOT down&&up (would restart all peers).

**files-changed:**
- `apps/rag-service/interface/handlers.py` (add `/embed/health` endpoint + `embedder` kwarg on `register_routes`)
- `apps/rag-service/main.py` (pass `embedder=real_embedder` to `register_routes`)
- `docker-compose.yml` (rag-service limits 1.5g→768m, reservations 1g→512m)
- `docs/data/orch/orch-state.json` (GFD-7 READY→DONE)
- `docs/agent-memory/decisions/sprint-GO-FLEET-DEPLOY-dev-rag-service.md` (this file)

---

### STEP dev-rag-service-S2 (DJ-GATE-1) · dev-rag-service · 2026-06-11T00:00:00Z
**task-id:** GFD-13
**what-done:** Implemented lazy-load singleton for SentenceTransformer in `infrastructure/embedder.py`. Revised `/embed/health` to cold/warm contract in `interface/handlers.py`. Lowered docker-compose.yml rag-service `reservations.memory` from 512m to 256m (limits.memory 768m unchanged). Flipped GFD-13 READY → DONE.

**what-changed:**

`apps/rag-service/infrastructure/embedder.py`:
- `__init__`: added `_load_lock = None` and `_load_error: Optional[Exception] = None` fields; `_model` stays None at construction.
- `initialize()`: body replaced with a no-op log line. Interface contract for `app_factory.py` preserved — no factory change needed.
- `_ensure_model_loaded()`: new async coroutine. Fast path returns if `_model is not None`. Lazy-creates `asyncio.Lock()` only inside a running event loop (avoids Python 3.12 RuntimeError at import time). Double-check lock pattern prevents duplicate loads under concurrent first-calls. `asyncio.to_thread(self._load_model)` offloads CPU/IO-bound load to ThreadPoolExecutor so the uvicorn event loop stays responsive. Sets `_load_error` if the load raises, and re-raises immediately on any subsequent call.
- `embed()` and `embed_batch()`: both now `await self._ensure_model_loaded()` before calling `_raw_embed()`.
- Added `import asyncio` and `Optional` to imports.

`apps/rag-service/interface/handlers.py` `/embed/health`:
- Removed 503 for cold state (model not loaded). Cold is now HTTP 200 `{"status":"ok","model_loaded":false,"state":"cold","index_size":<int>,"model_name":"<str>"}`.
- Warm state: HTTP 200 `{"status":"ok","model_loaded":true,"state":"warm","index_size":<int>,"model_name":"<str>"}`.
- Handler is PURELY PASSIVE — reads `embedder._model` but NEVER calls `_ensure_model_loaded()`.
- 503 only on: embedder=None (wiring bug), `_load_error` set (previous failed load), or exception from `vector_store.count()`.
- LanceDB `index_size` query moved before model check (it works without the model).

`docker-compose.yml`:
- rag-service `reservations.memory`: 512m → 256m (idle footprint ~150 MiB; 256m gives scheduling margin).
- `limits.memory: 768m`: UNCHANGED (covers warm RSS peak ~600-700 MiB + headroom).

**why-decision:**
- asyncio.Lock (not threading.Lock): FastAPI is async; lock must be awaitable. Lazy-init pattern (`if self._load_lock is None`) avoids "no running event loop at import time" in Python 3.12.
- asyncio.to_thread(): model load is CPU+IO bound (2-60s); blocking the event loop would stall all /health probes during first load.
- initialize() no-op: preserves duck-type contract app_factory.py depends on without any factory change.
- Cold = 200 not 503: cold is normal post-GFD-13; returning 503 on cold would block GFD-10 soak (ops would see immediate failure on startup health check).
- reservations.memory 256m: idle footprint ~150 MiB confirmed from architecture brief; 256m provides margin without over-reserving scarce host memory (freed 256 MiB reservation headroom vs 512m).

**host-safe-test-evidence:**
- 12 new unit tests in `apps/rag-service/__tests__/unit/test_gfd13_lazy_load.py`, all MOCKED (zero real SentenceTransformer instantiation).
- Tests verify: (a) startup does not load model — `_model is None` after `__init__`; (b) `initialize()` is a no-op — `_model is None` after await; (c) cold `/embed/health` returns 200 `model_loaded:false`; (d) `/embed/health` never calls `_ensure_model_loaded()`; (e) concurrent first-calls trigger `_load_model()` exactly once; (f) `_load_error` set → 503; (g) embedder=None → 503; (h) warm state → 200 `model_loaded:true`.
- 130 existing unit tests: all PASS (zero regressions).
- Total: 142 unit tests, 142 PASS.
- Real SentenceTransformer model: NOT loaded locally. Deferred to ops GFD-10 soak (docker build + 20-min soak window on VPS/host). See architecture brief § 6 for soak DoD sequence.
- Docker containers: NOT built, NOT started. Host-safe as required.

**startup-confirmed:** Container startup via `build_lifespan() → embedder.initialize()` now calls the no-op. `_model` remains None at startup. First embed call triggers `_ensure_model_loaded()` which loads the model via `asyncio.to_thread()`.

**files-changed:**
- `apps/rag-service/infrastructure/embedder.py`
- `apps/rag-service/interface/handlers.py`
- `apps/rag-service/__tests__/unit/test_gfd13_lazy_load.py` (new — GFD-13 host-safe tests)
- `docker-compose.yml` (rag-service reservations.memory 512m→256m only)
- `docs/data/orch/orch-state.json` (GFD-13 READY→DONE, completed_at set)
- `docs/agent-memory/decisions/sprint-GO-FLEET-DEPLOY-dev-rag-service.md` (this file)
