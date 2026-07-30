/**
 * FIX-BCTC-SLA-THRESHOLD-360 — Unit tests for the BCTC earnings-window-aware SLA.
 *
 * SUPERSEDED (2026-07-30) by FIX-SLA-BCTC-THRESHOLD-TRACKS-STALENESS-NOT-CONSTANT
 * for the getSlaThreshold()/checkDataFreshnessSla() sections below (T-1..T-6,
 * T-10, T-10b). Root cause of the original fix this file guarded: on weekday
 * off-hours out of the earnings window, getSlaThreshold("bctc") returned
 * `minutesSinceLastEarningsWindowEnd(now) + grace` — an AGE measured from a
 * FIXED past anchor (the last earnings-window close), not a duration. Because
 * that quantity grows at the identical 1-minute-per-minute rate as
 * `ageMinutes` itself (also an age, measured from the FIXED last-parse
 * timestamp), their difference is a time-invariant constant for as long as
 * no new data arrives — a breach recorded in this state could never clear on
 * its own. Mechanically proven via 12 consecutive production sla-monitor
 * alerts whose (stale - threshold) difference was the exact same 5439-minute
 * constant across a 21h sampling window.
 *
 * The bctc threshold is now a FIXED two-tier constant (SSOT: system-map.json
 * .project.data_sources["bctc-discover"].sla): 1440 min (24h) while
 * isBctcEarningsWindowActive(now) is true, 10080 min (168h/7d) otherwise —
 * no "minutes since X" term. The false-CRITICAL-during-quiet-period concern
 * this file originally guarded is now the job of the live queue-depth +
 * service-state idle/crash gate in checkSignalSla()
 * (FIX-HEALTH-RECHECK-BCTC-IDLE-VS-CRASH), which reads REAL pipeline state
 * instead of approximating "is data expected right now" from calendar
 * arithmetic — see the T-1/T-2 rewrite below, which now demonstrates that
 * mechanism explicitly via an injected PipelineRuntimeState.
 *
 * T-7/T-8/T-9 (pure isBctcEarningsWindowActive / lastExpectedEarningsWindowEnd /
 * minutesSinceLastEarningsWindowEnd calendar-arithmetic tests) are UNCHANGED —
 * those functions did not change, only their use inside getSlaThreshold's
 * bctc branch did.
 *
 * DoD cases (MUST ALL PASS):
 *   T-1: Off-season (Jun 25), push-age=11982 min, runtimeState idle (queue=0,
 *        service active) → NOT breached (idle gate, not threshold, suppresses it)
 *   T-1b: Same age, NO runtimeState supplied → IS breached against the fixed
 *        10080-min (7d) ceiling — the honest, non-moving-goalpost result
 *   T-2: Off-season (Jun 25), push-age=10680 min, runtimeState idle → NOT breached
 *   T-3: Off-season weekday off-hours (Jun 25) → FIXED 10080 min (not dynamic)
 *   T-4: In-window weekday off-hours (Apr 8) → FIXED 1440 min
 *   T-5: In-window weekday market hours (Apr 8) → FIXED 1440 min (same as off-hours now)
 *   T-6: Non-trading day (Sat Jun 6) → FIXED 10080 min (day-of-week no longer matters)
 *   T-7: isBctcEarningsWindowActive — Apr 1-14 = true, Apr 15+ = false, Jun = false, Jul 1-14 = true
 *   T-8: lastExpectedEarningsWindowEnd — correct prior window end found
 *   T-9: minutesSinceLastEarningsWindowEnd — positive, plausible value
 *   T-10: checkDataFreshnessSla — genuinely stale (11982 > 10080) IS breached
 *        without a runtime-state probe (bidirectional proof: fires on stale)
 *
 * @module __tests__/FIX-BCTC-SLA-THRESHOLD-360
 */

import { describe, it, expect } from "bun:test";
import {
  getSlaThreshold,
  checkDataFreshnessSla,
  checkSignalSla,
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
 *  minutesSinceLastEarningsWindowEnd ≈ 102841 min (~71.4 days) — no longer
 *  consulted by getSlaThreshold, retained here only for the T-8/T-9 pure
 *  calendar-arithmetic assertions.
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

// ─── T-7: isBctcEarningsWindowActive (UNCHANGED) ─────────────────────────────

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

// ─── T-8 / T-9: lastExpectedEarningsWindowEnd / minutesSince (UNCHANGED) ─────

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

// ─── T-3 / T-4 / T-5 / T-6: getSlaThreshold is FIXED, not calendar-varying ──

describe("FIX-BCTC-SLA-THRESHOLD-360 — getSlaThreshold(bctc) is FIXED two-tier (SSOT)", () => {

  it("T-3: Off-season weekday off-hours (Jun 25) → FIXED 10080 min (not dynamic)", () => {
    expect(isVnMarketHours(JUN_25_OFFHOURS)).toBe(false); // sanity
    expect(isBctcEarningsWindowActive(JUN_25_OFFHOURS)).toBe(false); // sanity: out-of-window
    const threshold = getSlaThreshold("bctc", undefined, JUN_25_OFFHOURS);
    expect(threshold).toBe(10080);
  });

  it("T-4: In-window weekday off-hours (Apr 8) → FIXED 1440 min", () => {
    expect(isVnMarketHours(APR_08_OFFHOURS)).toBe(false); // sanity: off-hours
    expect(isBctcEarningsWindowActive(APR_08_OFFHOURS)).toBe(true); // sanity: in-window
    const threshold = getSlaThreshold("bctc", undefined, APR_08_OFFHOURS);
    expect(threshold).toBe(1440);
  });

  it("T-5: In-window weekday market hours (Apr 8) → FIXED 1440 min (same as off-hours — market-hours nuance retired)", () => {
    expect(isVnMarketHours(APR_08_MARKET)).toBe(true); // sanity: market hours
    expect(isBctcEarningsWindowActive(APR_08_MARKET)).toBe(true); // sanity: in-window
    const threshold = getSlaThreshold("bctc", undefined, APR_08_MARKET);
    expect(threshold).toBe(1440);
  });

  it("T-6: Non-trading day (Sat Jun 6) → FIXED 10080 min (day-of-week no longer relevant)", () => {
    const threshold = getSlaThreshold("bctc", undefined, SAT_12Z);
    expect(threshold).toBe(10080);
  });

  it("T-4b: In-window weekday off-hours (Jul 10) → FIXED 1440 min (regression guard: July window)", () => {
    expect(isVnMarketHours(JUL_10_OFFHOURS)).toBe(false);
    expect(isBctcEarningsWindowActive(JUL_10_OFFHOURS)).toBe(true);
    const threshold = getSlaThreshold("bctc", undefined, JUL_10_OFFHOURS);
    expect(threshold).toBe(1440);
  });

  it("T-11: threshold asserted equal across 3 emissions >1h apart, same window state (never drifts)", () => {
    // Three points in time, hours apart, all out-of-window (June) — must be byte-identical.
    const t1 = getSlaThreshold("bctc", undefined, new Date("2026-06-25T08:00:00.000Z"));
    const t2 = getSlaThreshold("bctc", undefined, new Date("2026-06-25T11:00:00.000Z"));
    const t3 = getSlaThreshold("bctc", undefined, new Date("2026-06-25T20:00:00.000Z"));
    expect(t1).toBe(10080);
    expect(t2).toBe(10080);
    expect(t3).toBe(10080);
  });
});

// ─── T-1 / T-2: idle gate (not the threshold) suppresses off-season noise ───

describe("FIX-BCTC-SLA-THRESHOLD-360 — off-season quiet period is suppressed by the runtime-state idle gate, not the threshold", () => {

  it("T-1: Off-season (Jun 25), push-age=11982 min, service active + queue empty → NOT breached (idle verdict)", () => {
    // B-05 RAW-confirmed scenario: VPS host UP (uptime 8d+), queue=0, month=6 off-season.
    // The idle gate in checkSignalSla short-circuits BEFORE the threshold is
    // ever consulted — this is now the sole mechanism preventing a
    // false-CRITICAL here (see FIX-HEALTH-RECHECK-BCTC-IDLE-VS-CRASH).
    const result = checkSignalSla("bctc", 11982, undefined, JUN_25_OFFHOURS, {
      serviceActive: true,
      queueDepth: 0,
    });
    expect(result.status).toBe("ok");
    expect(result.verdict).toBe("idle");
  });

  it("T-1b: Same age (11982 min), NO runtime-state probe supplied → IS breached against the fixed 10080-min ceiling", () => {
    // Honest, non-moving-goalpost result: without a live probe confirming the
    // queue is actually empty, 199.7h old data breaches the 168h SSOT ceiling.
    // This is a deliberate behavior change from the pre-fix dynamic formula,
    // which never breached in this branch regardless of how stale.
    const ages = { ...BASE_AGES, bctc: 11982 };
    const result = checkDataFreshnessSla(ages, undefined, [], JUN_25_OFFHOURS);
    const bctcBreach = result.breaches.find((b) => b.signalType === "bctc");
    expect(bctcBreach).toBeDefined();
    expect(bctcBreach!.thresholdMinutes).toBe(10080);
  });

  it("T-2: Off-season (Jun 25), push-age=10680 min, service active + queue empty → NOT breached (idle verdict)", () => {
    const result = checkSignalSla("bctc", 10680, undefined, JUN_25_OFFHOURS, {
      serviceActive: true,
      queueDepth: 0,
    });
    expect(result.status).toBe("ok");
    expect(result.verdict).toBe("idle");
  });
});

// ─── T-10: bidirectional proof — genuinely stale data still fires ──────────

describe("FIX-BCTC-SLA-THRESHOLD-360 — T-10: DoD bidirectional proof (fires on stale, clears on fresh)", () => {

  it("T-10: checkDataFreshnessSla — 11982 min (>10080 ceiling) IS breached without a runtime probe", () => {
    const pushAgeMin = 11982;
    const ages = { ...BASE_AGES, bctc: pushAgeMin };
    const result = checkDataFreshnessSla(ages, undefined, [], JUN_25_OFFHOURS);

    const bctcBreach = result.breaches.find((b) => b.signalType === "bctc");
    expect(bctcBreach).toBeDefined();
    expect(bctcBreach!.status).toBe("breached");
    expect(bctcBreach!.thresholdMinutes).toBe(10080);
  });

  it("T-10b: checkDataFreshnessSla — 10079 min (< 10080 ceiling) NOT breached (gate clears on fresh data)", () => {
    const ages = { ...BASE_AGES, bctc: 10079 };
    const result = checkDataFreshnessSla(ages, undefined, [], JUN_25_OFFHOURS);

    expect(result.breaches.find((b) => b.signalType === "bctc")).toBeUndefined();
  });
});
