/**
 * Domain types for service health data.
 * Tier 1 of DDD: pure TypeScript — ZERO imports from app/lib/api/ or app/components/.
 *
 * These types reflect api-gateway /health endpoint response shapes.
 *
 * GO-FLEET-DEPLOY (2026-06-11): all 12 services are now genuinely deployed.
 * "not_deployed" has been removed from ServiceStatus — every service that is
 * unreachable at runtime is genuinely DOWN and must render RED (anti-false-green).
 */

/** Status of a single microservice. */
export type ServiceStatus = "ok" | "degraded" | "down";

/**
 * Capability of a service as observed via mcp-server probes.
 * Used as the second axis in the Service Health model.
 *
 * - "live":         probe confirmed capability is working
 * - "data_limited": probe responded but data is partial/stale
 * - "dark":         capability not probed or probe returned no useful data
 * - "n/a":          not applicable (e.g. mcp-server itself)
 */
export type CapabilityStatus = "live" | "data_limited" | "dark" | "n/a";

/** Full gateway health response from GET /health */
export interface GatewayHealthResponse {
  status: ServiceStatus;
  services: Record<string, ServiceStatus>;
  latencies?: Record<string, number>;
  checkedAt?: string;
  timestamp?: string;
  /**
   * Optional capability map keyed by service short_key.
   * Present only when the gateway has a configured capability prober.
   * Absent on older payloads — consumers must treat absence as "no capability info".
   */
  capabilities?: Record<string, { capability: CapabilityStatus; capabilityNote?: string }>;
}

/** Per-service health detail from GET /health/:service */
export interface ServiceHealth {
  service: string;
  status: ServiceStatus;
  latency?: number;
  checkedAt?: string;
  error?: string;
}

/** Display-ready record for a single microservice row in the dashboard. */
export interface ServiceRow {
  name: string;
  status: ServiceStatus;
  latencyMs: number | null;
  /**
   * Capability axis — defaults to "n/a" when absent from the /health payload.
   * Container status (ok/degraded/down) is always authoritative.
   * Capability is informational only — never overrides a down verdict.
   */
  capability: CapabilityStatus;
  /**
   * Human-readable note for data_limited capability (e.g. "30/35 candles available").
   * Undefined when capability is not data_limited or no note was provided.
   */
  capabilityNote?: string;
}
