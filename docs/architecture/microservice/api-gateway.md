# Microservice: api-gateway

**Language:** Go
**Port:** 4000 (external + internal)
**Role:** Central routing layer. Receives VPS push traffic for stock prices and foreign flow, aggregates health checks across all services, handles load balancing for inbound data pushes.

---

## DDD Layers

| Layer | Path | Responsibility |
|-------|------|----------------|
| interface | Route handlers | Inbound HTTP endpoints for VPS push traffic |
| infrastructure | Downstream HTTP clients | Health check aggregation across the microservice fleet |

This service has no domain logic. It is a pure infrastructure adapter — a thin routing and health layer.

---

## Tool Surface

api-gateway exposes no MCP tools directly. It is an internal routing service.

---

## Upstream Dependencies (data in)

| Source | How |
|--------|-----|
| Vinahost VPS `vn-price-fetch.service` | POST → routes to stock-price |
| Vinahost VPS `vn-foreign-flow.service` | POST → routes to mcp-server |

---

## Downstream Dependencies (calls out)

| Service | Port | What for |
|---------|------|----------|
| mcp-server | 3000 | Forward push data, health aggregation |
| stock-price | 5000 | Price routing |
| All 9 services | various | Health aggregation endpoint |

---

## Known Invariants

1. VPS push traffic enters through api-gateway first — mcp-server does not receive VPS traffic directly except for BCTC and news pushes (which go directly to mcp-server).
2. Health aggregation: single `/health` endpoint reports status of all 9 services.
3. No database write authority.
