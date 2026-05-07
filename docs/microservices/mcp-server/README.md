# mcp-server

**Port:** 3000 | **Language:** TypeScript/Bun | **Agent:** `dev-mcp-server`

Central MCP gateway — 200+ MCP tools, 47 cron jobs, market data orchestration for HOSE/HNX/UPCOM.

## Architecture

- **Domain:** 85+ services — signal detection, financial analysis, macro modeling, alert lifecycle, Kinh Dich hexagrams, sector rotation, correlation, foreign flow
- **Application:** 28 use cases — market scan, BCTC extraction, briefing assembly, backtesting, impact chain simulation, crisis early warning
- **Infrastructure:** 41 fetchers (VnDirect, FRED, Yahoo Finance, RSS, SSC, SBV), 40+ SQLite tables, 6 repositories, 40+ specialized stores, circuit breaker, rate limiter
- **Interface:** 200+ MCP tools across 13 categories, 47 scheduled cron jobs, 3 HTTP push endpoints

## Database

- **Owns:** `market.db` (read-write) — single writer, all other services read-only
- **Volume:** `market_data:/app/data` (shared)

## Dependencies

Orchestrates all 8 downstream services via HTTP:
- stock-price (:5010), pdf-extractor (:5001), rag-service (:5002)
- technical-analysis (:5003), macro-indicators (:5004), kinh-dich-service (:5005)
- alert-engine (:5006), api-gateway (:4000)

## Documentation

- `domain-model.md` — entities, value objects, repository interfaces
- `usecases.md` — use case catalog, DTOs, orchestration
- `infrastructure.md` — DB schema, fetchers, external APIs
- `api-reference.md` — MCP tools, HTTP endpoints
- `testing.md` — test strategy, fixtures, run commands

> Docs contain specific details: real function names, SQL schemas, API contracts, cron intervals, thresholds. Updated by `dev-mcp-server` agent.
