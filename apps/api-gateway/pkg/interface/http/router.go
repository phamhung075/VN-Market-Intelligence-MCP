package http

import (
	"log/slog"
	"net/http"
)

// NewRouter creates and wires the HTTP mux with all 5+1 routes:
//
//	GET  /health           → aggregate health
//	GET  /healthz          → k8s liveness alias to /health (AC-11)
//	GET  /health/:service  → per-service health
//	GET  /health-dashboard → HTML dashboard
//	ANY  /api/*            → proxy (virtual alias, full path verbatim)
//	ANY  /:service/*       → proxy (strip /:service prefix)
func NewRouter(handlers *GatewayHandlers, logger *slog.Logger) http.Handler {
	mux := http.NewServeMux()

	// Health endpoints
	mux.HandleFunc("GET /health", handlers.HandleHealth)
	mux.HandleFunc("GET /healthz", handlers.HandleHealth) // AC-11: k8s liveness alias
	mux.HandleFunc("GET /health-dashboard", handlers.HandleDashboard)

	// /health/:service — must be registered after /health and /health-dashboard
	// to avoid conflicts. Uses prefix match with sub-path extraction in handler.
	mux.HandleFunc("GET /health/", handlers.HandleServiceHealth)

	// Proxy catch-all — handles /api/* and /:service/* (any method)
	mux.HandleFunc("/", handlers.HandleProxy)

	return loggingMiddleware(logger, mux)
}
