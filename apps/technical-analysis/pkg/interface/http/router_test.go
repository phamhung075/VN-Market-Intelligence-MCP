// Package http_test — handler integration tests for the technical-analysis router.
// FACTORY-TECHANALYSIS-go-livepath-tests: backstops the live/deployed Go request
// path (GET /health, POST /ta/indicators) so the dead src/ TS shadow service can
// be safely deleted in a follow-up task. Mirrors the httptest.NewServer(NewRouter(...))
// pattern already established in apps/technical-analysis/cmd/sandbox/main.go and
// apps/stock-price/pkg/interface/http/router_test.go.
package http_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/vn-market-intelligence/technical-analysis/pkg/application"
	"github.com/vn-market-intelligence/technical-analysis/pkg/domain"
	httphandler "github.com/vn-market-intelligence/technical-analysis/pkg/interface/http"
)

// ── fakes (satisfy application.TACalculator / application.PriceRepo) ─────────

// fakeCalculator is a controllable stand-in for the infrastructure TACalculator.
type fakeCalculator struct {
	result *domain.TechnicalIndicators
	err    error
}

func (f *fakeCalculator) Calculate(_ []float64, _ int) (*domain.TechnicalIndicators, error) {
	if f.err != nil {
		return nil, f.err
	}
	if f.result != nil {
		return f.result, nil
	}
	return &domain.TechnicalIndicators{RSI: []float64{50.0, 55.0}, SMA: []float64{10.0}}, nil
}

// fakePriceRepo is a controllable stand-in for the infrastructure SQLitePriceRepository.
type fakePriceRepo struct {
	candles []domain.CandleStick
	err     error
}

func (f *fakePriceRepo) GetCandles(_ string, _ int) ([]domain.CandleStick, error) {
	return f.candles, f.err
}

// ── test harness ───────────────────────────────────────────────────────────

// buildServer wires a real ComputeTAUseCase (application layer, unmodified) over
// the given fakes and returns an in-process httptest.Server for the chi router.
func buildServer(calc application.TACalculator, repo application.PriceRepo) *httptest.Server {
	useCase := application.NewComputeTAUseCase(calc, repo)
	router := httphandler.NewRouter(httphandler.RouterConfig{
		UseCase: useCase,
		Logger:  slog.Default(),
	})
	return httptest.NewServer(router)
}

// ── GET /health ───────────────────────────────────────────────────────────

func TestHealth_Returns200(t *testing.T) {
	srv := buildServer(&fakeCalculator{}, &fakePriceRepo{})
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/health")
	if err != nil {
		t.Fatalf("GET /health: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("status: want 200, got %d", resp.StatusCode)
	}
	var body map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body["status"] != "ok" {
		t.Errorf("status field: want ok, got %v", body["status"])
	}
	if body["service"] != "technical-analysis" {
		t.Errorf("service field: want technical-analysis, got %v", body["service"])
	}
}

// ── POST /ta/indicators ───────────────────────────────────────────────────

func TestIndicators_HappyPath(t *testing.T) {
	want := &domain.TechnicalIndicators{
		RSI: []float64{62.5, 64.7},
		SMA: []float64{45.1, 45.3},
	}
	srv := buildServer(&fakeCalculator{result: want}, &fakePriceRepo{})
	defer srv.Close()

	body := `{"symbol":"VCB","closes":[44.34,44.09,44.15,43.61,44.33],"period":14}`
	resp, err := http.Post(srv.URL+"/ta/indicators", "application/json", bytes.NewBufferString(body))
	if err != nil {
		t.Fatalf("POST /ta/indicators: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status: want 200, got %d", resp.StatusCode)
	}
	var result application.ComputeTAResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if result.Symbol != "VCB" {
		t.Errorf("symbol: want VCB, got %s", result.Symbol)
	}
	if len(result.RSI) != len(want.RSI) || result.RSI[0] != want.RSI[0] {
		t.Errorf("rsi: want %v, got %v", want.RSI, result.RSI)
	}
	if len(result.SMA) != len(want.SMA) {
		t.Errorf("sma: want len %d, got %d", len(want.SMA), len(result.SMA))
	}
}

func TestIndicators_InvalidJSON_400(t *testing.T) {
	srv := buildServer(&fakeCalculator{}, &fakePriceRepo{})
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/ta/indicators", "application/json", bytes.NewBufferString("not-json"))
	if err != nil {
		t.Fatalf("POST /ta/indicators: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status: want 400, got %d", resp.StatusCode)
	}
	var body map[string]any
	json.NewDecoder(resp.Body).Decode(&body)
	if body["error"] == nil {
		t.Error("expected non-empty error field")
	}
}

func TestIndicators_MissingClosesAndSymbol_400(t *testing.T) {
	srv := buildServer(&fakeCalculator{}, &fakePriceRepo{})
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/ta/indicators", "application/json", bytes.NewBufferString(`{}`))
	if err != nil {
		t.Fatalf("POST /ta/indicators: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status: want 400, got %d", resp.StatusCode)
	}
	var body map[string]any
	json.NewDecoder(resp.Body).Decode(&body)
	if body["error"] != "closes or symbol required" {
		t.Errorf("error field: want %q, got %v", "closes or symbol required", body["error"])
	}
}

func TestIndicators_UseCaseError_500(t *testing.T) {
	srv := buildServer(&fakeCalculator{err: fmt.Errorf("calculator boom")}, &fakePriceRepo{})
	defer srv.Close()

	body := `{"closes":[44.34,44.09,44.15],"period":14}`
	resp, err := http.Post(srv.URL+"/ta/indicators", "application/json", bytes.NewBufferString(body))
	if err != nil {
		t.Fatalf("POST /ta/indicators: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusInternalServerError {
		t.Errorf("status: want 500, got %d", resp.StatusCode)
	}
	var respBody map[string]any
	json.NewDecoder(resp.Body).Decode(&respBody)
	if respBody["error"] != "internal error" {
		t.Errorf("error field: want %q, got %v", "internal error", respBody["error"])
	}
}

// TestIndicators_DBBackedPath_RepoError_500 exercises the symbol-only (DB-backed)
// path through the router when the PriceRepo returns an error — a second live
// trigger of the useCase-error 500 branch, distinct from the calculator-error path.
func TestIndicators_DBBackedPath_RepoError_500(t *testing.T) {
	srv := buildServer(&fakeCalculator{}, &fakePriceRepo{err: fmt.Errorf("db unavailable")})
	defer srv.Close()

	body := `{"symbol":"VCB"}`
	resp, err := http.Post(srv.URL+"/ta/indicators", "application/json", bytes.NewBufferString(body))
	if err != nil {
		t.Fatalf("POST /ta/indicators: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusInternalServerError {
		t.Errorf("status: want 500, got %d", resp.StatusCode)
	}
}
