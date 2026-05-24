# dev-rag-service — Notebook

Zone: `apps/rag-service/` | Stack: Python/FastAPI | DB: rag_service.db (write)

## Working Memory

### 2026-05-20 — TASK 1959-watchdog-10 (drop dead /app/data/models mkdir token)

**Task:** Remove `/app/data/models` from `RUN mkdir -p` in rag-service Dockerfile. Dead code left from watchdog-3 when model was relocated to `/opt/model-cache`.

**Edit:**
- `apps/rag-service/Dockerfile` line 37
- Before: `RUN mkdir -p /app/data/lancedb /app/data/models`
- After: `RUN mkdir -p /app/data/lancedb`
- Comment updated to remove "model cache" reference

**Validation:** `docker compose config rag-service` PASS. `EMBEDDING_CACHE_DIR=/opt/model-cache` confirmed correct in output.

**Note:** The stale `ENV EMBEDDING_CACHE_DIR=/app/data/models` on line 41 is already overridden by line 63 (`ENV EMBEDDING_CACHE_DIR=/opt/model-cache`). That line was not touched — task scope was mkdir only.

**Status:** DONE — AC-10-1 PASS. Rebuild pending ops.

---

### 2026-05-20 — TASK 1959-watchdog-3 (pre-bake sentence-transformers model)

**Task:** Bake sentence-transformers embedding model into RAG service Dockerfile to eliminate first-run HF Hub download on cold-start.

**Key findings:**
- Model: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` (~400MB)
- Config: `EMBEDDING_CACHE_DIR` env var, passed as `cache_folder` to `SentenceTransformer()` in `infrastructure/embedder.py`
- docker-compose.yml mounts `market_data:/app/data` — any files in `/app/data/` image layer are shadowed by volume on existing deployments. MUST bake to path outside `/app/data/`.
- Chose `/opt/model-cache` — completely outside volume mount, always available from image layer
- Added `HF_HUB_OFFLINE=1` + `TRANSFORMERS_OFFLINE=1` to Dockerfile ENV to enforce local-only loading at runtime
- Updated `EMBEDDING_CACHE_DIR` in Dockerfile ENV and docker-compose.yml from `/app/data/models` to `/opt/model-cache`
- sentence-transformers v5.5.x resolution order: explicit `cache_folder` param → `SENTENCE_TRANSFORMERS_HOME` env (only if cache_folder is None)
- HF_HUB_OFFLINE=1 prevents ALL HuggingFace network calls including metadata HEAD/GET requests

**Results:**
- Build: model baked in 29.2s (cached from prior test build)
- Image: 2.51GB → 3.43GB (+920MB, acceptable vs 32GB free)
- Cold-start deploy: 16s healthy (was >30s)
- Cold-start restart: 11-16s healthy
- HF network calls at startup: 0 (confirmed via docker logs)
- 41 tests GREEN

Zone health: model pre-bake successful, cold-start <20s consistently, 41/41 tests GREEN, HF_HUB_OFFLINE enforced. watchdog-10 dead-mkdir cleanup DONE. Next: ops rebuild. | HEALTHY

---

### 2026-05-24 — TASK P1-A (sandbox runner — SCALE pilot Phase 1)

**Task:** Build Python sandbox runner for rag-service SCALE pilot (G7/G12 prerequisite).

**Files created:**
- `apps/rag-service/sandbox/__init__.py` (empty)
- `apps/rag-service/sandbox/__main__.py` (CLI runner, stdlib only)
- `apps/rag-service/sandbox/README.md` (26L usage doc)
- `apps/rag-service/domain/primitive/mock_adder/` (AC proof primitives + scenarios)
- `apps/pdf-extractor/domain/primitive/mock_echo/` (AC-6 proof — --service=pdf-extractor path injection)
- `docs/signals/rag-service-sandbox-runner-ready-2026-05-24T074324Z.json` (WIP=1 signal, next_actor: pm)

**Green proof:**
```json
{"passed": true, "primitive": "mock_adder", "actual": {"sum": 7.0}, "expected": {"sum": 7.0}, "diff": [], "elapsed_ms": 0}
```

**Env audit:** empty — `env | grep -E 'DB_PATH|LANCEDB|HF_TOKEN|HUGGINGFACE|OPENAI_API_KEY|EMBEDDING_MODEL'` returns nothing.

**AC-4 grep:** exit 1 (no forbidden imports in sandbox/).

**Commit:** `c8e29f08` — 41/41 tests PASS, mypy CLEAN.

**Status:** DONE. Next: P1-B similarity-scorer primitive (G12 streak #1). WIP=1 now free.
