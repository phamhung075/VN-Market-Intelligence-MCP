/**
 * Price Debug Trigger Handler
 *
 * Extracted handler logic for POST /api/trigger-price-debug.
 * Separated from server.ts for testability.
 *
 * Behavior:
 *   - dry_run=true  → returns what WOULD be triggered, no side effects
 *   - dry_run=false → calls the REAL sshExec() (FIX-VPS-SSH-TRIGGER-FAIL-LOUD,
 *     2026-07-22) — previously this branch never executed anything (see
 *     vpsDebugSshTrigger.ts header for the full RCA); attempted/success/failed
 *     are now populated from the REAL ssh outcome, never left success-shaped
 *     when nothing ran.
 *   - tickers filter → passed as --ticker args to VPS script (sanitized —
 *     invalid entries are rejected into `failed` and never reach the remote
 *     command string)
 *   - verbose=true  → includes diagnostic details in log_tail
 *
 * VPS service: vn-price-fetch.service (runs every 60s)
 * VPS script:  /root/run-price-debug.sh
 * Fetches:     VN stocks (bgapidatafeed.vps.com.vn) + VN indices + global indices
 */

import { sanitizeTickers, triggerVpsDebugScript, type SshExecFn } from "./vpsDebugSshTrigger.js";

export interface TriggerPriceDebugOptions {
  tickers: string[] | undefined;
  verbose: boolean;
  dry_run: boolean;
}

export interface TriggerPriceDebugResult {
  service: string;
  attempted: string[];
  success: string[];
  failed: { ticker: string; reason: string }[];
  log_tail: string;
  dry_run: boolean;
}

/**
 * Core handler — returns structured result matching the MCP tool output contract.
 * `sshExecFn` is injectable (tests pass a fake — production default is the real
 * infrastructure sshExec via triggerVpsDebugScript's own default).
 */
export async function handleTriggerPriceDebug(
  opts: TriggerPriceDebugOptions,
  sshExecFn?: SshExecFn,
): Promise<TriggerPriceDebugResult> {
  const { tickers, verbose, dry_run } = opts;
  const tickerFilter = tickers && tickers.length > 0 ? tickers : null;

  const logLines: string[] = [];
  const ts = new Date().toISOString();

  logLines.push(`[${ts}] Price debug trigger (dry_run=${dry_run}, verbose=${verbose})`);
  logLines.push(`[${ts}] Service: vn-price-fetch.service (every 60s)`);
  logLines.push(`[${ts}] Source: bgapidatafeed.vps.com.vn batch API + CafeF indices + Yahoo Finance global indices`);

  if (tickerFilter) {
    logLines.push(`[${ts}] Ticker filter: ${tickerFilter.join(", ")}`);
  } else {
    logLines.push(`[${ts}] Ticker filter: none (all watchlist tickers)`);
  }

  if (verbose) {
    logLines.push(`[${ts}]   Step 1: GET /api/watchlist → retrieve codes`);
    logLines.push(`[${ts}]   Step 2: GET bgapidatafeed.vps.com.vn/getliststockdata/<codes>`);
    logLines.push(`[${ts}]   Step 2b: Extract fBuyVol/fSellVol/fRoom → push /api/push-foreign-flow`);
    logLines.push(`[${ts}]   Step 3: GET cafef.vn/banggia (VNINDEX, HNXINDEX, VN30, UPINDEX)`);
    logLines.push(`[${ts}]   Step 4: GET Yahoo Finance v8 chart for global indices`);
    logLines.push(`[${ts}]   Step 5: Merge all + POST /api/push-prices`);
  }

  let attempted: string[] = [];
  let success: string[] = [];
  let failed: { ticker: string; reason: string }[] = [];

  if (dry_run) {
    logLines.push(`[${ts}] DRY RUN — no fetch triggered. To trigger: POST /api/trigger-price-debug {dry_run:false}`);
    logLines.push(`[${ts}] VPS script: ssh root@$VPS_HOST /root/run-price-debug.sh --verbose`);
    if (tickerFilter) {
      const tickerArgs = tickerFilter.map((t) => `--ticker ${t}`).join(" ");
      logLines.push(`[${ts}] Ticker filter: /root/run-price-debug.sh ${tickerArgs} --verbose`);
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
      const outcome = await triggerVpsDebugScript("run-price-debug.sh", valid, verbose, sshExecFn);
      logLines.push(`[${ts}] LIVE mode — SSH command: ${outcome.command}`);
      if (outcome.ok) {
        logLines.push(`[${ts}] SSH exited 0 — VPS script launched. Check VPS logs at /tmp/price-debug-*.log`);
        success = [...attempted];
      } else {
        logLines.push(`[${ts}] SSH FAILED: ${outcome.reason}`);
        failed.push(...attempted.map((t) => ({ ticker: t, reason: outcome.reason! })));
      }
    }
  }

  return {
    service: "vn-price-fetch",
    attempted,
    success,
    failed,
    log_tail: logLines.join("\n"),
    dry_run,
  };
}
