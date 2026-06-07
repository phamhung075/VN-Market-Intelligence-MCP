/**
 * FIX-BCTC-SLA-WEEKEND — Unit tests for the BCTC trading-day SLA exemption.
 *
 * Root cause: getSlaThreshold("bctc") only checked isVnMarketHours, which is
 * false on weekends → fell to offHoursThresholdMinutes=360.  On Saturday,
 * Friday-session BCTC data is 1400–1600 min old → false-alarm MEDIUM breach.
 *
 * Fix: on a non-trading day (Sat/Sun) the bctc threshold = minutesSinceLastWindowEnd
 * + OFF_HOURS_GRACE (30), mirroring the existing SBV FX calendar exemption.
 *
 * DoD cases (MUST ALL PASS):
 *   B-1: Weekend (Saturday 12:00Z) — bctc age=1440 min NOT breached (off-hours
 *        threshold = 1621+30=1651 > 1440, data expected stale from Friday session)
 *   B-2: Weekend (Saturday) — bctc age genuinely stale (1700 min > 1651) IS breached
 *        (true positive preserved — don't over-exempt)
 *   B-3: Weekday market hours (Wed 04:30Z) — bctc age=240 min IS breached
 *        (240 > 120 min threshold; true positive)
 *   B-4: Weekday market hours (Wed 04:30Z) — bctc age=60 min NOT breached
 *        (within 120 min threshold)
 *   B-5: Weekday off-hours (Wed 10:00Z, post-session) — bctc age=400 min IS breached
 *        (400 > 360 min off-hours threshold; true positive)
 *   B-6: Weekday off-hours (Wed 10:00Z) — bctc age=200 min NOT breached
 *        (within 360 min off-hours threshold)
 *   B-7: getSlaThreshold(bctc) on Saturday = minutesSinceLastWindowEnd+30 (dynamic)
 *   B-8: getSlaThreshold(bctc) on trading day market hours = 120 min
 *   B-9: getSlaThreshold(bctc) on trading day off-hours = 360 min
 *   B-10: BCTC_TRADING_DAY_ONLY_SOURCES exports correctly
 *
 * Regression guard (DO NOT BREAK):
 *   B-3, B-5: True positives for genuine weekday staleness must still fire.
 *
 * @module __tests__/FIX-BCTC-SLA-WEEKEND
 */

import { describe, it, expect } from "bun:test";
import {
  getSlaThreshold,
  checkDataFreshnessSla,
  isVnMarketHours,
  minutesSinceLastWindowEnd,
  BCTC_TRADING_DAY_ONLY_SOURCES,
  type SignalType,
} from "../domain/services/freshnessSlaChecker.js";

// ─── Time fixtures ────────────────────────────────────────────────────────────

/** Saturday 2026-06-06 12:00 UTC — the Saturday of the false-alarm weekend.
 *  (The breach signal itself was filed on Sunday 2026-06-07, but Saturday is
 *   the first post-Friday non-trading day — same root cause applies to both.)
 *  minutesSinceLastWindowEnd: Sat 12:00Z − Fri 08:59Z = 27h 1m = 1621 min.
 *  Off-hours threshold for bctc = 1621 + 30 = 1651 min.
 */
const SAT_12Z = new Date("2026-06-06T12:00:00.000Z");

/** Wednesday 2026-06-04 04:30 UTC — mid-session weekday (market hours). */
const WED_04Z = new Date("2026-06-04T04:30:00.000Z");

/** Wednesday 2026-06-04 10:00 UTC — post-session weekday (off-hours, not market hours). */
const WED_10Z = new Date("2026-06-04T10:00:00.000Z");

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

// ─── B-7 / B-8 / B-9: getSlaThreshold for bctc ───────────────────────────────

describe("FIX-BCTC-SLA-WEEKEND — getSlaThreshold(bctc) calendar awareness", () => {

  it("B-7: getSlaThreshold(bctc) on Saturday = minutesSinceLastWindowEnd+30 (dynamic)", () => {
    // SAT_12Z: minutesSinceLastWindowEnd = 1621, threshold = 1651
    const expected = minutesSinceLastWindowEnd(SAT_12Z) + 30;
    const threshold = getSlaThreshold("bctc", undefined, SAT_12Z);
    expect(threshold).toBe(expected);
    // Must be much larger than the fixed 360-min off-hours value
    expect(threshold).toBeGreaterThan(360);
  });

  it("B-8: getSlaThreshold(bctc) on trading day market hours = 120 min", () => {
    // WED_04Z is inside market hours (02:00–08:59 UTC)
    expect(isVnMarketHours(WED_04Z)).toBe(true); // sanity
    const threshold = getSlaThreshold("bctc", undefined, WED_04Z);
    expect(threshold).toBe(120);
  });

  it("B-9: getSlaThreshold(bctc) on trading day off-hours = 360 min", () => {
    // WED_10Z is a Wednesday but outside market hours (10:00Z > 08:59Z)
    expect(isVnMarketHours(WED_10Z)).toBe(false); // sanity
    const threshold = getSlaThreshold("bctc", undefined, WED_10Z);
    expect(threshold).toBe(360);
  });
});

// ─── B-1 / B-2: checkDataFreshnessSla weekend exemption ─────────────────────

describe("FIX-BCTC-SLA-WEEKEND — checkDataFreshnessSla weekend exemption", () => {

  it("B-1: Weekend (Saturday) — bctc age=1440 min NOT breached (false-alarm repro)", () => {
    // THE TRIGGER CASE: data from Friday session (1440 min = 24h old on Saturday).
    // Old threshold = 360 min → would breach. New threshold = 1651 min → NOT breached.
    const ages = { ...BASE_AGES, bctc: 1440 };
    const result = checkDataFreshnessSla(ages, undefined, [], SAT_12Z);

    const bctcBreach = result.breaches.find((b) => b.signalType === "bctc");
    expect(bctcBreach).toBeUndefined(); // no false-alarm on weekend
  });

  it("B-1b: Weekend — bctc age=1621 min (exactly at window end) NOT breached", () => {
    // age = minutesSinceLastWindowEnd = 1621, threshold = 1651. 1621 ≤ 1651 → ok.
    const ages = { ...BASE_AGES, bctc: 1621 };
    const result = checkDataFreshnessSla(ages, undefined, [], SAT_12Z);

    expect(result.breaches.find((b) => b.signalType === "bctc")).toBeUndefined();
  });

  it("B-2: Weekend — bctc age=1700 min (> 1651 threshold) IS breached (true positive)", () => {
    // Genuinely stale even for weekend: 1700 > 1651 → breach must fire.
    // This verifies we have NOT over-exempted (don't blank out ALL weekend breaches).
    const ages = { ...BASE_AGES, bctc: 1700 };
    const result = checkDataFreshnessSla(ages, undefined, [], SAT_12Z);

    const bctcBreach = result.breaches.find((b) => b.signalType === "bctc");
    expect(bctcBreach).toBeDefined();
    expect(bctcBreach!.ageMinutes).toBe(1700);
  });
});

// ─── B-3 / B-4: Weekday market-hours true positives ─────────────────────────

describe("FIX-BCTC-SLA-WEEKEND — weekday market-hours true positives (regression guard)", () => {

  it("B-3: Weekday market hours — bctc age=240 min IS breached (240 > 120 min threshold)", () => {
    // Wed 04:30Z, market open, bctc 4h stale → breach MUST fire.
    expect(isVnMarketHours(WED_04Z)).toBe(true);

    const ages = { ...BASE_AGES, bctc: 240 };
    const result = checkDataFreshnessSla(ages, undefined, [], WED_04Z);

    const bctcBreach = result.breaches.find((b) => b.signalType === "bctc");
    expect(bctcBreach).toBeDefined();
    expect(bctcBreach!.thresholdMinutes).toBe(120);
  });

  it("B-4: Weekday market hours — bctc age=60 min NOT breached (within 120 min SLA)", () => {
    const ages = { ...BASE_AGES, bctc: 60 };
    const result = checkDataFreshnessSla(ages, undefined, [], WED_04Z);

    expect(result.breaches.find((b) => b.signalType === "bctc")).toBeUndefined();
  });
});

// ─── B-5 / B-6: Weekday off-hours true positives ────────────────────────────

describe("FIX-BCTC-SLA-WEEKEND — weekday off-hours true positives (regression guard)", () => {

  it("B-5: Weekday off-hours — bctc age=400 min IS breached (400 > 360 min threshold)", () => {
    // Wed 10:00Z, post-session, 400 min stale → breach MUST fire.
    expect(isVnMarketHours(WED_10Z)).toBe(false);

    const ages = { ...BASE_AGES, bctc: 400 };
    const result = checkDataFreshnessSla(ages, undefined, [], WED_10Z);

    const bctcBreach = result.breaches.find((b) => b.signalType === "bctc");
    expect(bctcBreach).toBeDefined();
    expect(bctcBreach!.thresholdMinutes).toBe(360);
  });

  it("B-6: Weekday off-hours — bctc age=200 min NOT breached (within 360 min threshold)", () => {
    const ages = { ...BASE_AGES, bctc: 200 };
    const result = checkDataFreshnessSla(ages, undefined, [], WED_10Z);

    expect(result.breaches.find((b) => b.signalType === "bctc")).toBeUndefined();
  });
});
