/**
 * FIX-SLA-EXEMPT-NEWS-SBVFX — Unit tests for news + sbv_fx calendar-aware SLA exemption.
 *
 * DoD cases:
 *   N-1: news overnight UTC (22:31Z) — 289 min age NOT breached (quiet hours, threshold > 289)
 *   N-2: news publish hours (Sat 12:00Z) — 60 min age IS breached (tight 30-min SLA active)
 *   N-3: news publish hours (Wed 08:00Z) — 25 min age ok (within 30-min threshold)
 *   N-4: isVnNewsPublishHours — true at 00:00Z, 12:00Z, 14:59Z; false at 15:00Z, 22:31Z
 *   N-5: lastExpectedNewsWindowEnd during quiet hours returns most recent 14:59Z
 *   N-6: minutesSinceLastNewsWindowEnd is positive and correct during quiet hours
 *   N-7: getSlaThreshold(news) during quiet hours >> 30 min
 *   N-8: getSlaThreshold(news) during publish hours = 30 min
 *   S-1: sbv_fx weekend — 289 min age NOT breached (not a business day)
 *   S-2: sbv_fx weekday (Mon) — 60 min age IS breached (tight 30-min SLA, 60 > 30)
 *   S-3: sbv_fx weekday — 20 min age ok (within 30-min threshold)
 *   S-4: isVnSbvBusinessDay — true on Mon–Fri VN trading day; false on Saturday
 *   S-5: lastExpectedSbvWindowEnd on Saturday returns last Friday 10:00Z
 *   S-6: getSlaThreshold(sbv_fx) on Saturday >> 30 min
 *   S-7: getSlaThreshold(sbv_fx) on weekday = 30 min
 *   S-8: NEWS_QUIET_HOURS_SOURCES and SBV_BUSINESS_DAY_ONLY_SOURCES export correctly
 *
 * @module __tests__/FIX-SLA-EXEMPT-NEWS-SBVFX
 */

import { describe, it, expect } from "bun:test";
import {
  isVnNewsPublishHours,
  isVnSbvBusinessDay,
  lastExpectedNewsWindowEnd,
  lastExpectedSbvWindowEnd,
  minutesSinceLastNewsWindowEnd,
  minutesSinceLastSbvWindowEnd,
  getSlaThreshold,
  checkDataFreshnessSla,
  NEWS_QUIET_HOURS_SOURCES,
  SBV_BUSINESS_DAY_ONLY_SOURCES,
  MARKET_HOURS_ONLY_SOURCES,
  type SignalType,
} from "../domain/services/freshnessSlaChecker.js";

// ─── Time fixtures ────────────────────────────────────────────────────────────

/** Saturday 2026-06-06 22:31 UTC — overnight UTC, quiet hours for news.
 *  This is the exact timestamp from the trigger signal sau-news-sla-critical-202606062231.
 *  VN time: 05:31 VN Sunday (UTC+7) — overnight, no publishers active.
 */
const SAT_22Z = new Date("2026-06-06T22:31:00.000Z");

/** Saturday 2026-06-06 12:00 UTC — daytime UTC, within news publish hours (00:00–14:59Z). */
const SAT_12Z = new Date("2026-06-06T12:00:00.000Z");

/** Saturday 2026-06-06 15:00 UTC — exactly at quiet-hours boundary. */
const SAT_15Z = new Date("2026-06-06T15:00:00.000Z");

/** Wednesday 2026-06-03 08:00 UTC — weekday, news publish hours active. */
const WED_08Z = new Date("2026-06-03T08:00:00.000Z");

/** Monday 2026-06-08 06:00 UTC — weekday, VN business day for SBV. */
const MON_06Z = new Date("2026-06-08T06:00:00.000Z");

/** Saturday 2026-06-06 10:00 UTC — weekend, NOT a VN business day. */
const SAT_10Z = new Date("2026-06-06T10:00:00.000Z");

/** Friday 2026-06-05 14:59 UTC — last minute of news publish window (daily). */
const FRI_14_59Z = new Date("2026-06-05T14:59:00.000Z");

/** Friday 2026-06-05 10:00 UTC — SBV expected publish slot end. */
const FRI_10Z = new Date("2026-06-05T10:00:00.000Z");

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

// ─── N-4: isVnNewsPublishHours ────────────────────────────────────────────────

describe("FIX-SLA-EXEMPT-NEWS-SBVFX — isVnNewsPublishHours boundary conditions", () => {

  it("N-4a: 00:00 UTC is within publish hours", () => {
    expect(isVnNewsPublishHours(new Date("2026-06-06T00:00:00.000Z"))).toBe(true);
  });

  it("N-4b: 12:00 UTC (Sat) is within publish hours", () => {
    expect(isVnNewsPublishHours(SAT_12Z)).toBe(true);
  });

  it("N-4c: 14:59 UTC is within publish hours (last minute)", () => {
    expect(isVnNewsPublishHours(new Date("2026-06-06T14:59:00.000Z"))).toBe(true);
  });

  it("N-4d: 15:00 UTC is quiet hours (first quiet minute)", () => {
    expect(isVnNewsPublishHours(SAT_15Z)).toBe(false);
  });

  it("N-4e: 22:31 UTC is quiet hours (trigger signal timestamp)", () => {
    expect(isVnNewsPublishHours(SAT_22Z)).toBe(false);
  });

  it("N-4f: 23:59 UTC is quiet hours", () => {
    expect(isVnNewsPublishHours(new Date("2026-06-06T23:59:00.000Z"))).toBe(false);
  });
});

// ─── N-5 / N-6: window end helpers ───────────────────────────────────────────

describe("FIX-SLA-EXEMPT-NEWS-SBVFX — news window end helpers", () => {

  it("N-5a: lastExpectedNewsWindowEnd during quiet hours returns same-day 14:59Z", () => {
    // SAT_22Z = Sat 22:31Z. Same day 14:59Z < 22:31Z → last window end = Sat 14:59Z
    const end = lastExpectedNewsWindowEnd(SAT_22Z);
    expect(end.toISOString()).toBe("2026-06-06T14:59:00.000Z");
  });

  it("N-5b: lastExpectedNewsWindowEnd during publish hours returns previous day 14:59Z", () => {
    // SAT_12Z = Sat 12:00Z. Same day 14:59Z > 12:00Z → go back 1 day → Fri 14:59Z
    const end = lastExpectedNewsWindowEnd(SAT_12Z);
    expect(end.toISOString()).toBe("2026-06-05T14:59:00.000Z");
  });

  it("N-6: minutesSinceLastNewsWindowEnd during quiet hours is positive", () => {
    // SAT_22Z − Sat 14:59Z = 7h 32m = 452 min
    const minutes = minutesSinceLastNewsWindowEnd(SAT_22Z);
    expect(minutes).toBe(452);
  });
});

// ─── N-7 / N-8: getSlaThreshold for news ─────────────────────────────────────

describe("FIX-SLA-EXEMPT-NEWS-SBVFX — getSlaThreshold(news) calendar awareness", () => {

  it("N-7: getSlaThreshold(news) during quiet hours >> 30 min", () => {
    // SAT_22Z: 452 min since last window + 30 grace = 482 min
    const threshold = getSlaThreshold("news", undefined, SAT_22Z);
    expect(threshold).toBeGreaterThan(30);
    expect(threshold).toBe(482); // 452 + 30
  });

  it("N-8: getSlaThreshold(news) during publish hours = 30 min (tight SLA)", () => {
    // SAT_12Z: 12:00Z is within publish hours (utcHour < 15)
    const threshold = getSlaThreshold("news", undefined, SAT_12Z);
    expect(threshold).toBe(30);
  });

  it("N-8b: getSlaThreshold(news) on a weekday during publish hours = 30 min", () => {
    const threshold = getSlaThreshold("news", undefined, WED_08Z);
    expect(threshold).toBe(30);
  });
});

// ─── N-1 / N-2 / N-3: checkDataFreshnessSla for news ─────────────────────────

describe("FIX-SLA-EXEMPT-NEWS-SBVFX — checkDataFreshnessSla news exemption", () => {

  it("N-1: news overnight UTC (22:31Z) — 289 min age NOT breached (trigger signal repro)", () => {
    // This is the exact scenario from the trigger signal:
    // news source fired CRITICAL at 289 min vs 30-min SLA at 22:31Z (overnight).
    // After fix: threshold = 452 + 30 = 482 min. 289 < 482 → NOT breached.
    const ages = { ...BASE_AGES, news: 289 };
    const result = checkDataFreshnessSla(ages, undefined, [], SAT_22Z);

    const newsBreach = result.breaches.find((b) => b.signalType === "news");
    expect(newsBreach).toBeUndefined(); // no false-CRITICAL during quiet hours
  });

  it("N-1b: news quiet hours — age at threshold edge (452 min) NOT breached", () => {
    // age = 452 = minutesSince, threshold = 452+30 = 482. 452 ≤ 482 → ok.
    const ages = { ...BASE_AGES, news: 452 };
    const result = checkDataFreshnessSla(ages, undefined, [], SAT_22Z);
    expect(result.breaches.find((b) => b.signalType === "news")).toBeUndefined();
  });

  it("N-1c: news quiet hours — age beyond threshold (500 min) IS breached", () => {
    // 500 > 482 → breached (genuinely stale even during quiet period)
    const ages = { ...BASE_AGES, news: 500 };
    const result = checkDataFreshnessSla(ages, undefined, [], SAT_22Z);
    const breach = result.breaches.find((b) => b.signalType === "news");
    expect(breach).toBeDefined();
  });

  it("N-2: news publish hours (Sat 12:00Z) — 60 min age IS breached (tight 30-min SLA)", () => {
    // SAT_12Z is daytime UTC (12:00Z < 15:00Z) → publish hours → tight 30-min SLA.
    // 60 > 30 → breached.
    const ages = { ...BASE_AGES, news: 60 };
    const result = checkDataFreshnessSla(ages, undefined, [], SAT_12Z);

    const breach = result.breaches.find((b) => b.signalType === "news");
    expect(breach).toBeDefined();
    expect(breach!.thresholdMinutes).toBe(30);
  });

  it("N-3: news publish hours (Wed 08:00Z) — 25 min age NOT breached (within 30-min SLA)", () => {
    const ages = { ...BASE_AGES, news: 25 };
    const result = checkDataFreshnessSla(ages, undefined, [], WED_08Z);
    expect(result.breaches.find((b) => b.signalType === "news")).toBeUndefined();
  });
});

// ─── S-4: isVnSbvBusinessDay ─────────────────────────────────────────────────

describe("FIX-SLA-EXEMPT-NEWS-SBVFX — isVnSbvBusinessDay", () => {

  it("S-4a: Monday is a VN business day", () => {
    expect(isVnSbvBusinessDay(MON_06Z)).toBe(true);
  });

  it("S-4b: Saturday is NOT a VN business day", () => {
    expect(isVnSbvBusinessDay(SAT_10Z)).toBe(false);
  });

  it("S-4c: Wednesday is a VN business day", () => {
    expect(isVnSbvBusinessDay(WED_08Z)).toBe(true);
  });
});

// ─── S-5 / minutesSinceLastSbvWindowEnd ──────────────────────────────────────

describe("FIX-SLA-EXEMPT-NEWS-SBVFX — SBV window end helpers", () => {

  it("S-5: lastExpectedSbvWindowEnd on Saturday returns last Friday 10:00Z", () => {
    // SAT_10Z = Sat 2026-06-06 10:00Z. Last business-day 10:00Z = Fri 2026-06-05 10:00Z.
    const end = lastExpectedSbvWindowEnd(SAT_10Z);
    expect(end.toISOString()).toBe("2026-06-05T10:00:00.000Z");
  });

  it("S-5b: minutesSinceLastSbvWindowEnd on Saturday ≈ (Sat 10:00 − Fri 10:00) = 1440 min", () => {
    const minutes = minutesSinceLastSbvWindowEnd(SAT_10Z);
    expect(minutes).toBe(1440);
  });
});

// ─── S-6 / S-7: getSlaThreshold for sbv_fx ───────────────────────────────────

describe("FIX-SLA-EXEMPT-NEWS-SBVFX — getSlaThreshold(sbv_fx) calendar awareness", () => {

  it("S-6: getSlaThreshold(sbv_fx) on Saturday >> 30 min", () => {
    // SAT_10Z: 1440 min since last SBV window + 30 grace = 1470 min
    const threshold = getSlaThreshold("sbv_fx", undefined, SAT_10Z);
    expect(threshold).toBeGreaterThan(30);
    expect(threshold).toBe(1470); // 1440 + 30
  });

  it("S-7: getSlaThreshold(sbv_fx) on weekday = 30 min (tight SLA)", () => {
    const threshold = getSlaThreshold("sbv_fx", undefined, MON_06Z);
    expect(threshold).toBe(30);
  });
});

// ─── S-1 / S-2 / S-3: checkDataFreshnessSla for sbv_fx ──────────────────────

describe("FIX-SLA-EXEMPT-NEWS-SBVFX — checkDataFreshnessSla sbv_fx exemption", () => {

  it("S-1: sbv_fx weekend — 289 min age NOT breached (not a business day)", () => {
    // SAT_10Z: business-day gate off → threshold = 1440 + 30 = 1470 min.
    // 289 < 1470 → NOT breached.
    const ages = { ...BASE_AGES, sbv_fx: 289 };
    const result = checkDataFreshnessSla(ages, undefined, [], SAT_10Z);
    expect(result.breaches.find((b) => b.signalType === "sbv_fx")).toBeUndefined();
  });

  it("S-1b: sbv_fx weekend — age genuinely stale (1500 min > 1470) IS breached", () => {
    const ages = { ...BASE_AGES, sbv_fx: 1500 };
    const result = checkDataFreshnessSla(ages, undefined, [], SAT_10Z);
    expect(result.breaches.find((b) => b.signalType === "sbv_fx")).toBeDefined();
  });

  it("S-2: sbv_fx weekday (Mon) — 60 min age IS breached (tight 30-min SLA)", () => {
    // MON_06Z: business day → tight 30-min SLA. 60 > 30 → breached.
    const ages = { ...BASE_AGES, sbv_fx: 60 };
    const result = checkDataFreshnessSla(ages, undefined, [], MON_06Z);
    const breach = result.breaches.find((b) => b.signalType === "sbv_fx");
    expect(breach).toBeDefined();
    expect(breach!.thresholdMinutes).toBe(30);
  });

  it("S-3: sbv_fx weekday — 20 min age NOT breached (within 30-min SLA)", () => {
    const ages = { ...BASE_AGES, sbv_fx: 20 };
    const result = checkDataFreshnessSla(ages, undefined, [], MON_06Z);
    expect(result.breaches.find((b) => b.signalType === "sbv_fx")).toBeUndefined();
  });
});

// ─── S-8: Exported sets ───────────────────────────────────────────────────────

describe("FIX-SLA-EXEMPT-NEWS-SBVFX — exported source sets", () => {

  it("S-8a: NEWS_QUIET_HOURS_SOURCES contains news", () => {
    expect(NEWS_QUIET_HOURS_SOURCES.has("news")).toBe(true);
    expect(NEWS_QUIET_HOURS_SOURCES.has("price")).toBe(false);
    expect(NEWS_QUIET_HOURS_SOURCES.has("sbv_fx")).toBe(false);
  });

  it("S-8b: SBV_BUSINESS_DAY_ONLY_SOURCES contains sbv_fx", () => {
    expect(SBV_BUSINESS_DAY_ONLY_SOURCES.has("sbv_fx")).toBe(true);
    expect(SBV_BUSINESS_DAY_ONLY_SOURCES.has("news")).toBe(false);
    expect(SBV_BUSINESS_DAY_ONLY_SOURCES.has("price")).toBe(false);
  });

  it("S-8c: MARKET_HOURS_ONLY_SOURCES does NOT contain news or sbv_fx", () => {
    expect(MARKET_HOURS_ONLY_SOURCES.has("news")).toBe(false);
    expect(MARKET_HOURS_ONLY_SOURCES.has("sbv_fx")).toBe(false);
  });
});
