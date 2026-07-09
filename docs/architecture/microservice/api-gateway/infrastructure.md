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

| Key | Default URL | Health Path | Health Timeout | Effective Proxy Timeout | NoProbe |
|-----|-------------|-------------|-----------------|--------------------------|---------|
| `mcp` | `http://mcp-server:3000` | `/health` | 2000ms | 10000ms (2000×5, default) | — |
| `pdf` | `http://pdf-extractor:5001` | `/health` | 2000ms | 10000ms (default) | — |
| `rag` | `http://rag-service:5002` | `/health` | 2000ms | 10000ms (default) | — |
| `ta` | `http://technical-analysis:5003` | `/health` | 2000ms | 10000ms (default) | — |
| `macro` | `http://macro-indicators:5004` | `/health` | 2000ms | 120000ms (explicit `ProxyTimeoutMs` override — slow scraper) | — |
| `stock` | `http://stock-price:5000` | `/health` | 2000ms | 10000ms (default) | — |
| `kinh-dich` | `http://kinh-dich-service:5005` | `/health` | 2000ms | 10000ms (default) | — |
| `alert` | `http://alert-engine:5006` | `/health` | 2000ms | 10000ms (default) | — |
| `news` | `http://news-fetch:5008` | `/health` | 2000ms | 120000ms (explicit `ProxyTimeoutMs` override — slow scraper) | — |
| `api` *(virtual)* | same as `MCP_URL` | `/health` | 2000ms | 10000ms (default) | `true` |

**Virtual alias `api`:** Routes `/api/*` to MCP server with the full path preserved verbatim
(e.g. `/api/push-news` → MCP receives `/api/push-news`, no prefix stripped).
Excluded from health probes — MCP is already probed under the `mcp` key.

### ServiceConfig — NoProbe, PreservePath, and proxy-timeout fields

`NoProbe`, `PreservePath`, and the proxy-timeout fields are directly on `domain.ServiceConfig`
(not a separate extended type):

```go
// DefaultProxyTimeoutMultiplier is the factor applied to TimeoutMs to derive the
// proxied-request timeout budget when ProxyTimeoutMs is not explicitly set.
const DefaultProxyTimeoutMultiplier = 5

// ServiceConfig holds the configuration for a single downstream service.
// NoProbe=true marks virtual aliases excluded from active health probes.
type ServiceConfig struct {
    Name           string
    BaseURL        string
    HealthPath     string
    TimeoutMs      int64
    ProxyTimeoutMs int64 // overrides TimeoutMs*DefaultProxyTimeoutMultiplier; 0 = use default
    NoProbe        bool  // virtual alias services: excluded from health probes
    PreservePath   bool  // forward the full request path verbatim (don't strip /:service)
}

// EffectiveProxyTimeoutMs resolves the per-request proxy timeout budget (ms).
// HandleProxy (pkg/interface/http/proxy.go) calls this instead of inlining the
// override/multiplier fallback arithmetic itself.
func (s *ServiceConfig) EffectiveProxyTimeoutMs() int64
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
