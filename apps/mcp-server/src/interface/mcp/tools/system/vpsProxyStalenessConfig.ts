/**
 * VPS Proxy Health — staleness threshold config (pure data)
 *
 * Extracted out of vpsProxyStaleness.ts (FIX-CI-SIZELINT-VPSPROXYSTALENESS-
 * REGRESSION-123L) to keep that file's isStale() logic under the 120L
 * size-lint cap after the FIX-VPS-NEWS-STALE-FALSEPOS news-interval
 * recalibration pushed it 111L -> 123L. Same split shape as
 * freshnessSlaChecker.ts -> freshnessSlaConfig.ts (commit 9930ee008, same
 * day): thresholds/service-set tables move here as pure data;
 * vpsProxyStaleness.ts imports + re-exports them unchanged so every
 * existing import path (vpsProxyHealthFormat.ts, the FIX-VPS-NEWS-STALE-
 * FALSEPOS calibration test) keeps working with zero call-site changes.
 *
 * @module interface/mcp/tools/system/vpsProxyStalenessConfig
 */

// Expected push intervals per service (minutes) — used during the active fetch window.
// Prices and foreign_flow are market-hours-only (Mon–Fri 02:00–08:59 UTC).
// Outside their window the stale check uses time-since-last-window-end logic.
export const EXPECTED_INTERVALS: Record<string, number> = {
  prices: 5,    // every 60s during market hours, allow 5min slack
  // FIX-VPS-NEWS-STALE-FALSEPOS (2026-07-31): was 10 ("every 5min, allow
  // 10min slack") since this file's origin (VPT-1) — that 5-min cadence was
  // never real. The VPS cron (`vn-news-fetch.service` / fetch-vn-news.sh,
  // docs/standards/cron-jobs.md) runs every 15min. Live push-log evidence
  // (7-day sample, 886 inter-push gaps measured during isVnNewsPublishHours):
  // p50=7.5min, p90=16.1min, p99=16.2min, hard cliff — only 1/886 (0.11%)
  // gaps exceeded 17min, and that one was a genuine outage, not cadence.
  // 20min = cadence(15) + slack, ~4min above the observed p99 ceiling —
  // resolves the routine false-STALE (was flagging ~42% of healthy checks)
  // while still well below the SLA/analysis-layer's 30min news threshold
  // (freshnessSlaChecker.ts DEFAULT_SLA_CONFIG) so real outages are still
  // caught fast by this fetch-layer check.
  news: 20,
  sbv: 60,      // every 30min, allow 60min slack
  bctc: 720,    // every 6h, allow 12h slack
};

// Services whose data is ONLY pushed during VN market hours.
// Outside Mon–Fri 02:00–08:59 UTC the VPS loops sleep by design.
export const MARKET_HOURS_ONLY_SERVICES = new Set(["prices", "foreign_flow"]);

// VPS service "news": publisher quiet hours overnight VN (UTC 15:00–00:00).
// Active window: 00:00–14:59 UTC (07:00–21:59 VN time). No market-hours gate.
export const NEWS_QUIET_HOURS_SERVICES = new Set(["news"]);

// VPS service "sbv": SBV FX rates published on business days only.
export const SBV_BUSINESS_DAY_SERVICES = new Set(["sbv"]);
