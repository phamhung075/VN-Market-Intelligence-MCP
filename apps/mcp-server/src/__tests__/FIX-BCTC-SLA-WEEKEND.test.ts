/**
 * FIX-BCTC-SLA-WEEKEND — Unit tests for the BCTC trading-day SLA exemption.
 *
 * SUPERSEDED (2026-07-30) by FIX-SLA-BCTC-THRESHOLD-TRACKS-STALENESS-NOT-CONSTANT:
 * this file originally asserted the "weekend-aware" behavior where the bctc
 * off-hours threshold on a non-trading day was computed as
 * `minutesSinceLastWindowEnd(now) + grace` — an AGE measured from a second
 * fixed anchor, not a duration. That formula grows 1:1 with wall-clock `now`
 * at the exact same rate as `ageMinutes` itself, so any breach recorded while
 * in that regime could never self-clear — mechanically proven via 12
 * consecutive production sla-monitor alerts whose (stale - threshold)
 * difference was the exact same 5439-minute constant across a 21h window.
 *
 * The bctc threshold is now a FIXED two-tier constant gated only by
 * isBctcEarningsWindowActive(now) (see freshnessSlaChecker.ts
 * getSlaThreshold): 1440 min (24h) while an earnings-filing window is
 * active, 10080 min (168h/7d) otherwise. Day-of-week / market-hours no
 * longer affect the bctc threshold at all — the tests below now assert
 * exactly that (weekday market-hours, weekday off-hours, and weekend all
 * produce the SAME threshold once they share the same earnings-window
 * state), which is the mirror image of what this file asserted before.
 *
 * DoD cases (MUST ALL PASS):
 *   B-1: Out-of-window (June) — threshold is IDENTICAL across weekday
 *        market-hours / weekday off-hours / weekend (10080 min, fixed)
 *   B-2: Out-of-window (June) — bctc age below 10080 NOT breached (any of
 *        the three timestamps)
 *   B-3: Out-of-window (June) — bctc age above 10080 IS breached (any of
 *        the three timestamps) — true positive preserved
 *   B-4: In-window (April, day ≤ 14) — threshold is 1440 min regardless of
 *        market-hours/weekday
 *   B-5: In-window — bctc age above 1440 IS breached; below is NOT
 *   B-10: BCTC_TRADING_DAY_ONLY_SOURCES exports correctly (unchanged)
 *
 * @module __tests__/FIX-BCTC-SLA-WEEKEND
 */

import { describe, it, expect } from "bun:test";
import {
  getSlaThreshold,
  checkDataFreshnessSla,
  isVnMarketHours,
  BCTC_TRADING_DAY_ONLY_SOURCES,
  type SignalType,
} from "../domain/services/freshnessSlaChecker.js";

// ─── Time fixtures ────────────────────────────────────────────────────────────

/** Saturday 2026-06-06 12:00 UTC — weekend, out-of-earnings-window (June). */
const SAT_12Z = new Date("2026-06-06T12:00:00.000Z");

/** Wednesday 2026-06-04 04:30 UTC — mid-session weekday (market hours), out-of-window. */
const WED_04Z = new Date("2026-06-04T04:30:00.000Z");

/** Wednesday 2026-06-04 10:00 UTC — post-session weekday (off-hours), out-of-window. */
const WED_10Z = new Date("2026-06-04T10:00:00.000Z");

/** Wednesday 2026-04-08 04:30 UTC — mid-session weekday (market hours), IN earnings window. */
const APR_08_MARKET = new Date("2026-04-08T04:30:00.000Z");

/** Wednesday 2026-04-08 10:00 UTC — post-session weekday (off-hours), IN earnings window. */
const APR_08_OFFHOURS = new Date("2026-04-08T10:00:00.000Z");

/** Saturday 2026-04-11 12:00 UTC — weekend, IN earnings window (April, day 11 ≤ 14). */
const SAT_APR_11 = new Date("2026-04-11T12:00:00.000Z");

// ─── BASE_AGES helper ─────────────────────────────────────────────────────────

const BASE_AGES: Record<SignalType, number> = {
  price: 0,
  bctc: 0,
  news: 0,
  sbv_fx: 0,
  foreign_flow: 0,
  vnstock_fundamentals: -1,
  bond_maturity: -1,
  commodity_prices: -1,
  broker_sanctions: -1,
  backtest_runs: -1,
  signal_quality_audit: -1,
  prediction_claims: -1,
};

// ─── B-10: BCTC_TRADING_DAY_ONLY_SOURCES export ───────────────────────────────

describe("FIX-BCTC-SLA-WEEKEND — BCTC_TRADING_DAY_ONLY_SOURCES export", () => {

  it("B-10a: BCTC_TRADING_DAY_ONLY_SOURCES contains bctc", () => {
    expect(BCTC_TRADING_DAY_ONLY_SOURCES.has("bctc")).toBe(true);
  });

  it("B-10b: BCTC_TRADING_DAY_ONLY_SOURCES does NOT contain price, news, sbv_fx", () => {
    expect(BCTC_TRADING_DAY_ONLY_SOURCES.has("price")).toBe(false);
    expect(BCTC_TRADING_DAY_ONLY_SOURCES.has("news")).toBe(false);
    expect(BCTC_TRADING_DAY_ONLY_SOURCES.has("sbv_fx")).toBe(false);
  });
});

// ─── B-1: getSlaThreshold is day/hour-invariant within a window state ───────

describe("FIX-BCTC-SLA-WEEKEND — getSlaThreshold(bctc) is FIXED, not calendar-varying", () => {

  it("B-1: out-of-window (June) — threshold is IDENTICAL across market-hours / off-hours / weekend (10080 min)", () => {
    expect(isVnMarketHours(WED_04Z)).toBe(true); // sanity
    expect(isVnMarketHours(WED_10Z)).toBe(false); // sanity
    const marketHoursThreshold = getSlaThreshold("bctc", undefined, WED_04Z);
    const offHoursThreshold = getSlaThreshold("bctc", undefined, WED_10Z);
    const weekendThreshold = getSlaThreshold("bctc", undefined, SAT_12Z);

    expect(marketHoursThreshold).toBe(10080);
    expect(offHoursThreshold).toBe(10080);
    expect(weekendThreshold).toBe(10080);
  });

  it("B-4: in-window (April, day ≤ 14) — threshold is IDENTICAL across market-hours / off-hours / weekend (1440 min)", () => {
    expect(isVnMarketHours(APR_08_MARKET)).toBe(true); // sanity
    expect(isVnMarketHours(APR_08_OFFHOURS)).toBe(false); // sanity
    const marketHoursThreshold = getSlaThreshold("bctc", undefined, APR_08_MARKET);
    const offHoursThreshold = getSlaThreshold("bctc", undefined, APR_08_OFFHOURS);
    const weekendThreshold = getSlaThreshold("bctc", undefined, SAT_APR_11);

    expect(marketHoursThreshold).toBe(1440);
    expect(offHoursThreshold).toBe(1440);
    expect(weekendThreshold).toBe(1440);
  });
});

// ─── B-2 / B-3: checkDataFreshnessSla out-of-window bidirectional proof ─────

describe("FIX-BCTC-SLA-WEEKEND — checkDataFreshnessSla out-of-window (10080 min fixed)", () => {

  it("B-2: age below threshold (10079 min) NOT breached", () => {
    const ages = { ...BASE_AGES, bctc: 10079 };
    const result = checkDataFreshnessSla(ages, undefined, [], SAT_12Z);
    expect(result.breaches.find((b) => b.signalType === "bctc")).toBeUndefined();
  });

  it("B-3: age above threshold (10081 min) IS breached (true positive preserved)", () => {
    const ages = { ...BASE_AGES, bctc: 10081 };
    const result = checkDataFreshnessSla(ages, undefined, [], SAT_12Z);
    const bctcBreach = result.breaches.find((b) => b.signalType === "bctc");
    expect(bctcBreach).toBeDefined();
    expect(bctcBreach!.thresholdMinutes).toBe(10080);
  });
});

// ─── B-5: checkDataFreshnessSla in-window bidirectional proof ──────────────

describe("FIX-BCTC-SLA-WEEKEND — checkDataFreshnessSla in-window (1440 min fixed)", () => {

  it("B-5a: age below threshold (1439 min) NOT breached", () => {
    const ages = { ...BASE_AGES, bctc: 1439 };
    const result = checkDataFreshnessSla(ages, undefined, [], APR_08_MARKET);
    expect(result.breaches.find((b) => b.signalType === "bctc")).toBeUndefined();
  });

  it("B-5b: age above threshold (1441 min) IS breached (true positive preserved)", () => {
    const ages = { ...BASE_AGES, bctc: 1441 };
    const result = checkDataFreshnessSla(ages, undefined, [], APR_08_MARKET);
    const bctcBreach = result.breaches.find((b) => b.signalType === "bctc");
    expect(bctcBreach).toBeDefined();
    expect(bctcBreach!.thresholdMinutes).toBe(1440);
  });
});
