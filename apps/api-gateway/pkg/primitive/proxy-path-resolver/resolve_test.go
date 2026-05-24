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
		name    string
		reqPath string
		noProbe bool
		want    string
	}{
		{
			// Normal real-service path: /:service/:rest → /:rest
			// Mirrors handlers_test.go TestProxyPath_RealService_StripPrefix
			name:    "real service strips prefix",
			reqPath: "/stock/health",
			noProbe: false,
			want:    "/health",
		},
		{
			// Multi-segment real-service path
			// Mirrors handlers_test.go TestProxyPath_MultiSegment
			name:    "real service multi segment",
			reqPath: "/macro/indicators",
			noProbe: false,
			want:    "/indicators",
		},
		{
			// Virtual alias (NoProbe=true): full path must pass through verbatim.
			// Mirrors handlers_test.go TestProxyPath_VirtualAlias_FullPath
			name:    "virtual alias passes full path verbatim",
			reqPath: "/api/push-news",
			noProbe: true,
			want:    "/api/push-news",
		},
		{
			// Root path with noProbe=true — still verbatim.
			name:    "virtual alias root path verbatim",
			reqPath: "/",
			noProbe: true,
			want:    "/",
		},
		{
			// EDGE CASE (failure scenario — see scenarios/failure-no-trailing-segment.json):
			// "/stock" has no trailing segment. SplitN("/stock", "/", 3) yields
			// ["", "stock"] — len < 3 — so the guard must return "/" not panic or
			// return an empty string. This is the documented wrong-behavior guard.
			name:    "no trailing segment returns root",
			reqPath: "/stock",
			noProbe: false,
			want:    "/",
		},
		{
			// Deep multi-segment path: all segments after :service are preserved.
			name:    "deep path preserves all segments after service",
			reqPath: "/ta/analysis/vn30/2026",
			noProbe: false,
			want:    "/analysis/vn30/2026",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ppr.ResolveProxyPath(tt.reqPath, tt.noProbe)
			if got != tt.want {
				t.Errorf("ResolveProxyPath(%q, noProbe=%v) = %q, want %q",
					tt.reqPath, tt.noProbe, got, tt.want)
			}
		})
	}
}
