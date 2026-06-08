# Architecture Brief — Deep-Fetch + RAG Redesign
<!-- size-justification: 420L — two coupled pillars, brownfield evidence, options with tradeoffs, phased rollout, risks, open questions per zone. Splitting into two files would require cross-references that duplicate context. -->

**Date:** 2026-06-08
**Authored by:** Architect (brownfield + design brief)
**Task ID:** ARCH-DEEPFETCH-RAG-REDESIGN
**Status:** DESIGN COMPLETE — awaiting PO → sprint dispatch
**Zones touched:** vps-scripts/ · apps/mcp-server/src/infrastructure/rag/ · apps/rag-service/ · (read-only: system-map, watchlist)
**Out-of-scope:** apps/pdf-extractor/ (concurrent A20-EVENTLOOP-STARVATION task — no conflict expected)

---

## Brownfield State Summary

### What currently exists (verified by code read, not assumption)

**VPS shallow pipeline (vps-scripts/):**
- `fetch-vn-news.sh` — RSS cursor-based pull from 10 VN sources, pushes raw item batches to `POST /api/push-news`. Each item: `{title, url, content (RSS description), publishedAt, source}`. No article body fetch per item.
- `article-body-fetcher.py` — EXISTS on VPS but is a STANDALONE script (not wired into the push pipeline). Supports `cafef.vn` and `vneconomy.vn` via plain requests + BeautifulSoup. No systemd service, no endpoint — currently unused in the live data flow.
- `fetch-bctc.sh` — downloads BCTC PDFs only; deep content is the PDF binary.
- `fetch-reuters.sh` — fetches Reuters RSS items (shallow title/summary).

**MCP-server ingestion (pollNews.ts):**
- Receives RSS items from VPS push, normalises via `normalizeNews()`, runs VN-relevance filter, stores in `rag_analyses` SQLite table, embeds title+summary into LanceDB via `ragIndex()`.
- The `rag_analyses` SQLite schema already has columns: `level`, `source_url`, `source_title`, `source_type`, `sentiment`, `impact_score`, `impact_direction`, `confidence`, `time_horizon`, `summary`, `reasoning`, `affected_countries`, `affected_domains`, `affected_actions`, `tags`.
- Article body (full text) is NEVER fetched today — only RSS title+description snippet (typically 80-400 chars) reaches the system.

**RAG service (apps/rag-service/):**
- Model: `paraphrase-multilingual-MiniLM-L12-v2` — 384-dim, ~400MB, multilingual (VN/FR/EN).
- LanceDB table `rag_entries` schema: `{id, level, title, summary, vector[384], tags(JSON), action_code, created_at}`. No ticker, sector, source domain, depth_tier, doc_type, confidence, published_at fields.
- Search API: `POST /search {query, limit, decay_half_life_days, max_distance, level?, action_code?}`. One global half-life (default 7 days) for ALL content types.
- Filters: only `level` (global/country/domain/action) and `action_code` (ticker). No sector filter, no source filter, no doc_type filter.
- Ranking: pure vector similarity + single temporal decay. No BM25, no hybrid.
- Chunking: embedding input = action_code + title + level + tags + content joined to 2000 chars max — no structural chunking for long documents.
- Consumers: unified-agent, cascadeEngine (via `runImpactChain`), pollNews (RAG retriever for context enrichment). BCTC analyst, news-scout, market-analyst, market-watcher all ingest through the same undifferentiated index.

**Domain (watchlist + sectors from system-map.json):**
- 33 active tickers across 15 sectors (Banking, Real estate, Steel, Dairy/Agri, Tech, Aviation, Oil & Gas, Securities, Food/Bev, Chemicals, Electrical, Livestock, Pharma-adjacent).
- Sources in system-map.json `data_sources` are categorised by `category` (price/bctc/procurement/news/macro) and `proxy` (vps/vps_push). No depth_tier field today.

**Gap summary:**
- VPS fetches title+RSS snippet only; article body fetcher exists but is not wired.
- No relevance gate at VPS level — all 226 items/cycle are pushed regardless of domain relevance.
- RAG schema has zero domain-awareness fields: no ticker, sector, source, depth_tier, doc_type, confidence.
- Single global decay half-life does not differentiate fast-decay news from slow-decay filings.
- No hybrid (BM25+vector) search — keyword recall is weak for ticker/company-name queries.
- No per-consumer query pattern differentiation.

---

## PILLAR A — Tiered / Conditional Deep-Fetch

### Design Goal

When an RSS item touches our domain (watchlist ticker or domain sector), trigger a secondary fetch to retrieve the full article body — without over-fetching, without browser engines on the VPS, and without duplicating the existing push pipeline.

### Domain Definition (derived from system-map.json — never hardcoded)

```
Domain = {
  tickers: jq '.project.watchlist | map(select(.active == true)) | [.[].ticker]' system-map.json
           → ["VNM","FPT","VCB","HPG","BID","SHB","EIB","VHM","VIC","KBC","DXG","NVL","FRT",
              "DPM","VND","VJC","PLX","DAG","DBC", ...33 total]

  sectors: jq '.project.watchlist | map(select(.active == true)) | [.[].sector] | unique' system-map.json
           → 15 unique sectors
}
```

### A1 — Relevance Gate Design

**WHERE the gate runs:** Post-push on mcp-server (not on VPS).

Rationale: VPS is a dumb forwarder. Adding intelligence on VPS creates a second code path to maintain and a deploy coupling. The gate belongs in mcp-server's `pollNews.ts` or `intelligenceCycleJob.ts` — the application layer that already has the watchlist and domain models.

**Gate logic (three-signal OR):**

1. **Ticker match** — `detectStocksInText(title + snippet, allWatchlistCodes)` returns non-empty. Already implemented in `pollNews.ts` via `tickerWholeWordMatch` and `detectStocksInText`. Reuse this.
2. **Sector keyword match** — title or snippet contains a sector keyword from the active watchlist sectors (e.g. "thép", "ngân hàng", "bất động sản", "công nghệ"). A small keyword map per sector, derived at startup from `system-map.json`.
3. **Impact score threshold** — `impactScore >= 7` AND `sentiment !== 'neutral'` from `normalizeNews()` output. Already computed during ingestion.

Any one gate hit → article is flagged `depth_tier: "deep"` and queued for body fetch. Absence → `depth_tier: "shallow"`.

**Gate placement in code flow:**
```
pollNews.ts → tryInsertEntry() → [GATE CHECK] → if deep: push to deepFetchQueue (SQLite table)
```
Gate runs AFTER dedup (only newly inserted items are deep-fetched — no re-fetch of duplicates).

### A2 — Deep-Fetch Mechanism

**Key constraint from brownfield analysis:**
- VPS: lightweight HTTP only (requests/curl_cffi/httpx/cloudscraper), NO Chromium. RAM ~1GB.
- Main server: Playwright/Puppeteer/Chromium ALLOWED (rag-service zone).
- `article-body-fetcher.py` on VPS already handles `cafef.vn` and `vneconomy.vn` via plain requests — no anti-bot needed for these two.

**Source classification:**

| Source | Anti-bot | Deep-fetch executor |
|--------|----------|---------------------|
| cafef.vn, vneconomy.vn | none — plain requests | VPS (article-body-fetcher.py) |
| vnexpress.vn | simple header rotation | VPS (extend article-body-fetcher.py) |
| vietstock.vn, vietnambiz.vn, vnbusiness.vn | unknown (needs recon) | VPS attempt first; fallback main-server |
| Reuters (via news-fetch microservice) | known — Playwright on main-server | main-server (news-fetch scraper) |
| TradingEconomics | existing Chromium scraper already on main-server | main-server (tradingEconomicsChromium.js) |
| NhanDan, TuoiTre, NLD | simple RSS sources; body likely plain | VPS |

**Handoff architecture — Option R (RECOMMENDED):**

```
VPS shallow push → mcp-server (POST /api/push-news)
  ↓ pollNews.ts GATE check
  ↓ gate hit → INSERT into deep_fetch_queue table (SQLite, owned by mcp-server)
                {id, source_url, source_domain, ticker, queued_at, status: "pending", attempt: 0}
  ↓
  ↓ Two executors pull from the queue (separate cron jobs):
  │
  ├── deepFetchVpsJob.ts (new, runs every 5 min, mcp-server scheduler)
  │     Calls VPS:8765/article-body?url=<url> endpoint (extend vps-router to expose article-body-fetcher.py)
  │     VPS executes plain HTTP fetch → returns {body_text, published_at}
  │     On success: UPDATE deep_fetch_queue status="done"; ragIndex() with full body; store body in rag_analyses.body_text
  │
  └── deepFetchMainJob.ts (new, runs every 5 min, mcp-server scheduler)
        For sources where VPS endpoint returned empty/error (status="vps-failed"):
        Call news-fetch microservice (port 5008) existing Playwright infrastructure
        OR tradingEconomicsChromium.js pattern on main-server
        On success: same storage path as VPS executor
```

**Option R tradeoffs:**

| Concern | Handling |
|---------|---------|
| Dedup / idempotency | Queue INSERT OR IGNORE on `source_url UNIQUE`; status column prevents double-dispatch |
| Rate-limit / politeness | deepFetchVpsJob: max 5 requests/run, min 2s inter-request (human_delay() pattern); per-domain daily cap (config) |
| Cost / latency budget | Deep-fetch is out-of-band; does NOT block the 15-min RSS cycle. Latency = next 5-min cron. |
| Over-fetching cap | Queue entries older than 4h without success → expire (status="expired"); deep content for stale news has no value |
| Cache / no-re-fetch | `source_url UNIQUE` in queue; re-push of same article hits INSERT OR IGNORE |
| VPS RAM | article-body-fetcher.py is plain requests, ~5MB RAM per call; safe on 1GB VPS |
| Source not supported | VPS returns empty `body_text` → status set to "vps-failed" → mainserver executor picks up |

**Option A (rejected) — VPS eager deep-fetch on every article:**
Doubles VPS request volume (226 items × 2 = 452/cycle) regardless of domain relevance. No filtering means fetching bodies for sports news, US personal finance, political events. Wastes RAM/bandwidth, hits rate-limits faster. Rejected.

**Option B (rejected) — Main-server headless for all deep-fetch:**
Main-server Playwright is adequate for JS-rendered sources but unnecessary for plain-HTML VN sources. Would route 80% of articles through a 350MB headless browser when plain requests suffice. Over-engineered. Rejected.

### A3 — Anti-Over-Fetch Controls

- **Cap per cycle:** deepFetchVpsJob processes MAX 10 queue items per run (configurable in `mcp.config.json` under `deepFetch.maxPerCycle`). deepFetchMainJob cap: 5 (headless is heavier).
- **Per-domain daily rate limit:** configurable map `deepFetch.domainDailyCap` (e.g. `cafef.vn: 50`, `vneconomy.vn: 30`). Enforced via counter in SQLite `deep_fetch_stats` table.
- **No-re-deep unchanged source:** `source_url UNIQUE` + status check. A source_url that was successfully deep-fetched in the last 48h is not re-queued even if it reappears in RSS.
- **Stale expiry:** Queue rows where `queued_at < NOW() - 4h` AND `status = "pending"` are marked expired on queue drain.

### A4 — Storage Path for Deep Content

`rag_analyses` table needs one new column: `body_text TEXT` (nullable). Deep content stored here, then re-indexed into LanceDB with `depth_tier: "deep"` metadata (see Pillar B).

No separate table — the existing row gets enriched in-place. This is the recompute-on-read-beats-backfill pattern: shallow rows have `body_text = NULL`, deep rows have the full article body. The RAG re-index uses the richer text when available.

---

## PILLAR B — RAG DB Redesign for Workflow Effectiveness

### B1 — Current Schema Gaps (evidence-based)

**LanceDB `rag_entries` table today:**
```
id, level, title, summary, vector[384], tags(JSON), action_code, created_at
```

**Missing fields that every consumer needs:**
- `ticker` / `action_code` — EXISTS but is a free-text field (no constraint). Should be normalised.
- `sector` — absent. Sector-level queries (e.g. "banking sector news") require embedding similarity only. A sector filter column would enable pre-filter before vector search.
- `source_domain` — absent. Source credibility and decay rate differ by source (CafeF = fast-cycle news; BCTC filing = slow-decay authoritative).
- `depth_tier` — absent. Shallow (RSS snippet) vs deep (full article body) content. Query quality differs significantly.
- `doc_type` — absent. `news` (decays fast) vs `filing` (decays slow) vs `macro` (medium) vs `analysis_brief` (slow). Single 7-day half-life is wrong for filings.
- `published_at` — absent. `created_at` is the ingestion time, not the article publish time. Already exists in `rag_analyses.published_at` but not propagated to LanceDB.
- `confidence` — absent. Cascade confidence score from `cascadeEngine` is computed but not stored in the vector index.
- `impact_score` — absent. `rag_analyses.impact_score` exists in SQLite but not in LanceDB.

**SQLite `rag_analyses` already has** most of these fields. The gap is that only a reduced subset (`id, level, title, summary, action_code, tags`) gets propagated to LanceDB on indexing.

### B2 — Proposed LanceDB Schema (additive, no corpus re-embed required)

```
Table: "rag_entries" (v2)

EXISTING (keep, no change):
  id: TEXT
  level: TEXT          ("global"|"country"|"domain"|"action")
  title: TEXT
  summary: TEXT
  vector: ARRAY[float] (384-dim — unchanged, no re-embed needed)
  tags: TEXT           (JSON)
  action_code: TEXT    (normalised to uppercase ticker or "")
  created_at: TEXT     (ISO)

NEW COLUMNS (additive — existing rows get NULL/default, no re-embed):
  ticker: TEXT         same as action_code but explicit (backward compat)
  sector: TEXT         e.g. "Banking", "Real estate" (from watchlist lookup at index time)
  source_domain: TEXT  e.g. "cafef.vn", "vneconomy.vn", "reuters.com"
  depth_tier: TEXT     "shallow" | "deep"  (default "shallow")
  doc_type: TEXT       "news" | "filing" | "macro" | "analysis"  (default "news")
  published_at: TEXT   ISO timestamp from original article (not ingestion time)
  confidence: REAL     cascade confidence 0.0–1.0 (default 0.0)
  impact_score: REAL   0–10 (default 0.0)
```

**Migration strategy:** additive columns only. LanceDB supports schema evolution via `add_columns()`. Existing 384-dim vectors are NOT re-embedded — the vector content is unchanged; only metadata filter fields are added. This follows the recompute-on-read-beats-backfill lesson: new queries will use the new filter fields for rows indexed after migration; old rows without these fields will have NULL values and will not be excluded (they remain searchable by vector similarity).

### B3 — Chunking Strategy by doc_type

Current: all content packed into a single 2000-char embedding string (context_window_packer). This is adequate for news snippets but loses structure for filings.

**Proposed chunking by doc_type:**

| doc_type | Shallow | Deep |
|----------|---------|------|
| `news` (shallow) | Single chunk: title + snippet (current behaviour) | Single chunk: title + first 1500 chars of body |
| `news` (deep) | — | Two chunks: (1) title+lead 600 chars; (2) title+body 600-1500 chars. Stored as separate LanceDB rows with same `id` prefix + `_c1`/`_c2` suffix. |
| `filing` (BCTC) | Single chunk: title (current) | Three chunks: (1) title+summary; (2) key financials; (3) notes/commentary. BCTC already parsed into structured fields by pdf-extractor. |
| `macro` | Single chunk (current) | Single chunk |
| `analysis` | Single chunk (current) | Single chunk |

Multi-chunk indexing is an opt-in extension for deep content only. Shallow content behaviour is unchanged. Dedup logic in LanceDB search must account for multi-chunk rows sharing the same source `id`.

### B4 — Temporal Decay Tuning per doc_type

Current: single global half-life of 7 days for all content.

**Proposed decay schedule (configurable in `mcp.config.json` under `rag.decayHalfLifeDays`):**

| doc_type | Half-life | Rationale |
|----------|-----------|-----------|
| `news` | 1–3 days | Market news ages fast; a 7-day-old article rarely adds signal |
| `macro` | 7 days | Macro indicators shift slowly; a week-old reading is still relevant context |
| `filing` | 30 days | Quarterly BCTC filings remain authoritative until next quarter |
| `analysis` | 14 days | Analysis briefs stay relevant for a few weeks |

Implementation: the `SearchRequest` DTO already has `decay_half_life_days` as a per-call parameter. Consumers pass the appropriate half-life based on the `doc_type` they are querying. No schema change needed — it is a query-time parameter.

### B5 — Hybrid Search (BM25 + Vector) Recommendation

**Current:** pure vector similarity (L2 distance on 384-dim paraphrase-multilingual-MiniLM).

**Problem:** ticker symbols like "VCB", "HPG", "FPT" are short tokens that paraphrase-multilingual-MiniLM embeds poorly. A query for "VCB earnings outlook" may miss recent articles that explicitly mention "VCB" if the embedding neighbourhood is dominated by semantically similar but ticker-ambiguous content.

**Option H (RECOMMENDED) — hybrid BM25 + vector in rag-service:**
LanceDB supports full-text search (FTS) alongside vector search as of v0.8+. The recommended approach is:
1. Add an FTS index on `(title, summary)` columns in LanceDB.
2. Implement a `hybrid_search()` path in `LanceDBVectorStore`: run FTS query for keyword recall (especially tickers, company names) and vector search for semantic recall in parallel; merge via Reciprocal Rank Fusion (RRF).
3. Expose as an optional flag `POST /search {hybrid: true}` (default `false` for backward compat).

**Tradeoff:**
- Precision: BM25 boosts ticker-exact recall for chef-synthesis queries ("all recent VCB news") where the analyst knows the ticker.
- Recall: vector covers semantic similarity ("bank merger rumors" even without explicit VCB).
- Cost: FTS index adds ~10-20% storage overhead; query latency +20-40ms (acceptable on local hardware).
- Risk: LanceDB FTS API may have version-specific behaviours — feasibility probe needed by dev-rag-service before committing to this path (see open questions).

**Option V (fallback) — pre-filter by ticker/sector metadata only:**
Skip BM25. Use the new `ticker` and `sector` columns as pre-filter conditions in `VectorStorePort.search()`. This eliminates ticker-ambiguous noise without BM25 complexity. Less recall improvement but zero new dependency.

Recommendation: **Option H as Phase 2 target; Option V as Phase 1 immediate win.**

### B6 — Consumer Query Pattern Analysis

| Consumer | Query pattern | Current gap | Fix |
|----------|--------------|-------------|-----|
| unified-agent (CHEF) | "recent watchlist news + macro for synthesis" | No ticker/sector filter → noisy results | New `ticker` filter + `doc_type=news` + half-life 1d |
| cascadeEngine (runImpactChain) | "context for news article about X" | Single half-life 7d too slow | `doc_type=news`, half-life 1-3d |
| market-analyst | "sector analysis: banking fundamentals" | No sector filter | `sector=Banking` filter + `doc_type=filing`, half-life 30d |
| news-scout | "breaking news velocity on ticker" | No depth_tier awareness | `ticker=VCB`, `depth_tier=deep`, short decay |
| bctc-analyst | "quarterly filing for VCB" | `filing` content not differentiated | `doc_type=filing`, `ticker=VCB`, half-life 30d |
| qa-responder | "answer /ask question about HPG" | Mixed content types confuse ranking | Multi-doc_type query with per-type decay weighting |
| market-watcher | "signal enrichment for alert" | Only shallow snippets indexed | Deep content improves signal quality |

### B7 — Index API Changes (POST /index)

Extend `IndexRequestSchema` with optional new fields:
```python
ticker: Optional[str] = None         # uppercase, e.g. "VCB"
sector: Optional[str] = None         # from watchlist, e.g. "Banking"
source_domain: Optional[str] = None  # e.g. "cafef.vn"
depth_tier: Optional[str] = "shallow"
doc_type: Optional[str] = "news"
published_at: Optional[str] = None   # ISO timestamp
confidence: Optional[float] = 0.0
impact_score: Optional[float] = 0.0
```

All optional with defaults → fully backward-compatible. Existing callers (`ragIndex()` in pollNews.ts) continue to work without changes. New callers can pass the enriched fields.

The `mcp-server` side `ragIndex()` call in `pollNews.ts` and `fetchParseAndStoreBctc.ts` must be updated to pass the new fields once the rag-service accepts them.

---

## Phased Rollout

### Phase 1 — Metadata enrichment (no re-embed, no new services) — SPRINT S/M

**Scope:** RAG schema + index API extension + source/doc_type/ticker propagation.

1. `dev-rag-service`: add new columns to LanceDB `rag_entries` via `add_columns()` migration. Extend `IndexRequest` DTO with optional new fields. Extend `LanceDBVectorStore.search()` to accept `ticker`, `sector`, `source_domain`, `depth_tier`, `doc_type` as filter parameters.
2. `dev-mcp-server`: update `ragIndex()` calls in `pollNews.ts` and `fetchParseAndStoreBctc.ts` to pass `ticker`, `sector`, `source_domain`, `doc_type`, `published_at`, `confidence`, `impact_score`.
3. `dev-mcp-server`: configure per-`doc_type` half-life defaults in `mcp.config.json` under `rag.decayHalfLifeDays`. Update `ragSearch()` callers to pass appropriate `decay_half_life_days`.

**Risk:** Low. Additive only. Old rows remain searchable. No re-embed. Migration is online (LanceDB `add_columns` is non-blocking).

### Phase 2 — Deep-fetch pipeline — SPRINT M

**Scope:** VPS article-body endpoint + mcp-server deep-fetch queue + two executor cron jobs.

1. `dev-vps-crawls`: extend `article-body-fetcher.py` to support `vnexpress.vn`. Wire as VPS:8765 endpoint (extend vps-router). New `vn-deep-fetch.service` systemd unit (or extend existing `vn-news-fetch.service` — defer to dev-vps-crawls to evaluate RAM impact).
2. `dev-mcp-server`: add `deep_fetch_queue` and `deep_fetch_stats` SQLite tables to `schema-news.ts`. Implement gate logic in `pollNews.ts`. Implement `deepFetchVpsJob.ts` and `deepFetchMainJob.ts` cron jobs. Add `body_text` column to `rag_analyses`.
3. `dev-mcp-server`: update `ragIndex()` calls for deep-fetched content to pass `depth_tier: "deep"` and use body_text as embedding content.

**Risk:** Medium. New VPS endpoint requires recon for vnexpress.vn (dev-vps-crawls feasibility check needed). Queue saturation if gate is too loose — cap controls mitigate. VPS RAM impact of extended article-body-fetcher must be measured.

### Phase 3 — Hybrid BM25 + vector search — SPRINT M (post-Phase 1)

**Scope:** LanceDB FTS index + hybrid search path in rag-service.

1. `dev-rag-service`: feasibility probe: verify LanceDB version supports FTS + `hybrid_search()` in the deployed Docker image. Report to architect before implementation.
2. `dev-rag-service`: implement FTS index creation on `(title, summary)`. Add `hybrid_search()` to `LanceDBVectorStore`. Expose `POST /search {hybrid: bool}`.
3. `dev-mcp-server`: update chef-synthesis and bctc-analyst callers to pass `hybrid: true`.

**Risk:** Medium-high. LanceDB FTS API stability is version-dependent. Feasibility unknown until dev-rag-service probes the deployed image (open question Q3 below).

---

## Risks

| ID | Risk | Severity | Mitigation |
|----|------|----------|------------|
| R1 | Gate too loose → deep-fetch queue floods | Medium | Hard cap (maxPerCycle=10), daily domain cap, stale expiry at 4h |
| R2 | VPS RAM exhaustion from article-body requests | Medium | article-body-fetcher.py is ~5MB/request; no Playwright; monitor `free -m` after first deploy |
| R3 | VPS anti-bot on vnexpress.vn body fetch | Low-Medium | article-body-fetcher.py recon docs show plain requests work; dev-vps-crawls to verify before wiring |
| R4 | LanceDB add_columns() breaking change on current version | Low | Verify against deployed lancedb version in rag-service requirements.txt before Phase 1 commit |
| R5 | Multi-chunk LanceDB rows pollute dedup | Low | `_c1`/`_c2` suffix pattern; dedup key = source_url not LanceDB id |
| R6 | Single-writer invariant violation on rag_service.db | Low | rag-service is the sole writer (no change); mcp-server writes via HTTP POST /index only |
| R7 | Phase 1 additive columns degrade LanceDB query perf | Low | Metadata filters run pre-vector-scan; should improve not degrade throughput |
| R8 | Sector keyword map becomes stale | Low | Derive at startup from system-map.json; no hardcoding |
| R9 | deep_fetch_queue grows unbounded if executor crons fail | Medium | Stale expiry at 4h + `status="expired"` cleanup job (daily) |

---

## Open Feasibility Questions (routed to zone dev, non-blocking)

**Q1 → dev-vps-crawls:**
Does `vnexpress.vn` article body fetch work with plain requests (same technique as cafef.vn)? Does extending `article-body-fetcher.py` to cover `vnexpress.vn` require any anti-bot work? What is the typical page size (to estimate RAM per call)?

**Q2 → dev-vps-crawls:**
Can the existing `vn-news-fetch.service` be extended to include an article-body endpoint, or does a new systemd service (`vn-deep-fetch.service`) make more sense for isolation? What is the VPS current free RAM headroom?

**Q3 → dev-rag-service:**
What is the exact lancedb version in `apps/rag-service/requirements.txt`? Does it support `create_fts_index()` and `hybrid_search()` (v0.8+)? Report back before Phase 3 design is locked.

**Q4 → dev-rag-service:**
Does `add_columns()` in the deployed lancedb version work non-destructively on an existing table with data? Verify against a test LanceDB instance before Phase 1 migration is committed.

**Q5 → dev-mcp-server:**
The `rag_analyses` table does not yet have a `body_text` column. Is there a live migration path (ALTER TABLE ADD COLUMN TEXT) without data loss or service interruption? The mcp-server owns `market.db` writes exclusively — this is low risk but must be confirmed.

---

## DJ-GATE-1 Decision

**Design approach selected:** Option R (relevance-gated, two-executor deep-fetch with VPS-first, main-server fallback) for Pillar A; additive-metadata-first + per-doc_type decay + Phase 2 hybrid BM25 for Pillar B.

**Rationale:**
- Option R respects the existing push-pull architecture invariant (VPS pushes shallow, mcp-server controls orchestration). It does not add intelligence to the VPS (which would create a deploy-coupled second code path) and does not force all body-fetching through headless Chromium when plain requests suffice.
- Additive schema migration (Phase 1) delivers immediate recall/precision gains for all consumers with zero re-embed cost and zero downtime risk. The recompute-on-read-beats-backfill lesson is the governing pattern: old rows keep their existing vectors; new metadata fields enable filter pre-passes.
- BM25 hybrid is deferred to Phase 3 (post feasibility probe) — it is the highest-risk component and its benefit is marginal until the metadata filters from Phase 1 are live.

**NO branches — all work stays on main.** All schema migrations are additive (ADD COLUMN, not DROP or ALTER). Mutex-wrap any concurrent writes to shared rag-service.db and rag_analyses via the existing single-writer invariant.

---

## DDD Layer Assignments

| New Component | Zone | DDD Layer | Notes |
|--------------|------|-----------|-------|
| `deep_fetch_queue` SQLite table | mcp-server / `schema-news.ts` | infrastructure | Owned by mcp-server write path |
| `deep_fetch_stats` SQLite table | mcp-server / `schema-news.ts` | infrastructure | Per-domain daily counter |
| `deepFetchVpsJob.ts` | mcp-server / `scheduler/news-analysis/` | interface/scheduler | Calls VPS endpoint via HTTP |
| `deepFetchMainJob.ts` | mcp-server / `scheduler/news-analysis/` | interface/scheduler | Calls news-fetch or TE Chromium |
| Relevance gate logic | mcp-server / `domain/services/deepFetchGate.ts` | domain | Pure function: (title, snippet, watchlist) → bool |
| Per-domain rate counter | mcp-server / `infrastructure/db/deepFetchStatsStore.ts` | infrastructure | SQLite UPSERT counter |
| LanceDB new columns + FTS | rag-service / `infrastructure/repositories.py` | infrastructure | LanceDB adapter |
| New IndexRequest fields | rag-service / `application/dtos.py` | application | DTO extension |
| New SearchRequest filters | rag-service / `application/dtos.py` | application | DTO extension |
| VPS article-body endpoint | vps-scripts / `article-body-fetcher.py` | (VPS, not DDD) | Extend existing script |

**Golden rule check:** `deepFetchGate.ts` imports from domain only (watchlist model, stockAliases). It does NOT import from infrastructure. ✓

---

## BUILD-STANDARD Classification

- **Pillar A (deep-fetch pipeline):** `BUILD-STANDARD: lean` — new feature within existing zones (mcp-server scheduler + vps-scripts). No new microservice. ROLE-RELAY: dev-mcp-server + dev-vps-crawls + qa.
- **Pillar B (RAG schema):** `BUILD-STANDARD: lean` — enhancement within apps/rag-service/ and mcp-server HTTP client. No new service. ROLE-RELAY: dev-rag-service + dev-mcp-server + qa.

---

## Signal to PO

```
improvement_proposal / brief_complete
brief: docs/architecture-briefs/2026-06-08-deepfetch-rag-redesign.md
pillars: [DEEPFETCH-VPS-MAINSERVER-GATE, RAG-SCHEMA-HYBRID-REDESIGN]
priority: HIGH (user-requested; directly improves analysis quality for all cowork consumers)
phase1_risk: LOW (additive schema + metadata propagation)
phase2_risk: MEDIUM (new VPS endpoint + queue executor)
phase3_risk: MEDIUM-HIGH (LanceDB FTS feasibility unknown — gate on Q3 answer)
feasibility_blocks: [Q1-Q2 to dev-vps-crawls, Q3-Q4 to dev-rag-service, Q5 to dev-mcp-server]
next: po → ba → pm → dev-{vps-crawls,rag-service,mcp-server} → qa
```
