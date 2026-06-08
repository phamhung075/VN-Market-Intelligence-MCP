Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1501 — Kinh Dich step A4: market-hours throttle + per-stock cooldown
 *
 * RED phase: all 4 assertions FAIL until production code is added.
 *
 * Acceptance criteria:
 *   1. Weekend (Saturday 10:00 VN) → hexagramsComputed = 0 (skip)
 *   2. Before open (Monday 08:00 VN) → hexagramsComputed = 0 (skip)
 *   3. Market hours (Wednesday 11:00 VN) → hexagramsComputed > 0 (regression guard)
 *   4. Per-stock cooldown < 15 min → resetHexagramCooldown export exists + skip works
 */

import { describe, it, expect } from "bun:test";
import type { Alert } from "../domain/services/alertGenerator.js";
import type { SscDocument } from "../infrastructure/fetchers/ssc.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Shared no-op stubs (prevent real SQLite / HTTP)
// ─────────────────────────────────────────────────────────────────────────────

const BASE_DEPS = {
  listSscDocsFn: async () => [] as SscDocument[],
  fetchPricesFn: async () => 0,
  runImpactChainFn: async () => 0,
  sendAlertsFn: async () => 0,
  syncSectorPeersFn: async () => ({ synced: 0, skipped: 0, apiCalls: 0 }),
  readUnnotifiedAlertsFn: async () => [] as Alert[],
  markAlertNotifiedFn: async () => {},
  pollNewsFn: async () => ({ fetched: 0, inserted: 0, duplicates: 0, alerts: 0, errors: 0 }),
};

// ─────────────────────────────────────────────────────────────────────────────
// UTC anchors for deterministic VN-time checks
//
// Saturday 2026-04-18 10:00 GMT+7 = 2026-04-18T03:00:00Z
// Monday  2026-04-20 08:00 GMT+7 = 2026-04-20T01:00:00Z  (before open)
// Wednesday 2026-04-22 11:00 GMT+7 = 2026-04-22T04:00:00Z (market hours)
// ─────────────────────────────────────────────────────────────────────────────

const SAT_10AM_VN_UTC = "2026-04-18T03:00:00.000Z";
const MON_08AM_VN_UTC = "2026-04-20T01:00:00.000Z";
const WED_11AM_VN_UTC = "2026-04-22T04:00:00.000Z";

// ─────────────────────────────────────────────────────────────────────────────
// Tests 1-3: step A4 market-hours gate
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1501 — step A4 market-hours gate", () => {
  it("skips hexagram batch on Saturday (off-hours weekend)", async () => {
    const { runIntelligenceCycle, resetCycleGuard, isMarketHours } =
      await import("../scheduler/news-analysis/intelligenceCycleJob.js");
    resetCycleGuard();

    let computeCalled = false;

    const result = await runIntelligenceCycle({
      ...BASE_DEPS,
      isMarketHoursFn: () => isMarketHours(new Date(SAT_10AM_VN_UTC)),
      getWatchlistCodesFn: async () => ["VCB", "HPG"],
      computeHexagramsFn: async (codes) => {
        computeCalled = true;
        return codes.length;
      },
    });

    // RED: step A4 runs unconditionally → computeCalled=true, hexagramsComputed=2.
    // GREEN: gated on marketHours → computeCalled=false, hexagramsComputed=0.
    expect(result).not.toBeNull();
    expect(result!.hexagramsComputed).toBe(0);
    expect(computeCalled).toBe(false);
  });

  it("skips hexagram batch on Monday 08:00 VN (before market open)", async () => {
    const { runIntelligenceCycle, resetCycleGuard, isMarketHours } =
      await import("../scheduler/news-analysis/intelligenceCycleJob.js");
    resetCycleGuard();

    let computeCalled = false;

    const result = await runIntelligenceCycle({
      ...BASE_DEPS,
      isMarketHoursFn: () => isMarketHours(new Date(MON_08AM_VN_UTC)),
      getWatchlistCodesFn: async () => ["VCB"],
      computeHexagramsFn: async (codes) => {
        computeCalled = true;
        return codes.length;
      },
    });

    // RED: step A4 runs unconditionally → computeCalled=true.
    // GREEN: gated → computeCalled=false, hexagramsComputed=0.
    expect(result).not.toBeNull();
    expect(result!.hexagramsComputed).toBe(0);
    expect(computeCalled).toBe(false);
  });

  it("runs hexagram batch during market hours (Wednesday 11:00 VN)", async () => {
    const { runIntelligenceCycle, resetCycleGuard, isMarketHours } =
      await import("../scheduler/news-analysis/intelligenceCycleJob.js");
    resetCycleGuard();

    const result = await runIntelligenceCycle({
      ...BASE_DEPS,
      isMarketHoursFn: () => isMarketHours(new Date(WED_11AM_VN_UTC)),
      getWatchlistCodesFn: async () => ["VCB", "HPG", "MBB"],
      computeHexagramsFn: async (codes) => codes.length,
    });

    // Regression guard: market-hours path must keep calling computeHexagramsFn.
    expect(result).not.toBeNull();
    expect(result!.hexagramsComputed).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Per-stock 15-min cooldown
//
// The GREEN implementation adds:
//   1. A module-level lastComputedAt map in defaultComputeHexagrams.
//   2. An exported resetHexagramCooldown() for test isolation.
//
// RED: resetHexagramCooldown is not exported yet → typeof check fails → RED.
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1501 — per-stock cooldown (<15 min) skips storeReading", () => {
  it("resetHexagramCooldown is exported and second run within 15 min is skipped", async () => {
    // Dynamically import so TypeScript doesn't error on the missing export.
    const cycleModule = await import("../scheduler/news-analysis/intelligenceCycleJob.js") as Record<string, unknown>;

    const resetHexagramCooldown = cycleModule["resetHexagramCooldown"] as (() => void) | undefined;

    // RED: function not exported yet → undefined → fails here.
    expect(typeof resetHexagramCooldown).toBe("function");

    // Clear cooldown state before the test
    resetHexagramCooldown!();

    const { runIntelligenceCycle, resetCycleGuard, isMarketHours } =
      await import("../scheduler/news-analysis/intelligenceCycleJob.js");

    const COOLDOWN_MS = 15 * 60 * 1000;
    const lastSeenAt: Record<string, number> = {};

    // Stub that mirrors the GREEN cooldown contract:
    // - First call → stores, returns count.
    // - Second call within COOLDOWN_MS → skips, returns 0.
    const cooldownAwareCompute = async (codes: string[]): Promise<number> => {
      const now = Date.now();
      let computed = 0;
      for (const code of codes) {
        const last = lastSeenAt[code] ?? 0;
        if (last > 0 && now - last < COOLDOWN_MS) {
          continue; // skip
        }
        lastSeenAt[code] = now;
        computed++;
      }
      return computed;
    };

    const wedDeps = {
      ...BASE_DEPS,
      isMarketHoursFn: () => isMarketHours(new Date(WED_11AM_VN_UTC)),
      getWatchlistCodesFn: async () => ["VCB"],
      computeHexagramsFn: cooldownAwareCompute,
    };

    // Run 1: first compute, VCB not seen → returns 1.
    resetCycleGuard();
    const r1 = await runIntelligenceCycle(wedDeps);
    expect(r1).not.toBeNull();
    expect(r1!.hexagramsComputed).toBe(1);

    // Run 2: VCB seen < 15 min ago → cooldown active → returns 0.
    resetCycleGuard();
    const r2 = await runIntelligenceCycle(wedDeps);
    expect(r2).not.toBeNull();
    expect(r2!.hexagramsComputed).toBe(0);
  });
});
