// Tests for ComputeOverallStatus — mirrors services_test.go table-driven cases
// and adds the empty-input edge case required by the G1 scenario set.
package overallstatuscomputer_test

import (
	"testing"

	osc "github.com/vn-market-intelligence/api-gateway/pkg/primitive/overall-status-computer"
)

func TestComputeOverallStatus(t *testing.T) {
	tests := []struct {
		name     string
		statuses map[string]string
		want     string
	}{
		{
			name:     "all ok",
			statuses: map[string]string{"a": "ok", "b": "ok", "c": "ok"},
			want:     osc.StatusOk,
		},
		{
			name:     "all down",
			statuses: map[string]string{"a": "down", "b": "down", "c": "down"},
			want:     osc.StatusDown,
		},
		{
			// mixed ok+down must produce degraded — not down.
			// This is the canonical G10/G11 injection point: a reversed-guard
			// bug (allDown checked before allOk) would yield "down" here.
			name:     "mixed ok and down yields degraded",
			statuses: map[string]string{"a": "ok", "b": "ok", "c": "down"},
			want:     osc.StatusDegraded,
		},
		{
			// empty map has no services — must fail safe to "down".
			name:     "empty map yields down",
			statuses: map[string]string{},
			want:     osc.StatusDown,
		},
		{
			name:     "single ok",
			statuses: map[string]string{"a": "ok"},
			want:     osc.StatusOk,
		},
		{
			name:     "single down",
			statuses: map[string]string{"a": "down"},
			want:     osc.StatusDown,
		},
		{
			// degraded status present among others — must propagate as degraded.
			name:     "degraded present yields degraded",
			statuses: map[string]string{"a": "ok", "b": "degraded"},
			want:     osc.StatusDegraded,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := osc.ComputeOverallStatus(tt.statuses)
			if got != tt.want {
				t.Errorf("ComputeOverallStatus(%v) = %q, want %q", tt.statuses, got, tt.want)
			}
		})
	}
}
