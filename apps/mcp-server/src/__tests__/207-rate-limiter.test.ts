/**
 * Task 207 — Per-source API rate limiting
 *
 * Tests for RateLimiter domain service.
 * Uses fake clock (manual Date injection) to avoid real waits.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { RateLimiter, DEFAULT_INTERVALS } from "../domain/services/rateLimiter.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a RateLimiter with a controllable clock. */
function makeRateLimiter(nowMs?: number) {
  let _now = nowMs ?? 0;
  const clock = {
    now: () => _now,
    advance: (ms: number) => { _now += ms; },
  };
  const rl = new RateLimiter(undefined, clock.now);
  return { rl, clock };
}

// ---------------------------------------------------------------------------
// DEFAULT_INTERVALS export
// ---------------------------------------------------------------------------

describe("Task 207 — RateLimiter", () => {

  describe("DEFAULT_INTERVALS", () => {
    it("exports a record with known hosts", () => {
      expect(DEFAULT_INTERVALS["cafef.vn"]).toBe(8000);
      expect(DEFAULT_INTERVALS["api-finfo.vndirect.com.vn"]).toBe(5000);
      expect(DEFAULT_INTERVALS["api.hnx.vn"]).toBe(5000);
      expect(DEFAULT_INTERVALS["query1.finance.yahoo.com"]).toBe(5000);
      expect(DEFAULT_INTERVALS["tradingeconomics.com"]).toBe(10000);
      expect(DEFAULT_INTERVALS["portal.vietcombank.com.vn"]).toBe(10000);
      expect(DEFAULT_INTERVALS["clob.polymarket.com"]).toBe(10000);
      expect(DEFAULT_INTERVALS["gamma-api.polymarket.com"]).toBe(10000);
    });

    it("has at least 8 host entries", () => {
      expect(Object.keys(DEFAULT_INTERVALS).length).toBeGreaterThanOrEqual(8);
    });

    it("includes vnexpress.net and vneconomy.vn entries", () => {
      expect(DEFAULT_INTERVALS["vnexpress.net"]).toBeGreaterThan(0);
      expect(DEFAULT_INTERVALS["vneconomy.vn"]).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // canCall — first call
  // ---------------------------------------------------------------------------

  describe("canCall()", () => {
    it("returns true before the first call to a host", () => {
      const { rl } = makeRateLimiter();
      expect(rl.canCall("cafef.vn")).toBe(true);
    });

    it("returns false immediately after recordCall()", () => {
      const { rl } = makeRateLimiter(1_000_000);
      rl.recordCall("cafef.vn");
      expect(rl.canCall("cafef.vn")).toBe(false);
    });

    it("returns true after the full cooldown has passed", () => {
      const { rl, clock } = makeRateLimiter(1_000_000);
      rl.recordCall("cafef.vn"); // interval = 8000ms
      clock.advance(8001);
      expect(rl.canCall("cafef.vn")).toBe(true);
    });

    it("returns false when only partial cooldown has passed", () => {
      const { rl, clock } = makeRateLimiter(1_000_000);
      rl.recordCall("cafef.vn"); // interval = 8000ms
      clock.advance(4000);
      expect(rl.canCall("cafef.vn")).toBe(false);
    });

    it("different hosts are independent — one limited does not block others", () => {
      const { rl } = makeRateLimiter(1_000_000);
      rl.recordCall("cafef.vn");
      // api-finfo.vndirect has never been called → should be ready
      expect(rl.canCall("api-finfo.vndirect.com.vn")).toBe(true);
    });

    it("returns true for unknown hosts (no configured limit)", () => {
      const { rl } = makeRateLimiter(1_000_000);
      rl.recordCall("unknown.example.com");
      // No interval configured → always allowed
      expect(rl.canCall("unknown.example.com")).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // getWaitMs
  // ---------------------------------------------------------------------------

  describe("getWaitMs()", () => {
    it("returns 0 before the first call", () => {
      const { rl } = makeRateLimiter();
      expect(rl.getWaitMs("cafef.vn")).toBe(0);
    });

    it("returns the remaining wait time immediately after recordCall", () => {
      const { rl } = makeRateLimiter(1_000_000);
      rl.recordCall("cafef.vn"); // interval = 8000ms
      const wait = rl.getWaitMs("cafef.vn");
      expect(wait).toBeGreaterThan(0);
      expect(wait).toBeLessThanOrEqual(8000);
    });

    it("returns 0 after full cooldown", () => {
      const { rl, clock } = makeRateLimiter(1_000_000);
      rl.recordCall("cafef.vn");
      clock.advance(8001);
      expect(rl.getWaitMs("cafef.vn")).toBe(0);
    });

    it("returns exact remaining ms partway through cooldown", () => {
      const { rl, clock } = makeRateLimiter(1_000_000);
      rl.recordCall("cafef.vn"); // interval = 8000ms
      clock.advance(3000);
      expect(rl.getWaitMs("cafef.vn")).toBe(5000);
    });

    it("returns 0 for unknown host after a call", () => {
      const { rl } = makeRateLimiter(1_000_000);
      rl.recordCall("unknown.host");
      expect(rl.getWaitMs("unknown.host")).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // recordCall
  // ---------------------------------------------------------------------------

  describe("recordCall()", () => {
    it("updates last-call timestamp so subsequent canCall returns false", () => {
      const { rl, clock } = makeRateLimiter(1_000_000);
      rl.recordCall("tradingeconomics.com"); // interval = 10000ms
      clock.advance(5000); // half-way
      expect(rl.canCall("tradingeconomics.com")).toBe(false);
      clock.advance(5001); // past full interval
      expect(rl.canCall("tradingeconomics.com")).toBe(true);
    });

    it("second recordCall resets the cooldown window", () => {
      const { rl, clock } = makeRateLimiter(1_000_000);
      rl.recordCall("cafef.vn"); // t=0
      clock.advance(8001);       // t=8001 → canCall=true
      expect(rl.canCall("cafef.vn")).toBe(true);

      rl.recordCall("cafef.vn"); // reset window at t=8001
      clock.advance(4000);       // t=12001 → only 4s into 8s window
      expect(rl.canCall("cafef.vn")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Custom config injection
  // ---------------------------------------------------------------------------

  describe("custom config injection", () => {
    it("uses injected config intervals over defaults", () => {
      let _now = 1_000_000;
      const rl = new RateLimiter({ "custom.api": 2000 }, () => _now);
      rl.recordCall("custom.api");
      _now += 2001;
      expect(rl.canCall("custom.api")).toBe(true);
    });

    it("custom config with 0 interval always allows calls", () => {
      let _now = 1_000_000;
      const rl = new RateLimiter({ "fast.api": 0 }, () => _now);
      rl.recordCall("fast.api");
      expect(rl.canCall("fast.api")).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // getStatus — for the MCP tool
  // ---------------------------------------------------------------------------

  describe("getStatus()", () => {
    it("returns empty array when no calls have been made", () => {
      const { rl } = makeRateLimiter();
      expect(rl.getStatus()).toEqual([]);
    });

    it("returns one entry after one host is called", () => {
      const { rl } = makeRateLimiter(1_000_000);
      rl.recordCall("cafef.vn");
      const status = rl.getStatus();
      expect(status).toHaveLength(1);
      const entry = status[0]!;
      expect(entry.host).toBe("cafef.vn");
      expect(entry.lastCallMs).toBe(1_000_000);
      expect(entry.waitMs).toBeGreaterThan(0);
      expect(entry.ready).toBe(false);
    });

    it("entry shows ready=true after cooldown", () => {
      const { rl, clock } = makeRateLimiter(1_000_000);
      rl.recordCall("cafef.vn");
      clock.advance(8001);
      const status = rl.getStatus();
      const entry = status[0]!;
      expect(entry.ready).toBe(true);
      expect(entry.waitMs).toBe(0);
    });
  });
});
