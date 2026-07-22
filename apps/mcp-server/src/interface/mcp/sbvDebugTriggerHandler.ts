/**
 * SBV Debug Trigger Handler
 *
 * Extracted handler logic for POST /api/trigger-sbv-debug.
 * Separated from server.ts for testability.
 *
 * Behavior:
 *   - dry_run=true  → returns what WOULD be triggered, no side effects
 *   - dry_run=false → calls the REAL sshExec() (FIX-VPS-SSH-TRIGGER-FAIL-LOUD,
 *     2026-07-22) — see vpsDebugSshTrigger.ts header for the full RCA.
 *   - verbose=true  → includes VCB XML endpoint details in log_tail
 *   - No tickers param — SBV/FX rate fetch is global (USD/VND only)
 *
 * VPS service: vn-sbv-fetch.service (runs every 30min)
 * VPS script:  /root/run-sbv-debug.sh
 * Source:      Vietcombank XML API (portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx)
 */

import { triggerVpsDebugScript, type SshExecFn } from "./vpsDebugSshTrigger.js";

export interface TriggerSbvDebugOptions {
  verbose: boolean;
  dry_run: boolean;
}

export interface TriggerSbvDebugResult {
  service: string;
  attempted: string[];
  success: string[];
  failed: { source: string; reason: string }[];
  log_tail: string;
  dry_run: boolean;
}

const VCB_URL = "https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx?b=68";

/**
 * Core handler — returns structured result matching the MCP tool output contract.
 * `sshExecFn` is injectable (tests pass a fake).
 */
export async function handleTriggerSbvDebug(
  opts: TriggerSbvDebugOptions,
  sshExecFn?: SshExecFn,
): Promise<TriggerSbvDebugResult> {
  const { verbose, dry_run } = opts;

  const logLines: string[] = [];
  const ts = new Date().toISOString();

  logLines.push(`[${ts}] SBV/FX debug trigger (dry_run=${dry_run}, verbose=${verbose})`);
  logLines.push(`[${ts}] Service: vn-sbv-fetch.service (every 30min)`);
  logLines.push(`[${ts}] Source: Vietcombank XML API (USD/VND Transfer rate)`);

  if (verbose) {
    logLines.push(`[${ts}]   Step 1: GET ${VCB_URL}`);
    logLines.push(`[${ts}]   Step 2: Parse XML — extract CurrencyCode="USD" Transfer rate`);
    logLines.push(`[${ts}]   Step 3: POST /api/push-sbv-rates with {usdVndOfficial, fetchedAt}`);
    logLines.push(`[${ts}]   Expected XML field: <Exrate CurrencyCode="USD" ... Transfer="26,135.00" .../>`);
  }

  let attempted: string[] = [];
  let success: string[] = [];
  let failed: { source: string; reason: string }[] = [];

  if (dry_run) {
    logLines.push(`[${ts}] DRY RUN — no fetch triggered. To trigger: POST /api/trigger-sbv-debug {dry_run:false}`);
    logLines.push(`[${ts}] VPS script: ssh root@$VPS_HOST /root/run-sbv-debug.sh --verbose`);
  } else {
    attempted = ["vn-sbv-fetch"];
    const outcome = await triggerVpsDebugScript("run-sbv-debug.sh", [], verbose, sshExecFn);
    logLines.push(`[${ts}] LIVE mode — SSH command: ${outcome.command}`);
    if (outcome.ok) {
      logLines.push(`[${ts}] SSH exited 0 — VPS script launched. Check VPS logs at /tmp/sbv-debug-*.log`);
      success = [...attempted];
    } else {
      logLines.push(`[${ts}] SSH FAILED: ${outcome.reason}`);
      failed = attempted.map((s) => ({ source: s, reason: outcome.reason! }));
    }
  }

  return {
    service: "vn-sbv-fetch",
    attempted,
    success,
    failed,
    log_tail: logLines.join("\n"),
    dry_run,
  };
}
