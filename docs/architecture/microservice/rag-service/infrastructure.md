# rag-service — Infrastructure

## LanceDBVectorStore
- **File:** `apps/rag-service/infrastructure/repositories.py`
- Implements `VectorStorePort`

### Schema
```
Table: "rag_entries"
Columns:
  id: TEXT PRIMARY KEY
  level: TEXT
  title: TEXT
  summary: TEXT
  vector: ARRAY[float] (384-dim)
  tags: TEXT (JSON string)
  action_code: TEXT
  created_at: TEXT (ISO datetime)
```

### insert(entry, vector)
Builds row dict, calls `table.add([row])`. Tags serialized to JSON.

After each insert, increments an internal `_insert_count` counter. When
`_insert_count >= _COMPACT_EVERY` (100), calls `compact()` automatically then
resets the counter. Compaction failure is non-fatal — insert still succeeds.

### compact()
Runs `table.optimize(cleanup_older_than=timedelta(days=2))`:
- Merges small fragment files into larger compacted files (online-safe, reads/writes continue)
- Prunes version manifests older than 2 days; latest version is always kept
- Resets `_insert_count` to 0
- Failure is logged as WARNING and does not raise
- Can be called directly for manual/maintenance runs (e.g. a `/compact` admin endpoint or cron)

**Why this matters:** every `table.add()` creates a new fragment file + manifest version.
Without periodic compaction, a 100-insert/day workload produces ~36k fragments/year and
several GB of write-amplification. With this guard, fragments converge to a single compacted
file after each compaction cycle (~100 inserts).

### search(query_vector, limit, level_filter?, action_code_filter?)
1. Build filter clauses:
   - Level filter: validates against `{"global", "country", "domain", "action"}`
   - Action code filter: validates regex `^[A-Z0-9]{1,10}$` (stock ticker format)
2. Over-fetch: `wide_limit = min(50, max(limit*4, limit))`
3. Vector search: `table.vector_search(query_vector.values).limit(wide_limit).where(...)`
4. Dedup by `(title, summary)` key (same article re-indexed multiple times)
5. Parse tags from JSON string
6. Return `list[SearchResult]` with L2 distance

### count()
Returns `table.count_rows()`, 0 on exception.

## SQLiteAnalysisRepository
- **File:** `apps/rag-service/infrastructure/repositories.py`

### Schema
```sql
CREATE TABLE IF NOT EXISTS rag_entries (
    id TEXT PRIMARY KEY,
    level TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    action_code TEXT,
    created_at TEXT NOT NULL
);
```

### Operations
- `save(entry)`: `INSERT ... ON CONFLICT DO UPDATE` (upsert), tags→JSON
- `find_by_id(entry_id)`: Fetch + deserialize tags from JSON
- `find_all()`: Fetch all + deserialize

## SentenceTransformersEmbedder
- **File:** `apps/rag-service/infrastructure/embedder.py`
- Implements `EmbedderPort`

### Model
- `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`
- Dimensions: **384**
- Size: ~400MB (auto-downloads on first use)
- Languages: Vietnamese, French, English, multilingual

### Methods
- `initialize()`: Eagerly loads model from FastAPI lifespan
- `_raw_embed(texts)`: `model.encode(texts, normalize_embeddings=True, show_progress_bar=False)` → numpy→list
- `embed(text)`: Single text → `EmbeddingVector(dims=384, values=...)`
- `embed_batch(texts)`: Multiple texts → list of EmbeddingVector

### Configuration
```python
class Config:
    lancedb_path: str = "./data/lancedb"
    db_path: str = "./data/rag_service.db"
    embedding_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    embedding_cache_dir: str = "./data/models"
    host: str = "0.0.0.0"
    port: int = 5002
```
