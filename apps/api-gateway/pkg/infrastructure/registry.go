// Package infrastructure provides concrete implementations of domain ports.
package infrastructure

import "github.com/vn-market-intelligence/api-gateway/pkg/domain"

const defaultTimeoutMs = int64(2000)

// StaticServiceRegistry is an in-memory registry of services loaded from env config.
type StaticServiceRegistry struct {
	services       map[string]*domain.ServiceConfig
	notDeployedSet map[string]bool
}

// NewStaticServiceRegistry creates a registry with URLs from the provided map.
// Unknown keys fall back to default docker-compose service names.
// The not-deployed set defaults to empty — use NewStaticServiceRegistryWithNotDeployed
// to supply the set at construction time.
func NewStaticServiceRegistry(urls map[string]string) *StaticServiceRegistry {
	get := func(key, fallback string) string {
		if v, ok := urls[key]; ok && v != "" {
			return v
		}
		return fallback
	}

	mcpURL := get("mcp", "http://mcp-server:3000")

	services := map[string]*domain.ServiceConfig{
		"mcp":       {Name: "mcp", BaseURL: mcpURL, HealthPath: "/health", TimeoutMs: defaultTimeoutMs},
		"pdf":       {Name: "pdf", BaseURL: get("pdf", "http://pdf-extractor:5001"), HealthPath: "/health", TimeoutMs: defaultTimeoutMs},
		"rag":       {Name: "rag", BaseURL: get("rag", "http://rag-service:5002"), HealthPath: "/health", TimeoutMs: defaultTimeoutMs},
		"ta":        {Name: "ta", BaseURL: get("ta", "http://technical-analysis:5003"), HealthPath: "/health", TimeoutMs: defaultTimeoutMs},
		"macro":     {Name: "macro", BaseURL: get("macro", "http://macro-indicators:5004"), HealthPath: "/health", TimeoutMs: defaultTimeoutMs, ProxyTimeoutMs: 120000},
		"stock":     {Name: "stock", BaseURL: get("stock", "http://stock-price:5000"), HealthPath: "/health", TimeoutMs: defaultTimeoutMs},
		"kinh-dich": {Name: "kinh-dich", BaseURL: get("kinh-dich", "http://kinh-dich-service:5005"), HealthPath: "/health", TimeoutMs: defaultTimeoutMs},
		"alert":     {Name: "alert", BaseURL: get("alert", "http://alert-engine:5006"), HealthPath: "/health", TimeoutMs: defaultTimeoutMs},
		"news":      {Name: "news", BaseURL: get("news", "http://news-fetch:5008"), HealthPath: "/health", TimeoutMs: defaultTimeoutMs, ProxyTimeoutMs: 120000},
		// Virtual alias: /api/* routes to MCP server with full path preserved.
		// noProbe=true: excluded from active health probes.
		"api": {Name: "api", BaseURL: get("api", mcpURL), HealthPath: "/health", TimeoutMs: defaultTimeoutMs, NoProbe: true},
	}

	return &StaticServiceRegistry{services: services, notDeployedSet: map[string]bool{}}
}

// NewStaticServiceRegistryWithNotDeployed creates a registry exactly like
// NewStaticServiceRegistry but also initialises the not-deployed set from the
// provided slice.  Pass the same slice that was parsed from the
// NOT_DEPLOYED_SERVICES environment variable so that both the health-aggregation
// domain service and the proxy rerouter share one SSOT.
func NewStaticServiceRegistryWithNotDeployed(urls map[string]string, notDeployed []string) *StaticServiceRegistry {
	r := NewStaticServiceRegistry(urls)
	ndSet := make(map[string]bool, len(notDeployed))
	for _, key := range notDeployed {
		ndSet[key] = true
	}
	r.notDeployedSet = ndSet
	return r
}

// IsNotDeployed reports whether the named service is in the not-deployed set.
// When true, HandleProxy will reroute to the mcp-server fallback instead of
// forwarding to the dead microservice.
// Deploying the real service and removing it from NOT_DEPLOYED_SERVICES env var
// restores direct routing without a code change.
func (r *StaticServiceRegistry) IsNotDeployed(name string) bool {
	return r.notDeployedSet[name]
}

// GetAllServices returns services eligible for active health probing (NoProbe=false).
func (r *StaticServiceRegistry) GetAllServices() []*domain.ServiceConfig {
	result := make([]*domain.ServiceConfig, 0, len(r.services))
	for _, svc := range r.services {
		if !svc.NoProbe {
			result = append(result, svc)
		}
	}
	return result
}

// GetService returns a service by name, or nil if not found.
func (r *StaticServiceRegistry) GetService(name string) *domain.ServiceConfig {
	return r.services[name]
}
