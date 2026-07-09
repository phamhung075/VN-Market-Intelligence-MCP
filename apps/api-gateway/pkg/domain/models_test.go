// Tests for ServiceConfig.EffectiveProxyTimeoutMs — pins the resolved proxy
// timeout so a future edit to DefaultProxyTimeoutMultiplier or the fallback
// arithmetic cannot silently change proxy timing behavior.
package domain_test

import (
	"testing"

	"github.com/vn-market-intelligence/api-gateway/pkg/domain"
)

func TestServiceConfig_EffectiveProxyTimeoutMs(t *testing.T) {
	tests := []struct {
		name string
		cfg  domain.ServiceConfig
		want int64
	}{
		{
			name: "no override falls back to TimeoutMs * DefaultProxyTimeoutMultiplier",
			cfg:  domain.ServiceConfig{TimeoutMs: 2000},
			want: 10000,
		},
		{
			name: "explicit ProxyTimeoutMs override wins regardless of TimeoutMs",
			cfg:  domain.ServiceConfig{TimeoutMs: 2000, ProxyTimeoutMs: 120000},
			want: 120000,
		},
		{
			name: "zero TimeoutMs with no override resolves to zero (no timeout applied)",
			cfg:  domain.ServiceConfig{TimeoutMs: 0},
			want: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.cfg.EffectiveProxyTimeoutMs()
			if got != tt.want {
				t.Errorf("EffectiveProxyTimeoutMs() = %d, want %d", got, tt.want)
			}
		})
	}
}

func TestDefaultProxyTimeoutMultiplier_PinnedValue(t *testing.T) {
	// Pins the multiplier itself: the pre-refactor behavior was a bare `*5`
	// literal inlined at the call site. This test fails loudly if the named
	// constant's value ever drifts from the historical behavior.
	if domain.DefaultProxyTimeoutMultiplier != 5 {
		t.Errorf("DefaultProxyTimeoutMultiplier = %d, want 5 (historical proxy timing behavior)", domain.DefaultProxyTimeoutMultiplier)
	}
}
