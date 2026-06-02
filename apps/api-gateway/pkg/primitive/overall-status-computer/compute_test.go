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
			// empty map has no services — after filtering there is nothing deployed,
			// so overall is "ok" (nothing is down).
			name:     "empty map yields ok",
			statuses: map[string]string{},
			want:     osc.StatusOk,
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
		// ── not_deployed filtering scenarios (A-01b-2 DoD) ──────────────────
		{
			// host-minimal-stack: 5 deployed ok + 7 not_deployed → overall ok.
			// Proves not_deployed entries are excluded before evaluation.
			name: "host-minimal-stack: deployed ok + not_deployed → ok",
			statuses: map[string]string{
				"mcp":       "ok",
				"macro":     "ok",
				"pdf":       "not_deployed",
				"rag":       "not_deployed",
				"ta":        "not_deployed",
				"stock":     "not_deployed",
				"kinh-dich": "not_deployed",
				"alert":     "not_deployed",
				"news":      "not_deployed",
			},
			want: osc.StatusOk,
		},
		{
			// real-outage-among-deployed: 4 ok + 1 deployed down + 7 not_deployed → NOT ok.
			// Anti-false-green proof: a real outage must still register even with not_deployed present.
			name: "real-outage-among-deployed: deployed down + not_deployed → degraded",
			statuses: map[string]string{
				"mcp":       "ok",
				"macro":     "ok",
				"pdf":       "not_deployed",
				"rag":       "not_deployed",
				"ta":        "not_deployed",
				"stock":     "not_deployed",
				"kinh-dich": "not_deployed",
				"alert":     "not_deployed",
				"news":      "down",
			},
			want: osc.StatusDegraded,
		},
		{
			// all not_deployed → ok (nothing is down by design).
			name:     "all not_deployed yields ok",
			statuses: map[string]string{"a": "not_deployed", "b": "not_deployed"},
			want:     osc.StatusOk,
		},
		{
			// deployed all down + not_deployed → down (all non-skipped are down).
			name: "deployed all down + not_deployed yields down",
			statuses: map[string]string{
				"mcp":   "down",
				"macro": "down",
				"pdf":   "not_deployed",
			},
			want: osc.StatusDown,
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
