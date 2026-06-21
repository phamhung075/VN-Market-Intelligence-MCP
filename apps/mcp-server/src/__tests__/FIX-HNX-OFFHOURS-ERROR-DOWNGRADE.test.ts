/**
 * FIX-HNX-OFFHOURS-ERROR-DOWNGRADE
 *
 * Verifies that fetchHnxPrices() and fetchUpcomPrices() downgrade the
 * "all sources failed" log from ERROR to DEBUG when the market is closed
 * (off-hours), and keep it at ERROR when the market is open.
 *
 * Clock is injected via options.now so tests are deterministic (no wall-clock
 * dependency). All HTTP calls are mocked — no real network traffic.
 *
 * Log-level assertions strategy:
 * - The logger singleton is created at module-load time with minLevel='info'
 *   (from loadConfig). Debug-level messages are filtered before reaching the
 *   console.log sink, so we CANNOT assert debug lines appear in stdout.
 * - Instead we assert the ABSENCE of error-level log when market is closed,
 *   and the PRESENCE of error-level log when market is open.
 * - Both assertions together prove the correct conditional branch is taken.
 *
 * console.log is spied on to capture emitted JSON log entries.
 */

// Must be set before ANY import that triggers getDb() or loadConfig()
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import {
  fetchHnxPrices,
  fetchUpcomPrices,
} from "../infrastructure/fetchers/hnx.js";
import type { HttpClient } from "../infrastructure/fetchers/ssc.js";

// ---------------------------------------------------------------------------
// Mock HTTP clients
// ---------------------------------------------------------------------------

/** Mock HttpClient that always fails (network error) — triggers "all sources failed" path. */
function failingClient(): HttpClient {
  return {
    async get(_url: string): Promise<string> {
      throw new Error("Network timeout");
    },
  };
}

/** Mock HttpClient that returns an empty JSON array — triggers "all sources failed" path. */
function emptyClient(): HttpClient {
  return {
    async get(_url: string): Promise<string> {
      return "[]";
    },
  };
}

// ---------------------------------------------------------------------------
// Fixed instants for deterministic clock injection
// ---------------------------------------------------------------------------

/**
 * Wednesday 2026-06-17 03:00 UTC = 10:00 VN time → inside 02:00–08:59 UTC window → OPEN.
 * isVnTradingWindow(MARKET_OPEN_UTC) === true
 */
const MARKET_OPEN_UTC = new Date("2026-06-17T03:00:00.000Z");

/**
 * Wednesday 2026-06-17 22:00 UTC → outside 02:00–08:59 UTC window → CLOSED.
 * isVnTradingWindow(MARKET_CLOSED_UTC) === false
 */
const MARKET_CLOSED_UTC = new Date("2026-06-17T22:00:00.000Z");

/**
 * Saturday 2026-06-20 04:00 UTC → weekend → CLOSED.
 * isVnTradingWindow(WEEKEND_UTC) === false
 */
const WEEKEND_UTC = new Date("2026-06-20T04:00:00.000Z");

// ---------------------------------------------------------------------------
// console.log spy helper
// ---------------------------------------------------------------------------

interface CapturedLog {
  level: string;
  message: string;
}

/**
 * Runs `fn` while spying on console.log to capture JSON log entries emitted by
 * the logger singleton (default sink calls `console.log(JSON.stringify(entry))`).
 * Returns all parsed log entries. Non-JSON lines are silently dropped.
 *
 * Note: the logger singleton has minLevel='info' so debug-level messages are
 * filtered before reaching this spy. Only info/warn/error lines are captured.
 */
async function captureLogLines(fn: () => Promise<void>): Promise<CapturedLog[]> {
  const lines: CapturedLog[] = [];
  // eslint-disable-next-line no-console
  const origLog = console.log.bind(console);

  // eslint-disable-next-line no-console
  console.log = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === "string" && first.startsWith("{")) {
      try {
        const parsed = JSON.parse(first) as CapturedLog;
        if (typeof parsed.level === "string" && typeof parsed.message === "string") {
          lines.push(parsed);
        }
      } catch {
        /* not JSON */
      }
    }
    origLog(...args);
  };

  try {
    await fn();
  } finally {
    // eslint-disable-next-line no-console
    console.log = origLog;
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Tests — fetchHnxPrices off-hours error downgrade
// ---------------------------------------------------------------------------

describe("FIX-HNX-OFFHOURS-ERROR-DOWNGRADE — fetchHnxPrices", () => {
  /**
   * Market CLOSED: the "all sources failed" message is downgraded to DEBUG.
   * Since minLevel=info, debug is filtered → NO error-level entry is emitted.
   * Assert: zero error-level logs for "HNX ... sources failed".
   */
  it("does NOT emit error log when market is CLOSED (weekday night) and all sources return empty", async () => {
    const logs = await captureLogLines(async () => {
      await fetchHnxPrices(["ACB"], emptyClient(), { force: true, now: MARKET_CLOSED_UTC });
    });

    const errorLogs = logs.filter(
      (l) => l.level === "error" && l.message?.includes("[hnx]") && l.message?.includes("HNX"),
    );
    expect(errorLogs.length).toBe(0);
  });

  it("does NOT emit error log when market is CLOSED on WEEKEND and all sources return empty", async () => {
    const logs = await captureLogLines(async () => {
      await fetchHnxPrices(["ACB"], emptyClient(), { force: true, now: WEEKEND_UTC });
    });

    const errorLogs = logs.filter(
      (l) => l.level === "error" && l.message?.includes("[hnx]") && l.message?.includes("HNX"),
    );
    expect(errorLogs.length).toBe(0);
  });

  /**
   * Market OPEN: the "all sources failed" message KEEPS logger.error.
   * Assert: at least one error-level entry for "HNX ... sources failed" is emitted.
   */
  it("DOES emit error log when market is OPEN and all sources fail", async () => {
    const logs = await captureLogLines(async () => {
      await fetchHnxPrices(["ACB"], failingClient(), { force: true, now: MARKET_OPEN_UTC });
    });

    const errorLogs = logs.filter(
      (l) => l.level === "error" && l.message?.includes("[hnx]") && l.message?.includes("HNX"),
    );
    expect(errorLogs.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Tests — fetchUpcomPrices off-hours error downgrade
// ---------------------------------------------------------------------------

describe("FIX-HNX-OFFHOURS-ERROR-DOWNGRADE — fetchUpcomPrices", () => {
  it("does NOT emit error log when market is CLOSED (weekday night) and all sources return empty", async () => {
    const logs = await captureLogLines(async () => {
      await fetchUpcomPrices(["FRT"], emptyClient(), { force: true, now: MARKET_CLOSED_UTC });
    });

    const errorLogs = logs.filter(
      (l) => l.level === "error" && l.message?.includes("[hnx]") && l.message?.includes("UPCOM"),
    );
    expect(errorLogs.length).toBe(0);
  });

  it("does NOT emit error log when market is CLOSED on WEEKEND and all sources return empty", async () => {
    const logs = await captureLogLines(async () => {
      await fetchUpcomPrices(["FRT"], emptyClient(), { force: true, now: WEEKEND_UTC });
    });

    const errorLogs = logs.filter(
      (l) => l.level === "error" && l.message?.includes("[hnx]") && l.message?.includes("UPCOM"),
    );
    expect(errorLogs.length).toBe(0);
  });

  it("DOES emit error log when market is OPEN and all sources fail", async () => {
    const logs = await captureLogLines(async () => {
      await fetchUpcomPrices(["FRT"], failingClient(), { force: true, now: MARKET_OPEN_UTC });
    });

    const errorLogs = logs.filter(
      (l) => l.level === "error" && l.message?.includes("[hnx]") && l.message?.includes("UPCOM"),
    );
    expect(errorLogs.length).toBeGreaterThan(0);
  });
});
