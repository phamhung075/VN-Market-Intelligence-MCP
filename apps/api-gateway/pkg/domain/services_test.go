// Tests for AggregateHealthService — mirrors aggregate-health-service.test.ts
package domain_test

import (
	"context"
	"errors"
	"testing"

	"github.com/vn-market-intelligence/api-gateway/pkg/domain"
)

// ── Mock implementations ────────────────────────────────────────────────────

type mockChecker struct {
	results map[string]*domain.ServiceHealthResult
	err     error
}

func (m *mockChecker) CheckHealth(_ context.Context, svc *domain.ServiceConfig) (*domain.ServiceHealthResult, error) {
	if m.err != nil {
		return nil, m.err
	}
	if r, ok := m.results[svc.Name]; ok {
		return r, nil
	}
	return &domain.ServiceHealthResult{Service: svc.Name, Status: domain.StatusDown, LatencyMs: -1}, nil
}

type mockRegistry struct {
	services []*domain.ServiceConfig
}

func (m *mockRegistry) GetAllServices() []*domain.ServiceConfig { return m.services }
func (m *mockRegistry) GetService(name string) *domain.ServiceConfig {
	for _, s := range m.services {
		if s.Name == name {
			return s
		}
	}
	return nil
}
func (m *mockRegistry) IsNotDeployed(_ string) bool { return false }

// ── Fixtures ────────────────────────────────────────────────────────────────

var mockServices = []*domain.ServiceConfig{
	{Name: "mcp", BaseURL: "http://mcp:3000", HealthPath: "/health", TimeoutMs: 2000},
	{Name: "pdf", BaseURL: "http://pdf:5001", HealthPath: "/health", TimeoutMs: 2000},
	{Name: "rag", BaseURL: "http://rag:5002", HealthPath: "/health", TimeoutMs: 2000},
	{Name: "ta", BaseURL: "http://ta:5003", HealthPath: "/health", TimeoutMs: 2000},
	{Name: "macro", BaseURL: "http://macro:5004", HealthPath: "/health", TimeoutMs: 2000},
	{Name: "stock", BaseURL: "http://stock:5000", HealthPath: "/health", TimeoutMs: 2000},
}

func allOkResults() map[string]*domain.ServiceHealthResult {
	r := make(map[string]*domain.ServiceHealthResult)
	for _, s := range mockServices {
		r[s.Name] = &domain.ServiceHealthResult{Service: s.Name, Status: domain.StatusOk, LatencyMs: 50}
	}
	return r
}

func allDownResults() map[string]*domain.ServiceHealthResult {
	r := make(map[string]*domain.ServiceHealthResult)
	for _, s := range mockServices {
		r[s.Name] = &domain.ServiceHealthResult{Service: s.Name, Status: domain.StatusDown, LatencyMs: -1}
	}
	return r
}

// ── Tests ────────────────────────────────────────────────────────────────────

func TestAggregateHealthService_AllOk(t *testing.T) {
	checker := &mockChecker{results: allOkResults()}
	registry := &mockRegistry{services: mockServices}
	svc := domain.NewAggregateHealthService(checker, registry, nil)

	result, err := svc.Aggregate(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Status != domain.StatusOk {
		t.Errorf("expected status ok, got %s", result.Status)
	}
}

func TestAggregateHealthService_Degraded(t *testing.T) {
	results := map[string]*domain.ServiceHealthResult{
		"mcp":   {Service: "mcp", Status: domain.StatusOk, LatencyMs: 50},
		"pdf":   {Service: "pdf", Status: domain.StatusDown, LatencyMs: -1},
		"rag":   {Service: "rag", Status: domain.StatusOk, LatencyMs: 60},
		"ta":    {Service: "ta", Status: domain.StatusOk, LatencyMs: 55},
		"macro": {Service: "macro", Status: domain.StatusOk, LatencyMs: 45},
		"stock": {Service: "stock", Status: domain.StatusOk, LatencyMs: 70},
	}
	checker := &mockChecker{results: results}
	registry := &mockRegistry{services: mockServices}
	svc := domain.NewAggregateHealthService(checker, registry, nil)

	result, err := svc.Aggregate(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Status != domain.StatusDegraded {
		t.Errorf("expected status degraded, got %s", result.Status)
	}
}

func TestAggregateHealthService_AllDown(t *testing.T) {
	checker := &mockChecker{results: allDownResults()}
	registry := &mockRegistry{services: mockServices}
	svc := domain.NewAggregateHealthService(checker, registry, nil)

	result, err := svc.Aggregate(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Status != domain.StatusDown {
		t.Errorf("expected status down, got %s", result.Status)
	}
}

func TestAggregateHealthService_AllServicesPresent(t *testing.T) {
	checker := &mockChecker{results: allOkResults()}
	registry := &mockRegistry{services: mockServices}
	svc := domain.NewAggregateHealthService(checker, registry, nil)

	result, err := svc.Aggregate(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, s := range mockServices {
		if _, ok := result.Services[s.Name]; !ok {
			t.Errorf("missing service %s in result.Services", s.Name)
		}
		if _, ok := result.Latencies[s.Name]; !ok {
			t.Errorf("missing service %s in result.Latencies", s.Name)
		}
	}
}

func TestAggregateHealthService_CheckedAtISO(t *testing.T) {
	checker := &mockChecker{results: allOkResults()}
	registry := &mockRegistry{services: mockServices}
	svc := domain.NewAggregateHealthService(checker, registry, nil)

	result, err := svc.Aggregate(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.CheckedAt == "" {
		t.Error("checkedAt must not be empty")
	}
}

func TestAggregateHealthService_CheckerException(t *testing.T) {
	checker := &mockChecker{err: errors.New("connection refused")}
	registry := &mockRegistry{services: mockServices}
	svc := domain.NewAggregateHealthService(checker, registry, nil)

	result, err := svc.Aggregate(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Status != domain.StatusDown {
		t.Errorf("expected status down when all checkers fail, got %s", result.Status)
	}
	for _, s := range mockServices {
		if result.Services[s.Name] != domain.StatusDown {
			t.Errorf("service %s should be down when checker errors", s.Name)
		}
	}
}

// Table-driven test for computeOverallStatus edge cases
func TestComputeOverallStatus(t *testing.T) {
	tests := []struct {
		name     string
		statuses map[string]domain.HealthStatus
		want     domain.HealthStatus
	}{
		{"all ok", map[string]domain.HealthStatus{"a": domain.StatusOk, "b": domain.StatusOk}, domain.StatusOk},
		{"all down", map[string]domain.HealthStatus{"a": domain.StatusDown, "b": domain.StatusDown}, domain.StatusDown},
		{"mixed ok+down", map[string]domain.HealthStatus{"a": domain.StatusOk, "b": domain.StatusDown}, domain.StatusDegraded},
		{"single ok", map[string]domain.HealthStatus{"a": domain.StatusOk}, domain.StatusOk},
		{"single down", map[string]domain.HealthStatus{"a": domain.StatusDown}, domain.StatusDown},
		{"degraded present", map[string]domain.HealthStatus{"a": domain.StatusOk, "b": domain.StatusDegraded}, domain.StatusDegraded},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			checker := &mockChecker{}
			svcs := make([]*domain.ServiceConfig, 0)
			results := make(map[string]*domain.ServiceHealthResult)
			for name, status := range tt.statuses {
				svcs = append(svcs, &domain.ServiceConfig{Name: name, HealthPath: "/health", TimeoutMs: 2000})
				results[name] = &domain.ServiceHealthResult{Service: name, Status: status, LatencyMs: 50}
			}
			checker.results = results
			registry := &mockRegistry{services: svcs}
			svc := domain.NewAggregateHealthService(checker, registry, nil)
			result, err := svc.Aggregate(context.Background())
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if result.Status != tt.want {
				t.Errorf("got %s, want %s", result.Status, tt.want)
			}
		})
	}
}
