> Parent: [./restart-policy.md](./restart-policy.md)

# Restart Policy — Rationale

Why Docker-Compose is the only allowed restart mechanism.

## Deterministic State

All services restart clean, no half-loaded modules, no stale closures.

## Clean SQLite State

Single shared database, circuit breaker registry + WAL checkpoint initialized at startup.

## Service Isolation

Failure in one service doesn't pollute another.

## Lockstep Restart

Data consistency across price fetch, BCTC parser, RAG indexer, etc.

## Easy Health Check

`docker-compose ps` shows all services' status.

---

## Banned Hot-Reload Mechanisms

All hot/live/fast reload in containers are FORBIDDEN:
- `bun --hot` — causes race conditions in SQLite
- `bun --watch` — doesn't restart circuit breakers
- `nodemon` — incompatible with Docker signals
- `pm2` — not Docker-native
- `forever` — legacy, adds extra process layer
- `node --watch` — no service isolation

Each causes different failure modes (hung connections, stale file handles, WAL corruption). Docker-compose eliminates all of them.
