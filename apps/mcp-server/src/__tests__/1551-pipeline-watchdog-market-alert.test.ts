// Test isolation
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  runPipelineWatchdog,
  _resetWatchdogCooldown,
  STALE_THRESHOLD_MINS,
  COOLDOWN_MS,
} from "../scheduler/pipelineWatchdogJob.js";

const STALE_MINS = STALE_THRESHOLD_MINS + 10; // clearly over threshold

const makeHealth = (staleMins: number) => ({
  ragRows: { staleMins, today: 0, lastInsertedAt: "2026-04-20T00:00:00Z" },
  vpsPushLast24h: 0,
});

describe("TASK-1551 pipelineWatchdog MARKET alert", () => {
  beforeEach(() => {
    _resetWatchdogCooldown();
  });

  // 1. When stale and out of cooldown: MARKET fires after WORK
  it("fires MARKET alert when news pipeline is stale (out of cooldown)", async () => {
    const workCalls: string[] = [];
    const marketCalls: string[] = [];
    const now = new Date("2026-04-20T03:00:00Z");

    const result = await runPipelineWatchdog({
      now,
      notify: async (m) => { workCalls.push(m); return true; },
      notifyUser: async (m) => { marketCalls.push(m); return true; },
      getPipelineHealthFn: async () => makeHealth(STALE_MINS) as any,
    });

    expect(result).toBe("alert-sent");
    expect(workCalls.length).toBe(1);
    expect(marketCalls.length).toBe(1);
    expect(marketCalls[0]).toContain("News analysis pipeline stale");
    expect(marketCalls[0]).toContain(String(STALE_MINS));
    // No operator commands in user-facing message
    expect(marketCalls[0]).not.toContain("systemctl");
    expect(marketCalls[0]).not.toContain("journalctl");
  });

  // 2. Within cooldown: MARKET is NOT fired (cooldown applies to both channels)
  it("skips MARKET alert during cooldown window", async () => {
    const workCalls: string[] = [];
    const marketCalls: string[] = [];
    const now = new Date("2026-04-20T03:00:00Z");
    const notify = async (m: string) => { workCalls.push(m); return true; };
    const notifyUser = async (m: string) => { marketCalls.push(m); return true; };
    const getPipelineHealthFn = async () => makeHealth(STALE_MINS) as any;

    const first = await runPipelineWatchdog({ now, notify, notifyUser, getPipelineHealthFn });
    const second = await runPipelineWatchdog({
      now: new Date(now.getTime() + 30 * 60_000), // 30 min later — inside 3h cooldown
      notify,
      notifyUser,
      getPipelineHealthFn,
    });

    expect(first).toBe("alert-sent");
    expect(second).toBe("cooldown");
    expect(workCalls.length).toBe(1);
    expect(marketCalls.length).toBe(1); // only once
  });

  // 3. WORK fires independently even if MARKET notifyUser throws
  it("returns alert-sent even when MARKET notifyUser throws", async () => {
    const workCalls: string[] = [];
    const now = new Date("2026-04-20T03:00:00Z");

    const result = await runPipelineWatchdog({
      now,
      notify: async (m) => { workCalls.push(m); return true; },
      notifyUser: async () => { throw new Error("Telegram MARKET down"); },
      getPipelineHealthFn: async () => makeHealth(STALE_MINS) as any,
    });

    expect(result).toBe("alert-sent");
    expect(workCalls.length).toBe(1);
  });
});
