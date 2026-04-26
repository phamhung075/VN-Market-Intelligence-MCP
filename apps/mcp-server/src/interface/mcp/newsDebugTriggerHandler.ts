/**
 * News Debug Trigger Handler
 *
 * Extracted handler logic for POST /api/trigger-news-debug.
 * Separated from server.ts for testability.
 *
 * Behavior:
 *   - dry_run=true  → returns what WOULD be triggered, no side effects
 *   - dry_run=false → server.ts fires SSH command to VPS
 *   - verbose=true  → includes per-source diagnostic details in log_tail
 *
 * VPS service: vn-news-fetch.service (runs every 15min)
 * VPS script:  /root/run-news-debug.sh
 * Sources:     CafeF, VnExpress, VnEconomy, VietStock, TuoiTre, NhanDan,
 *              NguoiLaoDong, VietnamBiz, VnBusiness, BaoDauTu (10 sources)
 */

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
 */
export async function handleTriggerNewsDebug(
  opts: TriggerNewsDebugOptions,
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

  if (dry_run) {
    logLines.push(`[${ts}] DRY RUN — no fetch triggered. To trigger: POST /api/trigger-news-debug {dry_run:false}`);
    logLines.push(`[${ts}] VPS script: ssh root@$VINAHOST_IP /root/run-news-debug.sh --verbose`);
  } else {
    logLines.push(`[${ts}] LIVE mode — SSH trigger will be executed by server.ts`);
  }

  return {
    service: "vn-news-fetch",
    attempted: [],
    success: [],
    failed: [],
    log_tail: logLines.join("\n"),
    dry_run,
  };
}
