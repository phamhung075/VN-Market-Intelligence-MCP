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
