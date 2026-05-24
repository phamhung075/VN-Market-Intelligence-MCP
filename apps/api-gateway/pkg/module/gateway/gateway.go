// Package gateway is the single gateway module for api-gateway.
//
// It composes the three routing primitives via ports (Go interfaces) only:
//   - route-service-matcher  → ExtractServiceName
//   - proxy-path-resolver    → ResolveProxyPath
//   - overall-status-computer → ComputeOverallStatus
//
// Boundary rules (enforced by depguard fence):
//   - MUST NOT import any other module under pkg/module/
//   - MUST NOT import pkg/application/, pkg/infrastructure/, pkg/interface/
//   - MAY import pkg/primitive/* (own primitives) and pkg/domain (ports only)
//
// The module depends on the domain ports — HealthCheckerPort and
// ServiceRegistryPort — injected at the composition root (cmd/server/main.go).
// No net/http dial occurs here; all I/O is behind the ports.
package gateway

import (
	osc "github.com/vn-market-intelligence/api-gateway/pkg/primitive/overall-status-computer"
	ppr "github.com/vn-market-intelligence/api-gateway/pkg/primitive/proxy-path-resolver"
	rsm "github.com/vn-market-intelligence/api-gateway/pkg/primitive/route-service-matcher"
)

// RoutingPorts are the two domain ports this module requires.
// They are satisfied by pkg/infrastructure adapters wired in cmd/server/main.go.
// The module never imports infrastructure directly.
type RoutingPorts interface {
	// LookupService resolves a service name to its target URL and noProbe flag.
	// Returns ("", false, false) when the service is not registered.
	LookupService(name string) (targetURL string, noProbe bool, ok bool)

	// ServiceStatuses returns a snapshot of all registered service health statuses
	// as plain strings ("ok", "degraded", "down").
	ServiceStatuses() map[string]string
}

// RouteResult is the output of the multi-primitive routing story.
type RouteResult struct {
	// ServiceName is the first path segment extracted by route-service-matcher.
	ServiceName string
	// DownstreamPath is the resolved downstream path from proxy-path-resolver.
	DownstreamPath string
	// TargetURL is the base URL for the upstream service.
	TargetURL string
	// Found is false when the service is not registered (→ caller should 404).
	Found bool
}

// HealthResult is the output of the overall-status computation story.
type HealthResult struct {
	// Overall is the aggregate status: "ok", "degraded", or "down".
	Overall string
	// Statuses is the per-service snapshot used for the computation.
	Statuses map[string]string
}

// GatewayModule composes the three routing primitives behind RoutingPorts.
// All logic is pure: given inputs from ports, it delegates to primitives and
// returns structured results. Zero I/O in this layer.
type GatewayModule struct {
	ports RoutingPorts
}

// New constructs a GatewayModule with the given ports.
func New(ports RoutingPorts) *GatewayModule {
	return &GatewayModule{ports: ports}
}

// Route is the multi-primitive routing story (G2 scenario):
//
//  1. route-service-matcher.ExtractServiceName(reqPath, prefix) → serviceName
//  2. ports.LookupService(serviceName)                          → targetURL, noProbe, ok
//  3. proxy-path-resolver.ResolveProxyPath(reqPath, noProbe)   → downstreamPath
//
// Both primitives are exercised in sequence; the module composes their outputs.
// If the service is not found (ok=false), RouteResult.Found is false.
func (g *GatewayModule) Route(reqPath, prefixToStrip string) RouteResult {
	// Step 1 — route-service-matcher: extract service name from the request path.
	serviceName := rsm.ExtractServiceName(reqPath, prefixToStrip)

	// Step 2 — ports: resolve the target URL and noProbe flag.
	targetURL, noProbe, ok := g.ports.LookupService(serviceName)
	if !ok {
		return RouteResult{ServiceName: serviceName, Found: false}
	}

	// Step 3 — proxy-path-resolver: compute the downstream path.
	downstreamPath := ppr.ResolveProxyPath(reqPath, noProbe)

	return RouteResult{
		ServiceName:    serviceName,
		DownstreamPath: downstreamPath,
		TargetURL:      targetURL,
		Found:          true,
	}
}

// AggregateHealth is the overall-status story:
//
//  1. ports.ServiceStatuses() → statuses snapshot
//  2. overall-status-computer.ComputeOverallStatus(statuses) → overall
//
// This exercises the third primitive and is the health-aggregate path through
// the module.
func (g *GatewayModule) AggregateHealth() HealthResult {
	statuses := g.ports.ServiceStatuses()
	overall := osc.ComputeOverallStatus(statuses)
	return HealthResult{
		Overall:  overall,
		Statuses: statuses,
	}
}
