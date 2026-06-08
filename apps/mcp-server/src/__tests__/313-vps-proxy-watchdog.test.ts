/**
 * Task — VPS Price Proxy Freshness Watchdog (observe-only alert).
 *
 * Covers:
 *   - isVnMarketHoursUtc: weekday / weekend / hour edges
 *   - Off-hours short-circuit never sends a notification
 *   - Stale prices trigger a single alert with operator instructions
 *   - Cooldown deduplicates back-to-back runs during the same outage
 */

// Test isolation: logger must not hit the production DB.
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  isVnMarketHoursUtc,
  runVpsProxyWatchdog,
  _resetWatchdogCooldown,
} from "../scheduler/vpsProxyWatchdogJob.js";

describe("VPS proxy freshness watchdog", () => {
  beforeEach(() => {
    _resetWatchdogCooldown();
  });

  describe("isVnMarketHoursUtc", () => {
    it("true on Monday 03:00 UTC (10:00 VN)", () => {
      expect(isVnMarketHoursUtc(new Date("2026-04-06T03:00:00Z"))).toBe(true);
    });

    it("false on Saturday 03:00 UTC", () => {
      expect(isVnMarketHoursUtc(new Date("2026-04-11T03:00:00Z"))).toBe(false);
    });

    it("false on Monday 15:00 UTC (22:00 VN)", () => {
      expect(isVnMarketHoursUtc(new Date("2026-04-06T15:00:00Z"))).toBe(false);
    });

    it("true on Monday 08:30 UTC (15:30 VN — market-close edge)", () => {
      expect(isVnMarketHoursUtc(new Date("2026-04-06T08:30:00Z"))).toBe(true);
    });
  });

  describe("runVpsProxyWatchdog", () => {
    it("off-hours returns 'off-hours' even when table is empty (no false alarm outside market)", async () => {
      const calls: string[] = [];
      const status = await runVpsProxyWatchdog({
        now: new Date("2026-04-06T15:00:00Z"), // 22:00 VN — off-hours
        notify: async (m) => {
          calls.push(m);
          return true;
        },
      });
      expect(status).toBe("off-hours");
      expect(calls.length).toBe(0); // no spam during off-hours
    });

    it("sends alert when market_prices is stale (empty table → infinite age)", async () => {
      const calls: string[] = [];
      const status = await runVpsProxyWatchdog({
        now: new Date("2026-04-06T03:00:00Z"),
        notify: async (m) => {
          calls.push(m);
          return true;
        },
      });
      expect(status).toBe("alert-sent");
      expect(calls.length).toBe(1);
      expect(calls[0]).toContain("Stale data detected");
      expect(calls[0]).toContain("systemctl status vn-price-fetch");
      expect(calls[0]).toContain("deploy-vinahost.sh");
    });

    it("dedups a second stale call within the cooldown window", async () => {
      const calls: string[] = [];
      const notify = async (m: string) => {
        calls.push(m);
        return true;
      };

      const first = await runVpsProxyWatchdog({
        now: new Date("2026-04-06T03:00:00Z"),
        notify,
      });
      const second = await runVpsProxyWatchdog({
        now: new Date("2026-04-06T03:10:00Z"), // 10 min later
        notify,
      });

      expect(first).toBe("alert-sent");
      expect(second).toBe("cooldown");
      expect(calls.length).toBe(1);
    });

    it("off-hours with empty table is still off-hours (user feedback: no false alarm at 01:30 UTC)", async () => {
      const calls: string[] = [];
      const status = await runVpsProxyWatchdog({
        now: new Date("2026-04-06T15:00:00Z"), // 22:00 VN — off-hours
        notify: async (m) => {
          calls.push(m);
          return true;
        },
      });
      expect(status).toBe("off-hours");
      expect(calls.length).toBe(0);
    });

    it("returns 'notify-failed' when the notifier returns false", async () => {
      const status = await runVpsProxyWatchdog({
        now: new Date("2026-04-06T03:00:00Z"),
        notify: async () => false,
      });
      expect(status).toBe("notify-failed");
    });
  });
});
