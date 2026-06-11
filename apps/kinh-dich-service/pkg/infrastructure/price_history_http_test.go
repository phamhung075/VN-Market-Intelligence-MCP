package infrastructure

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestParsePriceHistoryJSON_Golden(t *testing.T) {
	// Golden path: valid JSON from API
	jsonBody := []byte(`{
		"code": "VNINDEX",
		"history": [
			{"date": "2026-05-12", "open": 1895.5, "high": 1898.04, "low": 1875.59, "close": 1882.02, "volume": 452863189},
			{"date": "2026-05-13", "open": 1880.00, "high": 1890.00, "low": 1870.00, "close": 1885.50, "volume": 400000000},
			{"date": "2026-05-14", "open": 1885.50, "high": 1900.00, "low": 1880.00, "close": 1895.00, "volume": 450000000}
		]
	}`)

	rows, err := ParsePriceHistoryJSON(jsonBody)
	if err != nil {
		t.Fatalf("ParsePriceHistoryJSON failed: %v", err)
	}

	if len(rows) != 3 {
		t.Fatalf("expected 3 rows, got %d", len(rows))
	}

	// Verify first row
	if rows[0].Price != 1882.02 {
		t.Errorf("row[0].Price: expected 1882.02, got %f", rows[0].Price)
	}
	if rows[0].Timestamp != "2026-05-12" {
		t.Errorf("row[0].Timestamp: expected 2026-05-12, got %s", rows[0].Timestamp)
	}

	// Verify last row
	if rows[2].Price != 1895.00 {
		t.Errorf("row[2].Price: expected 1895.00, got %f", rows[2].Price)
	}
	if rows[2].Timestamp != "2026-05-14" {
		t.Errorf("row[2].Timestamp: expected 2026-05-14, got %s", rows[2].Timestamp)
	}
}

func TestParsePriceHistoryJSON_InvalidJSON(t *testing.T) {
	// Edge case: invalid JSON
	jsonBody := []byte(`{not valid json}`)

	_, err := ParsePriceHistoryJSON(jsonBody)
	if err == nil {
		t.Error("expected error for invalid JSON, got nil")
	}
}

func TestParsePriceHistoryJSON_EmptyHistory(t *testing.T) {
	// Edge case: empty history array
	jsonBody := []byte(`{"code": "VNINDEX", "history": []}`)

	rows, err := ParsePriceHistoryJSON(jsonBody)
	if err != nil {
		t.Fatalf("ParsePriceHistoryJSON failed: %v", err)
	}

	if len(rows) != 0 {
		t.Errorf("expected 0 rows, got %d", len(rows))
	}
}

func TestHTTPPriceHistorySource_GetPriceHistory_Golden(t *testing.T) {
	// Set up mock server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify request path
		if r.URL.Path != "/stock/price/history" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}

		// Verify query params
		code := r.URL.Query().Get("code")
		if code != "VNINDEX" {
			t.Errorf("expected code=VNINDEX, got %s", code)
		}
		days := r.URL.Query().Get("days")
		if days != "30" {
			t.Errorf("expected days=30, got %s", days)
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{
			"code": "VNINDEX",
			"history": [
				{"date": "2026-05-01", "open": 1800.0, "high": 1810.0, "low": 1790.0, "close": 1805.0, "volume": 100000000},
				{"date": "2026-05-02", "open": 1805.0, "high": 1815.0, "low": 1795.0, "close": 1810.0, "volume": 110000000},
				{"date": "2026-05-03", "open": 1810.0, "high": 1820.0, "low": 1800.0, "close": 1815.0, "volume": 120000000},
				{"date": "2026-05-04", "open": 1815.0, "high": 1825.0, "low": 1805.0, "close": 1820.0, "volume": 130000000},
				{"date": "2026-05-05", "open": 1820.0, "high": 1830.0, "low": 1810.0, "close": 1825.0, "volume": 140000000},
				{"date": "2026-05-06", "open": 1825.0, "high": 1835.0, "low": 1815.0, "close": 1830.0, "volume": 150000000},
				{"date": "2026-05-07", "open": 1830.0, "high": 1840.0, "low": 1820.0, "close": 1835.0, "volume": 160000000}
			]
		}`))
	}))
	defer server.Close()

	// Create source with mock server URL
	source := &HTTPPriceHistorySource{
		baseURL: server.URL,
		client:  server.Client(),
	}

	rows, err := source.GetPriceHistory("VNINDEX", 30)
	if err != nil {
		t.Fatalf("GetPriceHistory failed: %v", err)
	}

	if len(rows) != 7 {
		t.Fatalf("expected 7 rows, got %d", len(rows))
	}

	// Verify prices are close values
	expectedPrices := []float64{1805.0, 1810.0, 1815.0, 1820.0, 1825.0, 1830.0, 1835.0}
	for i, expected := range expectedPrices {
		if rows[i].Price != expected {
			t.Errorf("row[%d].Price: expected %f, got %f", i, expected, rows[i].Price)
		}
	}
}

func TestHTTPPriceHistorySource_GetPriceHistory_Non200(t *testing.T) {
	// Edge case: non-200 response
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	source := &HTTPPriceHistorySource{
		baseURL: server.URL,
		client:  server.Client(),
	}

	_, err := source.GetPriceHistory("VNINDEX", 30)
	if err == nil {
		t.Error("expected error for non-200 response, got nil")
	}
}

func TestHTTPPriceHistorySource_GetPriceHistory_InvalidJSON(t *testing.T) {
	// Edge case: 200 OK but invalid JSON body
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{invalid json`))
	}))
	defer server.Close()

	source := &HTTPPriceHistorySource{
		baseURL: server.URL,
		client:  server.Client(),
	}

	_, err := source.GetPriceHistory("VNINDEX", 30)
	if err == nil {
		t.Error("expected error for invalid JSON, got nil")
	}
}

func TestHTTPPriceHistorySource_Parameterized(t *testing.T) {
	// Verify the adapter is parameterized by code (not hardcoded to VNINDEX)
	testCases := []struct {
		code string
		days int
	}{
		{"VNINDEX", 30},
		{"VCB", 14},
		{"FPT", 7},
		{"ACB", 60},
	}

	for _, tc := range testCases {
		t.Run(tc.code, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				code := r.URL.Query().Get("code")
				if code != tc.code {
					t.Errorf("expected code=%s, got %s", tc.code, code)
				}
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`{"code":"` + tc.code + `","history":[]}`))
			}))
			defer server.Close()

			source := &HTTPPriceHistorySource{
				baseURL: server.URL,
				client:  server.Client(),
			}

			_, err := source.GetPriceHistory(tc.code, tc.days)
			if err != nil {
				t.Fatalf("GetPriceHistory failed: %v", err)
			}
		})
	}
}
