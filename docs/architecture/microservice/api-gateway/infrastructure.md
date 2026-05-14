# api-gateway — Infrastructure

## HTTPHealthChecker
- **File:** `apps/api-gateway/pkg/infrastructure/healthchecker.go`
- Implements `HealthCheckerPort`
- Uses `net/http` client with `context.WithTimeout` for per-service deadline
- HTTP 2xx → `StatusOk`
- HTTP non-2xx → `StatusDegraded` with error `"HTTP <status>"`
- Network/timeout error → `StatusDown`
- Always measures `LatencyMs = time.Since(start).Milliseconds()`

## StaticServiceRegistry
- **File:** `apps/api-gateway/pkg/infrastructure/registry.go`
- Implements `ServiceRegistryPort`
- Built from env vars via `NewStaticServiceRegistry(urls map[string]string)`
- `GetAllServices()` returns only probeable services (filters `NoProbe: true` entries)
- `GetService(name)` always resolves including virtual aliases

### Service Registry (9 real + 1 virtual alias)

| Key | Default URL | Health Path | Timeout | NoProbe |
|-----|-------------|-------------|---------|---------|
| `mcp` | `http://mcp-server:3000` | `/health` | 2000ms | — |
| `pdf` | `http://pdf-extractor:5001` | `/health` | 2000ms | — |
| `rag` | `http://rag-service:5002` | `/health` | 2000ms | — |
| `ta` | `http://technical-analysis:5003` | `/health` | 2000ms | — |
| `macro` | `http://macro-indicators:5004` | `/health` | 2000ms | — |
| `stock` | `http://stock-price:5000` | `/health` | 2000ms | — |
| `kinh-dich` | `http://kinh-dich-service:5005` | `/health` | 2000ms | — |
| `alert` | `http://alert-engine:5006` | `/health` | 2000ms | — |
| `news` | `http://news-fetch:5008` | `/health` | 2000ms | — |
| `api` *(virtual)* | same as `MCP_URL` | `/health` | 2000ms | `true` |

**Virtual alias `api`:** Routes `/api/*` to MCP server with the full path preserved verbatim
(e.g. `/api/push-news` → MCP receives `/api/push-news`, no prefix stripped).
Excluded from health probes — MCP is already probed under the `mcp` key.

### ServiceConfig — NoProbe field

`NoProbe` is a field directly on `domain.ServiceConfig` (not a separate extended type):

```go
// ServiceConfig holds the configuration for a single downstream service.
// NoProbe=true marks virtual aliases excluded from active health probes.
type ServiceConfig struct {
    Name       string
    BaseURL    string
    HealthPath string
    TimeoutMs  int64
    NoProbe    bool // virtual alias services: excluded from health probes
}
```

### Environment Variables

```
MCP_URL          → http://mcp-server:3000   (also used for api virtual alias)
PDF_URL          → http://pdf-extractor:5001
RAG_URL          → http://rag-service:5002
TA_URL           → http://technical-analysis:5003
MACRO_URL        → http://macro-indicators:5004
STOCK_URL        → http://stock-price:5000
KINH_DICH_URL    → http://kinh-dich-service:5005
ALERT_URL        → http://alert-engine:5006
NEWS_URL         → http://news-fetch:5008
PORT             → 4000
```

## No Database
Stateless routing layer. No database access.
