import { describe, it, expect, beforeEach } from "bun:test";

describe("1299c: SessionToolCache", () => {

  it("TC-1: get() returns undefined on miss", async () => {
    const { SessionToolCache } = await import("../infrastructure/cache/sessionToolCache.js");
    const cache = new SessionToolCache(10, 1000);
    expect(cache.get("nonexistent")).toBeUndefined();
  });

  it("TC-2: set() + get() round-trip", async () => {
    const { SessionToolCache } = await import("../infrastructure/cache/sessionToolCache.js");
    const cache = new SessionToolCache(10, 60_000);
    cache.set("sess-1", { skills: ["news_scout"], toolNames: ["fetch_and_analyze"], loadedAt: Date.now() });
    const entry = cache.get("sess-1");
    expect(entry).toBeDefined();
    expect(entry!.skills).toEqual(["news_scout"]);
    expect(entry!.toolNames).toContain("fetch_and_analyze");
  });

  it("TC-3: LRU eviction at maxSize", async () => {
    const { SessionToolCache } = await import("../infrastructure/cache/sessionToolCache.js");
    const cache = new SessionToolCache(3, 60_000); // max 3
    cache.set("s1", { skills: [], toolNames: ["t1"], loadedAt: Date.now() });
    cache.set("s2", { skills: [], toolNames: ["t2"], loadedAt: Date.now() + 1 });
    cache.set("s3", { skills: [], toolNames: ["t3"], loadedAt: Date.now() + 2 });
    cache.set("s4", { skills: [], toolNames: ["t4"], loadedAt: Date.now() + 3 }); // evicts s1
    expect(cache.get("s1")).toBeUndefined(); // evicted
    expect(cache.get("s4")).toBeDefined();   // newest present
    expect(cache.size()).toBe(3);
  });

  it("TC-4: TTL expiry returns undefined", async () => {
    const { SessionToolCache } = await import("../infrastructure/cache/sessionToolCache.js");
    const cache = new SessionToolCache(10, 1); // 1ms TTL
    cache.set("sess-ttl", { skills: [], toolNames: [], loadedAt: Date.now() });
    await new Promise((r) => setTimeout(r, 5)); // wait 5ms
    expect(cache.get("sess-ttl")).toBeUndefined();
  });

  it("TC-5: snapshot() returns all active entries", async () => {
    const { SessionToolCache } = await import("../infrastructure/cache/sessionToolCache.js");
    const cache = new SessionToolCache(10, 60_000);
    cache.set("a", { skills: ["news_scout"], toolNames: ["t1", "t2"], loadedAt: Date.now() });
    cache.set("b", { skills: ["dev_team"], toolNames: ["t3"], loadedAt: Date.now() });
    const snap = cache.snapshot();
    expect(Object.keys(snap).length).toBe(2);
    expect(snap["a"]?.toolNames).toContain("t1");
  });

  it("TC-6: size() is accurate", async () => {
    const { SessionToolCache } = await import("../infrastructure/cache/sessionToolCache.js");
    const cache = new SessionToolCache(10, 60_000);
    expect(cache.size()).toBe(0);
    cache.set("x", { skills: [], toolNames: [], loadedAt: Date.now() });
    expect(cache.size()).toBe(1);
  });
});

// TC-7 and TC-8 updated for TSU-DEV-U1: job now reads perCallCounterStore
// (sessionToolCache was dead in gateway model — see TOOL-SURFACE-UPGRADE U1).
describe("1299c: trackSessionToolUsageJob (updated TSU-DEV-U1)", () => {

  it("TC-7: empty counter store → writes {} to tool-usage-stats.json, no crash", async () => {
    const { resetCounters } = await import("../infrastructure/telemetry/perCallCounterStore.js");
    const { trackSessionToolUsageJob } = await import("../scheduler/system/trackSessionToolUsageJob.js");
    resetCounters();
    const stats = await trackSessionToolUsageJob();
    expect(stats.uniqueTools).toBe(0);
    expect(stats.toolCounts).toEqual({});
  });

  it("TC-8: incremented tools → stats file has correct per-tool counts", async () => {
    const { incrementTool, resetCounters } = await import("../infrastructure/telemetry/perCallCounterStore.js");
    const { trackSessionToolUsageJob } = await import("../scheduler/system/trackSessionToolUsageJob.js");
    resetCounters();
    incrementTool("fetch_and_analyze");
    incrementTool("get_recent_fixes");
    incrementTool("fetch_and_analyze");
    incrementTool("submit_feedback");
    incrementTool("get_recent_fixes");
    incrementTool("send_telegram");

    const stats = await trackSessionToolUsageJob();
    expect(stats.toolCounts["fetch_and_analyze"]).toBe(2);
    expect(stats.toolCounts["get_recent_fixes"]).toBe(2);
    expect(stats.toolCounts["submit_feedback"]).toBe(1);
    expect(stats.toolCounts["send_telegram"]).toBe(1);
  });
});
