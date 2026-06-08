# SPIKE DFR-Q3 + DFR-Q4 — LanceDB Feasibility: add_columns() + FTS Hybrid Search

**Sprint:** DEEPFETCH-RAG-REDESIGN
**Agent:** dev-rag-service
**Date:** 2026-06-08
**Timebox:** 120 min (recon only, no production changes)
**Tasks:** DFR-Q4 (gates DFR-P1-RAG migration) · DFR-Q3 (gates DFR-P3-HYBRID)

---

## DJ-GATE-1: Version Verification (raw, not badge)

```
Installed version — two environments verified:
  Docker image (vn-market-intelligence-mcp-rag-service:latest):  lancedb 0.30.2
  Local Python 3.13 (host):                                       lancedb 0.25.3
  requirements.txt lower-bound:                                   lancedb>=0.6.0

AUTHORITATIVE for production: Docker image = lancedb 0.30.2
```

Commands run (raw output):
```
docker run --rm vn-market-intelligence-mcp-rag-service:latest pip show lancedb
  Name: lancedb
  Version: 0.30.2
  Location: /usr/local/lib/python3.10/dist-packages

pip show lancedb  (host)
  Version: 0.25.3
  Location: /usr/local/lib/python3.13/site-packages
```

---

## DFR-Q4: Is add_columns() non-destructive on an existing table with data?

**VERDICT: YES — add_columns() is NON-DESTRUCTIVE.**

### Evidence

Test setup:
- Throwaway LanceDB at `/tmp/spike_test_lancedb*` (inside Docker container — not touching live data)
- Table `rag_entries` pre-populated with 3 rows matching the current live schema:
  `{id, level, title, summary, vector[384], tags, action_code, created_at}`

Operation tested (all 8 proposed Phase 1 columns):
```python
tbl.add_columns({
    'ticker':        'CAST(NULL AS STRING)',
    'sector':        'CAST(NULL AS STRING)',
    'source_domain': 'CAST(NULL AS STRING)',
    'depth_tier':    "'shallow'",
    'doc_type':      "'news'",
    'published_at':  'CAST(NULL AS STRING)',
    'confidence':    'CAST(0.0 AS DOUBLE)',
    'impact_score':  'CAST(0.0 AS DOUBLE)',
})
```

Results (confirmed via PyArrow table read — no pandas dependency):
- Row count: 3 before → 3 after. NO rows dropped.
- All original column values intact: `id`, `action_code`, `title`, `level`, `created_at` all preserved.
- New columns applied with correct defaults:
  - `depth_tier` → `['shallow', 'shallow', 'shallow']`
  - `doc_type` → `['news', 'news', 'news']`
  - `confidence` → `[0.0, 0.0, 0.0]`
  - `impact_score` → `[0.0, 0.0, 0.0]`
  - `ticker`, `sector`, `source_domain`, `published_at` → `[None, None, None]` (null)
- Vectors NOT re-embedded (data type unchanged: ARRAY[float32][384])
- `add_columns()` is present and functional on the `LanceTable` class in 0.30.2

### Schema before/after (confirmed):
```
BEFORE: ['id', 'level', 'title', 'summary', 'vector', 'tags', 'action_code', 'created_at']
AFTER:  ['id', 'level', 'title', 'summary', 'vector', 'tags', 'action_code', 'created_at',
         'ticker', 'sector', 'source_domain', 'depth_tier', 'doc_type', 'published_at',
         'confidence', 'impact_score']
```

### Caveat: single-field FTS limitation
`create_fts_index(['title', 'summary'])` (multi-field list) raises:
```
Native FTS indexes can only be created on a single field at a time.
To search over multiple text fields, create a separate FTS index for each field.
```
This affects Phase 3 only (not Phase 1). See DFR-Q3 below.

### Implication for DFR-P1-RAG
- Migration can proceed against the live `rag_entries` table.
- All existing rows (current corpus) will survive with nulls/defaults on new columns.
- Existing rows remain searchable by vector similarity (vectors are unchanged).
- No re-embed required. No downtime required.
- Risk R4 from brief: **RESOLVED — no breaking change.**

---

## DFR-Q3: Does lancedb 0.30.2 support create_fts_index() + hybrid_search() (BM25+vector)?

**VERDICT: YES — FTS and hybrid search are AVAILABLE in lancedb 0.30.2, with one API constraint.**

### Evidence

#### FTS Index
```python
tbl.create_fts_index('title')    # SUCCESS
tbl.create_fts_index('summary')  # SUCCESS (separate index per field)
```

`create_fts_index` signature in 0.30.2:
```
(field_names: Union[str, List[str]], *, ordering_field_names=None, replace=False,
 writer_heap_size=1073741824, use_tantivy=False, tokenizer_name=None,
 with_position=False, base_tokenizer='simple', language='English',
 max_token_length=40, lower_case=True, stem=True, remove_stop_words=True,
 ascii_folding=True, ngram_min_length=3, ngram_max_length=3,
 prefix_only=False, name=None)
```

Key constraint: **multi-field list input is NOT supported in native mode** (`use_tantivy=False`). Each field needs its own index. Passing `['title', 'summary']` raises an error. The workaround is straightforward:
```python
tbl.create_fts_index('title')
tbl.create_fts_index('summary', replace=False)
```
Both indexes are then active simultaneously and both columns are searched by FTS queries.

#### FTS Search
```python
q = tbl.search('VCB', query_type='fts')
# Returns LanceFtsQueryBuilder — functional, returns results
```

#### Hybrid Search (BM25 + vector)
`LanceHybridQueryBuilder` exists. The correct API pattern is:
```python
# Pass query_type='hybrid' with NO string in search()
# Then set .vector() and .text() explicitly
result = (
    tbl.search(query_type='hybrid')
       .vector(query_vec)
       .text('VCB earnings')
       .limit(10)
       .to_list()
)
# SUCCESS — 3 results returned, ranked by combined score
```

Note: passing a string directly to `tbl.search('query', query_type='hybrid')` raises an error: "provide string query in search() OR set vector()+text() explicitly — not both". The explicit `.vector().text()` pattern works.

#### RRF Reranker
```python
from lancedb.rerankers import RRFReranker, LinearCombinationReranker
# Both available
reranker = RRFReranker()
result = (
    tbl.search(query_type='hybrid')
       .vector(query_vec)
       .text('VCB earnings')
       .rerank(reranker)
       .limit(10)
       .to_list()
)
# SUCCESS
```

### Implication for DFR-P3-HYBRID
- The Phase 3 implementation path is **unblocked from a version perspective**.
- Implementation note: `LanceDBVectorStore.hybrid_search()` should use `.vector().text()` pattern (not string-in-search). FTS must create two separate indexes (one per field), not a single multi-field call.
- `RRFReranker` is built-in — no external BM25 library needed.
- Phase 3 is gated on DFR-P1-RAG being live first (metadata columns needed for pre-filter context), per brief ordering.
- Risk from brief: "LanceDB FTS API stability is version-dependent" — **CONFIRMED STABLE in 0.30.2 for the exact usage pattern needed.**

---

## Summary Table

| Question | Answer | Evidence |
|----------|--------|----------|
| Deployed lancedb version (Docker) | **0.30.2** | `pip show lancedb` inside container |
| DFR-Q4: add_columns() non-destructive? | **YES** | Throwaway table: 3 rows before, 3 rows after, all data intact, new cols get defaults/null |
| DFR-Q3: create_fts_index() available? | **YES** | Single-field at a time (not multi-field list). Two calls needed for title + summary. |
| DFR-Q3: hybrid_search() available? | **YES** | `LanceHybridQueryBuilder` + `.vector().text()` pattern + `RRFReranker` all functional |
| DFR-Q3: version meets "v0.8+" threshold from brief? | **YES** | 0.30.2 >> 0.8 |

---

## Recommended Next Steps

**DFR-Q4 → DONE:** DFR-P1-RAG can proceed with the `add_columns()` migration against the live `rag_entries` table. Default values (`depth_tier='shallow'`, `doc_type='news'`, numerics 0.0, strings null) are safe for existing corpus.

**DFR-Q3 → DONE:** DFR-P3-HYBRID can be dispatched after DFR-P1-RAG is live. Implementation must use the single-field FTS index pattern and `.vector().text()` hybrid API (not string-in-search). No version upgrade needed.

**Implementation note for DFR-P3-HYBRID developer:** the `create_fts_index` call in `infrastructure/repositories.py` must be:
```python
tbl.create_fts_index('title', replace=True)
tbl.create_fts_index('summary', replace=True)
```
Not `tbl.create_fts_index(['title', 'summary'])`.

---

*Spike conducted: recon only. No live data altered. Throwaway DB paths inside Docker ephemeral container (discarded on container exit).*
