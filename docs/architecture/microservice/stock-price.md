# Microservice: stock-price

**Language:** Go 1.22 (CGO — mattn/go-sqlite3)
**Port:** 5010 (host) : 5000 (container)
**Role:** Price aggregation with 3-tier fallback. Fetches prices via concurrent tier waterfall, caches results in `stock_price.db` (Tier 3 WAL), and serves HTTP API to mcp-server.

---

## DDD Layers

| Layer | Path | Responsibility |
|-------|------|----------------|
| domain | `pkg/domain/` | PriceQuote model, ResolvePriceService (concurrent tier waterfall), PriceFetcherPort + PriceHistoryPort interfaces |
| application | `pkg/application/` | FetchPriceUseCase, PriceHistoryUseCase, DTOs |
| infrastructure | `pkg/infrastructure/` | Tier1/Tier2 net/http fetchers, Tier3 mattn/go-sqlite3 cache (readonly market.db + write stock_price.db) |
| interface | `pkg/interface/http/` | net/http handlers: POST /price/fetch, GET /price/history, GET /health |
| entrypoint | `cmd/server/main.go` | DDD wiring, slog startup, ListenAndServe |

---

## Tool Surface

No MCP tools exposed directly. mcp-server calls this service via `infrastructure/microservices/clients.ts`. Go service responds with identical JSON shape.

Price-related MCP tools live in mcp-server: see `docs/architecture/microservice/mcp-server/market-data.md`

---

## Upstream Dependencies (data in)

| Source | How | Cadence |
|--------|-----|---------|
| VnDirect api-finfo (Tier 1) | net/http GET | On-demand (concurrent with Tier 2+3) |
| VnDirect Legacy finfo-api (Tier 2) | net/http GET | On-demand fallback |
| market.db SQLite cache (Tier 3) | mattn/go-sqlite3 readonly WAL | On-demand fallback |

---

## Downstream Dependencies (calls out)

| Service | Port | What for |
|---------|------|----------|
| mcp-server | 3000 | Called by mcp-server (stock-price is downstream, not upstream here) |

---

## Database Write Authority

`stock_price.db` — sole writer. Tier-3 cache only. SaveQuote is fire-and-forget.
`market.db` — readonly (DSN: `?mode=ro&_journal_mode=WAL&_busy_timeout=5000`). Source for Tier 3 price lookup.

---

## Known Invariants

1. Market hours: Mon-Fri 09:00-16:00 VN time = 02:00-09:00 UTC.
2. 3-tier fallback is concurrent: all tiers run via goroutines, first success wins.
3. Price notation: prices in VND. OHLCV in standard units.
4. Port mapping: host 5010 → container 5000.
5. CGO required: Docker build uses `golang:1.22-alpine` + `apk add gcc musl-dev`.
6. WAL concurrency: AC-8 proven — 100-iter concurrent R/W zero SQLITE_BUSY.
