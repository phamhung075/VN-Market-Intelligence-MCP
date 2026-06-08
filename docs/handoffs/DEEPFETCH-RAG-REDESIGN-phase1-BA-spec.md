# BA Spec — DEEPFETCH-RAG-REDESIGN Phase 1
<!-- size-justification: 230L — two zones, 5 requirement groups (B2/B4/B7/Q5/caller-update), full DDD mapping, per-requirement acceptance criteria with live-verifiable checks. Splitting loses cross-reference integrity. -->

**Sprint:** DEEPFETCH-RAG-REDESIGN
**Task:** DFR-BA-1
**Date:** 2026-06-08
**BA cycle:** c1
**Priority:** high
**Zones:** apps/rag-service/ (dev-rag-service) · apps/mcp-server/ (dev-mcp-server)
**Source brief:** docs/architecture-briefs/2026-06-08-deepfetch-rag-redesign.md §§ B2, B4, B7, Q5

---

## Problem Statement

The LanceDB `rag_entries` table has zero domain-awareness fields: no ticker, sector, source_domain, depth_tier, doc_type, confidence, or published_at. A single global decay half-life of 7 days is applied to all content regardless of type. The Index and Search DTOs carry no filter parameters beyond `level` and `action_code`. As a result, all consumers (CHEF, cascadeEngine, bctc-analyst, news-scout) query an undifferentiated index and cannot pre-filter by ticker, sector, or content type before vector search. Additionally, the SQLite `rag_analyses` table has no `body_text` column, blocking future deep-content storage even before Phase 2 is implemented.

Phase 1 closes the metadata gap additively — no re-embedding, no FTS, no deep-fetch pipeline. It delivers immediate filter precision for all consumers with zero downtime risk.

---

## Scope

**IN SCOPE (this spec):**
- B2: additive LanceDB schema migration (+8 metadata columns via `add_columns()`)
- B4: per-`doc_type` temporal-decay half-life config map applied at query time
- B7: Index DTO + Search DTO extension + `LanceDBVectorStore.search()` filter params
- Q5: `rag_analyses` SQLite `ALTER TABLE ADD COLUMN body_text`
- Caller updates: `ragIndex()` call sites in `pollNews.ts` and `fetchParseAndStoreBctc.ts` updated to pass new fields; `ragSearch()` callers updated to pass appropriate `decay_half_life_days`

**EXPLICITLY OUT OF SCOPE (gated in backlog):**
- Phase 2 deep-fetch pipeline (DFR-P2-DEEPFETCH): VPS article-body endpoint, `deep_fetch_queue` table, `deepFetchVpsJob.ts`, `deepFetchMainJob.ts`, relevance gate logic — gated pending Q1/Q2 feasibility answers from dev-vps-crawls
- Phase 3 BM25/FTS hybrid search (DFR-P3-HYBRID): LanceDB FTS index, `hybrid_search()` path — gated pending Q3/Q4 feasibility answers from dev-rag-service
- Chunking strategy changes (B3): multi-chunk indexing for deep content — depends on Phase 2 body_text being live
- Consumer query pattern rewrites (B6): unified-agent, cascadeEngine, bctc-analyst callers beyond the `decay_half_life_days` update

---

## Requirements

### FR-1 — LanceDB additive schema migration (+8 columns)
**DDD layer:** infrastructure
**Zone:** apps/rag-service/ · `infrastructure/repositories.py` · `LanceDBVectorStore`

Add the following 8 columns to the existing `rag_entries` LanceDB table via `add_columns()`. All columns are nullable with defaults so existing rows are backward-compatible and remain fully searchable.

| Column | Type | Default | Constraint |
|--------|------|---------|------------|
| `ticker` | TEXT | `""` | Uppercase, e.g. "VCB" |
| `sector` | TEXT | `""` | From watchlist, e.g. "Banking" |
| `source_domain` | TEXT | `""` | e.g. "cafef.vn" |
| `depth_tier` | TEXT | `"shallow"` | `"shallow"` or `"deep"` |
| `doc_type` | TEXT | `"news"` | `"news"` \| `"filing"` \| `"macro"` \| `"analysis"` |
| `published_at` | TEXT | `""` | ISO timestamp (original article, not ingestion) |
| `confidence` | REAL | `0.0` | 0.0–1.0 |
| `impact_score` | REAL | `0.0` | 0–10 |

Migration is performed once at startup inside `LanceDBVectorStore._get_table()`: after opening an existing table, call `table.add_columns()` guarded by a try/except for column-already-exists errors. Table creation path must include all 8 columns in the seed schema so new deployments never need a migration step.

**Acceptance criteria (AC-FR1):**
1. After migration, `await table.schema` lists all 8 new columns alongside the existing 8 — total 16 columns.
2. `await table.count_rows()` pre-migration equals `await table.count_rows()` post-migration (zero data loss).
3. A call to `POST /search` with no new parameters returns the same result set as before migration (backward compatibility — new columns do not alter ranking when all are NULL/default).
4. A freshly-created LanceDB instance (no prior data) initialises with all 16 columns in the seed schema — no `add_columns()` call needed on first run.
5. The `add_columns()` call is idempotent: running startup twice against the same LanceDB instance does not raise an error.

---

### FR-2 — Extend `IndexRequest` DTO with optional new fields
**DDD layer:** application
**Zone:** apps/rag-service/ · `application/dtos.py` · `IndexRequest`

Add 8 optional fields to `IndexRequest` with defaults matching FR-1:

```
ticker: Optional[str] = ""
sector: Optional[str] = ""
source_domain: Optional[str] = ""
depth_tier: Optional[str] = "shallow"
doc_type: Optional[str] = "news"
published_at: Optional[str] = ""
confidence: Optional[float] = 0.0
impact_score: Optional[float] = 0.0
```

All fields are optional. The existing `id`, `content`, `tags`, `level`, `title`, `summary`, `action_code` fields are unchanged.

`LanceDBVectorStore.insert()` must be updated to pass all 8 new fields from the `IndexRequest` into the LanceDB row dict. The `AnalysisEntry` domain model (`domain/models.py`) must gain these 8 optional fields so the application→domain boundary is clean.

**Acceptance criteria (AC-FR2):**
1. `POST /index` with only the existing 6 fields (id, content, tags, level, title, summary) succeeds with HTTP 200 — no new fields required.
2. `POST /index` with all 14 fields succeeds and the stored LanceDB row contains all 8 new fields at the passed values.
3. `POST /index` existing test suite passes without modification (backward compatibility of callers).
4. A row indexed with `doc_type="filing"` and `ticker="VCB"` can be retrieved via `POST /search` with the same query and returns `doc_type="filing"` and `ticker="VCB"` in the result DTO.

---

### FR-3 — Extend `SearchRequest` DTO + `LanceDBVectorStore.search()` filter params
**DDD layer:** application (DTO) + infrastructure (repository)
**Zone:** apps/rag-service/ · `application/dtos.py` · `SearchRequest` + `SearchResultDTO` · `infrastructure/repositories.py` · `LanceDBVectorStore.search()`

**SearchRequest additions (all optional):**
```
ticker: Optional[str] = None
sector: Optional[str] = None
source_domain: Optional[str] = None
depth_tier: Optional[str] = None
doc_type: Optional[str] = None
```

**SearchResultDTO additions (echo back new metadata):**
```
ticker: str = ""
sector: str = ""
source_domain: str = ""
depth_tier: str = "shallow"
doc_type: str = "news"
published_at: str = ""
confidence: float = 0.0
impact_score: float = 0.0
```

**`LanceDBVectorStore.search()` filter logic:**
- Each new filter parameter (ticker, sector, source_domain, depth_tier, doc_type) appends an equality clause to the LanceDB WHERE string, using the same `_sanitize()` + validation pattern already used for `level_filter` and `action_code_filter`.
- Validation rules: ticker must match `[A-Z0-9]{1,10}`; depth_tier must be in `{"shallow","deep"}`; doc_type must be in `{"news","filing","macro","analysis"}`; sector and source_domain are free-text (sanitize only, no enum check).
- Filter pre-passes run before vector search (LanceDB WHERE clause), consistent with brief rationale that pre-filter improves throughput.
- SearchResultDTO must propagate the 8 new metadata fields from the LanceDB row to the HTTP response.

**mcp-server HTTP client (`ragHttpClient.ts`) additions:**
- `RagSearchRequest` interface gains the 5 new optional filter fields (ticker, sector, source_domain, depth_tier, doc_type).
- `RagSearchResultDTO` interface gains the 8 new optional fields returned from the rag-service.
- `RagIndexRequest` interface gains the 8 new optional fields matching `IndexRequest`.
- All new interface fields are optional so existing callers compile without changes.

**Acceptance criteria (AC-FR3):**
1. `POST /search` with no new filter params returns the same result set as today (zero regression).
2. `POST /search {query: "VCB earnings", ticker: "VCB"}` returns ONLY rows where `ticker = "VCB"` (pre-filter verified by inserting two rows — one with `ticker="VCB"`, one with `ticker="HPG"` — and confirming the HPG row is absent from results).
3. `POST /search {doc_type: "filing"}` returns ONLY rows where `doc_type = "filing"`.
4. Invalid `depth_tier` value raises HTTP 400 with a descriptive error message.
5. TypeScript compilation (`tsc --noEmit`) of `ragHttpClient.ts` passes after DTO extension — existing callers in `pollNews.ts` and `fetchParseAndStoreBctc.ts` compile without changes (new fields are optional).

---

### FR-4 — Per-`doc_type` temporal-decay half-life config map
**DDD layer:** infrastructure (config read) + application (query-time application)
**Zone:** apps/mcp-server/ · `mcp.config.json` · `rag.decayHalfLifeDays` map

The existing `mcp.config.json` already has:
```json
"rag": { "temporalDecay": { "enabled": true, "halfLifeDays": 7, "maxBoost": 0.3 } }
```

Extend with a new nested map:
```json
"rag": {
  "temporalDecay": { "enabled": true, "halfLifeDays": 7, "maxBoost": 0.3 },
  "decayHalfLifeDays": {
    "news":     2,
    "macro":    7,
    "filing":   30,
    "analysis": 14
  },
  "maxDistance": 0.9
}
```

The map values are in days and must be read at runtime — never hardcoded in TypeScript. The existing `halfLifeDays: 7` is the legacy global default and must be preserved for callers that do not pass a `doc_type`.

`ragSearch()` callers that know the `doc_type` of the content they are querying must pass `decay_half_life_days: mcpConfig.rag.decayHalfLifeDays[docType]`. The two primary callers to update are:
- `pollNews.ts` default retriever — passes `decay_half_life_days` based on `doc_type: "news"` (= 2 days).
- `fetchParseAndStoreBctc.ts` — does not call `ragSearch` directly today; no change needed. The `ragIndex` call site must pass `doc_type: "filing"` once FR-2 is live.

The rag-service itself does NOT store the half-life. It is a query-time parameter passed by the caller in each `POST /search` request. The `decay_half_life_days` field already exists in `SearchRequest` — this requirement configures how callers populate it.

**Acceptance criteria (AC-FR4):**
1. `mcp.config.json` has a `rag.decayHalfLifeDays` object with exactly the 4 keys (`news`, `macro`, `filing`, `analysis`) and positive integer values.
2. `pollNews.ts` default retriever `ragSearch` call passes `decay_half_life_days: 2` (news half-life from config) — verified by reading the TypeScript source post-change.
3. `fetchParseAndStoreBctc.ts` `ragIndex` call passes `doc_type: "filing"` — verified by reading the TypeScript source post-change.
4. A call to `POST /search {decay_half_life_days: 30}` (filing) returns a higher `recency_score` for a 15-day-old row than a call with `{decay_half_life_days: 2}` (news) on the same row — verifiable via the rag-service `recency_score` field in the response.

---

### FR-5 — Caller updates: `ragIndex()` call sites pass new metadata fields
**DDD layer:** interface/scheduler (mcp-server call sites)
**Zone:** apps/mcp-server/ · `pollNews.ts` · `fetchParseAndStoreBctc.ts`

Update the two primary `ragIndex()` call sites to pass the new fields available at each call site:

**`pollNews.ts` (news ingestion path):**
Fields available at call time: `action_code` (already passed), `source_url` → derive `source_domain` via URL hostname parse, `published_at` from the news item, `confidence` and `impact_score` from `normalizeNews()` output.

New fields to pass:
```typescript
doc_type: "news",
depth_tier: "shallow",       // Phase 1 only; Phase 2 sets "deep" for deep-fetched rows
source_domain: new URL(entry.source_url).hostname,  // e.g. "cafef.vn"
published_at: entry.publishedAt ?? "",
confidence: entry.confidence ?? 0,
impact_score: entry.impact_score ?? 0,
ticker: detectedTickers[0] ?? "",   // first ticker from detectStocksInText result, already computed
sector: lookupSectorForTicker(ticker, watchlist) ?? "",
```

`lookupSectorForTicker()` is a pure function (domain layer): takes a ticker string and the loaded watchlist, returns the sector string or "" if not found. Implementation lives in `domain/services/` or inline in pollNews.

**`fetchParseAndStoreBctc.ts` (BCTC filing path):**
Fields available: `action_code` (ticker, already passed), `company_name`, the filing is always `doc_type: "filing"`.

New fields to pass:
```typescript
doc_type: "filing",
depth_tier: "shallow",
ticker: entry.action_code ?? "",
sector: lookupSectorForTicker(entry.action_code, watchlist) ?? "",
source_domain: "bctc.ssi.com.vn",   // BCTC source domain constant
published_at: entry.published_at ?? "",
confidence: entry.confidence ?? 0,
impact_score: 0,
```

**Acceptance criteria (AC-FR5):**
1. After update, `pollNews()` integration test (existing test suite) continues to pass — the new fields are additive and do not alter existing behavior.
2. A live `pollNews()` cycle produces LanceDB rows where `doc_type = "news"`, `depth_tier = "shallow"`, and `source_domain` is non-empty for any row sourced from a URL with a parseable hostname.
3. A live `fetchParseAndStoreBctc()` cycle produces LanceDB rows where `doc_type = "filing"`, `ticker` matches the stock code, and `source_domain = "bctc.ssi.com.vn"`.
4. TypeScript compilation passes for both modified files.

---

### FR-6 — SQLite `rag_analyses.body_text` ADD COLUMN
**DDD layer:** infrastructure
**Zone:** apps/mcp-server/ · `infrastructure/db/schema-news.ts` · `initNewsTables()`

Add an idempotent `ALTER TABLE` for `body_text` to the existing pattern in `initNewsTables()`, consistent with the `data_env` column migration already in place at line 57:

```typescript
try { db.exec("ALTER TABLE rag_analyses ADD COLUMN body_text TEXT"); } catch { /* already exists */ }
```

`body_text` is nullable. Existing rows receive NULL. No backfill is required — this column is populated by Phase 2 deep-fetch executors (out of scope here). Adding it now is the Q5 feasibility confirmation that the ALTER TABLE path works without data loss or service interruption.

**Acceptance criteria (AC-FR6):**
1. After mcp-server restart, `PRAGMA table_info(rag_analyses)` includes `body_text TEXT` as a column.
2. Existing row count in `rag_analyses` is unchanged after restart (zero data loss).
3. Existing rows have `body_text = NULL`.
4. `INSERT INTO rag_analyses (..., body_text) VALUES (..., 'test body')` succeeds without error.
5. Running `initNewsTables()` twice (double-restart) does not raise an error (idempotency).
6. The mcp-server service does not require downtime to apply the migration — it runs automatically on next startup.

---

## Non-Functional Requirements

**NFR-1 — Non-destructive migration:**
`add_columns()` must not drop, rename, or modify any existing LanceDB column. Verified by schema inspection post-migration.

**NFR-2 — Backward-compatible defaults:**
All 8 new LanceDB columns have defaults (empty string or 0.0). All 8 new DTO fields have defaults. Existing callers pass no new fields and must continue to work unchanged.

**NFR-3 — Baseline test count preserved:**
The existing rag-service test suite (`apps/rag-service/__tests__/`) and mcp-server test suite (`apps/mcp-server/src/__tests__/`) must pass with the same number of tests (no test deleted to make Phase 1 pass).

**NFR-4 — No re-embedding:**
The 384-dim `vector` column and all existing LanceDB rows are untouched. No re-embed of any existing entry. Verified by confirming `await table.count_rows()` is unchanged and the existing vector column remains 384-dim.

**NFR-5 — No service interruption:**
LanceDB `add_columns()` is an online operation. The rag-service does not need to stop serving requests during migration. SQLite `ALTER TABLE ADD COLUMN` on `rag_analyses` completes in milliseconds on the existing row count.

**NFR-6 — Config read-only (no hardcode):**
The `decayHalfLifeDays` values are read from `mcp.config.json` at runtime. No TypeScript file hardcodes the values 2, 7, 14, or 30.

---

## Blockers

No PO-only blockers identified. The following are technical pre-conditions that dev must verify before committing (they are listed in the brief as open questions and are non-blocking for the spec itself):

- **Q4 (dev-rag-service):** Verify `add_columns()` in the deployed lancedb version works non-destructively on an existing table with data. The brief flags this as the primary Phase 1 risk. If it does not work, alternative path is `create_table()` with new schema + data copy — dev must escalate to architect before attempting.
- **Q5 confirmation (dev-mcp-server):** The ALTER TABLE path is now specified (FR-6). Dev must confirm live execution against market.db produces no errors and existing row count is preserved. This is a confirmation step, not a blocker for this spec.

---

## Edge Cases

**E1 — source_url parse failure:**
`pollNews.ts` caller must guard `new URL(entry.source_url).hostname` with try/catch — if `source_url` is null, empty, or malformed, set `source_domain: ""` rather than throwing.

**E2 — ticker not in watchlist:**
`lookupSectorForTicker()` returns `""` if the ticker is not in the active watchlist. Callers pass `sector: ""`. The LanceDB filter `sector = 'X'` would then correctly exclude such rows from sector-filtered queries.

**E3 — published_at missing from RSS item:**
`published_at` defaults to `""` if the upstream RSS item has no publish timestamp. Temporal decay in the rag-service falls back to `created_at` when `published_at` is absent — this is existing behaviour and is not changed by Phase 1.

**E4 — LanceDB version incompatibility with add_columns():**
If `add_columns()` is not available in the deployed lancedb version (pre-0.8), the `_get_table()` method must catch the `AttributeError` and log a loud warning: `"[LanceDBVectorStore] add_columns() not supported in this lancedb version — Phase 1 migration SKIPPED; upgrade lancedb to >= 0.8"`. Service continues without new columns; Phase 1 features are silently degraded, not crashed.

**E5 — Concurrent rag-service startup race on add_columns():**
The rag-service is a single-writer service. There is no concurrent startup scenario in the current deployment. If multiple replicas are ever added, `add_columns()` must be wrapped in a per-table file lock. Not required for Phase 1 (single instance).

---

## DDD Layer Summary

| Requirement | File | DDD Layer | Zone |
|-------------|------|-----------|------|
| FR-1 (LanceDB migration) | `apps/rag-service/infrastructure/repositories.py` | Infrastructure | dev-rag-service |
| FR-2 (IndexRequest DTO) | `apps/rag-service/application/dtos.py` | Application | dev-rag-service |
| FR-2 (AnalysisEntry model) | `apps/rag-service/domain/models.py` | Domain | dev-rag-service |
| FR-2 (LanceDB insert) | `apps/rag-service/infrastructure/repositories.py` | Infrastructure | dev-rag-service |
| FR-3 (SearchRequest DTO) | `apps/rag-service/application/dtos.py` | Application | dev-rag-service |
| FR-3 (LanceDB search filters) | `apps/rag-service/infrastructure/repositories.py` | Infrastructure | dev-rag-service |
| FR-3 (HTTP client DTOs) | `apps/mcp-server/src/infrastructure/rag/ragHttpClient.ts` | Infrastructure | dev-mcp-server |
| FR-4 (decay config) | `apps/mcp-server/mcp.config.json` | Infrastructure (config) | dev-mcp-server |
| FR-4 (search callers) | `apps/mcp-server/src/application/usecases/pollNews.ts` | Application | dev-mcp-server |
| FR-5 (ragIndex caller: news) | `apps/mcp-server/src/application/usecases/pollNews.ts` | Application | dev-mcp-server |
| FR-5 (ragIndex caller: BCTC) | `apps/mcp-server/src/application/usecases/fetchParseAndStoreBctc.ts` | Application | dev-mcp-server |
| FR-5 (sector lookup fn) | `apps/mcp-server/src/domain/services/` | Domain | dev-mcp-server |
| FR-6 (body_text column) | `apps/mcp-server/src/infrastructure/db/schema-news.ts` | Infrastructure | dev-mcp-server |

---

## Acceptance Criteria Summary (live-verifiable)

| AC ID | Zone | Verification method | Non-destructive gate |
|-------|------|--------------------|--------------------|
| AC-FR1-1 | rag-service | `await table.schema` lists 16 columns | Yes |
| AC-FR1-2 | rag-service | `count_rows()` pre = post migration | Yes — zero data loss |
| AC-FR1-3 | rag-service | `POST /search` (no new params) same result count | Yes — backward compat |
| AC-FR1-4 | rag-service | Fresh deploy: 16-col schema without migration | Yes |
| AC-FR1-5 | rag-service | Double-startup no error | Yes — idempotent |
| AC-FR2-1 | rag-service | `POST /index` (6 fields) → HTTP 200 | Yes |
| AC-FR2-2 | rag-service | `POST /index` (14 fields) → LanceDB row has all 8 new fields | Yes |
| AC-FR2-3 | rag-service | Existing index test suite passes | Yes |
| AC-FR2-4 | rag-service | `doc_type/ticker` round-trip via search | Yes |
| AC-FR3-1 | rag-service | `POST /search` (no new params) → same result set | Yes |
| AC-FR3-2 | rag-service | `ticker="VCB"` filter excludes HPG row | Yes |
| AC-FR3-3 | rag-service | `doc_type="filing"` filter works | Yes |
| AC-FR3-4 | rag-service | Invalid `depth_tier` → HTTP 400 | Yes |
| AC-FR3-5 | mcp-server | `tsc --noEmit` passes after DTO extension | Yes |
| AC-FR4-1 | mcp-server | `mcp.config.json` has 4-key `decayHalfLifeDays` | Yes |
| AC-FR4-2 | mcp-server | `pollNews.ts` passes `decay_half_life_days: 2` | Yes — source read |
| AC-FR4-3 | mcp-server | `fetchParseAndStoreBctc.ts` passes `doc_type: "filing"` | Yes — source read |
| AC-FR4-4 | rag-service | `recency_score` higher for filing vs news half-life on same 15d-old row | Yes |
| AC-FR5-1 | mcp-server | Existing `pollNews()` test suite passes | Yes |
| AC-FR5-2 | mcp-server | Live pollNews rows: `doc_type="news"`, `source_domain` non-empty | Yes — live query |
| AC-FR5-3 | mcp-server | Live BCTC rows: `doc_type="filing"`, `ticker` matches code | Yes — live query |
| AC-FR5-4 | mcp-server | `tsc --noEmit` passes for both modified files | Yes |
| AC-FR6-1 | mcp-server | `PRAGMA table_info(rag_analyses)` includes body_text | Yes — PRAGMA read |
| AC-FR6-2 | mcp-server | Row count unchanged post-restart | Yes — zero data loss |
| AC-FR6-3 | mcp-server | Existing rows have `body_text = NULL` | Yes |
| AC-FR6-4 | mcp-server | INSERT with body_text value succeeds | Yes |
| AC-FR6-5 | mcp-server | Double-restart no error (idempotent) | Yes |
| AC-FR6-6 | mcp-server | Migration runs on startup with no downtime | Yes — online ALTER |
