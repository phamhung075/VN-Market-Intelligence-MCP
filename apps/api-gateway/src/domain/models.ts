/**
 * API Gateway Domain — Models
 *
 * Value Objects for service health and routing.
 */

export type HealthStatus = 'ok' | 'degraded' | 'down';

/** Health result for a single downstream service. */
export interface ServiceHealthResult {
  service: string;
  status: HealthStatus;
  latencyMs: number;
  error?: string;
}

/** Aggregated health across all services. */
export interface AggregatedHealth {
  status: HealthStatus;      // 'ok' if all ok; 'degraded' if any down; 'down' if all down
  services: Record<string, HealthStatus>;
  latencies: Record<string, number>;
  checkedAt: string;         // ISO timestamp
}

/** Service registry entry. */
export interface ServiceConfig {
  name: string;
  baseUrl: string;           // e.g. "http://mcp-server:3000"
  healthPath: string;        // e.g. "/health"
  timeoutMs: number;
}
