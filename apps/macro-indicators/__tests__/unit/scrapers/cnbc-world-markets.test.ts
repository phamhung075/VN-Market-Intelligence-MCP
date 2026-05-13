/**
 * Unit tests — CnbcWorldMarketsAdapter (curl_cffi subprocess)
 *
 * The adapter now shells out to cnbc_markets_fetch.py via spawn().
 * Unit tests mock child_process.spawn to avoid actual network calls.
 *
 * Also validates symbol fix: DEFAULT_CNBC_SYMBOLS uses dotted form
 * (.SPX, .DJI, etc.) which are the symbols that return actual price data
 * from the CNBC quote API.
 */

import { describe, it, expect, beforeEach, spyOn } from 'bun:test';
import { CnbcWorldMarketsAdapter, DEFAULT_CNBC_SYMBOLS } from '../../../src/infrastructure/scrapers/cnbc-world-markets.js';
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

function makeOkEnvelope(symbols: string[]): object {
  const data: Record<string, object> = {};
  for (const sym of symbols) {
    data[sym] = {
      symbol: sym,
      last: '5388.55',
      change: '-12.45',
      changePct: '-0.23%',
      open: '5400.00',
      fetchedAt: '2026-05-13T12:00:00Z',
    };
  }
  return { status: 'ok', data, fetched_at: '2026-05-13T12:00:00Z' };
}

describe('CnbcWorldMarketsAdapter (subprocess)', () => {
  let adapter: CnbcWorldMarketsAdapter;

  beforeEach(() => {
    adapter = new CnbcWorldMarketsAdapter();
  });

  describe('fetchBatch', () => {
    it('returns parsed quotes from Python helper stdout', async () => {
      const symbols = ['.SPX', '.DJI'];
      const spawnSpy = spyOn(childProcess, 'spawn').mockImplementation(
        makeSpawnMock(makeOkEnvelope(symbols)) as never,
      );

      const result = await adapter.fetchBatch(symbols);

      expect(result['.SPX']).not.toBeNull();
      expect(result['.SPX']!.last).toBe('5388.55');
      expect(result['.SPX']!.change).toBe('-12.45');
      expect(result['.SPX']!.changePct).toBe('-0.23%');
      expect(result['.DJI']).not.toBeNull();

      spawnSpy.mockRestore();
    });

    it('returns null values when Python helper exits non-zero', async () => {
      const symbols = ['.SPX'];
      const spawnSpy = spyOn(childProcess, 'spawn').mockImplementation(
        makeSpawnMock({ status: 'error', reason: 'curl_cffi not installed' }, 1) as never,
      );

      const result = await adapter.fetchBatch(symbols);
      expect(result['.SPX']).toBeNull();

      spawnSpy.mockRestore();
    });

    it('returns null values when helper returns status=error', async () => {
      const symbols = ['.SPX'];
      const spawnSpy = spyOn(childProcess, 'spawn').mockImplementation(
        makeSpawnMock({ status: 'error', reason: 'blocked' }, 0) as never,
      );

      const result = await adapter.fetchBatch(symbols);
      expect(result['.SPX']).toBeNull();

      spawnSpy.mockRestore();
    });

    it('returns null values on invalid JSON from helper', async () => {
      const symbols = ['.SPX'];
      function badJsonFactory() {
        const stdout = new EventEmitter();
        const stderr = new EventEmitter();
        const proc = new EventEmitter() as ReturnType<typeof childProcess.spawn>;
        (proc as unknown as { stdout: EventEmitter; stderr: EventEmitter }).stdout = stdout;
        (proc as unknown as { stdout: EventEmitter; stderr: EventEmitter }).stderr = stderr;
        setTimeout(() => {
          stdout.emit('data', Buffer.from('bad-json'));
          proc.emit('close', 0);
        }, 0);
        return proc;
      }
      const spawnSpy = spyOn(childProcess, 'spawn').mockImplementation(badJsonFactory as never);

      const result = await adapter.fetchBatch(symbols);
      expect(result['.SPX']).toBeNull();

      spawnSpy.mockRestore();
    });
  });

  describe('fetchQuote', () => {
    it('delegates to fetchBatch and returns single quote', async () => {
      const spawnSpy = spyOn(childProcess, 'spawn').mockImplementation(
        makeSpawnMock(makeOkEnvelope(['.N225'])) as never,
      );

      const result = await adapter.fetchQuote('.N225');
      expect(result).not.toBeNull();
      expect(result!.last).toBe('5388.55');

      spawnSpy.mockRestore();
    });
  });

  describe('DEFAULT_CNBC_SYMBOLS', () => {
    it('uses dotted symbol format that returns actual price data', () => {
      expect(DEFAULT_CNBC_SYMBOLS).toContain('.SPX');
      expect(DEFAULT_CNBC_SYMBOLS).toContain('.DJI');
      expect(DEFAULT_CNBC_SYMBOLS).toContain('.IXIC');
      expect(DEFAULT_CNBC_SYMBOLS).toContain('.N225');
      expect(DEFAULT_CNBC_SYMBOLS).toContain('.HSI');
      expect(DEFAULT_CNBC_SYMBOLS).toContain('.FTSE');
    });

    it('does not contain legacy symbols that return no data', () => {
      expect(DEFAULT_CNBC_SYMBOLS).not.toContain('SP500');
      expect(DEFAULT_CNBC_SYMBOLS).not.toContain('DJ30');
      expect(DEFAULT_CNBC_SYMBOLS).not.toContain('NASDAQ');
    });
  });
});
