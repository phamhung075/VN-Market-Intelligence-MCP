# RAG Service — Lazy-Load Embedding Model

**Task ID:** GFD-13  
**Sprint:** GO-FLEET-DEPLOY  
**Agent:** architect  
**Date:** 2026-06-10  
**Decision Journal:** `docs/agent-memory/decisions/sprint-GO-FLEET-DEPLOY-architect.md` § STEP A-5  
**Handoff:** `docs/handoffs/GFD-13-rag-service-lazy-load-embedding.md`

---

## DJ-GATE-1 — Step A-5 (GFD-13)

**Status:** IN-DESIGN → DESIGN-COMPLETE  
**See:** `docs/agent-memory/decisions/sprint-GO-FLEET-DEPLOY-architect.md` § STEP A-5

---

## 1. Problem Statement

`rag-service` calls `embedder.initialize()` inside the FastAPI lifespan handler, which runs at
container startup before any request is served. `initialize()` calls `_load_model()`, which
instantiates `SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2", ...)` — a ~400 MiB
download on first run and ~768 MiB resident warm footprint. On a host already carrying ~9 GiB swap
pressure, the container OOM-kills at start (exit 137 / SIGKILL).

The fix is to defer `SentenceTransformer` construction to the first real `/embed` call while keeping
the process alive and observable at ~150 MiB idle.

---

## 2. Brownfield Source-of-Truth

Eager load is triggered in exactly one callstack:

```
app_factory.py :: build_lifespan()        lifespan() coroutine
  └─ SentenceTransformersEmbedder.initialize()   apps/rag-service/infrastructure/embedder.py:36-41
       └─ _load_model()                            embedder.py:43-57
            └─ SentenceTransformer(...)            sentence-transformers library
```

`_load_model()` already has a `self._model is not None` guard (line 44), so it is idempotent.
`_raw_embed()` already calls `self._load_model()` before encoding (line 65), meaning the
embedder already supports lazy-on-first-use semantics at the method level. The only problem
is the explicit `await initialize()` call in `build_lifespan()`.

`interface/handlers.py` `/embed/health` currently reads `getattr(embedder, "_model", None)` and
returns 503 if it is `None` (lines 63-67). This was correct when model-not-loaded was an error.
With lazy-load, it is the normal cold state — the semantics must change.

---

## 3. Lazy-Model Singleton — Chosen Mechanism

### Why asyncio.Lock, not threading.Lock

FastAPI on uvicorn runs on a single asyncio event loop. The embedder's `embed()` and
`embed_batch()` methods are `async def`; they call `_raw_embed()` synchronously (blocking the
loop for the duration of encode). There is no threading concurrency at the Python coroutine
layer. However, during the window between "first request arrives" and "model finishes loading",
multiple concurrent HTTP requests could each enter the lazy-load path before `_model` is set.
Without a lock, each would call `SentenceTransformer(...)` in sequence (not truly parallel,
but each would enter `_load_model()` before the first completes because `_load_model()` is
synchronous and runs in an `asyncio.to_thread()` — see below).

**Mechanism: `asyncio.Lock` + `asyncio.to_thread()`**

1. Add `self._load_lock: asyncio.Lock = asyncio.Lock()` (created lazily in `__init__` or in the
   first `async` context via `asyncio.get_event_loop()`).
2. In `embed()` / `embed_batch()` (both `async def`): before calling `_raw_embed()`, call
   `await _ensure_model_loaded()`.
3. `_ensure_model_loaded()`:
   ```
   async def _ensure_model_loaded(self) -> None:
       if self._model is not None:       # fast path — no lock
           return
       async with self._load_lock:
           if self._model is not None:   # double-check inside lock
               return
           await asyncio.to_thread(self._load_model)
   ```
4. `_raw_embed()` retains its synchronous `self._load_model()` call as a fallback guard
   (since it is also called from the `initialize()` path in test/sandbox mode). No change to
   its signature.

**Why `asyncio.to_thread()`:** `SentenceTransformer.__init__` is CPU+IO bound (~1-3s on warm
disk, ~60s on cold download). Running it directly in a coroutine would block the event loop
and stall all other requests (including `/health` probes) during first-load. `asyncio.to_thread()`
offloads it to the default ThreadPoolExecutor so the event loop remains responsive.

**Lock instance creation note:** `asyncio.Lock()` must be created inside a running event loop.
The safest pattern is to initialize it as `None` in `__init__` and construct it lazily on first
use inside `_ensure_model_loaded()` using `if self._load_lock is None: self._load_lock =
asyncio.Lock()`. This avoids the "no running event loop at import time" error.

### `initialize()` becomes a no-op

`initialize()` (called from `build_lifespan`) MUST remain in the class to preserve the duck-type
contract used by `app_factory.py`. Change its body to a no-op that logs `"lazy-load enabled —
model will load on first embed call"` and returns immediately. This removes the startup model
load without changing the interface.

### Startup footprint after change

At container start: Python interpreter + FastAPI + uvicorn + LanceDB connection init ≈ 130-160 MiB.
The sentence-transformer model is NOT resident. The container becomes healthy (liveness `/health`
200) within ~3s of start.

---

## 4. Revised `/embed/health` Contract (GFD-7 Semantics Override)

### Decision: `/embed/health` MUST remain purely passive — it NEVER triggers a model load.

Rationale: the endpoint is called by the api-gateway capability probe on every health-check cycle.
If probing it caused a model load, the first health check after a cold start would spike RSS from
~150 MiB to ~768 MiB — defeating the entire point of lazy-load. The health probe must be cheap and
always available regardless of model state. A separate explicit warm-up path (`/embed/warmup` POST)
is the correct trigger for a deliberate load.

### Cold state (model never loaded / `_model is None`)

```json
HTTP 200
{
  "status": "ok",
  "model_loaded": false,
  "state": "cold",
  "index_size": <int>,
  "model_name": "<configured-name-from-cfg>"
}
```

- Cold is normal, not an error. HTTP 200, not 503.
- `index_size` is still queried from LanceDB (the `count()` call does not require the model).
- `model_name` is read from `embedder._model_name` (set at `__init__` time from config, always
  available before model load).
- `state: "cold"` is a new field (additive, backwards-compatible for probes checking only
  `status == "ok"`).

### Warm state (model loaded / `_model is not None`)

```json
HTTP 200
{
  "status": "ok",
  "model_loaded": true,
  "state": "warm",
  "index_size": <int>,
  "model_name": "<str>"
}
```

The 1-token encode smoke test (`model_obj.encode("a", ...)`) is RETAINED when `model_loaded:true`
to confirm the model is callable (not merely set). This is cheap (~1ms once warm).

### 503 conditions (genuine failure only)

| Condition | Reason string |
|---|---|
| LanceDB `count()` raises exception | `"lancedb unreachable: <exc>"` |
| Model attempted to load (via embed call) but raised during `_load_model()` | `"model load failed: <exc>"` — set a `_load_error` flag on the embedder |
| `embedder` is `None` in the handler (wiring bug) | `"embedder not wired"` |

503 is NEVER returned because `model_loaded: false`. Cold = 200 always.

### Handler implementation note

The handler checks `embedder._model` directly (read-only, no side effects). The only change is:
- Remove the 503 branch for `model_obj is None`
- Add `"state": "cold"` / `"state": "warm"` field
- Add `"model_name"` field in the cold branch (read from `embedder._model_name` which is always set)
- Keep LanceDB `count()` check unconditionally

---

## 5. Memory Caps — docker-compose.yml

### Current (post-GFD-7)
```yaml
limits.memory: 768m
reservations.memory: 512m
```

### Proposed (GFD-13)
```yaml
limits.memory: 768m        # UNCHANGED — must still cover the warm peak spike
reservations.memory: 256m  # LOWERED from 512m — idle footprint is ~150 MiB
```

### Reasoning

**`limits.memory: 768m` — do not lower.**  
The sentence-transformer model (`paraphrase-multilingual-MiniLM-L12-v2`) is ~400 MiB on disk and
expands to ~600-700 MiB resident when loaded (PyTorch tensors + overhead). The first `/embed`
call spikes RSS toward this ceiling. If `limits.memory` is below the warm peak, the FIRST embed
call OOM-kills the container — same exit-137 we are trying to fix, just deferred. 768m covers the
warm spike with ~100 MiB headroom.

**`reservations.memory: 256m` — lower from 512m.**  
Docker `reservations.memory` is a scheduling hint: Docker will try to guarantee this much memory
for the container. At idle (lazy-load, model not loaded) the process resident is ~150 MiB. 256m
gives adequate scheduling margin above idle without over-reserving scarce host memory. The prior
512m reservation was sized for the always-loaded model; it is no longer correct.

**Net host memory freed at idle:** 512m - 256m = 256 MiB reserved headroom freed. This reduces
the host swap pressure at startup, allowing other services to breathe during the cold-start window.

---

## 6. Soak DoD — Revised for Lazy-Load

The GFD-10 ops soak for rag-service MUST follow this exact sequence. Passing DoD = all 4 steps
green, no exit-137 across 20-minute window.

### Step (a) — Cold health check (PASS criterion: 200 model_loaded:false)

```bash
curl -s http://localhost:5002/embed/health | jq .
# Expected:
# { "status": "ok", "model_loaded": false, "state": "cold", "index_size": <int>, "model_name": "..." }
# HTTP 200 — this is PASS, not fail
```

Container has started. Model is NOT loaded. This is the correct cold-start state.

### Step (b) — Warm-up trigger (one real embed call)

```bash
curl -s -X POST http://localhost:5002/index \
  -H "Content-Type: application/json" \
  -d '{"id":"warmup-probe-001","content":"rag service warm-up test embedding call"}' | jq .
# This triggers _ensure_model_loaded() → SentenceTransformer loads
# The call may take 10-60s on first load (model download or disk-cold cache)
# Expected response: {"status":"ok","indexed":1,"entry_id":"warmup-probe-001"} or similar
# HTTP 200 or 201 — PASS
```

Alternatively, if a `/embed/warmup` POST endpoint is implemented (optional convenience):

```bash
curl -s -X POST http://localhost:5002/embed/warmup | jq .
# Expected: {"status":"ok","loaded":true,"elapsed_ms":<int>}
```

### Step (c) — Warm health check (PASS criterion: 200 model_loaded:true + RSS < 768m)

```bash
# Probe 1: health endpoint confirms warm state
curl -s http://localhost:5002/embed/health | jq .
# Expected:
# { "status": "ok", "model_loaded": true, "state": "warm", "index_size": <int>, "model_name": "..." }
# HTTP 200 — PASS

# Probe 2: container RSS stays under 768m limit (no OOMKill)
docker stats --no-stream vn-market-intelligence-mcp-rag-service-1
# MemUsage column must be below 768MiB — PASS
```

### Step (d) — 20-minute soak (no exit-137)

```bash
# Run after Step (c) — 20 minutes, sample every 30s (40 samples)
for i in $(seq 1 40); do
  echo "=== Sample $i @ $(date -u +%H:%M:%SZ) ==="
  docker stats --no-stream --format "{{.Name}}: {{.MemUsage}}" | grep rag-service
  sleep 30
done

# After soak window:
docker logs vn-market-intelligence-mcp-rag-service-1 2>&1 | grep -i "killed\|oom\|exit 137"
# Expected: zero output — PASS
docker inspect vn-market-intelligence-mcp-rag-service-1 --format '{{.State.ExitCode}}'
# Expected: 0 (or empty if still running) — PASS
```

**Soak PASS = all 4 steps green.** Any exit-137 in docker logs = immediate FAIL; escalate to
dev-rag-service; do not declare rag-service soak complete.

---

## 7. DDD Layer Assignment

| Component | Layer | File |
|---|---|---|
| `asyncio.Lock` lazy-singleton guard | infrastructure | `apps/rag-service/infrastructure/embedder.py` |
| `_ensure_model_loaded()` | infrastructure | `apps/rag-service/infrastructure/embedder.py` |
| `initialize()` no-op body | infrastructure | `apps/rag-service/infrastructure/embedder.py` |
| Cold/warm `/embed/health` response shapes | interface | `apps/rag-service/interface/handlers.py` |
| Memory cap edit | infrastructure (compose) | `docker-compose.yml` |

No domain layer changes. No application layer changes. No new files required.

---

## 8. Risk Flags

**RISK-1 (MEDIUM): asyncio.Lock created before event loop.**  
`asyncio.Lock()` must not be called at module import time or in `__init__` outside a running loop
(Python 3.10+ raises `DeprecationWarning`; Python 3.12 raises `RuntimeError`). Use the lazy-init
pattern: `if self._load_lock is None: self._load_lock = asyncio.Lock()` inside the first async
call to `_ensure_model_loaded()`. Mitigation: the lazy-init pattern eliminates this risk entirely.

**RISK-2 (LOW): First embed call latency spike visible to caller.**  
The first `/index` or `/search` request after cold start will block for up to 60s while the model
downloads (first-ever deploy, empty cache). Subsequent restarts with warm disk cache: 2-5s.
Callers (`mcp-server` → `search_similar_context` / `record_evidence_fragment`) must handle this
via their existing timeout settings. No change required; this is documented, not a defect.
The warm-up step in the soak DoD makes this predictable.

**RISK-3 (LOW): `_load_error` flag not yet implemented.**  
Currently, if `SentenceTransformer(...)` raises during lazy load, `_load_model()` will raise
and the exception propagates to the embed call, returning a 500. The 503 "model load failed"
path requires a `self._load_error: Optional[Exception]` flag on the embedder and a check in
`_ensure_model_loaded()`. dev-rag-service should implement this as part of GFD-13 to give ops a
clean error signal if the model is uncacheable (bad network, corrupt weights, OOM mid-load).

**RISK-4 (LOW): Soak step (b) uses `/index` as warm-up trigger.**  
`/index` writes a LanceDB entry as a side effect of warming up. The warmup-probe-001 entry is
harmless but will appear in `index_size` counts. If this is undesirable, dev-rag-service MAY
implement a lightweight `/embed/warmup` POST endpoint that calls `_ensure_model_loaded()` and
returns without writing to LanceDB. This is optional; the soak DoD above works either way.

---

## 9. Build Standard

**BUILD-STANDARD: lean**  
Zone `apps/rag-service/` exists. This is an in-zone refactor of existing infrastructure adapter
(`embedder.py`) + interface handler (`handlers.py`) with a compose file edit. No new service, no
new primitives. dev-rag-service drives end-to-end; no relay required beyond pm task dispatch.
