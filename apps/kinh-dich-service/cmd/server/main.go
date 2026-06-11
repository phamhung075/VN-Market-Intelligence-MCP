// Package main is the composition root for the kinh-dich-service.
// This file wires all DDD layers together with dependency injection.
// No business logic here - only DI wiring.
//
// G3: Composition root ≤80 lines, zero domain ops.
// OQ-5: Target ~74 lines, ±6 for formatting variance.
// OQ-10: Port from os.Getenv("PORT") with default "5005".
package main

import (
	"log"
	"net/http"
	"os"

	"github.com/vn-market-intelligence/kinh-dich-service/pkg/application"
	"github.com/vn-market-intelligence/kinh-dich-service/pkg/domain"
	"github.com/vn-market-intelligence/kinh-dich-service/pkg/infrastructure"
	httpintf "github.com/vn-market-intelligence/kinh-dich-service/pkg/interface/http"
)

func main() {
	// Read port from environment (OQ-10)
	port := os.Getenv("PORT")
	if port == "" {
		port = "5005"
	}

	// Infrastructure layer - repositories and adapters
	repo := infrastructure.NewSQLiteReadingRepository()
	markovAdapter := infrastructure.NewSQLiteMarkovAdapter()
	priceScoreAdapter := infrastructure.NewSQLitePriceScoreAdapter(repo)

	// Domain layer - services
	readingService := domain.NewReadingService(markovAdapter, priceScoreAdapter)

	// Application layer - use cases
	readingUseCase := application.NewReadingUseCase(readingService)

	// Interface layer - HTTP router
	router := httpintf.NewRouter(readingUseCase)

	// Start server
	log.Printf("kinh-dich-service starting on port %s", port)
	if err := http.ListenAndServe(":"+port, router); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
