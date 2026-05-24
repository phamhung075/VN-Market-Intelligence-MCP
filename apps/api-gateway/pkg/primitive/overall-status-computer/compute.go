// Package overallstatuscomputer provides a pure function for computing the
// aggregate health status from a map of individual service statuses.
// Zero I/O — stdlib only; no external dependencies, no HTTP imports.
// No import from pkg/domain — primitives are the base tier and must not
// create circular dependencies with domain layer consumers.
package overallstatuscomputer

// Status constants mirror domain.HealthStatus values.
// Defined locally so this package has zero imports (stdlib only).
const (
	StatusOk       = "ok"
	StatusDegraded = "degraded"
	StatusDown     = "down"
)

// ComputeOverallStatus computes the overall health status from individual
// service statuses expressed as plain strings. Rules:
//   - empty map           → "down"
//   - all "ok"            → "ok"
//   - all "down"          → "down"
//   - any mix (including "degraded") → "degraded"
//
// This is a PROMOTE (not a rewrite) of the unexported computeOverallStatus
// from pkg/domain/services.go. Behaviour is identical.
func ComputeOverallStatus(statuses map[string]string) string {
	if len(statuses) == 0 {
		return StatusDown
	}
	allOk := true
	allDown := true
	for _, s := range statuses {
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
