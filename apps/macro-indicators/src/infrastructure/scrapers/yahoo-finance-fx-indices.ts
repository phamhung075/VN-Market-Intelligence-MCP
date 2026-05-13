/**
 * Infrastructure Adapter — yahoo-finance-fx-indices
 *
 * Source: Yahoo Finance v8 chart API (query2.finance.yahoo.com)
 * Technique: curl_cffi Chrome impersonation via Python subprocess (~15MB RAM)
 * Recon: docs/mainserver-sources/yahoo-finance-fx-indices/recon.md
 *
 * Replaces Bun native fetch which timed out at 8s budget due to sequential
 * symbol fetches accumulating >12s total (12 symbols × 1-2s jitter each).
 * Python subprocess fetches all symbols in parallel via ThreadPoolExecutor.
 *
 * Python helper: src/infrastructure/scrapers/yahoo_finance_fetch.py
 * Interface unchanged — YahooFxIndicesPort contract preserved.
 */

import type { YahooFxIndicesPort, YahooQuote } from '../../domain/repositories.js';
export { DEFAULT_SYMBOLS } from '../../domain/defaults.js';

import { spawn } from 'child_process';
import path from 'path';

/** Absolute path to the Python fetch helper. */
const PYTHON_HELPER = path.join(
  process.cwd(),
  'src/infrastructure/scrapers/yahoo_finance_fetch.py',
);

/** Shape returned by the Python helper per-symbol. */
interface PythonQuote {
  symbol: string;
  price: number;
  currency: string;
  exchangeName: string;
  dayHigh: number | null;
  dayLow: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  lastUpdated: string;
}

interface PythonEnvelope {
  status: string;
  data?: Record<string, PythonQuote | null>;
  reason?: string;
}

/** Run the Python helper and return all fetched quotes as a record. */
function runPythonHelper(symbols: string[]): Promise<Record<string, YahooQuote | null>> {
  return new Promise((resolve) => {
    const py = spawn(
      'python3',
      [PYTHON_HELPER, '--symbols', ...symbols],
      { timeout: 45_000 },
    );

    let stdout = '';
    let stderr = '';
    py.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    py.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    py.on('close', (code) => {
      if (code !== 0) {
        console.error(`[yahoo-fx-indices] Python helper exited ${code}: ${stderr.slice(0, 300)}`);
        resolve(Object.fromEntries(symbols.map((s) => [s, null])));
        return;
      }
      try {
        const envelope = JSON.parse(stdout) as PythonEnvelope;
        if (envelope.status !== 'ok' || !envelope.data) {
          console.error('[yahoo-fx-indices] helper error:', envelope.reason);
          resolve(Object.fromEntries(symbols.map((s) => [s, null])));
          return;
        }
        const result: Record<string, YahooQuote | null> = {};
        for (const sym of symbols) {
          const q = envelope.data[sym];
          result[sym] = q ?? null;
        }
        resolve(result);
      } catch (err) {
        console.error('[yahoo-fx-indices] JSON parse error:', err);
        resolve(Object.fromEntries(symbols.map((s) => [s, null])));
      }
    });

    py.on('error', (err) => {
      console.error('[yahoo-fx-indices] spawn error:', err.message);
      resolve(Object.fromEntries(symbols.map((s) => [s, null])));
    });
  });
}

export class YahooFxIndicesAdapter implements YahooFxIndicesPort {
  async fetchSymbol(symbol: string): Promise<YahooQuote | null> {
    const result = await this.fetchBatch([symbol]);
    return result[symbol] ?? null;
  }

  async fetchBatch(symbols: string[]): Promise<Record<string, YahooQuote | null>> {
    try {
      return await runPythonHelper(symbols);
    } catch (err) {
      console.error('[yahoo-fx-indices] unexpected error:', err);
      return Object.fromEntries(symbols.map((s) => [s, null]));
    }
  }
}
