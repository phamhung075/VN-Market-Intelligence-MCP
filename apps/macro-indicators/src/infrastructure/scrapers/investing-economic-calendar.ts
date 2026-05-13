/**
 * Infrastructure Adapter — investing-economic-calendar
 *
 * Source: investing.com/economic-calendar
 * Technique: flaresolverr-bypass (~10MB helper process; FlareSolverr container ~96MB)
 * Recon: docs/mainserver-sources/investing-economic-calendar/recon.md
 * Technique doc: docs/mainserver-crawl-techniques/flaresolverr-bypass.md
 *
 * Cloudflare Turnstile v2 JS challenge — curl_cffi alone was blocked (2026-05-13).
 * FlareSolverr v3.4.6 is provisioned at http://flaresolverr:8191 (compose-network).
 * This adapter shells out to Python for the FlareSolverr solve + calendar fetch.
 *
 * Python helper: src/infrastructure/scrapers/investing_calendar_fetch.py
 *   Internally uses: src/infrastructure/scrapers/flaresolverr_helper.py
 *
 * Fast path: if cf_clearance is cached in the Python process, subsequent calls
 * try curl_cffi direct (no FlareSolverr round-trip). FlareSolverr is used on cache
 * miss or 403 response.
 *
 * Per-source timeout budget: 30000ms
 *   - Cold solve via FlareSolverr: ~5s (ops-confirmed smoke)
 *   - curl_cffi POST to calendar API: ~2s
 *   - Parse + marshal: <0.5s
 *   - Total hot path (cache hit): ~3s  |  cold path: ~8s  |  budget: 30s
 */

import type { InvestingCalendarPort, EconomicCalendarEvent } from '../../domain/repositories.js';
import { spawn } from 'child_process';
import path from 'path';

/** Vietnam country ID on investing.com economic calendar. */
const DEFAULT_COUNTRY_ID = '35';

/** Absolute path to the Python fetch helper. */
const PYTHON_HELPER = path.join(
  process.cwd(),
  'src/infrastructure/scrapers/investing_calendar_fetch.py',
);

/** Run the Python helper and return parsed calendar events. */
function runPythonHelper(countryId: string): Promise<EconomicCalendarEvent[]> {
  return new Promise((resolve) => {
    const py = spawn('python3', [PYTHON_HELPER, '--country', countryId], {
      timeout: 30_000,
    });

    let stdout = '';
    let stderr = '';
    py.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    py.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    py.on('close', (code) => {
      if (code !== 0) {
        console.error(
          `[investing-calendar] Python helper exited ${code}: ${stderr.slice(0, 300)}`
        );
        resolve([]);
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as { status: string; data: EconomicCalendarEvent[] };
        if (parsed.status === 'ok') {
          resolve(parsed.data);
        } else {
          console.error('[investing-calendar] helper returned error:', JSON.stringify(parsed));
          resolve([]);
        }
      } catch (err) {
        console.error('[investing-calendar] JSON parse error from helper:', err);
        resolve([]);
      }
    });

    py.on('error', (err) => {
      console.error('[investing-calendar] spawn error:', err.message);
      resolve([]);
    });
  });
}

export class InvestingCalendarAdapter implements InvestingCalendarPort {
  async fetchCalendar(countryId = DEFAULT_COUNTRY_ID): Promise<EconomicCalendarEvent[]> {
    try {
      return await runPythonHelper(countryId);
    } catch (err) {
      console.error('[investing-calendar] unexpected error:', err);
      return [];
    }
  }
}
