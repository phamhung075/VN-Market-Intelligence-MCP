package infrastructure

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/vn-market-intelligence/api-gateway-go/pkg/domain"
)

// HTTPHealthChecker is the concrete implementation of HealthCheckerPort.
// Uses net/http with context deadline for per-service timeout.
type HTTPHealthChecker struct {
	client *http.Client
}

// NewHTTPHealthChecker creates a new HTTPHealthChecker.
func NewHTTPHealthChecker() *HTTPHealthChecker {
	return &HTTPHealthChecker{
		client: &http.Client{},
	}
}

// CheckHealth checks the health of a single service.
func (h *HTTPHealthChecker) CheckHealth(ctx context.Context, svc *domain.ServiceConfig) (*domain.ServiceHealthResult, error) {
	start := time.Now()
	url := svc.BaseURL + svc.HealthPath

	timeoutCtx, cancel := context.WithTimeout(ctx, time.Duration(svc.TimeoutMs)*time.Millisecond)
	defer cancel()

	req, err := http.NewRequestWithContext(timeoutCtx, http.MethodGet, url, nil)
	if err != nil {
		return &domain.ServiceHealthResult{
			Service:   svc.Name,
			Status:    domain.StatusDown,
			LatencyMs: time.Since(start).Milliseconds(),
			Error:     err.Error(),
		}, nil
	}

	resp, err := h.client.Do(req)
	latencyMs := time.Since(start).Milliseconds()

	if err != nil {
		return &domain.ServiceHealthResult{
			Service:   svc.Name,
			Status:    domain.StatusDown,
			LatencyMs: latencyMs,
			Error:     err.Error(),
		}, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return &domain.ServiceHealthResult{
			Service:   svc.Name,
			Status:    domain.StatusOk,
			LatencyMs: latencyMs,
		}, nil
	}

	return &domain.ServiceHealthResult{
		Service:   svc.Name,
		Status:    domain.StatusDegraded,
		LatencyMs: latencyMs,
		Error:     fmt.Sprintf("HTTP %d", resp.StatusCode),
	}, nil
}
