/**
 * Infrastructure Adapter — trading-economics-vn
 *
 * Source: tradingeconomics.com/vietnam/<indicator-slug>
 * Technique: curl_cffi Chrome impersonation via Python subprocess (~15MB RAM)
 * Recon: docs/mainserver-sources/trading-economics-vn/recon.md
 *
 * Replaces Bun native fetch which timed out at 8s budget due to sequential
 * indicator fetches (7 slugs × 2-3.5s jitter = 14-24s total).
 * Python subprocess fetches all indicators in parallel via ThreadPoolExecutor.
 *
 * Bug fixed (2026-05-13): TradingEconomics wraps Dataset in @graph container.
 * The Bun-native adapter's extractJsonLd missed @graph — always returned null.
 * The Python helper handles @graph correctly.
 *
 * Python helper: src/infrastructure/scrapers/trading_economics_fetch.py
 * Interface unchanged — TradingEconomicsVnPort contract preserved.
 */

import type { TradingEconomicsVnPort, TradingEconomicsIndicator } from '../../domain/repositories.js';

import { spawn } from 'child_process';
import path from 'path';

/** Vietnam indicator slugs tracked for market intelligence. */
export const VN_TE_SLUGS: Record<string, string> = {
  gdp:                   'gdp',
  inflation_cpi:         'inflation-cpi',
  balance_trade:         'balance-of-trade',
  interest_rate:         'interest-rate',
  unemployment:          'unemployment-rate',
  fdi:                   'foreign-direct-investment',
  industrial_production: 'industrial-production',
  manufacturing_pmi:     'manufacturing-pmi',
};

/** Absolute path to the Python fetch helper. */
const PYTHON_HELPER = path.join(
  process.cwd(),
  'src/infrastructure/scrapers/trading_economics_fetch.py',
);

interface PythonIndicator {
  name: string;
  latestValue: string;
  temporalCoverage: string;
  dateModified: string;
  fetchedAt: string;
}

interface PythonEnvelope {
  status: string;
  data?: Record<string, PythonIndicator | null>;
  reason?: string;
}

function runPythonHelper(): Promise<Record<string, TradingEconomicsIndicator | null>> {
  return new Promise((resolve) => {
    const py = spawn('python3', [PYTHON_HELPER], { timeout: 60_000 });

    let stdout = '';
    let stderr = '';
    py.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    py.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    py.on('close', (code) => {
      if (code !== 0) {
        console.error(`[trading-economics-vn] Python helper exited ${code}: ${stderr.slice(0, 300)}`);
        resolve(Object.fromEntries(Object.keys(VN_TE_SLUGS).map((k) => [k, null])));
        return;
      }
      try {
        const envelope = JSON.parse(stdout) as PythonEnvelope;
        if (envelope.status !== 'ok' || !envelope.data) {
          console.error('[trading-economics-vn] helper error:', envelope.reason);
          resolve(Object.fromEntries(Object.keys(VN_TE_SLUGS).map((k) => [k, null])));
          return;
        }
        const result: Record<string, TradingEconomicsIndicator | null> = {};
        for (const key of Object.keys(VN_TE_SLUGS)) {
          result[key] = envelope.data[key] ?? null;
        }
        resolve(result);
      } catch (err) {
        console.error('[trading-economics-vn] JSON parse error:', err);
        resolve(Object.fromEntries(Object.keys(VN_TE_SLUGS).map((k) => [k, null])));
      }
    });

    py.on('error', (err) => {
      console.error('[trading-economics-vn] spawn error:', err.message);
      resolve(Object.fromEntries(Object.keys(VN_TE_SLUGS).map((k) => [k, null])));
    });
  });
}

export class TradingEconomicsVnAdapter implements TradingEconomicsVnPort {
  async fetchIndicator(slug: string): Promise<TradingEconomicsIndicator | null> {
    const batch = await this.fetchVnMacroBatch();
    // Find the matching key by slug value
    const entry = Object.entries(VN_TE_SLUGS).find(([, s]) => s === slug);
    return entry ? (batch[entry[0]] ?? null) : null;
  }

  async fetchVnMacroBatch(): Promise<Record<string, TradingEconomicsIndicator | null>> {
    try {
      return await runPythonHelper();
    } catch (err) {
      console.error('[trading-economics-vn] unexpected error:', err);
      return Object.fromEntries(Object.keys(VN_TE_SLUGS).map((k) => [k, null]));
    }
  }
}
