// Package http contains the HTTP interface layer for the api-gateway.
package http

import (
	"fmt"
	"log/slog"
	"net/http"

	"github.com/vn-market-intelligence/api-gateway/pkg/application"
	"github.com/vn-market-intelligence/api-gateway/pkg/domain"
	rsm "github.com/vn-market-intelligence/api-gateway/pkg/primitive/route-service-matcher"
)

// ── Handlers ─────────────────────────────────────────────────────────────────

// GatewayHandlers holds all HTTP handlers for the api-gateway.
type GatewayHandlers struct {
	aggregateUC *application.AggregateHealthUseCase
	serviceUC   *application.ServiceHealthUseCase
	registry    domain.ServiceRegistryPort
	logger      *slog.Logger
}

// NewGatewayHandlers creates a new GatewayHandlers.
func NewGatewayHandlers(
	aggregateUC *application.AggregateHealthUseCase,
	serviceUC *application.ServiceHealthUseCase,
	registry domain.ServiceRegistryPort,
	logger *slog.Logger,
) *GatewayHandlers {
	return &GatewayHandlers{
		aggregateUC: aggregateUC,
		serviceUC:   serviceUC,
		registry:    registry,
		logger:      logger,
	}
}

// HandleHealth handles GET /health and GET /healthz.
func (h *GatewayHandlers) HandleHealth(w http.ResponseWriter, r *http.Request) {
	result, err := h.aggregateUC.Execute(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	status := http.StatusOK
	if result.Status == domain.StatusDown {
		status = http.StatusServiceUnavailable
	}
	writeJSON(w, status, result)
}

// HandleServiceHealth handles GET /health/:service.
func (h *GatewayHandlers) HandleServiceHealth(w http.ResponseWriter, r *http.Request) {
	// Extract service name from URL path: /health/<service>
	serviceName := rsm.ExtractServiceName(r.URL.Path, "/health/")

	result, err := h.serviceUC.Execute(r.Context(), serviceName)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if result == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": fmt.Sprintf("Unknown service: %s", serviceName)})
		return
	}
	status := http.StatusOK
	if result.Status == domain.StatusDown {
		status = http.StatusServiceUnavailable
	}
	writeJSON(w, status, result)
}

// HandleDashboard handles GET /health-dashboard.
func (h *GatewayHandlers) HandleDashboard(w http.ResponseWriter, r *http.Request) {
	result, err := h.aggregateUC.Execute(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	htmlContent := BuildDashboardHTML(result)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(htmlContent))
}
