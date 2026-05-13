/**
 * Integration tests — AggregateHealthUseCase + ServiceHealthUseCase
 *
 * Real domain service + real registry + mocked HTTP checker.
 */

import { describe, it, expect, mock } from 'bun:test';
import { AggregateHealthUseCase, ServiceHealthUseCase } from '../../src/application/usecases.js';
import { AggregateHealthService } from '../../src/domain/services.js';
import { StaticServiceRegistry } from '../../src/infrastructure/health_checker.js';
import type { HealthCheckPort } from '../../src/domain/repositories.js';
import type { ServiceConfig, ServiceHealthResult } from '../../src/domain/models.js';

function makeMockChecker(status: 'ok' | 'down' = 'ok'): HealthCheckPort {
  return {
    checkHealth: mock(async (svc: ServiceConfig): Promise<ServiceHealthResult> => ({
      service: svc.name,
      status,
      latencyMs: status === 'ok' ? 45 : -1,
    })),
  };
}

describe('AggregateHealthUseCase (integration)', () => {
  it('returns AggregatedHealth with all services ok', async () => {
    const registry = new StaticServiceRegistry({
      mcp: 'http://localhost:3000',
      pdf: 'http://localhost:5001',
      rag: 'http://localhost:5002',
      ta:  'http://localhost:5003',
      macro: 'http://localhost:5004',
      stock: 'http://localhost:5000',
    });
    const checker = makeMockChecker('ok');
    const service = new AggregateHealthService(checker, registry);
    const useCase = new AggregateHealthUseCase(service);

    const result = await useCase.execute();

    expect(result.status).toBe('ok');
    expect(Object.keys(result.services)).toHaveLength(9);
    expect(result.checkedAt).toBeTruthy();
  });

  it('returns degraded when some services down', async () => {
    const registry = new StaticServiceRegistry({});
    let callCount = 0;
    const mixedChecker: HealthCheckPort = {
      checkHealth: mock(async (svc: ServiceConfig): Promise<ServiceHealthResult> => {
        callCount++;
        // First 3 calls return ok, rest return down
        return {
          service: svc.name,
          status: callCount <= 3 ? 'ok' : 'down',
          latencyMs: 50,
        };
      }),
    };
    const service = new AggregateHealthService(mixedChecker, registry);
    const useCase = new AggregateHealthUseCase(service);

    const result = await useCase.execute();

    expect(result.status).toBe('degraded');
  });
});

describe('ServiceHealthUseCase (integration)', () => {
  it('returns health for known service', async () => {
    const registry = new StaticServiceRegistry({ mcp: 'http://localhost:3000' });
    const checker = makeMockChecker('ok');
    const useCase = new ServiceHealthUseCase(registry, checker);

    const result = await useCase.execute('mcp');

    expect(result).not.toBeNull();
    expect(result!.service).toBe('mcp');
    expect(result!.status).toBe('ok');
  });

  it('returns null for unknown service', async () => {
    const registry = new StaticServiceRegistry({});
    const checker = makeMockChecker('ok');
    const useCase = new ServiceHealthUseCase(registry, checker);

    const result = await useCase.execute('nonexistent');

    expect(result).toBeNull();
  });
});
