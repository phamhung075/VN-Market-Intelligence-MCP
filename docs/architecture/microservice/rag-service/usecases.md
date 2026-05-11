# rag-service — Use Cases

## SearchUseCase
- **File:** `apps/rag-service/application/usecases.py`

### Input DTO
```python
class SearchRequest:
    query: str
    limit: int = 5
    decay_half_life_days: float = 7.0
    max_distance: float = 0.8
    level: Optional[str] = None          # "global"|"country"|"domain"|"action"
    action_code: Optional[str] = None    # stock ticker filter
```

### Output DTO
```python
class SearchResponse:
    results: list[SearchResultDTO]
    total: int

class SearchResultDTO:
    id: str, level: str, title: str, summary: str,
    tags: list[str], action_code: str, created_at: str,
    distance: float, recency_score: float
```

### Flow
1. Embed query text via `embedder.embed(query)`
2. Search vector store: `vector_store.search(query_vector, limit=request.limit*4)` — **over-fetches 4x** for dedup + filtering
3. Rank via `search_service.rank(raw_results, half_life_days, max_distance)`
4. Trim to `request.limit`
5. Map to `SearchResultDTO` list

## IndexUseCase
- **File:** `apps/rag-service/application/usecases.py`

### Input DTO
```python
class IndexRequest:
    id: str
    content: str
    tags: list[str] = []
    level: str = "global"
    title: str = ""
    summary: str = ""
    action_code: Optional[str] = None
```

### Output DTO
```python
class IndexResponse:
    status: str    # "ok"
    indexed: int   # 1
    entry_id: str
```

### Flow
1. Build embedding text: `action_code + title + level + tags + content` (truncated to 2000 chars)
2. Embed via `embedder.embed(embedding_text)`
3. Create `AnalysisEntry` with `created_at=now(utc)`
4. Insert into vector store
5. Return `IndexResponse(status="ok", indexed=1, entry_id=request.id)`
