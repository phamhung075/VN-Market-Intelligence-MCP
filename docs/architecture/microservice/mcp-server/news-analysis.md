# Tool Group: news-analysis (mcp-server)

**Module path:** `src/interface/mcp/tools/news-analysis/`
**Scheduler:** `src/scheduler/news-analysis/` (5 jobs)
**Domain services:** cascadeEngine, sentimentClassifier, newsNormalizer, chainSynthesizer, sourceHealthTracker, sentimentTrend, embeddingTextBuilder

Individual tool signatures: `.claude/tools/list/<tool>.md`

---

## Tools

| Tool | Purpose | Key inputs | Downstream |
|------|---------|-----------|-----------|
| `fetch_and_analyze` | Fetch news for ticker and run cascade analysis | ticker, query | market.db (news_items) + rag-service |
| `search_similar_context` | Semantic RAG search on stored news/reports | query, limit | rag-service (HTTP) |
| `run_impact_chain` | Run cascade impact chain from a news item | news_id or text | cascadeEngine domain svc |
| `get_sentiment_trend` | Sentiment trend for ticker/market over N days | ticker?, days | market.db (rag_analyses, cascade_*) |
| `get_cascade_metrics` | Cascade engine performance metrics | — | market.db (cascade_*) |
| `get_cascade_outcomes` | Cascade chain outcomes by ticker | ticker? | market.db (cascade_*) |
| `get_open_chain_findings` | Open (unresolved) cascade chain findings | — | market.db (signals, cascade_*) |
| `get_source_health` → `get_system_status` | News source health (merged into system status) | — | market.db |
| `get_broker_credibility` | Broker credibility score from news/sanctions | broker | market.db |

---

## Scheduler Jobs

| Job | Cadence | Purpose |
|-----|---------|---------|
| `intelligenceCycleJob` | Every 15min | Main news cycle: fetch → parse → embed → cascade |
| `dataAuditJob` | Hourly | Audit data freshness, prune stale NULL-outcome signals |
| `evidenceAccumulatorJob` | Every 30min | Accumulate evidence items for open chains |
| `patternWatchJob` | Every 6h | Detect recurring patterns in cascade outcomes |
| `sscCheckerJob` | Daily | Check SSC for new regulatory filings |

---

## Data Flow

```
VPS push (POST /api/push-news, 226 items/15min cycle from 10 sources)
  → newsNormalizer
  → embeddingTextBuilder
  → rag-service (embed + store in LanceDB)
  → SQLite news_items
  → cascadeEngine (impact scoring, chain detection)
  → signalDetector (adaptive thresholds)
  → alertGenerator → alertDedup / alertCooldown → Alert
```

---

---

## Dashboard (NF-LD-4 — served from mcp-server)

**Served URL:** `http://localhost:3000/dashboards/news-fetch/`

mcp-server serves the news-fetch pilot dashboard statically at the route above. The dashboard provides:
- 3 sandbox PASS/FAIL panels (Primitives / Module / Microservice) — rendered from committed `data.js` sidecar
- 1 Live Data panel — fetches `GET /api/news-fetch/live` (relative, same-origin) to show recent `rag_analyses` rows for Reuters/Bloomberg

**Static files location:** `apps/mcp-server/src/interface/news-fetch-dashboard/`
- `index.html` — GENERATED copy (relative ENDPOINT); canonical source: `apps/news-fetch/dashboard/index.html`
- `data.js`, `rerun-handler.js`, `results.json` — verbatim copies

**Sync script:** `apps/mcp-server/sync-news-fetch-dashboard.sh` (also: `bun run sync-news-fetch-dashboard`)
- Copies verbatim assets, rewrites ENDPOINT to relative, injects GENERATED header
- Run after any change to `apps/news-fetch/dashboard/` to keep copies in sync

**Architecture decision (NF-LD-4-design):** Option B — served from mcp-server (same-origin as `rag_analyses` data and the `/api/news-fetch/live` endpoint). No CORS, no Dockerfile change (existing `COPY apps/mcp-server/src/ ./src/` includes the new subdirectory). Handler: `newsFetchDashboardHandler.ts` (DDD interface layer — no db parameter, no getDb(), no credentials).

**Security:** static files contain zero credentials, zero API keys. Live endpoint is SELECT-only (frozen from NF-LD-2a). file:// degrade branch stays as graceful fallback.

---

## Invariants

1. 10 news sources: CafeF (2), VnExpress, VnEconomy, Vietstock (3), VietnamBiz, VnBusiness, TuoiTre, NhanDan (2), NLD. BaoDauTu: INVESTIGATE (0 items — parsing issue task 1185).
2. Cascade engine: causal cascade framework from `docs/standards/market-analysis.md`.
3. `search_similar_context` uses multilingual-MiniLM embeddings (384-dim, local ONNX via rag-service).
4. `dataAuditJob` prunes stale NULL-outcome `agent_signals` (moved to dataAuditJob from separate pruner — 1863h).
