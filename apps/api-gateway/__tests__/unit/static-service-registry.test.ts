/**
 * Unit tests — StaticServiceRegistry
 *
 * Tests service registry lookup and default URL configuration.
 */

import { describe, it, expect } from 'bun:test';
import { StaticServiceRegistry } from '../../src/infrastructure/health_checker.js';

describe('StaticServiceRegistry', () => {
  it('returns all 8 services', () => {
    const registry = new StaticServiceRegistry({});
    const services = registry.getAllServices();
    expect(services).toHaveLength(8);
  });

  it('returns service names: mcp, pdf, rag, ta, macro, stock, kinh-dich, alert', () => {
    const registry = new StaticServiceRegistry({});
    const names = registry.getAllServices().map((s) => s.name).sort();
    expect(names).toEqual(['alert', 'kinh-dich', 'macro', 'mcp', 'pdf', 'rag', 'stock', 'ta']);
  });

  it('uses custom URLs from config', () => {
    const registry = new StaticServiceRegistry({
      mcp: 'http://localhost:3000',
      ta:  'http://localhost:5003',
    });
    const mcp = registry.getService('mcp');
    expect(mcp?.baseUrl).toBe('http://localhost:3000');
    const ta = registry.getService('ta');
    expect(ta?.baseUrl).toBe('http://localhost:5003');
  });

  it('falls back to default docker service names', () => {
    const registry = new StaticServiceRegistry({});
    const pdf = registry.getService('pdf');
    expect(pdf?.baseUrl).toBe('http://pdf-extractor:5001');
  });

  it('returns undefined for unknown service', () => {
    const registry = new StaticServiceRegistry({});
    expect(registry.getService('nonexistent')).toBeUndefined();
  });

  it('all services have 2000ms timeout', () => {
    const registry = new StaticServiceRegistry({});
    for (const svc of registry.getAllServices()) {
      expect(svc.timeoutMs).toBe(2000);
    }
  });
});
