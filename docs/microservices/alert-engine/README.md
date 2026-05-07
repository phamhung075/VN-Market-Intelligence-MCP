# alert-engine

**Port:** 5006 | **Language:** TypeScript/Bun | **Agent:** `dev-alert-engine`

Multi-source signal evaluation, deduplication, cooldown, and Telegram alert distribution.

## Architecture

- **Domain:** Alert models, signal types, cooldown rules, dedup strategies
- **Application:** Signal evaluation use cases, alert dispatch orchestration
- **Infrastructure:** SQLite (alert_engine.db — write), Telegram Bot API client
- **Interface:** HTTP handlers via Hono

## Database

- **Owns:** `alert_engine.db` (read-write) — alert state, dedup tracking, cooldown timers
- Posts results to mcp-server via HTTP

## Dependencies

- Receives signals from TA, BB, macro, and news sources
- Telegram Bot API for alert distribution
- mcp-server (:3000) — posts results upstream

## Documentation

- `domain-model.md` — alert entities, signal types, cooldown rules
- `usecases.md` — signal evaluation, dedup logic, dispatch orchestration
- `infrastructure.md` — alert_engine.db schema, Telegram API integration
- `api-reference.md` — HTTP endpoints
- `testing.md` — test strategy, fixtures

> Docs populated incrementally by `dev-alert-engine` agent during implementation tasks.
