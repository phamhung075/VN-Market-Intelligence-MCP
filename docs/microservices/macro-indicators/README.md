# macro-indicators

**Port:** 5004 | **Language:** TypeScript/Bun | **Agent:** `dev-macro-indicators`

SBV FX rates, commodity prices, and macroeconomic trend analysis.

## Architecture

- **Domain:** FX rate models, commodity entities, macro trend scoring
- **Application:** Rate fetching use cases, trend analysis orchestration
- **Infrastructure:** SBV API client, commodity price fetchers, SQLite (market.db — readonly)
- **Interface:** HTTP handlers via Hono

## Database

- **Reads:** `market.db` (readonly) — historical macro data
- **Owns:** none

## Dependencies

- SBV (State Bank of Vietnam) for FX rates
- External commodity price sources
- mcp-server provides market.db

## Documentation

- `domain-model.md` — FX models, commodity entities, scoring rules
- `usecases.md` — rate fetching, trend analysis
- `infrastructure.md` — SBV API contracts, commodity fetchers
- `api-reference.md` — HTTP endpoints
- `testing.md` — test strategy, fixtures

> Docs populated incrementally by `dev-macro-indicators` agent during implementation tasks.
