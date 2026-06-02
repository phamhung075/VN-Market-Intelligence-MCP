// Package overallstatuscomputer provides a pure function for computing the
// aggregate health status from a map of individual service statuses.
// Zero I/O — stdlib only; no external dependencies, no HTTP imports.
// No import from pkg/domain — primitives are the base tier and must not
// create circular dependencies with domain layer consumers.
package overallstatuscomputer

// Status constants mirror domain.HealthStatus values.
// Defined locally so this package has zero imports (stdlib only).
const (
	StatusOk          = "ok"
	StatusDegraded    = "degraded"
	StatusDown        = "down"
	StatusNotDeployed = "not_deployed"
)

// ComputeOverallStatus computes the overall health status from individual
// service statuses expressed as plain strings. Rules:
//   - not_deployed entries are excluded before evaluation (neutral/skipped)
//   - empty map after filtering → "ok" (nothing deployed = nothing down)
//   - all filtered "ok"         → "ok"
//   - all filtered "down"       → "down"
//   - any mix (including "degraded") → "degraded"
//
// This is a PROMOTE (not a rewrite) of the unexported computeOverallStatus
// from pkg/domain/services.go with added not_deployed filtering.
func ComputeOverallStatus(statuses map[string]string) string {
	filtered := make(map[string]string, len(statuses))
	for k, v := range statuses {
		if v != StatusNotDeployed {
			filtered[k] = v
		}
	}
	if len(filtered) == 0 {
		return StatusOk // all not_deployed or empty → nothing is down
	}
	allOk := true
	allDown := true
	for _, s := range filtered {
		if s != StatusOk {
			allOk = false
		}
		if s != StatusDown {
			allDown = false
		}
	}
	if allOk {
		return StatusOk
	}
	if allDown {
		return StatusDown
	}
	return StatusDegraded
}
