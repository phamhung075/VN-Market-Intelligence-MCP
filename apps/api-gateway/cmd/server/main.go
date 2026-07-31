// Package main is the wiring entry point for the api-gateway microservice.
package main

import (
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"

	"github.com/vn-market-intelligence/api-gateway/pkg/application"
	"github.com/vn-market-intelligence/api-gateway/pkg/domain"
	"github.com/vn-market-intelligence/api-gateway/pkg/infrastructure"
	httpinterface "github.com/vn-market-intelligence/api-gateway/pkg/interface/http"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	port := os.Getenv("PORT")
	if port == "" {
		port = "4000"
	}

	mcpURL := getenv("MCP_URL", "http://mcp-server:3000")

	// StaticServiceRegistry (pkg/infrastructure/registry.go) is the sole SSOT
	// for default docker-compose URLs — including the "api" virtual alias,
	// which has no dedicated env var and resolves via get("api", mcpURL)
	// inside the registry. serviceURLOverrides only supplies the env-set keys.
	serviceURLs := serviceURLOverrides()

	notDeployedRaw := getenv("NOT_DEPLOYED_SERVICES", "")
	notDeployed := splitCSV(notDeployedRaw)

	// Registry receives the same not-deployed set so that HandleProxy can
	// reroute through mcp-server without a separate lookup.
	registry := infrastructure.NewStaticServiceRegistryWithNotDeployed(serviceURLs, notDeployed)
	checker := infrastructure.NewHTTPHealthChecker()

	// Capability prober: reads the manifest from system-map.json and runs
	// bounded (max 7) probes per 60s window.  System-map is resolved relative
	// to the repo root — either from SYSTEM_MAP_PATH env or the default path.
	systemMapPath := getenv("SYSTEM_MAP_PATH", "docs/data/system-map.json")
	capabilityProber := infrastructure.NewCapabilityProber(mcpURL, systemMapPath)

	healthDomainService := domain.NewAggregateHealthService(checker, registry, notDeployed).
		WithCapabilityProber(capabilityProber)
	aggregateUC := application.NewAggregateHealthUseCase(healthDomainService)
	serviceHealthUC := application.NewServiceHealthUseCase(registry, checker)

	handlers := httpinterface.NewGatewayHandlers(aggregateUC, serviceHealthUC, registry, logger)
	router := httpinterface.NewRouter(handlers, logger)

	addr := fmt.Sprintf(":%s", port)
	logger.Info("api-gateway starting", "port", port)

	if err := http.ListenAndServe(addr, router); err != nil {
		logger.Error("server error", "error", err)
		os.Exit(1)
	}
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// serviceEnvVars maps each StaticServiceRegistry key to its override env var
// name. There is no entry for "api" — it is a virtual alias with no
// dedicated env var; NewStaticServiceRegistry resolves it via
// get("api", mcpURL) using the registry's own "mcp" resolution.
var serviceEnvVars = map[string]string{
	"mcp":       "MCP_URL",
	"pdf":       "PDF_URL",
	"rag":       "RAG_URL",
	"ta":        "TA_URL",
	"macro":     "MACRO_URL",
	"stock":     "STOCK_URL",
	"kinh-dich": "KINH_DICH_URL",
	"alert":     "ALERT_URL",
	"news":      "NEWS_URL",
}

// serviceURLOverrides returns a sparse map containing only the registry keys
// whose env var is actually set (non-empty). Unset keys are intentionally
// omitted so StaticServiceRegistry's own get(key, fallback) supplies the
// default docker-compose URL — the registry stays the sole SSOT for
// defaults; this file never duplicates that literal.
func serviceURLOverrides() map[string]string {
	out := make(map[string]string, len(serviceEnvVars))
	for key, envVar := range serviceEnvVars {
		if v := os.Getenv(envVar); v != "" {
			out[key] = v
		}
	}
	return out
}

// splitCSV splits a comma-separated string into trimmed non-empty tokens.
func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}
