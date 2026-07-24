// Package httpapi wires the news-fetch HTTP handlers onto a chi router.
//
// Router is the sole entry point: main.go (composition root) builds the
// fetchers + store, then calls Router to obtain a ready-to-serve *chi.Mux.
// Moving the handlers here keeps main.go a thin composition root (env reads,
// store.Open, fetcher construction, graceful shutdown) with zero HTTP logic.
package httpapi

import (
	"context"
	"log/slog"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/vn-market-intelligence/news-fetch/internal/fetcher"
	"github.com/vn-market-intelligence/news-fetch/internal/store"
)

// FetchFunc is the signature shared by all fetcher.Fetch methods.
type FetchFunc func(ctx context.Context) ([]fetcher.RssItem, error)

// Fetchers bundles the four fetch sources wired into the router.
type Fetchers struct {
	VnEconomy FetchFunc
	VnExpress FetchFunc
	NewsAPI   FetchFunc
	VPSProxy  FetchFunc
}

// Router builds the chi router exposing the news-fetch HTTP API:
//
//	GET  /health
//	POST /vneconomy/fetch
//	POST /vnexpress/fetch
//	POST /newsapi/fetch
//	POST /vps/fetch
//	POST /fetch/all
//
// port is the resolved listen port (env PORT, see main.go's envStr call),
// echoed verbatim in the /health response — never hardcoded here.
func Router(fetchers Fetchers, s *store.Store, logger *slog.Logger, port string) *chi.Mux {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.Recoverer)

	r.Get("/health", handleHealth(port))
	r.Post("/vneconomy/fetch", handleRSSFetch("vneconomy", fetchers.VnEconomy, s, logger))
	r.Post("/vnexpress/fetch", handleRSSFetch("vnexpress", fetchers.VnExpress, s, logger))
	r.Post("/newsapi/fetch", handleRSSFetch("newsapi", fetchers.NewsAPI, s, logger))
	r.Post("/vps/fetch", handleRSSFetch("vps_proxy", fetchers.VPSProxy, s, logger))
	r.Post("/fetch/all", handleFetchAll(fetchers, s, logger))

	return r
}
