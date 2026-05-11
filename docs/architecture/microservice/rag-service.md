# Microservice: rag-service

**Language:** Python / FastAPI
**Port:** 5002 (external + internal)
**Role:** Semantic search and embeddings. Generates multilingual sentence embeddings (384-dim via multilingual-MiniLM, local ONNX), stores in LanceDB vector store, and supports multi-level RAG retrieval with temporal decay for news and financial report context.

---

## DDD Layers

| Layer | Path | Responsibility |
|-------|------|----------------|
| domain | Retrieval logic | Multi-level RAG search, temporal decay weighting, similarity scoring |
| infrastructure | `rag_service.db` (sole writer), LanceDB vector store, HuggingFace ONNX runtime | Embedding generation, vector upsert/search |
| interface | FastAPI endpoints | Embedding API, search API, called by mcp-server |

mcp-server also has a local RAG layer at `src/infrastructure/rag/` (embeddings.ts, vectorstore.ts, retriever.ts) for in-process calls. The rag-service microservice handles the standalone embedding/search service.

---

## Tool Surface

RAG tools live in mcp-server. See `docs/architecture/microservice/mcp-server/news-analysis.md` for: `search_similar_context`, `fetch_and_analyze`.

---

## Upstream Dependencies (data in)

| Source | How |
|--------|-----|
| mcp-server | HTTP POST (text/news items to embed and store) |
| news pipeline | Indirect — news items embedded after normalization |

---

## Downstream Dependencies (calls out)

None. rag-service is a leaf node — it serves requests and does not call other services.

---

## Database Write Authority

`rag_service.db` — sole writer. Isolated.
LanceDB vector store — sole writer.

---

## Known Invariants

1. Embedding model: multilingual-MiniLM, 384 dimensions, local ONNX (no external API call for embeddings).
2. Temporal decay: half-life configurable in `mcp.config.json` → `rag.temporalDecayHalfLife`.
3. Max vector distance: configurable in `mcp.config.json` → `rag.maxVectorDistance`.
4. Multi-level retrieval: exact match → semantic → temporal decay fallback.
