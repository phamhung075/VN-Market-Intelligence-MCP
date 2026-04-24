/**
 * Domain Service — VPS Health Poller
 *
 * Pure business logic for polling VPS service health.
 * No I/O or infrastructure imports — accepts injectable fetch function.
 *
 * Task 234: Polls 5 VPS service endpoints and returns health status + metrics.
 *
 * @module domain/services/vpsHealthPoller
 */

/**
 * Result of polling a single VPS service.
 */
export interface HealthPollResult {
  serviceName: ServiceName;
  healthStatus: HealthStatus;
  responseTimeMs: number;
  polledAt: string; // ISO 8601 timestamp
  errorMessage?: string;
  lastSuccessfulRun?: string; // ISO 8601 timestamp of last healthy poll
  uptimeSeconds?: number; // Duration since last successful run
}

/**
 * VPS service names — exactly 5 services.
 */
export type ServiceName =
  | "vn-price-fetch"
  | "vn-bctc-fetch"
  | "vn-news-fetch"
  | "vn-sbv-fetch"
  | "vn-foreign-flow";

/**
 * Health status classification.
 */
export type HealthStatus = "healthy" | "unhealthy" | "unreachable";

/**
 * VPS service endpoint configuration.
 */
export interface VpsServiceConfig {
  name: ServiceName;
  url: string;
  timeoutMs: number;
  description: string;
}

/**
 * Timeout threshold (ms) for considering a service "unhealthy".
 */
const UNHEALTHY_THRESHOLD_MS = 10000;

/**
 * Default VPS service endpoints.
 */
export const DEFAULT_VPS_SERVICES: VpsServiceConfig[] = [
  {
    name: "vn-price-fetch",
    url: "http://localhost:5001/health",
    timeoutMs: 5000,
    description: "Market prices (HOSE/HNX/UPCOM)",
  },
  {
    name: "vn-bctc-fetch",
    url: "http://localhost:5002/health",
    timeoutMs: 5000,
    description: "BCTC financial reports",
  },
  {
    name: "vn-news-fetch",
    url: "http://localhost:5003/health",
    timeoutMs: 5000,
    description: "News and events",
  },
  {
    name: "vn-sbv-fetch",
    url: "http://localhost:5004/health",
    timeoutMs: 5000,
    description: "SBV FX rates",
  },
  {
    name: "vn-foreign-flow",
    url: "http://localhost:5005/health",
    timeoutMs: 5000,
    description: "Foreign buy/sell flows",
  },
];

/**
 * Type for injectable fetch function.
 *
 * Must support abort signal for timeouts.
 */
export type FetchFn = (
  url: string,
  options?: { signal?: AbortSignal; timeout?: number }
) => Promise<Response>;

/**
 * Polls a single VPS service.
 *
 * @param config Service configuration
 * @param fetchFn Fetch function (injectable for testing)
 * @returns HealthPollResult with status + timing
 */
export async function pollOneService(
  config: VpsServiceConfig,
  fetchFn: FetchFn,
): Promise<HealthPollResult> {
  const startMs = Date.now();
  const polledAt = new Date().toISOString();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

    let response: Response;
    try {
      response = await fetchFn(config.url, {
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const responseTimeMs = Date.now() - startMs;

    if (!response.ok) {
      return {
        serviceName: config.name,
        healthStatus: "unhealthy",
        responseTimeMs,
        polledAt,
        errorMessage: `HTTP ${response.status}`,
      };
    }

    // Check response time threshold
    if (responseTimeMs > UNHEALTHY_THRESHOLD_MS) {
      return {
        serviceName: config.name,
        healthStatus: "unhealthy",
        responseTimeMs,
        polledAt,
        errorMessage: `Response time ${responseTimeMs}ms exceeds threshold ${UNHEALTHY_THRESHOLD_MS}ms`,
      };
    }

    return {
      serviceName: config.name,
      healthStatus: "healthy",
      responseTimeMs,
      polledAt,
    };
  } catch (err) {
    const responseTimeMs = Date.now() - startMs;
    const isTimeout =
      err instanceof Error && err.name === "AbortError";
    const isNetworkError =
      err instanceof Error &&
      (err.message.includes("ECONNREFUSED") ||
        err.message.includes("ENOTFOUND") ||
        err.message.includes("Network"));

    return {
      serviceName: config.name,
      healthStatus: "unreachable",
      responseTimeMs,
      polledAt,
      errorMessage: isTimeout
        ? `Timeout (>${config.timeoutMs}ms)`
        : isNetworkError
          ? "Network unreachable"
          : err instanceof Error
            ? err.message
            : "Unknown error",
    };
  }
}

/**
 * Polls all 5 VPS services in parallel.
 *
 * @param services Service configurations (defaults to DEFAULT_VPS_SERVICES)
 * @param fetchFn Fetch function (injectable for testing)
 * @returns Array of 5 HealthPollResult objects (one per service)
 *
 * Never throws — returns partial results even if some polls fail.
 */
export async function pollVpsServiceHealth(
  fetchFn: FetchFn,
  services: VpsServiceConfig[] = DEFAULT_VPS_SERVICES,
): Promise<HealthPollResult[]> {
  const polls = services.map((svc) => pollOneService(svc, fetchFn));
  return Promise.all(polls);
}
