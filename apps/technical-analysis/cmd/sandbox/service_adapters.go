package main

import (
	"log/slog"
	"net/http/httptest"

	"github.com/vn-market-intelligence/technical-analysis/pkg/application"
	"github.com/vn-market-intelligence/technical-analysis/pkg/domain"
	httpinterface "github.com/vn-market-intelligence/technical-analysis/pkg/interface/http"
	"github.com/vn-market-intelligence/technical-analysis/pkg/module"
)

// ---------------------------------------------------------------------------
// Service tier — composition-root-local adapters + in-process test server
// ---------------------------------------------------------------------------

// sandboxCalculator is a composition-root-local adapter that satisfies the
// application.TACalculator port without importing pkg/infrastructure.
// It delegates to pkg/module.Compute and maps the result to domain types via
// module.ToDomainIndicators — the same shared mapper infrastructure.TACalculator
// uses (FACTORY-TECHANALYSIS-dedup-calculator). Previously this adapter carried
// its own copy of the Result->domain mapping and it had drifted from the real
// service: it omitted MA5/MA20/MA50. Sharing the mapper fixes that drift; the
// sandbox now populates MA5/20/50 like the real service does.
type sandboxCalculator struct{}

func (s *sandboxCalculator) Calculate(closes []float64, period int) (*domain.TechnicalIndicators, error) {
	params := module.ComputeParams{
		RSIPeriod: period,
		MAPeriod:  period,
	}
	res, err := module.Compute(closes, params)
	if err != nil {
		return nil, err
	}
	return module.ToDomainIndicators(res), nil
}

// noopPriceRepo satisfies the application.PriceRepo port for the sandbox.
// The sandbox is credential-free and never exercises the DB-backed path
// (service-tier scenarios always supply closes). If somehow called, it
// panics loudly rather than silently returning wrong data.
type noopPriceRepo struct{}

func (noopPriceRepo) GetCandles(symbol string, _ int) ([]domain.CandleStick, error) {
	panic("sandbox: DB-backed path must not be called (scenario must supply closes) for symbol: " + symbol)
}

// noopOHLCVRepo satisfies the application.OHLCVRepo port for the sandbox.
// Volatility scenarios inject bars via vnindex_bars/ticker_bars in the request body;
// the DB-backed path must never be called in credential-free sandbox mode.
type noopOHLCVRepo struct{}

func (noopOHLCVRepo) GetOHLCV(symbol string, _ int) ([]domain.OHLCVBar, error) {
	panic("sandbox: DB-backed OHLCV path must not be called (inject vnindex_bars/ticker_bars in request body) for: " + symbol)
}

func newTestServer() (*httptest.Server, func()) {
	calc := &sandboxCalculator{}
	useCase := application.NewComputeTAUseCase(calc, noopPriceRepo{})
	// Volatility use case: nil watchlist is non-fatal (tickers injected per-request in scenarios).
	volSvc := domain.NewVolatilityService()
	volUseCase := application.NewComputeVolatilityUseCase(noopOHLCVRepo{}, volSvc, nil)
	// IND-P1 use cases are not wired in sandbox (no DB access; routes are nil-skipped).
	router := httpinterface.NewRouter(httpinterface.RouterConfig{
		UseCase:    useCase,
		VolUseCase: volUseCase,
		Logger:     slog.Default(),
	})
	srv := httptest.NewServer(router)
	return srv, srv.Close
}
