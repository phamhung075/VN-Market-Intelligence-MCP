# Microservice: stock-price

**Language:** TypeScript / Bun
**Port:** 5010 (host) : 5000 (container)
**Role:** Price aggregation with 3-tier fallback. Receives VPS-pushed prices, aggregates OHLCV data, caches in `stock_price.db`, and POSTs results to mcp-server `/api/push-prices`.

---

## DDD Layers

| Layer | Path | Responsibility |
|-------|------|----------------|
| domain | Price models, fallback chain logic | 3-tier price resolution: VPS push → exchange APIs → static fallback |
| infrastructure | `stock_price.db` (sole writer), VnDirect/HNX HTTP clients, VPS push receiver | Tier-1: VPS push (60s). Tier-2: VnDirect legacy (5s) / HNX API (15s). Tier-3: CafeF banggia (10s) |
| interface | HTTP endpoints | Receive VPS push, expose price data to mcp-server |

---

## Tool Surface

No MCP tools exposed directly. Data flows via POST to mcp-server `/api/push-prices`.

Price-related MCP tools live in mcp-server: see `docs/architecture/microservice/mcp-server/market-data.md`

---

## Upstream Dependencies (data in)

| Source | How | Cadence |
|--------|-----|---------|
| Vinahost VPS `vn-price-fetch.service` | POST push | 60s (market hours Mon-Fri 02:00-08:59 UTC) |
| VnDirect API (Tier 2) | Direct HTTP (no geo-block) | On-demand fallback |
| HNX API (Tier 2) | Direct HTTP (no geo-block) | On-demand fallback |
| CafeF banggia (Tier 3) | Direct HTTP | On-demand fallback |

---

## Downstream Dependencies (calls out)

| Service | Port | What for |
|---------|------|----------|
| mcp-server | 3000 | POST /api/push-prices (aggregate results) |

---

## Database Write Authority

`stock_price.db` — sole writer. Tier-3 cache only. Results are always forwarded to mcp-server which writes to `market.db` (market_prices, ohlcv_daily tables).

---

## Known Invariants

1. Market hours: Mon-Fri 09:00-16:00 VN time = 02:00-09:00 UTC. VPS push only active during this window.
2. 3-tier fallback is ordered: VPS push (freshest) → exchange APIs → banggia (stale fallback). Never skip tier.
3. price notation: prices in VND (Vietnamese dong). OHLCV in 1000 VND units per convention.
4. Port mapping: host 5010 → container 5000 (Docker Compose standard `HOST:CONTAINER`).
