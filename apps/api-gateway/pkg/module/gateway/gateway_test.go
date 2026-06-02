package gateway_test

import (
	"testing"

	"github.com/vn-market-intelligence/api-gateway/pkg/module/gateway"
)

// stubPorts implements RoutingPorts with an in-memory registry.
// No I/O, no net/http, no external state — pure test double.
type stubPorts struct {
	services map[string]struct {
		targetURL string
		noProbe   bool
	}
	statuses map[string]string
}

func (s *stubPorts) LookupService(name string) (string, bool, bool) {
	svc, ok := s.services[name]
	if !ok {
		return "", false, false
	}
	return svc.targetURL, svc.noProbe, true
}

func (s *stubPorts) ServiceStatuses() map[string]string {
	return s.statuses
}

// newStub constructs a stubPorts with sensible test data.
func newStub() *stubPorts {
	return &stubPorts{
		services: map[string]struct {
			targetURL string
			noProbe   bool
		}{
			"macro":     {targetURL: "http://macro-service:8081", noProbe: false},
			"stock":     {targetURL: "http://stock-price:8082", noProbe: false},
			"api":       {targetURL: "http://mcp-server:3000", noProbe: true}, // virtual alias
		},
		statuses: map[string]string{
			"macro": "ok",
			"stock": "ok",
			"api":   "ok",
		},
	}
}

// ---------------------------------------------------------------------------
// Multi-primitive routing scenario (G2 evidence)
// Exercises route-service-matcher → proxy-path-resolver in sequence via
// GatewayModule.Route.
// ---------------------------------------------------------------------------

// TestRoute_MultiPrimitive_RealService is the primary G2 multi-primitive test.
// Story: /macro/indicators → ExtractServiceName("/macro/indicators", "/") = "macro"
//        → LookupService("macro") = ("http://macro-service:8081", false, true)
//        → ResolveProxyPath("/macro/indicators", false) = "/indicators"
// Two primitives exercised in sequence.
func TestRoute_MultiPrimitive_RealService(t *testing.T) {
	mod := gateway.New(newStub())
	result := mod.Route("/macro/indicators", "/")

	if !result.Found {
		t.Fatal("expected Found=true for registered service 'macro'")
	}
	if result.ServiceName != "macro" {
		t.Errorf("ServiceName: got %q, want %q", result.ServiceName, "macro")
	}
	if result.DownstreamPath != "/indicators" {
		t.Errorf("DownstreamPath: got %q, want %q", result.DownstreamPath, "/indicators")
	}
	if result.TargetURL != "http://macro-service:8081" {
		t.Errorf("TargetURL: got %q, want %q", result.TargetURL, "http://macro-service:8081")
	}
}

// TestRoute_MultiPrimitive_VirtualAlias exercises the virtual-alias branch.
// Story: /api/push-news → ExtractServiceName("/api/push-news", "/") = "api"
//        → LookupService("api") = ("http://mcp-server:3000", noProbe=true, ok=true)
//        → ResolveProxyPath("/api/push-news", noProbe=true) = "/api/push-news" (verbatim)
// Two primitives exercised; the proxy-path-resolver takes the noProbe=true branch.
func TestRoute_MultiPrimitive_VirtualAlias(t *testing.T) {
	mod := gateway.New(newStub())
	result := mod.Route("/api/push-news", "/")

	if !result.Found {
		t.Fatal("expected Found=true for registered virtual service 'api'")
	}
	if result.ServiceName != "api" {
		t.Errorf("ServiceName: got %q, want %q", result.ServiceName, "api")
	}
	if result.DownstreamPath != "/api/push-news" {
		t.Errorf("DownstreamPath: got %q, want %q (verbatim for noProbe)", result.DownstreamPath, "/api/push-news")
	}
}

// TestRoute_MultiPrimitive_UnknownService verifies that an unregistered service
// returns Found=false. The route-service-matcher primitive still executes
// (ExtractServiceName is called); LookupService then produces the miss.
func TestRoute_MultiPrimitive_UnknownService(t *testing.T) {
	mod := gateway.New(newStub())
	result := mod.Route("/unknown-svc/foo", "/")

	if result.Found {
		t.Error("expected Found=false for unregistered service 'unknown-svc'")
	}
	if result.ServiceName != "unknown-svc" {
		t.Errorf("ServiceName: got %q, want %q", result.ServiceName, "unknown-svc")
	}
}

// TestRoute_MultiPrimitive_DeepPath verifies multi-segment path resolution.
// /stock/history/2025-01 → matcher="stock" → resolver="/history/2025-01".
func TestRoute_MultiPrimitive_DeepPath(t *testing.T) {
	mod := gateway.New(newStub())
	result := mod.Route("/stock/history/2025-01", "/")

	if !result.Found {
		t.Fatal("expected Found=true for registered service 'stock'")
	}
	if result.DownstreamPath != "/history/2025-01" {
		t.Errorf("DownstreamPath: got %q, want %q", result.DownstreamPath, "/history/2025-01")
	}
}

// ---------------------------------------------------------------------------
// Overall-status composition (overall-status-computer primitive via module)
// ---------------------------------------------------------------------------

// TestAggregateHealth_AllOk verifies the all-ok path through the module.
func TestAggregateHealth_AllOk(t *testing.T) {
	mod := gateway.New(newStub())
	result := mod.AggregateHealth()

	if result.Overall != "ok" {
		t.Errorf("Overall: got %q, want %q", result.Overall, "ok")
	}
	if len(result.Statuses) == 0 {
		t.Error("Statuses snapshot must not be empty")
	}
}

// TestAggregateHealth_Degraded verifies the degraded path.
func TestAggregateHealth_Degraded(t *testing.T) {
	stub := newStub()
	stub.statuses["stock"] = "down" // one down → degraded overall
	mod := gateway.New(stub)
	result := mod.AggregateHealth()

	if result.Overall != "degraded" {
		t.Errorf("Overall: got %q, want %q", result.Overall, "degraded")
	}
}

// TestAggregateHealth_AllDown verifies the all-down path.
func TestAggregateHealth_AllDown(t *testing.T) {
	stub := newStub()
	for k := range stub.statuses {
		stub.statuses[k] = "down"
	}
	mod := gateway.New(stub)
	result := mod.AggregateHealth()

	if result.Overall != "down" {
		t.Errorf("Overall: got %q, want %q", result.Overall, "down")
	}
}

// TestAggregateHealth_Empty verifies the empty-registry path.
// With A-01b-2: empty map after not_deployed filtering → "ok"
// (nothing deployed = nothing is down; fail-safe "down" only applies when
// at least one non-not_deployed service is present).
func TestAggregateHealth_Empty(t *testing.T) {
	stub := &stubPorts{
		services: map[string]struct {
			targetURL string
			noProbe   bool
		}{},
		statuses: map[string]string{},
	}
	mod := gateway.New(stub)
	result := mod.AggregateHealth()

	if result.Overall != "ok" {
		t.Errorf("Overall: got %q, want %q for empty registry", result.Overall, "ok")
	}
}
