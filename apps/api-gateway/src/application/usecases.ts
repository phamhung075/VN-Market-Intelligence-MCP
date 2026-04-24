/**
 * API Gateway Application — Use Cases
 */

import type { AggregateHealthService } from '../domain/services.js';
import type { ServiceRegistryPort, HealthCheckPort } from '../domain/repositories.js';
import type { AggregatedHealth, ServiceHealthResult } from '../domain/models.js';

export class AggregateHealthUseCase {
  constructor(private readonly service: AggregateHealthService) {}

  async execute(): Promise<AggregatedHealth> {
    return this.service.aggregate();
  }
}

export class ServiceHealthUseCase {
  constructor(
    private readonly registry: ServiceRegistryPort,
    private readonly checker: HealthCheckPort,
  ) {}

  async execute(serviceName: string): Promise<ServiceHealthResult | null> {
    const svc = this.registry.getService(serviceName);
    if (!svc) return null;
    return this.checker.checkHealth(svc);
  }
}
