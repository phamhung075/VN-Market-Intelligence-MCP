# rag-service

**Port:** 5002 | **Language:** Python/FastAPI | **Agent:** `dev-rag-service`

Semantic search with sentence-transformer embeddings, LanceDB, and temporal decay ranking.

## Architecture

- **Domain:** Embedding models, search result entities, temporal decay rules
- **Application:** Embedding use cases, search orchestration, ranking pipeline
- **Infrastructure:** sentence-transformers (embeddings), LanceDB (vector store), SQLite (rag_service.db — write)
- **Interface:** HTTP handlers via FastAPI

## Database

- **Owns:** `rag_service.db` (read-write, isolated) — embedding metadata, search indexes
- **Vector store:** LanceDB for dense vector storage and similarity search

## Dependencies

- sentence-transformers model (downloaded at startup)
- mcp-server sends documents for embedding

## Documentation

- `domain-model.md` — embedding models, search entities, decay rules
- `usecases.md` — embedding pipeline, search orchestration, ranking
- `infrastructure.md` — LanceDB config, model setup, DB schema
- `api-reference.md` — HTTP endpoints
- `testing.md` — test strategy, fixtures, embedding mocks

> Docs populated incrementally by `dev-rag-service` agent during implementation tasks.
