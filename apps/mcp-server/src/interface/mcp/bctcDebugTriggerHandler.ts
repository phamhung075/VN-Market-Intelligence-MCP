/**
 * BCTC Debug Trigger Handler
 *
 * Extracted handler logic for POST /api/trigger-bctc-debug.
 * Separated from server.ts for testability.
 *
 * Behavior:
 *   - dry_run=true  → reads queue, returns what WOULD be fetched, no DB mutations
 *   - dry_run=false → calls the REAL sshExec() (FIX-VPS-SSH-TRIGGER-FAIL-LOUD,
 *     2026-07-22) — the "(future: ...)" comment this docstring used to carry
 *     confirmed this was an unfinished feature, not a deliberate boundary; see
 *     vpsDebugSshTrigger.ts header for the full RCA.
 *   - tickers filter → limits queue to specified tickers only (sanitized before
 *     reaching the remote command)
 *   - verbose=true  → includes per-row diagnostic info in log_tail
 */

import type { Database } from "bun:sqlite";
import { sqlInClause } from "../../domain/utils/sqlHelpers.js";
import { sanitizeTickers, triggerVpsDebugScript, type SshExecFn } from "./vpsDebugSshTrigger.js";

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
 * `sshExecFn` is injectable (tests pass a fake).
 */
export async function handleTriggerBctcDebug(
  opts: TriggerBctcDebugOptions,
  db: Database,
  sshExecFn?: SshExecFn,
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
    const placeholders = sqlInClause(tickerFilter.length);
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

  let attempted: string[] = [];
  let success: string[] = [];
  let failed: { ticker: string; reason: string }[] = [];

  if (dry_run) {
    logLines.push(`[${ts}] DRY RUN — no fetch triggered. To trigger: POST /api/trigger-bctc-debug {dry_run:false}`);
    logLines.push(`[${ts}] VPS script: ssh root@$VPS_HOST /root/run-bctc-debug.sh --verbose`);
    if (tickerFilter) {
      const tickerArgs = tickerFilter.map((t) => `--ticker ${t}`).join(" ");
      logLines.push(`[${ts}] Ticker filter: /root/run-bctc-debug.sh ${tickerArgs} --verbose`);
    }
  } else {
    const { valid, invalid } = sanitizeTickers(tickerFilter ?? undefined);
    for (const bad of invalid) {
      failed.push({ ticker: bad, reason: "invalid ticker format — rejected before SSH (allowlist: 1-10 alnum chars)" });
    }
    attempted = tickerFilter ? [...valid] : ["all"];

    if (tickerFilter && valid.length === 0) {
      logLines.push(`[${ts}] LIVE mode — all supplied tickers failed sanitization, SSH not attempted`);
    } else {
      const outcome = await triggerVpsDebugScript("run-bctc-debug.sh", valid, verbose, sshExecFn);
      logLines.push(`[${ts}] LIVE mode — SSH command: ${outcome.command}`);
      if (outcome.ok) {
        logLines.push(`[${ts}] SSH exited 0 — VPS script launched. Check VPS logs at /tmp/bctc-debug-*.log`);
        success = [...attempted];
      } else {
        logLines.push(`[${ts}] SSH FAILED: ${outcome.reason}`);
        failed.push(...attempted.map((t) => ({ ticker: t, reason: outcome.reason! })));
      }
    }
  }

  return {
    queued,
    attempted,
    success,
    failed,
    log_tail: logLines.join("\n"),
    dry_run,
  };
}
