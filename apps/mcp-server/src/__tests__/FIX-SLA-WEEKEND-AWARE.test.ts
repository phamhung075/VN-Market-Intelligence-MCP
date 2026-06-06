/**
 * FIX-SLA-WEEKEND-AWARE — Unit tests for calendar-aware SLA staleness logic.
 *
 * DoD cases:
 *   W-1: Weekend — prices/foreign_flow are "off-hours" (not "breached") on Saturday
 *   W-2: Friday-close — data pushed at Friday 08:59Z stays healthy on Saturday
 *   W-3: Monday-morning-stale — Monday 03:00Z with no push since Friday IS stale
 *         (market window is open, tight 10-min SLA applies, Friday data is 66h old)
 *   W-4: Mid-session stale — weekday 04:00 UTC, price 15 min old → breach (10 min SLA)
 *   W-5: vpsProxyHealthHandler.computeStale — prices off-hours not stale, on-hours stale
 *   W-6: lastExpectedWindowEnd returns last Friday 08:59Z on Saturday
 *   W-7: minutesSinceLastWindowEnd positive and correct on Saturday
 *   W-8: getSlaThreshold — price off-hours threshold >> 10 min
 *   W-9: getSlaThreshold — price in-hours threshold = 10 min
 *   W-10: foreign_flow off-hours: same treatment as price
 *
 * @module __tests__/FIX-SLA-WEEKEND-AWARE
 */

import { describe, it, expect } from "bun:test";
import {
  lastExpectedWindowEnd,
  minutesSinceLastWindowEnd,
  getSlaThreshold,
  checkDataFreshnessSla,
  isVnMarketHours,
  MARKET_HOURS_ONLY_SOURCES,
  type SignalType,
} from "../domain/services/freshnessSlaChecker.js";
import { handleVpsProxyHealth } from "../interface/mcp/routes/vpsProxyHealthHandler.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import type { IncomingMessage, ServerResponse } from "node:http";

// ─── Time fixtures ────────────────────────────────────────────────────────────
// All timestamps are well-defined Mon–Fri market sessions or weekends.

/** Saturday 2026-06-06 12:00 UTC — weekend, off-hours for prices/foreign_flow */
const SAT_12Z = new Date("2026-06-06T12:00:00.000Z");

/** Friday 2026-06-05 08:59 UTC — last minute of the last active VPS push window */
const FRI_CLOSE = new Date("2026-06-05T08:59:00.000Z");

/** Friday 2026-06-05 09:30 UTC — shortly after Friday window close (off-hours) */
const FRI_AFTER_CLOSE = new Date("2026-06-05T09:30:00.000Z");

/** Monday 2026-06-08 03:00 UTC — inside the Mon market window (02:00–08:59Z) */
const MON_03Z = new Date("2026-06-08T03:00:00.000Z");

/** Monday 2026-06-08 04:00 UTC — mid-session weekday */
const MON_04Z = new Date("2026-06-08T04:00:00.000Z");

/** Wednesday 2026-06-03 04:30 UTC — mid-session weekday */
const WED_04Z = new Date("2026-06-03T04:30:00.000Z");

// ─── HTTP mock ────────────────────────────────────────────────────────────────

function makeRes() {
  const res = {
    statusCode: 0,
    body: "",
    headers: {} as Record<string, string>,
    writeHead(code: number, headers: Record<string, string> = {}) {
      this.statusCode = code;
      Object.assign(this.headers, headers);
    },
    end(data = "") { this.body += data; },
  };
  return res;
}
const fakeReq = {} as IncomingMessage;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("FIX-SLA-WEEKEND-AWARE — domain: lastExpectedWindowEnd + minutesSinceLastWindowEnd", () => {

  it("W-6: lastExpectedWindowEnd on Saturday returns Friday 08:59Z", () => {
    // SAT_12Z is Saturday 12:00Z. Last trading session closed Friday 08:59Z.
    const end = lastExpectedWindowEnd(SAT_12Z);
    expect(end.toISOString()).toBe("2026-06-05T08:59:00.000Z");
  });

  it("W-6b: lastExpectedWindowEnd during Mon mid-session returns previous Fri 08:59Z", () => {
    // MON_03Z is inside the Monday window (02:00–08:59Z). The current window is OPEN,
    // so the PREVIOUS closed window was Friday 08:59Z.
    const end = lastExpectedWindowEnd(MON_03Z);
    expect(end.toISOString()).toBe("2026-06-05T08:59:00.000Z");
  });

  it("W-6c: lastExpectedWindowEnd just after Friday close returns Friday 08:59Z", () => {
    const end = lastExpectedWindowEnd(FRI_AFTER_CLOSE);
    expect(end.toISOString()).toBe("2026-06-05T08:59:00.000Z");
  });

  it("W-7: minutesSinceLastWindowEnd on Saturday ≈ (Sat 12:00 − Fri 08:59) in minutes", () => {
    // Sat 12:00Z − Fri 08:59Z = 27h 1m = 1621 min
    const minutes = minutesSinceLastWindowEnd(SAT_12Z);
    expect(minutes).toBe(1621);
  });

  it("W-7b: minutesSinceLastWindowEnd during Mon mid-session ≈ (Mon 03:00 − Fri 08:59) in minutes", () => {
    // Mon 03:00Z − Fri 08:59Z = 66h 1m = 3961 min
    const minutes = minutesSinceLastWindowEnd(MON_03Z);
    expect(minutes).toBe(3961);
  });
});

describe("FIX-SLA-WEEKEND-AWARE — domain: getSlaThreshold calendar awareness", () => {

  it("W-8: getSlaThreshold(price) off-hours >> 10 min (dynamic: sinceWindowEnd + 30)", () => {
    // Saturday 12:00Z — 1621 min since last window end → threshold = 1621 + 30 = 1651
    const threshold = getSlaThreshold("price", undefined, SAT_12Z);
    expect(threshold).toBeGreaterThan(1000);
    // Exact value: 1621 + 30 = 1651
    expect(threshold).toBe(1651);
  });

  it("W-9: getSlaThreshold(price) in-hours = 10 min", () => {
    const threshold = getSlaThreshold("price", undefined, WED_04Z);
    expect(threshold).toBe(10);
  });

  it("W-10: getSlaThreshold(foreign_flow) off-hours = same as price", () => {
    const thresholdPrice = getSlaThreshold("price", undefined, SAT_12Z);
    const thresholdFf = getSlaThreshold("foreign_flow", undefined, SAT_12Z);
    expect(thresholdFf).toBe(thresholdPrice);
  });

  it("MARKET_HOURS_ONLY_SOURCES contains price and foreign_flow", () => {
    expect(MARKET_HOURS_ONLY_SOURCES.has("price")).toBe(true);
    expect(MARKET_HOURS_ONLY_SOURCES.has("foreign_flow")).toBe(true);
    expect(MARKET_HOURS_ONLY_SOURCES.has("news")).toBe(false);
  });
});

describe("FIX-SLA-WEEKEND-AWARE — checkDataFreshnessSla off-hours gate", () => {

  it("W-1: Weekend (Saturday) — price age=1440min NOT breached (off-hours threshold >> 1440)", () => {
    // Saturday: 1440 min = 24h of age. Off-hours threshold = 1651 min. → ok.
    const ages = { ...BASE_AGES, price: 1440 };
    const result = checkDataFreshnessSla(ages, undefined, [], SAT_12Z);

    const priceBreach = result.breaches.find((b) => b.signalType === "price");
    expect(priceBreach).toBeUndefined(); // not breached on weekend
  });

  it("W-1b: Weekend (Saturday) — foreign_flow age=1440min NOT breached", () => {
    const ages = { ...BASE_AGES, foreign_flow: 1440 };
    const result = checkDataFreshnessSla(ages, undefined, [], SAT_12Z);

    const ffBreach = result.breaches.find((b) => b.signalType === "foreign_flow");
    expect(ffBreach).toBeUndefined();
  });

  it("W-2: Friday-close data (age=60min on Saturday) is healthy — NOT breached", () => {
    // Saturday 12:00Z. Last push was at Friday 08:59Z → age = 1621 min.
    // Simulate data that is 60 min old from Saturday 12:00 → pushed Sat 11:00Z.
    // That is AFTER the Friday window close but still well within off-hours threshold.
    const ages = { ...BASE_AGES, price: 60 };
    const result = checkDataFreshnessSla(ages, undefined, [], SAT_12Z);

    expect(result.breaches.find((b) => b.signalType === "price")).toBeUndefined();
  });

  it("W-2b: Data last pushed at Friday session close (age=1621min on Sat) is exactly at threshold edge — NOT breached", () => {
    // On SAT_12Z, minutesSinceLastWindowEnd = 1621. Threshold = 1621 + 30 = 1651.
    // age = 1621 ≤ 1651 → ok.
    const ages = { ...BASE_AGES, price: 1621 };
    const result = checkDataFreshnessSla(ages, undefined, [], SAT_12Z);

    expect(result.breaches.find((b) => b.signalType === "price")).toBeUndefined();
  });

  it("W-3: Monday 03:00Z — price age=3961min (since Fri 08:59Z) IS stale (window is open, 10-min SLA active)", () => {
    // MON_03Z is inside the Mon market window (isVnMarketHours=true).
    // Tight 10-min SLA applies. 3961-min-old Friday data breaches it → CRITICAL.
    expect(isVnMarketHours(MON_03Z)).toBe(true); // sanity check

    const ages = { ...BASE_AGES, price: 3961 };
    const result = checkDataFreshnessSla(ages, undefined, [], MON_03Z);

    const priceBreach = result.breaches.find((b) => b.signalType === "price");
    expect(priceBreach).toBeDefined();
    expect(priceBreach!.thresholdMinutes).toBe(10); // tight SLA during window
    expect(priceBreach!.severity).toBe("CRITICAL"); // 3961 >> 10 × 1.5
  });

  it("W-4: Mid-session (Wed 04:30Z) — price age=15min IS stale (10-min SLA, HIGH severity)", () => {
    expect(isVnMarketHours(WED_04Z)).toBe(true); // sanity check

    const ages = { ...BASE_AGES, price: 15 };
    const result = checkDataFreshnessSla(ages, undefined, [], WED_04Z);

    const priceBreach = result.breaches.find((b) => b.signalType === "price");
    expect(priceBreach).toBeDefined();
    expect(priceBreach!.thresholdMinutes).toBe(10);
    expect(priceBreach!.severity).toBe("HIGH"); // 15 > 10 but 15 < 15 (10×1.5) → actually 15 = 15 → CRITICAL
  });

  it("W-4b: Mid-session — price age=20min IS CRITICAL (>10×1.5)", () => {
    const ages = { ...BASE_AGES, price: 20 };
    const result = checkDataFreshnessSla(ages, undefined, [], WED_04Z);

    const priceBreach = result.breaches.find((b) => b.signalType === "price");
    expect(priceBreach).toBeDefined();
    expect(priceBreach!.severity).toBe("CRITICAL"); // 20 > 15 (10×1.5)
  });

  it("W-1c: Weekend — news/sbv_fx/bctc still use normal SLA (not market-hours-gated)", () => {
    // News: 60 min age, threshold = 30 → breached (news is not market-hours-only)
    const ages = { ...BASE_AGES, news: 60 };
    const result = checkDataFreshnessSla(ages, undefined, [], SAT_12Z);

    const newsBreach = result.breaches.find((b) => b.signalType === "news");
    expect(newsBreach).toBeDefined();
    expect(newsBreach!.thresholdMinutes).toBe(30);
  });
});

describe("FIX-SLA-WEEKEND-AWARE — vpsProxyHealthHandler off-hours field", () => {
  // Set up in-memory DB just for this group
  let initialized = false;

  async function ensureDb() {
    if (!initialized) {
      Bun.env["DB_PATH"] = ":memory:";
      closeDb();
      await initDatabase();
      initialized = true;
    }
    const db = getDb();
    try { db.exec("DELETE FROM vps_push_log"); } catch { /* ok */ }
    return db;
  }

  it("W-5a: prices off-hours (Saturday) — stale=false when last push is within off-hours threshold", async () => {
    const db = await ensureDb();
    // Push prices 30 min ago from Saturday 12:00Z → 1621+30 threshold >> 30 → not stale
    const pushAt = new Date(SAT_12Z.getTime() - 30 * 60_000).toISOString();
    db.prepare(
      "INSERT INTO vps_push_log (service, items_count, status, pushed_at) VALUES (?, ?, ?, ?)"
    ).run("prices", 50, "ok", pushAt);

    const res = makeRes();
    handleVpsProxyHealth(fakeReq, res as unknown as ServerResponse, db, SAT_12Z);

    const body = JSON.parse(res.body) as { services: Array<{ name: string; stale: boolean; off_hours: boolean }> };
    const prices = body.services.find((s) => s.name === "prices")!;
    expect(prices.stale).toBe(false); // off-hours threshold allows up to 1651 min
    expect(prices.off_hours).toBe(true); // market-hours-only flag
  });

  it("W-5b: prices on-hours (Wed 04:30Z) — stale=true when last push is 30 min ago", async () => {
    const db = await ensureDb();
    const pushAt = new Date(WED_04Z.getTime() - 30 * 60_000).toISOString();
    db.prepare(
      "INSERT INTO vps_push_log (service, items_count, status, pushed_at) VALUES (?, ?, ?, ?)"
    ).run("prices", 50, "ok", pushAt);

    const res = makeRes();
    handleVpsProxyHealth(fakeReq, res as unknown as ServerResponse, db, WED_04Z);

    const body = JSON.parse(res.body) as { services: Array<{ name: string; stale: boolean; off_hours: boolean }> };
    const prices = body.services.find((s) => s.name === "prices")!;
    expect(prices.stale).toBe(true); // 30 min > 5 min threshold during market hours
    expect(prices.off_hours).toBe(false); // window is active
  });

  it("W-5c: prices with NO push on Saturday — stale=true (no data is always stale regardless)", async () => {
    const db = await ensureDb();
    // No push inserted for prices → last_push = null → always stale
    const res = makeRes();
    handleVpsProxyHealth(fakeReq, res as unknown as ServerResponse, db, SAT_12Z);

    const body = JSON.parse(res.body) as { services: Array<{ name: string; stale: boolean; off_hours: boolean }> };
    const prices = body.services.find((s) => s.name === "prices")!;
    expect(prices.stale).toBe(true); // null last_push = always stale
    expect(prices.off_hours).toBe(true); // still flagged as off-hours period
  });

  it("W-5d: prices on Saturday with push OLDER than last window (1700min ago) — stale=true", async () => {
    const db = await ensureDb();
    // Push was 1700 min ago. On SAT_12Z threshold = 1651 min. 1700 > 1651 → stale.
    const pushAt = new Date(SAT_12Z.getTime() - 1700 * 60_000).toISOString();
    db.prepare(
      "INSERT INTO vps_push_log (service, items_count, status, pushed_at) VALUES (?, ?, ?, ?)"
    ).run("prices", 50, "ok", pushAt);

    const res = makeRes();
    handleVpsProxyHealth(fakeReq, res as unknown as ServerResponse, db, SAT_12Z);

    const body = JSON.parse(res.body) as { services: Array<{ name: string; stale: boolean; off_hours: boolean }> };
    const prices = body.services.find((s) => s.name === "prices")!;
    expect(prices.stale).toBe(true); // 1700 > 1651 threshold → genuinely stale even off-hours
  });
});
