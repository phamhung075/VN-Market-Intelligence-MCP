/**
 * Price Debug Trigger Handler
 *
 * Extracted handler logic for POST /api/trigger-price-debug.
 * Separated from server.ts for testability.
 *
 * Behavior:
 *   - dry_run=true  → returns what WOULD be triggered, no side effects
 *   - dry_run=false → server.ts fires SSH command to VPS
 *   - tickers filter → passed as --ticker args to VPS script
 *   - verbose=true  → includes diagnostic details in log_tail
 *
 * VPS service: vn-price-fetch.service (runs every 60s)
 * VPS script:  /root/run-price-debug.sh
 * Fetches:     VN stocks (bgapidatafeed.vps.com.vn) + VN indices + global indices
 */

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
 */
export async function handleTriggerPriceDebug(
  opts: TriggerPriceDebugOptions,
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

  if (dry_run) {
    logLines.push(`[${ts}] DRY RUN — no fetch triggered. To trigger: POST /api/trigger-price-debug {dry_run:false}`);
    logLines.push(`[${ts}] VPS script: ssh root@$VINAHOST_IP /root/run-price-debug.sh --verbose`);
    if (tickerFilter) {
      const tickerArgs = tickerFilter.map((t) => `--ticker ${t}`).join(" ");
      logLines.push(`[${ts}] Ticker filter: /root/run-price-debug.sh ${tickerArgs} --verbose`);
    }
  } else {
    logLines.push(`[${ts}] LIVE mode — SSH trigger will be executed by server.ts`);
  }

  return {
    service: "vn-price-fetch",
    attempted: [],
    success: [],
    failed: [],
    log_tail: logLines.join("\n"),
    dry_run,
  };
}
