/**
 * FIX-BCTC-SLA-THRESHOLD-360 — Unit tests for the BCTC earnings-window-aware SLA.
 *
 * Root cause: getSlaThreshold("bctc") on a weekday off-hours returned the LEGACY
 * fixed 360-min threshold regardless of whether the earnings season was active.
 * During the 10-week inter-quarter quiet gap (e.g. Apr-window-end → Jul-window-start),
 * push-age grows to 100-200h+ (pipeline HEALTHY, event-driven quarterly), and the
 * 360-min threshold fires false-CRITICAL.
 *
 * Fix (FIX-BCTC-SLA-THRESHOLD-360): on weekday off-hours, OUT of earnings window
 * → threshold = minutesSinceLastEarningsWindowEnd + OFF_HOURS_GRACE (30 min).
 * This measures "how long since the pipeline was expected to produce data",
 * not raw wall-clock push-age.
 *
 * DoD cases (MUST ALL PASS):
 *   T-1: Off-season weekday off-hours (Jun 25) — bctc push-age=11982 min (199.7h) NOT breached
 *        (threshold = minutesSinceLastEarningsWindowEnd + 30 >> 11982)
 *   T-2: Off-season weekday off-hours (Jun 25) — bctc push-age=178h = 10680 min NOT breached
 *   T-3: Off-season weekday off-hours — threshold is dynamic (minutesSinceLastEarningsWindowEnd+30)
 *   T-4: In-window weekday off-hours (Apr 8) — threshold is STILL 360 min (earnings active)
 *   T-5: In-window weekday market hours (Apr 8) — threshold is STILL 120 min
 *   T-6: Non-trading day (Sat Jun 6) — threshold is minutesSinceLastWindowEnd+30 (unchanged)
 *   T-7: isBctcEarningsWindowActive — Apr 1-14 = true, Apr 15+ = false, Jun = false, Jul 1-14 = true
 *   T-8: lastExpectedEarningsWindowEnd — correct prior window end found
 *   T-9: minutesSinceLastEarningsWindowEnd — positive, plausible value
 *   T-10: Full checkDataFreshnessSla DoD: today (2026-06-25), push-age=11982 → PASS (no breach)
 *
 * Regression guard:
 *   T-4 and T-5 ensure in-window behavior is NOT affected.
 *
 * @module __tests__/FIX-BCTC-SLA-THRESHOLD-360
 */

import { describe, it, expect } from "bun:test";
import {
  getSlaThreshold,
  checkDataFreshnessSla,
  isVnMarketHours,
  minutesSinceLastEarningsWindowEnd,
  lastExpectedEarningsWindowEnd,
  isBctcEarningsWindowActive,
  BCTC_EARNINGS_WINDOW_TRIGGER_MONTHS,
  BCTC_EARNINGS_WINDOW_DAYS,
  type SignalType,
} from "../domain/services/freshnessSlaChecker.js";

// ─── Time fixtures ────────────────────────────────────────────────────────────

/** Wednesday 2026-06-25 10:00 UTC — the RAW-confirmed off-season scenario.
 *  Month=6 ∉ [1,4,7,10] → OUT of earnings window.
 *  Last window end = April 14, 2026 23:59 UTC.
 *  minutesSinceLastEarningsWindowEnd ≈ 102841 min (~71.4 days).
 */
const JUN_25_OFFHOURS = new Date("2026-06-25T10:00:00.000Z");

/** Wednesday 2026-04-08 10:00 UTC — IN earnings window (month=4, day=8 ≤ 14), off-hours. */
const APR_08_OFFHOURS = new Date("2026-04-08T10:00:00.000Z");

/** Wednesday 2026-04-08 04:30 UTC — IN earnings window, market hours. */
const APR_08_MARKET = new Date("2026-04-08T04:30:00.000Z");

/** Saturday 2026-06-06 12:00 UTC — non-trading day (used in regression guard). */
const SAT_12Z = new Date("2026-06-06T12:00:00.000Z");

/** July 10, 2026 10:00 UTC — IN earnings window (month=7, day=10 ≤ 14), off-hours. */
const JUL_10_OFFHOURS = new Date("2026-07-10T10:00:00.000Z");

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

// ─── T-7: isBctcEarningsWindowActive ─────────────────────────────────────────

describe("FIX-BCTC-SLA-THRESHOLD-360 — isBctcEarningsWindowActive", () => {

  it("T-7a: April 1-14 = IN window (trigger month + day ≤ 14)", () => {
    expect(isBctcEarningsWindowActive(new Date("2026-04-01T00:00:00Z"))).toBe(true);
    expect(isBctcEarningsWindowActive(new Date("2026-04-08T10:00:00Z"))).toBe(true);
    expect(isBctcEarningsWindowActive(new Date("2026-04-14T23:59:00Z"))).toBe(true);
  });

  it("T-7b: April 15+ = OUT of window (day > 14)", () => {
    expect(isBctcEarningsWindowActive(new Date("2026-04-15T00:00:00Z"))).toBe(false);
    expect(isBctcEarningsWindowActive(new Date("2026-04-21T10:00:00Z"))).toBe(false);
    expect(isBctcEarningsWindowActive(new Date("2026-04-30T12:00:00Z"))).toBe(false);
  });

  it("T-7c: June = OUT of window (non-trigger month)", () => {
    expect(isBctcEarningsWindowActive(JUN_25_OFFHOURS)).toBe(false);
    expect(isBctcEarningsWindowActive(new Date("2026-06-01T00:00:00Z"))).toBe(false);
  });

  it("T-7d: July 1-14 = IN window (trigger month)", () => {
    expect(isBctcEarningsWindowActive(new Date("2026-07-01T00:00:00Z"))).toBe(true);
    expect(isBctcEarningsWindowActive(JUL_10_OFFHOURS)).toBe(true);
    expect(isBctcEarningsWindowActive(new Date("2026-07-14T23:59:00Z"))).toBe(true);
  });

  it("T-7e: BCTC_EARNINGS_WINDOW_TRIGGER_MONTHS has 4 entries [1,4,7,10]", () => {
    expect([...BCTC_EARNINGS_WINDOW_TRIGGER_MONTHS]).toEqual([1, 4, 7, 10]);
    expect(BCTC_EARNINGS_WINDOW_DAYS).toBe(14);
  });
});

// ─── T-8 / T-9: lastExpectedEarningsWindowEnd / minutesSince ─────────────────

describe("FIX-BCTC-SLA-THRESHOLD-360 — lastExpectedEarningsWindowEnd / minutesSince", () => {

  it("T-8a: Jun 25 → last window end = April 14, 2026 23:59 UTC", () => {
    const winEnd = lastExpectedEarningsWindowEnd(JUN_25_OFFHOURS);
    expect(winEnd.getUTCFullYear()).toBe(2026);
    expect(winEnd.getUTCMonth() + 1).toBe(4); // April
    expect(winEnd.getUTCDate()).toBe(14);
    expect(winEnd.getUTCHours()).toBe(23);
    expect(winEnd.getUTCMinutes()).toBe(59);
  });

  it("T-8b: July 15 → last window end = July 14, 2026 23:59 UTC", () => {
    const now = new Date("2026-07-15T10:00:00Z");
    const winEnd = lastExpectedEarningsWindowEnd(now);
    expect(winEnd.getUTCMonth() + 1).toBe(7); // July
    expect(winEnd.getUTCDate()).toBe(14);
  });

  it("T-8c: Apr 20 → last window end = April 14, 2026 23:59 UTC (current month's window already closed)", () => {
    const now = new Date("2026-04-20T10:00:00Z");
    const winEnd = lastExpectedEarningsWindowEnd(now);
    expect(winEnd.getUTCMonth() + 1).toBe(4); // April
    expect(winEnd.getUTCDate()).toBe(14);
  });

  it("T-9: minutesSinceLastEarningsWindowEnd(Jun 25) is ~102841 (about 71 days)", () => {
    const mins = minutesSinceLastEarningsWindowEnd(JUN_25_OFFHOURS);
    // Jun 25 10:00 UTC − Apr 14 23:59 UTC ≈ 71.4 days ≈ 102816 min
    // Allow ±30 min for calculation differences
    expect(mins).toBeGreaterThan(102700);
    expect(mins).toBeLessThan(103000);
  });
});

// ─── T-3 / T-4 / T-5: getSlaThreshold behavior ──────────────────────────────

describe("FIX-BCTC-SLA-THRESHOLD-360 — getSlaThreshold(bctc) earnings-window awareness", () => {

  it("T-3: Off-season weekday off-hours (Jun 25) → dynamic threshold >> 10000 min", () => {
    expect(isVnMarketHours(JUN_25_OFFHOURS)).toBe(false); // sanity
    expect(isBctcEarningsWindowActive(JUN_25_OFFHOURS)).toBe(false); // sanity: out-of-window
    const threshold = getSlaThreshold("bctc", undefined, JUN_25_OFFHOURS);
    // minutesSinceLastEarningsWindowEnd ≈ 102841 + 30 = 102871
    expect(threshold).toBeGreaterThan(10000);
    expect(threshold).toBe(minutesSinceLastEarningsWindowEnd(JUN_25_OFFHOURS) + 30);
  });

  it("T-4: In-window weekday off-hours (Apr 8) → 360 min (unchanged from original)", () => {
    expect(isVnMarketHours(APR_08_OFFHOURS)).toBe(false); // sanity: off-hours
    expect(isBctcEarningsWindowActive(APR_08_OFFHOURS)).toBe(true); // sanity: in-window
    const threshold = getSlaThreshold("bctc", undefined, APR_08_OFFHOURS);
    expect(threshold).toBe(360);
  });

  it("T-5: In-window weekday market hours (Apr 8) → 120 min (unchanged)", () => {
    expect(isVnMarketHours(APR_08_MARKET)).toBe(true); // sanity: market hours
    expect(isBctcEarningsWindowActive(APR_08_MARKET)).toBe(true); // sanity: in-window
    const threshold = getSlaThreshold("bctc", undefined, APR_08_MARKET);
    expect(threshold).toBe(120);
  });

  it("T-6: Non-trading day (Sat Jun 6) → minutesSinceLastWindowEnd+30 (unchanged)", () => {
    const threshold = getSlaThreshold("bctc", undefined, SAT_12Z);
    // Non-trading day path unchanged — measures against last VN market session close
    expect(threshold).toBeGreaterThan(360);
  });

  it("T-4b: In-window weekday off-hours (Jul 10) → 360 min (regression guard: July window)", () => {
    expect(isVnMarketHours(JUL_10_OFFHOURS)).toBe(false);
    expect(isBctcEarningsWindowActive(JUL_10_OFFHOURS)).toBe(true);
    const threshold = getSlaThreshold("bctc", undefined, JUL_10_OFFHOURS);
    expect(threshold).toBe(360);
  });
});

// ─── T-1 / T-2 / T-10: DoD cases — off-season push-ages PASS ────────────────

describe("FIX-BCTC-SLA-THRESHOLD-360 — DoD: off-season push-ages do NOT breach", () => {

  it("T-1: Off-season (Jun 25), bctc push-age=11982 min (199.7h) → NOT breached", () => {
    // B-05 RAW-confirmed scenario: VPS host UP (uptime 8d+), queue=0, month=6 off-season.
    // push-age 199.7h = 11982 min must NOT trigger CRITICAL or HIGH.
    const ages = { ...BASE_AGES, bctc: 11982 };
    const result = checkDataFreshnessSla(ages, undefined, [], JUN_25_OFFHOURS);

    const bctcBreach = result.breaches.find((b) => b.signalType === "bctc");
    expect(bctcBreach).toBeUndefined(); // off-season idle — no breach
  });

  it("T-2: Off-season (Jun 25), bctc push-age=10680 min (178h) → NOT breached", () => {
    // B-06 RAW-confirmed scenario: push-age 178h must NOT trigger breach.
    const ages = { ...BASE_AGES, bctc: 10680 };
    const result = checkDataFreshnessSla(ages, undefined, [], JUN_25_OFFHOURS);

    const bctcBreach = result.breaches.find((b) => b.signalType === "bctc");
    expect(bctcBreach).toBeUndefined();
  });

  it("T-10: checkDataFreshnessSla DoD — off-season push-age reports threshold correctly", () => {
    // Full round-trip: confirm threshold value is plausible and status is ok.
    const pushAgeMin = 11982;
    const ages = { ...BASE_AGES, bctc: pushAgeMin };
    const result = checkDataFreshnessSla(ages, undefined, [], JUN_25_OFFHOURS);

    // Should have ZERO breaches for bctc
    const bctcBreach = result.breaches.find((b) => b.signalType === "bctc");
    expect(bctcBreach).toBeUndefined();

    // Threshold should be > pushAgeMin
    const expectedThreshold = minutesSinceLastEarningsWindowEnd(JUN_25_OFFHOURS) + 30;
    expect(expectedThreshold).toBeGreaterThan(pushAgeMin);
  });

  it("T-10b: True positive preserved — genuinely stale in off-season IS breached", () => {
    // Age = minutesSinceLastEarningsWindowEnd + 31 (just over the threshold) → should breach.
    // This ensures we have NOT over-exempted: true off-season staleness must still fire.
    const mins = minutesSinceLastEarningsWindowEnd(JUN_25_OFFHOURS);
    const staleAge = mins + 31; // 1 min over threshold
    const ages = { ...BASE_AGES, bctc: staleAge };
    const result = checkDataFreshnessSla(ages, undefined, [], JUN_25_OFFHOURS);

    const bctcBreach = result.breaches.find((b) => b.signalType === "bctc");
    expect(bctcBreach).toBeDefined();
    expect(bctcBreach!.status).toBe("breached");
  });
});
