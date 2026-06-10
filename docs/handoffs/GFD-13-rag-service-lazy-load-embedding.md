# GFD-13: rag-service — Lazy-Load Embedding Model

**Task ID:** GFD-13  
**Owner:** dev-rag-service  
**Sprint:** GO-FLEET-DEPLOY  
**Size:** S (est. 2h)  
**Depends on:** GFD-7 (SHIPPED — /embed/health endpoint live, 512m/768m caps set)  
**Blocks:** rag portion of GFD-10 full soak  
**Status:** READY

**Architecture brief:** `docs/architecture-briefs/2026-06-10-rag-lazy-load.md`  
**Decision journal:** `docs/agent-memory/decisions/sprint-GO-FLEET-DEPLOY-architect.md` § STEP A-5

---

## Context

GFD-7 shipped `/embed/health` and reduced compose memory to 512m reservation / 768m limit.
However, `rag-service` still loads the SentenceTransformer model at **startup** via
`build_lifespan() → embedder.initialize() → _load_model()`. On the memory-stressed host
(~9 GiB swap), the model load at startup OOM-kills the container before it can serve any request
(`exit 137`). This blocked GFD-10 (full fleet soak).

**Fix:** make the model load happen only on the FIRST real `/embed` or `/index` call (lazy-load).
The container starts light (~150 MiB) and the model loads on demand.

---

## Files to Modify (3 files only)

| File | Change |
|---|---|
| `apps/rag-service/infrastructure/embedder.py` | Add `asyncio.Lock` lazy singleton; make `initialize()` a no-op |
| `apps/rag-service/interface/handlers.py` | Revise `/embed/health` cold/warm response shapes |
| `docker-compose.yml` | Lower `reservations.memory` for rag-service: 512m → 256m |

No other files. No new files. No domain or application layer changes.

---

## Implementation Steps

### Step 1 — `apps/rag-service/infrastructure/embedder.py`

#### 1a. Modify `__init__` to add the lock field

```python
def __init__(self, model_name: str, cache_dir: str) -> None:
    self._model_name = model_name
    self._cache_dir = cache_dir
    self._model = None          # lazy-loaded
    self._load_lock = None      # asyncio.Lock — created lazily inside first async call
    self._load_error = None     # Optional[Exception] — set if model load fails
```

#### 1b. Add `_ensure_model_loaded()` coroutine

```python
async def _ensure_model_loaded(self) -> None:
    """Lazy-init the model exactly once. Thread-safe via asyncio.Lock."""
    if self._model is not None:       # fast path — already loaded
        return
    if self._load_error is not None:  # previous load attempt failed — surface error
        raise RuntimeError(
            f"embedding model failed to load: {self._load_error}"
        ) from self._load_error
    # Lazy-init the lock (must be created inside a running event loop)
    if self._load_lock is None:
        self._load_lock = asyncio.Lock()
    async with self._load_lock:
        if self._model is not None:   # double-check inside lock
            return
        try:
            await asyncio.to_thread(self._load_model)
        except Exception as exc:
            self._load_error = exc
            raise
```

Add `import asyncio` at the top of `embedder.py` (after existing imports).

#### 1c. Update `embed()` and `embed_batch()` to call `_ensure_model_loaded()`

```python
async def embed(self, text: str) -> EmbeddingVector:
    await self._ensure_model_loaded()
    results = self._raw_embed([text])
    return EmbeddingVector(dims=_DIMS, values=results[0])

async def embed_batch(self, texts: list[str]) -> list[EmbeddingVector]:
    if not texts:
        return []
    await self._ensure_model_loaded()
    results = self._raw_embed(texts)
    return [EmbeddingVector(dims=_DIMS, values=v) for v in results]
```

#### 1d. Make `initialize()` a no-op

```python
async def initialize(self) -> None:
    """
    Lazy-load: model loads on first embed call, not at startup.
    This method is intentionally a no-op (interface contract preserved for app_factory.py).
    GFD-13: eager startup load removed — deferred to first _ensure_model_loaded() call.
    """
    logger.info(
        "rag-service lazy-load enabled — embedding model will load on first embed call"
    )
```

`_load_model()` itself is unchanged (still called from `asyncio.to_thread()` via
`_ensure_model_loaded()` and directly from `_raw_embed()` for the synchronous fallback path).

---

### Step 2 — `apps/rag-service/interface/handlers.py`

Replace the current `/embed/health` handler body with the cold/warm logic below.

The handler MUST remain purely passive: it reads `embedder._model` but NEVER calls
`_ensure_model_loaded()`. The probe stays cheap and cannot trigger a load.

```python
@router.get("/embed/health")
async def embed_health() -> Response:
    """Capability probe — cold/warm state reporting. NEVER triggers model load.

    Cold (model not loaded yet): 200 {"status":"ok","model_loaded":false,"state":"cold",...}
    Warm (model loaded):         200 {"status":"ok","model_loaded":true,"state":"warm",...}
    503 ONLY on genuine failure (LanceDB unreachable, or model load previously failed).

    GFD-13: cold state is NORMAL — do NOT return 503 merely because model is not loaded.
    """
    try:
        if embedder is None:
            return Response(
                status_code=503,
                content=json.dumps({"status": "error", "reason": "embedder not wired"}),
                media_type="application/json",
            )

        # LanceDB index_size — queryable without the model
        index_size = 0
        if vector_store is not None:
            index_size = await vector_store.count()

        model_name: str = getattr(embedder, "_model_name", "unknown")
        model_obj = getattr(embedder, "_model", None)
        load_error = getattr(embedder, "_load_error", None)

        # Surface a previous failed load attempt as 503
        if load_error is not None:
            return Response(
                status_code=503,
                content=json.dumps({
                    "status": "error",
                    "reason": f"model load failed: {load_error}",
                }),
                media_type="application/json",
            )

        if model_obj is None:
            # Cold state — normal, not an error
            return Response(
                status_code=200,
                content=json.dumps({
                    "status": "ok",
                    "model_loaded": False,
                    "state": "cold",
                    "index_size": index_size,
                    "model_name": model_name,
                }),
                media_type="application/json",
            )

        # Warm state — run 1-token smoke test to confirm model is callable
        model_obj.encode("a", convert_to_tensor=False, show_progress_bar=False)

        return Response(
            status_code=200,
            content=json.dumps({
                "status": "ok",
                "model_loaded": True,
                "state": "warm",
                "index_size": index_size,
                "model_name": model_name,
            }),
            media_type="application/json",
        )

    except Exception as exc:
        logger.exception("embed_health probe failed")
        return Response(
            status_code=503,
            content=json.dumps({"status": "error", "reason": str(exc)}),
            media_type="application/json",
        )
```

---

### Step 3 — `docker-compose.yml`

Find the `rag-service` deploy resources block (currently at lines ~155-160) and change only
`reservations.memory`:

```yaml
# Before
reservations:
  memory: 512m

# After
reservations:
  memory: 256m
```

`limits.memory: 768m` — DO NOT change. It must cover the warm RSS peak (~600-700 MiB).

**Reasoning:** `reservations.memory` is a Docker scheduling hint for how much memory to guarantee.
At idle (model not loaded), rag-service uses ~150 MiB. 256m provides scheduling margin above idle
without over-reserving host memory. The previous 512m was sized for always-loaded; it is
incorrect post-lazy-load.

---

## Acceptance Criteria (DoD Checkboxes)

- [ ] `SentenceTransformersEmbedder.__init__` has `_load_lock = None` and `_load_error = None` fields
- [ ] `_ensure_model_loaded()` async coroutine implemented with lazy `asyncio.Lock` and double-check pattern
- [ ] `embed()` and `embed_batch()` both call `await self._ensure_model_loaded()` before `_raw_embed()`
- [ ] `initialize()` is a no-op that logs a message (interface preserved, no body logic)
- [ ] `asyncio.to_thread(self._load_model)` used inside `_ensure_model_loaded()` (event loop non-blocking)
- [ ] `/embed/health` cold response: HTTP 200 `{"status":"ok","model_loaded":false,"state":"cold","index_size":<int>,"model_name":"<str>"}`
- [ ] `/embed/health` warm response: HTTP 200 `{"status":"ok","model_loaded":true,"state":"warm","index_size":<int>,"model_name":"<str>"}`
- [ ] `/embed/health` returns 503 ONLY on LanceDB unreachable, load_error set, or embedder not wired — NEVER on cold state
- [ ] `/embed/health` handler NEVER calls `_ensure_model_loaded()` (probe is passive)
- [ ] `docker-compose.yml` rag-service `reservations.memory` updated: 512m → 256m
- [ ] `docker-compose.yml` rag-service `limits.memory` unchanged at 768m
- [ ] `docker compose build rag-service && docker compose up -d --no-deps rag-service` succeeds
- [ ] Immediately after start, `curl /embed/health` returns HTTP 200 `model_loaded:false` (cold — PASS, not fail)
- [ ] Container RSS at idle is < 256m (verify with `docker stats`)
- [ ] After one `/index` or `/embed` call, `curl /embed/health` returns `model_loaded:true`
- [ ] No exit-137 in `docker logs` across a 20-minute soak window

---

## Orch-State Task Note (for pm/po — do NOT edit orch-state.json yourself)

pm/po must register the following task on the orch-state task_board:

```
task_id:   GFD-13
title:     rag-service — lazy-load embedding model
owner:     dev-rag-service
sprint:    GO-FLEET-DEPLOY
status:    READY
blocks:    GFD-10 (rag portion of full fleet soak)
depends:   GFD-7 (DONE)
size:      S
```

This task is on the critical path for the rag portion of GFD-10. Until GFD-13 is DONE and
the rag container passes its soak DoD, the rag-service row in the GFD-10 full-fleet soak
remains blocked.

---

## Soak DoD (for ops — after dev ships GFD-13)

Full detail in `docs/architecture-briefs/2026-06-10-rag-lazy-load.md § 6`.

Summary sequence:
1. **Cold probe:** `curl /embed/health` → 200 `model_loaded:false` — this is PASS
2. **Warm-up trigger:** one real `/index` POST call (or optional `/embed/warmup` endpoint)
3. **Warm probe:** `curl /embed/health` → 200 `model_loaded:true` AND `docker stats` RSS < 768m
4. **20-min soak:** no exit-137 in docker logs; RSS stays stable under 768m limit

---

## [Architect] Brownfield Findings

- **Zone:** `apps/rag-service/`
- **BUILD-STANDARD:** lean (existing zone, in-zone refactor, no new service)
- **Verified paths:**
  - `apps/rag-service/infrastructure/embedder.py:31-41` — `__init__` + `initialize()` — eager load origin
  - `apps/rag-service/infrastructure/embedder.py:43-57` — `_load_model()` — already idempotent (`if self._model is not None: return`)
  - `apps/rag-service/infrastructure/embedder.py:63-84` — `_raw_embed()`, `embed()`, `embed_batch()` — entry points for lazy trigger
  - `apps/rag-service/app_factory.py:31-64` — `build_lifespan()` — calls `embedder.initialize()` at startup
  - `apps/rag-service/interface/handlers.py:43-94` — current `/embed/health` — 503 on cold (must change)
- **Reuse patterns:**
  - `_load_model()` is already idempotent — reuse unchanged; only wrap call site
  - `asyncio.to_thread()` pattern already in Python stdlib — no new dependency
  - Lazy-lock pattern (`if self._load_lock is None: self._load_lock = asyncio.Lock()`) avoids event-loop-at-import risk
- **Design decisions:**
  - `asyncio.Lock` (not `threading.Lock`): FastAPI is async; lock must be awaitable
  - `asyncio.to_thread()`: model load is CPU-bound; must not block the event loop
  - `initialize()` kept as no-op: preserves duck-type contract used by `app_factory.py` (no factory change needed)
  - `/embed/health` stays passive: probing must never trigger load; warm-up is explicit
  - `reservations.memory: 256m`: correctly sized to idle (~150 MiB) not warm peak
  - `limits.memory: 768m`: unchanged — must cover warm peak spike or first embed OOM-kills
- **Risk flags:**
  - RISK-1 (MEDIUM): asyncio.Lock must be created inside running event loop — use lazy-init pattern (see brief § 8)
  - RISK-2 (LOW): first embed call blocks for 2-60s — callers must tolerate this; documented, not a defect
  - RISK-3 (LOW): `_load_error` flag needed for 503 on failed load — implement in GFD-13
- **Scan clean:** true — no DDD violations; all changes confined to infrastructure + interface layers
