// Tests for ResolveProxyPath — mirrors the ProxyPath unit tests from
// pkg/interface/http/handlers_test.go and adds the edge-case for no trailing
// segment, which is the canonical failure scenario for this primitive.
package proxypathresolver_test

import (
	"testing"

	ppr "github.com/vn-market-intelligence/api-gateway/pkg/primitive/proxy-path-resolver"
)

func TestResolveProxyPath(t *testing.T) {
	tests := []struct {
		name     string
		reqPath  string
		verbatim bool
		want     string
	}{
		{
			// Normal real-service path: /:service/:rest → /:rest
			// Mirrors handlers_test.go TestProxyPath_RealService_StripPrefix
			name:     "real service strips prefix",
			reqPath:  "/stock/health",
			verbatim: false,
			want:     "/health",
		},
		{
			// Multi-segment real-service path
			// Mirrors handlers_test.go TestProxyPath_MultiSegment
			name:     "real service multi segment",
			reqPath:  "/macro/indicators",
			verbatim: false,
			want:     "/indicators",
		},
		{
			// Virtual alias (verbatim=true): full path must pass through verbatim.
			// Mirrors handlers_test.go TestProxyPath_VirtualAlias_FullPath
			name:     "virtual alias passes full path verbatim",
			reqPath:  "/api/push-news",
			verbatim: true,
			want:     "/api/push-news",
		},
		{
			// Root path with verbatim=true — still verbatim.
			name:     "virtual alias root path verbatim",
			reqPath:  "/",
			verbatim: true,
			want:     "/",
		},
		{
			// EDGE CASE (failure scenario — see scenarios/failure-no-trailing-segment.json):
			// "/stock" has no trailing segment. SplitN("/stock", "/", 3) yields
			// ["", "stock"] — len < 3 — so the guard must return "/" not panic or
			// return an empty string. This is the documented wrong-behavior guard.
			name:     "no trailing segment returns root",
			reqPath:  "/stock",
			verbatim: false,
			want:     "/",
		},
		{
			// Deep multi-segment path: all segments after :service are preserved.
			name:     "deep path preserves all segments after service",
			reqPath:  "/ta/analysis/vn30/2026",
			verbatim: false,
			want:     "/analysis/vn30/2026",
		},
		{
			// F2 bug regression: /ta/indicators with verbatim=true (PreservePath service)
			// must return the full path, NOT strip /ta.
			// Before fix: verbatim=false → "/indicators" (upstream 404).
			// After fix:  verbatim=true  → "/ta/indicators" (upstream 200).
			name:     "ta preserve-path returns verbatim /ta/indicators",
			reqPath:  "/ta/indicators",
			verbatim: true,
			want:     "/ta/indicators",
		},
		{
			// Regression: /ta/* with verbatim=false (no PreservePath) still strips.
			// This documents what the OLD broken behavior was and ensures strip still
			// works for any future service that is NOT marked PreservePath.
			name:     "ta without preserve-path strips prefix (regression anchor)",
			reqPath:  "/ta/indicators",
			verbatim: false,
			want:     "/indicators",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ppr.ResolveProxyPath(tt.reqPath, tt.verbatim)
			if got != tt.want {
				t.Errorf("ResolveProxyPath(%q, verbatim=%v) = %q, want %q",
					tt.reqPath, tt.verbatim, got, tt.want)
			}
		})
	}
}
