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

// CapabilityStatus represents the MCP capability state of a not-deployed service.
// This is an additive axis — only meaningful for services in not_deployed_by_design.
// It NEVER overrides the container-axis status for genuinely-deployed services.
type CapabilityStatus string

const (
	// CapabilityLive means the designated probe tool returned a valid response.
	CapabilityLive CapabilityStatus = "live"
	// CapabilityDataLimited means the probe responded but data is partial/stale.
	CapabilityDataLimited CapabilityStatus = "data_limited"
	// CapabilityDark means the capability is not probed or returned no useful data.
	CapabilityDark CapabilityStatus = "dark"
	// CapabilityNA means not applicable (e.g. mcp itself).
	CapabilityNA CapabilityStatus = "n/a"
)

// ServiceCapability is the per-service capability enrichment added to AggregatedHealth.
type ServiceCapability struct {
	Capability CapabilityStatus `json:"capability"`
	// Note is an optional human-readable explanation (e.g. "30/35 candles available").
	Note string `json:"capabilityNote,omitempty"`
}

// ServiceHealthResult is the health result for a single downstream service.
type ServiceHealthResult struct {
	Service   string       `json:"service"`
	Status    HealthStatus `json:"status"`
	LatencyMs int64        `json:"latencyMs"`
	Error     string       `json:"error,omitempty"`
}

// AggregatedHealth is the aggregated health response across all services.
type AggregatedHealth struct {
	Status       HealthStatus                  `json:"status"`
	Services     map[string]HealthStatus       `json:"services"`
	Latencies    map[string]int64              `json:"latencies"`
	Capabilities map[string]*ServiceCapability `json:"capabilities,omitempty"`
	CheckedAt    string                        `json:"checkedAt"`
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
