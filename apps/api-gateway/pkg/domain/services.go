package domain

import (
	"context"
	"sync"
	"time"

	osc "github.com/vn-market-intelligence/api-gateway/pkg/primitive/overall-status-computer"
)

// AggregateHealthService is the pure domain service for health aggregation.
// Zero I/O — all HTTP calls delegated to injected HealthCheckerPort.
type AggregateHealthService struct {
	checker  HealthCheckerPort
	registry ServiceRegistryPort
}

// NewAggregateHealthService creates a new AggregateHealthService.
func NewAggregateHealthService(checker HealthCheckerPort, registry ServiceRegistryPort) *AggregateHealthService {
	return &AggregateHealthService{
		checker:  checker,
		registry: registry,
	}
}

// Aggregate fans out health checks to all services in parallel and aggregates results.
func (s *AggregateHealthService) Aggregate(ctx context.Context) (*AggregatedHealth, error) {
	services := s.registry.GetAllServices()

	type result struct {
		index  int
		health *ServiceHealthResult
		err    error
	}

	results := make([]result, len(services))
	var wg sync.WaitGroup

	for i, svc := range services {
		wg.Add(1)
		go func(idx int, service *ServiceConfig) {
			defer wg.Done()
			h, err := s.checker.CheckHealth(ctx, service)
			results[idx] = result{index: idx, health: h, err: err}
		}(i, svc)
	}

	wg.Wait()

	statuses := make(map[string]HealthStatus, len(services))
	latencies := make(map[string]int64, len(services))

	for i, r := range results {
		name := services[i].Name
		if r.err != nil || r.health == nil {
			statuses[name] = StatusDown
			latencies[name] = -1
		} else {
			statuses[name] = r.health.Status
			latencies[name] = r.health.LatencyMs
		}
	}

	// Convert domain.HealthStatus map to string map for the primitive (breaks import cycle).
	rawStatuses := make(map[string]string, len(statuses))
	for k, v := range statuses {
		rawStatuses[k] = string(v)
	}
	overall := HealthStatus(osc.ComputeOverallStatus(rawStatuses))

	return &AggregatedHealth{
		Status:    overall,
		Services:  statuses,
		Latencies: latencies,
		CheckedAt: time.Now().UTC().Format(time.RFC3339Nano),
	}, nil
}

