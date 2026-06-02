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
	checker        HealthCheckerPort
	registry       ServiceRegistryPort
	notDeployedSet map[string]bool
	// capabilityProber is optional; nil disables capability enrichment.
	capabilityProber CapabilityProberPort
}

// NewAggregateHealthService creates a new AggregateHealthService.
// notDeployedSet is a list of short-keys for services that are intentionally
// not deployed on this host; they are classified as StatusNotDeployed and
// skipped during HTTP health-check fan-out.
func NewAggregateHealthService(checker HealthCheckerPort, registry ServiceRegistryPort, notDeployedSet []string) *AggregateHealthService {
	ndSet := make(map[string]bool, len(notDeployedSet))
	for _, key := range notDeployedSet {
		ndSet[key] = true
	}
	return &AggregateHealthService{
		checker:        checker,
		registry:       registry,
		notDeployedSet: ndSet,
	}
}

// WithCapabilityProber attaches a capability prober to the service.
// When set, every Aggregate call enriches the response with per-service
// capability status (live/data_limited/dark/n/a) for not-deployed services.
func (s *AggregateHealthService) WithCapabilityProber(p CapabilityProberPort) *AggregateHealthService {
	s.capabilityProber = p
	return s
}

// Aggregate fans out health checks to all services in parallel and aggregates results.
// Services in notDeployedSet are classified as StatusNotDeployed without probing.
func (s *AggregateHealthService) Aggregate(ctx context.Context) (*AggregatedHealth, error) {
	services := s.registry.GetAllServices()

	type result struct {
		index  int
		health *ServiceHealthResult
		err    error
	}

	// Classify not-deployed services immediately; collect only deployable ones to probe.
	statuses := make(map[string]HealthStatus, len(services))
	latencies := make(map[string]int64, len(services))

	type indexedSvc struct {
		idx int
		svc *ServiceConfig
	}
	var toProbe []indexedSvc

	for i, svc := range services {
		if s.notDeployedSet[svc.Name] {
			statuses[svc.Name] = StatusNotDeployed
			latencies[svc.Name] = -1
		} else {
			toProbe = append(toProbe, indexedSvc{idx: i, svc: svc})
		}
	}

	results := make([]result, len(toProbe))
	var wg sync.WaitGroup

	for j, item := range toProbe {
		wg.Add(1)
		go func(resIdx int, idx int, service *ServiceConfig) {
			defer wg.Done()
			h, err := s.checker.CheckHealth(ctx, service)
			results[resIdx] = result{index: idx, health: h, err: err}
		}(j, item.idx, item.svc)
	}

	wg.Wait()

	for j, r := range results {
		name := toProbe[j].svc.Name
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

	// Capability enrichment — additive axis for not-deployed services only.
	// ANTI-FALSE-GREEN: a deployed service that is DOWN stays DOWN regardless
	// of what the capability prober returns.  We only populate the capabilities
	// map for services that are in notDeployedSet; deployed services are omitted.
	var capabilities map[string]*ServiceCapability
	if s.capabilityProber != nil {
		probed := s.capabilityProber.ProbeAll(ctx)
		if len(probed) > 0 {
			capabilities = make(map[string]*ServiceCapability, len(probed))
			for key, cap := range probed {
				// Only include capability enrichment for services that are
				// confirmed not-deployed.  Deployed services keep only their
				// container-axis status (down = RED, no capability rescue).
				if s.notDeployedSet[key] {
					capabilities[key] = cap
				}
			}
		}
	}

	return &AggregatedHealth{
		Status:       overall,
		Services:     statuses,
		Latencies:    latencies,
		Capabilities: capabilities,
		CheckedAt:    time.Now().UTC().Format(time.RFC3339Nano),
	}, nil
}

