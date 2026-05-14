// Package application contains use cases for the api-gateway.
package application

import (
	"context"

	"github.com/vn-market-intelligence/api-gateway/pkg/domain"
)

// AggregatorPort is a port for the aggregate health operation (allows test injection).
type AggregatorPort interface {
	Aggregate(ctx context.Context) (*domain.AggregatedHealth, error)
}

// AggregateHealthUseCase orchestrates the aggregate health check across all services.
type AggregateHealthUseCase struct {
	aggregator AggregatorPort
}

// NewAggregateHealthUseCase creates a new AggregateHealthUseCase backed by a domain service.
func NewAggregateHealthUseCase(service *domain.AggregateHealthService) *AggregateHealthUseCase {
	return &AggregateHealthUseCase{aggregator: service}
}

// NewAggregateHealthUseCaseFromService creates from any AggregatorPort implementation.
// Used in tests to inject mock aggregators.
func NewAggregateHealthUseCaseFromService(aggregator AggregatorPort) *AggregateHealthUseCase {
	return &AggregateHealthUseCase{aggregator: aggregator}
}

// Execute runs the aggregate health check and returns the result.
func (uc *AggregateHealthUseCase) Execute(ctx context.Context) (*domain.AggregatedHealth, error) {
	return uc.aggregator.Aggregate(ctx)
}

// ServiceHealthUseCase retrieves the health of a single named service.
type ServiceHealthUseCase struct {
	registry domain.ServiceRegistryPort
	checker  domain.HealthCheckerPort
}

// NewServiceHealthUseCase creates a new ServiceHealthUseCase.
func NewServiceHealthUseCase(registry domain.ServiceRegistryPort, checker domain.HealthCheckerPort) *ServiceHealthUseCase {
	return &ServiceHealthUseCase{registry: registry, checker: checker}
}

// Execute checks health for the named service. Returns (nil, nil) if service not found.
func (uc *ServiceHealthUseCase) Execute(ctx context.Context, serviceName string) (*domain.ServiceHealthResult, error) {
	svc := uc.registry.GetService(serviceName)
	if svc == nil {
		return nil, nil
	}
	return uc.checker.CheckHealth(ctx, svc)
}
