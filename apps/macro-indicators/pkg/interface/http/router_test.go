// Package http — smoke tests for the HTTP interface layer.
// Validates that all routes return correct HTTP status + Content-Type.
// Uses httptest.NewServer so no port binding is required.
// FE-RR-MACRO-EXTERNAL: GET /external smoke test added.
// CARRY-YIELD-SINGLE-SIGNAL-FIXTURE: TestCarryYieldEndpointsRetired guards against
// accidental re-addition of the retired fixture handlers (Option B consolidation).
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

// TestCarryYieldEndpointsRetired asserts that GET /carry-trade-signal and
// GET /yield-spread-signal return 404 after the single-signal handlers were
// retired (Option B consolidation, CARRY-YIELD-SINGLE-SIGNAL-FIXTURE brief).
// If these return 200, a fixture handler was accidentally re-added.
func TestCarryYieldEndpointsRetired(t *testing.T) {
	srv := httptest.NewServer(newTestRouter())
	defer srv.Close()

	for _, path := range []string{"/carry-trade-signal", "/yield-spread-signal"} {
		resp, err := http.Get(srv.URL + path)
		if err != nil {
			t.Fatalf("GET %s failed: %v", path, err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusNotFound {
			t.Errorf("GET %s: expected 404 (endpoint retired), got %d — fixture handler must have been re-added", path, resp.StatusCode)
		}
	}
}

func TestExternalRoute(t *testing.T) {
	// GET /external with nil useCase → 503 honest-unavailable.
	// The nil-useCase path proves the route is registered and the handler guards safely.
	srv := httptest.NewServer(newTestRouter())
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/external")
	if err != nil {
		t.Fatalf("GET /external failed: %v", err)
	}
	defer resp.Body.Close()

	// nil useCase → 503 (honest unavailable — no fabricated data).
	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Errorf("GET /external (nil useCase): expected 503, got %d", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Errorf("GET /external: Content-Type=%q, want application/json prefix", ct)
	}
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), "unavailable") {
		t.Errorf("GET /external (nil useCase): body missing 'unavailable' field: %s", body)
	}
}

// TestMacroCalendarRoute asserts the honest-unavailable contract (FDA-4).
// No fabricated event rows must appear; status must be "unavailable";
// envelope fields (events, daysRequested, status, is_estimate, source_tier) must be present.
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
	bodyStr := string(body)

	// Honest-unavailable envelope fields must be present.
	for _, field := range []string{"events", "daysRequested", "unavailable", "is_estimate", "source_tier"} {
		if !strings.Contains(bodyStr, field) {
			t.Errorf("GET /macro-calendar: body missing %q field: %s", field, bodyStr)
		}
	}

	// Fabricated event rows must NOT appear (FDA-4 definitif removal).
	for _, fabricated := range []string{"US Core PCE", "VN Industrial Output", "2026-05-23T18:52:00Z"} {
		if strings.Contains(bodyStr, fabricated) {
			t.Errorf("GET /macro-calendar: body contains fabricated data %q — hardcoded events must not be served: %s", fabricated, bodyStr)
		}
	}
}
