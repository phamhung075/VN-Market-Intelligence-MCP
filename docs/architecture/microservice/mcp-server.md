# Microservice: mcp-server

**Language:** TypeScript / Bun
**Port:** 3000 (external + internal)
**Role:** MCP gateway — the single public interface for all tool calls. Owns the business domain (domain services, schedulers, DB write authority for market.db). All other services are downstream HTTP dependencies.

---

## DDD Layers

| Layer | Path | Responsibility |
|-------|------|----------------|
| domain | `src/domain/` | Models, repository interfaces (ports), domain services (cascadeEngine, signalDetector, alertGenerator, kinhDich, financialReports, etc.) |
| application | `src/application/usecases/` | Use cases: assembleBriefing, fetchParseAndStoreBctc, pollNews, runImpactChain, scanMarket, exportPortfolioSnapshot, etc. |
| infrastructure | `src/infrastructure/` | SQLite (schema.ts + 8 slices), LanceDB, fetchers (VPS-proxied + direct), Telegram notifier, microservice HTTP clients, fileStore, circuit breakers, RAG embeddings |
| interface | `src/interface/mcp/` | MCP server factory, SSE transport, tool registry (all tools registered here via registry.ts) |
| scheduler | `src/scheduler/` | scheduler files: see `docs/data/project-stats.json` → `schedulerFileCount`; cron registration via jobs.ts |

**Key invariant:** `domain/` never imports from `infrastructure/`. Repository interfaces live in `domain/repositories/`; SQLite implementations in `infrastructure/db/repositories/`.

---

## Tool Surface

Tool files are grouped by domain module. See sub-files:

- `docs/architecture/microservice/mcp-server/market-data.md`
- `docs/architecture/microservice/mcp-server/financial-reports.md`
- `docs/architecture/microservice/mcp-server/news-analysis.md`
- `docs/architecture/microservice/mcp-server/alerts.md`
- `docs/architecture/microservice/mcp-server/portfolio.md`
- `docs/architecture/microservice/mcp-server/briefings.md`
- `docs/architecture/microservice/mcp-server/macro.md`
- `docs/architecture/microservice/mcp-server/sector.md`
- `docs/architecture/microservice/mcp-server/kinhdich.md`
- `docs/architecture/microservice/mcp-server/system.md`
- `docs/architecture/microservice/mcp-server/analysis.md`
- `docs/architecture/microservice/mcp-server/backtesting.md`

Total tool count: `docs/data/project-stats.json` → `toolCount`

Individual tool signatures: `docs/agents/tools/list/<tool>.md`

---

## Upstream Dependencies (data in)

| Source | How | Cadence |
|--------|-----|---------|
| Vinahost VPS | HTTP POST /api/push-prices, /api/push-bctc-pdf, /api/push-news | 60s / 6h / 15min |
| Polymarket | Direct REST | 30min |
| Yahoo Finance | Direct scrape | Per job |
| Trading Economics | Direct scrape | Per job |

---

## Downstream Dependencies (calls out)

| Service | Port | What for |
|---------|------|----------|
| stock-price | 5000 | Price aggregation, 3-tier fallback |
| technical-analysis | 5003 | RSI, MACD, Bollinger Bands |
| macro-indicators | 5004 | SBV FX, macro snapshot |
| kinh-dich-service | 5005 | Hexagram readings |
| alert-engine | 5006 | Signal evaluation |
| pdf-extractor | 5001 | BCTC OCR parsing |
| rag-service | 5002 | Semantic search, embeddings |

HTTP clients: `src/infrastructure/microservices/clients.ts`

---

## Database Write Authority

`market.db` — sole writer. Contains: market_prices, ohlcv_daily, foreign_flow, financial_reports, news_items, alerts, positions, pnl_snapshots, macro_indicators, briefing_log, cron_job_runs, agent_work_log, kinhdich_readings, prediction_*, agent_signals, evidence_items.

Schema: `src/infrastructure/db/schema.ts` (public API) backed by 8 slice files.

---

## Scheduler (Cron Jobs)

Cron count: `docs/data/project-stats.json` → `cronJobCount`
Scheduler files: `docs/data/project-stats.json` → `schedulerFileCount`
Cron registry: `docs/standards/cron-jobs.md` → `docs/data/cron-registry.json`

Master registration: `src/scheduler/jobs.ts`

---

## Known Invariants

1. All MCP tools registered at bootstrap in `src/interface/mcp/tools/registry.ts`. New tool = add to registry.
2. `server.ts` bootstrap: MCP tools + scheduler start together. No lazy registration.
3. Cowork agents access tools via SSE (`/sse` endpoint). CLI cron agents access tools via StreamableHTTP (`/mcp` endpoint — stateless, no session dependency).
4. Circuit breakers wrap all external HTTP calls (fetchers + microservice clients).
5. Alert verdict lifecycle: pending → confirmed | false_positive via `verdictResolutionJob.ts` (hourly, minute=7). Full policy: `docs/policies/alert-policy.md`.
6. fileStore (`src/infrastructure/fileStore/alertVerdictStore.ts`) is the primary write target for pending verdicts. verdictResolutionJob reads from fileStore before writing outcome to `agent_signals.outcome` DB column.
