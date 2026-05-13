/**
 * Unit tests — TradingEconomicsVnAdapter (curl_cffi subprocess)
 *
 * The adapter now shells out to trading_economics_fetch.py via spawn().
 * Unit tests mock child_process.spawn to avoid actual network calls.
 *
 * Also validates:
 * - @graph JSON-LD unwrapping is handled by Python helper (not TS regex)
 * - fetchIndicator delegates to fetchVnMacroBatch correctly
 */

import { describe, it, expect, beforeEach, spyOn } from 'bun:test';
import { TradingEconomicsVnAdapter, VN_TE_SLUGS } from '../../../src/infrastructure/scrapers/trading-economics-vn.js';
import * as childProcess from 'child_process';
import { EventEmitter } from 'events';

function makeSpawnMock(payload: object, exitCode = 0) {
  return () => {
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const proc = new EventEmitter() as ReturnType<typeof childProcess.spawn>;
    (proc as unknown as { stdout: EventEmitter; stderr: EventEmitter }).stdout = stdout;
    (proc as unknown as { stdout: EventEmitter; stderr: EventEmitter }).stderr = stderr;
    setTimeout(() => {
      stdout.emit('data', Buffer.from(JSON.stringify(payload)));
      proc.emit('close', exitCode);
    }, 0);
    return proc;
  };
}

function makeOkEnvelope(): object {
  const data: Record<string, object> = {};
  for (const key of Object.keys(VN_TE_SLUGS)) {
    data[key] = {
      name: `Vietnam ${key}`,
      latestValue: `Current ${key} value`,
      temporalCoverage: '1990-01-01/2026-01-01',
      dateModified: '2026-05-01T00:00:00Z',
      fetchedAt: '2026-05-13T12:00:00Z',
    };
  }
  return { status: 'ok', data, fetched_at: '2026-05-13T12:00:00Z' };
}

describe('TradingEconomicsVnAdapter (subprocess)', () => {
  let adapter: TradingEconomicsVnAdapter;

  beforeEach(() => {
    adapter = new TradingEconomicsVnAdapter();
  });

  describe('fetchVnMacroBatch', () => {
    it('returns all VN indicators parsed from Python helper', async () => {
      const spawnSpy = spyOn(childProcess, 'spawn').mockImplementation(
        makeSpawnMock(makeOkEnvelope()) as never,
      );

      const result = await adapter.fetchVnMacroBatch();

      expect(result['gdp']).not.toBeNull();
      expect(result['gdp']!.name).toBe('Vietnam gdp');
      expect(result['inflation_cpi']).not.toBeNull();
      expect(Object.keys(result)).toHaveLength(Object.keys(VN_TE_SLUGS).length);

      spawnSpy.mockRestore();
    });

    it('returns null-filled record when Python helper exits non-zero', async () => {
      const spawnSpy = spyOn(childProcess, 'spawn').mockImplementation(
        makeSpawnMock({ status: 'error', reason: 'blocked' }, 1) as never,
      );

      const result = await adapter.fetchVnMacroBatch();
      expect(Object.values(result).every((v) => v === null)).toBe(true);

      spawnSpy.mockRestore();
    });

    it('returns null-filled record when helper returns status=error', async () => {
      const spawnSpy = spyOn(childProcess, 'spawn').mockImplementation(
        makeSpawnMock({ status: 'error', reason: 'timeout' }, 0) as never,
      );

      const result = await adapter.fetchVnMacroBatch();
      expect(Object.values(result).every((v) => v === null)).toBe(true);

      spawnSpy.mockRestore();
    });

    it('returns null-filled record when JSON parse fails', async () => {
      function badJsonFactory() {
        const stdout = new EventEmitter();
        const stderr = new EventEmitter();
        const proc = new EventEmitter() as ReturnType<typeof childProcess.spawn>;
        (proc as unknown as { stdout: EventEmitter; stderr: EventEmitter }).stdout = stdout;
        (proc as unknown as { stdout: EventEmitter; stderr: EventEmitter }).stderr = stderr;
        setTimeout(() => {
          stdout.emit('data', Buffer.from('invalid-json'));
          proc.emit('close', 0);
        }, 0);
        return proc;
      }
      const spawnSpy = spyOn(childProcess, 'spawn').mockImplementation(badJsonFactory as never);

      const result = await adapter.fetchVnMacroBatch();
      expect(Object.values(result).every((v) => v === null)).toBe(true);

      spawnSpy.mockRestore();
    });
  });

  describe('fetchIndicator', () => {
    it('returns indicator by slug via batch delegation', async () => {
      const spawnSpy = spyOn(childProcess, 'spawn').mockImplementation(
        makeSpawnMock(makeOkEnvelope()) as never,
      );

      const result = await adapter.fetchIndicator('gdp');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Vietnam gdp');

      spawnSpy.mockRestore();
    });

    it('returns null for unknown slug', async () => {
      const spawnSpy = spyOn(childProcess, 'spawn').mockImplementation(
        makeSpawnMock(makeOkEnvelope()) as never,
      );

      const result = await adapter.fetchIndicator('unknown-slug-xyz');
      expect(result).toBeNull();

      spawnSpy.mockRestore();
    });
  });

  describe('VN_TE_SLUGS catalog', () => {
    it('contains expected indicator slugs', () => {
      expect(VN_TE_SLUGS['gdp']).toBe('gdp');
      expect(VN_TE_SLUGS['inflation_cpi']).toBe('inflation-cpi');
      expect(VN_TE_SLUGS['interest_rate']).toBe('interest-rate');
      expect(Object.keys(VN_TE_SLUGS)).toHaveLength(7);
    });
  });
});
