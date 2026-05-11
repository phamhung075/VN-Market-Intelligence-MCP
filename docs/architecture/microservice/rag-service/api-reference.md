# rag-service — API Reference

**File:** `apps/rag-service/interface/handlers.py`

## GET /health
```json
{ "status": "ok", "service": "rag-service" }
```

## POST /search
Semantic search with temporal decay ranking.

**Request (Pydantic validated):**
```json
{
  "query": "VCB earnings Q4 2024",
  "limit": 5,
  "decay_half_life_days": 7.0,
  "max_distance": 0.8,
  "level": "action",
  "action_code": "VCB"
}
```

**Validation:**
- `query`: min_length=1
- `limit`: 1-50 (default 5)
- `decay_half_life_days`: >= 0.1 (default 7.0)
- `max_distance`: 0.0-2.0 (default 0.8)
- `level`: optional, one of global/country/domain/action
- `action_code`: optional, regex `^[A-Z0-9]{1,10}$`

**Response (200):**
```json
{
  "results": [
    {
      "id": "abc123",
      "level": "action",
      "title": "VCB Q4 Earnings Analysis",
      "summary": "Revenue up 15% YoY...",
      "tags": ["earnings", "banking"],
      "action_code": "VCB",
      "created_at": "2026-05-01T10:00:00Z",
      "distance": 0.35,
      "recency_score": 0.68
    }
  ],
  "total": 1
}
```

**500:** `{ "detail": { "error": "..." } }`

## POST /index
Index a document for semantic search.

**Request (Pydantic validated):**
```json
{
  "id": "analysis-2026-05-06",
  "content": "VCB reported strong Q4 results with revenue growth of 15%...",
  "tags": ["earnings", "banking", "VCB"],
  "level": "action",
  "title": "VCB Q4 2024 Earnings",
  "summary": "Revenue up 15% YoY, NPL ratio stable at 1.2%",
  "action_code": "VCB"
}
```

**Validation:**
- `id`: min_length=1
- `content`: min_length=1
- `tags`: list of strings (default [])
- `level`: string (default "global")

**Response (200):**
```json
{
  "status": "ok",
  "indexed": 1,
  "entry_id": "analysis-2026-05-06"
}
```

## Data Flow
```
POST /search → SearchUseCase
  → embedder.embed(query) → 384-dim vector
  → vector_store.search(vector, limit*4) → raw results
  → search_service.rank(results) → filter + temporal decay + sort
  → trim to limit → SearchResponse

POST /index → IndexUseCase
  → build embedding text (action_code+title+level+tags+content, max 2000 chars)
  → embedder.embed(text) → 384-dim vector
  → vector_store.insert(entry, vector)
  → IndexResponse
```
