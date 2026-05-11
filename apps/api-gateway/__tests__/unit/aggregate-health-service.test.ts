/**
 * Unit tests — AggregateHealthService
 *
 * Tests health aggregation logic with mocked ports.
 * No HTTP calls — pure domain logic.
 */

import { describe, it, expect, mock } from 'bun:test';
import { AggregateHealthService } from '../../src/domain/services.js';
import type { HealthCheckPort, ServiceRegistryPort } from '../../src/domain/repositories.js';
import type { ServiceConfig, ServiceHealthResult } from '../../src/domain/models.js';

const MOCK_SERVICES: ServiceConfig[] = [
  { name: 'mcp',   baseUrl: 'http://mcp:3000',   healthPath: '/health', timeoutMs: 2000 },
  { name: 'pdf',   baseUrl: 'http://pdf:5001',   healthPath: '/health', timeoutMs: 2000 },
  { name: 'rag',   baseUrl: 'http://rag:5002',   healthPath: '/health', timeoutMs: 2000 },
  { name: 'ta',    baseUrl: 'http://ta:5003',    healthPath: '/health', timeoutMs: 2000 },
  { name: 'macro', baseUrl: 'http://macro:5004', healthPath: '/health', timeoutMs: 2000 },
  { name: 'stock', baseUrl: 'http://stock:5000', healthPath: '/health', timeoutMs: 2000 },
];

function makeRegistry(services = MOCK_SERVICES): ServiceRegistryPort {
  return {
    getAllServices: mock(() => services),
    getService: mock((name) => services.find((s) => s.name === name)),
  };
}

function makeChecker(results: Record<string, ServiceHealthResult>): HealthCheckPort {
  return {
    checkHealth: mock(async (svc) => results[svc.name] ?? { service: svc.name, status: 'down', latencyMs: -1 }),
  };
}

describe('AggregateHealthService', () => {
  it('returns ok status when all services are healthy', async () => {
    const allOk = Object.fromEntries(
      MOCK_SERVICES.map((s) => [s.name, { service: s.name, status: 'ok' as const, latencyMs: 50 }]),
    );
    const service = new AggregateHealthService(makeChecker(allOk), makeRegistry());
    const result = await service.aggregate();

    expect(result.status).toBe('ok');
  });

  it('returns degraded status when some services are down', async () => {
    const results: Record<string, ServiceHealthResult> = {
      mcp:   { service: 'mcp',   status: 'ok',   latencyMs: 50 },
      pdf:   { service: 'pdf',   status: 'down', latencyMs: -1 },
      rag:   { service: 'rag',   status: 'ok',   latencyMs: 60 },
      ta:    { service: 'ta',    status: 'ok',   latencyMs: 55 },
      macro: { service: 'macro', status: 'ok',   latencyMs: 45 },
      stock: { service: 'stock', status: 'ok',   latencyMs: 70 },
    };
    const service = new AggregateHealthService(makeChecker(results), makeRegistry());
    const result = await service.aggregate();

    expect(result.status).toBe('degraded');
  });

  it('returns down status when all services are down', async () => {
    const allDown = Object.fromEntries(
      MOCK_SERVICES.map((s) => [s.name, { service: s.name, status: 'down' as const, latencyMs: -1 }]),
    );
    const service = new AggregateHealthService(makeChecker(allDown), makeRegistry());
    const result = await service.aggregate();

    expect(result.status).toBe('down');
  });

  it('includes all service names in result', async () => {
    const allOk = Object.fromEntries(
      MOCK_SERVICES.map((s) => [s.name, { service: s.name, status: 'ok' as const, latencyMs: 50 }]),
    );
    const service = new AggregateHealthService(makeChecker(allOk), makeRegistry());
    const result = await service.aggregate();

    for (const svc of MOCK_SERVICES) {
      expect(result.services).toHaveProperty(svc.name);
      expect(result.latencies).toHaveProperty(svc.name);
    }
  });

  it('calls health check for all 6 services', async () => {
    const allOk = Object.fromEntries(
      MOCK_SERVICES.map((s) => [s.name, { service: s.name, status: 'ok' as const, latencyMs: 50 }]),
    );
    const checker = makeChecker(allOk);
    const service = new AggregateHealthService(checker, makeRegistry());
    await service.aggregate();

    expect(checker.checkHealth).toHaveBeenCalledTimes(6);
  });

  it('includes checkedAt ISO timestamp', async () => {
    const allOk = Object.fromEntries(
      MOCK_SERVICES.map((s) => [s.name, { service: s.name, status: 'ok' as const, latencyMs: 50 }]),
    );
    const service = new AggregateHealthService(makeChecker(allOk), makeRegistry());
    const result = await service.aggregate();

    expect(result.checkedAt).toBeTruthy();
    expect(new Date(result.checkedAt).toISOString()).toBe(result.checkedAt);
  });

  it('handles checker exception gracefully', async () => {
    const throwing: HealthCheckPort = {
      checkHealth: mock(async () => { throw new Error('connection refused'); }),
    };
    const service = new AggregateHealthService(throwing, makeRegistry());
    const result = await service.aggregate();

    expect(result.status).toBe('down');
    for (const svc of MOCK_SERVICES) {
      expect(result.services[svc.name]).toBe('down');
    }
  });
});
