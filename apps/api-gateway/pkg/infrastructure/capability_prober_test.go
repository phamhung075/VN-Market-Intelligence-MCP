package infrastructure_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/vn-market-intelligence/api-gateway/pkg/domain"
	"github.com/vn-market-intelligence/api-gateway/pkg/infrastructure"
)

// ── Helpers ───────────────────────────────────────────────────────────────────

// writeSystemMap writes a minimal system-map.json with the given capability_manifest
// to a temp file and returns its path.
func writeSystemMap(t *testing.T, manifest map[string]interface{}) string {
	t.Helper()
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
		t.Fatalf("failed to marshal system-map: %v", err)
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "system-map.json")
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatalf("failed to write system-map: %v", err)
	}
	return path
}

// buildManifest constructs a 7-entry capability_manifest (all not_deployed short_keys)
// where each entry uses the given server URL as the mcp-server.
// probe is the tool name (used in mcp_tool probe_type entries).
func buildManifest7(serverURL string) map[string]interface{} {
	probeStr := func(s string) *string { return &s }
	_ = probeStr
	return map[string]interface{}{
		"macro":     map[string]interface{}{"capability": "live", "probe_type": "mcp_tool", "probe": "get_macro_snapshot"},
		"stock":     map[string]interface{}{"capability": "live", "probe_type": "mcp_tool", "probe": "get_market_snapshot"},
		"kinh-dich": map[string]interface{}{"capability": "live", "probe_type": "mcp_tool", "probe": "get_portfolio_conviction"},
		"alert":     map[string]interface{}{"capability": "live", "probe_type": "mcp_tool", "probe": "get_alerts"},
		"news":      map[string]interface{}{"capability": "live", "probe_type": "mcp_tool", "probe": "get_agent_signals"},
		"ta":        map[string]interface{}{"capability": "data_limited", "probe_type": "mcp_tool", "probe": "get_technical_indicators", "capability_note": "30/35 candles available"},
		"pdf":       map[string]interface{}{"capability": "live", "probe_type": "mcp_tool", "probe": "get_financial_summary"},
	}
}

// ── Cache TTL test ─────────────────────────────────────────────────────────────

// TestCapabilityProber_CacheTTL verifies that a second ProbeAll call within the TTL
// window reuses cached results and does NOT issue new HTTP probes.
func TestCapabilityProber_CacheTTL(t *testing.T) {
	var probeCount int64

	// Upstream that counts calls
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&probeCount, 1)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":{"content":[]}}`))
	}))
	defer upstream.Close()

	path := writeSystemMap(t, buildManifest7(upstream.URL))

	// Use 2s TTL so the test doesn't have to wait 60s
	prober := infrastructure.NewCapabilityProberForTest(upstream.URL, path, 2*time.Second, 3000, upstream.Client())

	// First call — should fire probes for all 7 entries
	result1 := prober.ProbeAll(context.Background())
	countAfterFirst := atomic.LoadInt64(&probeCount)

	if countAfterFirst == 0 {
		t.Fatal("expected at least one probe on first ProbeAll call")
	}
	if len(result1) != 7 {
		t.Errorf("expected 7 capability entries, got %d", len(result1))
	}

	// Second call immediately after — should reuse cache, no new probes
	result2 := prober.ProbeAll(context.Background())
	countAfterSecond := atomic.LoadInt64(&probeCount)

	if countAfterSecond != countAfterFirst {
		t.Errorf("expected no new probes within TTL window: before=%d, after=%d",
			countAfterFirst, countAfterSecond)
	}
	if len(result2) != len(result1) {
		t.Errorf("expected same result size from cache, got %d vs %d", len(result2), len(result1))
	}
}

// ── Cache expiry test ─────────────────────────────────────────────────────────

// TestCapabilityProber_CacheExpiry verifies that after the TTL expires, new probes
// are issued on the next ProbeAll call.
func TestCapabilityProber_CacheExpiry(t *testing.T) {
	var probeCount int64

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&probeCount, 1)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":{"content":[]}}`))
	}))
	defer upstream.Close()

	path := writeSystemMap(t, buildManifest7(upstream.URL))

	// Use 50ms TTL so it expires quickly
	prober := infrastructure.NewCapabilityProberForTest(upstream.URL, path, 50*time.Millisecond, 3000, upstream.Client())

	prober.ProbeAll(context.Background())
	countAfterFirst := atomic.LoadInt64(&probeCount)

	// Wait for TTL to expire
	time.Sleep(100 * time.Millisecond)

	prober.ProbeAll(context.Background())
	countAfterSecond := atomic.LoadInt64(&probeCount)

	if countAfterSecond <= countAfterFirst {
		t.Errorf("expected new probes after TTL expiry: before=%d, after=%d",
			countAfterFirst, countAfterSecond)
	}
}

// ── Timeout fallback test ──────────────────────────────────────────────────────

// TestCapabilityProber_TimeoutFallback verifies that a slow probe (exceeds 3000ms)
// does NOT block ProbeAll and the result falls back to the manifest baseline.
func TestCapabilityProber_TimeoutFallback(t *testing.T) {
	// Upstream that hangs until signalled (allows clean shutdown from test)
	release := make(chan struct{})
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-release:
		}
	}))
	// Signal the handler to unblock before closing the server
	defer func() {
		close(release)
		upstream.Close()
	}()

	path := writeSystemMap(t, map[string]interface{}{
		"macro": map[string]interface{}{
			"capability": "live",
			"probe_type": "mcp_tool",
			"probe":      "get_macro_snapshot",
		},
	})

	// probeTimeoutMs = 50ms so we don't wait long in the test
	prober := infrastructure.NewCapabilityProberForTest(upstream.URL, path, 60*time.Second, 50, upstream.Client())

	start := time.Now()
	result := prober.ProbeAll(context.Background())
	elapsed := time.Since(start)

	// Must return quickly (well under 1s), not block
	if elapsed > 500*time.Millisecond {
		t.Errorf("ProbeAll blocked too long on timeout: %v", elapsed)
	}

	// Result must fall back to manifest baseline
	cap, ok := result["macro"]
	if !ok {
		t.Fatal("expected macro capability in result")
	}
	if cap.Capability != domain.CapabilityLive {
		t.Errorf("expected manifest baseline live, got %s", cap.Capability)
	}
}

// ── 7-probe cap test ──────────────────────────────────────────────────────────

// TestCapabilityProber_SevenProbeCap verifies that ProbeAll fires at most 7
// probes (one per not_deployed short_key in the manifest) — never a 156-tool fan-out.
func TestCapabilityProber_SevenProbeCap(t *testing.T) {
	var probeCount int64

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&probeCount, 1)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":{"content":[]}}`))
	}))
	defer upstream.Close()

	path := writeSystemMap(t, buildManifest7(upstream.URL))

	// Very short TTL to force a probe on every call in this test
	prober := infrastructure.NewCapabilityProberForTest(upstream.URL, path, 1*time.Millisecond, 3000, upstream.Client())

	// Wait for any initial TTL to expire
	time.Sleep(5 * time.Millisecond)

	atomic.StoreInt64(&probeCount, 0)
	prober.ProbeAll(context.Background())
	count := atomic.LoadInt64(&probeCount)

	// Must be exactly 7 (one per manifest entry, all with probe_type mcp_tool)
	if count > 7 {
		t.Errorf("probe fan-out exceeded 7: got %d probes (host-safety violation)", count)
	}
	if count == 0 {
		t.Error("expected at least 1 probe")
	}
}

// ── Static baseline test (probe_type none) ────────────────────────────────────

// TestCapabilityProber_NoneProbeTypeReturnsBaseline verifies that services with
// probe_type "none" (e.g. rag) are returned at their manifest baseline without
// issuing any HTTP probes.
func TestCapabilityProber_NoneProbeTypeReturnsBaseline(t *testing.T) {
	var probeCount int64

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&probeCount, 1)
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	path := writeSystemMap(t, map[string]interface{}{
		"rag": map[string]interface{}{
			"capability": "dark",
			"probe_type": "none",
			"probe":      nil,
		},
	})

	prober := infrastructure.NewCapabilityProberForTest(upstream.URL, path, 60*time.Second, 3000, upstream.Client())
	result := prober.ProbeAll(context.Background())

	if atomic.LoadInt64(&probeCount) != 0 {
		t.Error("expected no HTTP probes for probe_type=none")
	}

	cap, ok := result["rag"]
	if !ok {
		t.Fatal("expected rag in result")
	}
	if cap.Capability != domain.CapabilityDark {
		t.Errorf("expected dark baseline, got %s", cap.Capability)
	}
}

// ── Health endpoint probe test ────────────────────────────────────────────────

// TestCapabilityProber_HealthEndpointProbe verifies that the health_endpoint probe
// type performs a GET and treats 2xx as success.
func TestCapabilityProber_HealthEndpointProbe(t *testing.T) {
	var capturedMethod string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedMethod = r.Method
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok","toolCount":156}`))
	}))
	defer upstream.Close()

	path := writeSystemMap(t, map[string]interface{}{
		"mcp": map[string]interface{}{
			"capability": "n/a",
			"probe_type": "health_endpoint",
			"probe":      "/health",
		},
	})

	prober := infrastructure.NewCapabilityProberForTest(upstream.URL, path, 60*time.Second, 3000, upstream.Client())
	result := prober.ProbeAll(context.Background())

	if capturedMethod != http.MethodGet {
		t.Errorf("expected GET for health_endpoint probe, got %s", capturedMethod)
	}

	cap, ok := result["mcp"]
	if !ok {
		t.Fatal("expected mcp in result")
	}
	if cap.Capability != domain.CapabilityNA {
		t.Errorf("expected n/a baseline, got %s", cap.Capability)
	}
}

// ── Capability note preservation test ────────────────────────────────────────

// TestCapabilityProber_CapabilityNotePreserved verifies that the capability_note
// from the manifest is preserved in the result (e.g. "30/35 candles available").
func TestCapabilityProber_CapabilityNotePreserved(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":{"content":[]}}`))
	}))
	defer upstream.Close()

	path := writeSystemMap(t, map[string]interface{}{
		"ta": map[string]interface{}{
			"capability":      "data_limited",
			"probe_type":      "mcp_tool",
			"probe":           "get_technical_indicators",
			"capability_note": "30/35 candles available",
		},
	})

	prober := infrastructure.NewCapabilityProberForTest(upstream.URL, path, 60*time.Second, 3000, upstream.Client())
	result := prober.ProbeAll(context.Background())

	cap, ok := result["ta"]
	if !ok {
		t.Fatal("expected ta in result")
	}
	if cap.Capability != domain.CapabilityDataLimited {
		t.Errorf("expected data_limited, got %s", cap.Capability)
	}
	if cap.Note != "30/35 candles available" {
		t.Errorf("expected capability_note preserved, got %q", cap.Note)
	}
}

// ── Anti-false-green: deployed service stays red via domain service ────────────

// TestAggregateHealthService_DeployedDownNotRescuedByCapability verifies the
// anti-false-green invariant: a genuinely deployed service that is DOWN must stay
// DOWN regardless of what the capability prober returns.
func TestAggregateHealthService_DeployedDownNotRescuedByCapability(t *testing.T) {
	// Capability prober that reports every service as "live"
	prober := &mockCapabilityProber{
		result: map[string]*domain.ServiceCapability{
			"macro": {Capability: domain.CapabilityLive},
		},
	}

	checker := &mockHealthCheckerInfra{
		results: map[string]*domain.ServiceHealthResult{
			// macro is DEPLOYED but DOWN
			"macro": {Service: "macro", Status: domain.StatusDown, LatencyMs: -1},
			"mcp":   {Service: "mcp", Status: domain.StatusOk, LatencyMs: 50},
		},
	}
	registry := &mockServiceRegistryInfra{
		services: []*domain.ServiceConfig{
			{Name: "macro", HealthPath: "/health", TimeoutMs: 2000},
			{Name: "mcp", HealthPath: "/health", TimeoutMs: 2000},
		},
	}

	// macro is NOT in notDeployedSet — it's a deployed service
	svc := domain.NewAggregateHealthService(checker, registry, []string{}).
		WithCapabilityProber(prober)

	result, err := svc.Aggregate(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// macro must be DOWN in the container axis
	if result.Services["macro"] != domain.StatusDown {
		t.Errorf("deployed macro must stay DOWN, got %s", result.Services["macro"])
	}

	// capability map must NOT contain macro (deployed service, not in not_deployed set)
	if result.Capabilities != nil {
		if _, ok := result.Capabilities["macro"]; ok {
			t.Error("anti-false-green violated: deployed+DOWN macro must NOT appear in capabilities map")
		}
	}
}

// ── Mock implementations ─────────────────────────────────────────────────────

type mockCapabilityProber struct {
	result map[string]*domain.ServiceCapability
}

func (m *mockCapabilityProber) ProbeAll(_ context.Context) map[string]*domain.ServiceCapability {
	return m.result
}

type mockHealthCheckerInfra struct {
	results map[string]*domain.ServiceHealthResult
}

func (m *mockHealthCheckerInfra) CheckHealth(_ context.Context, svc *domain.ServiceConfig) (*domain.ServiceHealthResult, error) {
	if r, ok := m.results[svc.Name]; ok {
		return r, nil
	}
	return &domain.ServiceHealthResult{Service: svc.Name, Status: domain.StatusDown, LatencyMs: -1}, nil
}

type mockServiceRegistryInfra struct {
	services []*domain.ServiceConfig
}

func (m *mockServiceRegistryInfra) GetAllServices() []*domain.ServiceConfig { return m.services }
func (m *mockServiceRegistryInfra) GetService(name string) *domain.ServiceConfig {
	for _, s := range m.services {
		if s.Name == name {
			return s
		}
	}
	return nil
}
func (m *mockServiceRegistryInfra) IsNotDeployed(_ string) bool { return false }
