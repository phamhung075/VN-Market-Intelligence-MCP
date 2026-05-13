/**
 * Unit tests — YahooFxIndicesAdapter (curl_cffi subprocess)
 *
 * The adapter now shells out to yahoo_finance_fetch.py via spawn().
 * Unit tests mock child_process.spawn to avoid actual network calls.
 */

import { describe, it, expect, beforeEach, mock, spyOn } from 'bun:test';
import { YahooFxIndicesAdapter, DEFAULT_SYMBOLS } from '../../../src/infrastructure/scrapers/yahoo-finance-fx-indices.js';
import * as childProcess from 'child_process';
import { EventEmitter } from 'events';

/** Build a minimal spawn mock that emits stdout JSON and closes with code 0. */
function makeSpawnMock(payload: object, exitCode = 0) {
  return () => {
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const proc = new EventEmitter() as ReturnType<typeof childProcess.spawn>;
    (proc as unknown as { stdout: EventEmitter; stderr: EventEmitter }).stdout = stdout;
    (proc as unknown as { stdout: EventEmitter; stderr: EventEmitter }).stderr = stderr;

    // Emit data on next tick so listeners are attached first
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
      price: 1.1738,
      currency: 'USD',
      exchangeName: 'CCY',
      dayHigh: 1.18,
      dayLow: 1.17,
      fiftyTwoWeekHigh: 1.2,
      fiftyTwoWeekLow: 1.1,
      lastUpdated: '2026-05-13T12:00:00.000Z',
    };
  }
  return { status: 'ok', data, fetched_at: '2026-05-13T12:00:00Z' };
}

describe('YahooFxIndicesAdapter (subprocess)', () => {
  let adapter: YahooFxIndicesAdapter;

  beforeEach(() => {
    adapter = new YahooFxIndicesAdapter();
  });

  describe('fetchBatch', () => {
    it('returns parsed quotes from Python helper stdout', async () => {
      const symbols = ['EURUSD=X', '^GSPC'];
      const spawnSpy = spyOn(childProcess, 'spawn').mockImplementation(
        makeSpawnMock(makeOkEnvelope(symbols)) as never,
      );

      const result = await adapter.fetchBatch(symbols);

      expect(result['EURUSD=X']).not.toBeNull();
      expect(result['EURUSD=X']!.price).toBeCloseTo(1.1738);
      expect(result['^GSPC']).not.toBeNull();
      expect(spawnSpy).toHaveBeenCalled();

      spawnSpy.mockRestore();
    });

    it('returns null values when Python helper exits non-zero', async () => {
      const symbols = ['EURUSD=X'];
      const spawnSpy = spyOn(childProcess, 'spawn').mockImplementation(
        makeSpawnMock({ status: 'error', reason: 'curl_cffi not installed' }, 1) as never,
      );

      const result = await adapter.fetchBatch(symbols);
      expect(result['EURUSD=X']).toBeNull();

      spawnSpy.mockRestore();
    });

    it('returns null values when helper returns status=error', async () => {
      const symbols = ['EURUSD=X'];
      const spawnSpy = spyOn(childProcess, 'spawn').mockImplementation(
        makeSpawnMock({ status: 'error', reason: 'network timeout' }, 0) as never,
      );

      const result = await adapter.fetchBatch(symbols);
      expect(result['EURUSD=X']).toBeNull();

      spawnSpy.mockRestore();
    });

    it('returns null values when helper stdout is invalid JSON', async () => {
      const symbols = ['EURUSD=X'];
      function badJsonFactory() {
        const stdout = new EventEmitter();
        const stderr = new EventEmitter();
        const proc = new EventEmitter() as ReturnType<typeof childProcess.spawn>;
        (proc as unknown as { stdout: EventEmitter; stderr: EventEmitter }).stdout = stdout;
        (proc as unknown as { stdout: EventEmitter; stderr: EventEmitter }).stderr = stderr;
        setTimeout(() => {
          stdout.emit('data', Buffer.from('not-json'));
          proc.emit('close', 0);
        }, 0);
        return proc;
      }
      const spawnSpy = spyOn(childProcess, 'spawn').mockImplementation(badJsonFactory as never);

      const result = await adapter.fetchBatch(symbols);
      expect(result['EURUSD=X']).toBeNull();

      spawnSpy.mockRestore();
    });
  });

  describe('fetchSymbol', () => {
    it('delegates to fetchBatch and returns single symbol', async () => {
      const spawnSpy = spyOn(childProcess, 'spawn').mockImplementation(
        makeSpawnMock(makeOkEnvelope(['USDVND=X'])) as never,
      );

      const result = await adapter.fetchSymbol('USDVND=X');
      expect(result).not.toBeNull();
      expect(result!.price).toBeCloseTo(1.1738);

      spawnSpy.mockRestore();
    });
  });

  describe('DEFAULT_SYMBOLS', () => {
    it('includes key FX and index symbols', () => {
      expect(DEFAULT_SYMBOLS).toContain('EURUSD=X');
      expect(DEFAULT_SYMBOLS).toContain('USDVND=X');
      expect(DEFAULT_SYMBOLS).toContain('^GSPC');
      expect(DEFAULT_SYMBOLS).toContain('^N225');
      expect(DEFAULT_SYMBOLS).toContain('^HSI');
    });
  });
});
