// Package integration contains end-to-end wiring tests for the api-gateway.
// These tests build the REAL handler stack — loadManifest → CapabilityProber →
// domain.AggregateHealthService → AggregateHealthUseCase → HandleHealth — and
// hit /health via httptest, asserting the full JSON response shape.
//
// This is the acceptance bar for FOU-3-GW (REQ2): a passing unit test with an
// injected prober is NOT enough — the full wiring must be exercised.
package integration_test

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/vn-market-intelligence/api-gateway/pkg/application"
	"github.com/vn-market-intelligence/api-gateway/pkg/domain"
	"github.com/vn-market-intelligence/api-gateway/pkg/infrastructure"
	httpinterface "github.com/vn-market-intelligence/api-gateway/pkg/interface/http"
)

// ── fixture builder ────────────────────────────────────────────────────────────

// writeFixtureSystemMap writes a system-map.json with the REAL nesting shape
// (including "_note" and "_ground_truth_date" metadata string keys) to a temp
// file and returns the path.  This mirrors the production docs/data/system-map.json
// structure that caused the bug: metadata strings mixed with service-entry objects.
func writeFixtureSystemMap(t *testing.T, mcpBaseURL string, probeErr bool) string {
	t.Helper()

	// probeToolName: if probeErr is set we use a tool name the fake MCP will
	// reject with an error, so we can prove baseline-on-error behaviour.
	probeToolForMacro := "get_macro_snapshot"
	if probeErr {
		probeToolForMacro = "tool_that_errors"
	}

	manifest := map[string]interface{}{
		// Metadata string keys — these are the exact keys present in production
		// system-map.json that caused json.Unmarshal to fail with:
		//   "cannot unmarshal string into Go struct field"
		"_note":               "metadata string — must be silently skipped by loadManifest",
		"_ground_truth_date":  "2026-06-02",
		// Service entries (objects)
		"macro": map[string]interface{}{
			"capability":   "live",
			"probe_type":   "mcp_tool",
			"probe":        probeToolForMacro,
			"live_evidence": "2026-06-02 21:00Z",
		},
		"ta": map[string]interface{}{
			"capability":      "data_limited",
			"probe_type":      "mcp_tool",
			"probe":           "get_technical_indicators",
			"capability_note": "30/35 candles available",
			"live_evidence":   "tier3 2026-06-02",
		},
		"rag": map[string]interface{}{
			"capability":    "dark",
			"probe_type":    "none",
			"probe":         nil,
			"live_evidence": "embedded",
		},
	}

	systemMap := map[string]interface{}{
		"project": map[string]interface{}{
			"infrastructure": map[string]interface{}{
				"docker": map[string]interface{}{
					"host_runtime_set": map[string]interface{}{
						"capability_manifest": manifest,
					},
				},
			},
		},
	}

	data, err := json.Marshal(systemMap)
	if err != nil {
		t.Fatalf("writeFixtureSystemMap: marshal: %v", err)
	}

	dir := t.TempDir()
	path := filepath.Join(dir, "system-map.json")
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatalf("writeFixtureSystemMap: write: %v", err)
	}
	return path
}

// ── fake MCP server ────────────────────────────────────────────────────────────

// newFakeMCPServer returns an httptest.Server that:
//   - GET /health → 200 {"status":"ok","toolCount":156}
//   - POST /mcp with body containing "tool_that_errors" → JSON-RPC error
//   - POST /mcp with any other tool name → 200 valid JSON-RPC response
func newFakeMCPServer(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet && r.URL.Path == "/health" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"status":"ok","toolCount":156}`))
			return
		}

		if r.Method == http.MethodPost && r.URL.Path == "/mcp" {
			body, _ := io.ReadAll(r.Body)
			_ = r.Body.Close()

			if strings.Contains(string(body), "tool_that_errors") {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"Method not found"}}`))
				return
			}

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"ok"}]}}`))
			return
		}

		w.WriteHeader(http.StatusNotFound)
	}))
}

// ── full wiring builder ────────────────────────────────────────────────────────

// buildRealHealthRouter builds the full real handler stack:
//   - infrastructure.CapabilityProber with real loadManifest reading fixturePath
//   - domain.AggregateHealthService wired with a stub health checker (mcp=ok, rest=not_deployed)
//   - application.AggregateHealthUseCase
//   - httpinterface.GatewayHandlers / NewRouter
//
// The CapabilityProber's HTTP client is pointed at fakeMCPURL so probes go to
// the fake server, not the real mcp-server:3000.
func buildRealHealthRouter(t *testing.T, fixturePath, fakeMCPURL string) http.Handler {
	t.Helper()

	// Use a real CapabilityProber with a short-timeout HTTP client targeting the fake MCP.
	// Use NewCapabilityProberForTest so we can inject the fake client.
	fakeClient := &http.Client{}
	prober := infrastructure.NewCapabilityProberForTest(fakeMCPURL, fixturePath, 60e9, 3000, fakeClient)

	// Service registry: mcp deployed, ta/rag/macro not deployed.
	notDeployed := []string{"ta", "rag", "macro"}
	registry := infrastructure.NewStaticServiceRegistryWithNotDeployed(map[string]string{
		"mcp": fakeMCPURL,
	}, notDeployed)

	// Health checker stub: mcp=ok, not-deployed services are skipped by domain service.
	checker := &stubHealthChecker{}

	domainSvc := domain.NewAggregateHealthService(checker, registry, notDeployed).
		WithCapabilityProber(prober)

	aggregateUC := application.NewAggregateHealthUseCase(domainSvc)
	serviceUC := application.NewServiceHealthUseCase(registry, checker)

	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	handlers := httpinterface.NewGatewayHandlers(aggregateUC, serviceUC, registry, logger)
	return httpinterface.NewRouter(handlers, logger)
}

// stubHealthChecker returns ok for any service probe.
type stubHealthChecker struct{}

func (s *stubHealthChecker) CheckHealth(_ context.Context, svc *domain.ServiceConfig) (*domain.ServiceHealthResult, error) {
	return &domain.ServiceHealthResult{Service: svc.Name, Status: domain.StatusOk, LatencyMs: 10}, nil
}

// ── integration tests ─────────────────────────────────────────────────────────

// TestIntegration_HealthCapabilities_FieldPresent is the primary acceptance test
// for FOU-3-GW REQ2.  It exercises the FULL wiring:
//
//	fixture system-map.json (with _note/_ground_truth_date metadata keys)
//	→ real loadManifest (must skip metadata, load 3 service entries)
//	→ CapabilityProber.ProbeAll (fake MCP server)
//	→ domain.AggregateHealthService.Aggregate
//	→ HandleHealth → /health JSON response
//
// Asserts:
//   - HTTP 200
//   - JSON has "capabilities" field (was absent pre-fix)
//   - capabilities["ta"].capability == "data_limited"
//   - capabilities["ta"].capabilityNote == "30/35 candles available"
//   - capabilities["rag"].capability == "dark" (probe_type=none, no HTTP probe)
//   - capabilities["macro"].capability == "live" (probe succeeded)
func TestIntegration_HealthCapabilities_FieldPresent(t *testing.T) {
	fakeMCP := newFakeMCPServer(t)
	defer fakeMCP.Close()

	fixturePath := writeFixtureSystemMap(t, fakeMCP.URL, false /* probeErr=false */)
	router := buildRealHealthRouter(t, fixturePath, fakeMCP.URL)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK && rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 200 or 503, got %d — body: %s", rec.Code, rec.Body.String())
	}

	var result map[string]interface{}
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode /health JSON: %v", err)
	}

	// PRIMARY ASSERTION: capabilities field must be present.
	capsRaw, ok := result["capabilities"]
	if !ok {
		t.Fatalf("FAIL: /health response missing 'capabilities' field — omitempty dropped it (root cause: loadManifest returned empty); full response: %v", result)
	}

	caps, ok := capsRaw.(map[string]interface{})
	if !ok {
		t.Fatalf("expected capabilities to be an object, got %T", capsRaw)
	}

	// ta: data_limited + note
	taRaw, ok := caps["ta"]
	if !ok {
		t.Fatal("expected 'ta' in capabilities")
	}
	ta := taRaw.(map[string]interface{})
	if ta["capability"] != "data_limited" {
		t.Errorf("ta.capability: expected 'data_limited', got %v", ta["capability"])
	}
	if ta["capabilityNote"] != "30/35 candles available" {
		t.Errorf("ta.capabilityNote: expected '30/35 candles available', got %v", ta["capabilityNote"])
	}

	// rag: dark (probe_type=none — no HTTP probe fired)
	ragRaw, ok := caps["rag"]
	if !ok {
		t.Fatal("expected 'rag' in capabilities")
	}
	rag := ragRaw.(map[string]interface{})
	if rag["capability"] != "dark" {
		t.Errorf("rag.capability: expected 'dark', got %v", rag["capability"])
	}

	// macro: live (probe succeeded)
	macroRaw, ok := caps["macro"]
	if !ok {
		t.Fatal("expected 'macro' in capabilities")
	}
	macro := macroRaw.(map[string]interface{})
	if macro["capability"] != "live" {
		t.Errorf("macro.capability: expected 'live', got %v", macro["capability"])
	}
}

// TestIntegration_HealthCapabilities_BaselineOnProbeError asserts that when a
// probe returns an RPC error (tool_that_errors → JSON-RPC error response), the
// service still APPEARS in capabilities at the manifest baseline.  This proves
// the contract: probe failure → baseline, NOT dropped entry.
func TestIntegration_HealthCapabilities_BaselineOnProbeError(t *testing.T) {
	fakeMCP := newFakeMCPServer(t)
	defer fakeMCP.Close()

	// probeErr=true → macro probe will get a JSON-RPC error from fake MCP
	fixturePath := writeFixtureSystemMap(t, fakeMCP.URL, true /* probeErr=true */)
	router := buildRealHealthRouter(t, fixturePath, fakeMCP.URL)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	var result map[string]interface{}
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode /health JSON: %v", err)
	}

	capsRaw, ok := result["capabilities"]
	if !ok {
		t.Fatal("capabilities field absent — baseline-on-probe-error path broken")
	}
	caps := capsRaw.(map[string]interface{})

	// macro probe errored — must still appear at manifest baseline "live"
	macroRaw, ok := caps["macro"]
	if !ok {
		t.Fatal("macro must appear in capabilities even when its probe errors (baseline fallback)")
	}
	macro := macroRaw.(map[string]interface{})
	if macro["capability"] != "live" {
		t.Errorf("macro.capability on probe error: expected baseline 'live', got %v", macro["capability"])
	}
}

// TestIntegration_HealthCapabilities_MetadataKeysSkipped asserts that the
// "_note" and "_ground_truth_date" metadata string keys in capability_manifest
// do NOT appear as capability entries in the /health response.
// This is the direct regression test for the parse-error root cause.
func TestIntegration_HealthCapabilities_MetadataKeysSkipped(t *testing.T) {
	fakeMCP := newFakeMCPServer(t)
	defer fakeMCP.Close()

	fixturePath := writeFixtureSystemMap(t, fakeMCP.URL, false)
	router := buildRealHealthRouter(t, fixturePath, fakeMCP.URL)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	var result map[string]interface{}
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode /health JSON: %v", err)
	}

	capsRaw, ok := result["capabilities"]
	if !ok {
		t.Fatal("capabilities field absent")
	}
	caps := capsRaw.(map[string]interface{})

	if _, found := caps["_note"]; found {
		t.Error("'_note' metadata key must NOT appear in capabilities output")
	}
	if _, found := caps["_ground_truth_date"]; found {
		t.Error("'_ground_truth_date' metadata key must NOT appear in capabilities output")
	}
}
