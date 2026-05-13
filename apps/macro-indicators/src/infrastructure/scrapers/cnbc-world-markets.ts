/**
 * Infrastructure Adapter — cnbc-world-markets
 *
 * Source: CNBC quote.cnbc.com REST quote API
 * Technique: curl_cffi Chrome impersonation via Python subprocess (~15MB RAM)
 * Recon: docs/mainserver-sources/cnbc-world-markets/recon.md
 *
 * Replaces Bun native fetch which accumulated >8s over 6 sequential fetches
 * and returned no data due to stale symbol names.
 *
 * Symbol fix (2026-05-13): CNBC quote API returns price data only for
 * dot-prefixed symbols (.SPX, .DJI, .IXIC, .N225, .HSI, .FTSE).
 * The legacy SP500/DJ30/NASDAQ symbols return code=1 with no price.
 *
 * Python helper: src/infrastructure/scrapers/cnbc_markets_fetch.py
 * Interface unchanged — CnbcWorldMarketsPort contract preserved.
 */

import type { CnbcWorldMarketsPort, CnbcQuote } from '../../domain/repositories.js';

import { spawn } from 'child_process';
import path from 'path';

/** Corrected CNBC dotted symbols that return actual price data. */
export const DEFAULT_CNBC_SYMBOLS: string[] = [
  '.SPX',   // S&P 500
  '.DJI',   // Dow Jones Industrial Average
  '.IXIC',  // NASDAQ Composite
  '.N225',  // Nikkei 225
  '.HSI',   // Hang Seng Index
  '.FTSE',  // FTSE 100
];

/** Absolute path to the Python fetch helper. */
const PYTHON_HELPER = path.join(
  process.cwd(),
  'src/infrastructure/scrapers/cnbc_markets_fetch.py',
);

interface PythonQuote {
  symbol: string;
  last: string;
  change: string;
  changePct: string;
  open: string;
  fetchedAt: string;
}

interface PythonEnvelope {
  status: string;
  data?: Record<string, PythonQuote | null>;
  reason?: string;
}

function runPythonHelper(symbols: string[]): Promise<Record<string, CnbcQuote | null>> {
  return new Promise((resolve) => {
    const py = spawn(
      'python3',
      [PYTHON_HELPER, '--symbols', ...symbols],
      { timeout: 30_000 },
    );

    let stdout = '';
    let stderr = '';
    py.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    py.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    py.on('close', (code) => {
      if (code !== 0) {
        console.error(`[cnbc-world-markets] Python helper exited ${code}: ${stderr.slice(0, 300)}`);
        resolve(Object.fromEntries(symbols.map((s) => [s, null])));
        return;
      }
      try {
        const envelope = JSON.parse(stdout) as PythonEnvelope;
        if (envelope.status !== 'ok' || !envelope.data) {
          console.error('[cnbc-world-markets] helper error:', envelope.reason);
          resolve(Object.fromEntries(symbols.map((s) => [s, null])));
          return;
        }
        const result: Record<string, CnbcQuote | null> = {};
        for (const sym of symbols) {
          result[sym] = envelope.data[sym] ?? null;
        }
        resolve(result);
      } catch (err) {
        console.error('[cnbc-world-markets] JSON parse error:', err);
        resolve(Object.fromEntries(symbols.map((s) => [s, null])));
      }
    });

    py.on('error', (err) => {
      console.error('[cnbc-world-markets] spawn error:', err.message);
      resolve(Object.fromEntries(symbols.map((s) => [s, null])));
    });
  });
}

export class CnbcWorldMarketsAdapter implements CnbcWorldMarketsPort {
  async fetchQuote(symbol: string): Promise<CnbcQuote | null> {
    const result = await this.fetchBatch([symbol]);
    return result[symbol] ?? null;
  }

  async fetchBatch(symbols: string[]): Promise<Record<string, CnbcQuote | null>> {
    try {
      return await runPythonHelper(symbols);
    } catch (err) {
      console.error('[cnbc-world-markets] unexpected error:', err);
      return Object.fromEntries(symbols.map((s) => [s, null]));
    }
  }
}
