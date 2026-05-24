// Tests for ExtractServiceName — table-driven, covers both prefix conventions
// and the critical failure edge where an empty segment after strip must yield "".
package routeservicematcher_test

import (
	"testing"

	rsm "github.com/vn-market-intelligence/api-gateway/pkg/primitive/route-service-matcher"
)

func TestExtractServiceName(t *testing.T) {
	tests := []struct {
		name          string
		path          string
		prefixToStrip string
		want          string
	}{
		// ── Proxy prefix convention (HandleProxy: prefix="/") ────────────────
		{
			// Normal proxy: /stock/health → strip "/" → "stock/health" → "stock"
			name:          "proxy prefix - normal stock service",
			path:          "/stock/health",
			prefixToStrip: "/",
			want:          "stock",
		},
		{
			// Multi-segment proxy path: first segment only
			name:          "proxy prefix - macro service multi-segment",
			path:          "/macro/indicators/vn30",
			prefixToStrip: "/",
			want:          "macro",
		},
		{
			// Proxy prefix with no sub-path: /ta → strip "/" → "ta"
			name:          "proxy prefix - single segment no trailing slash",
			path:          "/ta",
			prefixToStrip: "/",
			want:          "ta",
		},
		{
			// Root "/" with proxy prefix → strip "/" → "" → return ""
			name:          "proxy prefix - root path yields empty",
			path:          "/",
			prefixToStrip: "/",
			want:          "",
		},

		// ── Health prefix convention (HandleServiceHealth: prefix="/health/") ─
		{
			// Normal health path: /health/macro → strip "/health/" → "macro"
			name:          "health prefix - macro service",
			path:          "/health/macro",
			prefixToStrip: "/health/",
			want:          "macro",
		},
		{
			// Health prefix with sub-segment: first segment only
			name:          "health prefix - stock with sub-path",
			path:          "/health/stock/extra",
			prefixToStrip: "/health/",
			want:          "stock",
		},
		{
			// FAILURE EDGE: /health/ with prefix "/health/" → "" (empty after strip).
			// Must return "" — NOT "health". The caller (HandleServiceHealth) treats
			// "" as a registry miss → 404. This guards against misrouting.
			name:          "health prefix - empty service after strip (failure edge)",
			path:          "/health/",
			prefixToStrip: "/health/",
			want:          "",
		},
		{
			// Prefix not present: TrimPrefix is a no-op — path stays "/health/stock".
			// SplitN("/health/stock", "/", 2) → ["", "health/stock"] → parts[0]="".
			// Result is "" (the leading slash makes the first segment empty).
			// Verifies TrimPrefix semantics (does not panic on mismatch).
			name:          "prefix absent - leading slash yields empty first segment",
			path:          "/health/stock",
			prefixToStrip: "/api/",
			want:          "",
		},

		// ── Trailing slash variations ─────────────────────────────────────────
		{
			// Trailing slash on real service with proxy prefix
			name:          "proxy prefix - trailing slash service path",
			path:          "/stock/",
			prefixToStrip: "/",
			want:          "stock",
		},
		{
			// ta service — spot check
			name:          "proxy prefix - ta service",
			path:          "/ta/analysis",
			prefixToStrip: "/",
			want:          "ta",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := rsm.ExtractServiceName(tt.path, tt.prefixToStrip)
			if got != tt.want {
				t.Errorf("ExtractServiceName(%q, %q) = %q, want %q",
					tt.path, tt.prefixToStrip, got, tt.want)
			}
		})
	}
}
