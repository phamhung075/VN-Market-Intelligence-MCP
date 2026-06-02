/**
 * Pure compose logic for the 2-axis Service Health model (FOU-3-FE).
 * Tier 1 of DDD: ZERO imports from Remix, React, or app/lib/api/.
 *
 * Exported so dashboard.services.tsx can use it AND unit tests can import
 * it without pulling in the Remix runtime.
 */
import type { CapabilityStatus, ServiceRow, ServiceStatus } from "~/domain/health";

/**
 * All possible visual display states for a service row.
 *
 * Compose logic:
 *   deployed + ok              → deployed_up        (GREEN)
 *   deployed + degraded        → deployed_degraded  (YELLOW)
 *   deployed + down + ANY cap  → deployed_down      (RED — anti-false-green)
 *   not_deployed + live        → not_deployed_live  (BLUE)
 *   not_deployed + data_limited→ not_deployed_data_limited (AMBER)
 *   not_deployed + dark/n/a    → not_deployed_dark  (GREY)
 */
export type RowDisplayState =
  | "deployed_up"
  | "deployed_degraded"
  | "deployed_down"
  | "not_deployed_live"
  | "not_deployed_data_limited"
  | "not_deployed_dark";

/**
 * Compute the visual display state for a service row.
 *
 * ANTI-FALSE-GREEN invariant: a deployed service that is DOWN always returns
 * "deployed_down" regardless of any capability value.
 * Capability is additive ONLY for the not_deployed axis.
 */
export function composeRowDisplayState(
  status: ServiceStatus,
  capability: CapabilityStatus,
): RowDisplayState {
  // Deployed services: container status is authoritative. Capability is ignored.
  if (status === "ok") return "deployed_up";
  if (status === "degraded") return "deployed_degraded";
  if (status === "down") return "deployed_down"; // Anti-false-green: never rescued by capability

  // not_deployed: capability axis determines the badge
  switch (capability) {
    case "live":
      return "not_deployed_live";
    case "data_limited":
      return "not_deployed_data_limited";
    case "dark":
    case "n/a":
    default:
      return "not_deployed_dark";
  }
}

/**
 * Compute the overall top-badge status.
 * Deployed services drive the top badge; not_deployed services are EXCLUDED.
 *
 * Logic:
 *   - Any deployed service DOWN → "down"
 *   - Any deployed service DEGRADED (and none down) → "degraded"
 *   - All deployed ok → "ok"
 *   - No deployed services → fall back to gatewayOverall
 */
export function composeOverallStatus(
  rows: Pick<ServiceRow, "status">[],
  gatewayOverall: "ok" | "degraded" | "down" | null,
): "ok" | "degraded" | "down" | null {
  const deployed = rows.filter((r) => r.status !== "not_deployed");
  if (deployed.length === 0) return gatewayOverall;
  if (deployed.some((r) => r.status === "down")) return "down";
  if (deployed.some((r) => r.status === "degraded")) return "degraded";
  if (deployed.every((r) => r.status === "ok")) return "ok";
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
