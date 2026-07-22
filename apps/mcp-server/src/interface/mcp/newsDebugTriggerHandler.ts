/**
 * News Debug Trigger Handler
 *
 * Extracted handler logic for POST /api/trigger-news-debug.
 * Separated from server.ts for testability.
 *
 * Behavior:
 *   - dry_run=true  → returns what WOULD be triggered, no side effects
 *   - dry_run=false → calls the REAL sshExec() (FIX-VPS-SSH-TRIGGER-FAIL-LOUD,
 *     2026-07-22) — see vpsDebugSshTrigger.ts header for the full RCA.
 *   - verbose=true  → includes per-source diagnostic details in log_tail
 *
 * VPS service: vn-news-fetch.service (runs every 15min)
 * VPS script:  /root/run-news-debug.sh
 * Sources:     CafeF, VnExpress, VnEconomy, VietStock, TuoiTre, NhanDan,
 *              NguoiLaoDong, VietnamBiz, VnBusiness, BaoDauTu (10 sources)
 */

import { triggerVpsDebugScript, type SshExecFn } from "./vpsDebugSshTrigger.js";

export interface TriggerNewsDebugOptions {
  verbose: boolean;
  dry_run: boolean;
}

export interface TriggerNewsDebugResult {
  service: string;
  attempted: string[];
  success: string[];
  failed: { source: string; reason: string }[];
  log_tail: string;
  dry_run: boolean;
}

const NEWS_SOURCES = [
  { name: "cafef-market",      url: "https://cafef.vn/thi-truong-chung-khoan.rss" },
  { name: "cafef-biz",         url: "https://cafef.vn/doanh-nghiep.rss" },
  { name: "vnexpress",         url: "https://vnexpress.net/rss/kinh-doanh.rss" },
  { name: "vneconomy-stocks",  url: "https://vneconomy.vn/chung-khoan.rss" },
  { name: "vneconomy-finance", url: "https://vneconomy.vn/tai-chinh.rss" },
  { name: "vietstock-stocks",  url: "https://vietstock.vn/830/chung-khoan/co-phieu.rss" },
  { name: "vietstock-insider", url: "https://vietstock.vn/739/chung-khoan/giao-dich-noi-bo.rss" },
  { name: "vietstock-macro",   url: "https://vietstock.vn/761/kinh-te/vi-mo.rss" },
  { name: "vietnambiz",        url: "https://vietnambiz.vn/chung-khoan.rss" },
  { name: "vnbusiness",        url: "https://vnbusiness.vn/rss/chung-khoan.rss" },
  { name: "tuoitre",           url: "https://tuoitre.vn/rss/kinh-doanh.rss" },
  { name: "nhandan-economy",   url: "https://nhandan.vn/rss/kinhte-1185.rss" },
  { name: "nhandan-stocks",    url: "https://nhandan.vn/rss/chungkhoan-1191.rss" },
  { name: "nld",               url: "https://nld.com.vn/rss/kinh-te/tai-chinh-chung-khoan.rss" },
];

/**
 * Core handler — returns structured result matching the MCP tool output contract.
 * `sshExecFn` is injectable (tests pass a fake).
 */
export async function handleTriggerNewsDebug(
  opts: TriggerNewsDebugOptions,
  sshExecFn?: SshExecFn,
): Promise<TriggerNewsDebugResult> {
  const { verbose, dry_run } = opts;

  const logLines: string[] = [];
  const ts = new Date().toISOString();

  logLines.push(`[${ts}] News debug trigger (dry_run=${dry_run}, verbose=${verbose})`);
  logLines.push(`[${ts}] Service: vn-news-fetch.service (every 15min)`);
  logLines.push(`[${ts}] Sources: ${NEWS_SOURCES.length} RSS feeds + 1 browser-rendered source`);

  if (verbose) {
    logLines.push(`[${ts}]   Step 1: Fetch all RSS sources (rotating User-Agents, 2-6s human delays)`);
    for (const src of NEWS_SOURCES) {
      logLines.push(`[${ts}]     ${src.name}: GET ${src.url}`);
    }
    logLines.push(`[${ts}]   Step 2: Merge + deduplicate by URL`);
    logLines.push(`[${ts}]   Step 3: POST /api/push-news (all unique items)`);
    logLines.push(`[${ts}]   Note: Bot-guarded sources use Playwright/Chromium (fetch-browser.py)`);
  }

  let attempted: string[] = [];
  let success: string[] = [];
  let failed: { source: string; reason: string }[] = [];

  if (dry_run) {
    logLines.push(`[${ts}] DRY RUN — no fetch triggered. To trigger: POST /api/trigger-news-debug {dry_run:false}`);
    logLines.push(`[${ts}] VPS script: ssh root@$VPS_HOST /root/run-news-debug.sh --verbose`);
  } else {
    attempted = ["vn-news-fetch"];
    const outcome = await triggerVpsDebugScript("run-news-debug.sh", [], verbose, sshExecFn);
    logLines.push(`[${ts}] LIVE mode — SSH command: ${outcome.command}`);
    if (outcome.ok) {
      logLines.push(`[${ts}] SSH exited 0 — VPS script launched. Check VPS logs at /tmp/news-debug-*.log`);
      success = [...attempted];
    } else {
      logLines.push(`[${ts}] SSH FAILED: ${outcome.reason}`);
      failed = attempted.map((s) => ({ source: s, reason: outcome.reason! }));
    }
  }

  return {
    service: "vn-news-fetch",
    attempted,
    success,
    failed,
    log_tail: logLines.join("\n"),
    dry_run,
  };
}
