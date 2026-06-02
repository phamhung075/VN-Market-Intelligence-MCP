/**
 * Domain types for service health data.
 * Tier 1 of DDD: pure TypeScript — ZERO imports from app/lib/api/ or app/components/.
 *
 * These types reflect api-gateway /health endpoint response shapes.
 */

/** Status of a single microservice. */
export type ServiceStatus = "ok" | "degraded" | "down" | "not_deployed";

/** Full gateway health response from GET /health */
export interface GatewayHealthResponse {
  status: ServiceStatus;
  services: Record<string, ServiceStatus>;
  latencies?: Record<string, number>;
  checkedAt?: string;
  timestamp?: string;
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
}
