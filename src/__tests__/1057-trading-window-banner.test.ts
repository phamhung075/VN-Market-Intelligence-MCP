/**
 * Task 1057 — trading-window banner for price-freshness tools
 *
 * Report 1057 (HIGH, report-analyzer): "Watchlist prices entirely N/A"
 * was a false positive — the market was closed. Tools that report price
 * freshness must mark "outside trading window" vs "live-data stale" so
 * analysis agents stop raising HIGH reports for the expected overnight
 * empty state.
 */

import { describe, test, expect } from "bun:test";
import {
  isVnTradingWindow,
  tradingWindowLabel,
} from "../domain/services/tradingWindow.js";

describe("domain/services/tradingWindow", () => {
  test("isVnTradingWindow: Monday 02:00 UTC is open", () => {
    // 2026-04-06 is a Monday
    expect(isVnTradingWindow(new Date("2026-04-06T02:00:00Z"))).toBe(true);
  });

  test("isVnTradingWindow: Monday 08:59 UTC is open", () => {
    expect(isVnTradingWindow(new Date("2026-04-06T08:59:00Z"))).toBe(true);
  });

  test("isVnTradingWindow: Monday 12:11 UTC (report 1057 time) is closed", () => {
    expect(isVnTradingWindow(new Date("2026-04-08T12:11:00Z"))).toBe(false);
  });

  test("isVnTradingWindow: Saturday 04:00 UTC is closed", () => {
    // 2026-04-11 is a Saturday
    expect(isVnTradingWindow(new Date("2026-04-11T04:00:00Z"))).toBe(false);
  });

  test("isVnTradingWindow: Sunday 04:00 UTC is closed", () => {
    // 2026-04-12 is a Sunday
    expect(isVnTradingWindow(new Date("2026-04-12T04:00:00Z"))).toBe(false);
  });

  test("tradingWindowLabel: open state mentions OPEN", () => {
    const label = tradingWindowLabel(new Date("2026-04-06T03:00:00Z"));
    expect(label).toContain("OPEN");
  });

  test("tradingWindowLabel: closed state mentions CLOSED and 'expected'", () => {
    const label = tradingWindowLabel(new Date("2026-04-08T12:11:00Z"));
    expect(label).toContain("CLOSED");
    expect(label.toLowerCase()).toContain("expected");
  });
});
