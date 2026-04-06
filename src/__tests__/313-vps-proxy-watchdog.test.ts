/**
 * Task 312 — VPS Price Proxy Watchdog
 *
 * Self-heal scheduler that detects stale market_prices and re-installs the
 * Vultr crontab over SSH. See src/scheduler/vpsProxyWatchdogJob.ts.
 */

// Test isolation: logger must not hit production DB.
process.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import {
  isVnMarketHoursUtc,
  runVpsProxyWatchdog,
} from "../scheduler/vpsProxyWatchdogJob.js";

describe("Task 312 — VPS proxy watchdog", () => {
  beforeEach(() => {
    process.env["VULTR_IP"] = "10.0.0.1";
    process.env["VULTR_PASSWORD"] = "secret";
    process.env["VULTR_USERNAME"] = "root";
  });

  describe("isVnMarketHoursUtc", () => {
    it("returns true on Monday 03:00 UTC (10:00 VN)", () => {
      // 2026-04-06 is a Monday
      expect(isVnMarketHoursUtc(new Date("2026-04-06T03:00:00Z"))).toBe(true);
    });

    it("returns false on Saturday 03:00 UTC", () => {
      expect(isVnMarketHoursUtc(new Date("2026-04-11T03:00:00Z"))).toBe(false);
    });

    it("returns false on Monday 15:00 UTC (22:00 VN, off-hours)", () => {
      expect(isVnMarketHoursUtc(new Date("2026-04-06T15:00:00Z"))).toBe(false);
    });

    it("returns true on Monday 08:30 UTC (15:30 VN — market close edge)", () => {
      expect(isVnMarketHoursUtc(new Date("2026-04-06T08:30:00Z"))).toBe(true);
    });
  });

  describe("runVpsProxyWatchdog", () => {
    it("returns 'off-hours' outside VN market hours without touching SSH", async () => {
      let sshCalls = 0;
      const status = await runVpsProxyWatchdog({
        now: new Date("2026-04-06T15:00:00Z"), // 22:00 VN
        sshExec: async () => {
          sshCalls++;
          return "";
        },
        notify: async () => true,
      });
      expect(status).toBe("off-hours");
      expect(sshCalls).toBe(0);
    });

    it("returns 'missing-credentials' when env vars are absent", async () => {
      delete process.env["VULTR_IP"];
      delete process.env["VULTR_PASSWORD"];

      // Force "stale" by using far-future now — readLatestPriceTimestamp()
      // hits an in-memory DB that has no market_prices rows → infinity age.
      const status = await runVpsProxyWatchdog({
        now: new Date("2026-04-06T03:00:00Z"),
        sshExec: async () => "",
        notify: async () => true,
      });
      expect(status).toBe("missing-credentials");
    });

    it("heals by calling ssh + notify when prices are stale", async () => {
      const sshCalls: string[] = [];
      const notifyCalls: string[] = [];

      const status = await runVpsProxyWatchdog({
        now: new Date("2026-04-13T03:00:00Z"), // fresh cooldown (new week)
        sshExec: async (cmd: string) => {
          sshCalls.push(cmd);
          if (cmd.includes("test -x")) return "present\n";
          if (cmd.includes("crontab")) return "* 2-8 * * 1-5 /root/fetch-prices.sh\n";
          if (cmd.includes("fetch-prices.sh")) return "PUSH: 61 items\n";
          return "";
        },
        notify: async (msg: string) => {
          notifyCalls.push(msg);
          return true;
        },
      });

      expect(status).toBe("healed");
      // Script presence probe + crontab reinstall + immediate test run = 3 ssh calls.
      expect(sshCalls.length).toBeGreaterThanOrEqual(3);
      expect(sshCalls.some((c) => c.includes("test -x"))).toBe(true);
      expect(sshCalls.some((c) => c.includes("crontab"))).toBe(true);
      expect(notifyCalls.length).toBe(1);
      expect(notifyCalls[0]).toContain("restored");
    });

    it("returns 'script-missing' and notifies when fetch-prices.sh is absent", async () => {
      const notifyCalls: string[] = [];

      const status = await runVpsProxyWatchdog({
        now: new Date("2026-04-20T03:00:00Z"), // different week → past cooldown
        sshExec: async (cmd: string) => {
          if (cmd.includes("test -x")) return "missing\n";
          return "";
        },
        notify: async (msg: string) => {
          notifyCalls.push(msg);
          return true;
        },
      });

      expect(status).toBe("script-missing");
      expect(notifyCalls.length).toBe(1);
      expect(notifyCalls[0]).toContain("not found");
    });
  });
});
