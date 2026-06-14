// Package http — HTTP interface layer for the macro-indicators service.
//
// CARRY-YIELD-SINGLE-SIGNAL-FIXTURE (Option B consolidation): the standalone
// /carry-trade-signal and /yield-spread-signal endpoints served hardcoded fixture
// consts (fed=5.33, deposit=4.7, earningYield=8.2) with no DI — a DSI-INV-1
// violation. They are RETIRED. TS MCP tools now call POST /snapshot and project
// signals.carry / signals.yield (the only live path). handlers_carry.go and
// handlers_yield.go are deleted.
//
// /macro-calendar remains fixture-based (per OQ-10 resolution).
// FE-RR-MACRO-EXTERNAL: GET /external added — serves cached MacroData from SQLite.
//
// VMT-2 (BOP): POST /bop added — serves SBV Balance of Payments data with
// FX-incidence discriminator and offshore-parked heuristic (always is_estimate=true).
//
// Routes:
//   GET  /health               — 200 ok + service JSON (unchanged from P2-B1)
//   POST /snapshot             — real ComputeMacroUseCase.Execute() (AC-2, canonical carry/yield source)
//   GET  /macro-calendar       — fixture response (OQ-10 deferred)
//   GET  /external             — cached macro snapshot → MacroData shape (FE-RR-MACRO-EXTERNAL)
//   POST /bop                  — SBV BOP quarterly data + FX-incidence + offshore_parked (VMT-2)
//   POST /macro-indicators     — NSO monthly IIP data for 4 sectors (VMT-3b)
//   POST /cpi-components       — NSO monthly CPI 15-row basket data (VMT-4)
//   POST /trade-balance        — NSO monthly trade totals + HS breakdown + bloc_split (VMT-1a + VMT-1b)
package http

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/vn-market-intelligence/macro-indicators/pkg/application"
)

// RouterConfig holds all use-cases and shared dependencies for the chi router.
//
// DD-1 (architect decision): use a config struct rather than expanding the
// NewRouter function signature with positional args. Named-field struct
// initialization prevents positional-arg confusion as more use-cases are added.
//
// Snapshot is the original ComputeMacroUseCase (existing — do not remove).
// BOP is the VMT-2 use case for POST /bop.
// MacroIndicatorsGSO is the VMT-3b use case for POST /macro-indicators (NSO IIP).
// CPIComponents is the VMT-4 use case for POST /cpi-components (NSO CPI baskets).
// TradeBalance is the VMT-1a+1b use case for POST /trade-balance (NSO trade totals + bloc_split).
type RouterConfig struct {
	Snapshot           *application.ComputeMacroUseCase
	BOP                *application.BOPUseCase
	MacroIndicatorsGSO *application.MacroIndicatorsGSOUseCase
	CPIComponents      *application.CPIComponentsUseCase
	TradeBalance       *application.TradeBalanceUseCase
	Logger             *slog.Logger
}

// NewRouter creates a new chi router with all HTTP handlers registered.
// cfg is wired by the composition root (cmd/server/main.go).
//
// Backward-compatible overload: NewRouter also accepts the legacy
// (useCase *application.ComputeMacroUseCase, logger *slog.Logger) signature
// via the separate NewRouterLegacy function to avoid breaking existing tests
// that construct the router directly. New code MUST use NewRouter(cfg RouterConfig).
func NewRouter(cfg RouterConfig) chi.Router {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.Recoverer)

	r.Get("/health", handleHealth())
	r.Post("/snapshot", handleSnapshot(cfg.Snapshot, cfg.Logger))
	r.Get("/macro-calendar", handleMacroCalendar())
	r.Get("/external", handleExternal(cfg.Snapshot, cfg.Logger))

	// VMT-2: BOP endpoint (PROBE-2 PASS — SBV Liferay JSON, no Excel, no PDF).
	if cfg.BOP != nil {
		r.Post("/bop", handleBOP(cfg.BOP, cfg.Logger))
	}

	// VMT-3b: GSO/IIP endpoint (PROBE-3 PASS — NSO monthly Excel, sheet "2.IIPthang").
	if cfg.MacroIndicatorsGSO != nil {
		r.Post("/macro-indicators", handleMacroIndicators(cfg.MacroIndicatorsGSO, cfg.Logger))
	}

	// VMT-4: CPI components endpoint (PROBE-3 PASS — NSO monthly Excel, sheet "16.CPI").
	if cfg.CPIComponents != nil {
		r.Post("/cpi-components", handleCPIComponents(cfg.CPIComponents, cfg.Logger))
	}

	// VMT-1a + VMT-1b: trade-balance endpoint (NSO monthly Excel, sheets '14.XK'+'15.NK'+'12.FDI').
	// is_estimate=false for trade totals + HS rows (VMT-1a); bloc_split always is_estimate=true (VMT-1b).
	if cfg.TradeBalance != nil {
		r.Post("/trade-balance", handleTradeBalance(cfg.TradeBalance, cfg.Logger))
	}

	return r
}

// ---------------------------------------------------------------------------
// /health — unchanged from P2-B1 (AC-1)
// ---------------------------------------------------------------------------

func handleHealth() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok","service":"macro-indicators","port":5004}`))
	}
}

// ---------------------------------------------------------------------------
// /snapshot — real handler (P2-X3, AC-2)
// ---------------------------------------------------------------------------

func handleSnapshot(useCase *application.ComputeMacroUseCase, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()

		resp, err := useCase.Execute(ctx, application.MacroSnapshotRequest{})
		if err != nil {
			logger.Error("snapshot use case failed", slog.Any("error", err))
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte(`{"error":"snapshot computation failed"}`))
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			logger.Error("snapshot encode failed", slog.Any("error", err))
		}
	}
}
