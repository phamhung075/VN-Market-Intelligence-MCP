/**
 * FACTORY-APP-dedup-date-freshness-helpers — centralized helper tests
 *
 * Covers the 4 helpers that were duplicated across assembleBriefing.ts,
 * assembleEveningSummary.ts, and assembleAlertDigest.ts, now centralized to
 * one home each:
 *   - midnightVietnamAsUtc / todayVietnam  → domain/services/timeHelpers.ts
 *   - parseAffectedCodes                   → domain/utils/affectedCodesParser.ts
 *   - isPriceFresh                         → application/utils/priceFreshnessGate.ts
 *     (now takes db + a per-caller log label, and uses the named
 *     PRICE_FRESHNESS_MS constant instead of a bare `<=24` literal)
 *
 * Call-site regression coverage (assembleBriefing/assembleEveningSummary still
 * producing correct `date` fields and suppression behavior) is covered by the
 * existing 105-job-evening-summary.test.ts / 125-test-e2e-briefing.test.ts /
 * 188-alert-digest.test.ts suites — this file covers the extracted helpers
 * in isolation.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getDb, initDatabase, closeDb } from "../infrastructure/db/schema.js";
import { midnightVietnamAsUtc, todayVietnam } from "../domain/services/timeHelpers.js";
import { parseAffectedCodes } from "../domain/utils/affectedCodesParser.js";
import { isPriceFresh } from "../application/utils/priceFreshnessGate.js";
import { PRICE_FRESHNESS_MS, MS_PER_HOUR } from "../domain/services/timeConstants.js";

describe("FACTORY-APP-dedup-date-freshness-helpers — timeHelpers", () => {
  it("todayVietnam returns a YYYY-MM-DD string", () => {
    expect(todayVietnam()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("midnightVietnamAsUtc returns an ISO 8601 UTC string", () => {
    const midnight = midnightVietnamAsUtc();
    expect(midnight).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("midnightVietnamAsUtc is exactly 7h before UTC midnight of the VN calendar date", () => {
    const midnight = new Date(midnightVietnamAsUtc());
    // Shifting the returned UTC instant forward by 7h must land on 00:00:00 VN-local
    const vnLocal = new Date(midnight.getTime() + 7 * 3_600_000);
    expect(vnLocal.getUTCHours()).toBe(0);
    expect(vnLocal.getUTCMinutes()).toBe(0);
    expect(vnLocal.getUTCSeconds()).toBe(0);
  });

  it("todayVietnam matches the VN calendar date encoded in midnightVietnamAsUtc", () => {
    const midnight = new Date(midnightVietnamAsUtc());
    const vnLocal = new Date(midnight.getTime() + 7 * 3_600_000);
    const y = vnLocal.getUTCFullYear();
    const m = String(vnLocal.getUTCMonth() + 1).padStart(2, "0");
    const d = String(vnLocal.getUTCDate()).padStart(2, "0");
    expect(todayVietnam()).toBe(`${y}-${m}-${d}`);
  });
});

describe("FACTORY-APP-dedup-date-freshness-helpers — parseAffectedCodes", () => {
  it("returns [] for null input", () => {
    expect(parseAffectedCodes(null)).toEqual([]);
  });

  it("returns [] for unparseable JSON", () => {
    expect(parseAffectedCodes("{not json")).toEqual([]);
  });

  it("returns [] for a non-array JSON value", () => {
    expect(parseAffectedCodes('{"code":"VCB"}')).toEqual([]);
  });

  it("parses a plain string-array format", () => {
    expect(parseAffectedCodes('["VCB","FPT"]')).toEqual(["VCB", "FPT"]);
  });

  it("parses an object-array format with a code field", () => {
    expect(parseAffectedCodes('[{"code":"VCB"},{"code":"FPT"}]')).toEqual(["VCB", "FPT"]);
  });

  it("drops entries that are neither a string nor an object with a code field", () => {
    expect(parseAffectedCodes('["VCB", 42, null, {"code":"FPT"}]')).toEqual(["VCB", "FPT"]);
  });
});

describe("FACTORY-APP-dedup-date-freshness-helpers — isPriceFresh", () => {
  beforeEach(async () => {
    closeDb();
    Bun.env["DB_PATH"] = ":memory:";
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("PRICE_FRESHNESS_MS is exactly 24h in milliseconds (named constant, no bare literal)", () => {
    expect(PRICE_FRESHNESS_MS).toBe(24 * MS_PER_HOUR);
  });

  it("returns true when daily_ohlcv.updated_at is well within the freshness window", async () => {
    const db = getDb();
    const recent = new Date(Date.now() - 1 * 3_600_000).toISOString();
    db.prepare(
      "INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run("VNM", "2026-07-08", 100, 101, 99, 100, 1000, recent);

    const fresh = await isPriceFresh(db, "briefing");
    expect(fresh).toBe(true);
  });

  it("returns false when daily_ohlcv.updated_at is older than the freshness window", async () => {
    const db = getDb();
    const stale = new Date(Date.now() - 30 * 3_600_000).toISOString();
    db.prepare(
      "INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run("VNM", "2026-07-06", 100, 101, 99, 100, 1000, stale);

    const fresh = await isPriceFresh(db, "evening summary");
    expect(fresh).toBe(false);
  });

  it("returns false when daily_ohlcv has no rows at all", async () => {
    const db = getDb();
    const fresh = await isPriceFresh(db, "briefing");
    expect(fresh).toBe(false);
  });

  it("accepts distinct log labels for distinct callers without changing return-value behavior", async () => {
    const db = getDb();
    const recent = new Date(Date.now() - 1 * 3_600_000).toISOString();
    db.prepare(
      "INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run("VNM", "2026-07-08", 100, 101, 99, 100, 1000, recent);

    const freshBriefing = await isPriceFresh(db, "briefing");
    const freshEvening = await isPriceFresh(db, "evening summary");
    expect(freshBriefing).toBe(true);
    expect(freshEvening).toBe(true);
  });
});
