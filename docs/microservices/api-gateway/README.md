# api-gateway

**Port:** 4000 | **Language:** TypeScript/Bun | **Agent:** `dev-api-gateway`

Central routing and health aggregation for all 8 downstream services.

## Architecture

- **Domain:** Health status models, service registry definitions
- **Application:** Health check aggregation, request routing use cases
- **Infrastructure:** HTTP clients to all services, Hono routing
- **Interface:** HTTP handlers for routing and health endpoints

## Database

- **Owns:** none (stateless routing layer)

## Dependencies

Routes to and monitors health of:
- mcp-server (:3000), stock-price (:5010), pdf-extractor (:5001)
- rag-service (:5002), technical-analysis (:5003), macro-indicators (:5004)
- kinh-dich-service (:5005), alert-engine (:5006)

## Documentation

- `domain-model.md` — health models, service definitions
- `usecases.md` — routing logic, health aggregation
- `infrastructure.md` — HTTP clients, config
- `api-reference.md` — gateway endpoints
- `testing.md` — test strategy, fixtures

> Docs populated incrementally by `dev-api-gateway` agent during implementation tasks.
