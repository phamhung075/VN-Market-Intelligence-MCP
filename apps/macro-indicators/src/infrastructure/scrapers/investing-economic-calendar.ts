/**
 * Infrastructure Adapter — investing-economic-calendar
 *
 * Source: investing.com/economic-calendar
 * Technique: cloudflare-managed-bypass (~25MB RAM — curl_cffi TLS impersonation)
 * Recon: docs/mainserver-sources/investing-economic-calendar/recon.md
 *
 * Cloudflare Bot Management passive mode (__cf_bm cookie). curl_cffi with
 * chrome124 TLS fingerprint impersonation passes the CF passive check without
 * triggering JS challenge. Two-step: GET warmup → POST calendar API.
 *
 * NOTE: curl_cffi is a Python library. This adapter shells out to Python for
 * the CF bypass step, then parses the returned JSON. The Python helper script
 * lives at apps/macro-indicators/src/infrastructure/scrapers/investing_calendar_fetch.py.
 *
 * Alternative if curl_cffi unavailable: native fetch with __cf_bm cookie from
 * a prior warmup session (cookie TTL ~30 min). Graceful fallback returns [].
 */

import type { InvestingCalendarPort, EconomicCalendarEvent } from '../../domain/repositories.js';
import { spawn } from 'child_process';
import path from 'path';

/** Vietnam country ID on investing.com (likely 35 — needs session verification). */
const DEFAULT_COUNTRY_ID = '35';

/** Absolute path to the Python fetch helper. */
const PYTHON_HELPER = path.join(
  process.cwd(),
  'src/infrastructure/scrapers/investing_calendar_fetch.py',
);

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Run the Python helper and return parsed JSON output. */
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
        console.error(`[investing-calendar] Python helper exited ${code}: ${stderr.slice(0, 300)}`);
        resolve([]);
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as { status: string; data: EconomicCalendarEvent[] };
        if (parsed.status === 'ok') resolve(parsed.data);
        else {
          console.error(`[investing-calendar] helper returned error: ${JSON.stringify(parsed)}`);
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
      await sleepMs(3_000 + Math.random() * 2_000); // 3-5s between calendar pulls
      return await runPythonHelper(countryId);
    } catch (err) {
      console.error('[investing-calendar] unexpected error:', err);
      return [];
    }
  }
}
