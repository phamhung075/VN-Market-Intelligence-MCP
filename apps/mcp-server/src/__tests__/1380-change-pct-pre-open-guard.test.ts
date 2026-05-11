// apps/mcp-server/src/__tests__/1380-change-pct-pre-open-guard.test.ts
// Task 1380 — change_pct pre-open phantom alert guard
//
// Verifies that the UTC trading window check (`isVnTradingWindowUtc`)
// correctly suppresses change_pct alerts outside 02:00–08:59 UTC Mon-Fri.
//
// RED → GREEN cycle:
//   RED:   isVnTradingWindowUtc does not exist → import fails
//   GREEN: server.ts exports the helper and uses it to guard detectSignals

import { describe, it, expect } from "bun:test";
import { isVnTradingWindowUtc } from "../interface/mcp/server.js";

describe("Task 1380 — change_pct pre-open phantom guard", () => {
  it("returns false at 00:10 UTC Monday (phantom window — root cause of GAS alert 316)", () => {
    // 2026-04-27 Monday 00:10 UTC — the exact time of the bug report
    const phantomTime = new Date("2026-04-27T00:10:00.000Z");
    expect(isVnTradingWindowUtc(phantomTime)).toBe(false);
  });

  it("returns false at 01:59 UTC on a weekday (one minute before market open)", () => {
    const beforeOpen = new Date("2026-04-28T01:59:00.000Z");
    expect(isVnTradingWindowUtc(beforeOpen)).toBe(false);
  });

  it("returns true at 02:00 UTC Monday (market open boundary)", () => {
    const marketOpen = new Date("2026-04-28T02:00:00.000Z");
    expect(isVnTradingWindowUtc(marketOpen)).toBe(true);
  });

  it("returns true at 08:59 UTC Friday (market close boundary)", () => {
    const nearClose = new Date("2026-05-01T08:59:00.000Z");
    expect(isVnTradingWindowUtc(nearClose)).toBe(true);
  });

  it("returns false at 09:00 UTC (market closed — post session)", () => {
    const afterClose = new Date("2026-04-28T09:00:00.000Z");
    expect(isVnTradingWindowUtc(afterClose)).toBe(false);
  });

  it("returns false on Saturday even during VN clock hours", () => {
    const saturday = new Date("2026-04-25T04:00:00.000Z");
    expect(isVnTradingWindowUtc(saturday)).toBe(false);
  });

  it("returns false on Sunday", () => {
    const sunday = new Date("2026-04-26T05:00:00.000Z");
    expect(isVnTradingWindowUtc(sunday)).toBe(false);
  });
});
