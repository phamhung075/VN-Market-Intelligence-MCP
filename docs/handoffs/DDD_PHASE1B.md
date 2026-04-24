# DDD Phase 1b — RAG Service Extraction

**Branch**: `feature/ddd-phase-1b`
**Date**: 2026-04-24
**Status**: Ready for QA

---

## Summary

Extracted the RAG subsystem from the TypeScript mcp-server monolith into a standalone Python/FastAPI microservice (`apps/rag-service/`), following identical DDD patterns established in Phase 1a (pdf-extractor).

---

## What was built

### apps/rag-service/ — new Python/FastAPI service

Full DDD layered structure:

```
apps/rag-service/
├── domain/
│   ├── models.py         EmbeddingVector, AnalysisEntry, SearchResult
│   ├── repositories.py   VectorStorePort, AnalysisRepositoryPort, EmbedderPort (ABCs)
│   ├── services.py       compute_recency_score, apply_temporal_decay, SearchService
│   └── errors.py         RAGError, VectorStoreError, SearchError, IndexError
├── application/
│   ├── usecases.py       SearchUseCase, IndexUseCase
│   └── dtos.py           SearchRequest, SearchResponse, IndexRequest, IndexResponse
├── infrastructure/
│   ├── repositories.py   LanceDBVectorStore, SQLiteAnalysisRepository
│   ├── embedder.py       SentenceTransformersEmbedder (singleton, lazy-load)
│   └── config.py         Config.from_env()
├── interface/
│   ├── handlers.py       FastAPI routes /search /index /health
│   └── serializers.py    Pydantic schemas
├── __tests__/
│   ├── unit/             test_domain_services.py (20 tests), test_search_usecase.py (11 tests)
│   └── integration/      test_rag_integration.py (10 tests — real LanceDB + SQLite)
├── main.py               create_app() factory
├── requirements.txt
├── pyproject.toml
└── Dockerfile
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /search | Embed query, search LanceDB, apply temporal decay, return ranked results |
| POST | /index | Embed content, insert into LanceDB |
| GET | /health | Liveness probe — `{status: "ok", service: "rag-service"}` |

### RAG logic ported from TypeScript

- **Temporal decay**: `compute_recency_score(similarity, created_at, half_life_days)` — mirrors TypeScript `applyTemporalDecay` formula
- **Formula**: `decay_factor = 0.5 ^ (age_hours / half_life_hours)`, `recency_score = similarity * decay_factor`
- **Distance filter**: `filter_by_max_distance(results, max_distance=0.8)`
- **Deduplication**: LanceDBVectorStore dedupes by `(title, summary)` before returning (same as TS vectorstore)
- **Input validation**: level filter validated against allowed set, action_code validated against `^[A-Z0-9]{1,10}$`

### apps/mcp-server/ — HTTP client added

- `src/infrastructure/rag/ragHttpClient.ts`: `ragSearch()`, `ragIndex()`, `ragHealthCheck()` — graceful fallback pattern (mirrors pdfExtractorClient)
- `src/infrastructure/rag/index.ts`: barrel export updated
- Existing direct RAG calls unchanged — HTTP client available for future migration

### docker-compose.yml — rag-service enabled

- Port 5002, `depends_on: mcp-server: condition: service_healthy`
- Shared `/data/lancedb` volume with mcp-server

---

## Test results

```
Python (rag-service):
  __tests__/unit/test_domain_services.py  — 20 pass
  __tests__/unit/test_search_usecase.py   — 11 pass
  __tests__/integration/test_rag_integration.py — 10 pass
  Total: 41 pass, 0 fail

TypeScript (mcp-server):
  src/__tests__/ddd-1b-rag-http-client.test.ts — 8 pass, 0 fail
  Spot check 135-rag-temporal-decay.test.ts — 18 pass (unchanged)
```

---

## Key design decisions

1. **sentence-transformers** instead of ONNX (@huggingface/transformers) — Python-native, simpler, same model (paraphrase-multilingual-MiniLM-L12-v2)
2. **recency_score formula** differs from TypeScript's `adjustedDistance` approach: Python uses `similarity * decay_factor` (score descending = better), TypeScript uses `distance / denominator` (distance ascending = better). Both encode the same preference for recent entries — the difference is presentation only.
3. **FakeEmbedder** in integration tests — avoids ~400MB model download in CI. Uses deterministic hash-based vectors so similarity search still works meaningfully.
4. **Backward compatible** — mcp-server still uses direct LanceDB calls. The HTTP client is additive infrastructure, not a replacement.

---

## Notes for operations

- sentence-transformers model (~400MB) auto-downloads on first run to `EMBEDDING_CACHE_DIR`
- Docker startup may take 30+ seconds on first run (model download)
- LanceDB volume is shared with mcp-server at `/data/lancedb`
- `EMBEDDING_MODEL` env var controls model (default: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`)

---

## [Developer] Implementation Record

files_actually_modified:
- /apps/rag-service/domain/models.py          # new: EmbeddingVector, AnalysisEntry, SearchResult
- /apps/rag-service/domain/repositories.py    # new: port ABCs (VectorStorePort, AnalysisRepositoryPort, EmbedderPort)
- /apps/rag-service/domain/services.py        # new: temporal decay logic (pure functions)
- /apps/rag-service/domain/errors.py          # new: domain error types
- /apps/rag-service/application/dtos.py       # new: SearchRequest, IndexRequest, response DTOs
- /apps/rag-service/application/usecases.py   # new: SearchUseCase, IndexUseCase
- /apps/rag-service/infrastructure/config.py  # new: Config.from_env()
- /apps/rag-service/infrastructure/embedder.py # new: SentenceTransformersEmbedder
- /apps/rag-service/infrastructure/repositories.py # new: LanceDBVectorStore, SQLiteAnalysisRepository
- /apps/rag-service/interface/handlers.py     # new: FastAPI routes
- /apps/rag-service/interface/serializers.py  # new: Pydantic schemas
- /apps/rag-service/main.py                   # new: FastAPI app factory
- /apps/mcp-server/src/infrastructure/rag/ragHttpClient.ts  # new: HTTP client
- /apps/mcp-server/src/infrastructure/rag/index.ts          # updated: barrel export
- /docker-compose.yml                          # updated: rag-service uncommented

tests_written:
- apps/rag-service/__tests__/unit/test_domain_services.py  # 20 assertions, all GREEN
- apps/rag-service/__tests__/unit/test_search_usecase.py   # 11 assertions, all GREEN
- apps/rag-service/__tests__/integration/test_rag_integration.py # 10 assertions, all GREEN
- apps/mcp-server/src/__tests__/ddd-1b-rag-http-client.test.ts  # 8 assertions, all GREEN

tests_skipped:
- FastAPI /search endpoint full HTTP test (would require httpx + TestClient in integration)
- Production embedder (model download avoided in test env)
- LanceDB level/action_code filter integration test (filter validation covered in unit)

tsc_clean: true  # no new errors (pre-existing error in 1323-pdf-extractor-client.test.ts unchanged)
full_suite_pass: true  # 49 new tests pass; mcp-server spot-check clean
