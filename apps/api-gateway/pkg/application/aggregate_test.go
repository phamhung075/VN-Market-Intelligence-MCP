// Tests for application use cases — mirrors aggregate-health-usecase.test.ts
package application_test

import (
	"context"
	"testing"

	"github.com/vn-market-intelligence/api-gateway/pkg/application"
	"github.com/vn-market-intelligence/api-gateway/pkg/domain"
	"github.com/vn-market-intelligence/api-gateway/pkg/infrastructure"
)

// ── Mock checker ────────────────────────────────────────────────────────────

type mockChecker struct {
	status domain.HealthStatus
}

func (m *mockChecker) CheckHealth(_ context.Context, svc *domain.ServiceConfig) (*domain.ServiceHealthResult, error) {
	lat := int64(45)
	if m.status != domain.StatusOk {
		lat = -1
	}
	return &domain.ServiceHealthResult{Service: svc.Name, Status: m.status, LatencyMs: lat}, nil
}

// ── AggregateHealthUseCase tests ────────────────────────────────────────────

func TestAggregateHealthUseCase_AllOk(t *testing.T) {
	reg := infrastructure.NewStaticServiceRegistry(map[string]string{
		"mcp":   "http://localhost:3000",
		"pdf":   "http://localhost:5001",
		"rag":   "http://localhost:5002",
		"ta":    "http://localhost:5003",
		"macro": "http://localhost:5004",
		"stock": "http://localhost:5000",
	})
	checker := &mockChecker{status: domain.StatusOk}
	svc := domain.NewAggregateHealthService(checker, reg, nil)
	uc := application.NewAggregateHealthUseCase(svc)

	result, err := uc.Execute(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Status != domain.StatusOk {
		t.Errorf("expected ok, got %s", result.Status)
	}
	if len(result.Services) != 9 {
		t.Errorf("expected 9 services, got %d", len(result.Services))
	}
	if result.CheckedAt == "" {
		t.Error("checkedAt must not be empty")
	}
}

func TestAggregateHealthUseCase_Degraded(t *testing.T) {
	reg := infrastructure.NewStaticServiceRegistry(map[string]string{})
	callCount := 0
	mixed := &mixedChecker{callCount: &callCount}
	svc := domain.NewAggregateHealthService(mixed, reg, nil)
	uc := application.NewAggregateHealthUseCase(svc)

	result, err := uc.Execute(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Status != domain.StatusDegraded {
		t.Errorf("expected degraded, got %s", result.Status)
	}
}

type mixedChecker struct {
	callCount *int
}

func (m *mixedChecker) CheckHealth(_ context.Context, svc *domain.ServiceConfig) (*domain.ServiceHealthResult, error) {
	*m.callCount++
	status := domain.StatusOk
	if *m.callCount > 3 {
		status = domain.StatusDown
	}
	return &domain.ServiceHealthResult{Service: svc.Name, Status: status, LatencyMs: 50}, nil
}

// ── ServiceHealthUseCase tests ───────────────────────────────────────────────

func TestServiceHealthUseCase_KnownService(t *testing.T) {
	reg := infrastructure.NewStaticServiceRegistry(map[string]string{"mcp": "http://localhost:3000"})
	checker := &mockChecker{status: domain.StatusOk}
	uc := application.NewServiceHealthUseCase(reg, checker)

	result, err := uc.Execute(context.Background(), "mcp")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result == nil {
		t.Fatal("expected result, got nil")
	}
	if result.Service != "mcp" {
		t.Errorf("expected service=mcp, got %s", result.Service)
	}
	if result.Status != domain.StatusOk {
		t.Errorf("expected status ok, got %s", result.Status)
	}
}

func TestServiceHealthUseCase_UnknownService(t *testing.T) {
	reg := infrastructure.NewStaticServiceRegistry(map[string]string{})
	checker := &mockChecker{status: domain.StatusOk}
	uc := application.NewServiceHealthUseCase(reg, checker)

	result, err := uc.Execute(context.Background(), "nonexistent")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != nil {
		t.Error("expected nil result for unknown service")
	}
}
