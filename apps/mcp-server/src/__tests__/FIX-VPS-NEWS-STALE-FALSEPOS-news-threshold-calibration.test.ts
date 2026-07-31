// src/__tests__/FIX-VPS-NEWS-STALE-FALSEPOS-news-threshold-calibration.test.ts
// Task FIX-VPS-NEWS-STALE-FALSEPOS — get_vps_proxy_health news:STALE false-positive
//
// Root cause: EXPECTED_INTERVALS.news (vpsProxyStaleness.ts) was set to 10 min
// ("every 5min, allow 10min slack") since the file's origin (VPT-1). That 5-min
// cadence assumption never matched the real VPS cron: `vn-news-fetch.service`
// runs `fetch-vn-news.sh` every 15 min (docs/standards/cron-jobs.md). Live
// push-log evidence (2026-07-31, 7-day sample, 886 gaps measured while
// isVnNewsPublishHours() was true): p50=7.47min, p90=16.07min, p99=16.22min,
// with a hard cliff — only 1/886 (0.11%) gaps exceeded 17min, and that one was
// a genuine 288min outage (not routine cadence). A 10-min tight threshold
// therefore flagged ~42% of routine, healthy inter-push gaps as STALE.
//
// This test reproduces the exact false-positive shape from the original
// report (push at 03:52 UTC, health-checked at 04:07 UTC = 15min gap, within
// isVnNewsPublishHours) and asserts genuine staleness (feed actually dead)
// still correctly flags STALE after the recalibration.

import { describe, it, expect } from "bun:test";
import { isStale, EXPECTED_INTERVALS } from "../interface/mcp/tools/system/vpsProxyStaleness.js";
import type { VpsServiceHealth } from "../infrastructure/db/vpsPushLogStore.js";

function newsHealth(lastPushAt: string): VpsServiceHealth {
  return {
    service: "news",
    lastPushAt,
    lastItemsCount: 10,
    lastStatus: "ok",
    pushes24h: 1,
    errors24h: 0,
    totalItems24h: 10,
  };
}

describe("FIX-VPS-NEWS-STALE-FALSEPOS — news staleness threshold calibration", () => {
  it("(a) 15min gap during publish hours (original bug report: push 03:52Z, checked 04:07Z) → NOT stale", () => {
    const now = new Date("2026-07-31T04:07:00Z"); // publish hours (UTC < 15:00)
    const health = newsHealth("2026-07-31T03:52:00");
    expect(isStale(health, now)).toBe(false);
  });

  it("(b) 16.2min gap (live-measured p99 of routine inter-push cadence) → NOT stale", () => {
    const now = new Date("2026-07-31T06:16:13Z");
    const health = newsHealth("2026-07-31T06:00:00");
    expect(isStale(health, now)).toBe(false);
  });

  it("(c) genuine dead feed — 60min gap during publish hours → still stale", () => {
    const now = new Date("2026-07-31T07:00:00Z");
    const health = newsHealth("2026-07-31T06:00:00");
    expect(isStale(health, now)).toBe(true);
  });

  it("(d) EXPECTED_INTERVALS.news is calibrated above the live-observed cadence ceiling (~16.2min) with margin, not the old 10min guess", () => {
    expect(EXPECTED_INTERVALS.news).toBeGreaterThanOrEqual(17);
    expect(EXPECTED_INTERVALS.news).toBeLessThan(30); // stays tighter than the SLA/analysis-layer's 30min (fetch layer should detect faster)
  });
});
