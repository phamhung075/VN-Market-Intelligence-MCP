# technical-analysis

**Port:** 5003 | **Language:** TypeScript/Bun | **Agent:** `dev-technical-analysis`

RSI, MACD, Bollinger Bands, moving averages calculation from market.db.

## Architecture

- **Domain:** Indicator models, signal types, crossover detection rules
- **Application:** Indicator calculation use cases, signal generation
- **Infrastructure:** SQLite (market.db — readonly), calculator modules
- **Interface:** HTTP handlers via Hono

## Database

- **Reads:** `market.db` (readonly) — price data for indicator computation
- **Owns:** none

## Dependencies

- mcp-server provides market.db with price data

## Documentation

- `domain-model.md` — indicator models, signal entities, business rules
- `usecases.md` — calculation pipelines, signal generation logic
- `infrastructure.md` — SQLite queries, calculator implementations
- `api-reference.md` — HTTP endpoints for each indicator
- `testing.md` — test strategy, fixtures, numerical precision

> Docs populated incrementally by `dev-technical-analysis` agent during implementation tasks.
