/**
 * API Gateway Domain — AggregateHealthService
 *
 * Pure business logic: fans out health checks to all services in parallel,
 * aggregates results into a single response.
 * Zero I/O — all HTTP calls delegated to injected HealthCheckPort.
 */

import type { AggregatedHealth, HealthStatus } from './models.js';
import type { HealthCheckPort, ServiceRegistryPort } from './repositories.js';

export class AggregateHealthService {
  constructor(
    private readonly checker: HealthCheckPort,
    private readonly registry: ServiceRegistryPort,
  ) {}

  async aggregate(): Promise<AggregatedHealth> {
    const services = this.registry.getAllServices();

    // Fan out all health checks in parallel
    const results = await Promise.allSettled(
      services.map((svc) => this.checker.checkHealth(svc)),
    );

    const statuses: Record<string, HealthStatus> = {};
    const latencies: Record<string, number> = {};

    results.forEach((r, i) => {
      const name = services[i]!.name;
      if (r.status === 'fulfilled') {
        statuses[name] = r.value.status;
        latencies[name] = r.value.latencyMs;
      } else {
        statuses[name] = 'down';
        latencies[name] = -1;
      }
    });

    const statusValues = Object.values(statuses);
    const allOk = statusValues.every((s) => s === 'ok');
    const allDown = statusValues.every((s) => s === 'down');

    return {
      status: allOk ? 'ok' : allDown ? 'down' : 'degraded',
      services: statuses,
      latencies,
      checkedAt: new Date().toISOString(),
    };
  }
}
