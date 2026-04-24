/**
 * API Gateway Domain — Repository Ports (Abstract)
 */

import type { ServiceHealthResult, ServiceConfig } from './models.js';

/** Port: check health of a single service. */
export interface HealthCheckPort {
  checkHealth(service: ServiceConfig): Promise<ServiceHealthResult>;
}

/** Port: read service registry. */
export interface ServiceRegistryPort {
  getAllServices(): ServiceConfig[];
  getService(name: string): ServiceConfig | undefined;
}
