# stock-price

**Port:** 5010:5000 | **Language:** TypeScript/Bun | **Agent:** `dev-stock-price`

Price aggregation with 3-tier fallback: VPS bridge → exchange APIs → local cache.

## Architecture

- **Domain:** Price models, ticker entities, exchange definitions (HOSE/HNX/UPCOM)
- **Application:** Price fetching use cases, fallback orchestration
- **Infrastructure:** VPS bridge HTTP client, exchange API fetchers, SQLite (stock_price.db — write)
- **Interface:** HTTP handlers via Hono

## Database

- **Owns:** `stock_price.db` (read-write — Tier3 cache)
- Posts aggregated prices to mcp-server via HTTP

## Dependencies

- VPS bridge (Vinahost Vietnam) for geo-blocked exchange data
- mcp-server (:3000) — posts results upstream

## Documentation

- `domain-model.md` — price entities, ticker models, exchange rules
- `usecases.md` — 3-tier fetch logic, fallback orchestration
- `infrastructure.md` — VPS bridge config, exchange API contracts, cache schema
- `api-reference.md` — HTTP endpoints
- `testing.md` — test strategy, fixtures

> Docs populated incrementally by `dev-stock-price` agent during implementation tasks.
