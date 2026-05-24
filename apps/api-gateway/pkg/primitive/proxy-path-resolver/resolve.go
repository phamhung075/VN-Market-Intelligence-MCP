// Package proxypathresolver provides a pure function for computing the
// downstream path for a reverse-proxy request.
// Zero I/O — stdlib only; no external dependencies, no net/http or httputil imports.
// No import from pkg/domain — primitives are the base tier and must not
// create circular dependencies with domain layer consumers.
package proxypathresolver

import "strings"

// ResolveProxyPath determines the downstream path for a proxy request.
//
// Rules:
//   - noProbe=true  (virtual alias, e.g. "/api/*"): return reqPath verbatim.
//   - noProbe=false (real service):                  strip the leading /:service
//     segment using SplitN(reqPath, "/", 3).
//     If the path has fewer than 3 parts (e.g. "/stock" with no trailing
//     segment), the downstream path is "/" — never an empty string or a panic.
//
// This is a PROMOTE of the exported ProxyPath function from
// pkg/interface/http/handlers.go. Behaviour is identical; only the call
// signature changes: the *domain.ServiceConfig parameter is replaced by the
// single boolean field that matters (noProbe), keeping this package pure.
func ResolveProxyPath(reqPath string, noProbe bool) string {
	if noProbe {
		return reqPath
	}
	// Strip leading /:service segment.
	parts := strings.SplitN(reqPath, "/", 3)
	if len(parts) < 3 {
		return "/"
	}
	return "/" + parts[2]
}
