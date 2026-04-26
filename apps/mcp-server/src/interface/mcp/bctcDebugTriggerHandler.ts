/**
 * BCTC Debug Trigger Handler
 *
 * Extracted handler logic for POST /api/trigger-bctc-debug.
 * Separated from server.ts for testability.
 *
 * Behavior:
 *   - dry_run=true  → reads queue, returns what WOULD be fetched, no DB mutations
 *   - dry_run=false → (future: will SSH-trigger run-bctc-debug.sh on VPS)
 *                     For now, returns the pending queue state + instructions
 *   - tickers filter → limits queue to specified tickers only
 *   - verbose=true  → includes per-row diagnostic info in log_tail
 */

import type { Database } from "bun:sqlite";

export interface TriggerBctcDebugOptions {
  tickers: string[] | undefined;
  verbose: boolean;
  dry_run: boolean;
}

export interface TriggerBctcDebugResult {
  queued: string[];
  attempted: string[];
  success: string[];
  failed: { ticker: string; reason: string }[];
  log_tail: string;
  dry_run: boolean;
}

interface QueueRow {
  action_code: string;
  period_year: number;
  period_quarter: string;
  status: string;
  source_url: string | null;
  attempts: number;
}

/**
 * Core handler — runs against the provided DB instance.
 * Returns structured result matching the MCP tool output contract.
 */
export async function handleTriggerBctcDebug(
  opts: TriggerBctcDebugOptions,
  db: Database,
): Promise<TriggerBctcDebugResult> {
  const { tickers, verbose, dry_run } = opts;

  // ── Build query for pending queue rows ──────────────────────────────────
  const tickerFilter = tickers && tickers.length > 0 ? tickers : null;

  let query = `
    SELECT action_code, period_year, period_quarter, status, source_url, attempts
    FROM bctc_vps_queue
    WHERE status = 'pending' AND attempts < 5
  `;
  const params: string[] = [];

  if (tickerFilter) {
    const placeholders = tickerFilter.map(() => "?").join(", ");
    query += ` AND action_code IN (${placeholders})`;
    params.push(...tickerFilter);
  }

  query += ` ORDER BY created_at ASC LIMIT 50`;

  const rows = db.prepare(query).all(...params) as QueueRow[];
  const queued = rows.map((r) => r.action_code);

  // ── Build log_tail ───────────────────────────────────────────────────────
  const logLines: string[] = [];
  const ts = new Date().toISOString();

  logLines.push(`[${ts}] BCTC debug trigger (dry_run=${dry_run}, verbose=${verbose})`);
  logLines.push(`[${ts}] Pending queue: ${queued.length} items`);

  if (verbose) {
    for (const r of rows) {
      const urlStatus = r.source_url ? `url=${r.source_url.slice(0, 60)}` : "url=MISSING";
      logLines.push(
        `[${ts}]   ${r.action_code} ${r.period_year}-${r.period_quarter} status=${r.status} attempts=${r.attempts} ${urlStatus}`,
      );
    }
  }

  if (dry_run) {
    logLines.push(`[${ts}] DRY RUN — no fetch triggered. To trigger: POST /api/trigger-bctc-debug {dry_run:false}`);
    logLines.push(`[${ts}] VPS script: ssh root@$VINAHOST_IP /root/run-bctc-debug.sh --verbose`);
    if (tickerFilter) {
      const tickerArgs = tickerFilter.map((t) => `--ticker ${t}`).join(" ");
      logLines.push(`[${ts}] Ticker filter: /root/run-bctc-debug.sh ${tickerArgs} --verbose`);
    }
  } else {
    // Live mode: trigger is SSH-based (executed by MCP tool via /api/trigger-bctc-debug)
    // The actual SSH spawn happens in server.ts after calling this handler.
    logLines.push(`[${ts}] LIVE mode — SSH trigger will be executed by server.ts`);
  }

  return {
    queued,
    attempted: [],
    success: [],
    failed: [],
    log_tail: logLines.join("\n"),
    dry_run,
  };
}
