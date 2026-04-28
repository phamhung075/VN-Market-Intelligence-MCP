/**
 * TASK_1356b — trackSessionToolUsageJob gap tests (8 cases)
 *
 * Covers stat field correctness, multi-session aggregation, expiry, and ISO timestamp.
 * Constructor DI: inject SessionToolCache directly — no mock.module() needed.
 * No DB access — no Bun.env["DB_PATH"] header required.
 *
 *   TSU-1: empty cache → sessionCount=0, uniqueTools=0, toolCounts={}
 *   TSU-2: single session, single tool → all three stat fields correct
 *   TSU-3: multi-session aggregation → same tool across sessions counted correctly
 *   TSU-4: uniqueTools reflects distinct names, not total appearances
 *   TSU-5: sessionCount matches number of set() calls (all non-expired)
 *   TSU-6: toolCounts for omnipresent tool equals sessionCount
 *   TSU-7: expired sessions (1ms TTL + Bun.sleep(10)) → excluded from snapshot
 *   TSU-8: generatedAt is valid ISO 8601 within before/after timestamp bracket
 */

import { describe, it, expect } from "bun:test";
import { SessionToolCache } from "../infrastructure/cache/sessionToolCache.js";
import { trackSessionToolUsageJob } from "../scheduler/system/trackSessionToolUsageJob.js";

describe("TASK_1356b — trackSessionToolUsageJob gap tests", () => {
  // ── TSU-1 ─────────────────────────────────────────────────────────────────

  it("TSU-1: empty cache → sessionCount=0, uniqueTools=0, toolCounts={}", async () => {
    const cache = new SessionToolCache(10, 60_000);

    const stats = await trackSessionToolUsageJob(cache);

    expect(stats.sessionCount).toBe(0);
    expect(stats.uniqueTools).toBe(0);
    expect(stats.toolCounts).toEqual({});
  });

  // ── TSU-2 ─────────────────────────────────────────────────────────────────

  it("TSU-2: single session, single tool → sessionCount=1, uniqueTools=1, toolCounts correct", async () => {
    const cache = new SessionToolCache(10, 60_000);
    cache.set("s1", { skills: [], toolNames: ["get_price"], loadedAt: Date.now() });

    const stats = await trackSessionToolUsageJob(cache);

    expect(stats.sessionCount).toBe(1);
    expect(stats.uniqueTools).toBe(1);
    expect(stats.toolCounts).toEqual({ get_price: 1 });
  });

  // ── TSU-3 ─────────────────────────────────────────────────────────────────

  it("TSU-3: multi-session aggregation → same tool across sessions counted correctly", async () => {
    const cache = new SessionToolCache(10, 60_000);
    cache.set("s1", { skills: [], toolNames: ["fetch_and_analyze", "get_price"], loadedAt: Date.now() });
    cache.set("s2", { skills: [], toolNames: ["fetch_and_analyze", "send_telegram"], loadedAt: Date.now() });
    cache.set("s3", { skills: [], toolNames: ["get_price"], loadedAt: Date.now() });

    const stats = await trackSessionToolUsageJob(cache);

    expect(stats.sessionCount).toBe(3);
    expect(stats.toolCounts["fetch_and_analyze"]).toBe(2);
    expect(stats.toolCounts["get_price"]).toBe(2);
    expect(stats.toolCounts["send_telegram"]).toBe(1);
  });

  // ── TSU-4 ─────────────────────────────────────────────────────────────────

  it("TSU-4: uniqueTools reflects distinct names, not total appearances", async () => {
    const cache = new SessionToolCache(10, 60_000);
    cache.set("s1", { skills: [], toolNames: ["A", "B"], loadedAt: Date.now() });
    cache.set("s2", { skills: [], toolNames: ["B", "C"], loadedAt: Date.now() });
    cache.set("s3", { skills: [], toolNames: ["A", "C"], loadedAt: Date.now() });

    const stats = await trackSessionToolUsageJob(cache);

    expect(stats.uniqueTools).toBe(3); // A, B, C — not 6 total appearances
    expect(stats.sessionCount).toBe(3);
  });

  // ── TSU-5 ─────────────────────────────────────────────────────────────────

  it("TSU-5: sessionCount matches number of set() calls (all non-expired)", async () => {
    const cache = new SessionToolCache(10, 60_000);
    for (let i = 0; i < 5; i++) {
      cache.set(`s${i}`, { skills: [], toolNames: [`tool_${i}`], loadedAt: Date.now() });
    }

    const stats = await trackSessionToolUsageJob(cache);

    expect(stats.sessionCount).toBe(5);
    expect(stats.uniqueTools).toBe(5);
  });

  // ── TSU-6 ─────────────────────────────────────────────────────────────────

  it("TSU-6: toolCounts for omnipresent tool equals sessionCount", async () => {
    const cache = new SessionToolCache(10, 60_000);
    for (let i = 0; i < 5; i++) {
      cache.set(`s${i}`, { skills: [], toolNames: ["omnipresent_tool", `unique_${i}`], loadedAt: Date.now() });
    }

    const stats = await trackSessionToolUsageJob(cache);

    expect(stats.toolCounts["omnipresent_tool"]).toBe(5);
    // 6 distinct tools: omnipresent_tool + unique_0..unique_4
    expect(stats.uniqueTools).toBe(6);
  });

  // ── TSU-7 ─────────────────────────────────────────────────────────────────

  it("TSU-7: expired sessions (1ms TTL + Bun.sleep(10)) → excluded from snapshot", async () => {
    const shortCache = new SessionToolCache(10, 1); // 1ms TTL
    shortCache.set("s1", { skills: [], toolNames: ["stale_tool"], loadedAt: Date.now() });
    await Bun.sleep(10); // let TTL expire

    const stats = await trackSessionToolUsageJob(shortCache);

    expect(stats.sessionCount).toBe(0);
    expect(stats.uniqueTools).toBe(0);
    expect(stats.toolCounts).toEqual({});
  });

  // ── TSU-8 ─────────────────────────────────────────────────────────────────

  it("TSU-8: generatedAt is valid ISO 8601 within before/after timestamp bracket", async () => {
    const before = new Date().toISOString();
    const stats = await trackSessionToolUsageJob(new SessionToolCache(10, 60_000));
    const after = new Date().toISOString();

    // Must round-trip through Date without loss (valid ISO 8601)
    expect(new Date(stats.generatedAt).toISOString()).toBe(stats.generatedAt);
    // Must fall within the test's time window
    expect(stats.generatedAt >= before).toBe(true);
    expect(stats.generatedAt <= after).toBe(true);
  });
});
