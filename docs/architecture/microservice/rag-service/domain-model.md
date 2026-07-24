# rag-service — Domain Model

## Value Objects

### EmbeddingVector
```python
class EmbeddingVector:
    dims: int              # 384 (sentence-transformers)
    values: list[float]    # len(values) must == dims
```

### SearchResult
```python
class SearchResult:
    id: str
    level: str             # "global", "country", "domain", "action"
    title: str
    summary: str
    tags: list[str]
    action_code: str       # stock ticker if level='action'
    created_at: str        # ISO timestamp
    distance: float        # L2 distance from LanceDB
    recency_score: float   # temporal decay adjusted (default 0.0)
```

## Entities

### AnalysisEntry
```python
class AnalysisEntry:
    id: str
    level: Literal["global", "country", "domain", "action"]
    title: str
    summary: str
    tags: list[str]
    created_at: datetime
    action_code: Optional[str]  # stock ticker if level='action'

    def is_valid_level(self) -> bool:
        return self.level in {"global", "country", "domain", "action"}
```

## Business Rules

### Temporal Decay Formula
```python
def compute_recency_score(similarity, created_at_iso, half_life_days=7.0) -> float:
    age_hours = (now - created_at) / 3600
    half_life_hours = half_life_days * 24
    decay_factor = 0.5 ** (age_hours / half_life_hours)
    return similarity * decay_factor
```

**Examples:**
- Brand new (age=0): `recency_score = similarity * 1.0`
- 7 days old, 7d half-life: `recency_score = similarity * 0.5`
- 14 days old: `similarity * 0.25`
- Very old (365d): `similarity * ~0`

### Similarity Conversion (L2 distance)
```python
similarity = 1.0 / (1.0 + distance)
```

### Filtering
`filter_by_max_distance(results, max_distance=0.8)` — removes results with `distance > max_distance`

### Ranking Pipeline
1. Filter by max_distance
2. Apply temporal decay to each result
3. Sort descending by recency_score

## Repository Ports

### VectorStorePort
```python
async insert(entry: AnalysisEntry, vector: EmbeddingVector) -> None
async search(query_vector, limit, level_filter?, action_code_filter?) -> list[SearchResult]
async count() -> int
```

### EmbedderPort
```python
async embed(text: str) -> EmbeddingVector
async embed_batch(texts: list[str]) -> list[EmbeddingVector]
```

## Domain Service

### SearchService
- **File:** `apps/rag-service/domain/services.py`
- Pure functions, no I/O

**Method: `rank(results, half_life_days=7.0, max_distance=0.8) -> list[SearchResult]`**
1. `filter_by_max_distance(results, max_distance)` → filtered
2. `apply_temporal_decay(filtered, half_life_days)` → ranked
3. Return sorted descending by recency_score
