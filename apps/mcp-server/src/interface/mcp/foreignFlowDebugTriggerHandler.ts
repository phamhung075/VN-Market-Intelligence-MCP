/**
 * Foreign Flow Debug Trigger Handler
 *
 * Extracted handler logic for POST /api/trigger-foreign-flow-debug.
 * Separated from server.ts for testability.
 *
 * Behavior:
 *   - dry_run=true  → returns what WOULD be triggered, no side effects
 *   - dry_run=false → calls the REAL sshExec() (FIX-VPS-SSH-TRIGGER-FAIL-LOUD,
 *     2026-07-22) — see vpsDebugSshTrigger.ts header for the full RCA.
 *   - tickers filter → passed as --ticker args to VPS script (sanitized)
 *   - verbose=true  → includes per-step diagnostic details in log_tail
 *
 * VPS service: vn-foreign-flow.service (runs every 60s)
 * VPS script:  /root/run-foreign-flow-debug.sh
 * Source:      bgapidatafeed.vps.com.vn (extracts fBuyVol/fSellVol/fRoom)
 */

import { sanitizeTickers, triggerVpsDebugScript, type SshExecFn } from "./vpsDebugSshTrigger.js";

export interface TriggerForeignFlowDebugOptions {
  tickers: string[] | undefined;
  verbose: boolean;
  dry_run: boolean;
}

export interface TriggerForeignFlowDebugResult {
  service: string;
  attempted: string[];
  success: string[];
  failed: { ticker: string; reason: string }[];
  log_tail: string;
  dry_run: boolean;
}

/**
 * Core handler — returns structured result matching the MCP tool output contract.
 * `sshExecFn` is injectable (tests pass a fake).
 */
export async function handleTriggerForeignFlowDebug(
  opts: TriggerForeignFlowDebugOptions,
  sshExecFn?: SshExecFn,
): Promise<TriggerForeignFlowDebugResult> {
  const { tickers, verbose, dry_run } = opts;
  const tickerFilter = tickers && tickers.length > 0 ? tickers : null;

  const logLines: string[] = [];
  const ts = new Date().toISOString();

  logLines.push(`[${ts}] Foreign flow debug trigger (dry_run=${dry_run}, verbose=${verbose})`);
  logLines.push(`[${ts}] Service: vn-foreign-flow.service (every 60s)`);
  logLines.push(`[${ts}] Source: bgapidatafeed.vps.com.vn batch API (fBuyVol / fSellVol / fRoom)`);

  if (tickerFilter) {
    logLines.push(`[${ts}] Ticker filter: ${tickerFilter.join(", ")}`);
  } else {
    logLines.push(`[${ts}] Ticker filter: none (all watchlist tickers)`);
  }

  if (verbose) {
    logLines.push(`[${ts}]   Step 1: GET /api/watchlist → retrieve codes`);
    logLines.push(`[${ts}]   Step 2: GET bgapidatafeed.vps.com.vn/getliststockdata/<codes> (60s timeout)`);
    logLines.push(`[${ts}]   Step 3: Extract foreign flow fields via jq (fBuyVol/fSellVol/fRoom)`);
    logLines.push(`[${ts}]     Field names: FOREIGN_FLOW_FBUY_FIELD / FOREIGN_FLOW_FSELL_FIELD / FOREIGN_FLOW_ROOM_FIELD`);
    logLines.push(`[${ts}]     Filter: only rows with at least one non-zero flow value`);
    logLines.push(`[${ts}]   Step 4: POST /api/push-foreign-flow with filtered JSON array`);
    logLines.push(`[${ts}]   Diagnostic: PAYLOAD_SIZE_THRESHOLD=${50000} bytes — warn if larger`);
  }

  let attempted: string[] = [];
  let success: string[] = [];
  let failed: { ticker: string; reason: string }[] = [];

  if (dry_run) {
    logLines.push(`[${ts}] DRY RUN — no fetch triggered. To trigger: POST /api/trigger-foreign-flow-debug {dry_run:false}`);
    logLines.push(`[${ts}] VPS script: ssh root@$VPS_HOST /root/run-foreign-flow-debug.sh --verbose`);
    if (tickerFilter) {
      const tickerArgs = tickerFilter.map((t) => `--ticker ${t}`).join(" ");
      logLines.push(`[${ts}] Ticker filter: /root/run-foreign-flow-debug.sh ${tickerArgs} --verbose`);
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
      const outcome = await triggerVpsDebugScript("run-foreign-flow-debug.sh", valid, verbose, sshExecFn);
      logLines.push(`[${ts}] LIVE mode — SSH command: ${outcome.command}`);
      if (outcome.ok) {
        logLines.push(`[${ts}] SSH exited 0 — VPS script launched. Check VPS logs at /tmp/foreign-flow-debug-*.log`);
        success = [...attempted];
      } else {
        logLines.push(`[${ts}] SSH FAILED: ${outcome.reason}`);
        failed.push(...attempted.map((t) => ({ ticker: t, reason: outcome.reason! })));
      }
    }
  }

  return {
    service: "vn-foreign-flow",
    attempted,
    success,
    failed,
    log_tail: logLines.join("\n"),
    dry_run,
  };
}
