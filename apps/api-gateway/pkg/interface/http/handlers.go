// Package http contains the HTTP interface layer for the api-gateway.
package http

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"

	"github.com/vn-market-intelligence/api-gateway/pkg/application"
	"github.com/vn-market-intelligence/api-gateway/pkg/domain"
	ndr "github.com/vn-market-intelligence/api-gateway/pkg/primitive/not-deployed-rerouter"
	ppr "github.com/vn-market-intelligence/api-gateway/pkg/primitive/proxy-path-resolver"
	rsm "github.com/vn-market-intelligence/api-gateway/pkg/primitive/route-service-matcher"
)

// ── JSON helpers ─────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// ── Logging middleware ────────────────────────────────────────────────────────

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func loggingMiddleware(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		latencyMs := time.Since(start).Milliseconds()
		logger.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rec.status,
			"latency_ms", latencyMs,
		)
	})
}

// ── Dashboard constants ───────────────────────────────────────────────────────

var dashboardServices = []string{
	"mcp", "pdf", "rag", "ta", "macro", "stock", "kinh-dich", "alert", "news",
}

func statusClass(status domain.HealthStatus) string {
	switch status {
	case domain.StatusOk:
		return "status-up"
	case domain.StatusDown:
		return "status-down"
	default:
		return "status-unknown"
	}
}

func statusLabel(status domain.HealthStatus) string {
	switch status {
	case domain.StatusOk:
		return "UP"
	case domain.StatusDown:
		return "DOWN"
	case domain.StatusDegraded:
		return "DEGRADED"
	default:
		return "UNKNOWN"
	}
}

// BuildDashboardHTML builds the self-contained HTML health dashboard page.
// Exported for testing.
func BuildDashboardHTML(health *domain.AggregatedHealth) string {
	var cards strings.Builder
	for _, name := range dashboardServices {
		status := health.Services[name]
		latency, hasLatency := health.Latencies[name]
		cls := statusClass(status)
		label := statusLabel(status)
		latencyText := "N/A"
		if hasLatency && latency >= 0 {
			latencyText = fmt.Sprintf("%d ms", latency)
		}
		cards.WriteString(fmt.Sprintf(`
      <div class="card %s">
        <span class="service-name">%s</span>
        <span class="badge">%s</span>
        <span class="latency">%s</span>
      </div>`,
			cls, html.EscapeString(name), label, latencyText))
	}

	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="60">
  <title>VN Market Intelligence — Health Dashboard</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #0f1117;
      color: #e2e8f0;
      padding: 2rem;
      min-height: 100vh;
    }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1rem; margin-bottom: 0.75rem; color: #94a3b8; }
    .subtitle { color: #64748b; font-size: 0.875rem; margin-bottom: 2rem; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .card {
      border-radius: 0.5rem;
      padding: 1rem;
      border: 2px solid #334155;
      background: #1e293b;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .card.status-up    { border-color: #22c55e; }
    .card.status-down  { border-color: #ef4444; }
    .card.status-unknown { border-color: #64748b; }
    .service-name { font-weight: 600; font-size: 0.9rem; }
    .badge {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      width: fit-content;
    }
    .status-up    .badge { background: #166534; color: #bbf7d0; }
    .status-down  .badge { background: #7f1d1d; color: #fecaca; }
    .status-unknown .badge { background: #1e293b; color: #94a3b8; border: 1px solid #475569; }
    .latency { font-size: 0.75rem; color: #64748b; }
    section { margin-bottom: 2rem; }
    .placeholder { color: #64748b; font-size: 0.875rem; font-style: italic; }
    footer { margin-top: 2rem; color: #475569; font-size: 0.75rem; border-top: 1px solid #1e293b; padding-top: 1rem; }
    .overall { margin-bottom: 1.5rem; }
    .overall-badge {
      display: inline-block;
      font-size: 0.875rem;
      font-weight: 700;
      padding: 0.25rem 0.75rem;
      border-radius: 999px;
    }
    .overall-ok         { background: #166534; color: #bbf7d0; }
    .overall-degraded   { background: #713f12; color: #fef3c7; }
    .overall-down       { background: #7f1d1d; color: #fecaca; }
  </style>
</head>
<body>
  <h1>VN Market Intelligence — Health Dashboard</h1>
  <p class="subtitle">Auto-refreshes every 60 seconds. Last checked: %s</p>

  <div class="overall">
    <span class="overall-badge overall-%s">
      Overall: %s
    </span>
  </div>

  <section id="services">
    <h2>Service Status (%d services)</h2>
    <div class="grid">
      %s
    </div>
  </section>

  <section id="signals">
    <h2>Last 10 Signals</h2>
    <p class="placeholder">N/A — MCP data not wired in this sprint</p>
  </section>

  <section id="prediction">
    <h2>Prediction Accuracy</h2>
    <p class="placeholder">N/A — MCP data not wired in this sprint</p>
  </section>

  <section id="alerts">
    <h2>Active Alerts</h2>
    <p class="placeholder">N/A — MCP data not wired in this sprint</p>
  </section>

  <footer>
    VN Market Intelligence MCP &mdash; api-gateway health dashboard &mdash; read-only
  </footer>
</body>
</html>`,
		html.EscapeString(health.CheckedAt),
		html.EscapeString(string(health.Status)),
		html.EscapeString(strings.ToUpper(string(health.Status))),
		len(dashboardServices),
		cards.String(),
	)
}

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

// HandleProxy handles ANY /:service/* reverse proxy requests.
func (h *GatewayHandlers) HandleProxy(w http.ResponseWriter, r *http.Request) {
	// Extract service name from path
	serviceName := rsm.ExtractServiceName(r.URL.Path, "/")

	svc := h.registry.GetService(serviceName)
	if svc == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": fmt.Sprintf("Unknown service: %s", serviceName)})
		return
	}

	// NOT_DEPLOYED re-route: redirect to mcp-server with path rewrite.
	// This branch is driven by the SSOT notDeployedSet in the registry so
	// that deploying the real microservice (removing it from NOT_DEPLOYED_SERVICES)
	// restores direct routing without a code change.
	if h.registry.IsNotDeployed(serviceName) {
		reroutedPath, hasMapping := ndr.Reroute(r.URL.Path, r.URL.RawQuery, serviceName)
		if !hasMapping {
			// No mcp-server fallback for this service — honest 503.
			writeJSON(w, http.StatusServiceUnavailable, map[string]interface{}{
				"error":   "not_deployed",
				"service": serviceName,
				"detail":  fmt.Sprintf("Service %q is not deployed on this host and has no mcp-server alternative", serviceName),
			})
			return
		}

		mcpSvc := h.registry.GetService("mcp")
		if mcpSvc == nil {
			writeJSON(w, http.StatusBadGateway, map[string]string{
				"error": "mcp-server not configured — cannot reroute",
			})
			return
		}

		mcpBase, err := url.Parse(mcpSvc.BaseURL)
		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]string{
				"error": fmt.Sprintf("mcp-server URL invalid: %s", err.Error()),
			})
			return
		}

		h.logger.Info("not-deployed reroute",
			"service", serviceName,
			"original_path", r.URL.Path,
			"rerouted_path", reroutedPath,
		)

		proxy := httputil.NewSingleHostReverseProxy(mcpBase)
		proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
			writeJSON(w, http.StatusBadGateway, map[string]string{
				"error": fmt.Sprintf("mcp-server unreachable during reroute for %s: %s", serviceName, err.Error()),
			})
		}

		r2 := r.Clone(r.Context())
		r2.URL.Scheme = mcpBase.Scheme
		r2.URL.Host = mcpBase.Host
		// reroutedPath already contains the query string (e.g. ?source=reuters)
		// so we must NOT append r.URL.RawQuery again — split them.
		if idx := strings.IndexByte(reroutedPath, '?'); idx >= 0 {
			r2.URL.Path = reroutedPath[:idx]
			r2.URL.RawQuery = reroutedPath[idx+1:]
		} else {
			r2.URL.Path = reroutedPath
			r2.URL.RawQuery = ""
		}
		r2.Host = mcpBase.Host

		timeoutMs := mcpSvc.ProxyTimeoutMs
		if timeoutMs == 0 {
			timeoutMs = mcpSvc.TimeoutMs * 5
		}
		ctx := r2.Context()
		cancel := func() {}
		if timeoutMs > 0 {
			ctx, cancel = context.WithTimeout(ctx, time.Duration(timeoutMs)*time.Millisecond)
		}
		defer cancel()
		r2 = r2.WithContext(ctx)

		proxy.ServeHTTP(w, r2)
		return
	}

	targetBase, err := url.Parse(svc.BaseURL)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{
			"error": fmt.Sprintf("Upstream %s unreachable: %s", serviceName, err.Error()),
		})
		return
	}

	// Build downstream path via primitive (proxy-path-resolver).
	downstreamPath := ppr.ResolveProxyPath(r.URL.Path, svc.NoProbe)

	proxy := httputil.NewSingleHostReverseProxy(targetBase)
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		writeJSON(w, http.StatusBadGateway, map[string]string{
			"error": fmt.Sprintf("Upstream %s unreachable: %s", serviceName, err.Error()),
		})
	}

	// Rewrite the request path for the proxy
	r2 := r.Clone(r.Context())
	r2.URL.Scheme = targetBase.Scheme
	r2.URL.Host = targetBase.Host
	r2.URL.Path = downstreamPath
	r2.Host = targetBase.Host

	// Set proxy timeout via context — use ProxyTimeoutMs override when set.
	timeoutMs := svc.ProxyTimeoutMs
	if timeoutMs == 0 {
		timeoutMs = svc.TimeoutMs * 5
	}
	ctx := r2.Context()
	cancel := func() {}
	if timeoutMs > 0 {
		ctx, cancel = context.WithTimeout(ctx, time.Duration(timeoutMs)*time.Millisecond)
	}
	defer cancel()
	r2 = r2.WithContext(ctx)

	proxy.ServeHTTP(w, r2)
}
