# api-gateway — Infrastructure

## HTTPHealthChecker
- **File:** `apps/api-gateway/src/infrastructure/health_checker.ts`
- Implements `HealthCheckPort`
- Uses `fetch()` with `AbortSignal.timeout(service.timeoutMs)`
- HTTP 2xx → `status: 'ok'`
- HTTP non-2xx → `status: 'degraded'` with error `HTTP ${status}`
- Network/timeout error → `status: 'down'`
- Always measures `latencyMs = Date.now() - start`

## StaticServiceRegistry
- **File:** `apps/api-gateway/src/infrastructure/health_checker.ts`
- Implements `ServiceRegistryPort`
- Built from env vars via `buildServiceConfigs()`

### Service Registry (8 services)

| Key | Default URL | Health Path | Timeout |
|-----|-------------|-------------|---------|
| `mcp` | `http://mcp-server:3000` | `/health` | 2000ms |
| `pdf` | `http://pdf-extractor:5001` | `/health` | 2000ms |
| `rag` | `http://rag-service:5002` | `/health` | 2000ms |
| `ta` | `http://technical-analysis:5003` | `/health` | 2000ms |
| `macro` | `http://macro-indicators:5004` | `/health` | 2000ms |
| `stock` | `http://stock-price:5000` | `/health` | 2000ms |
| `kinh-dich` | `http://kinh-dich-service:5005` | `/health` | 2000ms |
| `alert` | `http://alert-engine:5006` | `/health` | 2000ms |

### Environment Variables

```
MCP_URL          → http://mcp-server:3000
PDF_URL          → http://pdf-extractor:5001
RAG_URL          → http://rag-service:5002
TA_URL           → http://technical-analysis:5003
MACRO_URL        → http://macro-indicators:5004
STOCK_URL        → http://stock-price:5000
KINH_DICH_URL    → http://kinh-dich-service:5005
ALERT_URL        → http://alert-engine:5006
PORT             → 4000
```

## No Database
Stateless routing layer. No database access.
