// Package main is the wiring entry point for the api-gateway-go microservice.
package main

import (
	"fmt"
	"log/slog"
	"net/http"
	"os"

	"github.com/vn-market-intelligence/api-gateway-go/pkg/application"
	"github.com/vn-market-intelligence/api-gateway-go/pkg/domain"
	"github.com/vn-market-intelligence/api-gateway-go/pkg/infrastructure"
	httpinterface "github.com/vn-market-intelligence/api-gateway-go/pkg/interface/http"
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

	serviceURLs := map[string]string{
		"mcp":       mcpURL,
		"pdf":       getenv("PDF_URL", "http://pdf-extractor:5001"),
		"rag":       getenv("RAG_URL", "http://rag-service:5002"),
		"ta":        getenv("TA_URL", "http://technical-analysis:5003"),
		"macro":     getenv("MACRO_URL", "http://macro-indicators:5004"),
		"stock":     getenv("STOCK_URL", "http://stock-price:5000"),
		"kinh-dich": getenv("KINH_DICH_URL", "http://kinh-dich-service:5005"),
		"alert":     getenv("ALERT_URL", "http://alert-engine:5006"),
		"news":      getenv("NEWS_URL", "http://news-fetch:5008"),
		// Virtual alias: /api/* routes to MCP server with full path preserved
		"api": mcpURL,
	}

	registry := infrastructure.NewStaticServiceRegistry(serviceURLs)
	checker := infrastructure.NewHTTPHealthChecker()

	healthDomainService := domain.NewAggregateHealthService(checker, registry)
	aggregateUC := application.NewAggregateHealthUseCase(healthDomainService)
	serviceHealthUC := application.NewServiceHealthUseCase(registry, checker)

	handlers := httpinterface.NewGatewayHandlers(aggregateUC, serviceHealthUC, registry, logger)
	router := httpinterface.NewRouter(handlers, logger)

	addr := fmt.Sprintf(":%s", port)
	logger.Info("api-gateway-go starting", "port", port)

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
