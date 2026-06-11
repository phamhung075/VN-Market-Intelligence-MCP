/**
 * Pure compose logic for the Service Health model (FOU-3-FE).
 * Tier 1 of DDD: ZERO imports from Remix, React, or app/lib/api/.
 *
 * Exported so dashboard.services.tsx can use it AND unit tests can import
 * it without pulling in the Remix runtime.
 *
 * GO-FLEET-DEPLOY (2026-06-11): all 12 services are genuinely deployed.
 * "not_deployed_*" display states removed — a service that is unreachable
 * at runtime is DOWN (RED). Capability is informational but never rescues.
 */
import type { CapabilityStatus, ServiceRow, ServiceStatus } from "~/domain/health";

/**
 * All possible visual display states for a service row.
 *
 * Compose logic:
 *   ok       → deployed_up        (GREEN)
 *   degraded → deployed_degraded  (YELLOW)
 *   down     → deployed_down      (RED — anti-false-green)
 */
export type RowDisplayState =
  | "deployed_up"
  | "deployed_degraded"
  | "deployed_down";

/**
 * Compute the visual display state for a service row.
 *
 * ANTI-FALSE-GREEN invariant: a service that is DOWN always returns
 * "deployed_down" regardless of any capability value.
 * Capability is informational only and never overrides the container verdict.
 */
export function composeRowDisplayState(
  status: ServiceStatus,
  _capability: CapabilityStatus,
): RowDisplayState {
  if (status === "ok") return "deployed_up";
  if (status === "degraded") return "deployed_degraded";
  // "down" — Anti-false-green: never rescued by capability
  return "deployed_down";
}

/**
 * Compute the overall top-badge status.
 * All services are deployed; status is driven by the full fleet.
 *
 * Logic:
 *   - Any service DOWN → "down"
 *   - Any service DEGRADED (and none down) → "degraded"
 *   - All ok → "ok"
 *   - Empty rows → fall back to gatewayOverall
 */
export function composeOverallStatus(
  rows: Pick<ServiceRow, "status">[],
  gatewayOverall: "ok" | "degraded" | "down" | null,
): "ok" | "degraded" | "down" | null {
  if (rows.length === 0) return gatewayOverall;
  if (rows.some((r) => r.status === "down")) return "down";
  if (rows.some((r) => r.status === "degraded")) return "degraded";
  if (rows.every((r) => r.status === "ok")) return "ok";
  return gatewayOverall;
}

/**
 * Parse the capability value from the /health payload.
 * Validates against the known CapabilityStatus union; falls back to "n/a"
 * for unknown/absent values (graceful degradation for older payloads).
 */
export function parseCapability(raw: unknown): CapabilityStatus {
  if (raw === "live" || raw === "data_limited" || raw === "dark" || raw === "n/a") {
    return raw;
  }
  return "n/a";
}
