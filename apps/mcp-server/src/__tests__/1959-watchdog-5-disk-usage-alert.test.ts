/**
 * Task 1959-watchdog-5 — Disk-usage alert cron unit + integration tests.
 *
 * Tests:
 *   TC-1: Under-threshold → no BUG Telegram
 *   TC-2: Over-threshold → BUG Telegram sent
 *   TC-3: Over-threshold second tick within 6 h cooldown → suppressed
 *   TC-4: Over-threshold after 6 h cooldown window expiry → fires again
 *   TC-5 (integration): 12 consecutive ticks at 18 GB → zero Telegrams
 *   TC-6 (integration): Jump from 18 GB to 25 GB → exactly one Telegram on first over-threshold tick
 *
 * Each test passes its own `state` object for concurrent-safe test isolation.
 * Module-level singleton state is NOT used in these tests.
 */

// Test isolation
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import {
  runDiskUsageAlertJob,
  DISK_THRESHOLD_GB,
  DISK_COOLDOWN_MS,
} from "../scheduler/diskUsageAlertJob.js";
import type { DiskUsageAlertState } from "../scheduler/diskUsageAlertJob.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGetDiskUsage(gb: number) {
  return async (_path: string): Promise<number> => gb;
}

/** Returns a fresh isolated state object (no shared module variable). */
function freshState(): DiskUsageAlertState {
  return { lastAlertAt: 0 };
}

// ── TC-1: Under threshold → no Telegram ──────────────────────────────────────

describe("Task 1959-watchdog-5 — TC-1: under-threshold path", () => {
  it("returns 'ok' and does NOT send BUG Telegram when usage < threshold", async () => {
    const bugCalls: string[] = [];

    const result = await runDiskUsageAlertJob({
      getDiskUsageGb: makeGetDiskUsage(18),
      notifyBug: async (msg) => { bugCalls.push(msg); return 1; },
      now: new Date("2026-05-20T10:00:00Z"),
      state: freshState(),
    });

    expect(result).toBe("ok");
    expect(bugCalls.length).toBe(0);
  });

  it("returns 'ok' when usage exactly equals threshold", async () => {
    const bugCalls: string[] = [];

    const result = await runDiskUsageAlertJob({
      getDiskUsageGb: makeGetDiskUsage(DISK_THRESHOLD_GB),
      notifyBug: async (msg) => { bugCalls.push(msg); return 1; },
      now: new Date("2026-05-20T10:00:00Z"),
      state: freshState(),
    });

    expect(result).toBe("ok");
    expect(bugCalls.length).toBe(0);
  });
});

// ── TC-2: Over threshold → BUG Telegram sent ─────────────────────────────────

describe("Task 1959-watchdog-5 — TC-2: over-threshold path", () => {
  it("returns 'alert-sent' and sends BUG Telegram when usage > threshold", async () => {
    const bugCalls: string[] = [];

    const result = await runDiskUsageAlertJob({
      getDiskUsageGb: makeGetDiskUsage(25),
      notifyBug: async (msg) => { bugCalls.push(msg); return 1; },
      now: new Date("2026-05-20T10:00:00Z"),
      state: freshState(),
    });

    expect(result).toBe("alert-sent");
    expect(bugCalls.length).toBe(1);
    expect(bugCalls[0]).toContain("25");
    expect(bugCalls[0]).toContain("/app/data/lancedb");
  });

  it("BUG message contains threshold and current size", async () => {
    const bugCalls: string[] = [];

    await runDiskUsageAlertJob({
      getDiskUsageGb: makeGetDiskUsage(29.3),
      notifyBug: async (msg) => { bugCalls.push(msg); return 1; },
      now: new Date("2026-05-20T10:00:00Z"),
      state: freshState(),
    });

    expect(bugCalls[0]).toContain(String(DISK_THRESHOLD_GB));
  });
});

// ── TC-3: Second tick within 6 h cooldown → suppressed ───────────────────────

describe("Task 1959-watchdog-5 — TC-3: cooldown suppression", () => {
  it("suppresses second BUG within DISK_COOLDOWN_MS", async () => {
    const bugCalls: string[] = [];
    const notify = async (msg: string) => { bugCalls.push(msg); return 1; };
    const state = freshState();
    const base = new Date("2026-05-20T10:00:00Z");
    const getDiskUsageGb = makeGetDiskUsage(25);

    const first = await runDiskUsageAlertJob({
      getDiskUsageGb, notifyBug: notify, now: base, state,
    });

    // 30 min later — still inside 6 h cooldown
    const second = await runDiskUsageAlertJob({
      getDiskUsageGb,
      notifyBug: notify,
      now: new Date(base.getTime() + 30 * 60_000),
      state,
    });

    expect(first).toBe("alert-sent");
    expect(second).toBe("cooldown");
    expect(bugCalls.length).toBe(1);
  });

  it("DISK_COOLDOWN_MS is exactly 6 hours", () => {
    expect(DISK_COOLDOWN_MS).toBe(6 * 60 * 60 * 1000);
  });
});

// ── TC-4: After 6 h window expiry → fires again ───────────────────────────────

describe("Task 1959-watchdog-5 — TC-4: cooldown expiry re-fires", () => {
  it("fires BUG again after DISK_COOLDOWN_MS has elapsed", async () => {
    const bugCalls: string[] = [];
    const notify = async (msg: string) => { bugCalls.push(msg); return 1; };
    const state = freshState();
    const base = new Date("2026-05-20T10:00:00Z");
    const getDiskUsageGb = makeGetDiskUsage(25);

    await runDiskUsageAlertJob({ getDiskUsageGb, notifyBug: notify, now: base, state });

    // Exactly 6 h + 1 ms later — outside cooldown
    const third = await runDiskUsageAlertJob({
      getDiskUsageGb,
      notifyBug: notify,
      now: new Date(base.getTime() + DISK_COOLDOWN_MS + 1),
      state,
    });

    expect(third).toBe("alert-sent");
    expect(bugCalls.length).toBe(2);
  });
});

// ── TC-5 (integration): 12 consecutive under-threshold ticks → zero Telegrams ─

describe("Task 1959-watchdog-5 — TC-5 (integration): 12 ticks at 18 GB → zero Telegrams", () => {
  it("sends zero BUG Telegrams over 12 consecutive healthy ticks", async () => {
    const bugCalls: string[] = [];
    const notify = async (msg: string) => { bugCalls.push(msg); return 1; };
    const state = freshState();
    const base = new Date("2026-05-20T00:00:00Z");

    for (let i = 0; i < 12; i++) {
      await runDiskUsageAlertJob({
        getDiskUsageGb: makeGetDiskUsage(18),
        notifyBug: notify,
        now: new Date(base.getTime() + i * 60 * 60_000), // hourly ticks
        state,
      });
    }

    expect(bugCalls.length).toBe(0);
  });
});

// ── TC-6 (integration): Jump to 25 GB → exactly one Telegram on first tick ───

describe("Task 1959-watchdog-5 — TC-6 (integration): jump to 25 GB → one Telegram", () => {
  it("sends exactly one BUG after healthy runs followed by over-threshold jump", async () => {
    const bugCalls: string[] = [];
    const notify = async (msg: string) => { bugCalls.push(msg); return 1; };
    const state = freshState();
    const base = new Date("2026-05-20T00:00:00Z");

    // 5 healthy ticks at 18 GB
    for (let i = 0; i < 5; i++) {
      const r = await runDiskUsageAlertJob({
        getDiskUsageGb: makeGetDiskUsage(18),
        notifyBug: notify,
        now: new Date(base.getTime() + i * 60 * 60_000),
        state,
      });
      expect(r).toBe("ok");
    }

    // Tick 6: jump to 25 GB → alert fires
    const tick6 = await runDiskUsageAlertJob({
      getDiskUsageGb: makeGetDiskUsage(25),
      notifyBug: notify,
      now: new Date(base.getTime() + 5 * 60 * 60_000),
      state,
    });
    expect(tick6).toBe("alert-sent");

    // Ticks 7-11: still 25 GB and within 6 h cooldown window → suppressed.
    // Tick at i=11 is base+11h; alert fired at base+5h → elapsed=6h which
    // equals DISK_COOLDOWN_MS exactly. elapsed < DISK_COOLDOWN_MS is false at
    // that boundary so we stop at i<11 (5 more ticks, all < 6h from fire time).
    for (let i = 6; i < 11; i++) {
      const r = await runDiskUsageAlertJob({
        getDiskUsageGb: makeGetDiskUsage(25),
        notifyBug: notify,
        now: new Date(base.getTime() + i * 60 * 60_000),
        state,
      });
      expect(r).toBe("cooldown");
    }

    expect(bugCalls.length).toBe(1);
    expect(bugCalls[0]).toContain("25");
  });
});
