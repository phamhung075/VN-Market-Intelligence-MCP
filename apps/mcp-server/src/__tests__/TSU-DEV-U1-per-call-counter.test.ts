/**
 * TSU-DEV-U1 — Per-Call Telemetry Counter tests
 *
 * Unit tests for perCallCounterStore + trackSessionToolUsageJob integration.
 *
 * T-U1-1: incrementTool() increments counter for new tool
 * T-U1-2: incrementTool() increments existing counter
 * T-U1-3: getSnapshot() returns shallow copy (mutations don't affect store)
 * T-U1-4: resetCounters() clears all entries
 * T-U1-5: getTool() returns 0 for absent tool
 * T-U1-6: (integration) job calls getCounterSnapshot and writes new schema
 * T-U1-7: (integration) new schema has no sessionCount field
 * T-U1-8: (integration) uniqueTools reflects counter keys count
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  incrementTool,
  getSnapshot,
  resetCounters,
  getTool,
} from "../infrastructure/telemetry/perCallCounterStore.js";
import { trackSessionToolUsageJob } from "../scheduler/system/trackSessionToolUsageJob.js";

describe("TSU-DEV-U1 — perCallCounterStore", () => {
  beforeEach(() => {
    resetCounters();
  });

  // ── T-U1-1 ────────────────────────────────────────────────────────────────

  it("T-U1-1: incrementTool() creates counter at 1 for new tool", () => {
    incrementTool("get_market_snapshot");
    const snap = getSnapshot();
    expect(snap["get_market_snapshot"]).toBe(1);
  });

  // ── T-U1-2 ────────────────────────────────────────────────────────────────

  it("T-U1-2: incrementTool() increments existing counter", () => {
    incrementTool("get_market_snapshot");
    incrementTool("get_market_snapshot");
    incrementTool("get_market_snapshot");
    const snap = getSnapshot();
    expect(snap["get_market_snapshot"]).toBe(3);
  });

  // ── T-U1-3 ────────────────────────────────────────────────────────────────

  it("T-U1-3: getSnapshot() returns shallow copy — mutations do not affect store", () => {
    incrementTool("tool_a");
    const snap = getSnapshot();
    snap["tool_a"] = 9999; // mutate the copy
    // store must be unchanged
    const snap2 = getSnapshot();
    expect(snap2["tool_a"]).toBe(1);
  });

  // ── T-U1-4 ────────────────────────────────────────────────────────────────

  it("T-U1-4: resetCounters() clears all entries", () => {
    incrementTool("tool_x");
    incrementTool("tool_y");
    resetCounters();
    const snap = getSnapshot();
    expect(Object.keys(snap).length).toBe(0);
  });

  // ── T-U1-5 ────────────────────────────────────────────────────────────────

  it("T-U1-5: getTool() returns 0 for absent tool", () => {
    expect(getTool("nonexistent_tool")).toBe(0);
  });
});

describe("TSU-DEV-U1 — trackSessionToolUsageJob with counter store", () => {
  beforeEach(() => {
    resetCounters();
  });

  // ── T-U1-6 ────────────────────────────────────────────────────────────────

  it("T-U1-6: job writes toolCounts reflecting counter snapshot", async () => {
    incrementTool("get_price");
    incrementTool("get_price");
    incrementTool("send_telegram");

    const stats = await trackSessionToolUsageJob();

    expect(stats.toolCounts["get_price"]).toBe(2);
    expect(stats.toolCounts["send_telegram"]).toBe(1);
  });

  // ── T-U1-7 ────────────────────────────────────────────────────────────────

  it("T-U1-7: new schema has no sessionCount field", async () => {
    const stats = await trackSessionToolUsageJob();

    expect((stats as unknown as Record<string, unknown>)["sessionCount"]).toBeUndefined();
  });

  // ── T-U1-8 ────────────────────────────────────────────────────────────────

  it("T-U1-8: uniqueTools reflects number of distinct tool names incremented", async () => {
    incrementTool("tool_a");
    incrementTool("tool_b");
    incrementTool("tool_a"); // duplicate — still 2 unique

    const stats = await trackSessionToolUsageJob();

    expect(stats.uniqueTools).toBe(2);
  });
});
