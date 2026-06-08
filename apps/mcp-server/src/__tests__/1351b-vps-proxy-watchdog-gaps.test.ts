/**
 * Task 1351b — vpsProxyWatchdogJob gap-fill tests
 *
 * Covers paths not exercised by 313-vps-proxy-watchdog.test.ts:
 *   - Restored path (stale → fresh transition)
 *   - notify throws → "notify-failed"
 *   - _resetWatchdogStaleFlag resets lastWasStale independently
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  runVpsProxyWatchdog,
  _resetWatchdogCooldown,
  _resetWatchdogStaleFlag,
} from "../scheduler/vpsProxyWatchdogJob.js";

// Market-hours instant (Monday 03:00 UTC)
const MARKET_NOW = new Date("2026-04-06T03:00:00Z");

// Returns a reader that returns a timestamp `ageMs` milliseconds before `now`
function tsAgo(now: Date, ageMs: number): () => Date | null {
  return () => new Date(now.getTime() - ageMs);
}

// Fresh reader — age 0ms (never stale)
function fresh(now: Date): () => Date | null {
  return tsAgo(now, 0);
}

// All readers return fresh except those explicitly overridden
function freshReaders(now: Date) {
  return {
    readPrice: fresh(now),
    readNews: fresh(now),
    readOhlcv: tsAgo(now, 0), // OHLCV stale threshold is 26h — age 0 is always fresh
    readForeignFlow: fresh(now),
  };
}

describe("Task 1351b — vpsProxyWatchdogJob gap tests", () => {
  beforeEach(() => {
    _resetWatchdogCooldown();
    _resetWatchdogStaleFlag();
  });

  // ---------------------------------------------------------------------------
  describe("restored path", () => {
    it("all sources fresh after a stale run → 'restored', then 'ok' on next fresh run", async () => {
      // Run 1: all stale (empty DB readers) → alert-sent, sets lastWasStale = true
      const run1 = await runVpsProxyWatchdog({
        now: MARKET_NOW,
        notify: async () => true,
        // Default readers hit :memory: DB — all return null (stale)
      });
      expect(run1).toBe("alert-sent");

      // Clear cooldown so run 2 is not blocked by 30-min gate
      _resetWatchdogCooldown();
      // Re-set lastWasStale to true (resetCooldown also resets it — manually set via a stale run)
      // We need lastWasStale = true before run 2. Run another stale pass.
      const staleAgain = await runVpsProxyWatchdog({
        now: MARKET_NOW,
        notify: async () => true,
      });
      expect(staleAgain).toBe("alert-sent");

      // Clear only the cooldown timer (not lastWasStale) so run 2 can proceed
      // _resetWatchdogCooldown resets both, so we simulate by resetting cooldown only
      // via a 31-min later timestamp (past the 30-min ALERT_COOLDOWN_MS)
      const run2Now = new Date(MARKET_NOW.getTime() + 31 * 60_000);
      const run2 = await runVpsProxyWatchdog({
        now: run2Now,
        notify: async () => true,
        ...freshReaders(run2Now),
      });
      expect(run2).toBe("restored");

      // Run 3: still all fresh → "ok" (not "restored" again)
      const run3Now = new Date(MARKET_NOW.getTime() + 32 * 60_000);
      const run3 = await runVpsProxyWatchdog({
        now: run3Now,
        notify: async () => true,
        ...freshReaders(run3Now),
      });
      expect(run3).toBe("ok");
    });
  });

  // ---------------------------------------------------------------------------
  describe("notify throws", () => {
    it("notify throws → notify-failed, does not crash", async () => {
      const result = await runVpsProxyWatchdog({
        now: MARKET_NOW,
        notify: async () => {
          throw new Error("Telegram timeout");
        },
        // Use default readers (hit :memory: DB → null → stale) to trigger notify path
      });
      expect(result).toBe("notify-failed");
    });
  });

  // ---------------------------------------------------------------------------
  describe("_resetWatchdogStaleFlag", () => {
    it("_resetWatchdogStaleFlag resets lastWasStale independently of lastAlertAt", async () => {
      // Run 1: stale → alert-sent (sets lastWasStale=true, lastAlertAt=now)
      const run1 = await runVpsProxyWatchdog({
        now: MARKET_NOW,
        notify: async () => true,
      });
      expect(run1).toBe("alert-sent");

      // Reset only lastWasStale — do NOT reset cooldown (lastAlertAt stays)
      _resetWatchdogStaleFlag();

      // Run 2: within cooldown window (5 min later), all fresh
      // Since lastWasStale was reset to false, "restored" should NOT be returned.
      // But we are within cooldown → should return "cooldown".
      // This confirms lastWasStale was truly reset (not "restored") while lastAlertAt is intact.
      const run2Now = new Date(MARKET_NOW.getTime() + 5 * 60_000);
      const run2 = await runVpsProxyWatchdog({
        now: run2Now,
        notify: async () => true,
        ...freshReaders(run2Now),
      });
      // All fresh → stale.length === 0 → check lastWasStale (false after reset) → "ok"
      // Cooldown only applies when stale.length > 0, so with fresh readers we hit the
      // "stale.length === 0" branch. lastWasStale is false → returns "ok" (not "restored").
      expect(run2).toBe("ok");
    });
  });
});
