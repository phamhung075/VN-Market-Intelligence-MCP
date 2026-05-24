// Package http — handler integration tests using httptest.
// Mirrors AC-3 (JSON envelope parity), AC-12 (validation), AC-14 (path/query params).
package http_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/vn-market-intelligence/stock-price/pkg/application"
	"github.com/vn-market-intelligence/stock-price/pkg/domain"
	httphandler "github.com/vn-market-intelligence/stock-price/pkg/interface/http"
	priceresolution "github.com/vn-market-intelligence/stock-price/pkg/module/price_resolution"
)

// ── mock ports ────────────────────────────────────────────────────────────────

// mockResolver implements application.PriceResolverPort using a pre-built quote.
type mockResolver struct {
	quote *domain.PriceQuote
}

func (m *mockResolver) Resolve(code string) (*priceresolution.ResolvedQuote, error) {
	if m.quote == nil {
		return nil, &domain.PriceNotAvailableError{Code: code}
	}
	q := *m.quote
	q.Code = code
	return &priceresolution.ResolvedQuote{PriceQuote: q, Staleness: "FRESH"}, nil
}

type mockHistory struct {
	rows []domain.DailyOHLCV
	err  error
}

func (h *mockHistory) GetHistory(_ string, _ int) ([]domain.DailyOHLCV, error) {
	return h.rows, h.err
}
func (h *mockHistory) SaveQuote(_ *domain.PriceQuote) error { return nil }

// ── test fixtures ─────────────────────────────────────────────────────────────

func makeVCBQuote() *domain.PriceQuote {
	return &domain.PriceQuote{
		Code:          "VCB",
		Price:         88000,
		Volume:        2000000,
		Change:        -1000,
		ChangePercent: -1.12,
		Source:        domain.SourceHOSE,
		LatencyMs:     45,
		FetchedAt:     time.Now().UTC().Format(time.RFC3339),
	}
}

func makeHistoryRows(n int) []domain.DailyOHLCV {
	rows := make([]domain.DailyOHLCV, n)
	for i := range rows {
		rows[i] = domain.DailyOHLCV{
			Date: "2026-01-01", Open: 85000, High: 87000,
			Low: 84000, Close: 86000, Volume: 1000000,
		}
	}
	return rows
}

// buildServer wires up the handler with the provided mocks.
func buildServer(
	r *mockResolver,
	h *mockHistory,
) *httptest.Server {
	fetchUC := application.NewFetchPriceUseCase(r)
	historyUC := application.NewPriceHistoryUseCase(h)

	handler := httphandler.NewHandler(fetchUC, historyUC)
	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)
	return httptest.NewServer(mux)
}

// ── GET /health ───────────────────────────────────────────────────────────────

func TestHealth_Returns200(t *testing.T) {
	srv := buildServer(&mockResolver{}, &mockHistory{})
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
	json.NewDecoder(resp.Body).Decode(&body)
	if body["status"] != "ok" {
		t.Errorf("status field: want ok, got %v", body["status"])
	}
	if body["service"] != "stock-price" {
		t.Errorf("service field: want stock-price, got %v", body["service"])
	}
}

// ── POST /price/fetch ─────────────────────────────────────────────────────────

func TestPriceFetch_Success_JSONShape(t *testing.T) {
	srv := buildServer(&mockResolver{quote: makeVCBQuote()}, &mockHistory{})
	defer srv.Close()

	body := `{"code":"VCB"}`
	resp, err := http.Post(srv.URL+"/price/fetch", "application/json", bytes.NewBufferString(body))
	if err != nil {
		t.Fatalf("POST /price/fetch: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("status: want 200, got %d", resp.StatusCode)
	}
	var result application.FetchPriceResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if result.Code != "VCB" {
		t.Errorf("code: want VCB, got %s", result.Code)
	}
	if result.Price != 88000 {
		t.Errorf("price: want 88000, got %f", result.Price)
	}
	if result.FetchedAt == "" {
		t.Error("fetchedAt must not be empty")
	}
	if result.Source != domain.SourceHOSE {
		t.Errorf("source: want hose, got %s", result.Source)
	}
}

func TestPriceFetch_LowercaseCodeUppercased(t *testing.T) {
	srv := buildServer(&mockResolver{quote: makeVCBQuote()}, &mockHistory{})
	defer srv.Close()

	body := `{"code":"vcb"}`
	resp, _ := http.Post(srv.URL+"/price/fetch", "application/json", bytes.NewBufferString(body))
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("status: want 200, got %d", resp.StatusCode)
	}
	var result application.FetchPriceResponse
	json.NewDecoder(resp.Body).Decode(&result)
	if result.Code != "VCB" {
		t.Errorf("code: want VCB (uppercased), got %s", result.Code)
	}
}

func TestPriceFetch_MissingCode_400(t *testing.T) {
	srv := buildServer(&mockResolver{quote: makeVCBQuote()}, &mockHistory{})
	defer srv.Close()

	body := `{}`
	resp, _ := http.Post(srv.URL+"/price/fetch", "application/json", bytes.NewBufferString(body))
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status: want 400, got %d", resp.StatusCode)
	}
}

func TestPriceFetch_InvalidJSON_400(t *testing.T) {
	srv := buildServer(&mockResolver{quote: makeVCBQuote()}, &mockHistory{})
	defer srv.Close()

	resp, _ := http.Post(srv.URL+"/price/fetch", "application/json", bytes.NewBufferString("not-json"))
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status: want 400, got %d", resp.StatusCode)
	}
}

func TestPriceFetch_NotAvailable_404(t *testing.T) {
	srv := buildServer(&mockResolver{quote: nil}, &mockHistory{})
	defer srv.Close()

	body := `{"code":"UNKNOWN"}`
	resp, _ := http.Post(srv.URL+"/price/fetch", "application/json", bytes.NewBufferString(body))
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status: want 404, got %d", resp.StatusCode)
	}
}

// ── GET /price/history?code=X&days=N (R-SPEC-2: query param route) ────────────

func TestPriceHistory_QueryParam_Success(t *testing.T) {
	rows := makeHistoryRows(5)
	srv := buildServer(&mockResolver{}, &mockHistory{rows: rows})
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/price/history?code=VCB&days=5")
	if err != nil {
		t.Fatalf("GET /price/history: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("status: want 200, got %d", resp.StatusCode)
	}
	var result application.PriceHistoryResponse
	json.NewDecoder(resp.Body).Decode(&result)
	if result.Code != "VCB" {
		t.Errorf("code: want VCB, got %s", result.Code)
	}
	if len(result.History) != 5 {
		t.Errorf("history len: want 5, got %d", len(result.History))
	}
}

func TestPriceHistory_QueryParam_DefaultDays(t *testing.T) {
	rows := makeHistoryRows(30)
	srv := buildServer(&mockResolver{}, &mockHistory{rows: rows})
	defer srv.Close()

	resp, _ := http.Get(srv.URL + "/price/history?code=VCB")
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("status: want 200, got %d", resp.StatusCode)
	}
}

func TestPriceHistory_QueryParam_MissingCode_400(t *testing.T) {
	srv := buildServer(&mockResolver{}, &mockHistory{})
	defer srv.Close()

	resp, _ := http.Get(srv.URL + "/price/history?days=5")
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status: want 400, got %d", resp.StatusCode)
	}
}

func TestPriceHistory_QueryParam_InvalidDays_400(t *testing.T) {
	srv := buildServer(&mockResolver{}, &mockHistory{})
	defer srv.Close()

	resp, _ := http.Get(srv.URL + "/price/history?code=VCB&days=0")
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status: want 400, got %d", resp.StatusCode)
	}
}

// ── GET /price/history/:code?days=N (backward compat path param) ─────────────

func TestPriceHistory_PathParam_Success(t *testing.T) {
	rows := makeHistoryRows(10)
	srv := buildServer(&mockResolver{}, &mockHistory{rows: rows})
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/price/history/VCB?days=10")
	if err != nil {
		t.Fatalf("GET /price/history/:code: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("status: want 200, got %d", resp.StatusCode)
	}
	var result application.PriceHistoryResponse
	json.NewDecoder(resp.Body).Decode(&result)
	if result.Code != "VCB" {
		t.Errorf("code: want VCB, got %s", result.Code)
	}
}
