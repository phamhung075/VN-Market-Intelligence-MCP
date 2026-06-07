/**
 * TASK_1356b — trackSessionToolUsageJob tests (updated for TSU-DEV-U1)
 *
 * Updated for per-call counter model (TSU-DEV-U1). The job now reads from
 * perCallCounterStore instead of sessionToolCache (dead in gateway model).
 * sessionCount field removed (meaningless post-gateway).
 *
 * Tests use resetCounters() + incrementTool() to control store state.
 * No DB access — no Bun.env["DB_PATH"] header required.
 *
 *   TSU-1: empty counter store → uniqueTools=0, toolCounts={}
 *   TSU-2: single tool incremented once → toolCounts correct, uniqueTools=1
 *   TSU-3: multiple tools incremented → toolCounts aggregates correctly
 *   TSU-4: uniqueTools reflects distinct names, not total invocations
 *   TSU-5: multiple increments same tool → counter accumulates
 *   TSU-6: toolCounts for heavily-used tool reflects exact invocation count
 *   TSU-7: resetCounters clears state → next job run sees empty counts
 *   TSU-8: generatedAt is valid ISO 8601 within before/after timestamp bracket
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  incrementTool,
  resetCounters,
} from "../infrastructure/telemetry/perCallCounterStore.js";
import { trackSessionToolUsageJob } from "../scheduler/system/trackSessionToolUsageJob.js";

describe("TASK_1356b — trackSessionToolUsageJob gap tests", () => {
  beforeEach(() => {
    resetCounters();
  });

  // ── TSU-1 ─────────────────────────────────────────────────────────────────

  it("TSU-1: empty counter store → uniqueTools=0, toolCounts={}", async () => {
    const stats = await trackSessionToolUsageJob();

    expect(stats.uniqueTools).toBe(0);
    expect(stats.toolCounts).toEqual({});
  });

  // ── TSU-2 ─────────────────────────────────────────────────────────────────

  it("TSU-2: single tool incremented once → uniqueTools=1, toolCounts correct", async () => {
    incrementTool("get_price");

    const stats = await trackSessionToolUsageJob();

    expect(stats.uniqueTools).toBe(1);
    expect(stats.toolCounts).toEqual({ get_price: 1 });
  });

  // ── TSU-3 ─────────────────────────────────────────────────────────────────

  it("TSU-3: multiple tools incremented → toolCounts aggregates correctly", async () => {
    incrementTool("fetch_and_analyze");
    incrementTool("get_price");
    incrementTool("fetch_and_analyze");
    incrementTool("send_telegram");
    incrementTool("get_price");

    const stats = await trackSessionToolUsageJob();

    expect(stats.toolCounts["fetch_and_analyze"]).toBe(2);
    expect(stats.toolCounts["get_price"]).toBe(2);
    expect(stats.toolCounts["send_telegram"]).toBe(1);
  });

  // ── TSU-4 ─────────────────────────────────────────────────────────────────

  it("TSU-4: uniqueTools reflects distinct names, not total invocations", async () => {
    incrementTool("A");
    incrementTool("B");
    incrementTool("A");
    incrementTool("B");
    incrementTool("C");

    const stats = await trackSessionToolUsageJob();

    expect(stats.uniqueTools).toBe(3); // A, B, C — not 5 total invocations
  });

  // ── TSU-5 ─────────────────────────────────────────────────────────────────

  it("TSU-5: multiple increments same tool → counter accumulates", async () => {
    for (let i = 0; i < 5; i++) {
      incrementTool("heavy_tool");
    }

    const stats = await trackSessionToolUsageJob();

    expect(stats.toolCounts["heavy_tool"]).toBe(5);
    expect(stats.uniqueTools).toBe(1);
  });

  // ── TSU-6 ─────────────────────────────────────────────────────────────────

  it("TSU-6: toolCounts for heavily-used tool reflects exact invocation count", async () => {
    for (let i = 0; i < 7; i++) {
      incrementTool("omnipresent_tool");
    }
    for (let i = 0; i < 3; i++) {
      incrementTool(`unique_${i}`);
    }

    const stats = await trackSessionToolUsageJob();

    expect(stats.toolCounts["omnipresent_tool"]).toBe(7);
    // 4 distinct tools: omnipresent_tool + unique_0..unique_2
    expect(stats.uniqueTools).toBe(4);
  });

  // ── TSU-7 ─────────────────────────────────────────────────────────────────

  it("TSU-7: resetCounters clears state → next job run sees empty counts", async () => {
    incrementTool("stale_tool");

    // First run captures the tool
    const first = await trackSessionToolUsageJob();
    expect(first.toolCounts["stale_tool"]).toBe(1);

    // After reset, second run sees nothing
    resetCounters();
    const second = await trackSessionToolUsageJob();
    expect(second.uniqueTools).toBe(0);
    expect(second.toolCounts).toEqual({});
  });

  // ── TSU-8 ─────────────────────────────────────────────────────────────────

  it("TSU-8: generatedAt is valid ISO 8601 within before/after timestamp bracket", async () => {
    const before = new Date().toISOString();
    const stats = await trackSessionToolUsageJob();
    const after = new Date().toISOString();

    // Must round-trip through Date without loss (valid ISO 8601)
    expect(new Date(stats.generatedAt).toISOString()).toBe(stats.generatedAt);
    // Must fall within the test's time window
    expect(stats.generatedAt >= before).toBe(true);
    expect(stats.generatedAt <= after).toBe(true);
  });
});
