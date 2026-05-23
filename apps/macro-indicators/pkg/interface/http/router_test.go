// Package http — smoke tests for the HTTP interface layer.
// Validates that all routes return correct HTTP status + Content-Type.
// Uses httptest.NewServer so no port binding is required.
package http

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/vn-market-intelligence/macro-indicators/pkg/application"
)

// newTestRouter wires NewRouter with nil useCase (safe — snapshot handler ignores it).
func newTestRouter() http.Handler {
	return NewRouter((*application.ComputeMacroUseCase)(nil), nil)
}

func TestHealthRoute(t *testing.T) {
	srv := httptest.NewServer(newTestRouter())
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/health")
	if err != nil {
		t.Fatalf("GET /health failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("GET /health: expected 200, got %d", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Errorf("GET /health: Content-Type=%q, want application/json prefix", ct)
	}
}

func TestCarryTradeSignalRoute(t *testing.T) {
	srv := httptest.NewServer(newTestRouter())
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/carry-trade-signal")
	if err != nil {
		t.Fatalf("GET /carry-trade-signal failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("GET /carry-trade-signal: expected 200, got %d", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Errorf("GET /carry-trade-signal: Content-Type=%q, want application/json prefix", ct)
	}
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), "regime") {
		t.Errorf("GET /carry-trade-signal: body missing 'regime' field: %s", body)
	}
	if !strings.Contains(string(body), "HOT_MONEY_INFLOW") {
		t.Errorf("GET /carry-trade-signal: body missing 'HOT_MONEY_INFLOW': %s", body)
	}
}

func TestYieldSpreadSignalRoute(t *testing.T) {
	srv := httptest.NewServer(newTestRouter())
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/yield-spread-signal")
	if err != nil {
		t.Fatalf("GET /yield-spread-signal failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("GET /yield-spread-signal: expected 200, got %d", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Errorf("GET /yield-spread-signal: Content-Type=%q, want application/json prefix", ct)
	}
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), "label") {
		t.Errorf("GET /yield-spread-signal: body missing 'label' field: %s", body)
	}
	if !strings.Contains(string(body), "VN_ATTRACTIVE") {
		t.Errorf("GET /yield-spread-signal: body missing 'VN_ATTRACTIVE': %s", body)
	}
}

func TestMacroCalendarRoute(t *testing.T) {
	srv := httptest.NewServer(newTestRouter())
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/macro-calendar?days=60")
	if err != nil {
		t.Fatalf("GET /macro-calendar failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("GET /macro-calendar: expected 200, got %d", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Errorf("GET /macro-calendar: Content-Type=%q, want application/json prefix", ct)
	}
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), "events") {
		t.Errorf("GET /macro-calendar: body missing 'events' field: %s", body)
	}
	if !strings.Contains(string(body), "daysRequested") {
		t.Errorf("GET /macro-calendar: body missing 'daysRequested' field: %s", body)
	}
}
