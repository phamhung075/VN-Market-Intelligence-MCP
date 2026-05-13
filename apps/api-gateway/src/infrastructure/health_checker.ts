/**
 * API Gateway Infrastructure — HTTP Health Checker
 *
 * Concrete implementation of HealthCheckPort.
 * Uses fetch with AbortSignal.timeout to enforce per-service timeout.
 */

import type { HealthCheckPort } from '../domain/repositories.js';
import type { ServiceConfig, ServiceHealthResult } from '../domain/models.js';

/** Extended config: virtual/alias services skip live health probes. */
export type ServiceConfigExtended = ServiceConfig & { noProbe?: boolean };

export class HTTPHealthChecker implements HealthCheckPort {
  async checkHealth(service: ServiceConfig): Promise<ServiceHealthResult> {
    const start = Date.now();
    const url = `${service.baseUrl}${service.healthPath}`;

    try {
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(service.timeoutMs),
      });
      const latencyMs = Date.now() - start;

      if (resp.ok) {
        return { service: service.name, status: 'ok', latencyMs };
      }
      return {
        service: service.name,
        status: 'degraded',
        latencyMs,
        error: `HTTP ${resp.status}`,
      };
    } catch (err) {
      return {
        service: service.name,
        status: 'down',
        latencyMs: Date.now() - start,
        error: String(err),
      };
    }
  }
}

/** Static in-memory service registry. */
export class StaticServiceRegistry {
  private readonly services: ReturnType<typeof buildServiceConfigs>;

  constructor(serviceUrls: Record<string, string>) {
    this.services = buildServiceConfigs(serviceUrls);
  }

  /**
   * Returns services eligible for active health probing.
   * Virtual alias services (noProbe=true) are excluded — they share an
   * upstream with a real service and do not expose a separate /health endpoint.
   */
  getAllServices() {
    return Object.values(this.services).filter((s) => !s.noProbe);
  }

  getService(name: string) {
    return this.services[name];
  }
}

function buildServiceConfigs(urls: Record<string, string>) {
  const timeout = 2000;
  return {
    mcp:        { name: 'mcp',        baseUrl: urls['mcp']        ?? 'http://mcp-server:3000',          healthPath: '/health', timeoutMs: timeout },
    pdf:        { name: 'pdf',        baseUrl: urls['pdf']        ?? 'http://pdf-extractor:5001',       healthPath: '/health', timeoutMs: timeout },
    rag:        { name: 'rag',        baseUrl: urls['rag']        ?? 'http://rag-service:5002',         healthPath: '/health', timeoutMs: timeout },
    ta:         { name: 'ta',         baseUrl: urls['ta']         ?? 'http://technical-analysis:5003',  healthPath: '/health', timeoutMs: timeout },
    macro:      { name: 'macro',      baseUrl: urls['macro']      ?? 'http://macro-indicators:5004',    healthPath: '/health', timeoutMs: timeout },
    stock:      { name: 'stock',      baseUrl: urls['stock']      ?? 'http://stock-price:5000',         healthPath: '/health', timeoutMs: timeout },
    'kinh-dich': { name: 'kinh-dich', baseUrl: urls['kinh-dich'] ?? 'http://kinh-dich-service:5005',  healthPath: '/health', timeoutMs: timeout },
    alert:      { name: 'alert',      baseUrl: urls['alert']      ?? 'http://alert-engine:5006',        healthPath: '/health', timeoutMs: timeout },
    news:       { name: 'news',       baseUrl: urls['news']       ?? 'http://news-fetch:5008',           healthPath: '/health', timeoutMs: timeout },
    // Virtual alias: /api/* routes to MCP server with full path preserved.
    // noProbe=true: excluded from active health probes (no /health endpoint to ping separately).
    api:        { name: 'api',        baseUrl: urls['api']        ?? urls['mcp'] ?? 'http://mcp-server:3000', healthPath: '/health', timeoutMs: timeout, noProbe: true },
  } as Record<string, ServiceConfigExtended>;
}
