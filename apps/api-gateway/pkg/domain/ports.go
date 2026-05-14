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
}
