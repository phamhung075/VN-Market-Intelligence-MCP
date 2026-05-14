# api-gateway — Domain Model

## Types

### HealthStatus
```go
// HealthStatus represents the health state of a service.
type HealthStatus string

const (
    StatusOk       HealthStatus = "ok"
    StatusDegraded HealthStatus = "degraded"
    StatusDown     HealthStatus = "down"
)
```

### ServiceHealthResult
```go
// ServiceHealthResult is the health result for a single downstream service.
type ServiceHealthResult struct {
    Service   string       `json:"service"`
    Status    HealthStatus `json:"status"`
    LatencyMs int64        `json:"latencyMs"`
    Error     string       `json:"error,omitempty"`
}
```

### AggregatedHealth
```go
// AggregatedHealth is the aggregated health response across all services.
type AggregatedHealth struct {
    Status    HealthStatus            `json:"status"`
    Services  map[string]HealthStatus `json:"services"`
    Latencies map[string]int64        `json:"latencies"`
    CheckedAt string                  `json:"checkedAt"`
}
```

### ServiceConfig
```go
// ServiceConfig holds the configuration for a single downstream service.
type ServiceConfig struct {
    Name       string
    BaseURL    string
    HealthPath string
    TimeoutMs  int64
    NoProbe    bool // virtual alias services: excluded from health probes
}
```

## Repository Ports

### HealthCheckerPort
```go
// HealthCheckerPort is the port for checking the health of a single service.
type HealthCheckerPort interface {
    CheckHealth(ctx context.Context, svc *ServiceConfig) (*ServiceHealthResult, error)
}
```

### ServiceRegistryPort
```go
// ServiceRegistryPort is the port for reading the service registry.
type ServiceRegistryPort interface {
    // GetAllServices returns all services eligible for active health probing (NoProbe=false).
    GetAllServices() []*ServiceConfig
    // GetService returns a service by name, or nil if not found.
    GetService(name string) *ServiceConfig
}
```

## Domain Service

### AggregateHealthService
- **File:** `apps/api-gateway/pkg/domain/services.go`
- Constructor: `NewAggregateHealthService(checker HealthCheckerPort, registry ServiceRegistryPort) *AggregateHealthService`
- Method: `Aggregate(ctx context.Context) (*AggregatedHealth, error)`

**Logic:**
1. Fans out health checks to all configured downstream services via goroutines + `sync.WaitGroup`
2. Maps failed checks to `Status: StatusDown`, `LatencyMs: -1`
3. Overall status:
   - All ok → `StatusOk`
   - All down → `StatusDown`
   - Mixed → `StatusDegraded`
4. Returns `AggregatedHealth` with RFC3339Nano timestamp (`time.Now().UTC()`)
