package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/vn-market-intelligence/kinh-dich-service/pkg/application"
	"github.com/vn-market-intelligence/kinh-dich-service/pkg/domain"
)

// stubPriceScorePort implements PriceScorePort for testing.
type stubPriceScorePort struct {
	scores map[string][]float64
}

func (s *stubPriceScorePort) ComputeScores(stockCode string, days int) []float64 {
	if s.scores == nil {
		return nil
	}
	return s.scores[stockCode]
}

// stubMarkovPort implements MarkovPort for testing.
type stubMarkovPort struct{}

func (s *stubMarkovPort) GetMarkovData(hexagramNumber int) *domain.MarkovData {
	return nil
}

func newTestUseCase(withPriceData bool) *application.ReadingUseCase {
	var pricePort domain.PriceScorePort
	if withPriceData {
		pricePort = &stubPriceScorePort{
			scores: map[string][]float64{
				"VNINDEX": {0.5, -0.3, 0.4, 0.2, -0.1, 0.6},
				"VCB":     {0.3, 0.2, 0.1, -0.2, 0.4, 0.5},
				"FPT":     {-0.1, 0.3, 0.2, 0.4, -0.3, 0.1},
			},
		}
	}
	markovPort := &stubMarkovPort{}
	svc := domain.NewReadingService(markovPort, pricePort)
	return application.NewReadingUseCase(svc)
}

// TestReadingRoute_Returns200_WithValidCode tests GET /reading/{code} returns 200 with valid stock code.
func TestReadingRoute_Returns200_WithValidCode(t *testing.T) {
	uc := newTestUseCase(true)
	router := NewRouter(uc)

	req := httptest.NewRequest("GET", "/reading/VCB", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp["stock"] != "VCB" {
		t.Errorf("expected stock=VCB, got %v", resp["stock"])
	}
	if _, ok := resp["hexagram"]; !ok {
		t.Error("expected hexagram field in response")
	}
}

// TestReadingRoute_Returns503_WithNoData tests GET /reading/{code} returns 503 when no price data.
func TestReadingRoute_Returns503_WithNoData(t *testing.T) {
	uc := newTestUseCase(false)
	router := NewRouter(uc)

	req := httptest.NewRequest("GET", "/reading/VCB", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("expected status 503, got %d", w.Code)
	}
}

// TestReadingRoute_Returns400_WithEmptyCode tests that empty code path is not matched (404).
func TestReadingRoute_Returns404_WithEmptyCode(t *testing.T) {
	uc := newTestUseCase(true)
	router := NewRouter(uc)

	req := httptest.NewRequest("GET", "/reading/", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Chi router with /reading/{code} won't match /reading/ - should be 404
	if w.Code != http.StatusNotFound {
		t.Errorf("expected status 404 for empty code path, got %d", w.Code)
	}
}

// TestHistoryRoute_Returns200 tests GET /readings/{code}/history returns 200.
func TestHistoryRoute_Returns200(t *testing.T) {
	uc := newTestUseCase(true)
	router := NewRouter(uc)

	req := httptest.NewRequest("GET", "/readings/VCB/history", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp["stock"] != "VCB" {
		t.Errorf("expected stock=VCB, got %v", resp["stock"])
	}
}

// TestHistoryRoute_WithDaysParam tests GET /readings/{code}/history?days=7 parses query param.
func TestHistoryRoute_WithDaysParam(t *testing.T) {
	uc := newTestUseCase(true)
	router := NewRouter(uc)

	req := httptest.NewRequest("GET", "/readings/VCB/history?days=7", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp["days"] != float64(7) {
		t.Errorf("expected days=7, got %v", resp["days"])
	}
}

// TestTransitionsRoute_Returns200 tests GET /hexagram/{number}/transitions returns 200.
func TestTransitionsRoute_Returns200(t *testing.T) {
	uc := newTestUseCase(true)
	router := NewRouter(uc)

	req := httptest.NewRequest("GET", "/hexagram/1/transitions", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp["hexagram"] != float64(1) {
		t.Errorf("expected hexagram=1, got %v", resp["hexagram"])
	}
}

// TestTransitionsRoute_Returns400_InvalidNumber tests GET /hexagram/0/transitions returns 400.
func TestTransitionsRoute_Returns400_InvalidNumber(t *testing.T) {
	uc := newTestUseCase(true)
	router := NewRouter(uc)

	testCases := []string{
		"/hexagram/0/transitions",
		"/hexagram/65/transitions",
		"/hexagram/abc/transitions",
		"/hexagram/-1/transitions",
	}

	for _, path := range testCases {
		req := httptest.NewRequest("GET", path, nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("path %s: expected status 400, got %d", path, w.Code)
		}
	}
}

// TestBacktestRoute_Returns200 tests GET /backtest/{code} returns 200.
func TestBacktestRoute_Returns200(t *testing.T) {
	uc := newTestUseCase(true)
	router := NewRouter(uc)

	req := httptest.NewRequest("GET", "/backtest/VCB", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp["stock"] != "VCB" {
		t.Errorf("expected stock=VCB, got %v", resp["stock"])
	}
}

// TestExplainRoute_Returns200 tests GET /hexagram/{number}/explain returns 200.
func TestExplainRoute_Returns200(t *testing.T) {
	uc := newTestUseCase(true)
	router := NewRouter(uc)

	req := httptest.NewRequest("GET", "/hexagram/1/explain", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp["number"] != float64(1) {
		t.Errorf("expected number=1, got %v", resp["number"])
	}
	if resp["name"] == nil || resp["name"] == "" {
		t.Error("expected non-empty name field")
	}
}

// TestExplainRoute_Returns400_InvalidNumber tests GET /hexagram/0/explain returns 400.
func TestExplainRoute_Returns400_InvalidNumber(t *testing.T) {
	uc := newTestUseCase(true)
	router := NewRouter(uc)

	testCases := []string{
		"/hexagram/0/explain",
		"/hexagram/65/explain",
		"/hexagram/abc/explain",
	}

	for _, path := range testCases {
		req := httptest.NewRequest("GET", path, nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("path %s: expected status 400, got %d", path, w.Code)
		}
	}
}

// TestMarketRoute_Returns200 tests GET /market continues to work (existing route).
func TestMarketRoute_Returns200(t *testing.T) {
	uc := newTestUseCase(true)
	router := NewRouter(uc)

	req := httptest.NewRequest("GET", "/market", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}
}

// TestMarketRoute_Returns503_NoData tests GET /market returns 503 when no price data.
func TestMarketRoute_Returns503_NoData(t *testing.T) {
	uc := newTestUseCase(false)
	router := NewRouter(uc)

	req := httptest.NewRequest("GET", "/market", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("expected status 503, got %d", w.Code)
	}
}

// TestHealthRoute tests GET /health returns 200.
func TestHealthRoute(t *testing.T) {
	uc := newTestUseCase(true)
	router := NewRouter(uc)

	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}
}

// TestAllRoutesNotReturn501 verifies none of the 5 newly wired routes return 501.
func TestAllRoutesNotReturn501(t *testing.T) {
	uc := newTestUseCase(true)
	router := NewRouter(uc)

	routes := []string{
		"/reading/VCB",
		"/readings/VCB/history",
		"/hexagram/1/transitions",
		"/backtest/VCB",
		"/hexagram/1/explain",
	}

	for _, path := range routes {
		req := httptest.NewRequest("GET", path, nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code == http.StatusNotImplemented {
			t.Errorf("route %s should not return 501 (Not Implemented)", path)
		}
	}
}
