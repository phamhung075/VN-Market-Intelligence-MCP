# kinh-dich-service

**Port:** 5005 | **Language:** TypeScript/Bun | **Agent:** `dev-kinh-dich`

Hexagram readings, I-Ching trading signals, and confidence scoring.

## Architecture

- **Domain:** Hexagram models, trigram entities, trading signal types, confidence rules
- **Application:** Hexagram reading use cases, signal generation, confidence scoring
- **Infrastructure:** SQLite (market.db — readonly), hexagram computation modules
- **Interface:** HTTP handlers via Hono

## Database

- **Reads:** `market.db` (readonly) — price context for hexagram interpretation
- **Owns:** none

## Dependencies

- mcp-server provides market.db with price context

## Documentation

- `domain-model.md` — hexagram models, trigrams, signal entities
- `usecases.md` — reading computation, signal generation logic
- `infrastructure.md` — hexagram data, SQLite queries
- `api-reference.md` — HTTP endpoints
- `testing.md` — test strategy, fixtures

> Docs populated incrementally by `dev-kinh-dich` agent during implementation tasks.
