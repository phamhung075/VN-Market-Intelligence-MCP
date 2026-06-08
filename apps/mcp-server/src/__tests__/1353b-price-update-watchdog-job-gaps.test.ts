/**
 * TASK_1353b — priceUpdateWatchdogJob gap-fill tests
 *
 * Covers paths not reached by 229-price-staleness-watchdog.test.ts,
 * 240-price-pipeline-recovery.test.ts, or 317-telegram-routing-bugs.test.ts:
 *   1–3. isVnMarketHoursUtc boundary: Sunday, 09:00 post-close, Friday mid-session
 *   4.   Future timestamp (now + 60s) → priceAgeMs negative → treated as fresh → "ok"
 *   5.   notify returns false (not throw) → "notify-failed"
 *   6.   readPrice returns null → Infinity age → "alert-sent"
 *   7.   SSH in-cooldown: second stale call within 6h → sshStatus "in-cooldown" in message
 *   8.   notifyUser throws during recovery → job returns "restored", does not re-throw
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { VN_OFFSET_MS } from "../domain/services/timeConstants.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  priceUpdateWatchdog,
  isVnMarketHoursUtc,
  _resetWatchdogCooldown,
  _resetWatchdogStaleFlag,
  _resetSshCooldown,
} from "../scheduler/market-data/priceUpdateWatchdogJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

// Wednesday 2026-04-29T05:00:00Z — market hours (Mon-Fri 02:00-08:59 UTC)
const MARKET_NOW = new Date("2026-04-29T05:00:00Z");

function stalePrice(now: Date): () => Date | null {
  return () => new Date(now.getTime() - VN_OFFSET_MS);
}

function freshPrice(now: Date): () => Date | null {
  return () => new Date(now.getTime() - 1 * 60 * 60 * 1000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests 1–3: isVnMarketHoursUtc boundary cases (pure helper)
// ─────────────────────────────────────────────────────────────────────────────

describe("1353b — isVnMarketHoursUtc boundary cases", () => {
  it("1. Sunday 04:00 UTC → false (weekend)", () => {
    // Sunday = getUTCDay() === 0
    const sunday = new Date("2026-04-26T04:00:00Z"); // Sunday
    expect(isVnMarketHoursUtc(sunday)).toBe(false);
  });

  it("2. Monday 09:00 UTC → false (post-close boundary, hour 9 > 8)", () => {
    // MARKET_HOURS_END = 8 (inclusive), so 09:00 is outside
    const monday9am = new Date("2026-04-28T09:00:00Z"); // Monday
    expect(isVnMarketHoursUtc(monday9am)).toBe(false);
  });

  it("3. Friday 08:00 UTC → true (last valid weekday, within hours 2–8 inclusive)", () => {
    // Friday = getUTCDay() === 5, hour 8 === MARKET_HOURS_END
    const friday8am = new Date("2026-05-01T08:00:00Z"); // Friday
    expect(isVnMarketHoursUtc(friday8am)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests 4–8: priceUpdateWatchdog functional gaps
// ─────────────────────────────────────────────────────────────────────────────

describe("1353b — priceUpdateWatchdog functional gaps", () => {
  beforeEach(() => {
    _resetWatchdogCooldown();
    _resetWatchdogStaleFlag();
    _resetSshCooldown();
  });

  it("4. Future timestamp (now + 60s) → priceAgeMs negative → treated as fresh → returns 'ok'", async () => {
    // Negative age: now.getTime() - future.getTime() < 0
    // 0 <= STALE_THRESHOLD_MS (positive), so code takes the fresh path → "ok"
    const futurePrice = () => new Date(MARKET_NOW.getTime() + 60 * 1000);
    const result = await priceUpdateWatchdog({
      now: MARKET_NOW,
      readPrice: futurePrice,
      notify: async () => true,
      notifyUser: async () => undefined,
    });
    expect(result).toBe("ok");
  });

  it("5. notify returns false → 'notify-failed'", async () => {
    const result = await priceUpdateWatchdog({
      now: MARKET_NOW,
      readPrice: stalePrice(MARKET_NOW),
      notify: async () => false,
      notifyUser: async () => undefined,
    });
    expect(result).toBe("notify-failed");
  });

  it("6. readPrice returns null → Infinity age → 'alert-sent' + notify called", async () => {
    let notifyCalled = false;
    const result = await priceUpdateWatchdog({
      now: MARKET_NOW,
      readPrice: () => null,
      notify: async (_msg: string) => {
        notifyCalled = true;
        return true;
      },
      notifyUser: async () => undefined,
    });
    expect(result).toBe("alert-sent");
    expect(notifyCalled).toBe(true);
  });

  it("7. Second stale call within 6h → SSH in-cooldown → work message contains 'in-cooldown'", async () => {
    const messages: string[] = [];

    // First call — SSH attempt will be made (lastSshAttemptAt === 0)
    await priceUpdateWatchdog({
      now: MARKET_NOW,
      readPrice: stalePrice(MARKET_NOW),
      notify: async (msg: string) => {
        messages.push(msg);
        return true;
      },
      notifyUser: async () => undefined,
    });

    // Reset only the alert cooldown so the second call is not blocked by it,
    // but do NOT reset SSH cooldown — simulates second call within 6h SSH window
    _resetWatchdogCooldown();

    // Second call — lastSshAttemptAt is still set from first call
    // now is within SSH_COOLDOWN_MS (6h) → sshStatus becomes "in-cooldown"
    const secondNow = new Date(MARKET_NOW.getTime() + 5 * 60 * 1000); // 5 min later
    await priceUpdateWatchdog({
      now: secondNow,
      readPrice: stalePrice(secondNow),
      notify: async (msg: string) => {
        messages.push(msg);
        return true;
      },
      notifyUser: async () => undefined,
    });

    expect(messages.length).toBe(2);
    expect(messages[1]).toContain("in-cooldown");
  });

  it("8. notifyUser throws during recovery → job returns 'restored', does not re-throw", async () => {
    // Establish prior stale state: set lastWasStale = true via one alert cycle
    await priceUpdateWatchdog({
      now: MARKET_NOW,
      readPrice: stalePrice(MARKET_NOW),
      notify: async () => true,
      notifyUser: async () => undefined,
    });

    // Now call with fresh prices → enters recovery path → notifyUser throws
    const result = await priceUpdateWatchdog({
      now: MARKET_NOW,
      readPrice: freshPrice(MARKET_NOW),
      notify: async () => true,
      notifyUser: async () => {
        throw new Error("Telegram outage");
      },
    });

    // Error is swallowed in catch block; job returns "restored"
    expect(result).toBe("restored");
  });
});
