// Package domain contains pure value objects and interfaces for the api-gateway.
// Zero I/O — no external dependencies.
package domain

// HealthStatus represents the health state of a service.
type HealthStatus string

const (
	StatusOk          HealthStatus = "ok"
	StatusDegraded    HealthStatus = "degraded"
	StatusDown        HealthStatus = "down"
	StatusNotDeployed HealthStatus = "not_deployed"
)

// ServiceHealthResult is the health result for a single downstream service.
type ServiceHealthResult struct {
	Service   string       `json:"service"`
	Status    HealthStatus `json:"status"`
	LatencyMs int64        `json:"latencyMs"`
	Error     string       `json:"error,omitempty"`
}

// AggregatedHealth is the aggregated health response across all services.
type AggregatedHealth struct {
	Status    HealthStatus            `json:"status"`
	Services  map[string]HealthStatus `json:"services"`
	Latencies map[string]int64        `json:"latencies"`
	CheckedAt string                  `json:"checkedAt"`
}

// ServiceConfig holds the configuration for a single downstream service.
type ServiceConfig struct {
	Name           string
	BaseURL        string
	HealthPath     string
	TimeoutMs      int64
	ProxyTimeoutMs int64 // overrides TimeoutMs*5 for slow scrapers; 0 = use default
	NoProbe        bool  // virtual alias services: excluded from health probes
}
