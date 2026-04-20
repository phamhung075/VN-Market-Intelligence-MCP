// src/__tests__/1526-push-prices-market-hours-guard.test.ts
// Task 1526a — RED: push-prices market hours guard (failing tests)
//
// TDD: Tests written FIRST (RED), then GREEN phase (1526b) adds the guard.
//
// Tests verify:
//   AC-1: detectSignals + storeAlerts NOT called on weekend
//   AC-2: detectSignals + storeAlerts NOT called on weekday off-hours
//   AC-3: detectSignals IS called inside VN market hours (Mon-Fri UTC 02:00–08:59)
//
// RED state: `runSignalDetectionGuard` does not yet exist in server helpers.
// Import will fail until 1526b creates the function.

import { describe, it, expect, mock, beforeEach } from "bun:test";

// ── Spy mocks ────────────────────────────────────────────────────────────────

const detectSignalsMock = mock(() => []);
const storeAlertsMock = mock(() => undefined);

// Import the function to be created by 1526b.
// This import FAILS during RED phase → tests are RED as required.
// The function wraps the setImmediate signal-detection block with isVnMarketHoursUtc guard.
import { runSignalDetectionGuard } from "../interface/mcp/pushPricesSignals.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal price payload — one stock, enough for signal detection loop */
const SAMPLE_PRICES = [
  { code: "VCB", price: 57.7, volume: 100000, type: "stock" as const },
];

// ── Test suite ────────────────────────────────────────────────────────────────

describe("push-prices: market hours guard", () => {
  beforeEach(() => {
    detectSignalsMock.mockClear();
    storeAlertsMock.mockClear();
  });

  it("AC-1: skips detectSignals + storeAlerts on weekend (Saturday UTC)", async () => {
    // Saturday 2026-04-18 UTC 04:00 — inside clock window but weekend
    const saturday = new Date("2026-04-18T04:00:00.000Z");

    await runSignalDetectionGuard(SAMPLE_PRICES, saturday, detectSignalsMock);

    expect(detectSignalsMock).not.toHaveBeenCalled();
    expect(storeAlertsMock).not.toHaveBeenCalled();
  });

  it("AC-2: skips detectSignals + storeAlerts on weekday off-hours (UTC 01:00)", async () => {
    // Monday 2026-04-20 UTC 01:00 — weekday but before market open (02:00 UTC)
    const offHours = new Date("2026-04-20T01:00:00.000Z");

    await runSignalDetectionGuard(SAMPLE_PRICES, offHours, detectSignalsMock);

    expect(detectSignalsMock).not.toHaveBeenCalled();
    expect(storeAlertsMock).not.toHaveBeenCalled();
  });

  it("AC-3: calls detectSignals inside VN market hours (Mon UTC 04:00)", async () => {
    // Monday 2026-04-20 UTC 04:00 — weekday inside window (02:00–08:59 UTC)
    const marketOpen = new Date("2026-04-20T04:00:00.000Z");

    await runSignalDetectionGuard(SAMPLE_PRICES, marketOpen, detectSignalsMock);

    expect(detectSignalsMock).toHaveBeenCalled();
  });
});
