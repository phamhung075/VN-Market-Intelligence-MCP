/**
 * API Gateway Infrastructure — HTTP Health Checker
 *
 * Concrete implementation of HealthCheckPort.
 * Uses fetch with AbortSignal.timeout to enforce per-service timeout.
 */

import type { HealthCheckPort } from '../domain/repositories.js';
import type { ServiceConfig, ServiceHealthResult } from '../domain/models.js';

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

  getAllServices() {
    return Object.values(this.services);
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
  } as Record<string, { name: string; baseUrl: string; healthPath: string; timeoutMs: number }>;
}
