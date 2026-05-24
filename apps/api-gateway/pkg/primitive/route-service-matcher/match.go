// Package routeservicematcher provides a pure function for extracting a service
// name from an incoming HTTP request path.
// Zero I/O — stdlib only; no net/http or httputil imports.
// No import from pkg/domain — primitives are the base tier and must not
// create circular dependencies with domain-layer consumers.
package routeservicematcher

import "strings"

// ExtractServiceName extracts the first path segment after prefixToStrip.
//
// Rules:
//   - Strip prefixToStrip from path using strings.TrimPrefix.
//   - Split the remainder by "/" and return the first non-empty segment.
//   - If the result after stripping is empty or contains only slashes (e.g.
//     path="/health/" with prefix="/health/"), return "" — the caller must treat
//     an empty return as a registry miss (→ 404).
//
// This unifies two previously duplicated inline extraction blocks from
// pkg/interface/http/handlers.go:
//   - HandleServiceHealth: TrimPrefix(path, "/health/") + Split("/")[0]
//   - HandleProxy:         TrimPrefix(path, "/")        + SplitN("/", 2)[0]
//
// Failure edge: ExtractServiceName("/health/", "/health/") → "" (not "health").
func ExtractServiceName(path, prefixToStrip string) string {
	trimmed := strings.TrimPrefix(path, prefixToStrip)
	// Split on "/" and return the first non-empty segment.
	parts := strings.SplitN(trimmed, "/", 2)
	return parts[0]
}
