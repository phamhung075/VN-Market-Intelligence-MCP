package domain

import "context"

// HealthCheckerPort is the port for checking the health of a single service.
type HealthCheckerPort interface {
	CheckHealth(ctx context.Context, svc *ServiceConfig) (*ServiceHealthResult, error)
}

// ServiceRegistryPort is the port for reading the service registry.
type ServiceRegistryPort interface {
	// GetAllServices returns all services eligible for active health probing (noProbe=false).
	GetAllServices() []*ServiceConfig
	// GetService returns a service by name, or nil if not found.
	GetService(name string) *ServiceConfig
	// IsNotDeployed reports whether the named service is intentionally not deployed
	// on this host.  When true, HandleProxy will reroute through mcp-server rather
	// than forwarding to the dead service (which would 502).
	IsNotDeployed(name string) bool
}

// CapabilityProberPort probes the mcp-server for the live capability status of
// not-deployed services.  Results are cached with TTL 60s and the total number
// of probe calls per window is bounded to 7 (one per not_deployed short_key).
type CapabilityProberPort interface {
	// ProbeAll returns a capability map (short_key → ServiceCapability) for all
	// not-deployed services defined in the manifest.  Cached results are returned
	// without a new probe when the TTL has not expired.
	ProbeAll(ctx context.Context) map[string]*ServiceCapability
}
